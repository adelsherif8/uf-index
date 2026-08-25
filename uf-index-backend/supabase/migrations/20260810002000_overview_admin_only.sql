-- ============================================================================
-- coach_overview is a management view, not a leaderboard.
--
-- Coaches can read the roster — useful when a client is transferred. But the
-- overview carries caseload, attendance and no-show counts, and inheriting the
-- roster policy meant Parina could see how Manjula is performing. That is the
-- admin's business and nobody else's.
--
-- Filtered inside the view rather than by a policy, because the view spans one
-- table and the restriction is about the shape of the answer, not the rows.
-- ============================================================================
create or replace view public.coach_overview
with (security_invoker = true) as
select
  c.id as coach_id, c.full_name, c.email, c.role, c.active, c.specialisms, c.max_clients,
  (select count(*) from public.coach_clients cc
     where cc.coach_id = c.id and cc.status = 'active')            as clients,
  (select count(*) from public.sessions s
     where s.coach_id = c.id and s.status = 'confirmed'
       and s.starts_at > now())                                    as upcoming,
  (select count(*) from public.sessions s
     where s.coach_id = c.id and s.status = 'requested')           as awaiting_coach,
  (select count(*) from public.sessions s
     where s.coach_id = c.id and s.status = 'proposed')            as awaiting_client,
  (select count(*) from public.sessions s
     where s.coach_id = c.id and s.status = 'done')                as sessions_done,
  (select count(*) from public.sessions s
     where s.coach_id = c.id and s.status = 'no_show')             as no_shows,
  (select max(s.starts_at) from public.sessions s
     where s.coach_id = c.id and s.status = 'done')                as last_session_at
from public.coaches c
where c.role = 'coach'
  and (select public.is_admin_coach());

comment on view public.coach_overview is
  'Admin-only. One row per coach: caseload, upcoming, what is waiting on them, '
  'what is waiting on their clients, and their attendance record. Returns nothing '
  'to a coach — colleagues do not need each other''s no-show counts.';
