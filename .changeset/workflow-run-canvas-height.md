---
'@memberjunction/ng-flow-editor': patch
'@memberjunction/ng-task-graph-editor': patch
'@memberjunction/ng-dashboards': patch
---

The workflow canvas fills the space it is given instead of sitting at 400px.

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
