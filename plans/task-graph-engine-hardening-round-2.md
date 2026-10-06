# Task Graph Engine Hardening — Round 2

## Technical Plan — Post-Merge Adversarial Review Findings

**Date**: August 2026
**Status**: Approved plan — ready for implementation
**Owner**: Task Graph / Workflow engine
**Baseline**: `next` as of PR #3745 (Phase 1 hardening, merged). All file:line references verified against merge commit `4d2398af1`; anchor by symbol name where lines drift.
**Predecessor**: [`task-graph-engine-hardening.md`](task-graph-engine-hardening.md) (Round 1). D1/D2 and the Phase 3 B-items catalogued there remain open and are NOT restated here.

---

## Executive Summary

A four-track adversarial review of the engine as merged — dispatcher core, graph algorithms, service/delivery layer, and the seams *between* the Round 1 fixes — reached two conclusions:

1. **Round 1 held.** Every Phase 1 fix was re-audited fresh and survived: the claim protocol's guarded writes, P1's confirm-then-cascade seed handling (verified by hand against diamonds, shared destinations, transitive and cross-group shapes), P2's hold mechanism, the continuation CAS, settle re-entrancy across crash points, and the Cancel redesign. The pairwise interactions between fixes were traced and are clean. Nothing regressed.

2. **The next ring of seams is real.** The review found a cluster of defects one layer out from Round 1's, several independently discovered by two or three tracks with matching file:line anchors, and the worst share Round 1's signature failure mode: **the graph looks fine while a run strands `Paused` forever, or wrong work executes under a clean verdict — silently.**

The findings were adversarially verified by the reviewing agent against source before this plan was written; each item below carries its verification status. Ordering follows Round 1's doctrine: silent-wrong-outcome fixes first, each landing in the same commit as the test that fails without it.

**The four headline defects:**

- **R2-1** — a crashed prompt task is invisible to claim reclamation: the graph wedges `In Progress` forever with zero diagnostics.
- **R2-2** — the settlement rescue sweep keys on the delivery marker, but the marker is claimed at the end of a pass whose earlier steps (cost rollup, run settlement) swallow their own failures — one transient soft failure and the run is `Paused` permanently, unreachable by any sweep. Includes the sharpest variant: a graph that settles before its submitting run has parked `Paused` at all.
- **R2-3** — P2's hold classifies routine *data absence* (a condition dereferencing the null output of a step that produced nothing — including every Skipped origin) as "unevaluable", producing permanent holds on graphs both the legacy walker and the pre-P2 dispatcher ran to completion.
- **R2-4** — `Failed` origins resolve exclusive groups even under `failureSemantics: 'block'`, so a failed step's losing branches become `Skipped`, `Skipped` satisfies dependents, and work downstream of an unhandled failure executes.

---

## Phase A — Silent-wrong-outcome fixes

> One PR for the round is fine; keep fixes in separate commits, each with the regression test that fails without it.

### R2-1. Claim reclamation must cover prompt tasks

**Severity: HIGH. Verified: CONFIRMED (reviewing agent read the predicates).**

**Defect.** `ReleaseExpiredClaims` and `FindOrphanedInProgress` both scope to `(AgentID IS NOT NULL OR ActionID IS NOT NULL)` (`packages/TaskGraph/src/TaskClaimStore.ts:219, 234, 265`). That predicate is the *human-task exemption*, written before the `PromptID` column existed. A Prompt step — and a ForEach/While with a prompt body — carries `PromptID` with both `AgentID` and `ActionID` NULL (`TaskGraphService.persistChildren:861-873`) yet is claimed normally by `TryClaim` (`findClaimableTasks:1565-1572` routes it to the prompt runner).

**Failure scenario.** Dispatcher claims a Prompt task (`Status='In Progress'`, claim set); process crashes. The claim expires; both reclamation statements exclude the row; `TryClaim` cannot retake it (`Status='Pending'` required); `FindOrphanedInProgress` won't even report it. Graph `In Progress` forever, submitting run `Paused` forever, `IsGraphStalled` false (an In Progress node counts as active) — **zero diagnostic output anywhere**.

