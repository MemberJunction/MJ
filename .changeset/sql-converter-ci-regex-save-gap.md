---
"@memberjunction/sql-converter": patch
---

PostgreSQL conversion: a `-- Save` line followed by `GO` (older mj-sync logs, such as the v5.14 Metadata_Sync log) stays with the block it announces, so it no longer reports a false `MISSING SAVES` gap. Three comment and batch-splitting regexes that backtracked polynomially on long whitespace runs are replaced with linear forms.
