---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
---

PostgreSQL converter: an `EXEC` inside a converted procedure body (such as CodeGen's spDelete cascade updates) now emits a call that works whether the callee takes typed parameters or a single `p_data JSONB` argument, and passes `0`/`1` to `_Clear` flags and known boolean columns as `FALSE`/`TRUE`. Before, these calls used typed arguments and integer literals, so deleting a record with dependents failed at run time with `function ... does not exist` (for example, deleting a conversation). The call logic is now shared with the top-level EXEC conversion.

`mj migrate convert` without `--split` now warns when a migration contains CodeGen CRUD procedures, and names `--split --bake-codegen` as the way to write them natively for PostgreSQL.
