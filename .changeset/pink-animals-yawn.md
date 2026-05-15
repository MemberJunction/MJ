---
"@memberjunction/generic-database-provider": patch
"@memberjunction/core": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
