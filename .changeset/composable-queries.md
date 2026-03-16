---
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/skip-types": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/ng-query-viewer": minor
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-shared-generic": minor
"@memberjunction/ng-pagination": minor
---

Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.
