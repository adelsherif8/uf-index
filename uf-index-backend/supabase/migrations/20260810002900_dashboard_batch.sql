-- ============================================================================
-- The dashboard stops needing SQL behind the curtain.
-- ============================================================================

-- ---- the admin adds a coach from the dashboard -----------------------------
create or replace function public.admin_add_coach(
  p_email text, p_full_name text, p_specialisms text[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'No account for %. They must sign up on the dashboard first.', p_email;
  end if;
  insert into public.coaches (id, full_name, email, role, specialisms)
  values (uid, p_full_name, lower(p_email), 'coach', p_specialisms)
  on conflict (id) do update
    set full_name = excluded.full_name, specialisms = excluded.specialisms,
        active = true, role = 'coach';
  return uid;
end; $$;
revoke all on function public.admin_add_coach(text, text, text[]) from public, anon;
grant execute on function public.admin_add_coach(text, text, text[]) to authenticated;

-- ---- and can stand one down ------------------------------------------------
create or replace function public.admin_set_coach_active(p_coach uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin_coach()) then raise exception 'Admins only'; end if;
  update public.coaches set active = p_active where id = p_coach and role = 'coach';
end; $$;
revoke all on function public.admin_set_coach_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_coach_active(uuid, boolean) to authenticated;

-- ---- a coach marks their clients' messages as read -------------------------
drop policy if exists "a coach marks messages read" on public.messages;
create policy "a coach marks messages read" on public.messages
  for update to authenticated
  using ( coach_id = (select auth.uid()) )
  with check ( coach_id = (select auth.uid()) );

-- ---- realtime: sessions and messages push to open dashboards ---------------
do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
