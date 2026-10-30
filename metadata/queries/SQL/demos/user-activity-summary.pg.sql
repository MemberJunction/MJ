-- PostgreSQL variant: User Activity Summary
-- Mirrors user-activity-summary.sql. Differences:
--   * View and column names double-quoted, since PG folds unquoted names to lower case.
--   * The composed queries are the same; each resolves to its own PostgreSQL variant.
SELECT
    au."Name" AS "UserName",
    au."Email",
    au."Type" AS "UserType",
    COALESCE(rc."ChangeCount", 0) AS "RecentChanges",
    rc."LatestChange"
FROM
    {{query:"MJ/Demos/Active Users"}} au
    LEFT JOIN {{query:"MJ/Demos/Recent Entity Changes(lookbackDays='30')"}} rc
        ON rc."EntityName" IN (
            SELECT e."Name"
            FROM __mj."vwEntities" e
            WHERE e."ID" IN (
                SELECT DISTINCT rch."EntityID"
                FROM __mj."vwRecordChanges" rch
                WHERE rch."UserID" = au."ID"
            )
        )
ORDER BY
    COALESCE(rc."ChangeCount", 0) DESC,
    au."Name"
