-- ============================================================================
-- Account-level RPCs the app calls directly.
-- ============================================================================

-- ------------------------------------------------- delete_my_account() -----
-- The privacy policy promises "delete everything, in one tap". This is that.
--
-- SECURITY DEFINER because deleting from auth.users needs elevated rights —
-- but the function derives the user from the caller's own JWT and can only
-- ever delete that user. It cannot be pointed at somebody else.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Everything cascades from auth.users: profiles, settings, consents,
  -- devices, assessments (and their scores), plus sessions and answers,
  -- call requests, notifications, subscriptions.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Hard-deletes the calling user and every row that cascades from them (DPDP right to erasure).';

-- ---------------------------------------------------- export_my_data() -----
-- DPDP portability: one call, everything the server holds about the caller.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
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

comment on function public.export_my_data() is
  'Returns everything the server holds about the calling user (DPDP portability).';
