---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/core-actions": patch
"@memberjunction/video-studio": patch
"@memberjunction/materialization": patch
"@memberjunction/excel-addin-server": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/data-context": patch
"@memberjunction/mobile-app": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ai-agent-harness": patch
---

Saved-query metadata is no longer loaded into the metadata object by default. Providers skip the query items of the `MJ_Metadata` dataset (no SQL runs for them, and their status stays constant), so saving a query no longer refreshes metadata on every server and client. The deprecated `Queries`, `QueryFields`, `QueryCategories`, `QueryPermissions`, `QueryEntities`, `QueryParameters`, `QueryDependencies`, `SQLDialects` and `QuerySQLs` getters return empty arrays and log one warning; set `LoadQueryMetadata: true` on the provider configuration (`databaseSettings.loadQueryMetadata` on MJAPI) to restore them until 7.0. Use the same setting on every server that shares a metadata cache. Every MJ consumer of those getters now reads `QueryEngine`.

The typed-query API (`DefineTypedQuery`, `TypedQuery`, `ComputeTypedQuerySignature`, `SetTypedQueryDriftMode`, …) moved from `@memberjunction/core` to `@memberjunction/core-entities`, and signature drift is checked against `QueryEngine`. Projects that generated typed queries for their own schema on a 6.3.0 edge build must re-run CodeGen, which now emits the new import.

The server's metadata build no longer edits the `MJ_Metadata` dataset rows it reads: it assembles from copies, and the dataset cache freezes those rows like every other dataset's. The edited rows were being served to every client, so each cold boot downloaded every entity's fields, permissions and relationships twice (43 MB instead of 23 MB raw on a 455-entity schema). With a Redis cache configured, the two-tier cache froze those rows before the build edited them, so the server started with no metadata.

