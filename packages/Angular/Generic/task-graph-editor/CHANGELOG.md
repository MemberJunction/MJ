# @memberjunction/ng-task-graph-editor

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 5 of the unified workflow DAG engine program (plan: PR #3456) — a generic graph component whose subject is `TaskGraphSpec`.

  **New package `@memberjunction/ng-task-graph-editor`.** It views and edits **`TaskGraphSpec`** — the one fully-qualified graph contract every producer in the program already authors against (D16) — rather than any particular persistence. A design-time flow, a graph an agent emitted at runtime, a stored workflow definition and a graph someone is drawing from scratch are all the same type here, so one component serves the Flow Agent editor, the Agent Run admin view, conversation plan cards, the Tasks view, and anything downstream.

  **Why a new package rather than extending `ng-flow-editor`.** That package's _generic_ half — `FlowEditorComponent`, `FlowNode`/`FlowConnection`, the Dagre layout and Foblex canvas — is genuinely reusable and is **depended on, not forked**. Its _domain_ half is bound to `AIAgentStep`/`AIAgentStepPath`. Phase 4 established that a runtime task graph and a design-time flow are the same model; an editor that can only speak the agent-entity dialect cannot serve the other provenance, and teaching one component two dialects is exactly how the two drifted apart before the traversal-engine extraction fixed it.

  **Layer discipline (`widgets`).** `"mjUILayer": "widgets"` declared from the first commit. No `@angular/router`, no `@memberjunction/ng-shared`, no `NavigationService`, no global-provider construction. Route-derived state arrives as `@Input()`; navigation _intent_ leaves as an `@Output()` the host acts on, because a widget cannot know whether it sits inside Explorer, a downstream app, or an embedded panel.

  **The event contract is the reusable surface.** Vetoable actions ship as `Before*`/`After*` pairs whose args are **classes** extending `CancellableTaskGraphEventArgs` — `Cancel` has to travel _back_, which a frozen payload cannot do. A canceled `Before*` does not emit its `After*` and does not mutate the spec; that is a contract hosts rely on, and it is pinned by tests, because a refactor that moves the emit above the `Cancel` check yields a component that looks correct and ignores every veto. Informational events (`SpecChanged`, `SelectionChanged`, `ValidationChanged`) are single emitters — no veto is invented for something that cannot be vetoed. Public imperative methods exist for the one case the event contract cannot serve: a host that must `await` a confirmation before acting, since a `Before*` handler cannot await.

  **Validation is the engine's.** Cycles, unknown dependency refs and assignment conflicts come from `ValidateTaskGraphSpec` in `@memberjunction/ai-core-plus` — the same function `LoopAgentType` and `TaskGraphService.Submit` call. A second implementation here would be a second definition of "valid", and a graph that passed on the canvas would be free to fail at submission.

  **A cycle is refused, not merely reported.** A cyclic graph can never execute — nothing ever becomes eligible — so letting the canvas draw one would let someone build a workflow the engine must then reject. The `Before*` event carries `WouldCreateCycle` so the host can _explain_ the refusal rather than let a stroke silently fail to appear.

  **Runtime overlay.** Supplying `RuntimeStatus` turns the same canvas into a live view of the same graph — the convergence point the program was aiming at: one renderer for design time and run time, rather than an editor and a separate Gantt that can disagree. `Blocked` deliberately renders as a _warning_, not an error: nothing went wrong, the graph simply cannot reach it, and showing a failure would send someone hunting for a bug that does not exist.

  **`ConvertAgentSpecToTaskGraph`** (in `ai-core-plus`) completes the round-trip Phase 4 started. Without the inverse, a graph could be _saved_ as a workflow but never _reopened_ on the same canvas, and MJ would need a second flow-shaped renderer — back to two graph UIs that can disagree. Conditions survive the round-trip because both models store the same grammar, which is why `TaskDependency.Condition` was given `AIAgentStepPath.Condition`'s shape in Phase 4.

  **Coverage:** 73 new unit tests in the package (39 adapter, 34 component) plus 7 round-trip tests in `ai-core-plus`. The adapter is deliberately pure and separate from the component so its tests are about graphs rather than about Angular.

- 394d276: Phase 5 continued — the properties panel, the runtime-overlay source, and the Phase 0 carry-over.

  **`TaskGraphPropertiesPanelComponent`.** Edits what a step _does_, while the canvas stays about what connects to what. Split into its own component rather than welded into the canvas for a concrete reason: a host embedding the read-only viewer in a chat card or a run-history pane wants the graph _without_ a form beside it, and a panel built into the canvas cannot be declined.

  It emits intent rather than mutating. The canvas component owns the spec, so every edit here leaves as a request the parent applies through the same `Before*`/`After*` path a drag or a delete takes — two write paths into one spec would be two places for the veto contract to be wrong. Its `Draft` is a working copy for the same reason: editing the live node would make every keystroke an unvetoable mutation, and Cancel would be impossible by construction.

  Assignment is derived from the absence of an agent rather than stored separately, because the spec's own rule is that a task has exactly one assignee — a separate boolean could disagree with `agentName`, and the validator would then reject a graph the form said was fine. Cross-user assignment is stated as unavailable rather than offered, since submission rejects it until #3524 lands.

  Edge conditions are edited where the step is, and `SetDependencyCondition` is implemented as remove-then-add so it travels the same event path as any other edge change.

  **`task-graph-runtime-source`** — pure mappers turning live rows into the canvas's overlay. Deliberately _not_ a subscription: a `widgets`-layer component cannot know which provider it is on, whose rows it may read, or when the host wants to start and stop watching. The host owns the subscription and passes rows in. That split is also what lets one renderer serve both provenances — a durable graph watched through `MJ: Tasks`, an in-run flow through `AIAgentRunStep`, same shape by the time it reaches the canvas.

  Correlation is **by name with an ID fallback**, and the ordering is deliberate: a submitted graph's Task rows carry database IDs while the spec carries producer-assigned `tempId`s, and the two never match because the producer could not know real IDs at authoring time. A row matching nothing is **skipped rather than guessed at** — the wrong node lighting up green is worse than one staying grey, because the first is believed. An unrecognized status degrades to `Pending` rather than throwing inside a render path.

  **Phase 0 carry-over.** Removed the two dead `'reports'` branches in `explorer-core`'s `shell.component.ts` — the `appReportMatch` tab-finder and the `case 'reports':` URL builder. Both have been unreachable since Phase 0 dropped the `Reports` resource type; they survived that sweep because Explorer lowercases resource-type names, so a grep for the capitalized metadata name missed them.

  24 new tests (97 in the package).

### Patch Changes

- 394d276: DOM specs for the three components Phase 5 added, which takes the `packages/Angular/Generic` coverage ratchet from **138 (failing) to 135 (passing)** — better than the state it has been in on `next`.

  Each covers only what exists in the rendered template rather than the class, because the graph _logic_ is already tested against the pure adapter and the component classes where no TestBed is needed:
  - **The validation banner** earns DOM coverage specifically. It is the one place author-time feedback from the engine becomes visible, and a template regression there is silent — the component would still compute `IsValid` correctly while showing the user nothing.
  - **The properties panel never writes.** Every control emits a request the parent applies; a regression there would not throw, it would quietly bypass the veto contract.
  - **When "Save as Workflow" appears** is the plan card's highest-stakes rule. Offering it while work is still running invites saving a shape that may yet change under a retry or a failure routing down a recovery branch — so the graph a user believed they saved would not be the one that ran.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-flow-editor@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
