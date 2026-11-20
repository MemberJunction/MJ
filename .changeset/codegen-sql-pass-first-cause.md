---
"@memberjunction/codegen-lib": patch
---

CodeGen now reports the first cause of a failed SQL pass: SQL Server object-level failures are tied to their entity, the permissions of those entities are skipped with one line naming the first failure, and the SQL_PASS summary quotes it (#3975).
