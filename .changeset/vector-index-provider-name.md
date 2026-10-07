---
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/server": patch
"@memberjunction/search-engine": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/ng-dashboards": patch
---

Address vector indexes by their provider-side name (`ExternalID`), not the MJ display `Name`. Entity vectorization, duplicate detection and the entity-vectors resolver passed `Name`, so any index whose label differs from its provider name (e.g. "More Cheese Content (Pinecone)" vs `morecheese-content`) returned 404 on every upsert/query.

`AIEngineBase` now owns the single `MJ: Vector Indexes` cache (`VectorIndexes`, `GetVectorIndexByID`) and the one rule for the provider name (`GetProviderIndexName`: ExternalID, falling back to `Name`), proxied on `AIEngine`. `KnowledgeHubMetadataEngine` no longer caches Vector Indexes; its `VectorIndexes` / `GetVectorIndexByID` proxy the AIEngineBase cache. Every caller, including `MJVectorIndexEntityServer`'s delete path, now resolves the provider name through `GetProviderIndexName`.
