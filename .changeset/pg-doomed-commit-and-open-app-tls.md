---
"@memberjunction/generic-database-provider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
"@memberjunction/integration-test-suite": patch
---

PostgreSQL fixes found by running the deterministic integration tier against PostgreSQL.

- **A commit that PostgreSQL rolled back no longer reports success.** Once a statement fails inside a PostgreSQL transaction, `COMMIT` does not error: the server rolls the transaction back and answers `ROLLBACK`. The PostgreSQL provider now checks that reply and throws `DoomedTransactionError`, so the caller learns its writes did not persist.
- **An aborted PostgreSQL transaction is recognized as doomed.** SQLSTATE `25P02` (`in_failed_sql_transaction`) now marks the ambient transaction doomed, as `25P01` and the SQL Server codes already did, so nested units and saves inside it refuse instead of failing with a raw driver error.
- **Saving a record whose nullable boolean is NULL no longer reports a false concurrency conflict.** The conflict check read the caller's `null` old value as `false` but compared it with the stored `NULL` as is, so on PostgreSQL (which stores NULL where SQL Server's column default stores 0) every edit of such a field was rejected as "Concurrent modification conflict". The stored side now gets the same rule.
- **`mj app install` and Open App migrations follow the PostgreSQL TLS and login settings.** The migration run and the metadata refresh after it now use the same `PG_SSL_*` and `PG_AUTH_MODE` resolution as `mj migrate`, through a new `SSL` option on the engine's database config. Before, both connected without TLS and failed against a server that requires it.
- Integration checks that assumed SQL Server: `ISNULL` in a filter, `[RecordChange]` bracket quoting, a constraint lookup that compared PostgreSQL's mixed-case names in lowercase, and the list-from-query fixture's bracket-quoted SQL, which the provider now quotes.
