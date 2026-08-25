-- Staff have profiles too, and no coach of their own — so the "waiting to be
-- assigned" queue was listing Parina, Manjula and the admin as clients needing
-- a coach. Being a member of staff is not being an unassigned client.
--
-- Also drop anyone with no name and no check-ins: a bare auth row is not
-- somebody waiting for coaching, it is an account that has not started.
create or replace view public.unassigned_clients
with (security_invoker = false) as
select p.id as user_id, p.full_name, p.organization,
       (select count(*) from public.assessments a where a.user_id = p.id) as checkins,
       (select max(a.taken_at) from public.assessments a where a.user_id = p.id) as last_checkin_at
from public.profiles p
where not exists (select 1 from public.coaches c where c.id = p.id)
  and not exists (
    select 1 from public.coach_clients cc where cc.user_id = p.id and cc.status = 'active'
  )
  and (
    coalesce(p.full_name, '') <> ''
    or exists (select 1 from public.assessments a where a.user_id = p.id)
  );

revoke all on public.unassigned_clients from public, anon, authenticated;
