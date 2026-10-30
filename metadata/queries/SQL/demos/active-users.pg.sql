-- PostgreSQL variant: Active Users
-- Mirrors active-users.sql. Differences:
--   * View and column names double-quoted, since PG folds unquoted names to lower case.
--   * `IsActive` is a boolean in PG, so it is compared with true rather than 1.
SELECT
    u."ID",
    u."Name",
    u."Email",
    u."Type",
    u."__mj_CreatedAt" AS "CreatedAt"
FROM
    __mj."vwUsers" u
WHERE
    u."IsActive" = true
