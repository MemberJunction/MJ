# @memberjunction/ai-vectors-sqlserver

A **colocated** MemberJunction vector-database provider backed by **SQL Server 2025 native vectors**
(the `VECTOR(N)` type and the `VECTOR_SEARCH` DiskANN table-valued function). It stores and queries
embeddings inside the application's own SQL Server database — borrowing the active data provider's
connection rather than opening a separate pool — so vectors live alongside the entity rows they
describe and can be searched with the database's native ANN index.

Registered with the MJ class factory as **`SQLServerVectorDatabase`** (`@RegisterClass(VectorDBBase, 'SQLServerVectorDatabase')`).

> **Status:** validated end-to-end against a live **SQL Server 2025 RTM** container (17.0.4050)
> in `sibling` storage mode — index create, upsert, exact query, metadata (`JSON_VALUE`) filtering,
> and result mapping all confirmed working. The `entityColumn` mode and the approximate
> (`VECTOR_SEARCH`) path on Azure SQL Database remain unexercised; treat those as untested.

## How it works

This is a [colocated](../../Database/README.md) provider: it implements no connection logic of its
own. Instead it receives the active relational connection through MemberJunction's
`IColocatedVectorHost` adapter (implemented by `SQLServerDataProvider`) and runs all DDL/DML through
it. When a transaction is open on that connection, vector writes participate in it.

### Query path

The provider prefers the DiskANN-aware **`VECTOR_SEARCH`** TVF (`SELECT TOP (N) WITH APPROXIMATE`),
which engages the vector index and is dramatically faster than a brute-force scan at scale. But that
surface is **not present in every SQL Server 2025 build** — verified live, **boxed SQL Server 2025 RTM
(17.0.4050) does not have `VECTOR_SEARCH`/`WITH APPROXIMATE` or `CREATE VECTOR INDEX … DiskANN`**; only
the `VECTOR(n)` type and the exact `VECTOR_DISTANCE` function ship there. (The approximate surface is
currently Azure SQL Database, and likely a later boxed CU.)

So the provider **detects support lazily and falls back**: it attempts the `VECTOR_SEARCH` query once;
if the server rejects it, it caches that fact process-wide and routes all subsequent queries through an
exact **`VECTOR_DISTANCE`** scan. Where the TVF *is* available, filtered queries additionally dispatch
on cardinality — below a configurable threshold (default 50,000 matching rows) they use the exact path
anyway, because DiskANN's graph walk fails to converge when a filter's row cluster is disjoint from the
query vector's neighborhood. Net: correct results everywhere, accelerated where the index exists.

### Storage modes

Configured per index via `MJVectorIndex.ProviderConfig` (which flows to `CreateIndexParams.additionalParams`):

| Mode | Where vectors live | Filters resolve against | Use it for |
|---|---|---|---|
| `sibling` (default) | an MJ-managed sibling table (`id`/`embedding`/`metadata`/`content`) | the JSON `metadata` column | generic, entity-agnostic, multi-model indexes |
| `entityColumn` | an existing `VECTOR` column on an entity table | **live entity columns** | adopting embeddings already stored on a table — no re-vectorization |

#### `entityColumn` configuration

```json
{
  "storageMode": "entityColumn",
  "sourceTable": "Recommendation.Content",
  "vectorColumn": "Embedding",
  "keyColumn": "ID",
  "entityName": "Content",
  "selectColumns": ["Title", "URL", "Source", "ContentType", "Date"],
  "iterativeFilterThreshold": 50000
}
```

The provider projects the listed columns into each result's metadata and synthesizes the MJ
`RecordID`/`Entity` fields so the `SearchEngine` renders these results identically to sibling/external
indexes. `entityColumn` upsert/delete operate by a single scalar key (`keyColumn`); composite-PK
entities are not supported in this mode.

## Enabling

1. Create an `MJ: Vector Databases` row with `ClassKey = 'SQLServerVectorDatabase'` (no `DefaultURL`
   or `CredentialID` — it uses the application's connection).
2. Create `MJ: Vector Indexes` rows pointing at it, with the `ProviderConfig` above for `entityColumn`
   mode (or none for `sibling` mode).
3. Search flows through `@memberjunction/search-engine`'s `VectorSearchProvider`; sync flows through
   `@memberjunction/ai-vector-sync`'s `EntityVectorSyncer`.

## Limitations

- Requires **SQL Server 2025** (major version ≥ 17); the provider fails loud on older servers.
- **Approximate / DiskANN search** depends on the `VECTOR_SEARCH` TVF, which is absent on boxed
  SQL Server 2025 RTM (the provider transparently falls back to exact `VECTOR_DISTANCE` — correct,
  but O(rows) per query, so large corpora on the boxed product will be slow until a CU adds the TVF).
- **Hybrid keyword search** (full-text `CONTAINS` + vector) is not yet implemented — queries are
  vector-only. (The pgvector colocated provider does RRF hybrid today.)
- `entityColumn` mode supports **single-column keys** only.

## License

ISC
