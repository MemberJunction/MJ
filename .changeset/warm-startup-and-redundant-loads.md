---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/graphql-dataprovider": patch
---

Eliminate redundant main-thread `SaveLocalMetadataToStorage` serialization on warm `RefreshCurrentUser` when user/roles are unchanged, chunk browser `arrayBufferToBase64` encoding, bypass the 10ms dataset-status coalescing timer for the solo `MJ_Metadata` pre-validation check, reuse pre-resolved IndexedDB cache entries in `executeSmartCacheCheck`, parallelize `AIEngineBase` sub-engine initialization, and register `InstanceConfigEngine` for startup coalescing.
