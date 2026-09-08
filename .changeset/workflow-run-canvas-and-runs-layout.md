---
'@memberjunction/ng-flow-editor': minor
'@memberjunction/ng-task-graph-editor': minor
'@memberjunction/ng-dashboards': minor
'@memberjunction/ng-core-entity-forms': minor
---

A workflow run now draws what happened, and the Runs surface remembers how you arranged it.

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
*could* be taken, which is exactly what an author is arranging.

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
