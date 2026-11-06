---
"@memberjunction/sqlserver-dataprovider": patch
---

A save on SQL Server now refuses a value in a numeric field that is not a number, with a clear error, instead of failing later in the database.
