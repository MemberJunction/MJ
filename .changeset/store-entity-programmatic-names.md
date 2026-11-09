---
"@memberjunction/core": minor
---

Entity metadata loads are much faster on large schemas. `vwEntities` and `vwEntityFields` no longer compute `CodeName`, `ClassName`, `BaseTableCodeName` and `FieldCodeName` per row with looping scalar functions, which forced a single-threaded plan and repeated each entity's names for every one of its fields. The names are now stored on `Entity` and `EntityField` and kept current by triggers whenever an entity's name, suffix, base table or schema, a field's name, or a schema's `EntityNamePrefix` / `CanonicalSchemaName` changes. Values are identical to before. On a 39,000-field schema the `MJ_Metadata` load drops from 11.5 s to 0.5 s of database time, and eight concurrent loads from 66–79 s each to 3.2 s.
