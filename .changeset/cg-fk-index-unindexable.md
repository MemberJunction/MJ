---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer emits a SQL Server foreign-key index on an unbounded (`NVARCHAR(MAX)`) column or one wider than 1,700 bytes; it writes an "FK INDEX SKIPPED" comment naming the column instead (#5985). PostgreSQL output is unchanged.
