# Scheduled Job Engine — Poll-Loop Decoupling

GitHub issue: [#2736](https://github.com/MemberJunction/MJ/issues/2736).

This document captures the architectural reasoning behind the fix. The execution checklist lives in `plans/scheduled-job-engine-decoupling-punchlist.md` — implementers should work from there. Read this first for the *why*.

---

## The problem

`ScheduledJobEngine` runs its polling loop and job execution on a **single serial `await` chain**. The poll loop awaits each due job's *entire* execution inline, and only re-arms the next poll **after** the whole cycle returns. As a result, a single job whose `plugin.Execute()` never settles permanently stalls the entire scheduler — every other job starves, the existing stale-lock lease can never self-reclaim, and recovery requires a manual process restart.

### Mechanism (from `packages/Scheduling/engine/src/ScheduledJobEngine.ts` at 5.38.0)

1. **Poll loop (lines 155–202)** — awaits `ExecuteScheduledJobs`, then re-arms `setTimeout(poll, interval)` only after it resolves.
2. **`ExecuteScheduledJobs` (lines 366–401)** — `for` loop awaits `this.executeJob(job, contextUser)` inline (line 382), serializing all due jobs.
3. **`executeJob` (lines 458–552)** — awaits `plugin.Execute(context)` at line 509. If the plugin never settles, the `finally` at lines 546–551 (which releases the lock) never fires.
4. **Stale-lock reclaim (lines 645–676, `tryAcquireLock`)** — checks `now > job.ExpectedCompletionAt` at line 652. Only reached on a *subsequent* poll cycle. On single-instance deployments, that next poll never arrives because the poller is wedged inside the hung job.
5. **`NextRunAt` lifecycle** — bumped in `updateJobStatistics` (line 594), called from `executeJob` *after* `plugin.Execute()` returns. A hung job's `NextRunAt` never advances, so it remains perpetually due on every (future) poll — load-bearing for the sweep logic described below.
6. **`Config(false)` semantics** — `forceRefresh=false` is "load once if not already loaded." The per-poll `Config(false)` calls were no-ops after the first one; job list refreshes happen only via explicit `OnJobChanged → Config(true)`.

### Why the lease-based backstop didn't save it

The lock design is a DB-row mutex with a lease: `attemptLockAcquisition` sets `ExpectedCompletionAt = now + 10 min`, and `tryAcquireLock` treats a lock as stale and reclaims it once `now > ExpectedCompletionAt`. This is correct **only if some poll cycle runs to evaluate the lease** — e.g. a second instance in a multi-server deployment. On a single instance, the wedged process is the only poller, so it can never evaluate its own expired lease. The lease backstop was effectively dead for single-instance deployments.

### Production evidence

Izzy deployment, single Azure App Service instance (P0v3). A `ConcurrencyMode=Skip` `*/15` job acquired its lock at 14:19 with `ExpectedCompletionAt=14:29`, then hung in an unbounded model-failover retry loop (provider returned `RESOURCE_EXHAUSTED`; failover retried with fixed 30s waits, looping without ever settling). Lock stayed held for ~80 minutes (70+ minutes past lease expiry). Every `*/15` tick in that window was skipped (`ConcurrencyMode=Skip`). All other jobs and all other tenants/orgs starved — no polling occurred at all. A manual app restart cleared it: the new process's first poll hit the stale-lease check and reclaimed within minutes.

The DB was also left with phantom `Status='Running'` `ScheduledJobRun` records and orphaned downstream `Status='Running'` / `Status='Creating Reply'` `AIAgentRun` rows that persisted for months until manually cleaned up.

---

## Solution overview

Decouple polling from job execution. The poll loop dispatches due jobs as **tracked async tasks** and immediately re-arms `setTimeout(poll, interval)` — not `await` each job's full execution inline. The existing lock/lease + `ConcurrencyMode=Skip` + atomic CAS prevents double-dispatch across instances and within the same instance, so concurrent polling is safe.

This sounds simple. The complication: decoupling alone introduces six new safety hazards that must be addressed as **prerequisites of the fix**, not optional extras. Shipping decoupling without them would convert a liveness bug into safety bugs in different directions. The full design — covered in detail below — pairs decoupling with bounded concurrency, atomic token-checked lock release, a re-arm-first invariant in the poll body, a sweep that frees concurrency slots independently of `isJobDue` and the cap, abandonment of orphaned run records during sweep, and TDZ-safe inflight tracking.

The fix elevates the scheduler from "any single job can hang the whole subsystem indefinitely" to "scheduler keeps running through individual hangs, with a bounded worst-case starvation window if many jobs hang simultaneously." It does not address the *cause* of hangs (plugin bugs) — that's deferred to per-driver work tracked as a follow-up issue.

---

## Hazards and how each is addressed

| Hazard | Source | Fix |
|---|---|---|
| **Liveness**: hung job stalls scheduler indefinitely | Original bug (serial `await` in poll body) | Decouple — fire-and-track, don't await |
| **Resource exhaustion**: N due → N concurrent dispatches → DB/memory/rate-limit storms | Introduced by naive decoupling | Bounded concurrency via `MaxConcurrentJobs` cap |
| **Lost mutex**: lease-expired holder clobbers fresh holder's lock when it eventually settles | Reachable for the first time after decoupling (lease expiry while holder still alive used to be impossible because poller was wedged) | Atomic token-checked CAS via sproc — release only when stored token still matches |
| **Poll wedge via awaited work in poll body**: `await Config()` or similar hangs → no next poll | Subtle regression risk if `setTimeout(poll, interval)` follows any await | Re-arm timer FIRST, before any await; move `Config(false)` out of per-poll path to startup-only |
| **Shared mutable entity race**: lock `Load()/Save()` mutates `this.ScheduledJobs[]` entities the poll loop is reading | Pre-existing but only triggerable under concurrency, which decoupling introduces | Lock methods take `jobId: string`, never operate on the shared entity object |
| **Cap measures dispatch attempts, not work**: lock-failed `executeJob` calls briefly hold cap slots, starving real work under lock-contention bursts | Architectural — cap check before lock check, lock check inside `executeJob` | Hoist `tryAcquireLock` from inside `executeJob` to the dispatcher; only acquired locks count against cap |
| **Zombie slot accumulation**: leaked promises from hung-then-reclaimed jobs hold cap slots forever, recreating starvation gated by `MaxConcurrentJobs` instead of 1 | Architectural — leaked JS promises can't be cancelled | Sweep at top of every poll untracks leaked promises whose DB lease has expired, freeing the slot. JS promise leaks; heap impact documented |
| **Reclaim coupled to `isJobDue` and cap**: a saturated cap blocks the loop that would have triggered reclaim | Order of operations in the dispatcher | Sweep runs *before* the cap check, unconditionally on every poll |
| **Orphaned `Status='Running'` run records**: hung executions never write completion state | DB-side litter from any hang | Sweep also marks abandoned runs as `Status='Failed'` with explanatory message |
| **Cap overshoot under overlapping polls**: check-then-act race across concurrent poll bodies | No reentrancy guard (correctly avoided — see below) | Documented as SOFT cap; transient overshoot bounded by overlap count |
| **TDZ / fast-settle race in tracking**: synchronous throw before first await fires `.finally` before tracking entry is added | JS scheduling quirk that ClassFactory throws expose | Set the Map entry before attaching `.catch/.finally`; identity-check on delete |
| **Late-settling hung promise corrupts fresh dispatch's slot**: original hung promise's `.finally` deletes by job ID, removing a fresh entry that's been re-dispatched | Same root as above | Identity check in `.finally` — only delete if entry is still our promise |

The columns "Source" and "Fix" are blunt summaries — the detailed reasoning behind each fix is in the punch-list. The point of the table is to show *how many things had to be true at once* for the decoupling to be safe.

---

## Non-trivial architectural decisions

These are the choices where reasonable engineers could pick differently. Each is documented with the option chosen, what was considered, and why.

### 1. Atomic lock CAS via stored procedures, not `BaseEntity` load-compare-save

**Decision**: Add two new stored procedures (`spAcquireScheduledJobLock`, `spReleaseScheduledJobLockIfTokenMatches`) that perform atomic conditional `UPDATE` statements at the DB level. The engine calls these via raw SQL execution, bypassing `BaseEntity` for lock operations.

**Alternatives considered**:
- Continue using `job.Load() → check → job.Save()` as the engine does today. Rejected: this is a TOCTOU window. Under genuine multi-instance contention or post-reclaim races, two holders can pass the check independently and both write. Specifically, after the new decoupling makes "lease expiry while holder is still alive" reachable, a load-compare-save release would let the stale holder's eventual settlement clobber the fresh holder's lock — a lost-mutex bug.
- Use a serializable transaction wrapper around load-compare-save. Rejected: heavier than necessary; sproc-level atomicity is the standard SQL Server pattern for single-row CAS.

**Trade-offs**:
- **Loss of `RecordChange` audit trail for lock operations.** `BaseEntity.Save()` writes audit rows; raw SQL doesn't. We considered this loss acceptable because lock changes are machine-generated churn, not user actions worth auditing — they were already noise in the change history.
- **Adds a DB schema dependency to the engine.** The engine now requires two specific sprocs to exist. Mitigated by a startup permission probe that fails loudly if the engine's DB principal lacks `EXECUTE` on them.
- **SQL-Server-specific SQL.** PostgreSQL would need equivalent functions. Acceptable because the engine is already targeted at SQL Server in practice; the punch-list flags this as a follow-up if PG support becomes a priority.

### 2. Re-arm timer FIRST, then do awaited work (no reentrancy guard)

**Decision**: The poll callback's first action is `setTimeout(poll, interval)`. All awaited work follows. No reentrancy guard.

**Alternatives considered**:
- **Re-arm at the end (status quo)**. Rejected: that's the original bug.
- **Re-arm first AND add an `isPollInProgress` reentrancy guard.** Rejected during v2 review because a guard held by a hung body becomes its own liveness trap: the timer fires but every poll returns immediately because the flag is stuck true. Same stall pattern, just less visible (timer logs but no work).
- **Move `Config()` and other potentially-blocking work out of the poll body entirely.** Adopted alongside the re-arm-first invariant. `Config(false)` was already effectively load-once (no-op after first call), so per-poll calls were redundant. Moving the one-time init to `StartPolling`'s upfront block means the steady-state poll body has nothing that *can* hang.

**Trade-offs**:
- **Concurrent poll bodies are possible.** Two awaited dispatches can overlap if `DispatchScheduledJobs` takes longer than the polling interval (rare in practice — lock sproc round-trips are sub-10ms). Acceptable because the atomic sproc prevents same-job double-dispatch, and the soft cap bounds resource fan-out. Overlap is rare and bounded.
- **Job list refresh now requires explicit `OnJobChanged`.** This is pre-existing behavior (the per-poll `Config(false)` was load-once anyway), but worth calling out: runtime job additions/disablements need an `OnJobChanged` trigger to be picked up. Tracked as a follow-up to add an auto-refresh mechanism.

### 3. Bounded concurrency cap (`MaxConcurrentJobs`) is a soft limit

**Decision**: `MaxConcurrentJobs` is a soft cap that may be transiently exceeded by a small amount under overlapping poll bodies. Default is 5, configurable via `mj.config.cjs scheduling.maxConcurrentJobs`.

**Alternatives considered**:
- **No cap.** Rejected: the original serial loop was accidentally a cap of 1; removing it without a replacement allows N-due-jobs → N-concurrent fan-out, which exhausts DB connections, model API rate limits, memory.
- **Hard cap with reserve-before-await pattern.** Rejected: would require atomic slot reservation across overlapping polls (semaphore with proper async coordination). The complexity isn't justified — cap exists to bound order-of-magnitude fan-out, not to enforce an exact integer. A soft cap that holds at the configured value in steady-state and transiently exceeds by 1–2 under contention serves the actual purpose.
- **Per-job-type caps.** Rejected for v1 — too many knobs. Single engine-wide cap is the simplest useful primitive.

**Trade-offs**:
- **Operationally: documented as soft.** Sites that need a hard ceiling can set the cap slightly below their true limit.
- **No queueing.** Overflow jobs are skipped this tick and picked up by subsequent polls as slots free. Consistent with the existing `ConcurrencyMode=Skip` semantics. No new queueing primitive to design.

### 4. Stale-inflight sweep runs at top of every poll, decoupled from `isJobDue` and cap

**Decision**: A new `sweepStaleInflightJobs` runs *first thing* in every poll cycle, before the cap-bounded dispatch loop. It queries the DB for inflight jobs whose lease has expired and untracks them.

**Alternatives considered**:
- **Reclaim happens inside `tryAcquireLock` when a due job is re-evaluated (status quo extended)**. Rejected for v3 review reason #1: the cap check sits *before* `tryAcquireLock` in the dispatch loop. If hung jobs saturate the cap, the loop skips at-capacity for all subsequent due jobs and never reaches `tryAcquireLock` for any of them. Stale-lock reclaim becomes unreachable in exactly the scenario it's most needed.
- **Reclaim coupled to `isJobDue`**. Rejected: a hung job's `NextRunAt` never advances (`updateJobStatistics` only runs on completion), so `isJobDue` does return true on every poll for a hung job. Today this happens to work. But if a future change moves `NextRunAt` advancement to dispatch time (a reasonable optimization), reclaim breaks silently. Decoupling makes the safety property robust to that future change.

**Trade-offs**:
- **Sweep is a per-poll DB query.** Mitigated: implemented as a single batch `RunView` with `ID IN (...) AND (lease expired or null)`. Returns zero rows in steady-state (no zombies), so the hot path is one cheap query that matches nothing. Cost is bounded by `inflightJobPromises.size`, typically a small number.
- **Orphaned run record abandonment is fire-and-forget (not awaited).** A fleet-wide hang event could find many zombies in one poll. Awaiting their abandon writes would delay dispatch for that tick. Cleanup is correctness-irrelevant for slot-freeing — fire-and-forget keeps dispatch latency bounded.

### 5. Tunable lease (`LeaseTimeoutMinutes`), public minutes / internal milliseconds

**Decision**: Add `LeaseTimeoutMinutes` as a configurable property (default 10) alongside `MaxConcurrentJobs`. Public setter validates positive integer minutes; internal state is `_leaseTimeoutMs` for sub-minute test granularity via a test-only seam.

**Alternatives considered**:
- **Leave the 10-minute lease hardcoded**, defer all lease-tunability to a future heartbeat-based design. Rejected: heartbeats are correctly deferred, but until then sites with high hang risk have no operational lever. A tunable lease is the simplest pre-heartbeat mitigation.
- **Expose milliseconds as the public unit.** Rejected: operationally, "lease in minutes" reads naturally for the configuration block (`scheduling.leaseTimeoutMinutes: 5`). Ms is a test-detail.
- **Float minutes (e.g. 0.5)**. Rejected: ambiguous configuration (is `0.05` 3 seconds or a typo?); validation cleaner as positive integer. Sub-minute is for tests only.

**Trade-offs**:
- **`_setLeaseTimeoutMsForTest` is a public test seam.** Necessary for deterministic short-lease tests (T2, T10, T15). Named with underscore + `ForTest` suffix to mark intent; documented as test-only. The alternative — manipulating `ExpectedCompletionAt` directly in test DBs — is more invasive and obscures what the test is doing.
- **Lease shortening has a real risk.** Setting `LeaseTimeoutMinutes` lower than the max legitimate job runtime causes healthy long jobs to be reclaimed and re-dispatched. Documented as such in the README. Heartbeats are the structural cure.

### 6. `inflightJobPromises` as `Map<jobId, Promise>`, not `Set<Promise>`

**Decision**: Track in-flight jobs in a `Map` keyed by job ID, with identity-check on the `.finally` delete.

**Alternatives considered**:
- **`Set<Promise>`** (the natural shape if you only care about counting). Rejected for two reasons:
  1. The sweep needs to look up "is there a tracked promise for this job ID?" to know whether to untrack on reclaim. `Set<Promise>` has no key lookup.
  2. The late-settle race (a hung promise's `.finally` running after a sweep + re-dispatch has replaced the entry) requires identity comparison — only delete if the current entry is *this* promise. With a `Set`, identity is the only key, so any settled promise would delete itself. With a `Map<jobId, Promise>` and `if (map.get(id) === thisPromise) map.delete(id)`, the re-dispatched entry is protected.
- **`Map<jobId, { promise, token, dispatchedAt }>`** with richer metadata. Rejected: the lock token is owned by `executeJobWithLock` via closure; the dispatched-at is recoverable from the DB if needed; the simpler shape is enough.

**Trade-offs**:
- **JS Promise leaks are real and permanent.** A hung promise is unreclaimable by the JS engine because the suspended async function still references it. Each leak holds the plugin instance, execution context, and captured closures (typically single-digit MB). Bounded by the count of distinct hanging jobs. Process restart at deploy time clears them. Operational signal: each sweep logs an `[sweep] Untracking inflight job <name>` line. Spike = canary for a misbehaving plugin. The README documents this explicitly and links to the follow-up issue for plugin bounding (the structural cure).

### 7. TDZ-safe tracking: set Map entry BEFORE attaching `.catch/.finally`

**Decision**: After spawning the dispatched promise, immediately `map.set(jobId, promise)` synchronously, then attach the `.catch().finally()` chain. The identity check in `.finally` is guarded by the assumption that the entry exists when `.finally` runs.

**Alternatives considered**:
- **Attach catch/finally first, then set the map entry.** Rejected: if `executeJobWithLock` throws synchronously before its first `await` (e.g., `ClassFactory.CreateInstance` throws on a missing DriverClass — a real bug we hit with knowledge-gatherer drivers), the `.finally` fires before `.set` runs. The identity check then reads `map.get(jobId) === undefined`, decides not to delete, but the subsequent `.set` adds a permanently-orphaned entry.
- **Wrap the spawn in `Promise.resolve().then(() => executeJobWithLock(...))`** to guarantee the first tick is async. Rejected: defers the problem rather than solves it; adds a microtask for no functional reason.

**Trade-offs**:
- **Synchronous throws are still propagated through the `.catch`.** The outer `.catch` logs the throw and returns null, satisfying the promise. The tracking entry is correctly added by `.set` before the `.finally` runs (because `.set` is synchronous; `.finally` is at-least-microtask-deferred). The order matters precisely.

### 8b. Statistics persistence via targeted sproc, NOT `job.Save()`

**Decision**: `updateJobStatistics` persists run-count / success-count / failure-count / LastRunAt / NextRunAt via a dedicated stored procedure (`spUpdateScheduledJobStatistics`) that touches ONLY those five columns. It does NOT call `job.Save()` on the shared `MJScheduledJobEntity` in `this.ScheduledJobs`.

**Why this is required, not optional**: surfaced during V3 end-to-end smoke testing. The original code called `await job.Save()` after incrementing the stats fields. BaseEntity's `Save()` writes ALL columns back to the DB — including lock columns. The shared entity's in-memory `LockToken` was `NULL` (loaded BEFORE the atomic sproc set the live lock token), so the Save wrote NULL back, clobbering the active lock. The subsequent `releaseLockIfTokenMatches` then saw a token mismatch and returned `Released=0` on every successful job completion. Lock was effectively held by NOBODY but the engine thought it was held by a phantom.

This is a manifestation of the same **shared mutable entity hazard** that motivated decision #2 (lock methods take `jobId: string`, not the entity). But the existing `updateJobStatistics` predated the decoupling work and slipped through — its `Save()` wasn't a problem in the original serial-execution model because nothing else was racing the lock columns.

**Alternatives considered**:
- **Pre-Save reload of lock columns** — fragile. Adds a round-trip, race-y, papers over the underlying "Save writes everything" problem.
- **Reorder operations so Save happens AFTER release** — stats save no longer racing the lock, but now happens unprotected. Another instance could re-dispatch the same job in between release and stats Save and have its stats clobbered. Cleaner than the original bug, still not architecturally honest.
- **Stop using the shared entity entirely** — same approach as #2 for lock methods. The chosen fix.

**Trade-offs**:
- Adds a second migration to the PR (small, single sproc).
- `job.Save()` for any future per-run mutation is now suspect — the comment on `initializeNextRunTimes` (which still uses `Save`) explicitly documents why it's safe there (runs in `StartPolling`'s upfront block, before `isPolling=true`, no concurrent lock state to clobber) and instructs future maintainers to refactor to a targeted sproc if the call site ever moves out of that window.

**Generalization**: any engine code path that mutates a `ScheduledJob` row during normal polling MUST use a targeted UPDATE that excludes lock columns. The atomic sprocs for lock acquire/release are the source of truth; nothing else may write those four columns from engine code while polling is active.

### 8c. Startup permission probe (loud warn, not crash)

**Decision**: At the end of `StartPolling`'s upfront block, run a probe query against `sys.fn_my_permissions` to verify the engine's DB principal has `EXECUTE` on `spAcquireScheduledJobLock`. Log a warning if missing. Wrap in try/catch so the probe itself can't crash boot on non-SQL-Server providers.

**Alternatives considered**:
- **Skip the probe.** Rejected: a missing grant causes silent runtime failure the first time a job tries to dispatch. The original incident was painful precisely because the failure mode was opaque (jobs not running, no obvious reason). Boot-time failure is much better.
- **Crash boot if probe fails.** Rejected: too aggressive. Non-SQL-Server providers (future PG support, or test environments using mocks) would see the probe itself fail and crash boot. Warning + continue is the right balance.

**Trade-offs**:
- **SQL-Server-specific probe SQL.** Wrapped in try/catch with a log line noting probe was skipped. On other providers, the lack of grants would still fail silently at first dispatch — but those providers don't exist yet for this engine, and adding multi-provider probe SQL is premature.

---

## What this fix does NOT address

These are deliberately out of scope, with follow-up issues tracked:

1. **Heartbeat-based lease renewal.** The structural cure for residual starvation when ≥cap jobs hang simultaneously. Real design questions (heartbeat interval, plugin opt-in pattern, per-job `MaxRuntimeMinutes` overrides) deserve their own PR. Tunable lease (#5 above) is the pre-heartbeat operational lever.
2. **Plugin-side hang prevention.** Bounding `plugin.Execute()` in known long-running drivers — especially the agent-runner driver that triggered the Izzy incident (unbounded model-failover retry loop). Per-driver work, tracked separately.
3. **Auto job-list refresh.** DB-side trigger or table-version polling so the engine picks up runtime job changes without explicit `OnJobChanged`. Pre-existing limitation; this PR documents it but doesn't fix it.
4. **Worker thread isolation.** Would let us actually terminate hung plugins (instead of leaking their promises). Multi-week design effort; separate PR if/when needed.

---

## Residual risk bounds (honest)

This fix makes the scheduler robust to single-job hangs but does NOT eliminate all starvation scenarios. Specifically: if `≥ MaxConcurrentJobs` jobs hang simultaneously within a single lease window, other scheduled work is starved until at least one lease expires and the sweep reclaims its slot.

With defaults (`MaxConcurrentJobs=5`, `leaseTimeoutMinutes=10`), the worst-case starvation window is **~10 minutes** — dramatically improved from the original "stalled until process restart," but not zero. Sites with high hang risk should:

- **Raise `MaxConcurrentJobs`** — leave headroom for healthy jobs while zombies hold slots.
- **Shorten `LeaseTimeoutMinutes`** — accelerate reclaim, with the caveat that this must remain greater than the max legitimate job runtime.
- **Bound `plugin.Execute()` in their plugins** — the structural cure tracked as a follow-up issue.

Calling this out so a future incident report doesn't read "we shipped the fix and it didn't work" — it will work for the original failure mode (single hang) but will leave the residual window for the multi-hang case until heartbeats land.

---

## File touchpoints

- `migrations/v5/V<ts>__v5.39.x__Scheduling_Engine_Atomic_Lock_CAS.sql` — new migration; two sprocs, grants.
- `packages/Scheduling/engine/src/ScheduledJobEngine.ts` — core changes (sweep, dispatch, lock methods, config properties, poll loop, lifecycle).
- `packages/Config/src/...` — add `scheduling` namespace to MJConfig schema.
- `packages/MJServer/src/services/ScheduledJobsService.ts` (or equivalent) — wire config to engine; await new async `StartPolling`.
- `packages/Scheduling/engine/README.md` — new sections per the punch-list.
- `packages/Scheduling/engine/src/__tests__/ScheduledJobEngine.decoupling.test.ts` — new test file with the 19 tests.
- `.changeset/scheduled-job-poll-decoupling.md` — changeset.

See the punch-list (`plans/scheduled-job-engine-decoupling-punchlist.md`) for the concrete sequence and acceptance checks.
