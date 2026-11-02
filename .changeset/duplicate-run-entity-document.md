---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/ai-vectors-memory": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-core-entity-forms": minor
---

A duplicate run records the Entity Document it ran with, and the in-memory vector store scores matches as cosine similarity, like every other vector database.

- **`MJ: Duplicate Runs` gains a required `EntityDocumentID`.** Before, a run carried only its entity and the server used the entity's newest active Record Duplicate document, so with two documents for one entity the document picked in the Duplicates tab was ignored, and nothing recorded which document produced a run's matches. The migration backfills existing runs from their entity's documents (Record Duplicate first, then Active, then the most recently updated), deletes runs whose entity has no document left, then makes the column NOT NULL.
- **The run uses the document it names.** The Duplicates tab sends the selected document; the server fails a run whose document is missing or belongs to another entity. A run created without one on the server (`GetRecordDuplicates`, scripts) gets the entity's Record Duplicate document, as before, and now records it.
- **The board shows the selected document's run**, not the newest run of any document for that entity.
- **An Entity Document with history can no longer be deleted.** `MJ: Entity Documents` no longer cascades deletes (`metadata/entities/.entity-cascade-deletes-entity-documents.json`), so a document with duplicate runs or synced vectors is refused by its foreign keys before anything is removed, and its history stays as an audit trail. Set a document that is no longer needed to Inactive instead. Before, a delete that a child refused had already deleted the document's vectors.
- **`SimpleVectorService` gains a `cosine-similarity` metric, and `SimpleVectorServiceProvider` searches with it.** The existing `cosine` metric reports `(cos + 1) / 2`, and the provider passed that through, while Pinecone, SQL Server and pgvector report the standard cosine. Thresholds that read these scores (an Entity Document's match thresholds, search's `MinScore`) therefore meant a looser similarity on the in-memory store: 0.92 matched at cosine 0.84. `cosine-similarity` is the standard cosine in [-1, 1]; `cosine` and every other metric are unchanged, so the store's other callers keep their scores. Thresholds tuned against the in-memory store before this change need re-tuning: the new value is `2 × old − 1`.
