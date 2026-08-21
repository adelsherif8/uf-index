-- ============================================================================
-- Who gets which client.
--
-- 100 assessments, 5 coaches. Four strategies, because the right answer differs
-- by intake: a police cohort arriving together is not the same problem as
-- twenty individuals trickling in over a month.
--
-- Every assignment records the strategy that produced it in `reason`, so a bad
-- run can be identified and reversed instead of guessed at.
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
    where c.active and lens = any (c.specialisms)
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
      where pr.organization = org and cc.status = 'active' and c.active
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
    where c.active
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
    where c.active
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

revoke all on function public.assign_client(uuid, text) from public, anon, authenticated;

comment on function public.assign_client(uuid, text) is
  'Assigns one client to one coach. Service-role only — called from an Edge '
  'Function after a first assessment, or in bulk by an admin. Idempotent: a '
  'client who already has an active coach keeps them.';

-- --------------------------------------------------------- bulk backfill ----
-- For the case that prompted this: assessments already exist and nobody is
-- assigned. Returns how many were placed.
create or replace function public.assign_all_unassigned(p_strategy text default 'lowest_load')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select distinct a.user_id
    from public.assessments a
    left join public.coach_clients cc
      on cc.user_id = a.user_id and cc.status = 'active'
    where cc.id is null
    order by a.user_id
  loop
    begin
      perform public.assign_client(r.user_id, p_strategy);
      n := n + 1;
    exception when others then
      -- one failure (usually "no capacity") must not abandon the rest
      raise notice 'Could not assign %: %', r.user_id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.assign_all_unassigned(text) from public, anon, authenticated;

-- ------------------------------------------------------- caseload overview --
create view public.coach_caseload
with (security_invoker = true) as
select c.id as coach_id, c.full_name, c.max_clients, c.specialisms,
       count(cc.id) filter (where cc.status = 'active') as active_clients,
       c.max_clients - count(cc.id) filter (where cc.status = 'active') as spare
from public.coaches c
left join public.coach_clients cc on cc.coach_id = c.id
where c.active
group by c.id, c.full_name, c.max_clients, c.specialisms;
