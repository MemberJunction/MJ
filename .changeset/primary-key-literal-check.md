---
"@memberjunction/generic-database-provider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Loading a record, and the row-level security check on one, now refuse a value for a numeric primary key that is not a number, with a clear error, instead of failing later in the database. Loading a record's related entities, and finding the records that depend on one (SQL Server and PostgreSQL), now render the key the same way, so a key containing a quote works and a numeric key is checked. Cleaning up geocodes after a delete now handles a key containing a quote.
