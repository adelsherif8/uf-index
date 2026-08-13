-- ============================================================================
-- UF Index — Phase 1 schema
--
-- Design rules (do not break these):
--   1. Raw inputs and formula_version are stored on every assessment, so every
--      score stays recomputable when the official formula replaces proto-1.
--   2. Assessments are append-only. History IS this table.
--   3. Consent is versioned and timestamped (India's DPDP Act).
--   4. "Delete my data" is a real delete — everything cascades from auth.users.
--   5. client_id makes uploads idempotent: a retried sync updates, never duplicates.
--
-- Changes from the original draft (uf_index_schema.sql), which drifted from the app:
--   · users → profiles keyed to auth.users (Supabase Auth owns credentials)
--   · dropped assessments.exercise_min   — the exercise question was removed
--   · dropped assessment_scores.pillar_movement — scoring is four pillars now
--   · added assessments.note             — the app collects a per-check-in note
--   · added assessments.client_id        — idempotent sync
--   · lang / unit_system live on profiles; console_mode + trial on user_settings
--   · scales confirmed 1..5 for core inputs
-- ============================================================================

-- ---------------------------------------------------------------- profiles --
-- One row per authenticated user. Supabase Auth owns email/password.
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  phone           text,
  gender          text check (gender in ('male', 'female')),   -- drives the body-fat formula
  date_of_birth   date,                                        -- store DOB; derive age per assessment
  organization    text,                                        -- free text in Phase 1; FK in Phase 2
  locale          text not null default 'en' check (locale in ('en', 'hi')),
  unit_system     text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'App-level user profile. Auth credentials live in auth.users.';

-- ---------------------------------------------------------- user_settings --
create table public.user_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  reminder_enabled       boolean not null default true,
  reminder_dow           smallint not null default 0 check (reminder_dow between 0 and 6),  -- 0 = Sunday
  reminder_time          time not null default '18:00',
  timezone               text not null default 'Asia/Kolkata',
  console_mode           boolean not null default false,
  plus_trial_started_at  timestamptz,
  streak_weeks           integer not null default 0,   -- cached; derivable from assessments
  last_checkin_at        timestamptz
);

-- ----------------------------------------------------------- user_consents --
-- Append-only consent log. DPDP requires proving what was agreed, and when.
create table public.user_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  consent_type    text not null check (consent_type in
                    ('health_data_processing', 'coach_visibility', 'marketing')),
  granted         boolean not null,
  policy_version  text not null,                       -- e.g. 'privacy-v1.0'
  recorded_at     timestamptz not null default now()
);

create index user_consents_user_recorded_idx
  on public.user_consents (user_id, recorded_at desc);

-- ------------------------------------------------------------------ devices --
create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android')),
  push_token    text not null,
  app_version   text,
  last_seen_at  timestamptz not null default now(),
  unique (user_id, push_token)
);

create index devices_user_id_idx on public.devices (user_id);

-- -------------------------------------------------------------- assessments --
-- One row per completed check-in. Raw answers only — never a score.
create table public.assessments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  client_id      text not null,                        -- generated on device; makes sync idempotent
  taken_at       timestamptz not null default now(),
  age_at_time    integer check (age_at_time between 12 and 120),

  -- body inputs, always stored metric (converted at the edge)
  weight_kg      numeric(5,1) not null check (weight_kg between 25 and 300),
  height_cm      numeric(5,1) not null check (height_cm between 100 and 250),
  neck_cm        numeric(4,1) not null check (neck_cm between 20 and 60),
  waist_cm       numeric(4,1) not null check (waist_cm between 40 and 180),
  hip_cm         numeric(4,1) check (hip_cm between 50 and 200),   -- required for the female formula

  -- wellness inputs, 1..5
  rpe_morning    smallint not null check (rpe_morning between 1 and 5),
  rpe_afternoon  smallint not null check (rpe_afternoon between 1 and 5),
  body_feeling   smallint not null check (body_feeling between 1 and 5),
  sleep_quality  smallint not null check (sleep_quality between 1 and 5),
  sleep_hours    numeric(3,1) not null check (sleep_hours > 0 and sleep_hours <= 16),

  note           text,                                 -- optional "note for future you"
  created_at     timestamptz not null default now(),

  unique (user_id, client_id)                          -- the idempotency key
);

create index assessments_user_taken_idx on public.assessments (user_id, taken_at desc);

comment on column public.assessments.client_id is
  'Device-generated id. Upsert on (user_id, client_id) so a retried sync never duplicates.';

-- -------------------------------------------------------- assessment_scores --
-- Computed output, kept separate so a recompute never touches raw answers.
create table public.assessment_scores (
  assessment_id    uuid primary key references public.assessments (id) on delete cascade,
  formula_version  text not null,                      -- 'proto-1' today
  body_fat_pct     numeric(4,1),
  pillar_body      numeric(3,2) not null,
  pillar_energy    numeric(3,2) not null,
  pillar_sleep     numeric(3,2) not null,
  pillar_feeling   numeric(3,2) not null,
  uf_score         numeric(2,1) not null check (uf_score between 1 and 5),
  band             text not null check (band in
                     ('depleted', 'strained', 'balanced', 'energized', 'peak')),
  computed_at      timestamptz not null default now()
);

