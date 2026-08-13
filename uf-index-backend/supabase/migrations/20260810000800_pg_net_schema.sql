-- ============================================================================
-- `create extension pg_net` defaulted into `public`, which the security advisor
-- flags: anything in `public` is reachable through the Data API surface, and
-- extensions have no business there. Its functions live in the `net` schema
-- either way, so this only moves the extension's registration.
-- ============================================================================
do $$
begin
  alter extension pg_net set schema extensions;
exception
  when others then
    -- Older pg_net builds refuse SET SCHEMA. Recreating is safe: the only
    -- caller is send_weekly_reminders(), which resolves net.http_post at run
    -- time, not at definition time.
    drop extension if exists pg_net cascade;
    create extension pg_net with schema extensions;
end $$;
