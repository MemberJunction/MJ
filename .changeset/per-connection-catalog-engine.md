---
"@memberjunction/integration-engine-base": minor
"@memberjunction/integration-engine": minor
---

Per-connection integration catalog, engine half: a resolution API and catalog scope (`WithCatalogScope`/`RunInCatalogScope`), a `CatalogSource` flag (`Shared` | `PerConnection`, per connection or via `MJ_INTEGRATION_CATALOG_SOURCE`), and a catalog writer that persists discovery into the connection's own rows and rebases them from the declared definition. Flag off is byte-identical behaviour. `MJ_INTEGRATION_CATALOG_STRICT=1` makes the declared catalog read-only at runtime. The per-connection rows are never loaded at boot: a catalog scope loads its connection's objects and a narrow dependency-edge set, and field rows are warmed per object into a row-bounded cache that the sync loop warms and pins around each entity map. Catalog reads made during a run (the scope's loads, the catalog store, the catalog writer) bypass the query-result cache, whose entries for these entities are not invalidated by the run's own writes.
