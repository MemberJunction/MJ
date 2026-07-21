---
"@memberjunction/integration-engine": patch
---

Fix (U1): schema-discovery PK overlay now enforces the rsuplan "either/or" rule — a **declared** primary key wins over a **stream-discovered** one, per rsuplan line 29 ("find a primary key … only for objects where there is no primary key defined").

Previously `IntegrationSchemaSync.UpsertField` applied `decideBooleanOverlay` to `IsPrimaryKey` per field with no object-level awareness, so a streamed unique column (e.g. HubSpot `hs_object_id`) was **added on top of** the declared PK (`id`), fabricating a composite key. When the added component was nullable/unpopulated, the generated `spCreate` read-back (`SELECT … WHERE a=@a AND b=@b`) could never match (SQL `x = NULL` is never true) → `"no rows returned"` → 0 rows synced.

The overlay now computes, per object, whether a declared (non-`Discovered`) PK already exists. If it does, discovery may not promote a *different* field to PK — its uniqueness is still recorded via `IsUniqueKey`. Streaming still runs on every object for column/width/custom-field discovery; only the PK promotion is gated. Connectors whose streamed key equals the declared PK are unaffected.
