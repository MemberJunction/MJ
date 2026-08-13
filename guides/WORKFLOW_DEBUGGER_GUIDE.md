# Workflow Debugger

**Read this when a run is stuck, took the wrong branch, or you need to step through a live graph.** Companion to the [Workflows and Task Graphs Guide](WORKFLOW_AND_TASK_GRAPH_GUIDE.md) (what a workflow *is*) and [`packages/TaskGraph/README.md`](../packages/TaskGraph/README.md) (how the engine runs it).

The typical path is **Agent form → Run → Debug**. That starts the Flow agent *paused* — `$.debug.paused` is written on the parent row at Submit, so the dispatcher cannot claim the first step before you arrive. Workflows → Runs is the review console for a graph that is already going (or already finished). You cannot re-run a Flow agent from Runs; open the agent and Debug again.

![Run console with debug chrome](images/workflow-debugger/console.png)

---

## What you are looking at

A parent `MJ: Tasks` row **is** a run. Open it and the right pane is the console:

| Piece | What it is |
|---|---|
| Canvas | The graph, live. Conditional edges show their expression. An operator-forced path is **dotted** with a hand icon — never dashed. Dashed still means "this edge is conditional." |
| Runner controls | Continue (F5) / Step Over (F10) / Step Into (F11) / Stop (Shift+F5). These gate **claiming**, not running. In-flight work finishes. When every step is done the bar shows **Finished**, not Paused. |
| Canvas tools | Minimized by default (wrench chip, top left). Expand for zoom / pan / fit. Hide leaves a recover tab. |
| Breakpoint | Red circle on the selected step (hollow = off, filled = on). Same badge on the node. |
| Stall card | A held path names the condition and offers **Answer true / Answer false / Leave held**. |
| Inspector | The selected step or edge. Break-before-this-step, skip, edit input, retry, force complete. Invocation `data`/`context` sit at the top — that is what conditions evaluate against. |

The run view also embeds in the agent-run timeline (chrome off — that surface is a recording) and in the test harness (chrome **on** when you clicked Debug).

---

## How to debug from the Agent form

1. Open the Flow agent. Click **Run**.
2. Click **Debug**, not Run workflow. The live graph appears under the buttons as soon as Submit lands — do not wait for the agent run to finish (it is parked until you continue).
3. Run workflow / Debug hide once the debugger is live — the VCR is the session. Continue (F5) / Step Over (F10) / Step Into (F11) / Stop (Shift+F5). The waiting step pulses with **Waiting on you**. Right-click a step to add or remove a breakpoint (F9). Right-click a conditional edge to force the path. The canvas tool strip starts minimized (wrench, top left). VARIABLES under the canvas is Input / Output / Invocation.
4. Close the dialog if you want — the dispatcher still owns the graph. Re-open Runs to find it later. The same chrome is on Workflows → Runs.

Start-paused cannot be a Pause clicked after submit. The first dispatcher poll would claim work first.

---

## How to debug a live run already in flight

1. Open **Workflows → Runs** and select a running (or just-submitted) graph.
2. **Pause**, or arm a breakpoint on the interesting step (red circle after selecting the node) and **Continue**.
3. When the graph stops, the paused-here badge and chip name the step. Inspect its input. Edit it if the brief is wrong, then **Step**.
4. If the stall card says a path can't be answered, that is a held exclusive group. Answer the condition or fix the invocation roots and resume.
5. **Resume** to run freely to the next breakpoint, or **Step** / **Step wave** to walk.

A breakpoint pauses the **whole graph** before the named step is claimed. Siblings do not start. That is what "pause here" means on a parallel graph.

![Breakpoint armed and hit](images/workflow-debugger/breakpoint.png)

---

## The four verbs the console now calls

| Verb | When | What it does |
|---|---|---|
| `TaskGraph.SetBreakpoints` | Any time | **Replaces** the breakpoint set. Empty array clears. |
| `TaskGraph.OverrideEdge` | A **conditional** edge | `'true'` opens the gate, `'false'` is branch-not-taken (skip cascade), `null` clears. Unconditional edges refuse — skip the step instead. |
| `TaskGraph.UpdateTaskInput` | Step is **Pending** | Replaces this run's input. Invalid JSON is refused in the UI. |
| `TaskGraph.RetryTask` + `inputPayload` | Step is **Failed** | Edit the brief and re-queue. |
| `TaskGraph.ForceCompleteTask` | Pending / Failed / Blocked, not a human step, not a live claim | Marks the step Complete with an operator-supplied **output**. Downstream conditions evaluate against it. Typed confirmation required. |

Pause / Resume / Step / Cancel / Skip / Retry were already wired.

![Held path stall card](images/workflow-debugger/held-path.png)

---

## How to read the picture

- **Grey / skipped** — the graph chose another route. Normal. Not a failure.
- **Dashed + condition text** — a real conditional edge. The label is the expression.
- **Dotted + hand + "forced yes/no"** — **you** answered this path. The run history must never look like the condition evaluated that way on its own.
- **Red circle badge / chip** — breakpoint armed.
- **Pause badge** — the graph stopped here.

State is read from `$.debug` on the parent row, not accumulated from frames. Refresh the page and the armed set is still there. Frames (`BreakpointHit`, `GateDecision`, …) are how the console learns *quickly*; the row is how it stays honest.

---

## Who can drive it

Debug verbs write through guarded SQL, so they authorize explicitly: the graph's recorded owner, or an Owner-type user. Everyone else sees a clear refusal, not a silent no-op.

Two consoles on the same run share the row. `SetBreakpoints` replaces the whole set — if someone else armed one while you were looking, a stale write would drop theirs. The console re-reads immediately before composing.

---

## What this is not

- Not a second canvas. The authoring canvas grew badges and a connection event; `flow-editor` is untouched.
- Not cross-run breakpoint persistence. "Always break on this step of this workflow" is a design-time feature and a separate piece of work.
- Not a live channel to a worker. Every control is a row write. Every dispatcher instance obeys within one poll.

---

## Related

- [Workflows and Task Graphs](WORKFLOW_AND_TASK_GRAPH_GUIDE.md) — definitions, conditions, failure, payload dialect.
- [`packages/TaskGraph/README.md`](../packages/TaskGraph/README.md) — dispatcher, claims, remote operations.
- [`packages/TaskGraph/src/debug-state.ts`](../packages/TaskGraph/src/debug-state.ts) — the durable state contract.
- [UI Layering](UI_LAYERING_GUIDE.md) — why the L1 widget emits intent and L3 owns every `RouteOperation`.
