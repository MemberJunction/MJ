# Serverless Database Auto-Pause Guide

How to configure MJAPI so that, when nobody is using it, it sends **no periodic queries** to its database and holds no idle connections. That is what lets a serverless database (Azure SQL serverless, Aurora Serverless, Neon) pause and stop billing for compute.

Every MJAPI setting involved is in this guide. Each package's README links here rather than repeating the list.

---

## What keeps a database awake

A serverless database pauses only after a quiet stretch:

- **Azure SQL serverless** pauses when, for the whole auto-pause delay, there are **no sessions** and **no user CPU**. The shortest delay is **one hour**, so anything that queries the database (or holds a pooled connection open) more often than hourly keeps it running forever.
- **PostgreSQL serverless** (Neon, Aurora Serverless v2 with auto-pause) works the same way: it suspends after a period with no connections or queries. Every setting below applies unchanged on PostgreSQL.

MJAPI has two ways of keeping it awake:

1. **Background loops** that query the database on a timer, whether or not anyone is using MJAPI.
2. **The connection pool**, which keeps `connectionPool.min` sessions open (5 by default).

A request from a user, an agent run or a scheduled job wakes the database as normal. This guide is about what MJAPI does when nothing is happening.

---

## Copy-paste: an MJAPI that goes quiet when idle

In `mj.config.cjs`:

```javascript
module.exports = {
  // ...your existing settings...
  databaseSettings: {
    metadataCacheRefreshInterval: 0,     // or METADATA_CACHE_REFRESH_INTERVAL=0
    connectionPool: { min: 0 },          // no sessions held open while idle
  },
  scheduledJobs: { enabled: false },     // only if you do not use scheduled jobs (see the table)
  agentSessions: {
    janitor: { enabled: false },         // or MJ_SESSION_JANITOR_ENABLED=false
    bridgeReconciler: { enabled: false },// or MJ_BRIDGE_RECONCILER_ENABLED=false
    handoffOfferExpiry: { enabled: false },// or MJ_HANDOFF_OFFER_EXPIRY_ENABLED=false
  },
  conversationDetailReconciler: { enabled: false }, // or MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED=false
  agentRunWatchdog: { sweepIntervalMs: 0 },         // or MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS=0
};
```

In the environment:

```bash
MJ_DISABLE_TASK_GRAPH_DISPATCHER=1
# Same as the config block above, if you prefer env vars:
METADATA_CACHE_REFRESH_INTERVAL=0
MJ_SESSION_JANITOR_ENABLED=false
MJ_BRIDGE_RECONCILER_ENABLED=false
MJ_HANDOFF_OFFER_EXPIRY_ENABLED=false
MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED=false
MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS=0
```

`connectionPool.min` and `scheduledJobs.enabled` have no env var; set them in `mj.config.cjs`.

`mj.config.cjs` wins over an env var, and an env var wins over the shipped default. A value MJAPI cannot read (`MJ_SESSION_JANITOR_ENABLED=flase`, `MJ_BRIDGE_RECONCILER_SWEEP_INTERVAL_MS=10m`) stops startup with an error naming the variable, rather than silently running the default.

Only turn off what you do not need. The table below says what each switch costs.

---

## Every background loop, its default and its switch

