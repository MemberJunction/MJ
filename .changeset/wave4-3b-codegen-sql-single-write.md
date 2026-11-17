---
"@memberjunction/codegen-lib": patch
---

Wave 4.3b CodeGen SQL single-write and query plan optimizations:
- Single-write `[__mj_UpdatedAt] = GETUTCDATE()` in generated `spUpdate*` stored procedures when updatable fields exist, paired with an `IF NOT UPDATE([__mj_UpdatedAt])` guard in `trgUpdate*` triggers to eliminate double clustered-index writes on CRUD updates while maintaining automatic trigger updates for ad-hoc SQL.
- Collapse SQL Server `fn*GetHierarchyMeta` table-valued function from triple CTE evaluations to a single scan with `OUTER APPLY` for `ChildCount` and `IsLeaf`.
- Join physical `RecordGeoCode` base table instead of `vwRecordGeoCodes` view in generated views, eliminating 3 transitive joins to `Entity`, `Country`, and `StateProvince`.
- Automatically index polymorphic foreign-key column pairs (`EntityField.EntityIDFieldName`, such as `RecordID` + `EntityID`) on bounded columns in `GenerateForeignKeyIndexes`.
