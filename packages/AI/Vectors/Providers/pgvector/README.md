# @memberjunction/ai-vectors-pgvector

MemberJunction vector database provider backed by PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension.

## Prerequisites

- PostgreSQL 14+ with the `pgvector` extension installed
- The extension is auto-created (`CREATE EXTENSION IF NOT EXISTS vector`) on first use

## Installation

```bash
npm install @memberjunction/ai-vectors-pgvector
```

## How It Works

Each logical "index" is represented as a dedicated PostgreSQL table within a single schema (configurable, defaults to `public`). Every index table has three columns:

| Column | Type | Description |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | Caller-supplied record identifier |
| `embedding` | `VECTOR(N)` | The vector embedding (dimension N is fixed at index creation) |
| `metadata` | `JSONB` | Arbitrary key-value metadata stored alongside the vector |

When you call `CreateIndex`, the provider:

1. Creates the table with the schema above.
2. Creates an **HNSW** index on the `embedding` column for fast approximate nearest-neighbor (ANN) search, using the operator class that matches the chosen distance metric.
3. Creates a **GIN** index on the `metadata` column for efficient JSONB filtering.
4. Registers the index in an internal registry table (`_mj_vector_indexes`) that tracks the name, dimension, and metric for every index managed by this provider.

Records are upserted via `INSERT ... ON CONFLICT DO UPDATE`, so calling `CreateRecord` or `CreateRecords` with an existing ID overwrites the previous embedding and metadata.

Queries use `ORDER BY embedding <operator> $1::vector LIMIT topK` to perform ANN search, where `<operator>` depends on the distance metric. Distance values are converted to similarity scores before being returned.

## Supported Distance Metrics

| MJ Metric Value | pgvector Operator | HNSW Operator Class | Score Conversion |
|---|---|---|---|
| `cosine` (default) | `<=>` | `vector_cosine_ops` | `1 - distance` |
| `euclidean` | `<->` | `vector_l2_ops` | `1 / (1 + distance)` |
| `dotproduct` | `<#>` | `vector_ip_ops` | `-distance` (pgvector returns negative inner product) |

All indexes use the HNSW algorithm for approximate nearest-neighbor search. Exact search (sequential scan) is also possible by PostgreSQL when the HNSW index is not applicable.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PG_VECTOR_HOST` | `localhost` | PostgreSQL host |
| `PG_VECTOR_PORT` | `5432` | PostgreSQL port |
| `PG_VECTOR_DATABASE` | `vectors` | Database name |
| `PG_VECTOR_USER` | `postgres` | Database user |
| `PG_VECTOR_PASSWORD` | *(empty)* | Database password |
| `PG_VECTOR_SCHEMA` | `public` | Schema for vector tables and the registry table |
| `PG_VECTOR_SSL` | `false` | Set to `true` to enable SSL (`rejectUnauthorized: false`) |

### JSON Connection String

Alternatively, pass a JSON object as the `apiKey` parameter to the constructor. Any field omitted from the JSON falls back to the corresponding environment variable:

```typescript
const db = new PgVectorDatabase(JSON.stringify({
    host: 'db.example.com',
    port: 5432,
    database: 'vectors',
    user: 'app_user',
    password: 'secret',
    schema: 'embeddings',
    ssl: true,
}));
```

If the `apiKey` is not valid JSON, it is treated as the password with all other values coming from environment variables.

### Plain Password

```typescript
const db = new PgVectorDatabase(process.env.PG_VECTOR_PASSWORD);
```

## Usage

```typescript
import { PgVectorDatabase } from '@memberjunction/ai-vectors-pgvector';

const db = new PgVectorDatabase(process.env.PG_VECTOR_PASSWORD);

// Create an index (= a PostgreSQL table with a vector column + HNSW index)
await db.CreateIndex({
    id: 'my_embeddings',
    dimension: 1536,
    metric: 'cosine',
});

// Upsert records
await db.CreateRecords([
    { id: 'doc-1', values: [0.1, 0.2, ...], metadata: { title: 'Hello' } },
    { id: 'doc-2', values: [0.3, 0.4, ...], metadata: { title: 'World' } },
], 'my_embeddings');

// Query by vector similarity
const result = await db.QueryIndex({
    id: 'my_embeddings',  // index name
    vector: [0.1, 0.2, ...],
    topK: 5,
    includeMetadata: true,
});

// List all indexes
const indexes = await db.ListIndexes();

// Delete a single record
await db.DeleteRecord({ id: 'doc-1', values: [] }, 'my_embeddings');

// Delete all records (table structure preserved)
await db.DeleteAllRecords('my_embeddings');

// Delete the entire index (drops the table)
await db.DeleteIndex({ id: 'my_embeddings' });
```

## Metadata Filtering

Metadata filters are applied as parameterized `WHERE` clauses against the JSONB `metadata` column. Two filter formats are supported:

### Simple key-value filter

```typescript
await db.QueryIndex({
    id: 'my_embeddings',
    vector: [...],
    topK: 10,
    filter: { category: 'science' },
});
```

### Operator-based filter

```typescript
await db.QueryIndex({
    id: 'my_embeddings',
    vector: [...],
    topK: 10,
    filter: {
        category: { $eq: 'science' },
        status: { $in: ['published', 'draft'] },
    },
});
```

### SharedIndexFilterOptions (cross-provider)

Use `BuildMetadataFilter()` for provider-agnostic filtering:

```typescript
const filter = db.BuildMetadataFilter({
    EntityName: 'Documents',
    RecordIDs: ['rec-1', 'rec-2'],
});

const result = await db.QueryIndex({
    id: 'my_embeddings',
    vector: [...],
    topK: 10,
    filter,
});
```

## Limitations

- **Requires the `pgvector` extension**: The extension must be installable on the target PostgreSQL instance. Managed services (AWS RDS, Azure, Supabase, Neon) generally support it, but verify availability for your provider.
- **No hybrid search**: Hybrid (vector + full-text) search is not yet implemented. The `SupportsHybridSearch` property returns `false`.
- **EditIndex not supported**: There is no support for altering an existing index (e.g., changing dimensions). Drop and recreate instead.
- **Single-schema model**: All vector tables and the registry table live in a single PostgreSQL schema. Cross-schema queries are not supported.
- **No namespace support**: The `namespace` parameter on `DeleteAllRecords` is ignored. All records in an index share a flat namespace.
- **HNSW only**: The provider creates HNSW indexes exclusively. IVFFlat indexes are not currently supported.
- **Connection pooling**: Uses the `pg` module's `Pool` with default settings. For high-concurrency workloads, consider tuning PostgreSQL connection limits externally.
