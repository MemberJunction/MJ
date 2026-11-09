---
"@memberjunction/codegen-lib": patch
---

A composite foreign key's components become single-column related entities only when their
referenced column is unique on its own (#4534). CodeGen used to pair the columns of a composite
constraint positionally and give every component a RelatedEntityID, so a trailing component whose
target column is not unique (a denormalised copy of the parent's own key) got a label join that
multiplied rows in the base view. The pending-fields query on both engines and
`spUpdateExistingEntityFieldsFromSchema` (SQL Server by migration, PostgreSQL in the support
objects) now keep a component when its constraint is single-column or its target is unique, and
give the others no related entity rather than a guessed one.

`IsUnique` now means unique on its own (#4536). `vwTableUniqueKeys` on SQL Server lists the columns
of single-key-column, unfiltered unique indexes only, and the PostgreSQL pending-fields query and
procedure read single-column unique indexes from `pg_index` directly. The primary-key snapshot
carries the key's column count, so a primary key marks a column unique only when it is a
single-column key. Member columns of a composite unique index or of a composite primary key are no
longer marked unique.
