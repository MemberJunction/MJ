---
'@memberjunction/task-graph': patch
'@memberjunction/ai-core-plus': patch
'@memberjunction/global': patch
---

Task-graph engine hardening, Phase 1 — four correctness fixes at the seams between the well-built layers. Every one of them failed silently as success: the run reported Complete while the wrong work happened, or the settlement was lost with no error and no stall.

**P1 — an exclusive loser could skip a task another route still reaches.** A losing edge decided its target's fate rather than its own, so a fork whose loser pointed at a step the winner also reached (directly, or through a join) skipped that step while it was still due to run — and the graph settled Complete with the work never executed. `ResolveExclusiveGroups` no longer seeds a target a kept edge also points at, and `ConfirmSkipSeeds` answers the surviving-route question the dispatcher already asks for ordinary dropped edges.

**P2 — an unevaluable guard executed the work it was guarding.** A condition that failed to evaluate returned "keep the edge", and since conditions are only evaluated once the origin is terminal, a kept edge from a `Complete` origin is a satisfied prerequisite. The spec layer, the legacy walker and the exclusive path all said the opposite. Unevaluable is now an undecided HOLD, and `IsGraphStalled` counts held tasks so a graph waiting forever stops reporting healthy.

**P3 — settlement is recoverable.** The post-settlement sequence ran after the parent's terminal write, and a terminal parent matched no sweep query — so a crash in that window left the submitting agent run `Paused` forever, with no cost rollup and no notification. A third sweep arm finds terminal-but-unsettled graphs (wide once at startup, 24h in steady state), the settle sequence is re-entrant, and `Cancel` now defers to the dispatcher instead of writing the parent terminal itself, which makes cancellation deterministic.

**P4 — the continuation marker is a real compare-and-swap.** It was read-check-write, so two dispatchers could both deliver one settlement — for `reinvoke`, two billed agent turns. It is now a single guarded UPDATE in `TaskClaimStore`, and the parent's status and start-time writes are column-scoped so a full-row save can no longer erase the marker another instance just claimed.

**A stopped dispatcher now stops writing.** `Stop()` waited on in-flight tasks but not on the timer passes, which are `void`-ed promises nothing held — so it returned mid-pass and that pass went on to settle graphs, emit lifecycle frames and claim new tasks afterwards. Three quiet consequences: a `GraphSettled` frame arriving after every subscriber had gone, a shutting-down process manufacturing the orphaned claims reconciliation exists to clean up, and statements colliding with the host's reuse of the connection. Passes are now drained (they are bookkeeping for work that already happened, so cancelling one would open the very crash window P3 rescues), and no new work is claimed after the decision to stop.

**Every dispatcher query is scoped to workflow graphs.** `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos live there too — and the sweep did not filter by task type, so it rolled up and overwrote the status of anything with children. `Submit` has always stamped the `AI Workflow` type, so the discriminator already existed on every dispatcher-owned row; it is now in all three sweep arms and inside the guarded statements that write a payload column.

**New: an edge condition that cannot be parsed is refused at authoring time.** `SafeExpressionEvaluator.validateSyntax()` compiles an expression without evaluating it, which is what lets the check be syntax-only: unknown identifiers, absent properties and undefined chains all pass, because whether `payload.x.y` resolves is a question about a run that has not happened yet. `ValidateTaskGraphSpec` applies it to dependency conditions and `While` loop conditions, reporting every failure at once and naming the step and the condition text.

⚠️ **Migration note.** A saved workflow or flow whose condition never parsed has been failing at run time all along — silently before P2, as a held branch after it. That failure now surfaces at SAVE time instead, so editing an unrelated step in an old flow can newly report an error on a step you did not touch. The message names the step and quotes the condition so the surprise explains itself. Nothing rejects on load, and unknown identifiers are explicitly NOT an error — only expressions that cannot parse at all.
