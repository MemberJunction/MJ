---
"@memberjunction/ng-task-graph-editor": minor
"@memberjunction/ai-core-plus": minor
---

Phase 5 of the unified workflow DAG engine program (plan: PR #3456) — a generic graph component whose subject is `TaskGraphSpec`.

**New package `@memberjunction/ng-task-graph-editor`.** It views and edits **`TaskGraphSpec`** — the one fully-qualified graph contract every producer in the program already authors against (D16) — rather than any particular persistence. A design-time flow, a graph an agent emitted at runtime, a stored workflow definition and a graph someone is drawing from scratch are all the same type here, so one component serves the Flow Agent editor, the Agent Run admin view, conversation plan cards, the Tasks view, and anything downstream.

**Why a new package rather than extending `ng-flow-editor`.** That package's *generic* half — `FlowEditorComponent`, `FlowNode`/`FlowConnection`, the Dagre layout and Foblex canvas — is genuinely reusable and is **depended on, not forked**. Its *domain* half is bound to `AIAgentStep`/`AIAgentStepPath`. Phase 4 established that a runtime task graph and a design-time flow are the same model; an editor that can only speak the agent-entity dialect cannot serve the other provenance, and teaching one component two dialects is exactly how the two drifted apart before the traversal-engine extraction fixed it.

**Layer discipline (`widgets`).** `"mjUILayer": "widgets"` declared from the first commit. No `@angular/router`, no `@memberjunction/ng-shared`, no `NavigationService`, no global-provider construction. Route-derived state arrives as `@Input()`; navigation *intent* leaves as an `@Output()` the host acts on, because a widget cannot know whether it sits inside Explorer, a downstream app, or an embedded panel.

**The event contract is the reusable surface.** Vetoable actions ship as `Before*`/`After*` pairs whose args are **classes** extending `CancellableTaskGraphEventArgs` — `Cancel` has to travel *back*, which a frozen payload cannot do. A canceled `Before*` does not emit its `After*` and does not mutate the spec; that is a contract hosts rely on, and it is pinned by tests, because a refactor that moves the emit above the `Cancel` check yields a component that looks correct and ignores every veto. Informational events (`SpecChanged`, `SelectionChanged`, `ValidationChanged`) are single emitters — no veto is invented for something that cannot be vetoed. Public imperative methods exist for the one case the event contract cannot serve: a host that must `await` a confirmation before acting, since a `Before*` handler cannot await.

**Validation is the engine's.** Cycles, unknown dependency refs and assignment conflicts come from `ValidateTaskGraphSpec` in `@memberjunction/ai-core-plus` — the same function `LoopAgentType` and `TaskGraphService.Submit` call. A second implementation here would be a second definition of "valid", and a graph that passed on the canvas would be free to fail at submission.

**A cycle is refused, not merely reported.** A cyclic graph can never execute — nothing ever becomes eligible — so letting the canvas draw one would let someone build a workflow the engine must then reject. The `Before*` event carries `WouldCreateCycle` so the host can *explain* the refusal rather than let a stroke silently fail to appear.

**Runtime overlay.** Supplying `RuntimeStatus` turns the same canvas into a live view of the same graph — the convergence point the program was aiming at: one renderer for design time and run time, rather than an editor and a separate Gantt that can disagree. `Blocked` deliberately renders as a *warning*, not an error: nothing went wrong, the graph simply cannot reach it, and showing a failure would send someone hunting for a bug that does not exist.

**`ConvertAgentSpecToTaskGraph`** (in `ai-core-plus`) completes the round-trip Phase 4 started. Without the inverse, a graph could be *saved* as a workflow but never *reopened* on the same canvas, and MJ would need a second flow-shaped renderer — back to two graph UIs that can disagree. Conditions survive the round-trip because both models store the same grammar, which is why `TaskDependency.Condition` was given `AIAgentStepPath.Condition`'s shape in Phase 4.

**Coverage:** 73 new unit tests in the package (39 adapter, 34 component) plus 7 round-trip tests in `ai-core-plus`. The adapter is deliberately pure and separate from the component so its tests are about graphs rather than about Angular.
