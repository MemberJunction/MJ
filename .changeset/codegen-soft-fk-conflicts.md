---
"@memberjunction/codegen-lib": patch
---

CodeGen checks soft foreign keys from `additionalSchemaInfo` before writing them (#4532).

- **Conflicting declarations are not resolved by file order.** A field declared as a soft FK to more than one target got one `UPDATE` per declaration, so the last one in the file won silently. CodeGen now reports such a field as an error, naming every target, and leaves it as it is; the other fields still apply. Declarations that differ only in letter case count as one.
- **The target column must exist.** A target column the related entity does not have is skipped with a warning instead of being written into metadata. The name matches case-sensitively on PostgreSQL, where `ID` and `id` are different columns. On SQL Server the column's real name is written.
- **Non-unique targets are flagged.** A target that is neither a single-column primary key nor unique (for example one column of a composite primary key) is still applied, with a warning that a join on it can return more than one row. A column of a multi-column primary key counts as not unique even when its `IsUnique` flag is set, which it was on a live SQL Server run.
- **`IsUnique` alone is checked against the unique indexes.** Schema sync sets `IsUnique` on every column of a composite unique constraint, and on the INCLUDE columns of a unique index. A target that only `IsUnique` vouches for is now looked up in the database's unique indexes, on SQL Server and PostgreSQL. It counts as unique only with a unique index of its own; otherwise it gets the same warning. A view, a failed lookup, or a provider without the new `GetUniqueIndexMembershipSQL` keeps the flag's answer.
- **Soft primary keys are applied first.** Every table's soft primary keys are written before any foreign key is checked, so the uniqueness check sees them whatever the order of the tables in the file.
