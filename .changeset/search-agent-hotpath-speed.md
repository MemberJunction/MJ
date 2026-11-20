---
"@memberjunction/core": patch
"@memberjunction/search-engine": patch
"@memberjunction/core-actions": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
---

Optimize search, agent, and prompt hot paths and harden multi-tenant RunView deduplication without changing external behavior or security boundaries:
- Partition `ProviderBase` RunView in-flight deduplication and linger cache keys by `contextUser` per-request isolation state (`TenantContext`, `MagicLinkScope`, `APIKeyActingContext`, `APIKeyRowFilters`, `WidgetGuestContext`, `AnonymousVisitorID`, and `IsMagicLinkAnonymous` roles) via an overridable `ComputeRunViewDedupContextScope(contextUser)` hook, preventing cross-tenant dedup bleed before `PreRunView` hooks run.
- Add 30s user-scoped metadata caches (`UserScopedCacheKey`) for `MJ: Vector Indexes` and `MJ: Vector Databases` plus non-colocated `VectorDBBase` client pooling in `VectorSearchProvider` with entity-mutation invalidation.
- Add `SearchParams.SkipNameEnrichment`, skip redundant `MJ: Content Items` DB lookups in `SearchEnricher.ExcludeEntitySourcedContentItems` when no Entity content sources exist (failing closed when metadata is constrained), and skip tag hydration in `FullTextSearchProvider` when no tag filter is active.
- Combine lane `ExtraFilter` and reader RLS into a single-pass `RunView` in `SearchEngine` using a non-serializable Symbol verification stamp while preserving `VerifyOriginRecords`, FLS projection, and per-reader audience isolation.
- Add 30s user-scoped caching with entity-event invalidation and `ClearCache()` to `SearchScopePermissionResolver`.
- Resolve Agent and Skill principals from `AIEngine.Instance` before falling back to `GetEntityObject.Load` in `ScopedSearchAction`.
- Coalesce and background intermediate `ConversationDetail.Save()` progress writes in `AgentRunner.RunAgentInConversation`, skip redundant `hydrateConversationArtifacts` scans on sub-agents (`parentRun != null`), and defer `'System Only'` internal payload artifact persistence off the reply critical path when no `artifactDirective` is present.
- Inherit `modelSelectionPrompt.ModelSpecificResponseFormat` in `AIPromptRunner` when the executing prompt leaves `ModelSpecificResponseFormat` unset.
