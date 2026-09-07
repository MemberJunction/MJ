---
"@memberjunction/metadata-sync": patch
---

mj sync push isolates providers per JSON-root graph, not per flattened row. Nested relatedEntities (Action Params under an Action) reuse the parent's provider/TX so child FKs do not wait on an uncommitted parent on another pooled connection.
