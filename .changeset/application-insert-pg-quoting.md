---
'@memberjunction/codegen-lib': patch
---

A new schema gets its Application on PostgreSQL

`createNewApplication` named the `Application` columns unquoted, and `conditionalInsert` wraps that statement in PG's `DO $$ ... $$` block — which the identifier auto-quoter skips wholesale, since it cannot know whether a dollar-quoted block holds SQL or literal text. `ID` therefore reached PostgreSQL folded to `id`, and the INSERT failed on every run. It failed silently: the method catches, logs and returns null, and its caller logs and carries on, so CodeGen finished green while the schema got no Application and every one of its entities rendered in the UI's "System & Other" bucket. SQL Server resolves the unquoted identifiers case-insensitively, which is why this survived unnoticed since before 5.49.

The columns are now quoted through `qi()`, matching the sibling `ApplicationRole` insert a few lines below. `conditionalInsertSQL` now documents the pre-quoting contract that makes it the one exception to this file's usual "write identifiers bare, the auto-quoter handles it" convention.
