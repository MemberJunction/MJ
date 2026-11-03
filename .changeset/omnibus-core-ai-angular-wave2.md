---
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
"@memberjunction/core": patch
"@memberjunction/templates-base-types": patch
"@memberjunction/templates": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-reranker": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/a2aserver": patch
"@memberjunction/actions": patch
"@memberjunction/ng-join-grid": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-notifications": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-whiteboard": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
---

Omnibus Core, AI/MCP/Agent & Angular Performance & Resource Optimization (Waves 1–3):

- **Wave 1 (Core Data Access, Server Resolvers & Caching)**:
  - `MJ-CORE-6`: Collapse multi-query `RunView` execution (`viewSQL`, `countSQL`, `aggregateSQL`) into a single `ExecuteSQLBatch` call in `GenericDatabaseProvider`.
  - `MJ-CORE-9`: Resolve `UserView` metadata through `UserViewEngine.Instance` in `ResolverBase` / `RunViewResolver`, pass pre-resolved `ViewEntity` into `RunViewParams`, and reuse a single `Metadata` instance across `ArrayFilterEncryptedFieldsForAPI`.
  - `MJ-CORE-5`: Parallelize `BaseEngine` dataset item entity hydration (`Promise.all`), maintain `_datasetItemMappings` for in-place `AutoRefresh` on dataset-loaded configs, enable `AutoRefresh: true` on `TemplateEngineBase`, and validate Nunjucks compiled template cache against `sourceText`.
- **Wave 2 (AI, Agents, Prompts, Vectors, MCP & A2A)**:
  - `MJ-AI-5` / `MJ-AI-6`: Replace dynamic `await import('stream')` with static `Readable` import in `MCPServer`, cache compiled `ToolConfig` entries and Zod schemas across sessions (`GetOrBuildCompiledToolConfigs` / `ClearCompiledToolCache`), and route tool handlers through the active request's `SessionContext`.
  - `MJ-AI-7`: Default `EntityVectorSyncer` `delayTimeMS` to `0`, parallelize `saveEntityRecordDocument` with bounded concurrency (`10`), and use `SaveReturnMode: 'datestamps_only'`.
  - `MJ-AI-8`: Thread `provider?: IMetadataProvider` through `RerankObservabilityOptions` and save observability PromptRuns with `SaveReturnMode: 'datestamps_only'`.
  - `MJ-AI-9`: Support single-INSERT pre-completed `AIPromptRun` steps (`completed` option on `createStepEntity`) and coalesce streaming progress chunks at 35ms intervals.
  - `MJ-AI-10` / `MJ-AI-11`: Parallelize `AgentPreExecutionRAG` scope searches (`Promise.all`), isolate `AgentRunWatchdog` sweeps per run (`{ provider, contextUser }`), and pause the watchdog interval when zero runs are active.
  - `MJ-AI-12` / `MJ-AI-13`: Replace 500ms SSE polling in `A2AServer` with event-driven `TaskStore.Subscribe` / `Notify`, cache the discovery `AgentCard`, and wire `TaskStore.CancelTask` (`AbortController`) to `AgentOperations.executeAgent()`.
  - `MJ-AI-14`: Short-circuit `ActionEngineServer.SnapshotInputParams` in $O(1)$ when execution logging is disabled and reuse a single `ClassFactory` action instance per `RunAction` lifecycle.
- **Wave 3 (Angular Change Detection, Leaks & Algorithmic Hotspots)**:
  - `MJ-NG-4`: Add `ChangeDetectionStrategy.OnPush` and explicit `ChangeDetectorRef.markForCheck()` across `JoinGridComponent`, `SearchSuggestComponent`, `ArtifactTypePluginViewerComponent`, `ActionFormComponent`, `AIPromptFormComponent`, and Explorer AI/Communication dashboards (`AutotaggingPipelineResourceComponent`, `ExecutionMonitoringComponent`, `ModelPromptPriorityMatrixComponent`, `TagsResourceComponent`, `CommunicationMonitorResourceComponent`, `CommunicationLogsResourceComponent`, `CommunicationRunsResourceComponent`).
  - `MJ-NG-5`: Fix timer/listener/subject leaks across `MJNotificationsService`, `MessageListComponent`, `UserNotificationsComponent`, `ActionFormComponent`, `AIPromptFormComponent`, `AutotaggingPipelineResourceComponent`, and `ExecutionMonitoringComponent`.
  - `MJ-NG-6`: Pre-index and memoize hot template/filter/render paths in `ConversationChatAreaComponent`, `WhiteboardBoardComponent`, `EntityDataGridComponent`, `DataExplorerDashboardComponent`, and `MCPDashboardComponent`.
