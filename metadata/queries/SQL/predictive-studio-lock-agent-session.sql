-- Predictive Studio agent: lock one Model Development Agent session for the rest of the caller's transaction.
--
-- AgentSessionLease.WithSessionLock runs this through RunQuery inside its transaction, on a run's first turn (D5-38):
-- UPDLOCK + HOLDLOCK hold an update lock on the session's first run row (and the key range) until commit or rollback,
-- so two runs continuing one session (a dashboard resume and a chat turn) check for a live sibling one after the
-- other. NOWAIT never waits: a held lock raises SQL Server error 1222 at once, and the caller retries with backoff
-- (PublishLocks.Acquire). Returns the row with the database clock, DbNow, which liveness is measured on (never the
-- process clock, D5-43). SQL Server only (D-057).
SELECT ID, SYSUTCDATETIME() AS DbNow
FROM [__mj].AIAgentRun WITH (UPDLOCK, HOLDLOCK, NOWAIT)
WHERE ID = {{ SessionRunID | sqlString }}
