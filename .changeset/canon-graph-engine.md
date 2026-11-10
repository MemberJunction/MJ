---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/core-actions": minor
---

Add `GraphEngine`, `CanonGraphEngine` (including `RenderCanonDocument` for collapsing the full Canon or a query/seed-scoped subgraph into a deterministic Markdown domain-knowledge document), `BaseGraphEdgeProvider`, 3 Metadata-Scale edge providers (`AlternateBaseViewEdgeProvider`, `EntityMetadataEdgeProvider`, `QueryMetadataEdgeProvider`), 4 Data-Scale edge providers (`ForeignKeyEdgeProvider`, `JoinEntityEdgeProvider`, `QueryEdgeProvider`, `RecordLinkEdgeProvider`), server-side validation subclasses (`MJGraphEdgeEntityServer`, `MJGraphEdgeTypeEntityServer`, `MJGraphEdgeProviderEntityServer`), `"MJ Canon"` + `"Graph: Approve Edges"` metadata seeds, the `Get Graph Context` action, and the `Canon` section on `Get Entity Details`.
