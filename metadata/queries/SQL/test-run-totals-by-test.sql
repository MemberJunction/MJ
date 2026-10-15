-- Per-test run totals for the Testing dashboard's analytics over one window [start, end].
-- One row per test that ran in the window, so the result is bounded by the number of tests, never by
-- the number of runs: the dashboard ranks the tests (top failing / most expensive / slowest) and rolls
-- the rows up by test type on the client.
-- Failures counts Failed and Error runs. Skipped runs were not executed: the dashboard leaves them out of every
-- rate's denominator, so they are counted separately. Durations cover completed runs only (DATEDIFF_BIG is NULL for a
-- run without CompletedAt, which AVG/MAX skip); DATEDIFF_BIG avoids DATEDIFF's int overflow past ~24.8 days.
SELECT
    r.[TestID],
    t.[Name] AS TestName,
    t.[Type] AS TestType,
    COUNT(*) AS Runs,
    SUM(CASE WHEN r.[Status] = 'Passed' THEN 1 ELSE 0 END) AS Passed,
    SUM(CASE WHEN r.[Status] IN ('Failed', 'Error') THEN 1 ELSE 0 END) AS Failures,
    SUM(CASE WHEN r.[Status] = 'Skipped' THEN 1 ELSE 0 END) AS Skipped,
    SUM(COALESCE(r.[CostUSD], 0)) AS TotalCost,
    AVG(CAST(DATEDIFF_BIG(millisecond, r.[StartedAt], r.[CompletedAt]) AS FLOAT)) AS AvgDurationMs,
    MAX(DATEDIFF_BIG(millisecond, r.[StartedAt], r.[CompletedAt])) AS MaxDurationMs
FROM [__mj].[vwTestRuns] r
INNER JOIN [__mj].[vwTests] t ON t.[ID] = r.[TestID]
WHERE r.[StartedAt] >= {{ start | sqlDate }}
  AND r.[StartedAt] <= {{ end | sqlDate }}
GROUP BY r.[TestID], t.[Name], t.[Type]
