---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/record-cloning-base": minor
"@memberjunction/record-cloning": minor
"@memberjunction/sql-converter": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Record unique keys as column sets and narrow `EntityField.IsUnique` (#4536). A new `EntityUniqueKey` table, kept in step with the catalog by CodeGen, holds every unique index or constraint as its key columns in order; `EntityInfo.UniqueKeySets` and `EntityInfo.IsUniqueFieldSet` expose them. `IsUnique` is now set only when a column alone is the key of an unfiltered unique index or is the sole primary key column; composite members, INCLUDE columns, filtered or partial indexes and composite primary key columns no longer count. Record cloning reads the key sets for collision checks, unique foreign keys and renames.
