---
'@memberjunction/integration-engine': patch
---

Carry the declared primary key through a REST connector's DiscoverFields

`BaseRESTIntegrationConnector.FieldEntityToSchema` — the converter every declarative REST
connector's `DiscoverFields` runs each cached field through — set
`IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey` and never set `IsPrimaryKey`. An apply builds each
field map with `fm.IsKeyField = field.IsPrimaryKey ?? false`, so every field map of every
declarative REST connector was created keyless, and `object-state`-style checks reported
"NO KEY FIELD: every row is unmatchable, so writes cannot be reconciled" for objects whose catalog
declared the key correctly. `IsUniqueKey` is not a substitute — a primary key is one of possibly
several unique fields, and IsKeyField was deliberately narrowed from unique to primary (PK ≠
unique), which is what turned this omission from a lost flag into a silent no-sync.

`BuildSourceObjectInfo`, the sibling converter over the same entity in the same class, has always
propagated `IsPrimaryKey`; only this one did not.
