-- PHASE 1 SCOPE (build these first): users, user_consents, devices, assessments,
-- assessment_scores, user_settings, call_requests, questionnaires, questionnaire_items,
-- plus_sessions, plus_answers, notifications, subscriptions.
-- Phase 2+: organizations, coaches, coach_clients. (insights & wearables arrive in P3.)

-- ============================================================
-- UF INDEX — DATABASE SCHEMA (PostgreSQL)
-- Draft for Sriharini · July 2026
-- Design principles:
--   1. Store RAW inputs + formula_version, never only the score,
--      so every score is recomputable when the formula changes.
--   2. Assessments are append-only (history = the table itself).
--   3. Consent is versioned & timestamped (DPDP Act).
--   4. "Delete my data" = hard delete via ON DELETE CASCADE from users.
-- ============================================================

-- ---------- B2B layer ----------
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,                -- "Maharashtra Police"
    type            TEXT CHECK (type IN ('police','school','corporate','other')),
    contact_email   TEXT,
    license_seats   INT,                          -- purchased seats, NULL = unlimited
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- identity ----------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT UNIQUE NOT NULL,
    phone           TEXT,                         -- max 10 digits, validated in app
    password_hash   TEXT,                         -- NULL if social login only
    auth_provider   TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email','apple','google')),
    full_name       TEXT NOT NULL,
    gender          TEXT CHECK (gender IN ('male','female')),   -- drives body-fat formula
    date_of_birth   DATE,                         -- store DOB, derive age at assessment time
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    locale          TEXT NOT NULL DEFAULT 'en',
    unit_system     TEXT NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','imperial')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ                   -- soft-delete marker before purge job
);

-- versioned consent log — DPDP requirement: prove what was agreed, when
CREATE TABLE user_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type    TEXT NOT NULL CHECK (consent_type IN ('health_data_processing','coach_visibility','marketing')),
    granted         BOOLEAN NOT NULL,
    policy_version  TEXT NOT NULL,                -- "privacy-v1.2"
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL CHECK (platform IN ('ios','android')),
    push_token      TEXT NOT NULL,                -- FCM / APNs
    app_version     TEXT,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, push_token)
);

-- ---------- core assessment ----------
-- One row per completed check-in. Raw inputs live here.
CREATE TABLE assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    taken_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    age_at_time     INT,                          -- snapshot, since DOB can be edited
    -- raw body inputs (always stored METRIC; convert at the edge)
    weight_kg       NUMERIC(5,1) NOT NULL,
    height_cm       NUMERIC(5,1) NOT NULL,
    neck_cm         NUMERIC(4,1) NOT NULL,
    waist_cm        NUMERIC(4,1) NOT NULL,
    hip_cm          NUMERIC(4,1),                 -- required for female formula
    -- raw wellness inputs
    rpe_morning     SMALLINT NOT NULL CHECK (rpe_morning BETWEEN 1 AND 5),
    rpe_afternoon   SMALLINT NOT NULL CHECK (rpe_afternoon BETWEEN 1 AND 5),
    body_feeling    SMALLINT NOT NULL CHECK (body_feeling BETWEEN 1 AND 5),
    sleep_quality   SMALLINT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
    sleep_hours     NUMERIC(3,1) NOT NULL,
    exercise_min    SMALLINT NOT NULL DEFAULT 0
    -- NOTE: confirm final scale ranges (0–5 vs 1–5) with the official formula.
);
CREATE INDEX idx_assessments_user_time ON assessments (user_id, taken_at DESC);

-- Computed outputs, separate so recomputation never touches raw data.
CREATE TABLE assessment_scores (
    assessment_id   UUID PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
    formula_version TEXT NOT NULL,                -- "uf-v1.0" — the key to reproducibility
    body_fat_pct    NUMERIC(4,1),
    pillar_body     NUMERIC(3,2),
    pillar_energy   NUMERIC(3,2),
    pillar_sleep    NUMERIC(3,2),
    pillar_feeling  NUMERIC(3,2),
    pillar_movement NUMERIC(3,2),
    uf_score        NUMERIC(2,1) NOT NULL,        -- 1.0–5.0
    band            TEXT NOT NULL CHECK (band IN ('depleted','strained','balanced','energized','peak')),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Index Plus (versioned questionnaires) ----------
CREATE TABLE questionnaires (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL,                -- 'WHO5' | 'PSS10' | 'PSQI'
    version         TEXT NOT NULL,                -- instrument revision
    UNIQUE (code, version)
);

CREATE TABLE questionnaire_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
    item_no         SMALLINT NOT NULL,            -- PSS1..PSS10, PSQI1..19 (matches QA workbook columns)
    prompt          TEXT NOT NULL,
    min_value       SMALLINT NOT NULL,
    max_value       SMALLINT NOT NULL,
    reverse_scored  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (questionnaire_id, item_no)
);

