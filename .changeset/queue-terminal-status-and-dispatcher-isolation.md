---
"@memberjunction/queue": minor
"@memberjunction/server": minor
"@memberjunction/testing-integration": minor
"@memberjunction/integration-test-suite": minor
---

Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

**`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

**`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.
