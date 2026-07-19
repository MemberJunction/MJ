# @memberjunction/integration-sync-worker

An **optional**, out-of-process host for MemberJunction **scheduled integration syncs**. It runs the
exact same `SchedulingEngine` poll loop MJAPI runs in-process — but in a dedicated process with no
GraphQL/Apollo — so long, memory- and CPU-heavy syncs stop competing with request serving.

## Deployment model — in-process is the DEFAULT; the container is a CHOICE

**Nothing here changes default behavior.** MJAPI continues to run the scheduler in-process out of the box.
This worker is a deployment *option* that a given operator (e.g. MJC) can choose to turn on:

| Scenario | MJAPI `scheduledJobs.enabled` | Deploy this worker? | Where scheduled sync runs |
|---|---|---|---|
| **Default (unchanged)** | `true` | No | In-process, in MJAPI |
| **Offloaded (opt-in)** | `false` | Yes (`scheduledJobs.enabled=true` in the worker's env) | In this worker container |

Because job claiming goes through the **DB-atomic lease** (`spAcquireScheduledJobLock` + heartbeat), the two
modes never double-dispatch — you could even run both during a migration. To actually offload, set MJAPI's
`scheduledJobs.enabled=false` so only the worker claims jobs.

## Why this is safe (no engine changes)

Sync is already decoupled from the serving process:
- It only reads external data and writes DB rows via `BaseEntity.Save()`, which propagates to every serving
  instance through the **existing Redis `remote-invalidate` bus** (set `REDIS_URL` so the worker participates).
- Boot-time `ResumeOrphanedSyncs` picks up any sync a prior crash left in-progress, from durable
  watermark/keyset checkpoints.
- `RunSync` already accepts an injectable provider; no in-memory serving state is required.

This worker adds **zero** changes to the engine, MJServer, drivers, or resolvers — it is purely a new host.

## Scope (v1)

- **In scope:** scheduled integration syncs (claimed via the lease).
- **Out of scope (stays in-process):** on-demand sync (the fire-and-forget GraphQL mutation); post-sync
  custom-column promotion (a no-callback host is a supported mode — auto-promote is default-OFF, and MJAPI's
  existing RSU-pending path performs any promotion).

## Configuration (env)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | yes | — / 1433 | Same target DB as MJAPI |
| `MJ_CORE_SCHEMA` | no | `__mj` | Core schema |
| `SCHEDULED_JOBS_SYSTEM_USER_EMAIL` | yes | — | MJ user the jobs run as |
| `METADATA_AUTO_REFRESH_INTERVAL` | no | `180000` | Metadata refresh cadence (ms) |
| `SCHEDULED_JOBS_MAX_CONCURRENT` | no | `5` | Max concurrent dispatched jobs |
| `SCHEDULED_JOBS_LEASE_TIMEOUT_MS` | no | `600000` | DB lease timeout (ms) |
| `REDIS_URL` | recommended | — | Cross-process cache invalidation |

## Run

```bash
npm run build
node dist/index.js   # or: npm start
```
