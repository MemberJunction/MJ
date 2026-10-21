---
"@memberjunction/server": patch
---

Knowledge Hub clustering now works for entity documents stored in the local vector store. `FetchEntityVectors` listed vectors through `QueryIndex` keyed by the provider index name, which suits Pinecone but not the in-process Simple Vector Service Provider: it keys by EntityDocumentID and returns matches without vector values, so Visualize → Clusters showed "No data to display". When the provider reports `QueryKeyIsEntityDocumentID`, the resolver now reads `MJ: Entity Record Documents.VectorJSON` for the document directly (with the context user), restricts it to the entity records that pass the optional filter, and labels each item with Entity, RecordID and the record's name fields. The Pinecone path is unchanged.
