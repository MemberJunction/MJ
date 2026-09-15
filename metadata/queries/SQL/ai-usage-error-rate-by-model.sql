SELECT
    VendorID,
    ModelID,
    COUNT(*) AS TotalRuns,
    SUM(CASE WHEN Success = 1 THEN 1 ELSE 0 END) AS SucceededRuns,
    SUM(CASE WHEN Success = 0 THEN 1 ELSE 0 END) AS FailedRuns,
    CAST(SUM(CASE WHEN Success = 0 THEN 1.0 ELSE 0.0 END) * 100.0 / NULLIF(COUNT(*), 0) AS DECIMAL(5, 2)) AS ErrorRatePct
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  {% if start %}
  AND RunAtUTC >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND RunAtUTC < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    VendorID,
    ModelID
