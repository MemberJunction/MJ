---
"@memberjunction/ai-vector-sync": minor
"@memberjunction/core-actions": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/ai-vector-dupe": patch
---

Entity Vector Sync: ship standard Search Entity Documents, no-op cleanly when none are configured, and remove a duplicate metadata load at startup.

**`@memberjunction/ai-vector-sync` (minor — ships new seed metadata; downstream installs must run `mj sync push` / a metadata migration to pick up the standard Search Entity Documents):**
- Adds a standard set of Active `Search`-type Entity Documents — `MJ: Entities`, `MJ: AI Agents`, `MJ: Actions`, `MJ: AI Prompts`, `MJ: AI Models` — under `/metadata/entity-documents/` (+ Nunjucks templates and a folder README), all on the in-process `Simple Vector Service Provider` + `gte-small (Local)` stack (no API key, no per-token cost). Semantic / hybrid `Provider.SearchEntity` now works out of the box for these core catalogs.
- `EntityVectorSyncer.GetActiveEntityDocuments` returns `[]` (logging a warning for an unknown/misspelled type name) instead of throwing when no Active documents of the requested type exist, so unattended callers don't hard-fail on an empty/fresh DB.

**`@memberjunction/core-actions` (patch):** `VectorizeEntityAction` returns `Success`/`ResultCode: "NO_DOCUMENTS"` (a benign no-op) when there are no Active Entity Documents of the requested type — so the daily `Entity Vector Sync` scheduled job no longer reports a *failed* run on a fresh DB — and captures `Config()`/lookup errors as a legible `FAILED` result instead of an uncaught throw. Also fixes a latent `error as any`.

**`@memberjunction/aiengine` + `@memberjunction/ai-agents` (patch — startup perf / telemetry):** `AIEngine.RefreshActions` now reuses already-cached `MJ: Actions` metadata via `BaseEngineRegistry.TryGetCachedRecords` instead of loading a second copy into `ActionEngineBase` (a separate singleton from the server-side `ActionEngineServer`); `BaseAgent.initializeEngines` loads `ActionEngineServer` before `AIEngine` so the registry hit lands. Together these eliminate the duplicate 6-entity `RunViews` batch (and its "Duplicate RunView Detected" telemetry warning) at agent/scheduled-job startup.

**Keyless local vector providers (`@memberjunction/ai-vectordb`, `@memberjunction/ai-vectors-memory`, `@memberjunction/ai-vector-dupe` — patch):** `VectorDBBase` gains a `RequiresAPIKey` capability (default `true`); `SimpleVectorServiceProvider` overrides it to `false` since it's in-process (reads vectors from `MJ: Entity Record Documents.VectorJSON`, no external service). Both the Entity Vector Sync pipeline and the duplicate-record detector now consult `RequiresAPIKey` (in addition to the existing colocated-query exemption) before rejecting a provider for a missing key — fixing a spurious `No API Key found for Vector Database SimpleVectorServiceProvider` that blocked the standard Search docs above from vectorizing. The dupe detector also no longer pre-throws on a missing embedding key, so local embedding models (e.g. `gte-small (Local)`) work there too, matching the sync pipeline.

Adds 14 unit tests (9 covering the VectorizeEntityAction no-op / failure-aggregation / error-capture / param-shaping paths; 3 covering `RefreshActions` registry-reuse vs. base-engine fallback; 2 covering the `RequiresAPIKey` default + `SimpleVectorServiceProvider` override). No code migrations; the only downstream action is the metadata sync noted above. Docs updated: `ENTITY_SEARCH_GUIDE.md`, `@memberjunction/ai-vector-sync` README, `metadata/entity-documents/README.md`, `CACHING_AND_PUBSUB_GUIDE.md`, and JSDoc.
