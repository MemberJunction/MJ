---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/templates-base-types": patch
"@memberjunction/core-entities": patch
"@memberjunction/ai-engine-base": patch
---

Guard `ProviderBase` dataset caching and staleness checks against failed or undated dataset results (`LatestUpdateDate: null`), extend `BaseEngine` permission pre-checking and empty-load classification to `Type: 'dataset'` configs, and make `TemplateEngineBase` safe for least-privilege roles without template read permissions.

