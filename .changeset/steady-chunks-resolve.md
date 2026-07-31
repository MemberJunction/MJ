---
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
---

Fix MJ Explorer lazy module loading: chunks are now deduped by an explicit `chunkId` instead of loader source text (which collapsed all 18 chunks into one and stopped lazy-only registrations like `FeaturePipelinesResource` from ever loading), and lookups fall back to the subclass key alone so resolution survives build-mode renames of the base class (`_BaseResourceComponent`, `BaseResourceComponent2`). Failed chunk imports now retry on the next navigation instead of caching the rejection for the rest of the session. Downstream apps must regenerate their lazy config (`mj codegen manifest --lazy-config …`) after upgrading — generated entries changed shape from a loader function to `{ chunkId, load }`, and `GetSnapshot().chunkCount` was renamed `loadedChunkCount`.
