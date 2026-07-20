# Running RSU in a Separate Container (RSU Worker)

## Context

Runtime Schema Update (RSU) — *migrate → CodeGen → compile → restart* — runs today **inside the serving
MJAPI process** (`RuntimeSchemaManager`, `packages/SchemaEngine/src/RuntimeSchemaManager.ts`). The in-process
CodeGen runner was chosen for observability, but it puts CodeGen's whole heap — the codegen-lib module graph,
per-entity generated TS/SQL source strings (hundreds of MB at 400+ entities), a second metadata-bearing
provider + pool, plus `npx turbo build`/`tsc` child processes (~1–2 GB RSS) — **inside the serving
container's cgroup**, where it competes with request serving and can OOM-kill it mid-request. **Memory is a
known chokehold**; this is the motivation (memory *and* speed).

This document specifies an **optional** out-of-process RSU worker — a deployment *choice*, exactly like the
integration sync worker (PR #3193). **In-process RSU stays the default (`RSU_MODE=inprocess`); nothing changes
unless an operator opts in.**

## Recommended architecture

- **Topology.** A dedicated worker (`packages/RSUWorker`, `@memberjunction/rsu-worker`, mirroring #3193's
  SyncWorker shape) that claims jobs from a new `__mj.RSUJob` table via an atomic DB lease + heartbeat and
  runs the **whole pipeline** (migrate → additionalSchemaInfo → CodeGen → compile → git PR). Migrate and
  CodeGen must run under one lock (`RunPipelineBatch`'s correctness guarantee), so splitting them across
  processes buys nothing; running the whole pipeline in the worker moves the elevated DDL credentials + the
  600s-timeout CodeGen pool + the codegen-lib heap + the compile child processes **entirely out of serving
  MJAPI**.
- **Artifact propagation — primary: boot-time CodeGen per container.** The Docker entrypoint already runs
  `mj migrate` → `mj codegen` (which compiles) → `pm2-runtime`, so "restart a container" already means
  "rebuild generated code from the DB." The worker migrates + bumps a schema generation; each serving replica
  self-restarts and regenerates at boot with `skip-database-generation` (read-only regen). Zero artifact
  plumbing. **Fallback/optimization: a compiled-artifact tarball** keyed `{mjVersion, schemaHash, platform}`
  in object storage, restored at boot with self-CodeGen as the miss path. **GitOps** (the existing Octokit PR)
  stays the audit/promotion channel, not the runtime propagation channel.
- **Anti-skew.** Ship **one image, two roles** (`MJ_ROLE=api|rsu-worker`) so the worker and API can never
  drift in version.

## DB schema (this migration — Phase 0)

`migrations/v5/V202607202000__v5.49.x__RSU_Worker_Tables.sql` (+ PG twin) — plain infrastructure tables (NOT
CodeGen'd entities; RSU must not depend on entity metadata for its own bookkeeping):

- `__mj.RSUJob` — the durable job queue (Status/InputJSON/claim + heartbeat columns/step-progress/result).
- `__mj.RSUSchemaState` — single-row fleet generation counter (bumped after a successful codegen+compile).
- `__mj.RSUPendingWork` — durable post-restart work, claimed atomically by one replica (replaces the on-disk
  `.rsu_pending` store in worker/fleet mode).
- `__mj.RSUAdditionalSchemaInfo` — single-row durable soft-PK/FK document (write-through source of truth so a
  boot-regenerating container can materialize `additionalSchemaInfo.json` from the DB, not an ephemeral FS).

The existing ad-hoc `RSULock` / `RSUAuditLog` tables are left as-is (created at runtime).

## Locking (this PR — Phase 0)

`acquireDBLock` fail-**closed** fix (`RuntimeSchemaManager.ts`): a lock-acquire failure for any reason other
than "another instance holds it" now throws `RSUError('LOCK_ERROR')` instead of silently returning "acquired."
The legacy fail-open behavior — a latent multi-instance hazard — is opt-in via `RSU_DB_LOCK_LENIENT=1`. In
worker mode the DB lock should be forced on (Phase 1). Heartbeat/`ExpiresAt` extension lands with the worker's
job heartbeat (Phase 1).

## Seams (Phase 1 — additive, defaults preserve today's behavior)

`RuntimeSchemaManager` already exposes `SetDDLProvider` / `SetCodeGenRunner` / `SetCodeGenOutputPaths` /
`SetAdditionalSchemaInfoPath`. Add four more, each with a default that reproduces current behavior:

1. `SetRestartStrategy(IRSURestartStrategy)` — default `PM2RestartStrategy` wraps the current `restartMJAPI`
   (`RSU_RESTART_COMMAND` / `pm2 restart`); the worker injects `FleetRestartStrategy` (bump
   `RSUSchemaState.Generation`, optional `RSU_FLEET_RESTART_COMMAND`, write `RSUPendingWork` rows first).
2. `SetPendingWorkStore(IRSUPendingWorkStore)` — default file store wraps `WritePendingWork` /
   `ReadAndClearPendingWork` / `writePostRestartFiles`; worker/fleet injects a DB store over `RSUPendingWork`
   with atomic claim so exactly one replica runs the post-restart work.
3. `SetProgressReporter(IRSUProgressReporter)` — called from the `runStep` wrapper; worker injects a DB updater
   writing `CurrentStepName/StepIndex/StepTotal/StepsJSON` onto the `RSUJob` row (polled by the resolver).
4. `writeAdditionalSchemaInfo` becomes **write-through** (file + `RSUAdditionalSchemaInfo` upsert) + a new
   `MaterializeAdditionalSchemaInfo(targetPath)` helper (read the DB row → write the file) called by the
   worker and the serving boot before CodeGen.

`docker/MJAPI/docker.config.cjs` gains the missing `additionalSchemaInfo` key so writer/reader/materializer
agree (the U5 path-alignment contract).

## The worker (Phase 1)

`packages/RSUWorker` (publishable, opt-in like the CLI): `src/index.ts` (class registrations → provider init →
DDL provider from `CODEGEN_DB_*` → in-process `RunCodeGenBase` runner → inject the three strategies → claim
loop; SIGTERM drain), `src/JobClaimLoop.ts` (poll → atomic `UPDATE … WHERE Status='Pending'` + rowcount →
heartbeat → `RunPipelineBatch` → finalize row; stale-claim janitor), `src/HealthServer.ts`.

MJAPI side (`packages/MJServer`): `RSUResolver` worker-mode branch enqueues an `RSUJob` instead of calling
`RunPipeline` (+ a new `EnqueueRuntimeSchemaUpdate` mutation and `RuntimeSchemaUpdateJob(jobID)` query; existing
mutations keep a synchronous poll facade); `index.ts` gates the two codegen-injection blocks off in worker mode
(codegen-lib never loads in serving heap) and adds the generation watcher (poll + jitter → graceful drain →
`exit(0)`, guarded on supervisor detection); `processRSUPendingWork` switches to the store seam with atomic
claim. Config: `rsu: { mode, generationPollMs, selfRestart }`.

## Env / config

`RSU_MODE=inprocess|worker` (MJAPI), `MJ_ROLE=api|rsu-worker` (container), `RSU_WORKER_POLL_INTERVAL_MS`,
`RSU_WORKER_HEARTBEAT_MS`, `RSU_JOB_STALE_CLAIM_MS`, `RSU_FLEET_RESTART_COMMAND`, `RSU_SCHEMA_GENERATION_POLL_MS`,
`RSU_SELF_RESTART`, `RSU_DB_LOCK_LENIENT` (Phase 0). `ALLOW_RUNTIME_SCHEMA_UPDATE=1` gates everything.

## Phasing

- **Phase 0 (this PR):** the 4 foundation tables (SS + PG) + the lock fail-closed fix + this design doc. Zero
  default-behavior change; nothing reads the new tables yet.
- **Phase 1:** the four seams + DB store implementations + `packages/RSUWorker` + MJAPI worker-mode wiring +
  the generation watcher. Delivers the memory win. Single-node PM2 and docker both self-restart on the
  generation bump.
- **Phase 2:** fleet propagation (boot-time regen + rolling restart, `MJ_ROLE` shared image, DB pending-work
  claim across replicas).
- **Phase 3 / 4 (optional):** artifact tarball cache; GitOps image bake so cold boots skip CodeGen.

## Memory win (worker mode)

Out of serving heap/cgroup: the codegen-lib module graph + per-run generated TS/SQL source strings (hundreds of
MB, transient + fragmenting), the second metadata provider + its 600s pool (steady-state), the compile child
processes (~1–2 GB peak — same cgroup today), and the Octokit blob assembly (~2.3× output at peak). Stays in
MJAPI: the enqueue mutation, status polls, the generation watcher, and the one-shot post-restart pending-work.

## Risks

Version skew (eliminated by one-image/two-role; under boot-regen each replica regenerates with its own
codegen); boot storm (mitigated by read-only boot regen + rolling restart + jitter + the artifact cache);
sync-facade timeouts on long pipelines (callers migrate to enqueue+poll; the job is durable); self-restart
without a supervisor (guarded by supervisor detection, default off). Dev/workbench single-node is untouched —
the in-process default is preserved at every phase.
