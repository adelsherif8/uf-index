-- ============================================================================
-- Two things the advisors caught.
--
-- 1. Postgres grants EXECUTE to PUBLIC on every new function, and `anon`
--    inherits from PUBLIC. Granting to `authenticated` does not undo that, so
--    four SECURITY DEFINER functions were reachable with nothing but the
--    publishable key. coach_free_slots was the sharp one: it takes a coach id
--    and never checks for a session, so it would hand a stranger a coach's
--    working hours and their booked-slot pattern.
--
-- 2. Adding coach visibility left two permissive SELECT policies on five
--    tables. Postgres runs every permissive policy on every row, so that is
--    twice the work on the reads the coach dashboard makes most.
-- ============================================================================

-- ---- 1 · revoke, then re-grant only where it belongs ----------------------
revoke all on function public.coach_free_slots(uuid, timestamptz, integer, integer) from public, anon;
revoke all on function public.request_call(timestamptz, integer)                    from public, anon;
revoke all on function public.respond_to_session(uuid, boolean)                     from public, anon;
revoke all on function public.complete_session(uuid, text, text, text)              from public, anon;

grant execute on function public.coach_free_slots(uuid, timestamptz, integer, integer) to authenticated;
grant execute on function public.request_call(timestamptz, integer)                    to authenticated;
grant execute on function public.respond_to_session(uuid, boolean)                     to authenticated;
grant execute on function public.complete_session(uuid, text, text, text)              to authenticated;

-- coach_free_slots is SECURITY DEFINER and reads sessions, so it needs to say
-- who is allowed to ask. Your own coach, yourself, or the admin.
create or replace function public.coach_free_slots(
  p_coach_id uuid,
  p_from     timestamptz default now(),
  p_days     integer default 14,
  p_mins     integer default 45
)
returns table (slot timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;

  if not (
    p_coach_id = (select auth.uid())
    or (select public.is_admin_coach())
    or exists (
      select 1 from public.coach_clients cc
      where cc.user_id = (select auth.uid())
        and cc.coach_id = p_coach_id
        and cc.status = 'active'
    )
  ) then
    raise exception 'That is not your coach';
  end if;

  return query
  with days as (
    select generate_series(date_trunc('day', p_from),
                           date_trunc('day', p_from) + make_interval(days => p_days),
                           interval '1 day') as d
  ),
  windows as (
    select d.d + a.starts as win_start, d.d + a.ends as win_end
    from days d
    join public.coach_availability a
      on a.coach_id = p_coach_id and a.dow = extract(dow from d.d)
  ),
  candidates as (
    select generate_series(w.win_start, w.win_end - make_interval(mins => p_mins),
                           make_interval(mins => 30)) as s
    from windows w
  )
  select c.s
  from candidates c
  where c.s > p_from
    and not exists (
      select 1 from public.sessions se
      where se.coach_id = p_coach_id
        and se.status in ('proposed', 'confirmed')
        and tstzrange(se.starts_at, se.ends_at, '[)')
            && tstzrange(c.s, c.s + make_interval(mins => p_mins), '[)')
    )
  order by c.s;
end;
$$;

revoke all on function public.coach_free_slots(uuid, timestamptz, integer, integer) from public, anon;
grant execute on function public.coach_free_slots(uuid, timestamptz, integer, integer) to authenticated;

-- ---- 2 · one SELECT policy per table --------------------------------------
drop policy if exists "a user reads their own profile"          on public.profiles;
drop policy if exists "a coach reads their clients' profiles"   on public.profiles;
create policy "read visible profiles" on public.profiles
  for select to authenticated
  using ( id = (select auth.uid()) or (select public.coaches_this_client(id)) );

drop policy if exists "a user reads their own assessments"       on public.assessments;
drop policy if exists "a coach reads their clients' check-ins"   on public.assessments;
create policy "read visible assessments" on public.assessments
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.coaches_this_client(user_id)) );

drop policy if exists "a user reads their own scores"          on public.assessment_scores;
drop policy if exists "a coach reads their clients' scores"    on public.assessment_scores;
create policy "read visible scores" on public.assessment_scores
  for select to authenticated
  using ( exists (
    select 1 from public.assessments a
    where a.id = assessment_scores.assessment_id
      and (a.user_id = (select auth.uid()) or (select public.coaches_this_client(a.user_id)))
  ) );

drop policy if exists "a user reads their own plus sessions"      on public.plus_sessions;
drop policy if exists "a coach reads their clients' plus results" on public.plus_sessions;
create policy "read visible plus sessions" on public.plus_sessions
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.coaches_this_client(user_id)) );

drop policy if exists "read availability"            on public.coach_availability;
drop policy if exists "a coach sets their own hours"  on public.coach_availability;
create policy "read visible availability" on public.coach_availability
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    or (select public.is_admin_coach())
    or exists (
      select 1 from public.coach_clients cc
      where cc.user_id = (select auth.uid())
        and cc.coach_id = coach_availability.coach_id
        and cc.status = 'active'
    )
  );
create policy "a coach writes their own hours" on public.coach_availability
  for insert to authenticated with check ( coach_id = (select auth.uid()) );
create policy "a coach edits their own hours" on public.coach_availability
  for update to authenticated
  using ( coach_id = (select auth.uid()) ) with check ( coach_id = (select auth.uid()) );
create policy "a coach clears their own hours" on public.coach_availability
  for delete to authenticated using ( coach_id = (select auth.uid()) );
