---
"@memberjunction/generic-database-provider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Loading a record (including its relationships), checking record dependencies, and the row-level security check on a record now refuse a value for a numeric primary key that is not a number, with a clear error, instead of failing later in the database. Cleaning up geocodes after a delete and loading relationships now handle a key containing a quote, and numeric SET values in SQL Server save statements are validated as decimal/scientific number literals.