**Fix specification.** Express the exemption as what it means, not as a column pair that happened to be co-extensive with it once: exempt on `UserID IS NOT NULL` (human-assigned), or include on `PromptID IS NOT NULL` alongside the existing pair. Audit every other site that uses the AgentID/ActionID pair as a "machine task" proxy (at minimum the settle/expiry filters B4 already catalogues) and route them through one shared predicate helper so the next runner column cannot re-open this hole.

**Tests.** IT74 extension (TX12): claim a prompt task with a stub prompt runner, strip the heartbeat, expire the claim, assert reclamation returns it to `Pending` and a second dispatcher completes the graph. Unit test on the claim-store SQL predicate against all four task shapes (agent/action/prompt/human).

### R2-2. The delivery marker must not be the settle sequence's only re-entry key

**Severity: HIGH. Verified: CONFIRMED. Found independently by two tracks.**

**Defect.** The settle sequence is rollup → `settleSubmittingRun` → `deliverContinuation` (`packages/TaskGraph/src/TaskGraphDispatcher.ts:834-842`), each step swallowing its own failures by design ("cost and lifecycle are separate concerns with separate failure modes"). But the rescue sweep's re-entry predicate is solely the continuation marker (`settlement-rescue.ts:65-73` — `continuationDeliveredAt` unset). The marker is claimed unconditionally at the end of the same pass. So P3's re-entrancy covers a **crash** between steps, but a **soft failure** in an earlier step on a pass where the CAS succeeds is permanent:

1. **Run not yet `Paused`.** `BaseAgent` parks the run `Paused` only in `finalizeAgentRun` (`packages/AI/Agents/src/base-agent.ts:13482,13508`), *after* the graph is durable and dispatchable. A fast-settling graph hits `settleSubmittingRun`'s guard `if (run.Status !== 'Paused') return;` (`TaskGraphDispatcher.ts:2598`) → silent return → marker claimed → the run parks `Paused` moments later and **stays there forever**. Adjacent corruption: finalize's full-row `Save()` then overwrites the rollup columns the dispatcher just wrote with stale in-memory nulls.
2. **`run.Save()` returns false** in `settleSubmittingRun` (`:2612-2620` — the log implies a retry that will never come).
3. **Transient `LoadAgentRunTree` failure** in the rollup (`:910-920`) → rollup refused → delivery still claims the marker → the cost figure is never recomputed, contradicting Round 1's own P3 test promise.

**Fix specification.** Two coupled changes, both needed:

