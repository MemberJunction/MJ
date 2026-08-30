---
'@memberjunction/codegen-lib': patch
---

Catch entity fields the base view cannot produce

`validateEntityFieldsResolve()` cross-checks every entity's declared fields against the columns its base view actually produces. It is the read-side counterpart to `validateExpectedCRUDFunctions`: that one asks whether the runtime can write an entity, this asks the prior question of whether it can read it at all. Deliberately not filtered by `excludeSchemas`, because excluded schemas are exactly where nothing else is watching and where the drift is permanent. Reported but non-fatal by default; `MJ_CODEGEN_STRICT_FIELD_RESOLUTION=true` makes it a hard gate.

The condition it catches has been live on PostgreSQL: the PG port of the v5.45 External Data Sources migration registered `EntityField` rows for `ExternalDataSourceID` and `ExternalObjectName` without rebuilding `__mj.vwEntities`, so the metadata promised two columns the view could not produce and every read of `MJ: Entities` failed — rendered by a grid as "no data" rather than as an error, which is why an install could sit like that for months. That specific drift is repaired by `V202608202230__v6.1.x__PG_CodeGen_Regen.pg-only.sql`, which rebuilds the four affected core views. What was missing was anything that *notices*; this is that.
