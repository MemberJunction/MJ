---
"@memberjunction/sql-dialect": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Nested transactions (savepoints) now live on GenericDatabaseProvider so every database provider shares them. Nested BeginTransaction begins a physical transaction when depth leaked without one, then issues the dialect savepoint (SQL Server `SAVE TRANSACTION`, PostgreSQL `SAVEPOINT`). That stops mssql's "Transaction has not begun. Call begin() first." and the equivalent PG "SAVEPOINT can only be used in transaction blocks."
