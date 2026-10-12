---
"@memberjunction/sqlserver-dataprovider": patch
---

SQL Server entity saves and deletes now send their field values (and Record Change values) as `nvarchar(max)` parameters instead of pasting them into the batch as literals, so the statement text is constant per entity and operation and SQL Server reuses one cached plan instead of compiling every save. SQL logging still records the literal statement; saves inside a TransactionGroup, saves past `SQLServerDataProvider.MaxSaveParameters`, and values with no plain-text literal form (binary, exponent-form numbers, fractions for integer columns) keep the literal batch. `SQLServerDataProvider.ParameterizeSaves = false` turns it off.
