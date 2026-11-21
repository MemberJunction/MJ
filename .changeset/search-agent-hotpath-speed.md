---
"@memberjunction/core": patch
"@memberjunction/search-engine": patch
"@memberjunction/core-actions": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
---

Optimize search, agent, and prompt hot paths and harden multi-tenant RunView deduplication:
- Partition `ProviderBase` RunView in-flight deduplication and linger cache keys by `contextUser` per-request isolation state (`TenantContext`, `MagicLinkScope`, `APIKeyActingContext`, `APIKeyRowFilters`, `WidgetGuestContext`, `AnonymousVisitorID`, and `IsMagicLinkAnonymous` roles) via an overridable `ComputeRunViewDedupContextScope(contextUser)` hook, preserving case sensitivity for non-UUID tenant IDs and bypassing dedup when unknown nested `TenantContext` object shapes are present.
- Add bounded 30s user-scoped LRU metadata caches (`UserScopedCacheKey`, max 100 entries) for `MJ: Vector Indexes` and `MJ: Vector Databases` plus non-colocated `VectorDBBase` client pooling in `VectorSearchProvider` with entity-mutation invalidation.
- Add `SearchParams.SkipNameEnrichment` and skip tag hydration in `FullTextSearchProvider` when no tag filter is active.
- Combine lane `ExtraFilter` and reader RLS into a single-pass `RunView` in `SearchEngine` using a non-serializable Symbol verification stamp while preserving `VerifyOriginRecords`, FLS projection, and per-reader audience isolation.
- Resolve Agent and Skill principals from `AIEngine.Instance` before falling back to `GetEntityObject.Load` in `ScopedSearchAction`.
- Coalesce and background intermediate `ConversationDetail.Save()` progress writes in `AgentRunner.RunAgentInConversation`, pass explicit `inputArtifacts: []` from `BaseAgent` sub-agent delegation to skip redundant `hydrateConversationArtifacts` scans without affecting realtime delegation, and defer `'System Only'` internal payload-only artifact persistence off the reply critical path when no `artifactDirective` is present (leaving `artifactInfo` undefined so no client artifact notification fires for internal payload state).
- Inherit `modelSelectionPrompt.ModelSpecificResponseFormat` in `AIPromptRunner` when `effectiveResponseFormat` is active and the executing prompt leaves `ModelSpecificResponseFormat` unset.
