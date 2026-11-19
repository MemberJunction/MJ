---
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
---

A query's stored `DefinitionFingerprint` now counts dialect rows written after the query. A metadata push writes a query's `relatedEntities` rows (its `MJ: Query SQLs` variants) after the query itself, so the fingerprint the query's save stamped left them out, and the next save of the query changed it. Saving or deleting a dialect row on its own now re-stamps the parent's fingerprint; a row written during its query's own save is left to that save, which stamps last. Lists compared the stored value when showing whether a source changed, so a linked list could show a false "Source changed".

New integration check IT140 MSQ11 pushes a query with a dialect variant under `relatedEntities` and checks the stored fingerprint matches the stored definition.
