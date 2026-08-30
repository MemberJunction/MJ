---
"@memberjunction/integration-engine": patch
---

A connector can declare a source field excluded from sync.

There was no way to say "do not sync this field". The nearest lever — deactivating its field map — does not exclude the value, it **reroutes** it: `FieldMappingEngine` captures every unmapped source key into `UnmappedFields`, the writer parks it in `__mj_integration_CustomOverflow`, and the custom-column promoter can later resurrect it as a real column. So the field costs more, not less.

`SourceFieldInfo.SyncDirective?: 'Sync' | 'Exclude'` closes that. `undefined` means Sync, so connectors that predate this behave exactly as before.

- **Persisted with no migration.** `IntegrationSchemaSync` writes the directive into `IntegrationObjectField.Configuration`, an existing JSON column. Overlay semantics match every other attribute — a stated directive wins, a silent connector preserves what is stored — so an operator-set directive survives connectors that never heard of the feature.
- **Stripped before flatten and before mapping.** An excluded key reaches neither `MappedFields`, nor `UnmappedFields` (and so never the overflow column), nor the content hash, whose basis is `MappedFields`. An excluded field therefore stops influencing change detection entirely, rather than quietly forcing rewrites. The no-exclusions path allocates nothing.
- **Visible in the run log.** The engine resolves the exclusion set once per entity map and emits `sync.entity-map.exclusions` naming what was withheld.

Existing columns are untouched: exclusion stops fetching into them, and dropping a column stays an operator decision.