-- one Plus sitting = one session; item answers keep full granularity
CREATE TABLE plus_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    raw_total       NUMERIC(5,1),                 -- e.g. WHO-5 raw 0–25
    scaled_score    NUMERIC(5,1),                 -- e.g. WHO-5 ×4 = 0–100
    interpretation  TEXT                          -- 'good wellbeing', 'high stress', ...
);
CREATE INDEX idx_plus_sessions_user ON plus_sessions (user_id, completed_at DESC);

CREATE TABLE plus_answers (
    session_id      UUID NOT NULL REFERENCES plus_sessions(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES questionnaire_items(id),
    value           SMALLINT NOT NULL,
    PRIMARY KEY (session_id, item_id)
);

-- ---------- coaching ----------
CREATE TABLE coaches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,  -- coach's own login
    display_name    TEXT NOT NULL,
    bio             TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- the "subscribed to a coach" relationship (drives the coach notifications)
CREATE TABLE coach_clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
    -- score visibility requires BOTH this flag and a 'coach_visibility' consent row
    share_history   BOOLEAN NOT NULL DEFAULT FALSE,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    UNIQUE (coach_id, user_id)
);

CREATE TABLE call_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested','proposed','confirmed','done','cancelled')),
    proposed_time   TIMESTAMPTZ,                  -- coach's "Tue 5:30 PM"
    confirmed_time  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- engagement: insights, notifications, streaks ----------
CREATE TABLE insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id   UUID REFERENCES assessments(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('narrative','focus','answer')),
    content         TEXT NOT NULL,                -- AI-generated text
    model_version   TEXT,                         -- which model/prompt produced it
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user  UUID REFERENCES users(id) ON DELETE CASCADE,      -- exactly one of these two
    recipient_coach UUID REFERENCES coaches(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN
                      ('weekly_reminder','streak_risk','score_ready','coach_new_client',
                       'coach_call_request','coach_score_alert','coach_message','call_update')),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    payload         JSONB,                        -- deep-link target, assessment_id, etc.
    status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','opened')),
    scheduled_for   TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    CHECK (num_nonnulls(recipient_user, recipient_coach) = 1)
);
CREATE INDEX idx_notifications_due ON notifications (status, scheduled_for);

-- per-user reminder settings + streak cache (streak is derivable; cached for speed)
CREATE TABLE user_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_dow    SMALLINT NOT NULL DEFAULT 0 CHECK (reminder_dow BETWEEN 0 AND 6),  -- 0 = Sunday
    reminder_time   TIME NOT NULL DEFAULT '18:00',
    timezone        TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    streak_weeks    INT NOT NULL DEFAULT 0,
    last_checkin_at TIMESTAMPTZ
);

-- ---------- monetization ----------
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan            TEXT NOT NULL CHECK (plan IN ('plus_monthly','coaching_bundle','org_license')),
    status          TEXT NOT NULL CHECK (status IN ('trial','active','past_due','cancelled')),
    provider        TEXT NOT NULL DEFAULT 'razorpay',
    provider_sub_id TEXT,                         -- Razorpay subscription id
    trial_ends_at   TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id, status);

-- ============================================================
-- Views the app will lean on (examples)
-- ============================================================
-- Latest score per user (dashboard + coach list):
--   SELECT DISTINCT ON (a.user_id) a.user_id, s.uf_score, s.band, a.taken_at
--   FROM assessments a JOIN assessment_scores s ON s.assessment_id = a.id
--   ORDER BY a.user_id, a.taken_at DESC;
--
-- Org cohort report (UFAS Admin):
--   SELECT u.organization_id, count(*) AS assessments, round(avg(s.uf_score),1) AS avg_score
--   FROM assessments a
--   JOIN assessment_scores s ON s.assessment_id = a.id
--   JOIN users u ON u.id = a.user_id
--   WHERE u.organization_id IS NOT NULL
--   GROUP BY u.organization_id;
