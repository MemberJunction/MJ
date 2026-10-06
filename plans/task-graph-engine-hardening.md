# Task Graph Engine Hardening

## Technical Plan — Post-Audit Punch List

**Date**: August 2026
**Status**: Approved plan — ready for implementation
**Owner**: Task Graph / Workflow engine
**Baseline**: `next` as of PR #3723 (workflow cost rollup + HITL gaps) and #3743. All file:line references were verified against that baseline; anchor by symbol name where lines have drifted.

---

## Executive Summary

A four-track adversarial audit of the execution engine (dispatcher core, graph algorithms, server runners + HITL/continuation, flow-agent cutover) reached a consistent verdict: **the foundation is genuinely solid** — the claim protocol, the pure graph algorithms, the HITL lifecycle, and the cost rollup are well-built, well-argued, and (uniquely for this class of engine) proven live by IT74's racing-dispatcher and orphan-reclaim checks.

What remains is a cluster of defects at the **seams between the well-built layers** — where conditions meet eligibility, where the graph hands back to the submitting run, and where two dispatcher instances meet the same settled graph. Three independent review tracks converged on the same top findings, and every high-severity one shares the same failure mode: **the run looks Complete while the wrong work happened**. No error, no stall, no signal. That is the worst possible failure mode for a workflow product, and it is exactly the trust the UX layer is currently being polished to sell.

This plan is ordered accordingly:

- **Phase 1 — Correctness seam fixes (P1–P4).** Small, sharply-scoped fixes to silent-wrong-execution and silent-lost-settlement bugs. Each lands with the regression fixture that currently cannot see it. No design decisions required; do these first.
- **Phase 2 — Design decisions (D1–D3).** Execution identity, run-context threading, and sweep scoping. Real gaps, but each has more than one defensible answer; each gets a short design note in the PR before code.
- **Phase 3 — Hardening backlog (B1–B10).** Lower-urgency items: dead policy columns, Save-as-Workflow loop fidelity, retry-after-settlement, encoding, dialect, observability.

**What must not regress**: the audit also produced a verified-solid list (§Invariants to Preserve). Phase 1 changes sit adjacent to that machinery; every invariant listed there is load-bearing and several were themselves hard-won fixes. Read that section before touching `graph-algorithms.ts` or `TaskGraphDispatcher.ts`.

---

## Phase 1 — Correctness seam fixes

> One PR for the phase is fine, but keep the four fixes in separate commits: each is independently revertable and independently testable. **Each fix must land in the same commit as the test that fails without it.**

### P1. Exclusive-loser skip seeds must respect surviving routes

**Severity: HIGH. Found independently by three review tracks.**

**Defect.** `ResolveExclusiveGroups` (`packages/AI/CorePlus/src/task-graph/graph-algorithms.ts:516-528`) pushes every losing edge's *target* into `skipSeedTaskIDs` unconditionally. The dispatcher persists every seed as `Skipped` directly (`packages/TaskGraph/src/TaskGraphDispatcher.ts:613-621`) and filters seeds out of claiming (`:1296`) — without the "does another live route reach it?" test that ordinary dropped edges get (`stillReachable`, `TaskGraphDispatcher.ts:1747-1749`) and that `ComputeSkipCascade` itself promises for joins ("a join that is also reachable from the winning branch therefore survives", `graph-algorithms.ts:380-387`).

**Failure scenarios (both must become fixtures):**

1. *Skip-a-step diamond*: `A →(cond)→ Review → Publish`, `A →(else)→ Publish`. Condition true → loser edge `A→Publish` seeds **Publish** as Skipped while Review is still running. Review completes; Publish is already terminal; `Skipped` satisfies dependents; the graph settles **Complete with the publish step never executed**.
2. *Two conditions, one destination*: `A →(c1)→ B`, `A →(c2)→ B` in one exclusive group (`AIAgentStepPath` has no Origin+Destination unique constraint, so this is drawable). One edge wins, the other loses — **B is simultaneously the winner's target and a skip seed**, and is skipped 100% of the time. The legacy walker ran B.

**Fix specification.** The invariant the dispatcher already states for ordinary edges is the correct one and must gate exclusive losers too: *a task may be marked Skipped only when every route into it has been cut.* Concretely:

