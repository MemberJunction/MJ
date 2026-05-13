---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-base-application": patch
---

Add cross-server cache invalidation via shared storage provider, fix "No Applications Available" after browser refresh, use cacheSettings.verboseLogging for Redis provider, add ParameterHints to override LLM-generated sampleValues, and thread forceRefresh as BypassCache through BaseEngine config loading