| Loop | What it does | Default | Switch | What you lose with it off |
|---|---|---|---|---|
| Metadata refresh | Checks whether metadata changed in the database | every 3 min | `databaseSettings.metadataCacheRefreshInterval: 0` / `METADATA_CACHE_REFRESH_INTERVAL=0` | Metadata changed by another process (CodeGen, a migration, another MJAPI without Redis) is not seen until restart |
| Scheduled jobs | Polls for due jobs and runs them | polls only while active jobs exist, as often as their schedules need. The shipped metadata includes the **User Routine Dispatcher (every minute)**, the Agent Memory Manager and the Feature Pipeline Version Steward (every 15 min) | `scheduledJobs.enabled: false`, or set the jobs you don't need to inactive | No scheduled job runs on this instance, user routines included. If you rely on any, keep it on and make the busy jobs less frequent instead: a job that runs every minute keeps the database awake by itself |
| Task graph dispatcher | Claims pending durable-workflow tasks | every 5s (SQL Server) | `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` | Durable workflows (task graphs) submitted by agents never execute on this instance |
| AI Agent Session janitor | Closes stale agent sessions, enforces the voice-session time cap, rebuilds lost realtime recordings | every 60s | `agentSessions.janitor.enabled: false` / `MJ_SESSION_JANITOR_ENABLED=false`; interval `sweepIntervalMs` / `MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS` | Startup recovery and the shutdown drain still close this instance's own sessions. Lost: closing stale sessions of instances that never come back, the voice-session cap, recording recovery. Keep it on if you use realtime/voice agents |
| Realtime bridge reconciler | Closes realtime bridges an earlier boot of this instance left open | every 10 min | `agentSessions.bridgeReconciler.enabled: false` / `MJ_BRIDGE_RECONCILER_ENABLED=false`; interval `sweepIntervalMs` / `MJ_BRIDGE_RECONCILER_SWEEP_INTERVAL_MS` | The pass at startup still runs. Lost: catching a bridge orphaned mid-life (rare) before the next restart |
| Handoff offer expiry | Marks agent-to-person handoff offers (`MJ: Interaction Offers`) `Expired` past their deadline and tells the person's browser | every 15s, on every MJAPI whatever its role | `agentSessions.handoffOfferExpiry.enabled: false` / `MJ_HANDOFF_OFFER_EXPIRY_ENABLED=false`; interval `sweepIntervalMs` / `MJ_HANDOFF_OFFER_EXPIRY_SWEEP_INTERVAL_MS` | Overdue offers still read as expired everywhere. Lost: the row stays `Pending` and the browser gets no "offer expired" push, so an open offer card disappears only on its next refresh |
| Conversation detail reconciler | Closes chat messages left "in progress" by an agent run that already ended | every 5 min (its read is usually answered from MJAPI's own cache, so most passes do not reach the database) | `conversationDetailReconciler.enabled: false` / `MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED=false`; interval `sweepIntervalMs` / `MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS` | The pass at startup still runs. Lost: a message whose run died mid-life keeps spinning until the next restart |
| Agent-run watchdog: heartbeat and stop relay | Stamps a heartbeat on in-flight agent runs (30s) and checks for the Stop button (3s) | only while an agent run is in flight | none needed: they stop when the last run finishes | — |
| Agent-run watchdog: stale-run sweep | Force-fails `Running` agent runs whose heartbeat went stale, including runs other, crashed instances left behind | every 5 min, from the first agent run until the process exits | `agentRunWatchdog.sweepIntervalMs: 0` / `MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS=0` | See [Orphaned agent runs](#orphaned-agent-runs-the-trade-off) |
| User-cache staleness check | Re-reads users and roles changed outside MJ | every 5 min, but queries only when `MJ: Users` or `MJ: User Roles` declares `TrustServerCacheCompletely = false`, or a shared Redis cache is configured | `cacheSettings.userCacheCheckIntervalSeconds: 0` | Users or roles written by raw SQL appear only after restart |
| Engine and metadata sweeps | Re-check engine caches and metadata against the database | every 5 min, but query only for entities that declare `TrustServerCacheCompletely = false` (none on a stock install) | `cacheSettings.engineSweepIntervalSeconds: 0`, `cacheSettings.metadataSweepIntervalSeconds: 0` | Rows written by raw SQL to such entities are seen only on change events or restart |
| Integration sync worker | Polls the integration run queue | off | `integrationSyncWorker.enabled` (leave it off) | — |
| Work queue host | Polls its durable work queues | off | `workQueue.enabled` (leave it off) | — |
| Connection pool | Holds idle sessions open | `connectionPool.min: 5` | `databaseSettings.connectionPool.min: 0` | The first request after an idle stretch opens a new connection (milliseconds, plus the database's resume time) |

**When you read a trace:** on SQL Server, the `mssql` driver runs `SELECT 1;` each time it hands out a pooled connection, so expect roughly one `SELECT 1` per statement MJAPI sends. It is not a poller of its own and goes quiet with everything else.

**Not database pollers:** telemetry (in memory), the Redis cache and pub/sub (Redis only, and off when `REDIS_URL` is blank), the realtime bridge's own stale-session sweep (looks only at bridges live in this process), and the startup passes listed above (they run once).

**`MJ_SERVER_ROLE=api`** turns off scheduled jobs, the task graph dispatcher, the session janitor, both reconcilers and the startup recovery passes at once (not the metadata refresh, the handoff offer expiry or the watchdog). Use it for a replica that only serves requests; some other replica with role `worker` or `all` must then run those loops.

---

## Orphaned agent runs: the trade-off

An agent run stays `Running` forever if the MJAPI running it crashes. The watchdog closes such runs in two ways:

- **At startup**, every MJAPI force-fails runs whose heartbeat is older than `staleThresholdMinutes` (5). This always runs.
- **Periodically**, every `sweepIntervalMs` (5 min), once the process has run at least one agent. Because the sweep keeps going after its own runs finish, an idle instance also closes runs that **other, crashed instances** left behind.

With `sweepIntervalMs: 0`, only the startup sweep remains. A run orphaned by a crash is closed when an MJAPI next starts, which on a single-instance deployment is when the crashed one restarts. Until then it shows as running.

To keep a periodic sweep without a timer in every MJAPI, create a `MJ: Scheduled Job` of the **`AgentRunSweepScheduledJobDriver`** type with a cron expression (it needs `scheduledJobs.enabled`). It runs the same sweep and records each pass as a `MJ: Scheduled Job Run`. A daily or hourly schedule still lets the database pause between runs.

---

## Verifying that it is quiet

### SQL Server / Azure SQL

Statements MJAPI has run against the database in the last 15 minutes, by text:

```sql
SELECT TOP 50
    qs.execution_count,
    qs.last_execution_time,
    SUBSTRING(st.text, 1, 200) AS statement_start
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE (st.dbid = DB_ID() OR st.dbid IS NULL)        -- ad-hoc batches carry no dbid
  AND qs.last_execution_time > DATEADD(MINUTE, -15, GETDATE())
ORDER BY qs.last_execution_time DESC;
```

Stored procedures (the watchdog uses `spStampAIAgentRunHeartbeat` and `spSweepStaleAIAgentRuns`):

```sql
SELECT OBJECT_NAME(object_id, database_id) AS proc_name, execution_count, last_execution_time
FROM sys.dm_exec_procedure_stats
WHERE database_id = DB_ID()
ORDER BY last_execution_time DESC;
```

Open sessions from MJAPI (should reach 0 with `connectionPool.min: 0` after `idleTimeoutMillis`):

```sql
SELECT program_name, COUNT(*) AS sessions
FROM sys.dm_exec_sessions
WHERE database_id = DB_ID() AND is_user_process = 1
GROUP BY program_name;   -- MJAPI's driver reports 'node-mssql'
```

For an exact count, an Extended Events session on `sqlserver.rpc_completed` and `sqlserver.sql_batch_completed`, filtered to the database's `database_id`, records every statement with its time.

On **Azure SQL serverless**, the portal's *Overview* shows the database status (*Paused* / *Online*); the `app_cpu_percent` metric and the Activity log's pause/resume events show whether, and when, it paused.

### PostgreSQL

`pg_stat_activity` lists open connections and their last statement; `pg_stat_statements` (when the extension is enabled) gives per-statement call counts. Neon and Aurora show suspend/resume events in their consoles.

---

## Related

- [`packages/MJServer/README.md`](../packages/MJServer/README.md) — every MJServer setting, env var and config key
- [`packages/AI/Agents/README.md`](../packages/AI/Agents/README.md) — `AgentRunWatchdog`
- [Server Scaling & Pluggable Broadcast Architecture](SERVER_SCALING_AND_BROADCAST_ARCHITECTURE.md) — `MJ_SERVER_ROLE` and multi-replica deployments
