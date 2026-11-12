---
"@memberjunction/codegen-lib": minor
---

A column of a multi-column foreign key now gets a related entity only when the column it references
is unique on its own: a single-column primary key, or the sole key of an unfiltered unique index.
CodeGen used to give every component a RelatedEntityID, so a component that references a non-unique
column (typically a copy of the parent's own key) got a label join that multiplied rows in the base
view. The SQL Server and PostgreSQL new-field queries and `spUpdateExistingEntityFieldsFromSchema`
(SQL Server by migration, PostgreSQL in the support objects) drop those components, using the same
single-column key snapshots that `IsUnique` is computed from. On an existing database the next
CodeGen run clears the relationship on such fields; soft foreign keys are untouched.
