---
"@memberjunction/sqlserver-dataprovider": patch
---

Nested `BeginTransaction` now starts a physical mssql transaction when depth leaked without one, so `SAVE TRANSACTION` no longer throws "Transaction has not begun. Call begin() first."
