---
"@memberjunction/search-engine": patch
---

Search results derived from another MJ record are now kept only when the user may read that record. After a content item or chunk passes the entity-level ownership and row-filter check, `SearchEngine` follows it to its `MJ: Entity Record Documents` row (through the root item for a split child, always read via the base `MJ: Content Items`) and verifies the origin record under the origin entity's own permissions and row filters. Content with no Entity Record Document, and every non-content entity, is unaffected in outcome. The gate is the protected `VerifyOriginRecords` hook, so a host can extend it to other derived-content families; it fails closed, scoped to the rows that depended on a failed hop.

**New requirement for who may see content hits.** The walk runs as the user, so anyone who should see chunk hits now needs read on `MJ: Content Items` (not only on the chunks), and anyone who should see hits derived from a record needs read on `MJ: Entity Record Documents`. Without those, chunk hits are dropped (all of them, for the item hop) or the document-bearing ones are (for the document hop). Deployments whose users read chunks under a filter that never reached items should add the item grant.
