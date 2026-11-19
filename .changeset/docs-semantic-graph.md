---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/integration-test-suite": minor
---

MJ Docs feed the semantic graph as they are saved, and what the graph shows from a document follows the document's own permissions (minor: adds `MJ: Graph Concepts.Origin` and seeds a content source, graph and edge types).

- **Artifact indexing.** `ArtifactGraphIndexer` (started by `ContentPipelineStartup`) pushes the latest version of each artifact into every push-only Content Source whose `Configuration.Artifacts.ArtifactTypes` names its type: one Content Item per artifact, debounced per artifact, linked to the `MJ: Artifacts` record. A deleted or emptied artifact is taken out of the index. Seeded: content source "MJ Docs" (Markdown Document artifacts, deterministic concept synthesis, so no LLM key is required) feeding a new Knowledge graph, "Library Knowledge".
- **Text ingest.** `ContentUploadIngestor.IngestText` / `RemoveText` index text that belongs to an entity record without an `MJ: Files` row, at a `record://<entity>/<id>` URL; unchanged text keeps the item (updating its name and description if the record was renamed) and changed text replaces it. `Remove` accepts these items as well as `upload://` ones.
- **Links and relatedness.** `[[Name]]` in a document becomes a `LinksTo` `MJ: Record Links` row to the artifact of that name (reconciled on every save), projected by the graph's Record Link edge provider. Names are matched case-insensitively and resolved as the document's owner, so a link only points at an artifact its author can open. Deleting an artifact deletes the links to and from it. New `SharedConceptEdgeProvider` relates two records that were sources of the same concept (`SharesConceptWith`), derived on read as the viewer, from `Approved` evidence in the requested graph (plus `Proposed` when the request asks for it, through the new `GraphEdgeRequest.IncludeProposed`). New edge types `LinksTo` and `SharesConceptWith`.
- **Retraction.** Deleting a content item or chunk now retracts the `Inferred` edges the Graph stage wrote for it (inside a new pipeline retraction scope that `MJGraphEdgeEntityServer` honours for `Inferred` edges only), and deletes a synthesized concept left with no source unless it is `Approved` in a Canon graph, has children or carries a `Declared` edge.
- **Provenance.** `MJ: Graph Concepts` gains `Origin` (`Declared` | `Inferred`; existing concepts with `SourcedFrom` edges are backfilled `Inferred`). The Graph stage marks what it creates `Inferred`, and the provenance policy hides an `Inferred` concept with no source left instead of treating it as authored. A concept whose sources the viewer can read only in part is redacted.
- New deterministic integration test IT180 (`docs-semantic-graph`) proves the path against a live database, including that a document's items and chunks are visible exactly when `ArtifactPermissionEngine` lets the viewer read the document.
