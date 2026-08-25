-- A client could see they had a coach but not who. The coaches policy only let
-- staff read the roster, so the name came back null and the app said "your coach".
-- A client may read the row of the coach they are actually assigned to — name
-- and nothing else useful, and only while the assignment is active.
drop policy if exists "coaches read the roster" on public.coaches;
create policy "read visible coaches" on public.coaches
  for select to authenticated
  using (
    (select public.is_coach())
    or id = (select auth.uid())
    or exists (
      select 1 from public.coach_clients cc
      where cc.coach_id = coaches.id
        and cc.user_id = (select auth.uid())
        and cc.status = 'active'
    )
  );
