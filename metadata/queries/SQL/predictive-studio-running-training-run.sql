-- Predictive Studio auto-train: the training run of one pipeline that is in flight now, if any.
--
-- TrainingClaims.ClaimPipeline runs this through RunQuery inside its transaction, after it holds the
-- pipeline lock (Predictive Studio: Lock Pipeline For Publish), so every claim of one pipeline reads
-- it in turn and sees the run row the previous claim committed (D4-12: the claim is the run row). A
-- Running run that started at or before StartedAfter (the caller passes now minus the stale threshold,
-- 6 h by default) is stale and does not block a new claim. Returns the newest in-flight run, or no
-- row. SQL Server only (D-057).
SELECT TOP 1 ID, StartedAt
FROM [__mj].MLTrainingRun
WHERE PipelineID = {{ PipelineID | sqlString }}
  AND Status = 'Running'
  AND StartedAt > {{ StartedAfter | sqlString }}
ORDER BY StartedAt DESC
