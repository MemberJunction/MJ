---
"@memberjunction/codegen-lib": minor
"@memberjunction/sql-converter": patch
"@memberjunction/core": patch
"@memberjunction/actions-base": patch
---

CodeGen + SS→PG converter type-correctness on PostgreSQL:

- **codegen-lib / core / actions-base**: core + codegen type correctness on PostgreSQL, plus a
  PG-only migration repairing TypeScript that the SS→PG baseline conversion corrupted in
  GeneratedCode rows. *(migration → minor)*
- **sql-converter**: never quote identifiers inside string literals during SS→PG conversion. *(code → patch)*
