---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Cached RunQuery results now carry the definition of the query that produced them, so an edited query's old results are no longer served. A read under another definition misses; a client's cache check is answered stale when its slot came from another definition; on a shared cache a mismatch holds back writes instead of deleting the slot. The server where an edit was saved deletes the query's slots, and those of queries that compose it, once the edit settles. Slots are keyed by the resolved query, so requests by ID, by name or by both share one. Query extraction rewrites the shared cache slots once per save instead of once per row. The SQL Server cache-status check now reads the documented `TotalRows` column. A client talking to a server that predates the definition check (during a rolling deploy) retries its cache check without the definition, and tries it again a few minutes later.
