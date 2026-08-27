-- ============================================================================
-- Reaching a client's phone.
--
-- "Remind all 4" and "Message the group" showed a toast and did nothing. The
-- weekly reminder already knew how to push — it just was not reachable by a
-- coach. This is the same mechanism, callable by the coach who holds the client.
--
-- Every send is logged to notifications first, so a nudge that never lands is
-- distinguishable from one that was never sent.
-- ============================================================================

create or replace function public.notify_client(
  p_user_id uuid,
  p_title   text,
  p_body    text,
  p_type    text default 'coach_message'
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := (select auth.uid());
  admin boolean := (select public.is_admin_coach());
  sent  integer := 0;
  rec   record;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_type not in ('weekly_reminder','streak_risk','score_ready','coach_message','call_update') then
    raise exception 'Unknown notification type';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'A notification needs a title and a body';
  end if;

  -- Only the coach who holds them, or the admin. Nobody messages a stranger.
  if not admin and not exists (
    select 1 from public.coach_clients cc
    where cc.user_id = p_user_id and cc.coach_id = uid and cc.status = 'active'
  ) then
    raise exception 'Not your client';
  end if;

  insert into public.notifications (user_id, type, title, body, status, scheduled_for, sent_at)
  values (p_user_id, p_type, p_title, p_body, 'sent', now(), now());

  for rec in select d.push_token from public.devices d where d.user_id = p_user_id loop
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type','application/json'),
      body    := jsonb_build_object('to', rec.push_token, 'title', p_title,
                                    'body', p_body, 'data', jsonb_build_object('go','profile'))
    );
    sent := sent + 1;
  end loop;

  -- A client with no device registered is normal — they may only use the web
  -- build, or be in Expo Go, which cannot take a push token. The row is still
  -- written, so it reaches them next time they open the app.
  return sent > 0;
end;
$$;

revoke all on function public.notify_client(uuid, text, text, text) from public, anon;
grant execute on function public.notify_client(uuid, text, text, text) to authenticated;

comment on function public.notify_client(uuid, text, text, text) is
  'Push a notification to one client. Coach who holds them, or admin. Logged to '
  'notifications whether or not a device is registered, so an unreachable client '
  'is visible rather than silent.';

-- A client should be able to read what was sent to them.
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.coaches_this_client(user_id)) );
