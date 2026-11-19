-- Predictive Studio registry check, findings (b) and (h) (§5.7 R6, R7): the newest applied `publish` record of a
-- model (a publish or a rollback) whose model is no longer Published nor Archived by the gate: its status was changed
-- outside the gate (Validated or KeepBaseline: restored, (b)), or the record matches no status change (the model is
-- gone, or Draft or Unevaluated: recorded only, (h)). An `adopt` record has no status change by design (D4-61).
-- SQL Server only (D-057).
SELECT r.ID AS PublishRecordID, r.ModelID, r.TrainingRunID, r.Purpose, m.Status AS ModelStatus, m.PipelineID
FROM [__mj].MLModelPublishRecord r
LEFT JOIN [__mj].MLModel m ON m.ID = r.ModelID
WHERE r.Kind = 'publish'
  AND r.Purpose IN ('publish', 'rollback', 'adopt')
  AND (m.ID IS NULL OR m.Status NOT IN ('Published', 'Archived'))
  AND (r.ModelID IS NULL OR r.RecordedAt = (
    SELECT MAX(r2.RecordedAt) FROM [__mj].MLModelPublishRecord r2
    WHERE r2.ModelID = r.ModelID AND r2.Kind = 'publish' AND r2.Purpose IN ('publish', 'rollback', 'adopt')
  ))
