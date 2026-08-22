---
'@memberjunction/integration-engine': patch
---

Carry the declared primary key through a REST connector's DiscoverFields

`BaseRESTIntegrationConnector.FieldEntityToSchema` — the converter every declarative REST
connector's `DiscoverFields` runs each cached field through — set
`IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey` and never set `IsPrimaryKey`. The initial apply
builds each field map from `DiscoverFields` with `fm.IsKeyField = field.IsPrimaryKey ?? false`, so
newly applied objects on such a connector got keyless field maps and reported "NO KEY FIELD: every
row is unmatchable, so writes cannot be reconciled" even though their catalog declared the key
correctly. The other two field-map writers read the entity rows straight off the engine cache and
were unaffected — which is why the symptom appears only on freshly applied objects. `IsUniqueKey` is not a substitute — a primary key is one of possibly
several unique fields, and IsKeyField was deliberately narrowed from unique to primary (PK ≠
unique), which is what turned this omission from a lost flag into a silent no-sync.

`BuildSourceObjectInfo`, the sibling converter over the same entity in the same class, has always
propagated `IsPrimaryKey`; only this one did not.
