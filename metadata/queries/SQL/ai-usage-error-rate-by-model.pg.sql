-- PostgreSQL variant: AI error rate per vendor + model. Live-only.
-- Mirrors ai-usage-error-rate-by-model.sql. Differences:
--   * `[__mj].vwAIUsageFacts` → `__mj."vwAIUsageFacts"`; column references double-quoted, since PG folds
--     unquoted names to lower case.
--   * `Success` is a boolean in PG, so it is compared with true rather than 1.
--   * `DATEADD(hour, -1, SYSDATETIMEOFFSET())` → `now() - INTERVAL '1 hour'`.
SELECT
    o."VendorID",
    o."ModelID",
    SUM(CASE WHEN o."Outcome" IN ('Succeeded', 'Failed', 'Abandoned') THEN 1 ELSE 0 END) AS "TotalRuns",
    SUM(CASE WHEN o."Outcome" = 'Succeeded' THEN 1 ELSE 0 END) AS "SucceededRuns",
    SUM(CASE WHEN o."Outcome" = 'Failed' THEN 1 ELSE 0 END) AS "FailedRuns",
    SUM(CASE WHEN o."Outcome" = 'Abandoned' THEN 1 ELSE 0 END) AS "AbandonedRuns",
    SUM(CASE WHEN o."Outcome" = 'Cancelled' THEN 1 ELSE 0 END) AS "CancelledRuns",
    SUM(CASE WHEN o."Outcome" = 'InFlight' THEN 1 ELSE 0 END) AS "InFlightRuns",
    CAST(
        SUM(CASE WHEN o."Outcome" IN ('Failed', 'Abandoned') THEN 1.0 ELSE 0.0 END) * 100.0
        / NULLIF(SUM(CASE WHEN o."Outcome" IN ('Succeeded', 'Failed', 'Abandoned') THEN 1 ELSE 0 END), 0)
    AS DECIMAL(5, 2)) AS "ErrorRatePct"
FROM (
    SELECT
        f."VendorID",
        f."ModelID",
        CASE
            WHEN f."Status" = 'Cancelled' THEN 'Cancelled'
            WHEN f."IsCompleted" = 0 AND f."Status" IN ('Pending', 'Running')
                THEN CASE WHEN f."RunAt" >= now() - INTERVAL '1 hour' THEN 'InFlight' ELSE 'Abandoned' END
            WHEN f."Success" = true THEN 'Succeeded'
            ELSE 'Failed'
        END AS "Outcome"
    FROM __mj."vwAIUsageFacts" f
    WHERE f."IsParallelParent" = 0
      {% if start %}
      AND f."RunAt" >= {{ start | sqlDate }}
      {% endif %}
      {% if end %}
      AND f."RunAt" < {{ end | sqlDate }}
      {% endif %}
) o
GROUP BY
    o."VendorID",
    o."ModelID"