- **Gate the marker on the pass's actual outcome.** `deliverContinuation` must not claim the CAS unless the same pass verifiably completed run settlement (and the rollup either landed or was refused for a *permanent* reason). Simplest shape: `settleSubmittingRun` returns a verdict (`settled` / `not-yet-parked` / `failed`); anything but `settled` skips delivery this pass, leaving the marker unset so the rescue sweep re-enters. The `not-yet-parked` case then resolves naturally one poll later, once finalize has parked the run.
- **Widen the rescue predicate or accept bounded re-delivery risk consciously.** If the marker stays delivery-only, the sweep must additionally select graphs whose submitting run is still `Paused` past settlement (a targeted second predicate), or the verdict-gating above must be airtight. Decide once, in the commit message.
- **The finalize-overwrite race** (scenario 1's bonus): the rollup write and finalize's full-row save race in both orders. Either finalize must exclude the rollup columns it does not own (column-scoped save, the R2 Round-1 pattern), or the dispatcher's rollup must be guarded against a not-yet-finalized run (it already has the `Paused` guard for lifecycle — extend the same discipline to cost).

**Tests.** IT74 extensions: (TX13) settle a graph whose submitting run is still `Running`, assert no marker claim, park the run, assert next pass settles + delivers exactly once; (TX14) inject one `Save()` failure into run settlement, assert the marker is not claimed and the following pass completes settlement and delivery. Unit tests on the verdict plumbing.

### R2-3. Data absence is not a broken guard: fix the unevaluable classification

**Severity: HIGH. Verified: CONFIRMED. Found independently by two tracks; the Skipped-origin variant is the sharpest.**

**Defect.** `BuildConditionContext` maps a null/absent origin output to `payload = null` (`packages/TaskGraph/src/condition-gate.ts:77-94`), so any condition dereferencing it (`payload.approved === true` — the documented dialect) throws, and `DecideGate` converts every throw to `'hold'` (`:114-120`); `ResolveExclusiveGroups` holds the *entire group* on any unevaluable member (`graph-algorithms.ts:551-553`). A hold on a terminal origin can never resolve — the output is frozen and the same evaluation repeats forever. Routine producers of exactly this state:

- **A Skipped origin.** `Skipped` ∈ `TERMINAL_FOR_CONDITIONS` (`condition-gate.ts:47-52`), so conditions on edges out of a not-taken branch ARE evaluated — against output that cannot exist. Fork `A→B / A→C(skipped)`, join `D` with `C→D` carrying `payload.retry === false`: D holds forever. The legacy walker never evaluated that edge (its program counter never stood at C) and ran D; the pre-P2 dispatcher also ran D.
- A **Complete** origin with no `OutputPayload` (an action that returns nothing; a human approval with no `ResponseData` — `TaskGraphDispatcher.ts:1751` writes `ResponseData ?? null`).
- A **Failed** origin that died before producing output, under `failureSemantics:'edges'`.

Since Q1 now refuses syntax errors at the door, the hold mechanism fires in production almost *exclusively* on this class — conditions their authors meant as "false". P2's HOLD rule is correct; the classification boundary is wrong.

**Fix specification.** Draw the boundary at "the guard is broken" vs "the data answered no":

- Evaluate conditions against a **null-safe envelope**: when the origin produced no output, `payload`/`output`/`stepResult.result` should be values a property access survives (e.g. `payload` as `null` is the bug — property access on a dedicated empty-ish value, or pre-flighting "condition references payload && payload is null → verdict false" both work; pick the one that keeps flow-dialect parity, since the legacy engine's `payload.x` on undefined was "simply falsy" per this file's own header comment).
- A TypeError arising from **data absence** (root value null/undefined) is a `false` verdict, not `hold`. A ReferenceError (unknown root — the guard references a name outside the envelope) remains `hold`: that IS a broken guard. This preserves P2's contract — "a condition that fails to evaluate does not open the gate" — while ending the permanent stall for conditions the data simply answered.
- **Skipped origins**: decide explicitly whether edges out of a Skipped origin should be evaluated at all (walker semantics: no — the branch was not taken; its outgoing conditional edges should drop, not hold). Reconcile with the exclusive-group dialect (see R2-8) so both engines say the same thing.
- **Two adjacent refinements, same commit series** (both verified):
  - *Dominated unevaluable edges* (`graph-algorithms.ts:551-553`): hold a group only if an unevaluable edge could beat the best satisfied edge (higher priority, or equal priority + lower sequence). A strictly-dominated unevaluable edge must not stall a decided fork.
  - *The door should refuse unknown roots* (`task-graph-validator.ts:40-47` vs the closed envelope in `condition-gate.ts:77-94`): the runtime scope is a fixed set defined in code the validator can consume. An unknown *root* identifier is decidable at submit time and currently guarantees the silent-permanent-hold Q1 exists to end. Unknown *properties* stay runtime-decided.

**Tests.** Unit: the full classification matrix (null output × each dialect root × TypeError vs ReferenceError). Differential fixtures: the Skipped-origin join (walker runs D; dispatcher must too), the null-output else-branch fork. IT74 extension (TX15): a live graph with a no-output action feeding a conditional edge, asserting completion rather than stall. The differential simulator models conditions as `CONTEXT[cond] === false` and cannot express "throws on null envelope" — extend it first or the fixtures are blind.

### R2-4. `failureSemantics: 'block'` must gate exclusive-group resolution

**Severity: HIGH (block semantics is the spec default). Verified: CONFIRMED — the set is hardcoded; severity per the spec's own contract.**

**Defect.** The dispatcher passes `terminalDecides = new Set(['Complete','Failed'])` unconditionally (`TaskGraphDispatcher.ts:1967-1969`); the comment claims loop-agent graphs see Complete-only, which is false — the same set is passed for every graph. Under `'block'` (the spec default), a Failed origin resolves its exclusive group: losers are removed and seeded, `ComputeSkipCascade` confirms them `Skipped`, `Skipped` satisfies dependents, and — because the removed loser edges also sever `ComputeTasksToBlock`'s forward walk — a join fed by an independent healthy route **executes downstream of an unhandled failure**. The parent still rolls up Failed, but the join's side effects have fired: silent wrong execution under the failure verdict. The spec calls this direction "severe" (`task-graph-spec.ts:221-233`).

**Fix specification.** Thread the graph's `failureSemantics` into the resolution call: under `'edges'`, Failed decides (a flow's failure handling IS its outgoing edges); under `'block'`, Failed does not decide — the group stays unresolved and the ordinary block cascade owns everything downstream. Fix the comment. This is a two-line change plus the wiring; the risk is entirely in the tests.

