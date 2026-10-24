---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Abstract `SaveReturnMode` return-context resolution (`SaveReturnContext`, `ResolveSaveReturnContext`, `GetDatestampSelectColumnsSQL`) into `GenericDatabaseProvider` and expose the dialect-specific `ProjectSaveCallToDatestamps` hook implemented by both `SQLServerDataProvider` and `PostgreSQLDataProvider`.