create index assessment_scores_formula_idx on public.assessment_scores (formula_version);

-- ------------------------------------------------------------ questionnaires --
create table public.questionnaires (
  id       uuid primary key default gen_random_uuid(),
  code     text not null check (code in ('WHO5', 'PSS10', 'PSQI')),
  version  text not null,
  unique (code, version)
);

create table public.questionnaire_items (
  id                uuid primary key default gen_random_uuid(),
  questionnaire_id  uuid not null references public.questionnaires (id) on delete cascade,
  item_no           smallint not null,                 -- PSS1..PSS10, PSQI1..19 — matches the QA workbook
  prompt            text not null,
  min_value         smallint not null,
  max_value         smallint not null,
  reverse_scored    boolean not null default false,
  unique (questionnaire_id, item_no)
);

create index questionnaire_items_qid_idx on public.questionnaire_items (questionnaire_id);

-- ------------------------------------------------------------- plus_sessions --
-- One row per questionnaire sitting. The app's combined "Plus profile" is a view.
create table public.plus_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  questionnaire_id  uuid not null references public.questionnaires (id),
  client_id         text not null,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  raw_total         numeric(5,1),                      -- e.g. WHO-5 raw 0..25
  scaled_score      numeric(5,1),                      -- e.g. WHO-5 x4 = 0..100
  interpretation    text,                              -- 'Good', 'High stress', 'Poor sleeper'
  unique (user_id, client_id)
);

create index plus_sessions_user_completed_idx
  on public.plus_sessions (user_id, completed_at desc);
create index plus_sessions_questionnaire_id_idx
  on public.plus_sessions (questionnaire_id);

create table public.plus_answers (
  session_id  uuid not null references public.plus_sessions (id) on delete cascade,
  item_id     uuid not null references public.questionnaire_items (id),
  value       smallint not null,
  primary key (session_id, item_id)
);

create index plus_answers_item_id_idx on public.plus_answers (item_id);

-- ------------------------------------------------------------ call_requests --
create table public.call_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'requested' check (status in
                    ('requested', 'proposed', 'confirmed', 'done', 'cancelled')),
  proposed_time   timestamptz,
  confirmed_time  timestamptz,
  created_at      timestamptz not null default now()
  -- coach_id arrives in Phase 2
);

create index call_requests_user_idx on public.call_requests (user_id, created_at desc);

-- ------------------------------------------------------------ notifications --
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in
                   ('weekly_reminder', 'streak_risk', 'score_ready', 'coach_message', 'call_update')),
  title          text not null,
  body           text not null,
  payload        jsonb,
  status         text not null default 'queued' check (status in
                   ('queued', 'sent', 'failed', 'opened')),
  scheduled_for  timestamptz,
  sent_at        timestamptz
);

create index notifications_due_idx on public.notifications (status, scheduled_for)
  where status = 'queued';
create index notifications_user_idx on public.notifications (user_id);

-- ------------------------------------------------------------ subscriptions --
-- Phase 1 writes trial rows only. No payment provider is wired yet.
create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  plan                text not null check (plan in ('plus_monthly', 'coaching_bundle', 'org_license')),
  status              text not null check (status in ('trial', 'active', 'past_due', 'cancelled')),
  provider            text not null default 'none' check (provider in ('none', 'razorpay')),
  provider_sub_id     text,
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now()
);

create index subscriptions_user_status_idx on public.subscriptions (user_id, status);

-- ===================================================================== views --
-- security_invoker so RLS on the underlying tables still applies (Postgres 15+).

-- Latest Plus results per user, pivoted into the shape the app expects.
create view public.plus_profiles with (security_invoker = true) as
with ranked as (
  select
    ps.user_id,
    q.code,
    ps.scaled_score,
    ps.interpretation,
    ps.completed_at,
    row_number() over (partition by ps.user_id, q.code order by ps.completed_at desc) as rn
  from public.plus_sessions ps
  join public.questionnaires q on q.id = ps.questionnaire_id
  where ps.completed_at is not null
)
select
  user_id,
  max(completed_at)                                              as taken_at,
  max(scaled_score)    filter (where code = 'WHO5')              as who5,
  max(interpretation)  filter (where code = 'WHO5')              as who5_band,
  max(scaled_score)    filter (where code = 'PSS10')             as pss,
  max(interpretation)  filter (where code = 'PSS10')             as pss_band,
  max(scaled_score)    filter (where code = 'PSQI')              as psqi,
  max(interpretation)  filter (where code = 'PSQI')              as psqi_band
from ranked
where rn = 1
group by user_id;

-- Assessments joined to their scores — what the app's history screen reads.
create view public.assessments_with_scores with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.client_id,
  a.taken_at,
  a.note,
  a.weight_kg, a.height_cm, a.neck_cm, a.waist_cm, a.hip_cm,
  a.rpe_morning, a.rpe_afternoon, a.body_feeling, a.sleep_quality, a.sleep_hours,
  s.uf_score, s.band, s.body_fat_pct, s.formula_version,
  s.pillar_body, s.pillar_energy, s.pillar_sleep, s.pillar_feeling
from public.assessments a
left join public.assessment_scores s on s.assessment_id = a.id;

-- ================================================================== triggers --
-- Create the profile + settings rows the moment a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep profiles.updated_at honest
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
