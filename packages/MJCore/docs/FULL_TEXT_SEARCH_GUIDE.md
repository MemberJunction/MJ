# Full-Text Search Guide

## Overview

MemberJunction provides a built-in full-text search (FTS) capability that searches across all entities configured for FTS in the database. The implementation is database-agnostic — it works with SQL Server (using `FREETEXT` and full-text catalogs/indexes) and PostgreSQL (using `tsvector`/`GIN` indexes) through the provider architecture.

## How It Works

### Architecture

```
Client (Angular)
    |
    v
Metadata.FullTextSearch({ SearchText: 'query' })
    |
    v
ProviderBase.FullTextSearch()
    |-- Resolves FTS-enabled entities from metadata
    |-- Builds RunView params with UserSearchString for each entity
    |-- Calls RunViews() in parallel
    |
    v
GenericDatabaseProvider.createViewUserSearchSQL()
    |-- If entity.FullTextSearchEnabled:
    |      Uses entity.FullTextSearchFunction (CodeGen-generated)
    |      SQL Server: FREETEXT-based table-valued function
    |      PostgreSQL: tsvector @@ plainto_tsquery with GIN index
    |-- Else:
    |      Uses field.IncludeInUserSearchAPI with LIKE fallback
    |
    v
Database executes native FTS query
```

### Entity Metadata Configuration

Full-text search is controlled by metadata on two levels:

#### Entity Level (`EntityInfo`)

| Property | Type | Description |
|----------|------|-------------|
| `FullTextSearchEnabled` | `boolean` | Whether FTS is enabled for this entity. CodeGen creates the FTS infrastructure (catalogs, indexes, functions) when this is `true`. |
| `FullTextCatalog` | `string` | SQL Server: name of the full-text catalog (default: `MJ_FullTextCatalog`) |
| `FullTextIndex` | `string` | Name of the full-text index on this entity's base table |
| `FullTextSearchFunction` | `string` | Name of the generated search function (called by `createViewUserSearchSQL`) |
| `FullTextCatalogGenerated` | `boolean` | Whether CodeGen manages the catalog DDL |
| `FullTextIndexGenerated` | `boolean` | Whether CodeGen manages the index DDL |
| `FullTextSearchFunctionGenerated` | `boolean` | Whether CodeGen manages the search function DDL |
| `AllowUserSearchAPI` | `boolean` | Whether users can search this entity via the search API |

#### Field Level (`EntityFieldInfo`)

| Property | Type | Description |
|----------|------|-------------|
| `FullTextSearchEnabled` | `boolean` | Whether this field is included in the entity's full-text index |
| `IncludeInUserSearchAPI` | `boolean` | Whether this field is included in `LIKE`-based user search (fallback when FTS not enabled) |
| `UserSearchParamFormatAPI` | `string` | Custom format for the search parameter (e.g., `LIKE '%{0}%'`) |

### CodeGen FTS DDL Generation

When `FullTextSearchEnabled` is set on an entity, CodeGen generates platform-specific DDL:

#### SQL Server
- **Full-text catalog**: `CREATE FULLTEXT CATALOG MJ_FullTextCatalog` (shared across entities)
- **Full-text index**: `CREATE FULLTEXT INDEX ON schema.Table (Field1, Field2, ...) KEY INDEX PK_Table ON MJ_FullTextCatalog`
- **Search function**: Inline table-valued function using `FREETEXT` that returns matching PKs with ranking

#### PostgreSQL
- **tsvector column**: `ALTER TABLE ... ADD __mj_fts_vector TSVECTOR`
- **Trigger function**: Concatenates search fields into the tsvector column on INSERT/UPDATE
- **GIN index**: `CREATE INDEX ... USING GIN(__mj_fts_vector)` for fast lookups
- **Search function**: PL/pgSQL function using `@@ plainto_tsquery`

## API Reference

### `Metadata.FullTextSearch(params, contextUser?)`

The primary entry point for full-text search from any MJ code.

