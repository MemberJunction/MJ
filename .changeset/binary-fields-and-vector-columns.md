---
"@memberjunction/global": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ai-vectors-memory": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/tag-engine-base": minor
"@memberjunction/tag-engine": minor
"@memberjunction/clustering-engine": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/ng-clustering": minor
---

Binary fields work end to end, and persisted embeddings gain a binary float32 copy that loads about 14× faster than the JSON one.

**Binary fields (varbinary / binary / image on SQL Server, bytea on PostgreSQL).** Previously a binary column reached `BaseEntity` as whatever the driver returned. A Node `Buffer` then serialized over GraphQL as `{"type":"Buffer","data":[…]}`, and saves wrote the base64 text into the column. Now a binary field's value is a **base64 string** everywhere above the database: in `BaseEntity`, every cache, RunView results and the GraphQL wire. Providers convert at the boundary. SQL Server binds a `0x…` hex literal, PostgreSQL binds a `Buffer`, and rows read back become base64, including rows returned from a transaction group save. CodeGen now declares a length-less `varbinary` parameter as `varbinary(MAX)`; it used to emit `varbinary`, which T-SQL truncates to one byte. Generated getters document the encoding, and generated forms skip binary fields.

- **`RunView` omits binary fields by default.** Set `IncludeBinaryFields: true`, or name a binary field in `Fields`, which sets it for you. The flag is part of the cache fingerprint, so the two shapes never share an entry. A single-record `Load()` always includes binary fields. Engine configs take `IncludeBinaryFields: true | 'DatabaseProviderOnly'`; the second loads binary fields only in server processes.
- **Validation.** Saving a value that is not canonical base64 into a binary field fails `Validate()` with a message naming base64. A value whose decoded length exceeds a fixed-length column also fails.
- **`@memberjunction/global` codecs.** `BytesToBase64` / `Base64ToBytes` / `TryBase64ToBytes` pick the fastest host implementation: native `Uint8Array.fromBase64`, then Node `Buffer`, then `atob`. On Node, validation is fused into the decode and is fuzz-tested to accept exactly what `IsValidBase64` accepts. `Float32VectorToBase64` / `Base64ToFloat32Vector` handle little-endian float32 vectors. `ReplaceByteArraysWithBase64` makes any raw query row JSON-safe.

**Binary vector columns (migration `V202610021716`).** These nullable `varbinary(MAX)` companions of the JSON vector columns are added:

- `EntityRecordDocument.VectorBinary`
- `EmbeddingVectorBinary` on `AIAgentNote`, `AIAgentExample`, `Query` and `Tag`
- `Component.FunctionalRequirementsVectorBinary` and `Component.TechnicalDesignVectorBinary`

Every writer now fills both columns: `BaseEntity.GenerateEmbedding*` (new optional binary field parameter), the note, example, component, query and tag entity servers, `TagEngine`, and the entity vectorizer (`EntityVectorSyncer`). Readers prefer the binary column through the new `ReadStoredVector` and `DecodeVectorBinary` in `@memberjunction/ai-vectors-memory`, and fall back to JSON for rows written before the column existed or for invalid binary values. The readers are `SimpleVectorServiceProvider`, `SimpleVectorDatabase` (new `binaryVectorField` ProviderConfig key), `AIEngine`, `TagEngine`, `TagHealthJob`, `QueryEngineServer` and clustering. For 20,000 × 1,536 vectors, decoding takes 0.28 s, against 3.9 s to parse the JSON.

Fixes found along the way:

- Clustering no longer counts a binary-only row as having no vector.
- A note, example or tag whose stored JSON vector is malformed is now dropped from the in-memory index instead of throwing.
- A PostgreSQL transaction group post-processes each row with its entity's own provider rather than the process-global one.
