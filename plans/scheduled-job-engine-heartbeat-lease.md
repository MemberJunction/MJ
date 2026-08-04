# Scheduled Job Engine — Heartbeat-Based Lease Renewal

GitHub issue: [#2749](https://github.com/MemberJunction/MJ/issues/2749).

Follow-up to the poll-loop decoupling work ([#2736](https://github.com/MemberJunction/MJ/issues/2736), see companion doc [`scheduled-job-engine-decoupling.md`](scheduled-job-engine-decoupling.md)). This document is the implementation plan; read the decoupling doc first for the surrounding lock/lease/sweep architecture this builds on.

---

## The problem

The decoupling fix eliminated the *unbounded* scheduler stall but left a **residual starvation window**. If `≥ MaxConcurrentJobs` jobs hang simultaneously within a single lease window (default 10 min), healthy scheduled work is starved until at least one **fixed-duration** lease expires and the sweep reclaims its concurrency slot.

The fixed lease is the weak point: it's an absolute-clock deadline set at acquire time, blind to whether the job is actually making progress. A job that hangs at minute 1 still holds its slot until minute 10; a healthy long job that legitimately needs 12 minutes gets reclaimed at minute 10.

## The cure

Replace "fixed lease" with **liveness**. A running job periodically **heartbeats** to push its lease (`ExpectedCompletionAt`) forward. A job that *stops* beating becomes reclaimable shortly after its last beat — regardless of absolute clock time. This is "Option B" from the #2736 design discussion.

The sweep itself needs **no changes**: its filter already reclaims any inflight job whose `ExpectedCompletionAt < now`. Heartbeating simply keeps a healthy job's `ExpectedCompletionAt` ahead of `now`; a hung job's stops advancing and falls into the existing sweep.

---

## Resolved design decisions

These were settled on the issue thread — recording them so the rationale isn't re-litigated:

| Question | Decision | Source |
|---|---|---|
| Heartbeat interval — fixed vs. per-job configurable? | **Fixed default.** Hardcoded constants, no config knob, no per-job override. | rkihm-BC comment |
| Warn when a plugin runs > 80% of lease without beating? | **No.** Only worth it if surfaced meaningfully in the UI for investigation — out of scope here. | rkihm-BC comment |
| Should the engine auto-heartbeat at every `await` return point? | **No.** A `setInterval`/auto-beat would keep renewing the lease even while a plugin is wedged in `await something()`, masking exactly the hang we want to detect. Renewal MUST be driven by the plugin's own forward progress. | #2736 design discussion, issue body |
| Migration path for plugins that don't heartbeat? | Today's fixed-lease behavior is preserved as the fallback. Heartbeating is purely opt-in. | issue body |
| Which drivers demonstrate the pattern? | **All three** — Agent (per step), Action (per param + pre-invocation), IntegrationSync (per batch). | issue body + clarification |

## Key constants

- **`HEARTBEAT_INTERVAL_MS = 5 min`** — throttle window. A `heartbeat()` call is a no-op until this much wall-clock has elapsed since the last *effective* beat, so a driver can call it on every loop iteration without hammering the DB.
- **`HEARTBEAT_LEASE_MS = 6 min`** — lease length applied on each effective beat (`now + this`). One minute larger than the interval so a healthy on-schedule job never lets its lease lapse, while a job that *stops* beating is reclaimable ~1 min after the window it missed.

`HEARTBEAT_LEASE_MS` is deliberately **independent of `_leaseTimeoutMs`**: heartbeating intentionally *shortens* the effective reclaim window (6 min vs. the default 10 min acquire-time lease). That trade — a tighter reclaim window in exchange for plugin-driven liveness — is the entire point of #2749. Coverage is continuous: the 10-min initial lease comfortably outlasts the 5-min wait to the first effective beat, which extends the lease to ~11 min, and so on.

---

## Changes, file by file

### 1. Migration — `migrations/v5/V<ts>__v5.39.x__Scheduling_Engine_Heartbeat_Lease.sql`

Follows the hand-written-sproc pattern established by `V202606022336__v5.39.x__Scheduling_Engine_Atomic_Sprocs.sql` (engine-internal lock sprocs live in migrations, not CodeGen).

- `ALTER TABLE ScheduledJob ADD MaxRuntimeMinutes INT NULL;` + `sp_addextendedproperty` description.
- `CREATE PROCEDURE spExtendScheduledJobLease(@JobID, @ExpectedToken, @NewExpectedCompletionAt)`:
  ```sql
  UPDATE ScheduledJob
     SET ExpectedCompletionAt = @NewExpectedCompletionAt
   WHERE ID = @JobID AND LockToken = @ExpectedToken;
  SELECT @@ROWCOUNT AS Extended;
  ```
  Plus `GRANT EXECUTE` to `cdp_Developer` / `cdp_Integration` and an extended-property description.

The token-checked `WHERE` is the load-bearing atomicity guarantee: it mirrors `spReleaseScheduledJobLockIfTokenMatches` so a stale/reclaimed holder cannot renew a *fresh* holder's lock (lost-mutex protection). Returns `Extended = 1` on success, `0` on token mismatch / already-released.

**CodeGen hand-off:** after the migration runs, CodeGen regenerates `MJScheduledJobEntity` so `MaxRuntimeMinutes` becomes a strongly-typed property. The engine code below references `job.MaxRuntimeMinutes` and only compiles after that regen. (The repo owner runs CodeGen — no `.Get('MaxRuntimeMinutes')` weak-typing fallback.)

### 2. `packages/Scheduling/engine/src/BaseScheduledJob.ts`

Add to `ScheduledJobExecutionContext`:

```typescript
heartbeat?: () => Promise<void>;
```

TSDoc documents: **opt-in**, **self-throttling** (~5 min regardless of call frequency), **never throws** (swallows + logs its own errors), and **no-op in `Concurrent` mode** (no lock to extend). The optional `?` only covers contexts a caller builds by hand (e.g. the existing `FormatNotification` unit-test literals); the engine *always* supplies it when running a job, so inside `Execute` plugins can call it directly.

### 3. `packages/Scheduling/engine/src/ScheduledJobEngine.ts`

- **Constants:** `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_LEASE_MS` (private static readonly).
- **New private method** `extendLeaseIfTokenMatches(jobId, expectedToken, newExpectedCompletionAt): Promise<boolean>` — calls `spExtendScheduledJobLease` via the same `ExecuteSQL` positional-param pattern as `releaseLockIfTokenMatches`; returns `rows?.[0]?.Extended === 1`.
- **`tryAcquireLock(jobId, maxRuntimeMinutes?)`:** initial lease = `max(_leaseTimeoutMs, maxRuntimeMinutes*60_000)` when the override is set & positive — so it only ever *extends* the acquire-time lease, never shrinks it. Update the **3** dispatch/execute call sites (lines ~520, ~571, ~637) to pass `job.MaxRuntimeMinutes`. **Leave `cleanupStaleLocks` (~line 1312) as-is** — it acquires-then-immediately-releases purely to clear a stale lock, so the lease length is moot there.
- **`executeJobWithLock`:** before building the `context`, create a closure-captured `heartbeat`:
  - Captures `lockToken` and a per-execution `lastHeartbeatMs` (init to now).
  - No-op when `lockToken` is null (Concurrent mode).
  - Throttle: return early if `now - lastHeartbeatMs < HEARTBEAT_INTERVAL_MS`.
  - Otherwise set `lastHeartbeatMs = now`, compute `newExpected = now + HEARTBEAT_LEASE_MS`, call `extendLeaseIfTokenMatches`.
  - On `false` (token mismatch — lease reclaimed): `log` it (don't throw); the plugin keeps running but its slot has been handed off, and the end-of-run release will likewise no-op.
  - Wrap the whole body in try/catch → `logError`; a best-effort renewal must never fault the actual job.
  - Attach `heartbeat` to the `context` object.

### 4. Drivers — opt-in callers

- **`AgentScheduledJobDriver`** — pass `onProgress: () => { void context.heartbeat?.(); }` to `runner.RunAgent(...)`. Fires per agent step (prompt / action / sub-agent / decision). `AgentExecutionProgressCallback` is `(progress)=>void`; fire-and-forget is safe because `heartbeat` never throws.
- **`IntegrationSyncScheduledJobDriver`** — replace the `undefined, // onProgress` arg to `RunSync(...)` with `() => { void context.heartbeat?.(); }`. `OnProgressCallback` is `(progress)=>void`. Beats per sync batch.
- **`ActionScheduledJobDriver`** — thread `context.heartbeat` into `processParams` and call it per param (a config with several slow `SQL Statement` params keeps its lease renewed during prep), plus one beat right before `RunAction`. **Documented caveat:** a single long-running action can't beat mid-call → that's precisely the `MaxRuntimeMinutes` use case.

### 5. Tests — `packages/Scheduling/engine/src/__tests__/` (Vitest)

Extend the existing decoupling harness (its mock `ExecuteSQL` queue already supports arbitrary result rows — add `{ Extended: n }` entries):

- Heartbeat extends the lease — calls `spExtendScheduledJobLease` with the live token and a `now + HEARTBEAT_LEASE_MS` expectation.
- Throttling — many rapid calls produce at most one sproc call within an interval window.
- No-op in Concurrent mode (no `lockToken`).
- `extendLeaseIfTokenMatches` returns `false` on `Extended=0` and never throws into plugin code.
- `MaxRuntimeMinutes` bumps the acquire-time `ExpectedCompletionAt`, and never shrinks it below the default lease.

### 6. Docs + changeset

- `packages/Scheduling/engine/README.md` — new "Heartbeat-based lease renewal (#2749)" section: the plugin-author opt-in pattern, why the engine does NOT auto-heartbeat, how it interacts with the sweep / residual-window, and when to reach for `MaxRuntimeMinutes` instead of beating.
- Update [`scheduled-job-engine-decoupling.md`](scheduled-job-engine-decoupling.md) "What this fix does NOT address" item 1 to point at this now-landed work.
- `.changeset/…md` covering the scheduling-engine package and core-entities (new column).

---

## Acceptance checklist (from the issue)

- [ ] Engine supports heartbeat-extending the lease via an atomic sproc (`spExtendScheduledJobLease`).
- [ ] At least one driver demonstrates the pattern — **all three** wired (Agent, Action, IntegrationSync).
- [ ] `MaxRuntimeMinutes` per-job override is functional (bumps the acquire-time lease).
- [ ] Documented in `packages/Scheduling/engine/README.md` with the plugin-author opt-in pattern.
- [ ] Atomicity: heartbeat sproc verified to no-op on token mismatch (lost-mutex protection preserved) — covered by unit test + the DB-level CAS in the sproc's `WHERE`.

---

## Risks / things to flag

- **CodeGen dependency.** The engine package won't compile until the migration runs + CodeGen regenerates `MJCoreEntities` to add the typed `MaxRuntimeMinutes` property. Sequencing: migration → CodeGen → engine build.
- **SQL-Server-only sproc.** Consistent with the existing atomic sprocs; PostgreSQL parity remains a pre-existing follow-up, not part of #2749.
- **Promise leak is unchanged.** Heartbeating tightens the *reclaim window* but a hung promise still leaks in memory (documented decoupling behavior). Worker-thread isolation remains the separate long-term cure.
- **Operator footgun.** If a site configures a long `LeaseTimeoutMinutes` *and* the job heartbeats, the heartbeat shortens the effective lease to ~6 min. That's intended (faster reclaim), but should be called out in the README so it isn't mistaken for a bug.

## Optional stretch goal (NOT in scope for #2749)

`ExecuteAgentParams` exposes `cancellationToken?: AbortSignal`. The agent driver *could* abort the run when a heartbeat detects token-mismatch (lease reclaimed) — which would actually **terminate** leaked agent work rather than merely freeing the slot, partially addressing the promise-leak caveat for the agent path. Worth a dedicated follow-up issue; bundling it here would dilute the focus on the heartbeat primitive.
