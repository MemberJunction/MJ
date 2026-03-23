# @memberjunction/generic-database-provider

## 5.15.0

### Patch Changes

- 5e85b29: Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/sql-parser@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/encryption@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/queue@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/encryption@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/queue@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/encryption@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/queue@5.13.0
  - @memberjunction/query-processor@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/encryption@5.12.0
  - @memberjunction/queue@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/encryption@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/queue@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/aiengine@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/encryption@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/queue@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/encryption@5.10.0
  - @memberjunction/queue@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/encryption@5.9.0
  - @memberjunction/queue@5.9.0

## 5.8.0

### Patch Changes

- 064cf3a: Make API key generation configurable via mj.config.cjs, fix codegen TVF sync and EntityRelationship deduplication, fix SQL logger post-processing, preserve version range prefixes in CLI bump command, and fix SkipProxyAgent crash on error responses
- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/encryption@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/queue@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/queue@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/encryption@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/encryption@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/queue@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/encryption@5.5.0
  - @memberjunction/queue@5.5.0
