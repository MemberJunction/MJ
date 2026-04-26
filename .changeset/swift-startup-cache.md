---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ai-engine-base": patch
---

Tighten the fast-startup window so all parallel engine loads share the local cache, defer background metadata validation until after StartupManager finishes, parallelize per-param IndexedDB cache checks, gzip-compress AllMetadata in localStorage, scope UserInfoEngine loads by UserID on the Network provider, and replace GeoDataEngine's Web Worker boundary parser with synchronous parsing to avoid an 11+s structured-clone stall.
