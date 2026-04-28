-- PostgreSQL variant: Recent Entity Changes
-- Mirrors recent-entity-changes.sql for PG. Differences:
--   * Bare view names quoted (vwRecordChanges, vwEntities) since PG folds them.
--   * Column refs double-quoted to survive case-folding.
--   * `DATEADD(DAY, -N, GETUTCDATE())` → `(now() AT TIME ZONE 'utc') - INTERVAL 'N days'`
--     PG doesn't have DATEADD/GETUTCDATE; the (now() AT TIME ZONE 'utc') idiom returns
--     a UTC timestamp, and INTERVAL handles the day arithmetic.
SELECT
    e."Name" AS "EntityName",
    COUNT(*) AS "ChangeCount",
    MAX(rc."CreatedAt") AS "LatestChange",
    MIN(rc."CreatedAt") AS "EarliestChange"
FROM
    __mj."vwRecordChanges" rc
    INNER JOIN __mj."vwEntities" e ON e."ID" = rc."EntityID"
WHERE
    rc."CreatedAt" >= (now() AT TIME ZONE 'utc') - ({{lookbackDays}} || ' days')::interval
GROUP BY
    e."Name"
