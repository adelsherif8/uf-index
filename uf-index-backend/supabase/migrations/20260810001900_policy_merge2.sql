-- ============================================================================
-- Finish the policy merge.
--
-- The previous attempt dropped policies by the names I expected rather than the
-- names Phase 1 actually used, so the originals survived and every one of these
-- tables still evaluated two permissive SELECT policies per row. The combined
-- policy already covers both cases; this just removes the leftovers.
-- ============================================================================
drop policy if exists profiles_select_own          on public.profiles;
drop policy if exists assessments_select_own       on public.assessments;
drop policy if exists assessment_scores_select_own on public.assessment_scores;
drop policy if exists plus_sessions_select_own     on public.plus_sessions;

-- A trigger function has no business being an API endpoint, even a harmless one.
revoke all on function public.sync_admin_flag() from public, anon, authenticated;
