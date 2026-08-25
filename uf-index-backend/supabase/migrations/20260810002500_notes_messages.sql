-- ============================================================================
-- Notes and messages had no home.
--
-- "Private note" and "Send a message" wrote into browser storage, which the
-- live client list then overwrote — a coach would write a note, reload, and
-- find it gone. And a session logged after a call had nowhere to go unless a
-- session row already existed.
-- ============================================================================

-- ------------------------------------------------------------- coach notes --
-- The coach's working record. The client never sees these; the admin does,
-- because they oversee the coaching.
create table if not exists public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index coach_notes_client_idx on public.coach_notes (user_id, created_at desc);
alter table public.coach_notes enable row level security;

create policy "staff read notes" on public.coach_notes
  for select to authenticated
  using ( coach_id = (select auth.uid()) or (select public.is_admin_coach()) );

create policy "a coach writes their own notes" on public.coach_notes
  for insert to authenticated
  with check ( coach_id = (select auth.uid()) and (select public.coaches_this_client(user_id)) );

create policy "a coach deletes their own notes" on public.coach_notes
  for delete to authenticated using ( coach_id = (select auth.uid()) );

comment on table public.coach_notes is
  'A coach''s private notes about a client. Readable by that coach and the admin. '
  'Never by the client — which is the whole point of writing them down.';

-- --------------------------------------------------------------- messages --
-- Coach to client and back. Not a chat product; a thread per client so nothing
-- said before a call is lost by the next one.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sender     text not null check (sender in ('coach', 'client')),
  body       text not null check (length(btrim(body)) > 0),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;

create policy "read own messages" on public.messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or coach_id = (select auth.uid())
    or (select public.is_admin_coach())
  );

create policy "a coach messages their client" on public.messages
  for insert to authenticated
  with check (
    sender = 'coach' and coach_id = (select auth.uid())
    and (select public.coaches_this_client(user_id))
  );

create policy "a client messages their coach" on public.messages
  for insert to authenticated
  with check (
    sender = 'client' and user_id = (select auth.uid())
    and exists (
      select 1 from public.coach_clients cc
      where cc.user_id = (select auth.uid()) and cc.coach_id = messages.coach_id
        and cc.status = 'active'
    )
  );

-- ------------------------------------------------------- logging a session --
-- A coach logs a call that happened whether or not it was ever booked — plenty
-- happen off the back of a WhatsApp message.
create or replace function public.log_session(
  p_user_id   uuid,
  p_outcome   text default 'done',
  p_notes     text default null,
  p_agreement text default null,
  p_when      timestamptz default now(),
  p_mins      integer default 45
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  sid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_outcome not in ('done', 'no_show', 'cancelled') then
    raise exception 'Outcome must be done, no_show or cancelled';
  end if;

  select coach_id into cid from public.coach_clients
   where user_id = p_user_id and status = 'active';
  if cid is null then raise exception 'That client has no coach'; end if;
  if cid <> uid and not (select public.is_admin_coach()) then
    raise exception 'Not your client';
  end if;

  -- Prefer closing the booking it belongs to, so one call is one row.
  select id into sid from public.sessions
   where user_id = p_user_id and coach_id = cid and status = 'confirmed'
     and starts_at <= now()
   order by starts_at desc limit 1;

  if sid is not null then
    update public.sessions
       set status = p_outcome, outcome = p_outcome, notes = p_notes,
           agreement = p_agreement, acted_by = uid,
           acted_by_role = case when cid = uid then 'coach' else 'admin' end,
           acted_at = now()
     where id = sid;
    return sid;
  end if;

  insert into public.sessions (coach_id, user_id, starts_at, ends_at, status, outcome,
                               notes, agreement, acted_by, acted_by_role, acted_at)
  values (cid, p_user_id, p_when, p_when + make_interval(mins => p_mins), p_outcome,
          p_outcome, p_notes, p_agreement, uid,
          case when cid = uid then 'coach' else 'admin' end, now())
  returning id into sid;
  return sid;
end;
$$;

revoke all on function public.log_session(uuid, text, text, text, timestamptz, integer) from public, anon;
grant execute on function public.log_session(uuid, text, text, text, timestamptz, integer) to authenticated;
