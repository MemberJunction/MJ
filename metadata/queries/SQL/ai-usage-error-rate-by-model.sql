-- Error rate per vendor + model. Live-only.
--
-- Every prompt run is classified into exactly one outcome, WITHOUT requiring CompletedAt — an
-- error-rate metric that only sees completed runs cannot see the runs that died hardest:
--   Cancelled — Status = 'Cancelled'. A caller's decision, not a model failure: reported, but kept
--               out of the error rate on both sides.
--   InFlight  — Pending/Running, not completed, started within the last hour. Genuinely still
--               executing, so it has no outcome yet: reported, excluded from the rate.
--   Abandoned — Pending/Running, not completed, started over an hour ago. The runner records
--               CompletedAt (and Failed/Cancelled) on every exception it catches, so a run left in
--               this state is one whose process died mid-call. It counts as an error. One hour is
--               far beyond any single model call's latency; it is a fixed, documented threshold.
--   Failed    — any other run with Success = 0 (Status 'Failed', or a failed validation).
--   Succeeded — Success = 1.
-- ErrorRatePct = (Failed + Abandoned) / (Succeeded + Failed + Abandoned).
--
-- Parallel parents are excluded: a parent carries a ModelID for a model it never invoked, and its
-- arms (and the result selector) are the real calls.
-- The window filters the base RunAt column (range-seekable on IX_AIPromptRun_RunAt).
SELECT
    o.VendorID,
    o.ModelID,
    SUM(CASE WHEN o.Outcome IN ('Succeeded', 'Failed', 'Abandoned') THEN 1 ELSE 0 END) AS TotalRuns,
    SUM(CASE WHEN o.Outcome = 'Succeeded' THEN 1 ELSE 0 END) AS SucceededRuns,
    SUM(CASE WHEN o.Outcome = 'Failed' THEN 1 ELSE 0 END) AS FailedRuns,
    SUM(CASE WHEN o.Outcome = 'Abandoned' THEN 1 ELSE 0 END) AS AbandonedRuns,
    SUM(CASE WHEN o.Outcome = 'Cancelled' THEN 1 ELSE 0 END) AS CancelledRuns,
    SUM(CASE WHEN o.Outcome = 'InFlight' THEN 1 ELSE 0 END) AS InFlightRuns,
    CAST(
        SUM(CASE WHEN o.Outcome IN ('Failed', 'Abandoned') THEN 1.0 ELSE 0.0 END) * 100.0
        / NULLIF(SUM(CASE WHEN o.Outcome IN ('Succeeded', 'Failed', 'Abandoned') THEN 1 ELSE 0 END), 0)
    AS DECIMAL(5, 2)) AS ErrorRatePct
FROM (
    SELECT
        f.VendorID,
        f.ModelID,
        CASE
            WHEN f.Status = 'Cancelled' THEN 'Cancelled'
            WHEN f.IsCompleted = 0 AND f.Status IN ('Pending', 'Running')
                THEN CASE WHEN f.RunAt >= DATEADD(hour, -1, SYSDATETIMEOFFSET()) THEN 'InFlight' ELSE 'Abandoned' END
            WHEN f.Success = 1 THEN 'Succeeded'
            ELSE 'Failed'
        END AS Outcome
    FROM [__mj].vwAIUsageFacts f
    WHERE f.IsParallelParent = 0
      {% if start %}
      AND f.RunAt >= {{ start | sqlDate }}
      {% endif %}
      {% if end %}
      AND f.RunAt < {{ end | sqlDate }}
      {% endif %}
) o
GROUP BY
    o.VendorID,
    o.ModelID
