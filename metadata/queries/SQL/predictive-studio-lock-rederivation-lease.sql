-- Feature Pipelines: lock one Record Process's re-derivation lease for the rest of the caller's transaction.
--
-- RederivationLease.Acquire / Renew / Release run this through RunQuery (FeatureValueLocks.Acquire's retry) inside
-- their transaction (D5-41): UPDLOCK + HOLDLOCK hold an update lock on the lease row, and the key-range lock on
-- UQ_FeaturePipelineRederivationLease_RecordProcessID covers a process with no row yet, until commit or rollback, so
-- two runs read and take the lease one after the other. NOWAIT never waits: a held lock raises SQL Server error 1222
-- at once and the caller retries with backoff. The derived one-row table makes the Query return DbNow (the database
-- clock every lease time is written and compared on, D5-44) even when the process has no lease row: the lease
-- columns are then null. SQL Server only (D-057).
SELECT SYSUTCDATETIME() AS DbNow, l.ID, l.ProcessRunID, l.AcquiredAt, l.RenewedAt, l.ReleasedAt
FROM (SELECT 1 AS One) AS clock
LEFT JOIN [__mj].FeaturePipelineRederivationLease AS l WITH (UPDLOCK, HOLDLOCK, NOWAIT)
    ON l.RecordProcessID = {{ RecordProcessID | sqlString }}
