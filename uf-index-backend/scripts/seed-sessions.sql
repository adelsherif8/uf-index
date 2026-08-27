-- Rich test data: past sessions with notes, no-shows, upcoming confirmed calls,
-- pending requests and proposals, message threads with unread replies, and
-- private notes — so every dashboard view has something real to show.
with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
-- past attended sessions, staggered weeks back
insert into public.sessions (coach_id, user_id, starts_at, ends_at, status, outcome, notes, agreement, acted_by, acted_by_role, acted_at)
select coach_id, user_id,
       date_trunc('day', now()) - make_interval(weeks => w.k, hours => -17, mins => -(rn*7 % 45)),
       date_trunc('day', now()) - make_interval(weeks => w.k, hours => -17, mins => -(rn*7 % 45)) + interval '45 min',
       'done', 'done',
       (array['Night shifts are the whole problem.','Good week — walking before shift.',
              'Struggling with late meals.','Talked through the sleep routine.'])[1 + (rn + w.k) % 4],
       (array['Lights out by 11 on off-days','10-minute walk before breakfast',
              'No screens after midnight','Water instead of chai after 6'])[1 + (rn + w.k) % 4],
       coach_id, 'coach', now() - make_interval(weeks => w.k)
from cc cross join (values (2),(4)) as w(k)
where rn <= 5
on conflict do nothing;

with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
-- a couple of no-shows
insert into public.sessions (coach_id, user_id, starts_at, ends_at, status, outcome, notes, acted_by, acted_by_role, acted_at)
select coach_id, user_id,
       date_trunc('day', now()) - interval '3 weeks' + make_interval(hours => 18, mins => rn*11 % 50),
       date_trunc('day', now()) - interval '3 weeks' + make_interval(hours => 18, mins => rn*11 % 50) + interval '45 min',
       'no_show', 'no_show', 'Did not join. No message.', coach_id, 'coach', now() - interval '3 weeks'
from cc where rn in (2, 4)
on conflict do nothing;

with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
-- upcoming confirmed calls on this week's calendar
insert into public.sessions (coach_id, user_id, starts_at, ends_at, status)
select coach_id, user_id,
       date_trunc('day', now()) + make_interval(days => rn, hours => 17, mins => (rn % 2) * 30),
       date_trunc('day', now()) + make_interval(days => rn, hours => 17, mins => (rn % 2) * 30) + interval '45 min',
       'confirmed'
from cc where rn <= 2
on conflict do nothing;

with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
-- pending: one request waiting on each coach, one proposal waiting on a client
insert into public.sessions (coach_id, user_id, starts_at, ends_at, status)
select coach_id, user_id,
       date_trunc('day', now()) + make_interval(days => 2 + rn, hours => 18 + (rn % 2)),
       date_trunc('day', now()) + make_interval(days => 2 + rn, hours => 18 + (rn % 2)) + interval '45 min',
       case when rn = 3 then 'requested' else 'proposed' end
from cc where rn in (3, 4)
on conflict do nothing;

with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
-- message threads, with unread client replies for the inbox
insert into public.messages (coach_id, user_id, sender, body, created_at, read_at)
select coach_id, user_id, m.sender, m.body, now() - m.ago, case when m.sender = 'coach' then now() - m.ago end
from cc cross join (values
  ('coach'::text,  'How did the week go? Saw your check-in — sleep is moving.', interval '2 days'),
  ('client'::text, 'Better! Managed lights out by 11 four nights.',             interval '1 day'),
  ('client'::text, 'Can we talk about the travel week coming up?',              interval '5 hours')
) as m(sender, body, ago)
where rn <= 3
on conflict do nothing;

with cc as (
  select cc.coach_id, cc.user_id,
         row_number() over (partition by cc.coach_id order by cc.assigned_at)::int rn
  from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
  where cc.status = 'active' and c.role = 'coach'
)
insert into public.coach_notes (coach_id, user_id, body, created_at)
select coach_id, user_id,
       (array['Mentioned money worries twice — go gently on programme upsells.',
              'Responds better to voice notes than text.',
              'Shift pattern changes every fortnight; book calls on off-days.'])[rn],
       now() - make_interval(days => rn * 3)
from cc where rn <= 3
on conflict do nothing;

select (select count(*) from public.sessions)  as sessions,
       (select count(*) from public.messages)  as messages,
       (select count(*) from public.coach_notes) as notes;
