-- ============================================================================
-- Creating coaches.
--
-- A coach is an auth user with a row in `coaches`, so the person must have an
-- account first — there is no way to create a coach who cannot log in.
--
-- Coaches sign in on the COACH DASHBOARD, not the client app. Same Supabase
-- project and the same auth.users table, so one account works for both; the
-- `coaches` row is what decides which one they belong in.
-- ensure_coach() looks them up by email and is idempotent, so it is safe to
-- re-run and safe to keep in migration history.
-- ============================================================================

create or replace function public.ensure_coach(
  p_email       text,
  p_full_name   text,
  p_is_admin    boolean default false,
  p_specialisms text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);

  if uid is null then
    raise exception
      'No account for %. They need to sign up on the coach dashboard first — a coach must be able to log in.',
      p_email;
  end if;

  insert into public.coaches (id, full_name, email, is_admin, specialisms)
  values (uid, p_full_name, lower(p_email), p_is_admin, p_specialisms)
  on conflict (id) do update
    set full_name   = excluded.full_name,
        is_admin    = excluded.is_admin,
        specialisms = excluded.specialisms,
        active      = true;

  return uid;
end;
$$;

revoke all on function public.ensure_coach(text, text, boolean, text[]) from public, anon, authenticated;

comment on function public.ensure_coach(text, text, boolean, text[]) is
  'Creates or updates a coach from an existing auth user. Service-role only. '
  'Idempotent — re-running promotes or corrects rather than duplicating.';

-- ------------------------------------------------------------- admin seat ---
-- Adel holds the admin seat for now: he sees every coach''s calendar and every
-- assignment. Handing it to Ravish later is one call to ensure_coach() with
-- his email — and this one can be flipped back with p_is_admin => false.
--
-- Wrapped so the migration does not fail on a database where the account does
-- not exist yet — which is the case today, because the coach dashboard does not
-- have real sign-in yet. Re-run the call by hand once it does.
do $$
begin
  perform public.ensure_coach('adelsherif8@gmail.com', 'Adel Emad', true);
  raise notice 'Admin coach set: Adel Emad';
exception when others then
  raise notice 'Admin coach not set (%). Sign up on the coach dashboard, then run: select public.ensure_coach(''adelsherif8@gmail.com'', ''Adel Emad'', true);', sqlerrm;
end $$;
