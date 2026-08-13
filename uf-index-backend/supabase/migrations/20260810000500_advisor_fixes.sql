-- ============================================================================
-- Advisor fixes.
--
-- `supabase db advisors` flagged four SECURITY DEFINER functions in `public` as
-- callable over the REST API. Postgres grants EXECUTE to PUBLIC on every new
-- function, and anon/authenticated inherit from PUBLIC — so a trigger function
-- nobody ever meant to expose becomes an endpoint at /rest/v1/rpc/<name>.
-- ============================================================================

-- --- 1 · trigger functions are not endpoints -------------------------------
-- These only ever run from a trigger, which fires as the table owner and does
-- not consult EXECUTE privileges. Revoking breaks nothing and closes the door.
revoke all on function public.handle_new_user()  from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- Supabase ships this one with new projects (it auto-enables RLS on new
-- tables). Same problem, not our function — revoke defensively, and don't
-- fail the migration if a future platform change removes it.
do $$
begin
  execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
exception when undefined_function then
  raise notice 'rls_auto_enable() not present — nothing to revoke';
end $$;

-- --- 2 · export_my_data() never needed SECURITY DEFINER ---------------------
-- It reads only the caller's own rows, and RLS already enforces exactly that.
-- Running it as INVOKER means RLS applies normally: if the policies are ever
-- wrong, this function is wrong too, instead of quietly bypassing them.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'profile',     (select to_jsonb(p) from public.profiles p where p.id = uid),
    'settings',    (select to_jsonb(s) from public.user_settings s where s.user_id = uid),
    'consents',    (select coalesce(jsonb_agg(to_jsonb(c) order by c.recorded_at), '[]'::jsonb)
                      from public.user_consents c where c.user_id = uid),
    'assessments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.taken_at), '[]'::jsonb)
                      from public.assessments_with_scores a where a.user_id = uid),
    'plus',        (select coalesce(jsonb_agg(to_jsonb(ps) order by ps.completed_at), '[]'::jsonb)
                      from public.plus_sessions ps where ps.user_id = uid)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- --- 3 · delete_my_account() stays SECURITY DEFINER -------------------------
-- Deleting from auth.users requires it, and there is no way around that. What
-- makes it safe is that the user is read from the JWT inside the function, so
-- it can only ever delete the caller — there is no argument to point elsewhere.
-- The advisor will keep reporting it; that is expected and accepted.
comment on function public.delete_my_account() is
  'Hard-deletes the calling user and everything cascading from them (DPDP erasure). '
  'SECURITY DEFINER is required to touch auth.users; the target is taken from auth.uid(), '
  'never from an argument, so it cannot be aimed at another account. Advisor warning accepted.';
