---
"@memberjunction/integration-engine": patch
"@memberjunction/server": patch
---

A pull entity map with no field maps is no longer synced, and the post-restart apply builds field maps from the connection's persisted catalog.

- **Engine.** A pull map with no active field maps is skipped right after its field maps load, before the watermark read and before any fetch. The skip records one Critical `CONFIGURATION_ERROR` (the run's ErrorLog is written from it), puts the object on `IncompleteObjects`, emits an `ENTITY_MAP_HAS_NO_FIELD_MAPS` warning and a `sync.entity-map.skipped` event, and counts no records. Before this, the engine fetched the object in full: a soft-key table refused every record (`KEYLESS_RECORD_REFUSED`) and any other table got empty rows. A failed field-map read now throws `FIELD_MAPS_UNREADABLE` and fails that map, instead of reading as "no field maps".
- **Server.** After an apply's restart, each object's field maps come from the connection's persisted ACTIVE field rows (`LoadScopedFieldsForBuild`, now narrowable to named objects). The connector's `IntrospectSchema` runs only for objects with no persisted fields, and only those objects are warmed. Before this, every object was introspected, which is a live re-discovery on a connector whose introspection calls the vendor. A map that still ends with no field maps is logged with `console.error('[RSU] NO FIELD MAPS for …')`, is not counted as mapped, and fails the run's CreateEntityMaps stage with the objects named. Field-map save failures are logged with the entity's error.
