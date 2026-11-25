-- PostgreSQL variant: Tag Aggregates
-- Mirrors tag-aggregates.sql. Differences:
--   * View and column names double-quoted, since PG folds unquoted names to lower case.
--   * `ISNULL` → `COALESCE`.
SELECT
    ti."TagID",
    COUNT(*) AS "ItemCount",
    CAST(COALESCE(AVG(CAST(ti."Weight" AS FLOAT)), 0) AS DECIMAL(4,2)) AS "AvgWeight"
FROM
    __mj."vwTaggedItems" ti
GROUP BY
    ti."TagID"
