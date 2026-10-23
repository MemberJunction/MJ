---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/sql-dialect": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/query-gen": minor
"@memberjunction/lists-base": minor
"@memberjunction/lists": minor
"@memberjunction/data-context": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-shared": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-dashboards": minor
---

Add Alternate Base Views (MJ Canon Layer 1): allow entities to register governed SQL views (`MJ: Entity Alternate Base Views`) that maintain 100% column parity with the canonical `BaseView` while returning curated row subsets (such as `Active` members or `Open` orders), with full support across `RunView`, `RunViews`, `BaseEngine`, `LocalCacheManager`, `CodeGen` column-parity validation, `QueryEntity.AlternateBaseViewID` lineage extraction, `QueryGen`, `Lists`, `DataContext`, `GetEntityDetails`, and `MJExplorer` Data Explorer / Entity Viewer.
