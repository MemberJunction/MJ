---
"@memberjunction/sql-converter": patch
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

Split-and-regenerate PostgreSQL migration pipeline: regenerate the machine-generated bulk of each migration and transpile only hand-authored DDL via AST-based SQLGlot dialect transforms, replacing the brittle regex-based pg-migrate path. Adds statement-level classification for unbannered baselines and end-to-end AST transforms covering the remaining DDL edge cases.
