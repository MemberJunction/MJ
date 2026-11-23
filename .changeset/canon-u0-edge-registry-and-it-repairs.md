---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/integration-test-suite": minor
---

Canon unification phase U0 (findings F3, F4, F11) and three integration-check repairs.

- **Edge type registry (F3).** Seeds the edge types the derived providers emit (`Subsets`, `Is A`, `References`, `Reads`, `Composes`, `Field Of`) as provider-only rows, plus `Same As` and `Preferred Over`. Retires `NarrowerThan` as a stored type (it is BroaderThan's inverse label; `AllowStored = 0`). Seeds `MJ: Graph Edge Type Endpoints` rows for `Defines`, `Describes`, `Measures` and `Implements`. A unit test fails when a provider or the synthesizer emits an edge type name with no seeded row.
- **One direction for the concept edges (F4).** `Defines`, `Describes`, `Measures` and `Implements` run artifact to concept. The Content Pipeline synthesizer now writes them that way, so a pipeline-trained metric concept appears in `ExplainEntity`'s `MeasuringQueries`. Two on-demand FieldRules Record Processes (dry run first) flip edges stored the old way and retype `NarrowerThan` edges.
- **Proposers check the contract before writing.** `EntityGraphOverlayStore` refuses, logs and counts (`RejectedEdgeCount`) an edge whose type has no row or whose endpoints break the type's endpoint rows. `GraphEdgeEndpointAllows` is the shared rule.
- **Delete stages (F11).** `GraphEvidenceRetractor` already removes the `Inferred` edges both delete stages leave behind; `DeleteStage` now also keeps a chunk as a tombstone while a `Declared` graph edge still names it, so that edge never points at nothing.
- **Integration checks.** `fls-closeout-client` probes REST readiness on a scoped route, so CW7/CW8 no longer run before MJAPI's scope cache has the minted key's `full_access` rule (REST enforces key scopes since MJ 6817). `work-bus-core` gives the context user an active Chief of Staff policy for WBC10 (wakes need one since MJ 6825) and restores it in teardown.
