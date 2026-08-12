---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
---

Phase 5 continued — the two **Save as Workflow** surfaces deferred out of Phase 4 (D17). Phase 4 shipped the converter; these are where a person actually reaches it.

**Agent Run admin — a Workflow tab on the `TaskGraph` run step.** Phase 3 writes that step for *every* emitted graph, dispatched or constant-folded, which is what makes a folded single-node graph just as promotable as a dispatched one — the point of recording the fold rather than letting it vanish. The tab opens by default on a `TaskGraph` step, because that step's whole content *is* the graph and opening on the JSON would bury the one thing it exists to show. A folded graph says so, so the reader sees *why* it never reached the dispatcher instead of inferring it.

**ng-conversations — a plan card.** The moment this serves: an agent breaks a request into steps, the work runs, it was good, and today that is where it ends — the decomposition was ephemeral, so the next person who wants the same thing asks an agent to invent it again. Save is offered only once the work has **settled**; offering it mid-run invites saving a shape that may yet change under a retry or a failure routing down a recovery branch. The card starts collapsed, because it sits inline in a thread and must not dominate it.

**Both render through the same `TaskGraphSpec` component the editor uses**, in `ReadOnly` mode. A second, simpler renderer for chat would be a second thing that can disagree with the canvas about what a graph means — which is the exact class of divergence this whole program has been removing.

**Save is intent only** on both surfaces. Neither persists agents; the host converts and writes through `AgentSpecSync`, keeping the one place that writes an agent the one place that writes an agent.
