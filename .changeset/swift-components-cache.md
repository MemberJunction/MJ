---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/react-runtime": patch
"@memberjunction/react-test-harness": patch
"@memberjunction/ng-dashboards": patch
---

Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
