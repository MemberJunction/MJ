---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-engine-base": minor
"@memberjunction/integration-schema-builder": minor
"@memberjunction/server": minor
---

Integration-core consolidation (GrowthZone/OpenWater/ORCID/PropFuel-PathLMS learnings):
deterministic §4 content-hash identity stamp for keyless rows; door-before-child dependency
ordering derived from soft-FK parentObjectName/ReferencedType; adaptive rate-limit hooks
(RateLimitAcquire/Report/MaxConcurrency) on FetchContext; unsized strings map to unbounded text
(never the 255 truncation floor); soft-PK columns emitted nullable; shared auth-helpers
(OAuth2TokenManager); KeySerialization/RecordFlatten committed (previously untracked but imported —
fresh clones could not build); IntegrationEngineBase.SeedForTesting for offline replay harnesses.
