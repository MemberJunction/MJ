---
"@memberjunction/sqlserver-dataprovider": patch
---

A save on SQL Server now refuses a value in a numeric field that is not a number, with a clear error, instead of failing later in the database. A delete now renders its primary key the same way as a save, so a key containing a quote works.