**Tests.** Unit on `ResolveExclusiveGroups` with a Failed origin under each semantics value. Differential fixture: the `E→F(fails)` / exclusive `(succeeded)→W, (failed)→R` / join `D` shape under `'block'` — D must block, not run. Fixture under `'edges'` asserting current behavior is preserved (the failure-handling dialect must keep working).

---

## Phase B — Correctness fixes, bounded blast radius

### R2-5. Deterministic winner tiebreak in exclusive groups

**Verified: CONFIRMED** — `graph-algorithms.ts:562-564` sorts `priority desc || sequence asc` with no final key; deps load with no `ORDER BY` (`TaskGraphDispatcher.ts:1921-1925`); `Submit` persists `?? 0` defaults. Round 1's invariants list claims a priority-then-edge-ID tiebreak that the runtime does not implement. On the *compiled flow* path the compiler assigns distinct sequences, so determinism holds there — the exposure is hand/LLM-authored specs, where a (0,0) tie resolves by row order and can flip between polls. Worst interleaving: poll 1 picks winner X→B, skips C; poll 2's row order flips, picks Y→C (already Skipped), skips B → **both XOR branches Skipped, graph settles Complete having executed neither**.

**Fix**: `|| a.id.localeCompare(b.id)` as the final sort key; correct the Round 1 invariants note. Unit test: tied group resolves identically under both input orders.

### R2-6. Delivery capability must gate the continuation CAS

**Verified: CONFIRMED — found independently by two tracks.** `claimContinuation` runs before the `if (!this.continuationDeliverer) return;` check (`TaskGraphDispatcher.ts:1193` vs `:1209`). A dispatcher constructed without a deliverer (worker tier, IT bundle, a second dev session) that observes the settlement first wins the CAS, marks `delivered`, and discards the delivery a capable peer would have made — permanently, by poll-timing coin flip.

**Fix**: a deliverer-less instance must not claim the marker for `mode !== 'none'` graphs (still settles the run and rolls cost; leaves delivery to a capable peer via the rescue sweep). The `expired` claim may remain capability-independent — recording "too old to deliver" requires no deliverer. IT74 extension (TX16): deliverer-less + deliverer-ful dispatchers racing a settlement; assert the message is always delivered exactly once regardless of who settles.

### R2-7. `AI Workflow` task-type identity must be unique and deterministic

**Verified: schema fact CONFIRMED by two tracks against `migrations/v2/V202509171543__v2.101.x__Schema.sql:210-215`** — no unique constraint on `TaskType.Name`. `ensureTaskType` is SELECT-then-INSERT with no guard (`TaskGraphService.ts:755-771`); both it and the dispatcher's `workflowTaskTypeID` resolve `MaxRows: 1` with **no ORDER BY** and cache per process. Two concurrent first-ever submissions can mint two rows; thereafter different processes can bind different IDs, and a graph stamped with the other ID is invisible to every sweep arm and refused by both TypeID-scoped payload guards — never claimed, never settled, run `Paused` forever, zero errors. R2-2 (Round 1) turned this discriminator into a correctness dependency; its identity must now actually be singular.

**Fix**: migration adding a unique index on `TaskType.Name` (mind the Publish-No-Break policy — additive constraint; verify no dup rows exist first, with a defensive de-dup step); make `ensureTaskType` race-safe (insert-then-reselect on violation, or app-level advisory retry); add `ORDER BY` + log-if-multiple to both resolvers as defense in depth. **This is the round's only migration.**

### R2-8. Skipped-origin exclusive groups: never run a guarded branch with its guard unread

