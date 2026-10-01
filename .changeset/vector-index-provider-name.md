---
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/server": patch
---

Address vector indexes by their provider-side name (`ExternalID`), not the MJ display `Name`. Entity vectorization, duplicate detection and the entity-vectors resolver passed `Name`, so any index whose label differs from its provider name (e.g. "More Cheese Content (Pinecone)" vs `morecheese-content`) returned 404 on every upsert/query. Adds a shared `ProviderIndexName()` helper in `@memberjunction/ai-vectordb`, falling back to `Name` for rows without an `ExternalID`.
