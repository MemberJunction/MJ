---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sql-parser": patch
---

Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
