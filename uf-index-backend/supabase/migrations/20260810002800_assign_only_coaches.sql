-- ============================================================================
-- assign_client() could hand clients to the admin.
--
-- Every strategy selected from coaches filtered only on `active` — written
-- before the role column existed, and never updated when it arrived. The
-- commit that added roles claimed assignment could only reach coaches; that
-- was true of the helper nobody calls, not of the function everybody calls.
-- The admin ended up with five clients, which is exactly what the role model
-- exists to prevent.
-- ============================================================================
create or replace function public.assign_client(
  p_user_id  uuid,
  p_strategy text default 'lowest_load'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen  uuid;
  why     text;
  lens    text;
  org     text;
begin
  if p_strategy not in ('lowest_load', 'round_robin', 'specialism', 'organization') then
    raise exception 'Unknown strategy: %', p_strategy;
  end if;

  -- Already has a coach? Leave it alone. Reassignment is a separate, deliberate act.
  select coach_id into chosen
  from public.coach_clients
  where user_id = p_user_id and status = 'active';
  if found then return chosen; end if;

  -- ---- SPECIALISM: match the client's weakest area to a coach who works in it.
  -- Falls through to load-balancing when nobody covers it, so a gap in the
  -- roster never leaves someone unassigned.
  if p_strategy = 'specialism' then
    -- The lowest of the three tracked readings on their most recent check-in.
    -- Body composition is excluded: it sets the score, so it is lowest for
    -- almost everyone and would send every client to the same coach.
    select case least(s.pillar_energy, s.pillar_sleep, s.pillar_feeling)
             when s.pillar_sleep   then 'sleep'
             when s.pillar_energy  then 'energy'
             else 'feeling'
           end
    into lens
    from public.assessment_scores s
    join public.assessments a on a.id = s.assessment_id
    where a.user_id = p_user_id
    order by a.taken_at desc
    limit 1;

    select c.id into chosen
    from public.coaches c
    left join public.coach_clients cc on cc.coach_id = c.id and cc.status = 'active'
    where c.active and c.role = 'coach' and lens = any (c.specialisms)
    group by c.id, c.max_clients
    having count(cc.id) < c.max_clients
    order by count(cc.id) asc, c.created_at asc
    limit 1;

    if chosen is not null then
      why := 'specialism: ' || coalesce(lens, 'unknown');
    end if;
  end if;

  -- ---- ORGANIZATION: keep a cohort together. One coach learns the shift
  -- patterns of a police station once, not five times.
  if chosen is null and p_strategy = 'organization' then
    select pr.organization into org from public.profiles pr where pr.id = p_user_id;

    if org is not null and org <> '' then
      select cc.coach_id into chosen
      from public.coach_clients cc
      join public.profiles pr on pr.id = cc.user_id
      join public.coaches c on c.id = cc.coach_id
      where pr.organization = org and cc.status = 'active' and c.active and c.role = 'coach'
      group by cc.coach_id, c.max_clients
      having count(*) < c.max_clients
      order by count(*) desc            -- the coach who already knows this org
      limit 1;

      if chosen is not null then why := 'organization: ' || org; end if;
    end if;
  end if;

  -- ---- ROUND ROBIN: strict rotation by who was assigned longest ago.
  -- Predictable and easy to explain, but blind to how heavy each caseload is.
  if chosen is null and p_strategy = 'round_robin' then
    select c.id into chosen
    from public.coaches c
    left join public.coach_clients cc on cc.coach_id = c.id and cc.status = 'active'
    where c.active and c.role = 'coach'
    group by c.id, c.max_clients, c.created_at
    having count(cc.id) < c.max_clients
    order by max(cc.assigned_at) nulls first, c.created_at asc
    limit 1;
    if chosen is not null then why := 'round-robin'; end if;
  end if;

  -- ---- LOWEST LOAD: the default, and the fallback for everything above.
  -- Fewest active clients wins; ties break on who has been waiting longest.
  if chosen is null then
    select c.id into chosen
    from public.coaches c
    left join public.coach_clients cc on cc.coach_id = c.id and cc.status = 'active'
    where c.active and c.role = 'coach'
    group by c.id, c.max_clients, c.created_at
    having count(cc.id) < c.max_clients
    order by count(cc.id) asc, max(cc.assigned_at) nulls first, c.created_at asc
    limit 1;
    if chosen is not null and why is null then why := 'lowest load'; end if;
  end if;

  -- Everyone is at capacity. Say so loudly rather than silently dropping
  -- someone into a queue nobody watches.
  if chosen is null then
    raise exception 'No coach has capacity. Raise max_clients or add a coach.';
  end if;

  insert into public.coach_clients (coach_id, user_id, assigned_by, reason)
  values (chosen, p_user_id, 'auto', why);

  return chosen;
end;
$$;

-- undo what it did: end the admin's assignments, put those clients back in the
-- queue, and re-run the strategy that should have handled them
update public.coach_clients cc set status = 'ended'
  from public.coaches c
 where c.id = cc.coach_id and c.role = 'admin' and cc.status = 'active';

select public.assign_all_unassigned('organization');
