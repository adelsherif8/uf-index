-- ============================================================================
-- Assignment the admin can actually reach.
--
-- assign_client() is service-role only, so the strategies existed but nobody
-- could run them without SQL. These are the admin-facing wrappers, plus the
-- transfer that was missing entirely: moving a client ends the old row rather
-- than editing it, so the history of who held them survives.
-- ============================================================================

create or replace function public.admin_assign(p_user_id uuid, p_strategy text default 'lowest_load')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if not (select public.is_admin_coach()) then
    raise exception 'Admins only';
  end if;
  cid := public.assign_client(p_user_id, p_strategy);
  update public.coach_clients
     set assigned_by = 'admin', reason = coalesce(reason, p_strategy)
   where user_id = p_user_id and coach_id = cid and status = 'active';
  return cid;
end;
$$;

create or replace function public.admin_assign_all(p_strategy text default 'lowest_load')
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;
  return public.assign_all_unassigned(p_strategy);
end;
$$;

-- Moving a client is not an edit. The old assignment ends and a new one begins,
-- so "who was coaching them in July" stays answerable.
create or replace function public.admin_transfer(p_user_id uuid, p_to_coach uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare frm uuid;
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;

  if not exists (select 1 from public.coaches c
                 where c.id = p_to_coach and c.active and c.role = 'coach') then
    raise exception 'That is not an active coach';
  end if;

  select coach_id into frm from public.coach_clients
   where user_id = p_user_id and status = 'active';

  if frm = p_to_coach then return p_to_coach; end if;

  update public.coach_clients set status = 'transferred'
   where user_id = p_user_id and status = 'active';

  insert into public.coach_clients (coach_id, user_id, assigned_by, reason)
  values (p_to_coach, p_user_id, 'admin',
          coalesce(p_reason, case when frm is null then 'assigned by admin'
                                  else 'transferred by admin' end))
  on conflict (user_id, coach_id) do update
    set status = 'active', assigned_at = now(), assigned_by = 'admin',
        reason = coalesce(p_reason, 'transferred back by admin');

  -- Sessions that had not happened yet belong to the new coach, or to nobody.
  update public.sessions set status = 'cancelled'
   where user_id = p_user_id and coach_id = frm
     and status in ('requested', 'proposed', 'confirmed')
     and starts_at > now();

  return p_to_coach;
end;
$$;

create or replace function public.admin_set_capacity(p_coach uuid, p_max integer, p_specialisms text[] default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;
  update public.coaches
     set max_clients = coalesce(p_max, max_clients),
         specialisms = coalesce(p_specialisms, specialisms)
   where id = p_coach and role = 'coach';
end;
$$;

revoke all on function public.admin_assign(uuid, text)                    from public, anon;
revoke all on function public.admin_assign_all(text)                      from public, anon;
revoke all on function public.admin_transfer(uuid, uuid, text)            from public, anon;
revoke all on function public.admin_set_capacity(uuid, integer, text[])   from public, anon;
grant execute on function public.admin_assign(uuid, text)                  to authenticated;
grant execute on function public.admin_assign_all(text)                    to authenticated;
grant execute on function public.admin_transfer(uuid, uuid, text)          to authenticated;
grant execute on function public.admin_set_capacity(uuid, integer, text[]) to authenticated;

-- Clients with check-ins but no coach — the queue the admin works through.
create or replace view public.unassigned_clients
with (security_invoker = false) as
select p.id as user_id, p.full_name, p.organization,
       (select count(*) from public.assessments a where a.user_id = p.id) as checkins,
       (select max(a.taken_at) from public.assessments a where a.user_id = p.id) as last_checkin_at
from public.profiles p
where not exists (
  select 1 from public.coach_clients cc where cc.user_id = p.id and cc.status = 'active'
);

revoke all on public.unassigned_clients from public, anon, authenticated;

create or replace function public.admin_unassigned()
returns setof public.unassigned_clients
language sql stable security definer set search_path = '' as $$
  select * from public.unassigned_clients
  where (select public.is_admin_coach());
$$;
revoke all on function public.admin_unassigned() from public, anon;
grant execute on function public.admin_unassigned() to authenticated;
