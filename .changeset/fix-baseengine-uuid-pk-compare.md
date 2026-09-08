---
"@memberjunction/core": patch
---

fix(core): compare UUID primary keys case-insensitively in BaseEngine cache maintenance.

`BaseEngine.findEntityIndexByPrimaryKeys` matched primary-key values with a raw `===`, so a UUID that arrived in different casing from different sources — a client-minted lowercase id from `BaseEntity.NewRecord` vs. an uppercase value loaded from SQL Server — failed to match and the event-driven "not found → add it" branch **appended a duplicate row** into the engine cache (the DB stayed correct; every consumer showed the row twice). The comparison is now driven off metadata — `EntityFieldInfo.IsUniqueIdentifier` (PG-aware) → `UUIDsEqual` for UUID columns, strict `===` for everything else — so no string-shape heuristic and non-UUID keys keep exact equality.
