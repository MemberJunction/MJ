# Workflow Debugger UI — completing the console #3770 started

**Status**: plan, ready to build · **Branch**: cut from `next` · **Owner**: unassigned

---

## The one-paragraph version

#3770 shipped a **complete debug control plane** and a run console that uses six of its ten verbs.
Four verbs — `SetBreakpoints`, `OverrideEdge`, `ForceCompleteTask`, `UpdateTaskInput` — have rows in
the database, generated clients, server implementations, and durable state behind them, and **no UI
caller anywhere**. The console can already tell you a breakpoint was hit; nothing in Explorer can set
one. This plan closes that, and does it by extending the design-time canvas the author already draws
on rather than building a second surface beside it — because the question a debugger answers ("why
did *this* branch run?") is asked in the same picture the branch was drawn in.

---

## 1. What already exists (do not rebuild any of this)

Verified against `next` at the time of writing. The build is further along than "add four buttons"
suggests, and the plan's shape follows from *where* the gaps actually are.

### Server: complete

`packages/TaskGraph/src/debug-state.ts` models the whole thing as durable declarative state under
`$.debug` in the parent task's `InputPayload`, written only through `TaskClaimStore`'s guarded
`JSON_MODIFY` statements:

```ts
type TaskGraphDebugState = {
    paused?: boolean;  pausedBy?: string | null;
    pausedReason?: 'user' | 'breakpoint';  pausedAtTaskID?: string | null;
    breakpoints?: string[];                       // task IDs
    step?: StepTarget;                            // 'one' | 'wave' | <taskID>, consumed CAS-style
    edgeOverrides?: Record<string, 'true' | 'false'>;   // keyed by MJ: Task Dependencies row ID
};
```

Every control gates **claiming**, never running — a claimed task cannot be interrupted, so the only
honest lever is the next claim. That design decision is what makes the UI's job tractable: the
debugger never needs a live channel to a worker, it writes a row and every dispatcher instance
obeys within one poll.

### Transport: complete

Ten operations exist, all `Active`, `Sync`, `RequiredScope=taskgraph:execute`, verified present in a
from-scratch database (PR #3779). Generated clients are in
`packages/MJCoreEntities/src/generated/remote_operations.ts`.

### Frames: complete

The dispatcher emits `BreakpointHit`, `GraphPaused`, `GraphSettled`, `ClaimChanged`, `GateDecision`,
`NodeProgress`, `PassCompleted`, `StepRefused`, `TaskAwaitingHuman`, `TaskStarted`, `TaskBlocked`,
`TaskSkipped`, plus task terminal frames. The Explorer host subscribes via
`GraphQLDataProvider.TaskGraphFrames(parentTaskID)`.

### UI: two-thirds built

| Piece | Where | State |
|---|---|---|
| Design-time canvas + palette + properties panel | `Generic/task-graph-editor/task-graph-editor.component` (L1) | complete |
| Live run canvas, frame folding, replay scrubber | `Generic/task-graph-editor/task-graph-run-view.component` (L1) | complete |
| Run console: frame log, engine ticks, step inspector, claim + verdict cards, what-if | `Explorer/dashboards/Workflows/workflow-runs-resource.component` (L3) | complete |
| Pause / Resume / Step(one) / Step(wave) / Cancel / SkipTask / RetryTask | same L3 component | wired |
| **SetBreakpoints / OverrideEdge / ForceCompleteTask / UpdateTaskInput** | — | **no caller** |

### The canvas already supports what this needs

Two findings that decide the plan's cost, both verified:

- `FlowNode.Badges?: FlowNodeBadge[]` exists on the L1 canvas model, so a breakpoint marker needs
  **no canvas changes** — it is a badge the adapter emits.
- `FlowEditorComponent` already emits `ConnectionSelected`, so edge overrides need **no new canvas
  interaction primitive** — the selection event exists and is currently unused by the run view.

If either had been missing, this plan would have started in `flow-editor`. Neither is, so it does
not.

---

## 2. What is actually wrong today

**The controls that exist do not compose into a debugger.** You can pause a run and step it, which
means the only debugging strategy available is "stop everything and advance one step at a time from
the beginning". Breakpoints are what make that unnecessary — run freely until the interesting step —
and they are the one verb with no way to be set.

**A held graph has no escape hatch in the UI.** `edgeOverrides` exists precisely for the case where
a condition cannot be answered and the graph is stuck; `GateDecision(verdict='held')` already tells
the console *which* edge is the problem, in a `StallNotice`. The user is shown the diagnosis and
given no way to act on it.

**Two interventions stop at read-only.** The inspector shows a step's input payload and its failure,
and `ForceCompleteTask`/`UpdateTaskInput` exist to act on exactly that — correct the brief and retry,
or declare a stuck step done. `TaskGraphRetryInput` even gained an optional `inputPayload` field for
this (PR #3779). Nothing calls it.

**Design-time and run-time are different pictures of the same graph.** The editor knows about node
kinds, ports, conditions and the legend that explains them; the run view deliberately hides the
legend because "what happened" is a different question. But a debugger asks *both* questions at once
— "this edge's condition is `data.approved`, and it evaluated false" — and today the vocabulary for
the first half lives only in the editor.

---

## 3. Design principles for this work

1. **Extend the canvas, don't clone it.** Every new affordance is an `@Input()`/`@Output()` on the
   existing `task-graph-run-view` (L1) plus an adapter mapping, never a new canvas.
2. **The L1 widget never calls an operation.** It renders debug state handed in and emits intent
   (`BreakpointToggled`, `EdgeVerdictOverridden`). The L3 Explorer host owns every
   `RouteOperation` call, exactly as it does for the six wired verbs. This is
   [`guides/UI_LAYERING_GUIDE.md`](../guides/UI_LAYERING_GUIDE.md) Boundary 1, and it is why the run
   view can also be embedded in the agent-run timeline and the test harness.
3. **Debug state is read from the row, not accumulated from frames.** Frames are advisory and
   droppable; `$.debug` on the parent row is the truth. A console that inferred breakpoints from
   `BreakpointHit` frames would show an empty set after a page refresh.
4. **Every control says what it did.** The verbs return `TaskGraphDebugControlOutput` with the debug
   state after the call. Bind that, rather than optimistically toggling local booleans — the existing
   `DebugPaused = true; // optimistic` pattern is tolerable for pause and actively misleading for a
   breakpoint set that the server may have rejected.
5. **Nothing new for the two-instance case.** All state is durable and CAS-guarded server-side, so a
   console attached to instance A controls a graph executing on instance B for free. The UI must not
   introduce per-instance memory that breaks that.

---

## 4. Phases

Each phase is independently shippable and independently useful. A reviewer should be able to stop
after any one of them and have a better product than before it.

### Phase 1 — Breakpoints (the missing half of stepping)

**L1 (`task-graph-run-view`)**

- `@Input() Breakpoints: readonly string[] = []` — task IDs, from the row's `$.debug.breakpoints`.
- `@Input() PausedAtTaskID: string | null` — the step a breakpoint stopped on, from the same place.
- `@Output() BreakpointToggled = new EventEmitter<{ TaskID: string; Enabled: boolean }>()`.
- `@Input() AllowBreakpointEditing = false` — off by default, because the run view also renders
  inside an agent-run timeline where controls would be wrong.
- Adapter: emit a `FlowNodeBadge` (`Icon: 'fa-circle'`, red) for a node with a breakpoint, and a
  distinct badge for `PausedAtTaskID`. **No canvas change required.**
- Click target: gutter click on the node badge toggles; the existing `NodeSelected` path is
  untouched so selecting for inspection and arming a breakpoint stay separable.

**L3 (`workflow-runs-resource`)**

- Read `$.debug` when a run is selected (it is already reading the parent task row) and bind
  `Breakpoints`/`PausedAtTaskID`.
- `OnBreakpointToggled` → `TaskGraph.SetBreakpoints` with the **full set** (the operation replaces,
  it does not merge — see `TaskGraphSetBreakpointsInput`), then bind the returned state.
- Show the armed set as removable chips near the runner controls, so breakpoints on off-screen nodes
  are discoverable.

**Tests**: DOM test that a node with a breakpoint renders the badge and that toggling emits once
with the right id; an L3 test that `SetBreakpoints` is called with the union/difference, not the
single id.

### Phase 2 — Edge overrides (the escape hatch for a held graph)

**L1**

- `@Input() EdgeOverrides: Readonly<Record<string, 'true' | 'false'>> = {}`.
- `@Output() EdgeVerdictOverridden = new EventEmitter<{ EdgeID: string; Verdict: 'true' | 'false' | null }>()`
  — `null` clears, matching the operation's own contract.
- Render an overridden edge distinctly from an evaluated one. **This is the important visual
  decision in the whole plan**: an operator-forced edge must never look like a condition that
  genuinely evaluated true, or the run history lies about why a branch ran. Suggest a dashed overlay
  plus a badge on the connection label; the styling must survive both themes.
- Wire the existing, currently-unused `ConnectionSelected` output through as the selection source.

**L3**

- The `GateDecision(verdict='held')` frame already produces a `StallNotice` naming the edge. Turn
  that notice into an **actionable** card: "Answer it true / Answer it false / Leave held".
- `TaskGraph.OverrideEdge` with `{ parentTaskID, edgeID, verdict }`.

**Tests**: an overridden edge renders differently from a satisfied one (this is the assertion that
protects the history-honesty property); clearing an override emits `null`, not `'false'`.

### Phase 3 — Step-level interventions

**L3 only** — these are inspector actions on the already-selected step, no L1 change:

- **Force complete** → `TaskGraph.ForceCompleteTask`. Destructive and unusual: require a typed
  confirmation and state plainly that downstream conditions will evaluate against the forced result.
- **Edit input & retry** → `TaskGraph.UpdateTaskInput`, or `TaskGraph.RetryTask` with the
  `inputPayload` field added in #3779. A JSON editor seeded with the step's current input; invalid
  JSON must be refused client-side rather than round-tripped into an error.

**Tests**: the confirmation cannot be bypassed; malformed JSON never reaches the operation.

### Phase 4 — Bringing the authoring vocabulary into the run view

The half that makes it a *debugger* rather than a control panel. All L1.

- **Show each edge's condition on the canvas during a run**, so "why did this branch run" is
  answerable without opening the properties panel. The editor already computes this text; extract
  the shared bit rather than duplicating it.
- **Per-node inspector affordance in the widget** for `data`/`context` roots the invocation carried
  (`$.debug` sits beside `invocation` in the same metadata bag). This is what turns a wrong branch
  into a diagnosis — R3-3's whole point was that these roots decide conditions, and today nothing
  displays them.
- **Legend, run-flavoured**: reuse the editor's legend component with a debug vocabulary (breakpoint,
  overridden edge, held path, forced result) rather than the authoring one.

---

## 5. Explicitly out of scope

- **No new server work.** If a phase seems to need a new verb, stop and re-read `debug-state.ts` —
  the state model is richer than the current UI uses.
- **No changes to `flow-editor` (L0/L1 canvas).** Badges and `ConnectionSelected` are sufficient; a
  change there affects every flow UI in the product and should be its own PR with its own reason.
- **No breakpoint persistence across runs.** `$.debug` is per-graph-instance. "Always break on this
  step of this workflow" is a design-time concept and a separate feature.
- **The `Cancel`/`Retry` verbs** already work; do not refactor them into this while passing.

---

## 6. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| A forced/overridden result becomes indistinguishable from a real one in history | The run record stops being evidence — the exact failure class the engine hardening rounds existed to remove | Distinct rendering is a **test**, not a style note (Phase 2); the frames already carry the distinction |
| Optimistic local state disagrees with the server | Two dispatchers and a durable row mean the server can legitimately refuse | Bind `TaskGraphDebugControlOutput.debugState` from every verb; never toggle a local boolean as the source of truth |
| Breakpoint set races between two consoles | `SetBreakpoints` **replaces** the set, so a stale read silently drops the other console's breakpoint | Re-read `$.debug` immediately before composing the new set; consider showing "changed elsewhere" when the returned set differs from the one sent |
| The run view is embedded in three hosts | New controls appearing in the agent-run timeline would be wrong | Every new affordance defaults **off** (`AllowBreakpointEditing = false`) |

---

## 7. Definition of done

- All ten debug verbs have a UI caller, or a written reason they should not.
- Unit + DOM tests per phase, including the two properties that are correctness rather than polish:
  an overridden edge renders distinctly, and debug state is read from the row rather than
  accumulated from frames.
- `mj standards check` and the UI gates (`npm run check:ui`) pass.
- The live two-instance exercise from #3770's handover — console on instance A, dispatcher on
  instance B — is runnable end to end, including step (f), "set a breakpoint on a downstream step",
  which is **not currently possible** and is the reason this plan exists.
- A changeset. Patch unless the branch touches `metadata/**`, in which case minor — see
  [`.claude/rules/changesets.md`](../.claude/rules/changesets.md).

---

## Appendix — file map for whoever builds this

| File | Layer | Change |
|---|---|---|
| `packages/Angular/Generic/task-graph-editor/src/lib/task-graph-run-view.component.ts` | L1 | Inputs/outputs for breakpoints + overrides; no operation calls |
| `.../task-graph-canvas-adapter.ts` | L0/L1 | Badge emission for breakpoints; distinct connection styling for overrides |
| `.../task-graph-run-view.component.html/.css` | L1 | Gutter affordance, edge decoration; both themes |
| `packages/Angular/Explorer/dashboards/src/Workflows/components/workflow-runs-resource.component.ts` | L3 | Read `$.debug`; four new `executeControl` calls; actionable stall card |
| `.../workflow-runs-resource.component.html` | L3 | Breakpoint chips, override prompt, intervention dialogs |
| `packages/TaskGraph/src/debug-state.ts` | — | **Read it first.** The state model is the contract |
| `packages/TaskGraph/src/operations/TaskGraphDebugOperations.ts` | — | Input/output shapes for all four unwired verbs |
