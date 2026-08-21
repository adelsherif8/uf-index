-- ============================================================================
-- Phase 2 foundation: coaches, client assignment, and sessions.
--
-- Two questions drive this file:
--   1. 100 assessments arrive and there are 5 coaches. Who gets whom?
--   2. Each coach sees only their own calendar; Ravish sees everyone's.
--
-- Assignment strategy is deliberately NOT baked into the schema. The schema
-- records who is assigned to whom and why; the strategy that produced it is a
-- policy that will change. Storing `assigned_by` and `reason` means a bad run
-- can be explained and undone.
-- ============================================================================

-- ------------------------------------------------------------------ coaches --
create table public.coaches (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null,
  email         text not null,
  phone         text,
  is_admin      boolean not null default false,   -- Ravish: sees every coach
  active        boolean not null default true,
  max_clients   integer not null default 25 check (max_clients between 1 and 500),
  -- The lenses this coach actually works in. Used by the specialism strategy.
  specialisms   text[] not null default '{}',
  -- This coach's sub-calendar inside the UFAS Workspace calendar. Set once,
  -- when the calendar is created for them.
  google_calendar_id text,
  created_at    timestamptz not null default now()
);

comment on column public.coaches.max_clients is
  'Hard cap used by assignment. A coach at capacity is skipped rather than overloaded.';

-- --------------------------------------------------------- client assignment --
create table public.coach_clients (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'active'
                 check (status in ('active', 'paused', 'transferred', 'ended')),
  assigned_at  timestamptz not null default now(),
  assigned_by  text not null default 'auto'
                 check (assigned_by in ('auto', 'admin', 'self')),
  reason       text,          -- 'round-robin', 'lowest load', 'sleep specialism', …
  unique (user_id, coach_id)
);

-- One active coach per client. A transfer ends the old row rather than editing
-- it, so the history of who held a client survives.
create unique index coach_clients_one_active
  on public.coach_clients (user_id) where status = 'active';

create index coach_clients_coach_idx on public.coach_clients (coach_id, status);

-- ----------------------------------------------------------------- sessions --
-- A real appointment. Written whether or not Google Calendar is connected —
-- Google is a mirror of this table, never the source of truth. If the
-- integration breaks or a coach revokes access, the schedule survives.
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'proposed'
                     check (status in ('proposed', 'confirmed', 'done', 'no_show', 'cancelled')),
  location         text,
  notes            text,
  outcome          text,
  agreement        text,
  -- Google mirror. Null until the coach connects a calendar.
  google_event_id  text,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index sessions_coach_time_idx on public.sessions (coach_id, starts_at);
create index sessions_user_time_idx  on public.sessions (user_id, starts_at);

-- Nobody gets double-booked: one live appointment per coach per slot.
create unique index sessions_no_double_booking
  on public.sessions (coach_id, starts_at)
  where status in ('proposed', 'confirmed');

-- --------------------------------------------------- the Workspace calendar --
-- UFAS runs ONE Google Workspace calendar with a sub-calendar per coach, rather
-- than each coach connecting a personal Google account.
--
-- Why: a coach who leaves takes a personal calendar with them, along with every
-- appointment on it. A Workspace sub-calendar belongs to UFAS — access is
-- removed, the schedule stays. It also gives the admin one genuine combined
-- view instead of five stitched together.
--
-- So there is a single connection for the whole organisation, not one per
-- coach. One row, enforced.
create table public.workspace_calendar (
  id             boolean primary key default true check (id),   -- exactly one row
  google_domain  text not null,          -- ufaslive.com
  client_email   text not null,          -- the service account
  refresh_token  text,                   -- null when using domain-wide delegation
  sync_token     text,                   -- incremental sync cursor
  connected_at   timestamptz not null default now(),
  last_sync_at   timestamptz
);

comment on table public.workspace_calendar is
  'The single Google Workspace connection. NEVER exposed to the Data API — the '
  'RLS file grants no policy at all, so only the service role inside an Edge '
  'Function can read it. One row, enforced by the primary key.';

comment on column public.coaches.google_calendar_id is
  'The coach''s sub-calendar inside the UFAS Workspace calendar. A coach sees '
  'only their own; the admin sees all of them overlaid.';