```typescript
import { Metadata, FullTextSearchParams, FullTextSearchResult } from '@memberjunction/core';

const md = new Metadata();
const result: FullTextSearchResult = await md.FullTextSearch({
    SearchText: 'quarterly report',
    EntityNames: ['MJ: AI Models', 'MJ: AI Prompts'],  // optional
    MaxRowsPerEntity: 10  // optional, default 10
}, contextUser);

if (result.Success) {
    for (const item of result.Results) {
        console.log(`${item.EntityName}: ${item.Title} (score: ${item.Score})`);
    }
}
```

### Parameters (`FullTextSearchParams`)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `SearchText` | `string` | Yes | The search text. Passed as `UserSearchString` to RunView. |
| `EntityNames` | `string[]` | No | Restrict search to these entities. Must be FTS-enabled — non-FTS entities are silently skipped. If omitted, searches ALL FTS-enabled entities. |
| `MaxRowsPerEntity` | `number` | No | Max results per entity. Default: 10. |

### Result (`FullTextSearchResult`)

| Property | Type | Description |
|----------|------|-------------|
| `Success` | `boolean` | Whether the search completed |
| `ErrorMessage` | `string?` | Error details if `Success` is false |
| `Results` | `FullTextSearchResultItem[]` | Matched records sorted by score descending |
| `TotalCount` | `number` | Total results across all entities |
| `EntitiesSearched` | `number` | How many entities were queried |
| `ElapsedMs` | `number` | Execution time in milliseconds |

### Result Item (`FullTextSearchResultItem`)

| Property | Type | Description |
|----------|------|-------------|
| `EntityName` | `string` | Which entity the result came from |
| `RecordID` | `string` | Primary key of the matched record |
| `Title` | `string` | Best "name" field value (Name, Title, Subject, etc.) |
| `Snippet` | `string` | Best "description" field value, truncated to 200 chars |
| `Score` | `number` | Relevance score (rank-based: `1/(rank+1)`) for RRF compatibility |

## Integration with Knowledge Hub

The Knowledge Hub's unified search combines FTS with vector search:

```typescript
// In SearchKnowledgeResolver
const [vectorResults, ftsResults] = await Promise.all([
    this.searchAllVectorIndexes(query, topK, filters, contextUser),
    md.FullTextSearch({ SearchText: query, EntityNames: filters?.EntityNames }, contextUser)
]);

// Fuse with Reciprocal Rank Fusion
const fusedResults = ComputeRRF([vectorCandidates, ftsCandidates]);
```

This provides:
- **Vector search**: Semantic similarity across embeddings in Pinecone/Weaviate
- **FTS**: Keyword precision via database-native full-text search
- **RRF fusion**: Combines both result sets into a single ranked list

## Provider Extension

To add FTS support for a new database platform:

1. Create a CodeGen provider that implements `generateFullTextSearch()` returning platform-specific DDL
2. The `GenericDatabaseProvider.createViewUserSearchSQL()` method calls the entity's `FullTextSearchFunction` — ensure your platform's function is callable via the same mechanism
3. No changes needed to `ProviderBase.FullTextSearch()` — it delegates through `RunView` which calls your provider's `createViewUserSearchSQL()`

## Related Files

| File | Purpose |
|------|---------|
| `packages/MJCore/src/generic/interfaces.ts` | `FullTextSearchParams`, `FullTextSearchResult`, `FullTextSearchResultItem` types |
| `packages/MJCore/src/generic/providerBase.ts` | `ProviderBase.FullTextSearch()` default implementation |
| `packages/MJCore/src/generic/metadata.ts` | `Metadata.FullTextSearch()` public API |
| `packages/MJCore/src/generic/entityInfo.ts` | `EntityInfo.FullTextSearchEnabled` and related properties |
| `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` | `createViewUserSearchSQL()` — builds platform-specific FTS SQL |
| `packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts` | SQL Server FTS DDL generation |
| `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts` | PostgreSQL tsvector DDL generation |
| `packages/MJServer/src/resolvers/SearchKnowledgeResolver.ts` | GraphQL resolver using `Metadata.FullTextSearch()` |
