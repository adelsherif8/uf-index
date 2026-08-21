-- ============================================================================
-- RLS for the coaching tables.
--
-- The rule that shapes all of it: a coach sees their own clients and nobody
-- else's. Ravish (is_admin) sees every coach. A client sees their own sessions
-- but never a coach's notes about them.
-- ============================================================================
alter table public.coaches         enable row level security;
alter table public.coach_clients   enable row level security;
alter table public.sessions        enable row level security;
alter table public.workspace_calendar enable row level security;

-- Helpers. SECURITY DEFINER so a coach can be identified without granting
-- everyone read access to the coaches table; both derive the caller from the
-- JWT and take no arguments, so neither can be pointed at someone else.
create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coaches c
    where c.id = (select auth.uid()) and c.active
  );
$$;

create or replace function public.is_admin_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coaches c
    where c.id = (select auth.uid()) and c.active and c.is_admin
  );
$$;

revoke all on function public.is_coach() from public, anon;
revoke all on function public.is_admin_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.is_admin_coach() to authenticated;

-- ------------------------------------------------------------------ coaches --
-- Coaches can see each other (a directory is useful for transfers); nobody else can.
create policy "coaches read the roster" on public.coaches
  for select to authenticated using ( (select public.is_coach()) );

create policy "a coach edits their own profile" on public.coaches
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ------------------------------------------------------------ coach_clients --
create policy "a coach sees their own assignments" on public.coach_clients
  for select to authenticated
  using ( coach_id = (select auth.uid()) or (select public.is_admin_coach()) );

create policy "a client sees who their coach is" on public.coach_clients
  for select to authenticated using ( user_id = (select auth.uid()) );

-- Only Ravish reassigns. Automatic assignment runs as the service role.
create policy "admin assigns" on public.coach_clients
  for insert to authenticated with check ( (select public.is_admin_coach()) );

create policy "admin reassigns" on public.coach_clients
  for update to authenticated
  using ( (select public.is_admin_coach()) )
  with check ( (select public.is_admin_coach()) );

-- ----------------------------------------------------------------- sessions --
create policy "a coach sees their own sessions" on public.sessions
  for select to authenticated
  using ( coach_id = (select auth.uid()) or (select public.is_admin_coach()) );

-- A client sees the appointment, but not the coach's notes — those are stripped
-- by the client_sessions view below rather than by trusting the app to hide them.
create policy "a client sees their own sessions" on public.sessions
  for select to authenticated using ( user_id = (select auth.uid()) );

create policy "a coach schedules for their own clients" on public.sessions
  for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.coach_clients cc
      where cc.coach_id = (select auth.uid())
        and cc.user_id = sessions.user_id
        and cc.status = 'active'
    )
  );

create policy "a coach updates their own sessions" on public.sessions
  for update to authenticated
  using ( coach_id = (select auth.uid()) )
  with check ( coach_id = (select auth.uid()) );

-- ------------------------------------------------------ workspace_calendar --
-- Deliberately no policy for `authenticated`, not even for the admin. The
-- service-account credential is readable only by the service role inside an
-- Edge Function. Connecting and disconnecting happens through a function, never
-- by touching the row — so a compromised coach session cannot exfiltrate the
-- credential that reaches every calendar in the organisation.

-- ----------------------------------------------------------------- a view ---
-- What a client is allowed to see about their own appointments.
create view public.client_sessions
with (security_invoker = true) as
select s.id, s.user_id, s.starts_at, s.ends_at, s.status, s.location,
       c.full_name as coach_name
from public.sessions s
join public.coaches c on c.id = s.coach_id;

comment on view public.client_sessions is
  'Client-facing appointments. Omits notes, outcome and agreement, which are the '
  'coach''s working record and not for the client to read.';
