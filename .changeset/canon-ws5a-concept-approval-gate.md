---
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/content-pipeline": patch
"@memberjunction/ng-graph-view": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/integration-test-suite": patch
---

Gate `MJ: Graph Concepts` approval, deprecation, governed-field edits, and protected deletes behind the `Graph: Approve Edges` authorization, matching `MJ: Graph Edges`:

- `MJGraphConceptEntityServer` requires `Graph: Approve Edges` when creating an `Approved` or `Deprecated` concept, transitioning into or out of `Approved` or `Deprecated`, modifying governed fields on an `Approved` or `Deprecated` concept, or deleting a concept that is not `Draft` or `Proposed`. Brand-new policy-approved concept creates from the Content Pipeline `Graph` stage are allowed inside `GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION`, while edits to existing governed concepts remain refused.
- `ResolverBase` forces `MustLoadTruthFromDatabase` on `mj: graph concepts` so stored `Status` and `Dirty` governed columns always evaluate against the database row.
- `EntityGraphOverlayStore.UpsertConcept` preserves existing `Approved` and `Deprecated` concepts without overwriting them and scopes saves to `MJ: Graph Concepts` under `GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION`.
- `GraphViewComponent` (`CanApproveNodes`, default `false`) and `SemanticGraphExplorerComponent` hide and block the "Approve into Canon" action unless the caller holds `Graph: Approve Edges` (tested via `CanUserApproveGraph`).
- Integration test bundle `graph-runtime` (`IT167`) extends `GR3` and adds `GR7` (mutation tier) to verify concept approval, edit, deprecation, delete, and Content Pipeline preservation end to end.
