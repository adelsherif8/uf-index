-- ============================================================================
-- The v2 shell: follow-ups, agreement tracking, seen-states, coach flags,
-- handoff notes surfaced, and a nudge channel from the admin to a coach.
-- ============================================================================

alter table public.sessions
  add column if not exists follow_up_at   timestamptz,
  add column if not exists agreement_kept boolean,
  add column if not exists seen_at        timestamptz;

comment on column public.sessions.follow_up_at is
  'When the coach asked to be reminded about this client again. Resurfaces in their queue.';
comment on column public.sessions.agreement_kept is
  'Whether the PREVIOUS agreement was kept, recorded when the next session is logged.';
comment on column public.sessions.seen_at is
  'When the client first saw a proposal — so a coach can tell "seen and sat on it" from "never saw it".';

-- ---- a coach raises a hand to the admin ------------------------------------
create table if not exists public.client_flags (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (length(btrim(reason)) > 0),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.client_flags enable row level security;

drop policy if exists "coach flags own client" on public.client_flags;
create policy "coach flags own client" on public.client_flags
  for insert to authenticated
  with check ( coach_id = (select auth.uid()) and (select public.coaches_this_client(user_id)) );

drop policy if exists "read own flags" on public.client_flags;
create policy "read own flags" on public.client_flags
  for select to authenticated
  using ( coach_id = (select auth.uid()) or (select public.is_admin_coach()) );

drop policy if exists "admin resolves flags" on public.client_flags;
create policy "admin resolves flags" on public.client_flags
  for update to authenticated
  using ( (select public.is_admin_coach()) )
  with check ( (select public.is_admin_coach()) );

-- ---- the admin can nudge a coach -------------------------------------------
create or replace function public.admin_nudge_coach(p_coach uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Say something'; end if;
  insert into public.notifications (user_id, type, title, body, status, sent_at)
  values (p_coach, 'coach_message', 'From the admin', p_body, 'sent', now());
end; $$;
revoke all on function public.admin_nudge_coach(uuid, text) from public, anon;
grant execute on function public.admin_nudge_coach(uuid, text) to authenticated;

-- ---- handoff notes reach the receiving coach -------------------------------
-- client_summary gains who assigned them and why; a transfer reason written by
-- the admin is the handoff note the new coach reads pinned on the client.
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
     order by s.starts_at desc limit 1)                       as last_session_at,
  cc.assigned_by,
  cc.reason                                                   as handoff_reason
from public.coach_clients cc
join public.profiles p on p.id = cc.user_id
join public.coaches  co on co.id = cc.coach_id
where cc.status = 'active';

-- ---- pending_calls gains age and seen-state --------------------------------
drop function if exists public.pending_calls();
create or replace function public.pending_calls()
returns table (
  id uuid, user_id uuid, coach_id uuid, client_name text, coach_name text,
  starts_at timestamptz, ends_at timestamptz, status text, blocked boolean,
  created_at timestamptz, seen boolean
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.coach_id,
         p.full_name, co.full_name, s.starts_at, s.ends_at, s.status,
         exists (
           select 1 from public.sessions t
           where t.coach_id = s.coach_id and t.id <> s.id
             and t.status in ('proposed', 'confirmed')
             and tstzrange(t.starts_at, t.ends_at, '[)')
                 && tstzrange(s.starts_at, s.ends_at, '[)')
         ) as blocked,
         s.created_at,
         s.seen_at is not null as seen
  from public.sessions s
  join public.profiles p on p.id = s.user_id
  join public.coaches co on co.id = s.coach_id
  where s.status in ('requested', 'proposed')
    and s.starts_at > now()
    and (s.coach_id = (select auth.uid()) or (select public.is_admin_coach()))
  order by s.starts_at;
$$;
revoke all on function public.pending_calls() from public, anon;
grant execute on function public.pending_calls() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
