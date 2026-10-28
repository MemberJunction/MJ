---
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ai-vector-sync": patch
---

Scope duplicate-detection vector queries to their entity document, so several documents can share one external index (Pinecone, Qdrant, pgvector, SQL Server). Vector sync now stores `EntityDocumentID` with each vector, and the detector filters on it through the provider's `BuildMetadataFilter`. Before this, an Organizations run on an index that also held People vectors could take People records as candidates. The in-process vector store already scoped by document and is unchanged.

Vectors synced before this change carry no `EntityDocumentID`, so a run against them now fails with a message to re-sync the document's vectors, instead of silently finding no duplicates.
