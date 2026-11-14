-- Predictive Studio publish gate: lock one training pipeline row for the rest of the caller's transaction.
--
-- LifecycleGate runs this through RunQuery inside its transaction, before it reads the incumbent
-- and re-verifies a publish (D-020). UPDLOCK + HOLDLOCK hold an update lock on the pipeline row (and
-- the key range, so a missing ID is locked too) until commit or rollback, which serialises every
-- publish of one pipeline. NOWAIT never waits: a held lock raises SQL Server error 1222 at once, and
-- the lifecycle gate waits up to 30 s by retrying on 1222 with backoff before it refuses
-- publish-in-progress (transient; D4-91). Returns one row when the pipeline exists, none otherwise.
-- SQL Server only (D-057).
SELECT ID
FROM [__mj].MLTrainingPipeline WITH (UPDLOCK, HOLDLOCK, NOWAIT)
WHERE ID = {{ PipelineID | sqlString }}
