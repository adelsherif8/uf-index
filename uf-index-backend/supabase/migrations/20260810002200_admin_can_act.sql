-- ============================================================================
-- Three decisions, made concrete.
--
-- 1. Coach notes: the client never sees them, the coach and the admin do.
-- 2. The admin CAN confirm a call — if a coach is away for a week, someone has
--    to act — but it is recorded as having been the admin, not the coach.
-- 3. Coaches see each other's names and nothing more. Unchanged.
-- ============================================================================

-- Who actually answered, so "Parina confirmed" and "the admin confirmed while
-- Parina was away" are not the same row.
alter table public.sessions
  add column if not exists acted_by      uuid references public.coaches (id),
  add column if not exists acted_by_role text check (acted_by_role in ('coach', 'client', 'admin')),
  add column if not exists acted_at      timestamptz;

comment on column public.sessions.acted_by_role is
  'Who moved this out of pending. admin means someone acted on a coach''s behalf, '
  'which is legitimate cover but should be visible as such.';

create or replace function public.respond_to_session(p_id uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := (select auth.uid());
  s       public.sessions%rowtype;
  admin   boolean := (select public.is_admin_coach());
  who     text;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select * into s from public.sessions where id = p_id;
  if not found then raise exception 'No such session'; end if;

  if s.status not in ('requested', 'proposed') then
    raise exception 'That session is already %', s.status;
  end if;

  -- The rule is still that you cannot confirm your own ask. The admin is the
  -- one exception, and only as cover for a coach who is not around.
  if s.status = 'requested' then
    if s.coach_id = uid then who := 'coach';
    elsif admin then who := 'admin';
    else raise exception 'Only the coach can answer a client request'; end if;
  else
    if s.user_id = uid then who := 'client';
    elsif admin then who := 'admin';
    else raise exception 'Only the client can answer a coach proposal'; end if;
  end if;

  if not p_accept then
    update public.sessions
       set status = 'declined', acted_by = case when who <> 'client' then uid end,
           acted_by_role = who, acted_at = now()
     where id = p_id;
    return 'declined';
  end if;

  begin
    update public.sessions
       set status = 'confirmed', acted_by = case when who <> 'client' then uid end,
           acted_by_role = who, acted_at = now()
     where id = p_id;
  exception when unique_violation then
    raise exception 'That slot was taken while this was pending';
  end;
  return 'confirmed';
end;
$$;
revoke all on function public.respond_to_session(uuid, boolean) from public, anon;
grant execute on function public.respond_to_session(uuid, boolean) to authenticated;

-- The admin can also close a session a coach never got round to closing.
-- complete_session already allowed this; make the record say who did it.
create or replace function public.complete_session(
  p_id uuid, p_outcome text, p_notes text default null, p_agreement text default null
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := (select auth.uid());
  s     public.sessions%rowtype;
  admin boolean := (select public.is_admin_coach());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_outcome not in ('done', 'no_show', 'cancelled') then
    raise exception 'Outcome must be done, no_show or cancelled';
  end if;

  select * into s from public.sessions where id = p_id;
  if not found then raise exception 'No such session'; end if;
  if s.coach_id <> uid and not admin then
    raise exception 'Only the coach who owns this session, or an admin, can close it';
  end if;

  update public.sessions
     set status = p_outcome, outcome = p_outcome,
         notes = coalesce(p_notes, notes), agreement = coalesce(p_agreement, agreement),
         acted_by = uid, acted_by_role = case when s.coach_id = uid then 'coach' else 'admin' end,
         acted_at = now()
   where id = p_id;
  return p_outcome;
end;
$$;
revoke all on function public.complete_session(uuid, text, text, text) from public, anon;
grant execute on function public.complete_session(uuid, text, text, text) to authenticated;

-- ---- notes: coach and admin yes, client never --------------------------------
-- sessions RLS already lets a client read their own row, which carries notes.
-- The client-facing view exists precisely so they do not; make that the only
-- way a client reaches a session by dropping their direct read.
drop policy if exists "read own sessions" on public.sessions;
create policy "staff read sessions" on public.sessions
  for select to authenticated
  using ( coach_id = (select auth.uid()) or (select public.is_admin_coach()) );

-- and give the client back exactly what they should have
create or replace view public.client_sessions
with (security_invoker = false) as
select s.id, s.user_id, s.starts_at, s.ends_at, s.status, s.location,
       c.full_name as coach_name
from public.sessions s
join public.coaches c on c.id = s.coach_id;

revoke all on public.client_sessions from public, anon;
grant select on public.client_sessions to authenticated;

create or replace view public.my_sessions
with (security_invoker = false) as
select * from public.client_sessions where user_id = (select auth.uid());

revoke all on public.my_sessions from public, anon;
grant select on public.my_sessions to authenticated;

comment on view public.my_sessions is
  'What a client may see about their own appointments: when, status, and which '
  'coach. Never notes, outcome or agreement — those are the coach''s working '
  'record, readable by the coach and the admin only.';
