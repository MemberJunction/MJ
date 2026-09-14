---
"@memberjunction/storage": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/search-engine": patch
---

Knowledge Hub + universal search fixes found wiring a Dropbox team-space vault and a website crawl into Pinecone.

- **storage (Dropbox):** the refresh-token constructor path now marks the driver configured (callers that only construct the driver, like `AutotagCloudStorage`, were rejected with "Missing: Access Token"); optional `STORAGE_DROPBOX_PATH_ROOT` applies an SDK `pathRoot` so Business team-space paths resolve.
- **content-autotagging:** `AutotagCloudStorage` walks sub-folders under `PathPrefix` instead of one level; the vectorizer addresses the 3rd-party index by `VectorIndex.ExternalID` (fallback `Name`) instead of the display name; invalid-content deletions and failed content-item saves are now logged instead of silent.
- **search-engine:** `VectorSearchProvider` uses `VectorIndex.ExternalID` for the provider-side index name — the Semantic lane 404'd against Pinecone on every query when the MJ display name differed from the index name.
