---
"@memberjunction/ng-graph-view": patch
---

Compare graph node/edge record IDs with `UUIDsEqual()` instead of `===`.

These are entity primary keys — `NavigateToEntity` passes `node.ID` through `CompositeKey.FromID()` into `OpenEntityRecord` — and SQL Server returns UUIDs uppercase while JS-generated ones are lowercase, so `===` silently failed to match across that boundary. Node selection, edge highlighting, hop expansion and edge-count all missed depending on where the ID came from.

Twelve comparisons changed. Eleven were reported by `UUIDCompliance.test.ts`, whose failure also took the whole unit-test job down (it runs in `@memberjunction/global` but scans the repo, and turbo fails fast). The twelfth — `GetNodeEdgeCount`'s `e.SourceID === id || e.TargetID === id` — was not flagged, because the test's pattern matches `.ID ===` and those read `.SourceID ===` / `.TargetID ===`: the same UUIDs and the same defect, invisible to the gate.

The template comparison became a component method (`IsNodeSelected(node)`), since an Angular template cannot call an imported function. Null semantics are unchanged: `UUIDsEqual` treats null-vs-value as false, exactly as `SelectedNode?.ID === node.ID` did when nothing was selected.
