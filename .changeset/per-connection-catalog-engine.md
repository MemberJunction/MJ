---
"@memberjunction/integration-engine-base": minor
"@memberjunction/integration-engine": minor
---

Per-connection integration catalog, engine half: a resolution API and catalog scope (`WithCatalogScope`/`RunInCatalogScope`), a `CatalogSource` flag (`Shared` | `PerConnection`, per connection or via `MJ_INTEGRATION_CATALOG_SOURCE`), and a catalog writer that persists discovery into the connection's own rows and rebases them from the declared definition. Flag off is byte-identical behaviour. `MJ_INTEGRATION_CATALOG_STRICT=1` makes the declared catalog read-only at runtime.
