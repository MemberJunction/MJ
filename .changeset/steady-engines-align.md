---
"@memberjunction/core": patch
---

Fix BaseEngine cache callback fingerprint mismatch that broke cross-server invalidation via Redis pub/sub by extracting a shared BuildRunViewParamsForConfig method to ensure consistent RunViewParams across LoadSingleEntityConfig, LoadMultipleEntityConfigs, and RegisterCacheChangeCallbacks
