---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/templates-base-types": patch
"@memberjunction/task-graph": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/integration-test-suite": patch
---

Phase 2 fresh efficiency and quality audit across Core Data Primitives, Task Graph Engine, AI Agent Runtime & PayloadManager, High-Volume Telemetry SaveReturnMode, and Angular Chat / Step Inspector UI:

- **Core Data Primitives (`@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/server`, `@memberjunction/templates-base-types`)**:
  - Restore lazy `_raw` `BaseEntity` hydration on `GetEntityObject()` + `LoadFromData()` (`20.87x` faster, `-100%` `EntityField` allocations on read-only `entity_object` views) while guarding subsequent `LoadFromData()` calls on already-loaded instances.
  - Support runtime `options.SaveReturnMode === 'datestamps_only'` projection in `SQLServerDataProvider.WrapSaveCallForResult`.
  - Eliminate duplicate `DiffObjects()` and `CreateUserDescriptionOfChanges()` calls in `GenericDatabaseProvider.Save()`.
  - Add precomputed `FieldMappingPlan` in `ResolverBase.ArrayMapFieldNamesToCodeNames` and `O(1)` `EntityInfo.FieldByCodeName()` lookup.
  - Deduplicate `entity.GetAll()` across `DatabaseProviderBase.Save()` and `BaseEntity.finalizeSave()` via `__mj_preMerged`, mark unpopulated virtual fields `NotLoaded = true` on new `datestamps_only` inserts, compute `ProviderBase.prepareSmartCacheCheckParams` fingerprint before widening `param.Fields`, and avoid double property reads in `NunjucksSandbox.guardMemberLookup`.
- **Task Graph Engine (`@memberjunction/task-graph`)**:
  - Collapse `TaskGraphDispatcher.pollOnce` from `6 + 13G` to `3 + 2G` DB queries via a single `loadGraphState` per active graph per poll, gate `checkHumanTaskCompletion` with an in-memory `pendingHumanTasks` set, pass pre-hydrated `ClaimedTaskCandidate` into `executeClaimed` (`0` re-queries), parallelize `TaskGraphService.Submit` and `persistComputedLayout`, and complete `AgentSpecSync.LoadFromDatabase` round-trip hydration.
- **AI Agent Runtime, Prompts & PayloadManager (`@memberjunction/ai-agents`, `@memberjunction/ai-prompts`)**:
  - Gate `BaseAgent.runPostRunCompaction` on `!IsVolatileResultMessage(msg)` and `!msg.toolCalls?.length`, reuse `_promptRunner`, queue compaction steps via `_stepSaveQueue`, and account for compaction steps in `_treeBudget`.
  - Remove synchronous `stepEntity.Save()` queue bypasses in `checkExecutionGuardrails` and `validateSuccessNextStep`, and route `AIPromptRunner.executePromptInParallel` parent completion save through `queuePromptRunCompletionUpdate`.
  - Fix `PayloadManager.mergeAllowedPaths` `arguments[2]` warning bug and cache compiled glob/wildcard `RegExp` and parsed path specs statically (`49,150x` fewer regex compilations).
  - Add `O(1)` reference + metadata snapshot fast path to `BaseAgent.capturePromptStepMessages` (`16.2x` faster) and memoize child template placeholder analysis.
- **High-Volume Telemetry `SaveReturnMode: 'datestamps_only'` (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/ai-prompts`, `@memberjunction/actions`)**:
  - Pass `{ SaveReturnMode: 'datestamps_only' }` in `AgentRunStepSaveQueue`, `BaseAgent._agentRun.Save`, `BaseModelRunner._promptRunQueue`, and `ActionEngineServer._logQueue`.
- **Angular Chat, Task Graph & Step Inspector (`@memberjunction/ng-conversations`, `@memberjunction/ng-ai-test-harness`, `@memberjunction/ng-core-entity-forms`)**:
  - Memoize `DisplayArtifacts`, `SupportingArtifacts`, and single-pass `buildWorkflowStepSummaries` in `MessageItemComponent`, memoize JSON parsing and graph layout positions in `AIAgentRunStepDetailComponent` and `MJAIAgentRunFormComponentExtended`, add `ShouldReplaceDetailAgentRun` guard and `RefreshRenderedMessage` in `ConversationMessageListComponent`, migrate `artifactPaneWidth` from `localStorage` to `UserInfoEngine`, and remove redundant `MJ: AI Agent Runs` query in `AIAgentRunDataHelper`.
