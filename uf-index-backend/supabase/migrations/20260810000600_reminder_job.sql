-- ============================================================================
-- Deck item 6: "Sunday 6pm streak reminder via Expo push tokens".
--
-- The app already schedules a local notification, but a local schedule cannot
-- reach a phone that has been closed all week — which is exactly the person the
-- reminder is for. This is the server-side sender.
--
-- Done entirely in Postgres with pg_cron + pg_net, deliberately: an Edge
-- Function would need the service-role key handed to the scheduler, and the
-- fewer places that key exists, the better. Expo's push endpoint needs no
-- credential of ours, so this needs no secret at all.
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.send_weekly_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent  integer := 0;
  rec   record;
begin
  for rec in
    select d.user_id, d.push_token
    from public.devices d
    join public.user_settings s on s.user_id = d.user_id
    where s.reminder_enabled
      -- only people who actually need nudging; someone who checked in
      -- yesterday should not be told their streak is at risk
      and (s.last_checkin_at is null or s.last_checkin_at < now() - interval '6 days')
  loop
    -- Log first. If the HTTP call vanishes we still know we intended to send,
    -- which is the difference between "nobody was reminded" and "we have no idea".
    insert into public.notifications (user_id, type, title, body, payload, status, scheduled_for, sent_at)
    values (
      rec.user_id, 'weekly_reminder', 'Time to recharge',
      'Your weekly check-in is ready. Two minutes keeps your streak alive.',
      jsonb_build_object('go', 'profile'), 'sent', now(), now()
    );

    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'to',    rec.push_token,
        'title', 'Time to recharge',
        'body',  'Your weekly check-in is ready. Two minutes keeps your streak alive.',
        'data',  jsonb_build_object('go', 'profile')
      )
    );

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- Never an API endpoint. Only pg_cron calls this.
revoke all on function public.send_weekly_reminders() from public, anon, authenticated;

comment on function public.send_weekly_reminders() is
  'Sunday nudge. Sends an Expo push to every device whose owner has reminders on '
  'and has not checked in for 6 days. Called only by pg_cron.';

-- Sunday 18:00 Asia/Kolkata = 12:30 UTC. pg_cron runs in UTC.
select cron.unschedule('uf-weekly-reminder')
  where exists (select 1 from cron.job where jobname = 'uf-weekly-reminder');

select cron.schedule(
  'uf-weekly-reminder',
  '30 12 * * 0',
  $cron$ select public.send_weekly_reminders() $cron$
);
