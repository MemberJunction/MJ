---
'@memberjunction/task-graph': patch
'@memberjunction/ai-core-plus': patch
---

Task-graph engine hardening, Phase 1 — four correctness fixes at the seams between the well-built layers. Every one of them failed silently as success: the run reported Complete while the wrong work happened, or the settlement was lost with no error and no stall.

**P1 — an exclusive loser could skip a task another route still reaches.** A losing edge decided its target's fate rather than its own, so a fork whose loser pointed at a step the winner also reached (directly, or through a join) skipped that step while it was still due to run — and the graph settled Complete with the work never executed. `ResolveExclusiveGroups` no longer seeds a target a kept edge also points at, and `ConfirmSkipSeeds` answers the surviving-route question the dispatcher already asks for ordinary dropped edges.

**P2 — an unevaluable guard executed the work it was guarding.** A condition that failed to evaluate returned "keep the edge", and since conditions are only evaluated once the origin is terminal, a kept edge from a `Complete` origin is a satisfied prerequisite. The spec layer, the legacy walker and the exclusive path all said the opposite. Unevaluable is now an undecided HOLD, and `IsGraphStalled` counts held tasks so a graph waiting forever stops reporting healthy.

**P3 — settlement is recoverable.** The post-settlement sequence ran after the parent's terminal write, and a terminal parent matched no sweep query — so a crash in that window left the submitting agent run `Paused` forever, with no cost rollup and no notification. A third sweep arm finds terminal-but-unsettled graphs (wide once at startup, 24h in steady state), the settle sequence is re-entrant, and `Cancel` now defers to the dispatcher instead of writing the parent terminal itself, which makes cancellation deterministic.

**P4 — the continuation marker is a real compare-and-swap.** It was read-check-write, so two dispatchers could both deliver one settlement — for `reinvoke`, two billed agent turns. It is now a single guarded UPDATE in `TaskClaimStore`, and the parent's status and start-time writes are column-scoped so a full-row save can no longer erase the marker another instance just claimed.
