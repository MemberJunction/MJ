---
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-pgvector": patch
"@memberjunction/ai-vectors-sqlserver": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/search-engine": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
