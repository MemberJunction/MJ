---
"@memberjunction/sql-dialect": patch
---

PostgreSQL full-text search types (`tsvector`, `tsquery`) are now classified as string types. CodeGen's full-text search exposes a `__mj_fts_vector` tsvector column through the base view; unclassified, it was typed `number` / GraphQL `Int`, so every single-record query of an entity with full-text search failed once its rows had vectors. Re-run CodeGen after upgrading to regenerate the affected GraphQL types.
