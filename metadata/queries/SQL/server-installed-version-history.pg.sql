-- PostgreSQL variant: the migrations installed on the server, most recent first.
-- Mirrors server-installed-version-history.sql. Differences:
--   * `[__mj].flyway_schema_history` → `__mj.flyway_schema_history` (Flyway's own table, created with
--     lower-case names, so nothing needs quoting).
SELECT * FROM __mj.flyway_schema_history ORDER BY installed_on DESC
