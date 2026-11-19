-- Predictive Studio registry check, finding (a) (§5.7 R6, R7): a Published model with a Delivery and no applied
-- `publish` record (a publish or a rollback) was set Published outside the lifecycle gate. Pre-change models
-- (Delivery IS NULL) are the pre-change migration's (D4-61) and are left out. SQL Server only (D-057).
SELECT m.ID AS ModelID, m.PipelineID
FROM [__mj].MLModel m
WHERE m.Status = 'Published'
  AND m.Delivery IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM [__mj].MLModelPublishRecord r
    WHERE r.ModelID = m.ID AND r.Kind = 'publish' AND r.Purpose IN ('publish', 'rollback')
  )