- A loser edge's target is **not** a seed if any kept/winning edge in the same resolution targets the same task (scenario 2 — trivially cheap check inside `ResolveExclusiveGroups`).
- A seed is **not** persisted as Skipped if a live route (edges not dropped, origins not terminal-failed/skipped) still reaches it from the winning side (scenario 1). Prefer implementing this as: seeds feed `ComputeSkipCascade` as *candidates*, and only the cascade's output — which already implements join survival — is persisted. The direct `Skipped` write of raw seeds at `TaskGraphDispatcher.ts:613-621` is the bug's delivery mechanism; raw seeds should keep only their *claim-filter* role (preventing the claim-window race) until the cascade confirms them.
- The claim-filter behavior at `:1293-1297` must be preserved exactly — it closes a real race (decided-loser claimed before the skip write lands). A target held out of claiming that the cascade later confirms reachable must become claimable again on a subsequent pass; assert this in the fixture (Publish runs *after* Review completes, not never).

**Tests.**
- `flow-differential.test.ts`: two new fixtures for the scenarios above. Note the differential simulator's synthetic edge ID `` `${dependsOn}->${task}` `` collapses parallel same-destination edges — fix the fixture edge identity first or scenario 2 is invisible to the oracle.
- `graph-algorithms-skipped.test.ts`: unit tests on `ResolveExclusiveGroups` with (a) two same-group edges sharing a target, (b) a loser targeting a node with a live route from the winner.
- IT74 extension (see §Test Plan): the diamond shape run live, asserting Publish's start time is after Review's completion.

### P2. An unevaluable condition must never satisfy a prerequisite

**Severity: HIGH. Found independently by three review tracks.**

**Defect.** `evaluateEdgeCondition` (`packages/TaskGraph/src/TaskGraphDispatcher.ts:1799-1807`) returns `'keep'` when a condition fails to evaluate (typo, TypeError, syntax error). The accompanying comment claims keeping the edge "stalls the graph visibly." That holds only while the origin is non-terminal — conditions are only evaluated once the origin is terminal (terminality guard, `:1789`), and a kept edge from a `Complete` origin **is a satisfied prerequisite** (`SATISFIES_DEPENDENT`, `graph-algorithms.ts:61-64`). So a broken guard **executes the work it was guarding**, irreversibly if that work is an action with side effects. The layer's own contract says the opposite: "A condition that fails to evaluate does NOT open the gate" (`task-graph-spec.ts:38-43`). The legacy in-run walker refused to follow such an edge (`ConditionError`, `graph-traversal-engine.ts:190-198`); exclusive groups already HOLD on unevaluable (`graph-algorithms.ts:511-514`). Ordinary edges are the one dialect with inverted failure semantics.

**Fix specification.**
- An unevaluable condition on an ordinary edge whose origin is terminal puts the edge in an **undecided** state: the target is neither eligible (edge does not satisfy) nor skipped (edge is not dropped — the target may have other live routes). Reuse the HOLD mechanism the exclusive path already has (`holdTaskIDs`) rather than inventing a parallel one.
- Held-forever must be *visible*: this is coupled to B7 (`IsGraphStalled` hold-awareness). At minimum, the dispatcher must log the failing condition text and task IDs **once per transition** (not once per poll), and the stall detector must count held targets as stalled work.
- Validator front-door: `ValidateTaskGraphSpec` (`packages/AI/CorePlus/src/task-graph/task-graph-validator.ts`) must syntax-check dependency `condition` strings at submit time, exactly as `ValidateWorkflowSpec` already parse-checks trigger filters (`workflow-spec-validator.ts:101-116`). A typo'd condition should be refused at the door in workflow vocabulary, making the runtime HOLD a defense in depth, not the primary UX.

**Tests.**
- Differential fixture: a single conditioned edge (no fork — a single successor compiles to *no* exclusive group per `flow-graph-compiler.ts:274-279`) with an unevaluable expression; assert the guarded step does **not** run. **Warning:** the current simulator (`flow-differential.test.ts:228`, `CONTEXT[d.condition] === false` for ordinary edges) reproduces the production bug rather than testing against it — fix the oracle to model unevaluable-as-undecided in the same commit.
- Validator unit tests: syntax-error conditions rejected at submit with all-errors-at-once reporting preserved.
- Unit test on the dispatcher's evaluation path: terminal origin + unevaluable → target not in eligible set, not in skip set, present in hold set.

### P3. Graph settlement must be recoverable — crash, transient failure, and Cancel

**Severity: HIGH. Two review tracks converged (crash-window and Cancel variants of the same root cause).**

