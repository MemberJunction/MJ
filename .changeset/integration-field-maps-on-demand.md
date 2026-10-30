---
"@memberjunction/integration-engine-base": patch
"@memberjunction/integration-engine": patch
"@memberjunction/ng-dashboards": patch
---

`IntegrationEngineBase` no longer loads `MJ: Company Integration Field Maps` at startup. A consumer reads the field maps of one entity map on demand with `LoadFieldMapsForEntityMap(entityMapID, contextUser?, provider?)`.

The engine is `@RegisterForStartup`, so every server process and every browser tab loaded the whole field-map table. A deployment with about 86,000 field maps read about 88 MB per load. That result is larger than the per-entry cache limit, so it was never cached and every load went back to the database. On a production API each load blocked the event loop for 9 to 13 seconds. The only reader, the integration mapping workspace, reads one entity map at a time.

- Removed from `IntegrationEngineBase`: the `FieldMaps` getter, `GetFieldMapsForEntityMap`, and the `FieldMaps` option of `SeedForTesting`.
- Removed from `IntegrationEngine`: the `FieldMaps` pass-through. `GetFieldMapsForEntityMap` is replaced by `LoadFieldMapsForEntityMap(entityMapID, contextUser?)`.
- `IntegrationDataService.LoadFieldMaps` reads through `LoadFieldMapsForEntityMap` and now uses the provider it is given.
- `LoadFieldMapsForEntityMap` throws when the read fails, so a failed read is not taken for an entity map with no field maps.
