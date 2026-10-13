/*
  Queue subsystem — Developer + Integration grants for the three queue entities.

  WHAT WAS BROKEN. No role held CanUpdate on 'MJ: Queue Tasks' or 'MJ: Queues', so CodeGen had
  never emitted an update grant for either: spUpdateQueueTask carried no EXECUTE grant at all.
  QueueBase.StartTask writes a task's terminal status through that proc, so the queue engine could
  never record an outcome — the write failed, the row kept whatever status it had before the run,
  and the in-memory task still reported Complete because the boolean Save() return was discarded.
  Every other engine-written entity (MJ: Tasks, MJ: Scheduled Jobs, MJ: Action Execution Logs)
  already grants Developer + Integration full CRUD with UI read; the queue entities were the
  outlier.

  WHY A MIGRATION AND NOT METADATA ALONE. The matching EntityPermission rows live in
  metadata/entity-permissions/.entity-permissions.json, but an EntityPermission row is only half of
  a working permission — the other half is the SQL-level GRANT that CodeGen derives from it. The
  integration lane, and any fresh install, runs `mj migrate` + `mj sync push` and deliberately runs
  NO CodeGen (see .github/workflows/integration.yml: "No AssociationDB, no live CodeGen"). Without
  this migration a fresh database would carry metadata saying Developer/Integration may update a
  Queue Task while the proc still granted EXECUTE to cdp_UI only — the permission would look
  correct in Explorer and fail at runtime. This cannot fail on a developer database that has run
  CodeGen locally; it fails only on fresh installs, which is precisely why it belongs here.

  GRANT is idempotent in SQL Server, so re-running against a database that already has these
  (any machine where CodeGen has since run) is a no-op.
*/

/* ── MJ: Queue Tasks ───────────────────────────────────────────────────────────────────────── */
GRANT SELECT  ON [${flyway:defaultSchema}].[vwQueueTasks]     TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueTask] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueueTask] TO [cdp_Developer], [cdp_Integration];
GO

/* ── MJ: Queues ────────────────────────────────────────────────────────────────────────────── */
GRANT SELECT  ON [${flyway:defaultSchema}].[vwQueues]      TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueue] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueue] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueue] TO [cdp_Developer], [cdp_Integration];
GO

/* ── MJ: Queue Types ───────────────────────────────────────────────────────────────────────── */
GRANT SELECT  ON [${flyway:defaultSchema}].[vwQueueTypes]      TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueType] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueType] TO [cdp_Developer], [cdp_Integration];
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueueType] TO [cdp_Developer], [cdp_Integration];
GO
