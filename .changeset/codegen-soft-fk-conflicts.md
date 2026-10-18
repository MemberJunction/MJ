---
"@memberjunction/codegen-lib": patch
---

CodeGen checks soft foreign keys from `additionalSchemaInfo` before writing them (#4532).

- **Conflicting declarations are not resolved by file order.** A field declared as a soft FK to more than one target got one `UPDATE` per declaration, so the last one in the file won silently. CodeGen now reports such a field as an error, naming every target, and leaves it as it is; the other fields still apply. Declarations that differ only in letter case count as one.
- **The target column must exist.** A target column the related entity does not have is skipped with a warning instead of being written into metadata. The name matches case-sensitively on PostgreSQL, where `ID` and `id` are different columns. On SQL Server the column's real name is written.
- **Non-unique targets are flagged.** A target that is neither a single-column primary key nor unique (for example one column of a composite primary key) is still applied, with a warning that a join on it can return more than one row. A column of a multi-column primary key counts as not unique even when its `IsUnique` flag is set, which it was on a live SQL Server run.
- **Soft primary keys are applied first.** Every table's soft primary keys are written before any foreign key is checked, so the uniqueness check sees them whatever the order of the tables in the file.
