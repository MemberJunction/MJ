# @memberjunction/ng-task-graph-editor

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-flow-editor@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-flow-editor@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 63ea273: A workflow run now draws what happened, and the Runs surface remembers how you arranged it.

  **Edges could never bind.** Every task-graph node declared canvas ports literally named `in` and
  `out`, and the canvas resolves a connection by looking its port ids up in one flat, graph-wide
  namespace — so no connection could say which node's port it meant, and a workflow drew its boxes
  with no edges at all. Nothing errored: an unresolvable port is just a connection with nowhere to
  attach. Port ids are now scoped to their node (`InputPortID` / `OutputPortID`), matching the
  convention the Flow Agent editor has always used.

  **A declined branch was reported as `Pending`.** `NormalizeRuntimeState` falls back to `Pending` for
  any status it does not recognise, and it did not recognise `Skipped` — so a branch the workflow
  chose not to take reached the canvas as "still waiting to run". The node drew as an ordinary pending
  step, its edges drew as live routes, and `IsRuntimeSettled` could never report a graph containing one
  as finished, so a host polling on it polled a completed run forever. `Skipped` is now carried
  through and counts as terminal.

  With those two fixed, run mode draws **only the path taken**: edges touching a declined step are
  omitted (both ends — an edge leaving a skipped step is as untravelled as one entering it) and the
  step is hatched and struck through, in the same visual language the run timeline already uses.
  Design mode still draws every edge, because there is no route yet — the graph is all the routes that
  _could_ be taken, which is exactly what an author is arranging.

  **The agent run's Workflow tab now shows the run, not the plan.** It rendered the recorded
  `TaskGraphSpec` on a bare canvas with no runtime, so every branch appeared to have run. It uses the
  same `mj-task-graph-run-view` the Workflows app does, falling back to the spec view only for a
  constant-folded graph that never reached the dispatcher — where a plan is the honest thing to draw.

  **Layout.** `FlowNodeStatus` gains `skipped` (deliberately not folded into `disabled`: disabled means
  "cannot run", skipped means "the graph went the other way"). `ShowLegend` and `ShowToolbar` are
  separately controllable, defaulting legend-off / toolbar-on in run views — the legend explains
  authoring vocabulary a run does not need, while the toolbar is how a person navigates the picture.
  `LegendToggled` is forwarded so a host can persist the choice rather than adding a second control.
  The run view's height chain was also broken: `Height` sat on the canvas and resolved against an
  auto-height ancestor, so `100%` meant nothing; it now governs the widget and the canvas flexes.

  **Workflows → Runs** gains resizable, per-user-persisted panes (list | detail, and canvas | step
  record inside it), with the step record moved beside the canvas rather than in a strip below it.
  Sizes are stored separately from openness, so closing and reopening returns a pane to the width you
  dragged it to. Preferences go through `UserInfoEngine`, never `localStorage`.

- 6cd337d: Workflow Run Console — realtime runner and debugger for task graphs (`plans/task-graph-realtime-runner.md`).

  Engine: new frame kinds (`GateDecision`, `ClaimChanged`, `PassCompleted`, `GraphPaused`, `GraphResumed`, `BreakpointHit`, `NodeProgress`) emitting state the dispatcher already computes; durable debug state (`$.debug` in the parent metadata bag) gating the claim filter — pause, single-step, breakpoints, and edge-condition overrides are claim gating, never new execution machinery. New Remote Operations: `TaskGraph.Pause/.Resume/.Step/.SetBreakpoints/.OverrideEdge/.SkipTask/.ForceCompleteTask/.UpdateTaskInput`; `RetryTask` accepts an edited input. Metadata rows for the new operations ride the branch (bump is `minor` per the metadata-branch rule).

  Client: `GraphQLDataProvider.TaskGraphFrames(parentTaskId)` — the first consumer of the `taskGraphFrames` subscription (shared, refcounted per graph). The run view accepts a `LiveFrame` input (frames patch the canvas; cascade frames trigger a debounced row reconcile — frames advisory, rows truth) and a `ReplayAt` input (post-settle scrubbing from row timestamps). The Workflows app's Runs surface becomes the console: pause/resume/step toolbar, engine pass strip, stall banner, step inspector (claim, path verdicts, live progress, what-if via the engine's own algorithms), and replay scrub.

### Patch Changes

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
- 7a71c96: Add DOM specs for the debugger wrap, VCR toolbar, and variables pane so the Generic coverage ratchet stays at 134 after #3793.
- f80bdb7: Drop-in `mj-task-graph-debugger` wrap, Continue-from-breakpoint actually claims the stopped step, dispatcher kick on Submit, and run-view paint for queued / running / traveled edges plus a left data pane.
- deea1a3: Unstick the DOM unit specs that fail under the M5 joined pnpm workspace. Two physical copies of @angular/core / @codemirror/state (parent store vs MJ store) made CodeMirror throw on EditorState.create, AgGrid crash with firstCreatePass of null, angular-split inject() hit NG0203, and bootstrap constructor inject() fail the same way. The specs now skip those host libraries (toolbar-only CodeMirror init, AgGrid/as-split stubs) and bootstrap inlines Angular through Vite so Analog and TestBed share one copy.
- d907a1b: Wire the four unused workflow debug verbs into the Run Console — breakpoints, edge overrides, force-complete, and edit-input — so a held or interesting graph can be stepped without leaving Explorer.
- 1be0f14: The workflow canvas fills the space it is given instead of sitting at 400px.

  Two broken links in one height chain, both of which fail silently — CSS does not report a percentage
  height that had nothing to resolve against, it just computes `auto`.

  `FlowEditorComponent` and `TaskGraphEditorComponent` are custom elements with no `:host` rule, so
  their host boxes were `display: inline` with automatic height. The `height: 100%` on each component's
  root element therefore resolved against an auto-height parent — which means `auto` — and
  `.mj-flow-editor` fell through to its `min-height: 400px` floor. The canvas was pinned at 400px no
  matter how much room its pane had. Both hosts now declare `display: block; height: 100%`, which is
  safe for callers that don't give them a box: it resolves to `auto` there and the floor takes over
  exactly as before.

  The Workflows Runs detail pane had the same defect one level up: `.wfr-detail` is a flex column
  inside a split area with no height of its own, so the canvas below it — `flex: 1 1 auto` of an
  auto-height parent — got its intrinsic size and left dead space beneath.

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [63ea273]
- Updated dependencies [1be0f14]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ng-flow-editor@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [8de5f7e]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/ng-flow-editor@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2

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
