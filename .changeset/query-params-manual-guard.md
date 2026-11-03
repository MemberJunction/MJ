---
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
---

Query extraction and MetadataSync pull fixes on top of #6124.

- `MJQueryEntityServer` looks up an existing `MJ: Query SQLs` dialect row through the query's own provider instead of `QueryEngine`'s cache. A cached row is bound to the provider that loaded the engine, so saving it wrote outside the caller's transaction and could miss rows that transaction had just written.
- MetadataSync pull, `merge` strategy: `embeds` now merge by name, like `collections`. A pulled embed replaces the one with the same name, and one the pull did not produce is kept. Before, any pulled embed replaced the whole block.
- MetadataSync pull, `overwrite` strategy: unchanged. The file gets the pulled `collections`, `embeds` and `extension`, and drops any the pull did not produce.
- Tests: `Manual` query parameters keep every attribute and are never removed by extraction, including when extraction finds no parameters.
