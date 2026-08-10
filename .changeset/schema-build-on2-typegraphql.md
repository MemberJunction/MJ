---
"@memberjunction/server": patch
---

Fix O(N²) GraphQL schema-build scaling at MJAPI boot. `buildSchemaSync` was super-linear in entity count due to two O(N²) hotspots inside type-graphql (a loop-invariant recompute in the field-config thunk, and per-field/per-def `.filter()` scans over global metadata arrays). Applied via `patch-package` (`packages/MJServer/patches/type-graphql+2.0.0-beta.3.patch`) as pure memoization/indexing that preserves schema output exactly. Measured at 1,380 entities: `buildSchemaSync` 66.3s → 1.2s (54×), total cold boot 95.6s → 32.1s (−66%); win grows with entity count and does not affect per-request serving. Also adds flag-gated boot-profiling instrumentation (`MJ_SCHEMA_PROFILE` / `MJ_SCHEMA_CPUPROF`, no-op unless set).
