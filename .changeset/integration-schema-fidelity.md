---
"@memberjunction/integration-engine": patch
---

Two catalog-fidelity fixes for the connector discovery/sync pipeline:

- **Width never shrinks on rediscovery (U2).** `IntegrationSchemaSync`'s per-field overlay assigned the rediscovered `MaxLength` directly, so a rediscovery whose sample happened to be narrower than a prior run shrank the persisted `IOF.Length`. RSU only ever widens the physical column (never shrinks it), so the catalog drifted below the column (catalog `nvarchar(128)` vs column `nvarchar(512)`) and a later apply keyed off the catalog could truncate a value the wider column still holds. The overlay is now a pure `decideLengthOverlay` that grows the persisted width but never shrinks it (a null/undefined source width is "no opinion" — the persisted value sticks).

- **Stale overflow keys are evicted on re-sync (U4), which also stops phantom promotion (U3).** The custom-overflow write only fired when a record had unmapped fields, so when a source column vanished the record's unmapped set emptied, the write was skipped, and the prior overflow JSON (with the now-gone key) stuck around forever — where a coverage scan could still promote it to a real column. The write now reconciles to the record's CURRENT unmapped keys on every sync (`reconcileOverflowValue`), clearing the column to null when there are none, so a vanished key is evicted the next time its row is synced. Byte-identical for customs-free rows (writing null to an already-null column is a no-op under dirty tracking).

Both are extracted as pure, unit-tested decision functions (`decideLengthOverlay`, `reconcileOverflowValue`) matching the existing `decideBooleanOverlay` pattern. Code-only, no migration.
