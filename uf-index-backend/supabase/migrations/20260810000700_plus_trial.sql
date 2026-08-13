-- ============================================================================
-- Deck item 7: "Subscriptions table — free-trial rows only, no payment code."
--
-- The table existed but nothing ever wrote to it, so every Plus trial lived
-- only in AsyncStorage — meaning a reinstall silently granted a fresh trial.
-- ============================================================================

create or replace function public.start_plus_trial(trial_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  existing public.subscriptions%rowtype;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- One trial per account, ever. Returning the existing row rather than
  -- raising keeps the app's "start trial" call idempotent.
  select * into existing
  from public.subscriptions
  where user_id = uid and plan = 'plus_monthly'
  order by created_at
  limit 1;

  if found then
    return jsonb_build_object(
      'status', existing.status,
      'trial_ends_at', existing.trial_ends_at,
      'already_started', true
    );
  end if;

  insert into public.subscriptions (user_id, plan, status, provider, trial_ends_at)
  values (uid, 'plus_monthly', 'trial', 'none', now() + make_interval(days => trial_days))
  returning * into existing;

  return jsonb_build_object(
    'status', existing.status,
    'trial_ends_at', existing.trial_ends_at,
    'already_started', false
  );
end;
$$;

revoke all on function public.start_plus_trial(integer) from public, anon;
grant execute on function public.start_plus_trial(integer) to authenticated;

comment on function public.start_plus_trial(integer) is
  'Starts the Plus free trial once per account. SECURITY DEFINER so a user cannot '
  'insert an arbitrary subscription row directly; the user comes from auth.uid(). '
  'Idempotent — a second call returns the existing trial rather than extending it.';
