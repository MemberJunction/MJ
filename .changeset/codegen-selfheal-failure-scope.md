---
"@memberjunction/codegen-lib": patch
---

CodeGen's CRUD self-heal no longer hides unrelated SQL-pass failures. The SQL pass now records each failure with the entity it belongs to, and the self-heal clears the pass's failure only when every recorded failure belongs to an entity it re-ran successfully. A failed script, permissions file, file execution or other entity keeps the failure and the run exits non-zero.
