---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": patch
"@memberjunction/api": patch
"@memberjunction/ng-core-entity-forms": patch
---

feat(codegen,core): full-stack recursive foreign key support with automated TVF suites, base view projections, and hierarchy traversal APIs

- **Database / TVF Suite**: CodeGen automatically emits 4 table-valued functions per recursive self-referencing foreign key on both SQL Server (T-SQL) and PostgreSQL (PL/pgSQL):
  - `fn<Table><Field>_GetHierarchyMeta` (computes `RootID`, `Depth`, materialized `Path`, `IsLeaf`, and `ChildCount`)
  - `fn<Table><Field>_GetDescendants` (full subtree retrieval with cycle detection)
  - `fn<Table><Field>_GetAncestors` (materialized path-based ancestor retrieval)
  - `fn<Table><Field>_GetRootID` (top-level root resolver)
- **Base View Projections**: Every base view (`vw<Entities>`) automatically joins the hierarchy metadata via lateral joins (`OUTER APPLY` in SQL Server, `LEFT JOIN LATERAL` in PostgreSQL), projecting `[Root<Field>]`, `[<Field>Depth]`, `[<Field>Path]`, `[<Field>IsLeaf]`, and `[<Field>ChildCount]`.
- **`BaseEntity` & Generated Subclasses**:
  - `BaseEntity` in `@memberjunction/core` provides generic hierarchy traversal methods `GetDescendants<T>()`, `GetAncestors<T>()`, and `GetChildren<T>()` with automated `ParentID` and recursive FK resolution.
  - CodeGen generates strongly-typed convenience methods (`entity.GetDescendants()`, `entity.GetAncestors()`, `entity.GetChildren()`) on all generated entity subclasses with self-referencing foreign keys.
- **Documentation**: Added comprehensive architectural documentation in [`guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md`](guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md) and cross-referenced in package READMEs.
