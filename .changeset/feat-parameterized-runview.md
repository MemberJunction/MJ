---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Add parameterized `RunView` support via `RunViewParams.Parameters`:

- `@memberjunction/core`: Add `RunViewParameterScalar`, `RunViewParameterValue`, `RunViewParameters`, `RunViewParametersKey`, and `RunViewParams.Parameters`. Include canonicalized parameters in `RunViewParams.Equals` and `LocalCacheManager.GenerateRunViewFingerprint` (`prm:` segment when non-empty). Teach `FieldSecuritySQLGate` to recognize `@paramName` parameter tokens on both SQL Server and PostgreSQL dialects.
- `@memberjunction/generic-database-provider`: Add `BindExtraFilterParameters` using `SqlTokens.Lex` and `EditSet` to rewrite `@paramName` tokens in `ExtraFilter` to dialect-native bound placeholders (`@p0` on SQL Server, `$1` on PostgreSQL) and `NamedQueryParameter` bindings (with array expansion for `IN (@list)`). Thread bound parameters through `executeRunViewCore`, `RunViewsWithCacheCheck`, `getBatchedServerCacheStatus`, `getUpdatedRowsSince`, and `IsCoalescibleCountBatch`.
- `@memberjunction/sqlserver-dataprovider`: Support `NamedQueryParameter` and `TypedQueryParameter` lists in `ExecuteSQLBatch` and `ExecuteSQLBatchStatic` with parameter deduplication across shared `mssql.Request` batches, and forward `queryParameters` in `executeSQLForUserViewRunLogging` and `getBatchedServerCacheStatus`.
- `@memberjunction/postgresql-dataprovider`: Exclude `@paramName` and `$1` parameter tokens from column auto-quoting in `quoteFieldNamesInToken`.
- `@memberjunction/server`: Accept and validate `Parameters` (`GraphQLJSONObject`) on `RunViewByIDInput`, `RunViewByNameInput`, `RunDynamicViewInput`, `RunViewGenericInput`, and `RunViewsWithCacheCheck`.
- `@memberjunction/graphql-dataprovider`: Forward `RunViewParams.Parameters` in `InternalRunView`, `InternalRunViews`, and `RunViewsWithCacheCheck`.
