---
"@memberjunction/integration-schema-builder": minor
"@memberjunction/integration-engine": minor
"@memberjunction/server": minor
---

Integration framework hardening for wide-catalog and multi-level connectors (extracted from the 20-connector close-out; no connector-specific code).

- **Wide-table safety (SQL Server 8060 row-size + 1024-column limits).** `SchemaBuilder` now computes each new table's minimum in-row footprint and, on SQL Server, keeps all primary-key columns + a declared-priority core subset within an ~8000-byte budget, defers the rest (they still sync and land in `__mj_integration_CustomOverflow`), and emits a structured warning instead of shipping a table that fails every `INSERT` with `Cannot create a row of size … greater than 8060`. No-op on PostgreSQL (TOAST). `IntegrationEngine` adds an env-clamped per-table column ceiling (`MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE`, max 1000 = SQL Server's 1024 minus framework column headroom) so column-count-driven failures degrade to a reversible auto-disable at apply time. Proven on netFORUM (wide objects 8/17 → 15/17, zero 8060 INSERT failures); 17 row-size unit tests.

- **Multi-level template-var traversal.** `BaseRESTIntegrationConnector.ResolveParentForVar` adds a per-variable parent map (`Configuration.parentObjectNames` `{ "<var>": "<SiblingObject>" }`, with optional `parentObjectIDFieldNames`), checked before the existing single-valued `parentObjectName`. This lets a path with more than one template variable (e.g. `/events/{eventCode}/sessions/{sessionCode}/…`) resolve each variable to its own parent object instead of collapsing both to one parent and tripping the `PARENT_CYCLE` guard (→ 0 rows). Backward-compatible: connectors that declare no `parentObjectNames` are unaffected.

- **Large-catalog ApplyAll performance.** `IntegrationDiscoveryResolver.createEntityAndFieldMaps` reuses the already-in-memory persisted field schema (built in Phase 1) instead of issuing a live per-object `DiscoverFields` describe in a sequential loop, and resolves the target entity via an `O(1)` `schema.table → EntityInfo` map instead of an `O(N²)` scan. This removes the per-object round-trips and ~millions of comparisons that pushed very large catalogs (e.g. Salesforce's ~1,695 objects) past the client timeout with zero maps created.
