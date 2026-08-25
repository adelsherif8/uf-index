-- ============================================================================
-- Letting a coach see their own clients — and only with consent.
--
-- Phase 1 RLS said "you read your own rows", which is right for a client app
-- and useless for a coach: Parina could see that Priya was assigned to her but
-- not Priya's name, score or history.
--
-- The gate is the consent the client actually gave. The privacy policy says
-- results are shared with a coach "only if you granted the coach-visibility
-- consent", so that promise is enforced by Postgres here rather than by the
-- dashboard choosing to be polite. Withdraw the consent and the coach stops
-- seeing them on the next query.
-- ============================================================================

-- Consents are append-only, so "granted" means the most recent row wins.
create or replace function public.has_coach_consent(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted
    from public.user_consents c
    where c.user_id = p_user and c.consent_type = 'coach_visibility'
    order by c.recorded_at desc
    limit 1
  ), false);
$$;

revoke all on function public.has_coach_consent(uuid) from public, anon;
grant execute on function public.has_coach_consent(uuid) to authenticated;

-- True when the caller coaches this person and this person allowed it.
create or replace function public.coaches_this_client(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coach_clients cc
    where cc.user_id = p_user
      and cc.status = 'active'
      and (cc.coach_id = (select auth.uid()) or (select public.is_admin_coach()))
  ) and public.has_coach_consent(p_user);
$$;

revoke all on function public.coaches_this_client(uuid) from public, anon;
grant execute on function public.coaches_this_client(uuid) to authenticated;

comment on function public.coaches_this_client(uuid) is
  'True when the caller is this client''s active coach (or the admin) AND the '
  'client granted coach_visibility. Both halves required — an assignment alone '
  'is not permission.';

-- ---------------------------------------------------------------- reads -----
create policy "a coach reads their clients' profiles" on public.profiles
  for select to authenticated
  using ( (select public.coaches_this_client(id)) );

create policy "a coach reads their clients' check-ins" on public.assessments
  for select to authenticated
  using ( (select public.coaches_this_client(user_id)) );

create policy "a coach reads their clients' scores" on public.assessment_scores
  for select to authenticated
  using ( exists (
    select 1 from public.assessments a
    where a.id = assessment_scores.assessment_id
      and (select public.coaches_this_client(a.user_id))
  ) );

create policy "a coach reads their clients' plus results" on public.plus_sessions
  for select to authenticated
  using ( (select public.coaches_this_client(user_id)) );

-- Deliberately NOT extended to user_consents, devices, subscriptions or
-- notifications. A coach needs a client's wellbeing data to coach them; they do
-- not need their push tokens, their billing, or the audit trail of what they
-- agreed to.
