-- Predictive Studio: allocate the next model version of one training pipeline.
--
-- Runs through RunQuery inside the caller's transaction, after the caller holds the pipeline lock
-- (Predictive Studio: Lock Pipeline For Publish), so no other allocation for the pipeline can be
-- in flight and this read does not wait. UPDLOCK + HOLDLOCK hold the pipeline's MLModel key range
-- until commit or rollback, so two trainings of one pipeline cannot read the same MAX(Version).
-- A pipeline with no models yet returns 1. Always returns exactly one row. SQL Server only (D-057).
SELECT COALESCE(MAX(Version), 0) + 1 AS NextVersion
FROM [__mj].MLModel WITH (UPDLOCK, HOLDLOCK)
WHERE PipelineID = {{ PipelineID | sqlString }}
