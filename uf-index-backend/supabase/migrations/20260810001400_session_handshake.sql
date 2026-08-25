-- ============================================================================
-- Booking a call is a handshake: one side offers, the OTHER side confirms.
--
--   client asks  -> 'requested'  -> the coach confirms
--   coach offers -> 'proposed'   -> the client confirms
--   either way   -> 'confirmed'  -> and only then is it on the calendar
--
-- The rule that matters: you can never confirm your own request. That is
-- enforced here rather than in the dashboard, so it holds however the row is
-- reached.
-- ============================================================================

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('requested', 'proposed', 'confirmed', 'declined', 'done', 'no_show', 'cancelled'));

comment on column public.sessions.status is
  'requested = the client asked, waiting on the coach. proposed = the coach '
  'offered, waiting on the client. confirmed = both agreed, and the only status '
  'the calendar draws.';

-- A pending request should not hold a slot — two clients may ask for the same
-- time and the coach picks one. Only a live booking blocks the slot.
drop index if exists public.sessions_no_double_booking;
create unique index sessions_no_double_booking
  on public.sessions (coach_id, starts_at)
  where status in ('proposed', 'confirmed');

-- ------------------------------------------------------- when is a coach free --
create table if not exists public.coach_availability (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  dow        smallint not null check (dow between 0 and 6),   -- 0 = Sunday
  starts     time not null,
  ends       time not null,
  check (ends > starts),
  unique (coach_id, dow, starts)
);

alter table public.coach_availability enable row level security;

-- A client needs to see when their own coach works, or they cannot ask sensibly.
create policy "read availability" on public.coach_availability
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    or (select public.is_admin_coach())
    or exists (
      select 1 from public.coach_clients cc
      where cc.user_id = (select auth.uid())
        and cc.coach_id = coach_availability.coach_id
        and cc.status = 'active'
    )
  );

create policy "a coach sets their own hours" on public.coach_availability
  for all to authenticated
  using ( coach_id = (select auth.uid()) )
  with check ( coach_id = (select auth.uid()) );

-- ------------------------------------------------------------- free slots ----
-- Working hours minus anything already booked. Returned as slot starts, so the
-- client picks from real openings instead of guessing and being declined.
create or replace function public.coach_free_slots(
  p_coach_id uuid,
  p_from     timestamptz default now(),
  p_days     integer default 14,
  p_mins     integer default 45
)
returns table (slot timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      date_trunc('day', p_from),
      date_trunc('day', p_from) + make_interval(days => p_days),
      interval '1 day'
    ) as d
  ),
  windows as (
    select d.d + a.starts as win_start, d.d + a.ends as win_end
    from days d
    join public.coach_availability a
      on a.coach_id = p_coach_id and a.dow = extract(dow from d.d)
  ),
  candidates as (
    select generate_series(w.win_start, w.win_end - make_interval(mins => p_mins),
                           make_interval(mins => 30)) as slot
    from windows w
  )
  select c.slot
  from candidates c
  where c.slot > p_from
    and not exists (
      select 1 from public.sessions s
      where s.coach_id = p_coach_id
        and s.status in ('proposed', 'confirmed')
        and tstzrange(s.starts_at, s.ends_at, '[)')
            && tstzrange(c.slot, c.slot + make_interval(mins => p_mins), '[)')
    )
  order by c.slot;
$$;

grant execute on function public.coach_free_slots(uuid, timestamptz, integer, integer) to authenticated;

-- --------------------------------------------------------- ask / offer -------
-- A client asks their own coach for a time.
create or replace function public.request_call(p_starts_at timestamptz, p_mins integer default 45)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  sid uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select coach_id into cid from public.coach_clients
  where user_id = uid and status = 'active';
  if cid is null then raise exception 'You do not have a coach yet'; end if;

  if p_starts_at <= now() then raise exception 'That time has passed'; end if;

  insert into public.sessions (coach_id, user_id, starts_at, ends_at, status)
  values (cid, uid, p_starts_at, p_starts_at + make_interval(mins => p_mins), 'requested')
  returning id into sid;
  return sid;
end;
$$;

grant execute on function public.request_call(timestamptz, integer) to authenticated;

-- --------------------------------------------------------- confirm / decline --
-- The heart of it: only the side that did NOT initiate may confirm.
create or replace function public.respond_to_session(p_id uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  s   public.sessions%rowtype;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  select * into s from public.sessions where id = p_id;
  if not found then raise exception 'No such session'; end if;

  if s.status = 'requested' and s.coach_id <> uid then
    raise exception 'Only the coach can answer a client request';
  elsif s.status = 'proposed' and s.user_id <> uid then
    raise exception 'Only the client can answer a coach proposal';
  elsif s.status not in ('requested', 'proposed') then
    raise exception 'That session is already %', s.status;
  end if;

  if not p_accept then
    update public.sessions set status = 'declined' where id = p_id;
    return 'declined';
  end if;

  -- Accepting takes the slot, so the double-booking index applies now.
  begin
    update public.sessions set status = 'confirmed' where id = p_id;
  exception when unique_violation then
    raise exception 'That slot was taken while this was pending';
  end;
  return 'confirmed';
end;
$$;

grant execute on function public.respond_to_session(uuid, boolean) to authenticated;

comment on function public.respond_to_session(uuid, boolean) is
  'Confirm or decline a pending session. Enforces that only the other party may '
  'answer — a coach cannot confirm their own proposal, and a client cannot '
  'confirm their own request.';

-- --------------------------------------------------- seed some working hours --
-- Weekday evenings and Saturday mornings, which is when this actually happens.
insert into public.coach_availability (coach_id, dow, starts, ends)
select c.id, d.dow, d.s, d.e
from public.coaches c
cross join (values (1,'17:00'::time,'20:00'::time),
                   (2,'17:00','20:00'),
                   (3,'17:00','20:00'),
                   (4,'17:00','20:00'),
                   (5,'17:00','19:00'),
                   (6,'09:00','12:00')) as d(dow, s, e)
on conflict do nothing;
