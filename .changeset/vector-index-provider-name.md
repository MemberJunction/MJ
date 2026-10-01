---
"@memberjunction/core-entities": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/server": patch
"@memberjunction/search-engine": patch
"@memberjunction/content-autotagging": patch
---

Address vector indexes by their provider-side name (`ExternalID`), not the MJ display `Name`. Entity vectorization, duplicate detection and the entity-vectors resolver passed `Name`, so any index whose label differs from its provider name (e.g. "More Cheese Content (Pinecone)" vs `morecheese-content`) returned 404 on every upsert/query. Adds `KnowledgeHubMetadataEngine.GetProviderIndexName()` (ExternalID, falling back to `Name` for older rows) and routes every caller through it, including the search and autotagging paths that previously inlined the same rule.
