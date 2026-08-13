-- ============================================================================
-- Row Level Security — written WITH the tables, not bolted on afterwards.
--
-- The rule for Phase 1 is simple: a user can only ever touch their own rows.
-- Enforced by the database, so it holds even if application code forgets.
--
-- Patterns used (deliberately):
--   · `(select auth.uid())` — wrapped in a select so it is evaluated once per
--     query rather than once per row. Materially faster on big tables.
--   · `to authenticated` on every policy — `auth.role()` is deprecated, and
--     `to authenticated` alone is authentication, not authorization, so every
--     policy also carries an ownership predicate.
--   · UPDATE policies carry BOTH `using` and `with check`, otherwise a user
--     could reassign a row's user_id to somebody else.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.user_consents       enable row level security;
alter table public.devices             enable row level security;
alter table public.assessments         enable row level security;
alter table public.assessment_scores   enable row level security;
alter table public.plus_sessions       enable row level security;
alter table public.plus_answers        enable row level security;
alter table public.call_requests       enable row level security;
alter table public.notifications       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.questionnaires      enable row level security;
alter table public.questionnaire_items enable row level security;

-- --------------------------------------------------------------- profiles --
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------- user_settings --
create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------- user_consents --
-- Append-only by design: insert and read, never update or delete. The audit
-- trail is the point. Withdrawing a consent means inserting granted = false.
create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_consents_insert_own on public.user_consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------- devices --
create policy devices_select_own on public.devices
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy devices_insert_own on public.devices
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy devices_update_own on public.devices
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy devices_delete_own on public.devices
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------- assessments --
-- No UPDATE policy on purpose: assessments are append-only. Correcting a
-- check-in means deleting it and taking another.
create policy assessments_select_own on public.assessments
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy assessments_insert_own on public.assessments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy assessments_delete_own on public.assessments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------- assessment_scores --
-- Readable by the owner; only the service role writes them (the scoring
-- function). No insert/update policy for `authenticated` — a client must not
-- be able to invent its own score.
create policy assessment_scores_select_own on public.assessment_scores
  for select to authenticated
  using (exists (
    select 1 from public.assessments a
    where a.id = assessment_scores.assessment_id
      and a.user_id = (select auth.uid())
  ));

-- ----------------------------------------------------------- plus_sessions --
create policy plus_sessions_select_own on public.plus_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy plus_sessions_insert_own on public.plus_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy plus_sessions_update_own on public.plus_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy plus_sessions_delete_own on public.plus_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------ plus_answers --
create policy plus_answers_select_own on public.plus_answers
  for select to authenticated
  using (exists (
    select 1 from public.plus_sessions ps
    where ps.id = plus_answers.session_id
      and ps.user_id = (select auth.uid())
  ));

create policy plus_answers_insert_own on public.plus_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.plus_sessions ps
    where ps.id = plus_answers.session_id
      and ps.user_id = (select auth.uid())
  ));

-- ----------------------------------------------------------- call_requests --
create policy call_requests_select_own on public.call_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy call_requests_insert_own on public.call_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy call_requests_update_own on public.call_requests
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------- notifications --
-- Read and mark-as-opened only. The server creates them.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notifications_update_own on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------- subscriptions --
-- Read-only for the client. Billing state is never client-writable.
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- --------------------------------------------- questionnaires (reference) --
-- Not user data: the instruments themselves. Any signed-in user may read them;
-- nobody may write them from the client.
create policy questionnaires_read on public.questionnaires
  for select to authenticated
  using (true);

create policy questionnaire_items_read on public.questionnaire_items
  for select to authenticated
  using (true);

-- ============================================================================
-- Foreign-key indexes required by RLS predicates above already exist in the
-- schema migration (assessments.user_id, plus_sessions.user_id, etc.).
-- Without them every policy check would sequential-scan.
-- ============================================================================
