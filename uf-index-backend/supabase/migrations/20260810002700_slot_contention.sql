-- ============================================================================
-- Two clients want the same time.
--
-- Ahmed asks James for 10am. Mohamed asks James for 10am. James confirms
-- Mohamed. Ahmed's request can no longer be confirmed — and the coach needs a
-- way out of that other than declining and starting again.
--
-- Also: a request that arrives by phone. A client rings the office and asks for
-- Thursday; the coach should be able to record that rather than telling them to
-- open the app.
-- ============================================================================

-- ---- record a request on a client's behalf ---------------------------------
create or replace function public.request_call_for(
  p_user_id   uuid,
  p_starts_at timestamptz,
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

  select coach_id into cid from public.coach_clients
   where user_id = p_user_id and status = 'active';
  if cid is null then raise exception 'That client has no coach'; end if;

  if cid <> uid and not (select public.is_admin_coach()) then
    raise exception 'Not your client';
  end if;
  if p_starts_at <= now() then raise exception 'That time has passed'; end if;

  insert into public.sessions (coach_id, user_id, starts_at, ends_at, status)
  values (cid, p_user_id, p_starts_at, p_starts_at + make_interval(mins => p_mins), 'requested')
  returning id into sid;
  return sid;
end;
$$;
revoke all on function public.request_call_for(uuid, timestamptz, integer) from public, anon;
grant execute on function public.request_call_for(uuid, timestamptz, integer) to authenticated;

-- ---- is this pending request still winnable? -------------------------------
-- A request whose slot has since been taken cannot be confirmed. Saying so up
-- front is kinder than letting the coach press Confirm and get an error.
create or replace function public.pending_calls()
returns table (
  id uuid, user_id uuid, coach_id uuid, client_name text, coach_name text,
  starts_at timestamptz, ends_at timestamptz, status text, blocked boolean
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.coach_id,
         p.full_name, co.full_name, s.starts_at, s.ends_at, s.status,
         exists (
           select 1 from public.sessions t
           where t.coach_id = s.coach_id
             and t.id <> s.id
             and t.status in ('proposed', 'confirmed')
             and tstzrange(t.starts_at, t.ends_at, '[)')
                 && tstzrange(s.starts_at, s.ends_at, '[)')
         ) as blocked
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  join public.coaches co on co.id = s.coach_id
  where s.status in ('requested', 'proposed')
    and s.starts_at > now()
    and (s.coach_id = (select auth.uid()) or (select public.is_admin_coach()))
  order by s.starts_at;
$$;
revoke all on function public.pending_calls() from public, anon;
grant execute on function public.pending_calls() to authenticated;

comment on function public.pending_calls() is
  'Pending calls for the caller, each flagged when its slot has since been taken '
  'by another booking — so the dashboard can offer an alternative instead of a '
  'Confirm button that is going to fail.';

-- ---- decline this one and offer another time in one step -------------------
create or replace function public.offer_alternative(
  p_id        uuid,
  p_starts_at timestamptz,
  p_mins      integer default 45
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  s   public.sessions%rowtype;
  sid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select * into s from public.sessions where id = p_id;
  if not found then raise exception 'No such session'; end if;
  if s.coach_id <> uid and not (select public.is_admin_coach()) then
    raise exception 'Not your session';
  end if;
  if s.status not in ('requested', 'proposed') then
    raise exception 'That session is already %', s.status;
  end if;
  if p_starts_at <= now() then raise exception 'That time has passed'; end if;

  -- The original is declined rather than edited, so the client's ask stays on
  -- the record and it is clear they were offered something else.
  update public.sessions
     set status = 'declined', acted_by = uid,
         acted_by_role = case when s.coach_id = uid then 'coach' else 'admin' end,
         acted_at = now()
   where id = p_id;

  begin
    insert into public.sessions (coach_id, user_id, starts_at, ends_at, status)
    values (s.coach_id, s.user_id, p_starts_at,
            p_starts_at + make_interval(mins => p_mins), 'proposed')
    returning id into sid;
  exception when unique_violation then
    raise exception 'You already have something at that time';
  end;

  return sid;
end;
$$;
revoke all on function public.offer_alternative(uuid, timestamptz, integer) from public, anon;
grant execute on function public.offer_alternative(uuid, timestamptz, integer) to authenticated;
