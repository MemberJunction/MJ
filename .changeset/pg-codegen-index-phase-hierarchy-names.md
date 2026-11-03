---
"@memberjunction/codegen-lib": patch
---

PostgreSQL CodeGen now creates the foreign-key and soft-primary-key indexes it generates: the phased executor has an `indexes` phase after full-text search and before permissions, running each `CREATE INDEX IF NOT EXISTS` on its own and warning about any invalid index left on the table. A failed index is reported as phase `indexes` without skipping permissions. Hierarchy function names (`fn_<table>_<field>_get_descendants` and its siblings) longer than PostgreSQL's 63-character limit keep their suffix and replace the tail of the prefix with a short hash, so they no longer truncate to the same name and overwrite each other; names that already fit are unchanged.
