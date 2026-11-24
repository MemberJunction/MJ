-- Predictive Studio publish gate: lock one model row and read its current Status.
--
-- LifecycleGate runs this through RunQuery inside its transaction, after the pipeline lock for a
-- publish, and refuses the transition unless the returned Status equals the expected "from" state.
-- UPDLOCK + HOLDLOCK hold an update lock on the model row until commit or rollback, so no other
-- gate transition of this model interleaves. NOWAIT never waits: a held lock raises SQL Server
-- error 1222 at once, and the lifecycle gate waits up to 30 s by retrying on 1222 with backoff
-- before it refuses publish-in-progress (transient; D4-91).
-- Returns one row when the model exists, none otherwise. SQL Server only (D-057).
SELECT Status
FROM [__mj].MLModel WITH (UPDLOCK, HOLDLOCK, NOWAIT)
WHERE ID = {{ ModelID | sqlString }}