**Verified: mechanism confirmed (`graph-algorithms.ts:546-549` — `Skipped` ∉ `terminalDecides`, so the group never resolves and all its edges stay live; `Skipped` satisfies prerequisites).** A fork on a task that itself gets skipped leaves both branch targets with live edges satisfied by the Skipped origin; whichever target has its *other* prerequisites healthy runs — chosen by graph accident, its condition never consulted. Ordinary conditional edges from the same origin ARE evaluated (`TERMINAL_FOR_CONDITIONS` includes Skipped) — two dialects, and the exclusive one bypasses the guard.

**Fix**: resolve together with R2-3's Skipped-origin decision. Walker semantics say a not-taken step's outgoing edges are not followed: an exclusive group whose origin is Skipped should resolve to *all losers* (every branch target becomes a cascade candidate; join survival already protects targets with live routes). That also makes the ordinary/exclusive dialects agree. Differential fixture required — this is exactly the shape the walker decides differently today.

### R2-9. `Cancel` must be honest and must reach what the workflow started

**Verified: code confirmed (`TaskGraphService.ts:527-533, 557` — child `Save()` failures logged, `return true` unconditional; `:524` — direct children only, sub-graphs persist as roots linked via `AgentRunID`).** Two defects, one method:

1. **False success**: one failed child cancellation leaves the child `Pending`, the caller sees success, the dispatcher later runs the child, and the workflow can settle `Complete` — then *announce completion into the conversation of a workflow the user cancelled*. Fix: `Cancel` returns a verdict reflecting reality (all-cancelled / partial with names); a partial cancel leaves the graph active and is retryable; the UI-facing message says what remains.
2. **Nested graphs**: a cancelled workflow's sub-graph keeps executing, and on settlement can *reinvoke the cancelled workflow's own agent for a fresh billed turn*. Fix: on cancel, follow the linkage (child task's `AgentRunID` → runs → graphs those runs submitted) one level down and cancel those graphs too, iteratively; and `settleSubmittingRun`/`deliverContinuation` must treat a `Cancelled` submitting run as "nobody waiting" (no reinvoke). The linkage exists; the walk is bounded by the reinvoke depth cap.

**Tests**: unit for the verdict; IT74 extension (TX17) for the nested-graph cancel with a stub agent runner asserting no post-cancel reinvoke.

### R2-10. `endGraphEarly` must close what it skips, after ownership is confirmed

**Verified: confirmed by two tracks (`TaskGraphDispatcher.ts:1042-1055`).** Two defects:

1. **Zombie human requests**: early-finish skips a notified human task without withdrawing its open `MJ: AI Agent Requests` row (unlike `Cancel`, which calls `cancelOpenRequests`). The request is un-answerable and immortal — `settleAnsweredHumanTasks` and `expireOverdueRequests` both filter on `Status='Pending'` tasks. Fix: withdraw open requests for every task `endGraphEarly` skips (reuse `cancelOpenRequests`). Same treatment for the condition-cut skip path (`:701-722`) if it can skip a notified human task — audit it.
2. **Skips before ownership**: sibling-skips run before `CompleteClaimed` confirms the claim (`:614-616`). A lapsed claim means the skips landed but the completion is refused; the task re-runs elsewhere, and this time may not end early — but the siblings are already terminally Skipped and satisfy dependents. Fix: confirm `CompleteClaimed` first; only the confirmed owner mutates graph state. (The claim-filter role of the early-finish decision needs no pre-write — the siblings are Pending and unclaimed until the skip lands.)
3. (LOW, same function) A transient `workflowTaskTypeID` failure silently drops the early-finish message (`:1061-1066`) — retry or surface it.

### R2-11. Settlement must not be gated on claim capacity

**Verified: confirmed (`TaskGraphDispatcher.ts:532-533`).** `pollOnce` returns at `capacity <= 0` *before* `propagateAndRollup`, so five wedged long-running tasks (B1's accepted per-task hang) freeze **all** settlement, skip/block propagation, human-task settlement, and continuation delivery for the entire instance — B1's accepted blast radius ("that graph hangs") silently widened to "everything hangs". Fix: run the propagate/settle phase unconditionally; only claiming consumes capacity. One reordering; the test is a unit test with a full claim table asserting settlement still occurs.

### R2-12. The steady-state rescue window must not silently age out a failing settlement

**Verified: confirmed** — on a rescue pass where every step no-ops or fails (`TrySettleParent` rowcount 0, layout children-only, refused CAS writes nothing), the parent row's `__mj_UpdatedAt` never advances, so after 24h of futile retries the graph exits the sweep window (`settlement-rescue.ts:41-49`) while the process is up — rescued only by a restart within 30 days. The comment claims the bound is "on abandonment, not age"; it is on age. Adjacent (same mechanism, opposite sign): a permanently-unreadable payload graph re-runs the full settled branch — `GraphSettled` frame, layout pass, full `LoadAgentRunTree` query — every 5s for the whole window.

**Fix**: make a failed settle attempt renew the graph's presence in the window explicitly (e.g. the sweep tracks failed-settle graph IDs in memory with its own retry clock, or a lightweight touch column write on attempt) — pick the one that doesn't reintroduce full-row saves; and de-duplicate the per-pass side effects for graphs already known-settled (emit the frame and run the cost query once per process, not per poll).

### R2-13. `Stop()` must cover everything that writes

**Verified: confirmed** — three gaps, one drain:

1. The **startup sweep** runs outside `activePasses` (`Start()` registers with `ShutdownRegistry` at `:420`, then awaits `sweepUnsettledGraphs` at `:428`, which never increments the counter `:1381-1391`) — a shutdown during it returns from `Stop()` immediately while the sweep goes on settling graphs and starting reinvoke turns. Fix: count the sweep as a pass.
2. The **claim loop never re-checks `running`** (`:552-561`): a `Stop()` landing during the (potentially seconds-long) `findClaimableTasks` scan still claims and launches every candidate. Fix: check `running` per iteration, before `TryClaim`.
3. The timeout log's promise "their claims will expire" (`:472`) is **false while the process lives** — per-task heartbeats are never stopped, so an over-drain task's claim renews indefinitely. Fix: stop heartbeats for in-flight tasks when the drain expires (the guarded completion write still protects the result), or correct the log and accept the behavior consciously.

### R2-14. Cross-instance claim window on cascade descendants

**Verified: mechanism confirmed; window is real but narrow (pre-dates Phase 1).** The claim filter covers seeds/holds/unreachable but not **cascade descendants** (`:1539-1548`), and skip writes are sequential per-entity saves (`:696-722`). Between the seed's `Skipped` landing and its descendants', a second instance's fresh load sees `Skipped`-satisfies → descendants eligible → claims and executes a branch that was never taken. Sharpest variant: the skipped task carries its own exclusive fork — undecidable per R2-8, both targets eligible. Fix: include the cascade's computed output in the claim filter (it is already computed in the same pass), and/or have `TryClaim` re-verify eligibility against committed state. Note R2-8's fix removes the sharpest variant independently.

### R2-15. `clearStaleRollup` must not erase a concurrent instance's fresh rollup

**Verified: interleaving confirmed possible.** Instance B's transient `LoadAgentRunTree` failure (`:910-918`) triggers `clearStaleRollup` (`:983-1009`), which can null the four rollup columns instance A wrote moments earlier; the claimed marker then prevents any recomputation. Fix: guard the clear the same way the Round-1 parent writes are guarded — clear only if the rollup columns still hold the pre-settlement values it read (optimistic condition in the WHERE), or simply don't clear on *transient* failure (only on the "tree loaded, sums disagree" path where staleness is proven).

---

## Phase C — Small fixes and polish (land opportunistically with Phase A/B commits)

| # | Item | Anchor | Verified |
|---|---|---|---|
| C1 | `resolveOwner` caches `null` forever after one transient load failure — frames for that run are never delivered until restart | `TaskGraphDispatcher.ts:393-403` | certain (track A) |
| C2 | Reinvoke-cap downgrade flips `continuation:'none'` to `'message'` — latent until any producer bypasses `Submit`'s depth check | `:1175` | certain (track A) |
| C3 | `Reinvoke` swallows a thrown `RunAgent` without the `PostMessage` fallback its two load-failure paths already use | `TaskGraphContinuationDeliverer.ts:137-139` | certain (track C) |
| C4 | `loadChildren` (Cancel/Retry reads) lacks `BypassCache` while the dispatcher documents claim-protocol SQL fires no invalidation | `TaskGraphService.ts:976-982` | needs-verification (cache behavior) |
| C5 | The `TaskGraph.Submit` remote operation drops `AgentRunID`/`ReinvokeDepth` — agent callers via MCP silently lose rollup + reinvoke | `operations/TaskGraphOperations.ts:60-72` | certain; may be by design — decide and document |
| C6 | Validator requires `itemVariable` for ForEach that the executor defaults — compiled legacy flows refused at Submit | `task-graph-validator.ts:97-107` vs `TaskLoopExecutor.ts:110` | certain; check flow-editor enforcement |
| C7 | Q1 refusal messages name steps by `tempId` = UUID on the flow path — illegible exactly where D18 matters | `task-graph-validator.ts:66-73` (use `task.name`) | certain |
| C8 | `task-graph-spec.ts:44-49` documents `Optional` as an OR-join; `isGatingEdge` treats it as not gating at all — all-Optional nodes run at wave 1 | `graph-algorithms.ts:385-388` | certain (doc/impl mismatch — fix the doc or the semantics, decide once) |
| C9 | Exotic `exclusiveGroup` + `Optional` edge lets a target be skipped while its group is undecided | `graph-algorithms.ts:620` | needs-verification |

---

## Carried forward from Round 1 (unchanged, listed for continuity)

- **D1** (execution identity) and **D2** (run-context threading) — design notes before code; several Round 2 items (R2-9's cancelled-run semantics) touch their edges without deciding them.
- **B-items** per the Round 1 plan, including B1 (no timeout for a live-but-wedged runner — R2-11 removes its *instance-wide* amplification but not the per-task hang), B4 (NULL-StepType human-task predicates — R2-1's shared-predicate helper is the natural place), B7 (stall-detector gaps).
- **CI does not set `RUN_MUTATION_TESTS`** — IT74 has never run in CI; either set it for the deterministic tier or make a fully-gated-out bundle louder than a pass.
- **Dispatcher heartbeat/observability** — a heartbeat row per live instance; pairs with D1.

## Invariants to preserve (verified-solid in this review — do not regress)

- The claim protocol's single-statement guards and rowcount verdicts (`TryClaim`/`Heartbeat`/`CompleteClaimed`), and the continuation CAS's predicate-under-lock semantics.
- The column-scoped parent writes (`TrySettleParent`/`TryUpdateParentProgress`/`TryStampParentStart`/`TrySetParentOutput`) and their loser-defers reactions.
- P1's confirm-then-cascade architecture: seeds as claim-filter-only until `ComputeSkipCascade` confirms; `keptTargets` across the whole resolution; entry points never cascade-skipped.
- P2's thunk-based terminality guard in `DecideGate` (an undecided origin is never asked) — R2-3 changes what a *throw* means, not when evaluation happens.
- `ComputeParentRollup` precedence and the settled-branch ordering (layout → frame → rollup → run → delivery) — R2-2 adds verdict gating, it does not reorder.
- Submit's single-transaction persist, TypeID stamping, and validator front-door; the metadata bag's two-writer discipline (`persistParent` + `JSON_MODIFY` claims only).
- `Skipped` satisfies prerequisites (R6) — R2-4/R2-8 change *when things become Skipped*, never what Skipped means downstream.
- The `Stop()` drain's pass-counting design — R2-13 extends its coverage, not its mechanism.

## Test plan

1. **Every Phase A/B fix lands with the test that fails without it** (Round 1 discipline). New IT74 checks: TX12 (prompt-claim reclamation), TX13/14 (marker gating under not-yet-parked and failed-save), TX15 (null-output condition completes), TX16 (mixed-capability delivery race), TX17 (nested-graph cancel, no post-cancel reinvoke).
2. **Differential fixtures**: Skipped-origin join (R2-3/R2-8), failed-origin exclusive group under both semantics (R2-4), tied-priority determinism (R2-5). Extend the simulator to express null-output envelopes first — it currently cannot represent the R2-3 class at all.
3. **Unit**: claim-store predicate matrix (R2-1), settle-verdict plumbing (R2-2), classification matrix (R2-3), `terminalDecides` wiring (R2-4), `Cancel` verdicts (R2-9).
4. IT74 still requires database exclusivity; the contention self-diagnosis from Round 1 stands.

Definition of done per repo standard: affected packages' unit tests pass, and `pnpm run test:integration` (deterministic tier) passes including the new TX checks.