**Defect.** The one-shot post-settlement sequence — `rollUpCostToSubmittingRun`, `settleSubmittingRun`, `deliverContinuation` — runs *after* `parent.Save()` writes the terminal status (`packages/TaskGraph/src/TaskGraphDispatcher.ts:693-723`), and a terminal parent with all-terminal children matches neither query in `findActiveGraphIDs` (`:1221-1262`), so no future pass ever revisits the graph. The doc comment on `continuationDeliveredAt` (`TaskGraphService.ts:99-104`) promises "a crash between 'graph complete' and 'continuation delivered' leaves this unset, so the next sweep retries" — **that sweep was never built**. Three distinct entry points hit the same hole:

1. *Crash/transient failure in the window*: process dies (or `claimContinuation`'s `Load` transiently fails, `:1121`) after the parent's terminal save → the submitting agent run stays **`Paused` forever** (BaseAgent parks it at submission, `base-agent.ts` ≈`:13481`; the watchdog deliberately sweeps only `Running`, `agent-run-watchdog.ts:59`), no cost rollup, no user notification.
2. *Cancel*: `TaskGraphService.Cancel` (`TaskGraphService.ts:507-536`) marks children then parent terminal directly, outside the dispatcher — the settle path never fires at all, with the same stranded-run outcome. Worse, it's nondeterministic: if a dispatcher poll lands between the child-cancels and the parent-cancel, the graph settles normally and the run *is* failed + messaged. Cancel behaves differently run to run.
3. *Transient rollup failure*: `rollUpCostToSubmittingRun` (`:766-847`) runs once per settlement; a transient `LoadAgentRunTree` failure at that instant loses the rollup permanently.

**Fix specification.**
- Add a third arm to `findActiveGraphIDs`: parents that are **terminal but unsettled** — terminal status with `continuationDeliveredAt` unset in parsed parent metadata. Because that marker lives inside `InputPayload` JSON (not a column), either (a) promote a queryable settlement marker, or (b) bound the sweep: terminal parents within a recency window (e.g. `__mj_UpdatedAt` within 24h) are re-parsed and re-settled if undelivered. Option (a) is cleaner; option (b) is acceptable if (a) requires a migration the phase wants to avoid — state the choice in the PR.
- Make the whole settle sequence **idempotent and re-entrant**, in this order: rollup (already idempotent — assignment, not accumulation), run settlement (already guarded on `Paused`), continuation (guarded by P4's real CAS). Then a revisit is always safe.
- `Cancel` stops writing the parent's terminal status directly. It cancels children and withdraws open requests (both already correct), then leaves the parent for the dispatcher's normal `propagateAndRollup` → settle path, which will roll up `Cancelled` and run the full settle sequence. This makes Cancel deterministic and closes scenario 2 with *less* code, not more.
- `settleSubmittingRun`'s `Paused`-only guard (`:2348`) stays — but see B3 for the Retry-status divergence it leaves behind.

**Tests.**
- Dispatcher unit tests (new — see §Test Plan for the seam): simulate the crash by driving `propagateAndRollup` to the terminal save, constructing a fresh dispatcher, and asserting the next pass finds the graph, settles the run, and delivers exactly once.
- IT74 extension: cancel a mid-flight graph; assert the submitting run leaves `Paused`, the cancellation message is posted, and the outcome is identical across 10 runs (determinism).
- IT74 extension: settle with an injected one-time `LoadAgentRunTree` failure; assert the rollup lands on the next pass.

### P4. The continuation marker must be a real CAS

**Severity: HIGH. Two review tracks converged.**

**Defect.** `claimContinuation` (`packages/TaskGraph/src/TaskGraphDispatcher.ts:1115-1132`) is Load → check `continuationDeliveredAt` → `BaseEntity.Save()` — an unconditional last-write-wins UPDATE. Two dispatcher instances polling the same settled graph within one interval both read "no marker," both save, both deliver. For `continuation: 'message'` that is a duplicate conversation post; for `'reinvoke'` it is **two fresh agent turns billed for one workflow settlement**, each able to submit further graphs. The comments at `:1037` and `:1113` call this a "compare-and-swap read-back"; it is read-check-write. `TaskClaimStore.ts:16-20`'s own header documents exactly why `Save()` cannot express this guard — every *task* transition uses guarded single-statement SQL for precisely this reason. The continuation marker is the one transition that doesn't.

**Fix specification.**
- Add a guarded method on `TaskClaimStore` (e.g. `TryClaimContinuation(parentTaskId, instanceId)`): one UPDATE whose WHERE clause requires the marker to be absent, rowcount as the verdict — the same pattern as `TryClaim`. Because the marker currently lives inside the `InputPayload` JSON bag, the guard needs either a JSON predicate (`ISJSON`/`JSON_VALUE` on the marker path — acceptable, this is dispatcher-owned direct SQL) or the queryable marker column from P3's option (a). **P3 and P4 should share that decision** — one marker, one representation, decided once.
- Marker-before-side-effect ordering is deliberate and stays (at-most-once delivery is the chosen trade; the audit confirmed the reasoning). The fix is only making "marker claimed" actually exclusive.
- Fix the two comments claiming CAS semantics to describe the real mechanism.

**Tests.**
- Unit test on the new claim-store method: two concurrent claim attempts, exactly one wins (the store's existing test seam applies).
- IT74 extension (the TX6 pattern): two dispatchers race one settling graph; assert exactly one continuation message row exists. This is the same "the database's atomicity IS the guarantee" class as TX6 and cannot be tested with mocks.

---

## Phase 2 — Design decisions

> Each of these is a real gap with more than one defensible resolution. Builder: write a short design note (10–20 lines, in the PR description or a `plans/` amendment) and get it agreed **before** implementing. Do not fold these into Phase 1.

### D1. Execution identity — durable tasks run as the system user

**Today.** The dispatcher boots with `UserCache.Instance.GetSystemUser()` (`packages/MJServer/src/index.ts:1388,1418`) and threads it into every runner call and entity write (`TaskGraphDispatcher.ts:1944, 2129-2152, 2300-2309`). Agents, actions, and prompts execute with **system-user permissions and attribution** regardless of submitter. `submittedByUserID` is persisted (`TaskGraphService.ts:772`) but consumed only for frame authorization. The continuation deliverer also posts messages and reinvokes agents as system (`TaskGraphContinuationDeliverer.ts:46,74,113-136`). Net: a low-privilege user's graph executes with system rights — RunView row filtering, action permission checks, and Record Changes attribution all evaluate as system. Silent privilege escalation.

**Options.**
- **(a) Per-run impersonation**: resolve `SubmittedByUserID` → `UserInfo` at claim time and thread it as `contextUser` through runners, entity writes, and continuation delivery. Correct attribution and enforcement; requires the dispatcher to handle a deactivated/deleted submitter (refuse the task with a clear error, don't fall back to system).
- **(b) Submit-time gate, documented system execution**: at `Submit`, verify the submitter holds execute rights for every agent/action/prompt in the graph; refuse otherwise; document that execution itself runs as system. Cheaper, but attribution stays wrong and TOCTOU (rights revoked mid-graph) is unhandled.

**Recommendation**: (a). MJ's permission machinery is designed to be evaluated per-`contextUser`, the plumbing exists at every call site, and (b) leaves Record Changes lying about who did the work. Whichever is chosen, `DurableEntityActionTaskSubmitter` (which already passes the real user at submit) and the schedule-triggered path must both be covered.

### D2. Run-context threading across the flow cutover

**Today.** The flow cutover compiles *structure* only. The run's starting payload, `data.`/`context.` references, and `conversation[N]` references — all documented as supported (`flow-agent-type.ts:426-430, 1024-1033`) — silently degrade under dispatch:

- The entry task starts from `{}`: `DetermineInitialStep` puts the payload into the Tasks step's `newPayload` and nowhere else (`flow-agent-type.ts:1188-1249`); `Submit`'s context carries no payload/data/context (`base-agent.ts:11957-11969`); the compiler never sets `node.inputPayload`; `TaskGraphService` persists `InputPayload` null (`:879`).
- `BuildMappedInput` gets `{ payload }` only (`TaskGraphDispatcher.ts:1915`), so `data.x`/`context.x` mappings fall through to the **literal string** (`payload-mapping.ts:136-141`) — an action receives `"context.apiKey"` as its parameter value.
- The condition envelope's `data` is the *origin task's output*, not the run's `params.data` (`:1861-1865`); conditions on `data.userApproval` are definite-false and now *skip* branches the walker took.
- `stepResult` dialect diverged: dispatcher sets `stepResult.step` to the task **name** (`:1862`); the walker stored `'Success'`/the whole `BaseAgentNextStep`. Conditions authored as `stepResult.step === 'Success'` are definite-false. `flowContext` is zeroed.
- `$message`/`$reasoning`/`$confidence` output mappings are destructured away (`:2218, :2268` drop `specialFields`) — the user-facing completion message loses authored content, invisibly (not even `unmapped`).

**The decision.** This is one question, not five: **what is the contract for condition/mapping context under dispatch, and is it walker-parity or a documented new dialect?** Either answer is workable; the current state — walker docs, dispatcher behavior, silent divergence — is not.
- If **parity**: thread `payload` into the parent's `InputPayload` at submit; extend `BuildMappedInput`/condition envelopes with run-level `data`/`context` carried in parent metadata; restore `stepResult`'s legacy shape; deliver `specialFields` into the continuation summary. The differential suite then asserts context parity, not just traversal-order parity.
- If **new dialect**: update the flow-agent docs and `payload-mapping` docs to the dispatch semantics, make unresolvable `data.`/`context.` prefixes and `$`-fields **loud** (submit-time refusal or runtime error — never a literal string pass-through), and ship a migration note for existing flows.

**Recommendation**: parity for `payload`, `stepResult`, and `$message` (cheap, mechanical, restores documented behavior); an explicit decision with product input on `data`/`context`/`conversation[N]`, which are the expensive ones to thread durably.

### D3. Scope the active-graph sweep to workflow graphs

> **MOSTLY CLOSED in Phase 1 (R2-2).** The discriminator option (a) already existed: `Submit` has
> always stamped `TypeID` = the `AI Workflow` task type on the parent and every child, via
> `ensureTaskType`, which runs before the persist transaction. So no schema decision was needed and
> no backfill: **verified against a live database, every parent graph carries the stamp (24/24)**, and
> nothing dispatcher-owned predates it. `TypeID = @aiWorkflow` is now on all three sweep arms and
> inside the two guarded statements that write a payload column (`TryClaimContinuation`,
> `TrySetParentOutput`), where it is a REQUIRED argument rather than an optional filter. IT74 TX10
> asserts an ordinary parent+subtask hierarchy survives a live sweep byte-identical.
>
> What remains under D3 is only B4's NULL-`StepType` human-task inconsistency, which the scoping
> mooted in practice but did not delete.


**Today.** `findActiveGraphIDs` (`TaskGraphDispatcher.ts:1221-1262`) selects **every** `MJ: Tasks` row with `ParentID IS NULL AND Status IN ('Pending','In Progress')` (and every parent of a non-terminal child) — no `TypeID` or provenance filter — yet Tasks is a general-purpose entity used by conversations and user to-dos. Consequences: the dispatcher rolls up and overwrites the status of ordinary parent tasks; "human-task" classification by columns (`!AgentID && !ActionID && !PromptID`, `:1308-1324`) raises `MJ: AI Agent Requests` rows and writes `__human-notified__` into `ClaimedBy` for plain to-dos; `claimContinuation` **overwrites the parent's `InputPayload`** with the continuation-metadata bag (`ParseTaskGraphParentMetadata` of arbitrary content returns defaults — the original payload is destroyed, `:1126`); and every ordinary pending task costs ~two child queries per instance per 5s poll.

**Options**: (a) a dedicated `TaskType` row / `TypeID` filter for dispatcher-owned graphs; (b) a provenance marker written by `TaskGraphService.Submit` that the sweep requires (the parent-metadata bag exists, but making it queryable again meets P3/P4's marker decision); (c) a discriminator column. **This should be decided together with the P3/P4 marker representation** — one schema decision covers all three. Backfill existing workflow parents; a graph submitted before the marker existed must not become invisible to the sweep (that would recreate P3).

**Tests**: an ordinary parent+subtask hierarchy sits untouched through N dispatcher polls (status, `ClaimedBy`, `InputPayload` all byte-identical); IT74 asserts workflow graphs still dispatch.

### P2/D2 interaction note

P2 (unevaluable → undecided) changes ordinary-edge condition semantics; D2 changes what conditions *see*. Land P2 first — it is a strict safety improvement under either D2 outcome. Do not let D2's design discussion delay P2.

---

## Phase 3 — Hardening backlog

Ordered roughly by value; none blocks Phases 1–2. Each is small and self-contained — good warm-up tasks or fill-in work.

| # | Item | Where | Defect → fix |
|---|---|---|---|
| B1 | **Enforce or remove per-step policy** | `TaskGraphService.ts:256-262` (written), `TaskGraphDispatcher.ts` (never read) | `RetryCount`/`TimeoutSeconds`/`onError` are persisted, round-trip-tested, and dead. Enforce timeout in `executeClaimed` (a live-but-wedged runner currently heartbeats forever — claim TTL only covers dead processes, `:504-511`); enforce retry with a bounded re-pend; or delete the columns from the authoring surface. Enforcing timeout is the valuable half: it is the only remaining "graph hangs forever" path once P2/P3 land. |
| B2 | **Save-as-Workflow loop fidelity** | `task-graph-to-agent-spec.ts:267-278` vs `flow-graph-compiler.ts:461-514` | Loop steps are emitted without `ActionID`/`SubAgentID`/`PromptID` (body identity survives only as a *name* in `Configuration` JSON the compiler never reads) → every reopened ForEach/While hits `UnresolvedReference` and the whole saved workflow refuses to compile, despite `Losses: []`. Also: prompt-bodied loops mislabeled `LoopBodyType: 'Sub-Agent'`; and `StartingStep` is not recomputed after dropping Human/External nodes (`:93-95,144`) — the saved workflow can be entirely dead with only the dropped step reported. Add a loop fixture and a dropped-dependency fixture to `flow-round-trip.test.ts`. |
| B3 | **Retry after settlement is second-class** | `TaskGraphService.ts:594-626`, `TaskGraphDispatcher.ts:1046, 2348` | Retrying a failed task in a settled graph: the durable continuation marker suppresses all future delivery, and the run keeps `Failed` under a now-`Complete` graph. Decide: `Retry` clears the marker (re-arming exactly-once delivery for the *new* settlement) and run settlement accepts a `Failed`→re-verdict transition for retried graphs — or document Retry as fire-and-forget. Recommendation: re-arm; a user retries precisely to be told the outcome. |
| B4 | **HITL settle/expiry ignore legacy human rows** | `TaskGraphDispatcher.ts:1480, 1611` vs `:1544-1547` | `settleAnsweredHumanTasks`/`expireOverdueRequests` filter `StepType='Human'` while classification (`:1308-1324`) and `reopenCancelledHumanTasks` accept `StepType IS NULL AND UserID IS NOT NULL`. A NULL-`StepType` human task can be *asked* but never *settled* — answered request shows Responded, task Pending forever. Widen settle+expiry with the same predicate reopen already uses. (Partially mooted by D3's scoping, but the inconsistency is a one-line fix now.) |
| B5 | **Claim store is T-SQL-only** | `TaskClaimStore.ts:258` | `SELECT @@ROWCOUNT` hardcoded (comment claims dialect-safe; it isn't). On the PG provider every claim throws→0 → no task ever claimed, graphs sit Pending forever with only log noise. Route through `SQLDialect.RowCountExpression()`. *Note: runtime TypeScript, so this is in-scope for a feature PR — the "PG is toolchain territory" rule covers migration SQL, not provider-portable runtime code.* |
| B6 | **Non-ASCII payload mangling** | `TaskClaimStore.ts:150-157, 268-270` | `CompleteClaimed` writes `OutputPayload`/`ErrorMessage`/`Configuration` (all NVARCHAR(MAX)) as un-prefixed `'...'` literals → code-page coercion turns Japanese/emoji into `???`, corrupting payloads and flipping downstream `includes()` conditions. Parameterize or N-prefix with correct escaping; IT74 gains a non-ASCII round-trip assertion. |
| B7 | **`IsGraphStalled` blind to holds and handled failures** | `graph-algorithms.ts:331-336`; called bare at `TaskGraphDispatcher.ts:665` | False negative: held targets count as "eligible" so an undecided exclusive group stalls with **zero** diagnostics. False positive: under `failureSemantics:'edges'` a healthy recovering graph logs "stalled" every poll. Pass `handledFailureIDs` + hold set into the check (the claim loop already computes both at `:1293-1297`). Required by P2's "held must be visible." |
| B8 | **Post-settle side-effect loop on parent save failure** | `TaskGraphDispatcher.ts:697` | Unchecked `parent.Save()`: on failure the graph stays active and `GraphSettled` frames + full cost recompute + layout persistence re-run every 5s indefinitely. Check the save; log + retry with backoff. (P3's re-entrant settle makes the retry safe.) |
| B9 | **Unguarded full-row saves race the claim protocol** | `TaskGraphDispatcher.ts:1342-1347, 1510`; `TaskGraphService.ts:513-516` | `markHumanTaskNotified`, human-task settle, and Cancel's child writes are Load→`Save()` over rows the claim store mutates via guarded SQL — stale snapshots can overwrite `Complete`+`OutputPayload` (Cancel case destroys a completed step's output). Convert to guarded UPDATEs via the claim store, per its own header doctrine. Cancel's variant partially lands with P3. |
| B10 | **Doc/message rot** (batch) | various | `FindUnrunnableKinds` says "Prompt steps … not supported yet" while Prompt is dispatchable (`TaskGraphService.ts:341-343`); `TaskLoopExecutor.ts:279-288` comment says "0 means unlimited" (contract and code: zero); `While` at `maxIterations:0` logs "condition still true" without evaluating it; `TaskGraphDispatcher.ts:1933-1935` "Not a failure…" precedes `Success:false`; `FlowAgentExecuteParams` still advertises `startAtStep` (`flow-agent-type.ts:106-135`) which is now refused; `FlowAgentTypePromptParams` (`flow-agent-prompt-params.ts`) is entirely dead config — delete or wire; `TaskOrchestration-Integration.md` describes the retired pre-durable design — rewrite or delete; dropped Optional/Corequisite edges are reported under `Kind:'InputPayload'` (`task-graph-to-agent-spec.ts:179-186`); `TriggerKey` (`workflow-spec.ts:217-234`) misses shorthand-vs-full invocation duplicates and merges distinct record-scoped triggers. |

Also noted in the audit, no action this phase (accepted trade-offs — record them in code comments where absent): heartbeat loss doesn't abort a live execution (side effects can duplicate after TTL lapse — inherent to lease-based claims); `TryClaim`'s expired-claim OR-clause is dead (takeover waits for reconciliation — fine, but the doc overstates); dependency-output merge order relies on unordered `loadDependencyOutputs` rows (`:1870-1887` — add `ORDER BY` for determinism when convenient); frames are process-local PubSub so multi-instance viewers miss remote frames (observability only); `AdvanceFrontier`'s join relaxation is ephemeral/non-transitive (`graph-traversal-engine.ts:286-297`) — **latent**, no production caller uses parallel traversal, but either fix or mark the API experimental before anyone adopts it; `JoinMode:'any'` compiles to a totally unordered graph (`flow-graph-compiler.ts:292`) — reject it at compile until OR-joins exist.

---

## Test Plan

The audit's sharpest meta-finding: **the coverage gaps map one-to-one onto the bugs.** The pure algorithms are well-tested (~2,800 lines in CorePlus) and the claim protocol is proven live (IT74 TX1–TX7) — and every high-severity finding sits exactly where neither looks: the 2,500-line dispatcher has no unit tests for propagation/settlement/continuation/human-lifecycle, and the differential suite has no fixture for the condition shapes that diverge.

1. **Dispatcher unit-test seam** (new, `packages/TaskGraph/src/__tests__/`). The dispatcher already takes injectable runners and a provider; add tests driving `propagateAndRollup` + the settle sequence against an in-memory provider stub: crash-window re-entry (P3), settle idempotency, skip-seed vs. cascade confirmation (P1), unevaluable-condition hold (P2), stalled-graph diagnostics (B7). These are *logic* tests — the atomicity claims stay in IT74 where the real database answers.
2. **Differential fixtures** (`flow-differential.test.ts`): the two P1 shapes, the P2 shape, and — once D2 resolves — context-parity assertions (conditions and mappings see the same values under walker simulation and dispatcher, not just the same traversal order). Fix the simulator's edge-identity collapse and its `=== false` ordinary-condition model first; both currently mirror the production bugs.
3. **IT74 extensions** (TX8+, same stub-runner seam, no model calls): P1 diamond live with start-order assertion; P3 cancel-settles-run determinism; P3 transient-rollup-failure recovery; P4 two-dispatcher single-delivery race; B6 non-ASCII round-trip; D3 ordinary-task-hierarchy non-interference.

   **Landed in Phase 1** — TX8 P3 crash-rescue end to end across a process boundary (settle for real,
   strip the marker, start a *fresh* dispatcher whose poll interval is an hour so only the STARTUP
   sweep can act, assert delivery exactly once and no re-delivery by the next process); TX9 P4's
   two-dispatcher single-delivery race with a shared counting deliverer, also asserting the metadata
   bag survives the losing instance; TX10 D3 ordinary-hierarchy non-interference; TX11 the `Stop()`
   drain, asserted **per instance** (frames and claims of its own) rather than as global stillness,
   which is not a property one dispatcher can own.

   ⚠️ **IT74 requires exclusive use of the database.** Every "ran exactly once" assertion here
   depends on no other dispatcher competing, and when that is violated the raw failure is
   uninformative (`expected 1, got 0` on a task that plainly completed). The count assertions now
   infer the cause — a task that reached a terminal status this bundle's stub never started can only
   have been run by a foreign runner — and name it in the failure. Still open: TX3/TX7-class checks
   remain *racy* rather than merely uninformative under a competing dispatcher; genuinely fixing that
   needs process isolation, not a better message.
4. **Unit-test debt**: `DetermineInitialStep` (now the entire live flow-agent path — compile, refusals, Tasks handoff) has zero coverage (`flow-agent-type.test.ts` covers only mapping helpers and state); `TaskGraphService` Submit/Cancel/Retry likewise. Cover alongside the fixes that touch them rather than as a separate campaign.

Definition of done per repo standard: affected packages' unit tests pass, and `pnpm run test:integration` (deterministic tier) passes including the new TX checks.

---

## Invariants to Preserve

Verified solid by the audit — several are themselves fixes for past incidents. Phase 1 works adjacent to all of them; regressions here are worse than the bugs being fixed.

- **Claim protocol atomicity**: single-statement guarded UPDATEs with rowcount verdicts; completion writes status+output+claim-release in one statement (no window where a dependent sees `Complete` without `OutputPayload`); heartbeat cannot resurrect a reclaimed task; expired-claim release restates its predicate at write time; human tasks exempt from reclamation.
- **Recompute-from-persisted-state dispatch**: no completion "events" to double-deliver; every pass derives eligibility/skip/block/rollup from durable rows — this is what makes P3's re-entrant settle possible at all.
- **Skip-before-eligibility ordering** and the claim-window filters (`holdTaskIDs`/`skipSeedTaskIDs`/`unreachableTaskIDs` before claiming). P1 modifies what seeds *persist* as Skipped — the claim-filter role must survive intact.
- **Terminality guard on edge conditions** (`:1789`): a `succeeded`-style condition must never definite-false against a Pending origin (the "blocked at wave one" bug).
- **Skipped/Blocked semantics**: Skipped is terminal, satisfies dependents, invisible to failure precedence; Blocked is reserved for failure-driven unsatisfiability.
- **Submission atomicity**: parent+children+edges in one transaction (closed the claimed-before-edges-existed race); name resolution refuses holes before any write; unrunnable kinds refused at the door.
- **HITL lifecycle**: durable pause (survives restart), exactly-once notification with the permanent/transient failure split (the OOM-storm fix), any-instance poll-driven settlement, expiry, cancelled-request reopen, cross-user assignment refused at submit.
- **Cost rollup**: assignment-never-accumulation (idempotent re-settlement, no double counting); refuses lower bounds and clears stale rollups rather than guessing.
- **Reinvoke recursion bounds**: submit-time cap + delivery-time downgrade, depth threaded through loops and agent nodes.
- **Deterministic edge selection**: priority desc then edge ID, identical in compiler sequence assignment and runtime resolution — walker and dispatcher cannot pick different winners.
  > **Corrected in Round 2 (R2-5).** This was aspirational when written: the runtime sorted
  > `priority desc || sequence asc` with **no final key**, so a genuine tie — and priority and
  > sequence both default to 0 — resolved by database row order, which can differ between polls of
  > the same graph. Determinism held only on the compiled-flow path, where the compiler assigns
  > distinct sequences. `CompareEdgePrecedence` now ends in `id.localeCompare`, so the invariant is
  > true of the code rather than of the intent.
- **Frame security**: graph match + connection-identity match, fail-closed on missing identity.

---

## Sequencing summary for the builder

```
Phase 1  (one PR, four commits, each commit = fix + its failing-first test)
  P1 skip-seed reachability  ──┐
  P2 unevaluable = undecided ──┤  independent of each other;
  P4 continuation CAS        ──┤  P3 and P4 share the marker decision —
  P3 recoverable settlement  ──┘  make it first, in P3's commit message

Phase 2  (design note first, then one PR each)
  D1 execution identity          — product decision required
  D2 context threading contract  — product decision on data/context/conversation;
                                   payload/stepResult/$message parity is mechanical
  D3 sweep scoping               — schema decision shared with P3/P4 marker

Phase 3  (fill-in; B1 timeout-enforcement and B4 are the priorities)
```

Every Phase 1 item is deliberately small: a reachability check on seeds, a keep→hold semantic plus a validator check, a third sweep arm plus Cancel simplification, and one guarded UPDATE. The risk is not size — it is touching the invariants above without the fixture that proves the invariant still holds. Write the failing test first, every time.
