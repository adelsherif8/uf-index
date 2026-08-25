-- ============================================================================
-- An admin is not a coach with a wider view.
--
-- Modelling the admin as `coaches.is_admin` made Adel a coach who happened to
-- see everything: he could be assigned clients, could hold availability, showed
-- up in coach pickers, and the dashboard told him "you proposed" about calls
-- other coaches had proposed. None of that is true of him.
--
-- The table is really a staff list. A row now carries a role, and the two roles
-- behave differently: a coach carries clients, hours and a sub-calendar; an
-- admin oversees all of it and carries none of it.
-- ============================================================================

alter table public.coaches
  add column if not exists role text not null default 'coach'
    check (role in ('coach', 'admin'));

-- carry the old flag across, then keep it in step for anything still reading it
update public.coaches set role = 'admin' where is_admin;

create or replace function public.sync_admin_flag()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.is_admin := (new.role = 'admin');
  return new;
end;
$$;

drop trigger if exists coaches_sync_admin on public.coaches;
create trigger coaches_sync_admin
  before insert or update of role on public.coaches
  for each row execute function public.sync_admin_flag();

comment on column public.coaches.role is
  'coach = carries clients, working hours and a sub-calendar. '
  'admin = oversees every coach, is never assigned clients, holds no hours.';

-- An admin must never be handed a client by the assignment strategies.
create or replace function public.assignable_coaches()
returns setof public.coaches
language sql stable security definer set search_path = '' as $$
  select * from public.coaches where active and role = 'coach';
$$;
revoke all on function public.assignable_coaches() from public, anon;
grant execute on function public.assignable_coaches() to authenticated;

-- An admin holds no availability, so clear anything the seed gave them.
delete from public.coach_availability a
 using public.coaches c
 where c.id = a.coach_id and c.role = 'admin';

-- Nor any clients.
update public.coach_clients cc
   set status = 'ended'
  from public.coaches c
 where c.id = cc.coach_id and c.role = 'admin' and cc.status = 'active';

-- ensure_coach gains a role rather than a boolean, which reads better at the
-- call site and cannot be confused with "a coach who is also an admin".
create or replace function public.ensure_coach(
  p_email       text,
  p_full_name   text,
  p_is_admin    boolean default false,
  p_specialisms text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'No account for %. They need to sign up on the coach dashboard first.', p_email;
  end if;

  insert into public.coaches (id, full_name, email, role, specialisms)
  values (uid, p_full_name, lower(p_email),
          case when p_is_admin then 'admin' else 'coach' end,
          case when p_is_admin then '{}'::text[] else p_specialisms end)
  on conflict (id) do update
    set full_name   = excluded.full_name,
        role        = excluded.role,
        specialisms = excluded.specialisms,
        active      = true;
  return uid;
end;
$$;
revoke all on function public.ensure_coach(text, text, boolean, text[]) from public, anon, authenticated;

-- ------------------------------------------------------- what an admin sees --
-- The oversight the roster view could not give: caseload, live workload, and
-- what is sitting unanswered per coach.
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
where c.role = 'coach';

comment on view public.coach_overview is
  'One row per coach for the admin dashboard: caseload, upcoming sessions, what '
  'is waiting on them, what is waiting on their clients, and their attendance record.';
