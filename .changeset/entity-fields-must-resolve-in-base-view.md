---
'@memberjunction/codegen-lib': patch
---

Catch entity fields the base view cannot produce, and repair `vwEntities` on PostgreSQL

`validateEntityFieldsResolve()` cross-checks every entity's declared fields against the columns its base view actually produces. It is the read-side counterpart to `validateExpectedCRUDFunctions`: that one asks whether the runtime can write an entity, this asks the prior question of whether it can read it at all. Deliberately not filtered by `excludeSchemas`, because excluded schemas are exactly where nothing else is watching and where the drift is permanent. Reported but non-fatal by default; `MJ_CODEGEN_STRICT_FIELD_RESOLUTION=true` makes it a hard gate.

The condition it catches is live on PostgreSQL: the PG port of the v5.45 External Data Sources migration registered `EntityField` rows for `ExternalDataSourceID` and `ExternalObjectName` without rebuilding `__mj.vwEntities`, so the metadata promises two columns the view cannot produce and every read of `MJ: Entities` fails. A grid renders that as "no data" rather than an error. A PG-only migration repairs the view in place by wrapping its existing definition, which leaves dependent functions, grants and views intact.
