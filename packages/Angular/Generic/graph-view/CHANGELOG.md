# @memberjunction/ng-graph-view

## 6.1.0-edge.3

### Minor Changes

- 47930ef: Add reusable generic `@memberjunction/ng-graph-view` Angular component with physics force relaxation, circular layouts, zoom/pan controls, search filtering, and cancelable Before/After event suite. Add modern hero headers and 4-card overview mini-dashboards for AIAgentCategories, Conversations, Employees, Companies, and Users in `@memberjunction/ng-core-entity-forms`.
- b5fd530: Record graph-view's d3 / @types/d3 in the lockfile so CI frozen-lockfile install succeeds, and reword a CodeGen comment that tripped the hard-coded `__mj` schema gate.

### Patch Changes

- c581b4f: Close the #3874 adversarial review. SkipRelatedCollections persists embeds while collections stay with the caller. The graph-node recursion guard is private on BaseEntity (IsGraphNodeSave is gone from EntitySaveOptions). Result serialize adopts saved peers; a rolled-back graph reverts in-memory saved/dirty so retry works. Two same-entity embeds no longer false-cycle. Ensure, Load, NewRecord FK, CodeName emission, core-schema imports, IT85/EE5, graph-view UUID links, focal-node dblclick, and default excludeSchemas no longer dropping core form tabs.
- 8624f1e: Compare graph node/edge record IDs with `UUIDsEqual()` instead of `===`.

  These are entity primary keys — `NavigateToEntity` passes `node.ID` through `CompositeKey.FromID()` into `OpenEntityRecord` — and SQL Server returns UUIDs uppercase while JS-generated ones are lowercase, so `===` silently failed to match across that boundary. Node selection, edge highlighting, hop expansion and edge-count all missed depending on where the ID came from.

  Twelve comparisons changed. Eleven were reported by `UUIDCompliance.test.ts`, whose failure also took the whole unit-test job down (it runs in `@memberjunction/global` but scans the repo, and turbo fails fast). The twelfth — `GetNodeEdgeCount`'s `e.SourceID === id || e.TargetID === id` — was not flagged, because the test's pattern matches `.ID ===` and those read `.SourceID ===` / `.TargetID ===`: the same UUIDs and the same defect, invisible to the gate.

  The template comparison became a component method (`IsNodeSelected(node)`), since an Angular template cannot call an imported function. Null semantics are unchanged: `UUIDsEqual` treats null-vs-value as false, exactly as `SelectedNode?.ID === node.ID` did when nothing was selected.

- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3
