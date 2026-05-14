---
"@memberjunction/codegen-lib": patch
---

Don't append ';' to logged SQL ending with a T-SQL 'GO' batch separator — 'GO;' is invalid in SSMS/sqlcmd.
