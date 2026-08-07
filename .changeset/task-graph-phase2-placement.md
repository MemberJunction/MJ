---
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/integration-test-suite": minor
---

Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

**New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph *semantics* stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

**Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

**BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

**The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 *every* state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

**Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

**Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

**Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.
