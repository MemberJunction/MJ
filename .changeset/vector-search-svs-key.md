---
"@memberjunction/search-engine": patch
---

Query Simple Vector Service indexes by Entity Document ID in `VectorSearchProvider` (#4911).

A vector database that sets `QueryKeyIsEntityDocumentID` (the in-process Simple Vector Service) keys its vectors by Entity Document, not by index name. `VectorSearchProvider` always passed `ExternalID || Name`, so the shipped default index `Default - SVS + gte-small (Local)` failed with "Conversion failed when converting from a character string to uniqueidentifier".

For such a provider, the search now queries every Active Entity Document that points at the index, read from the `KnowledgeHubMetadataEngine` cache, and keeps the best `topK` across them. Each match is attributed to its document's entity, since these providers return only a `RecordID`. If no Active Entity Document points at the index, that index fails with a clear error instead of reaching the driver with a name. Name-keyed providers are unchanged.

These providers ignore the metadata filter, so filters are handled before querying. `EntityNames` narrows the documents queried, since each document is one entity. `Tags`, `SourceTypes`, or a scope `MetadataFilter` on the index cannot be applied, so the index is skipped and the reason logged, rather than returning results the filter excludes.
