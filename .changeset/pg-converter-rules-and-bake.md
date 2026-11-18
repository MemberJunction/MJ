---
"@memberjunction/sql-converter": patch
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

PostgreSQL converter fixes. Legacy path: one boolean-column registry per run (latest baseline plus each converted file), so a view over a table an earlier migration created compares with `TRUE` (#5016); `HASHBYTES` and `CONVERT(VARCHAR, <binary>, 1|2)` become sha256/sha512/md5 and hex text (#6538); unique indexes and constraints get `NULLS NOT DISTINCT` (#5194). Split path: `DATEDIFF(day)` as date subtraction, mixed-case user functions keep their name, a self-aliased `UPDATE … FROM … LEFT JOIN` becomes a ctid self-join, the same HASHBYTES / unique-index fixes, `DROP COLUMN` drops dependent views first, and MJ's catalog views use their hand-written PG text (#6348, #6538, #3345). Bake: the working DB's boolean columns are re-read after each migration; `mj migrate rebake --file … [--capture-only]` keeps a baked file's hand region and replaces only its CodeGen section, a full `rebake` is a dry run without `--write`, and a capture failure after the apply names the resume command. `convert` skips migrations older than the oldest baseline.
