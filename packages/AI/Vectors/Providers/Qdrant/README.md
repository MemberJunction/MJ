# @memberjunction/ai-vectors-qdrant

MemberJunction vector database provider backed by [Qdrant](https://qdrant.tech/). Implements the `VectorDBBase` interface using the official `@qdrant/js-client-rest` client.

## Prerequisites

- A running Qdrant instance (local Docker container or Qdrant Cloud cluster)
- For Qdrant Cloud, an API key with appropriate permissions

## Installation

```bash
npm install @memberjunction/ai-vectors-qdrant
```

## How It Works

Each logical "index" maps to a **Qdrant collection**. A collection stores points, where each point consists of:

| Component | Description |
|---|---|
| **ID** | A string or integer identifier for the point |
| **Vector** | The embedding (dimension and distance metric are fixed at collection creation) |
| **Payload** | Arbitrary JSON key-value metadata stored alongside the vector |

When you call `CreateIndex`, the provider creates a Qdrant collection with the specified vector size and distance metric. You can pass additional Qdrant-specific collection parameters (e.g., HNSW config, quantization) via `params.additionalParams`.

Records are upserted via the Qdrant `upsert` operation, so calling `CreateRecord` or `CreateRecords` with an existing ID overwrites the previous point.

Queries use Qdrant's native ANN search. When a `vector` is provided, the provider calls `query()` directly. When only a point `id` is provided, the provider first retrieves that point's vector, then uses it as the query vector.

`DeleteAllRecords` works by deleting and recreating the collection with the same vector configuration, since Qdrant does not expose a single "truncate" operation.

## Supported Distance Metrics

| MJ Metric Value | Qdrant Distance | Description |
|---|---|---|
| `cosine` (default) | `Cosine` | Cosine similarity (normalized dot product) |
| `euclidean` | `Euclid` | Euclidean (L2) distance |
| `dotproduct` | `Dot` | Dot product (inner product) |

The distance metric is set at collection creation time and cannot be changed afterward.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL. For Qdrant Cloud, use the full cluster URL (e.g., `https://xyz.us-east-1-0.aws.cloud.qdrant.io:6333`). |
| `QDRANT_API_KEY` | *(none)* | API key for authentication. Required for Qdrant Cloud; optional for local instances. |

### Constructor

The `apiKey` constructor parameter is passed directly to the Qdrant client. If empty or `'default'`, no API key header is sent (suitable for local instances):

```typescript
// Local instance (no auth)
const db = new QdrantDatabase('default');

// Qdrant Cloud
const db = new QdrantDatabase(process.env.QDRANT_API_KEY);
```

## Usage

```typescript
import { QdrantDatabase } from '@memberjunction/ai-vectors-qdrant';

const db = new QdrantDatabase(process.env.QDRANT_API_KEY || 'default');

// Create a collection
await db.CreateIndex({
    id: 'my-collection',
    dimension: 1536,
    metric: 'cosine',
});

// Upsert records
await db.CreateRecords([
    {
        id: 'vec-1',
        values: [0.1, 0.2, ...],
        metadata: { Entity: 'Documents', RecordID: '123' },
    },
    {
        id: 'vec-2',
        values: [0.3, 0.4, ...],
        metadata: { Entity: 'Documents', RecordID: '456' },
    },
], 'my-collection');

// Query by vector similarity
const results = await db.QueryIndex({
    id: 'my-collection',
    vector: [0.1, 0.2, ...],
    topK: 10,
    includeMetadata: true,
});

// List all collections
const indexes = await db.ListIndexes();

// Get collection details (dimension, metric)
const info = await db.GetIndex({ id: 'my-collection' });

// Delete specific records
await db.DeleteRecords(
    [{ id: 'vec-1', values: [] }],
    'my-collection'
);

// Delete all records (drops and recreates the collection)
await db.DeleteAllRecords('my-collection');

// Delete the collection entirely
await db.DeleteIndex({ id: 'my-collection' });
```

## Metadata Filtering

Qdrant uses a structured filter format with `must`, `should`, and `must_not` clauses. This provider supports two approaches for building filters.

### SharedIndexFilterOptions (Cross-Provider)

The recommended approach uses `BuildMetadataFilter()`, which accepts the provider-agnostic `SharedIndexFilterOptions` interface and produces a Qdrant-native filter:

```typescript
const filter = db.BuildMetadataFilter({
    EntityName: 'Documents',
    RecordIDs: ['rec-1', 'rec-2'],
});

const results = await db.QueryIndex({
    id: 'my-collection',
    vector: [...],
    topK: 10,
    filter,
});
```

Under the hood, `BuildMetadataFilter` performs the following mapping:

| SharedIndexFilterOptions field | Qdrant filter clause |
|---|---|
| `EntityName` | `must: [{ key: "Entity", match: { value: "Documents" } }]` |
| `RecordIDs` (single value) | `must: [{ key: "RecordID", match: { value: "rec-1" } }]` |
| `RecordIDs` (multiple values) | `must: [{ key: "RecordID", match: { any: ["rec-1", "rec-2"] } }]` |
| Additional conditions via `VectorMetadataFilter.BuildConditions` | Mapped with `eq` -> `match.value`, `in` -> `match.any`, `contains` -> `match.value` |

All conditions are combined into a single `must` array (AND logic).

### Qdrant-Native Filters

You can also pass Qdrant's native filter syntax directly as the `filter` property on `QueryIndex`:

```typescript
const results = await db.QueryIndex({
    id: 'my-collection',
    vector: [...],
    topK: 10,
    filter: {
        must: [
            { key: 'category', match: { value: 'science' } },
            { key: 'year', range: { gte: 2020 } },
        ],
        must_not: [
            { key: 'status', match: { value: 'archived' } },
        ],
    },
});
```

This gives you full access to Qdrant's filtering capabilities including range filters, geo filters, and nested conditions. See the [Qdrant filtering documentation](https://qdrant.tech/documentation/concepts/filtering/) for the complete filter syntax.

## Record Operations

### GetRecord / GetRecords

To retrieve points by ID, pass the collection name in `params.data`:

```typescript
const result = await db.GetRecords({
    id: 'ignored',
    data: {
        collectionName: 'my-collection',
        ids: ['vec-1', 'vec-2'],
    },
});
```

### UpdateRecord / UpdateRecords

Updates use upsert for records with vectors and `setPayload` for metadata-only updates:

```typescript
await db.UpdateRecord({
    id: 'vec-1',
    values: [0.5, 0.6, ...],       // new vector (uses upsert)
    metadata: { status: 'updated' },
    data: { collectionName: 'my-collection' },
});

// Metadata-only update (no vector change)
await db.UpdateRecord({
    id: 'vec-1',
    metadata: { status: 'reviewed' },
    data: { collectionName: 'my-collection' },
});
```

### EditIndex

Qdrant supports updating collection-level parameters (optimizer settings, etc.) via `EditIndex`:

```typescript
await db.EditIndex({
    id: 'my-collection',
    data: {
        optimizers_config: {
            indexing_threshold: 20000,
        },
    },
});
```

## Limitations

- **No hybrid search**: The `SupportsHybridSearch` property is not overridden and defaults to the base class behavior. Pure vector search only.
- **ListIndexes dimension/metric**: The `ListIndexes` method returns `dimension: 0` and `metric: 'cosine'` for all collections because the Qdrant list endpoint does not return per-collection vector configuration. Use `GetIndex` for accurate details.
- **DeleteAllRecords is destructive**: The collection is dropped and recreated, which resets all optimizer and indexing state.
- **String IDs only**: While Qdrant supports both string and integer point IDs, the MJ interface uses string IDs throughout. Integer IDs are converted to strings in results.
- **Single vector per point**: Named vector configurations are not currently exposed; only the default (unnamed) vector is used.
- **No namespace support**: Qdrant does not have a namespace concept. The `namespace` parameter on `DeleteAllRecords` is ignored.
