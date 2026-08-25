-- ============================================================================
-- Advisor follow-up.
--
-- coach_clients and sessions each had two permissive SELECT policies for the
-- same role. Postgres evaluates every permissive policy on every row until one
-- passes, so two policies is twice the work on the hottest read in the coach
-- dashboard. One policy with an OR does the same job in one pass.
-- ============================================================================

drop policy if exists "a coach sees their own assignments" on public.coach_clients;
drop policy if exists "a client sees who their coach is"   on public.coach_clients;

create policy "read own assignments" on public.coach_clients
  for select to authenticated
  using (
    coach_id = (select auth.uid())          -- the coach
    or user_id = (select auth.uid())        -- the client
    or (select public.is_admin_coach())     -- the admin seat
  );

drop policy if exists "a coach sees their own sessions"  on public.sessions;
drop policy if exists "a client sees their own sessions" on public.sessions;

create policy "read own sessions" on public.sessions
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    or user_id = (select auth.uid())
    or (select public.is_admin_coach())
  );

-- ---------------------------------------------------------------------------
-- The advisor also flags is_coach() and is_admin_coach() as SECURITY DEFINER
-- functions callable by signed-in users. That is required, not an oversight:
-- an RLS policy expression runs as the querying role, so the role must hold
-- EXECUTE or every policy using them fails.
--
-- Safe because they take no arguments, derive the user from the JWT, and return
-- a boolean about the caller themselves — information that person already has.
-- ---------------------------------------------------------------------------
comment on function public.is_coach() is
  'True if the caller is an active coach. SECURITY DEFINER so it can read the '
  'coaches table without granting everyone read access to it. EXECUTE is granted '
  'to authenticated because RLS policies call it as the querying role. Takes no '
  'arguments and answers only about the caller. Advisor warning accepted.';

comment on function public.is_admin_coach() is
  'True if the caller holds the admin seat. Same reasoning as is_coach(). '
  'Advisor warning accepted.';
