-- ============================================================================
-- After the call: what happened, and what it says about the client.
--
-- A confirmed session that has been and gone is not finished — somebody has to
-- say whether it happened. That record is what makes "12 sessions, 1 no-show"
-- possible, and it is what the next prep brief reads.
-- ============================================================================

create or replace function public.complete_session(
  p_id        uuid,
  p_outcome   text,                    -- 'done' | 'no_show' | 'cancelled'
  p_notes     text default null,
  p_agreement text default null
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  s   public.sessions%rowtype;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_outcome not in ('done', 'no_show', 'cancelled') then
    raise exception 'Outcome must be done, no_show or cancelled';
  end if;

  select * into s from public.sessions where id = p_id;
  if not found then raise exception 'No such session'; end if;

  -- The coach who owns it, or the admin. Never the client: a client marking
  -- their own no-show as attended would make the record worthless.
  if s.coach_id <> uid and not (select public.is_admin_coach()) then
    raise exception 'Only the coach who owns this session can close it';
  end if;

  update public.sessions
     set status    = p_outcome,
         notes     = coalesce(p_notes, notes),
         agreement = coalesce(p_agreement, agreement),
         outcome   = p_outcome
   where id = p_id;

  return p_outcome;
end;
$$;

grant execute on function public.complete_session(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------- the client picture --
-- One row per client with the numbers a coach glances at before a call.
-- security_invoker, so a coach sees their own clients and the admin sees all —
-- the same RLS that governs the underlying tables, not a second set of rules.
create or replace view public.client_summary
with (security_invoker = true) as
select
  cc.user_id,
  cc.coach_id,
  co.full_name                                                as coach_name,
  p.full_name,
  p.organization,
  p.phone,
  cc.assigned_at,
  (select count(*) from public.assessments a
     where a.user_id = cc.user_id)                            as checkins,
  (select max(a.taken_at) from public.assessments a
     where a.user_id = cc.user_id)                            as last_checkin_at,
  (select s2.uf_score from public.assessments a
     join public.assessment_scores s2 on s2.assessment_id = a.id
    where a.user_id = cc.user_id
    order by a.taken_at desc limit 1)                         as latest_score,
  (select s2.band from public.assessments a
     join public.assessment_scores s2 on s2.assessment_id = a.id
    where a.user_id = cc.user_id
    order by a.taken_at desc limit 1)                         as latest_band,
  (select count(*) from public.sessions s
     where s.user_id = cc.user_id and s.status = 'done')      as sessions_done,
  (select count(*) from public.sessions s
     where s.user_id = cc.user_id and s.status = 'no_show')   as no_shows,
  (select count(*) from public.sessions s
     where s.user_id = cc.user_id
       and s.status = 'confirmed' and s.starts_at > now())    as upcoming,
  (select count(*) from public.sessions s
     where s.user_id = cc.user_id
       and s.status in ('requested', 'proposed'))             as pending,
  (select s.agreement from public.sessions s
     where s.user_id = cc.user_id and s.agreement is not null
     order by s.starts_at desc limit 1)                       as last_agreement,
  (select s.starts_at from public.sessions s
     where s.user_id = cc.user_id and s.status = 'done'
     order by s.starts_at desc limit 1)                       as last_session_at
from public.coach_clients cc
join public.profiles p on p.id = cc.user_id
join public.coaches  co on co.id = cc.coach_id
where cc.status = 'active';

comment on view public.client_summary is
  'One row per active client: check-in count, latest score and band, sessions '
  'attended, no-shows, what is upcoming or pending, and what they last agreed to. '
  'security_invoker, so a coach sees their own and the admin sees everyone.';
