# MemberJunction Unused Packages & Dead Code Audit

**Date**: 2026-01-29
**Branch**: `an-dev-5`
**Methodology**: Full transitive dependency graph analysis from all 7 entry-point applications, cross-referenced against complete package inventory. Dynamic instantiation via `@RegisterClass`/`ClassFactory` patterns also analyzed.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Entry Points Analyzed](#entry-points-analyzed)
3. [Complete Package Inventory](#complete-package-inventory)
4. [Packages NOT Used by Any Entry Point](#packages-not-used-by-any-entry-point)
5. [Packages Used by Only One Entry Point](#packages-used-by-only-one-entry-point)
6. [Dynamic Instantiation Considerations](#dynamic-instantiation-considerations)
7. [Recommended Actions](#recommended-actions)
8. [Class-Level Dead Code Candidates](#class-level-dead-code-candidates)
9. [Appendix: Full Dependency Graphs per Entry Point](#appendix-full-dependency-graphs-per-entry-point)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total packages in monorepo** | ~155 (including AI providers, BizApps, Communication providers) |
| **Entry-point applications** | 7 (MJExplorer, MJAPI, MJCLI, MJCodeGenAPI, MCPServer, A2AServer, AICLI) |
| **Packages used by at least one entry point** | ~140 |
| **Packages NOT used by any entry point** | **~15** |
| **Packages safe to remove (high confidence)** | **6** |
| **Packages possibly removable (needs verification)** | **5** |
| **Packages to keep but audit for dead classes** | **~10** |

---

## Entry Points Analyzed

| Entry Point | Package Name | Location | Role | Direct MJ Deps | Transitive MJ Deps |
|------------|-------------|----------|------|-----------------|---------------------|
| **MJExplorer** | `mj_explorer` | `packages/MJExplorer/` | Angular UI app | 26 | ~84 |
| **MJAPI** | `mj_api` | `packages/MJAPI/` | GraphQL API server | ~20 | ~84 |
| **MJCLI** | `@memberjunction/cli` | `packages/MJCLI/` | CLI for codegen, testing, metadata | 9 | ~52 |
| **MJCodeGenAPI** | `mj_codegen_api` | `packages/MJCodeGenAPI/` | CodeGen API server | 5 | ~35 |
| **MCPServer** | `@memberjunction/ai-mcp-server` | `packages/AI/MCPServer/` | MCP protocol server | 17 | ~75 |
| **A2AServer** | `@memberjunction/a2aserver` | `packages/AI/A2AServer/` | Agent-to-Agent server | 12 | ~75 |
| **AICLI** | `@memberjunction/ai-cli` | `packages/AI/AICLI/` | AI CLI tool | via MJCLI | via MJCLI |

### Key Observation: `@memberjunction/server` is the Major Aggregator

The `@memberjunction/server` package (used by MJAPI, MCPServer, A2AServer) pulls in ~45 direct dependencies, which transitively brings in ~75+ packages. This means most of the ecosystem is "used" through server-side apps. The Angular side (MJExplorer) adds ~30 more Angular-specific packages.

---

## Complete Package Inventory

### AI Packages (41 packages)

| Package | npm Name | Used By | Status |
|---------|----------|---------|--------|
| AI/Core | `@memberjunction/ai` | ALL | Active |
| AI/CorePlus | `@memberjunction/ai-core-plus` | ALL | Active |
| AI/BaseAIEngine | `@memberjunction/ai-engine-base` | ALL | Active |
| AI/Engine | `@memberjunction/aiengine` | ALL | Active |
| AI/Agents | `@memberjunction/ai-agents` | MJAPI, MCPServer, A2AServer, MJCLI | Active |
| AI/AgentManager/core | `@memberjunction/ai-agent-manager` | MJAPI, MCPServer, A2AServer | Active |
| AI/AgentManager/actions | `@memberjunction/ai-agent-manager-actions` | MJAPI, MCPServer, A2AServer | Active |
| AI/Prompts | `@memberjunction/ai-prompts` | ALL | Active |
| AI/Reranker | `@memberjunction/ai-reranker` | MJAPI, MCPServer, A2AServer, MJCLI | Active |
| AI/MCPClient | `@memberjunction/ai-mcp-client` | MJAPI, MCPServer, A2AServer | Active |
| AI/MCPServer | `@memberjunction/ai-mcp-server` | Entry point | Active |
| AI/A2AServer | `@memberjunction/a2aserver` | Entry point | Active |
| AI/AICLI | `@memberjunction/ai-cli` | MJCLI | Active |
| AI/Providers/Bundle | `@memberjunction/ai-provider-bundle` | MJAPI, MCPServer, A2AServer, MJCLI, CodeGenLib | Active |
| AI/Providers/Anthropic | `@memberjunction/ai-anthropic` | via Bundle | Active |
| AI/Providers/Azure | `@memberjunction/ai-azure` | via Bundle | Active |
| AI/Providers/Bedrock | `@memberjunction/ai-bedrock` | via Bundle | Active |
| AI/Providers/BettyBot | `@memberjunction/ai-betty-bot` | via Bundle | Active |
| AI/Providers/BlackForestLabs | `@memberjunction/ai-blackforestlabs` | via Bundle | Active |
| AI/Providers/Cerebras | `@memberjunction/ai-cerebras` | via Bundle | Active |
| AI/Providers/Cohere | `@memberjunction/ai-cohere` | via Bundle | Active |
| AI/Providers/ElevenLabs | `@memberjunction/ai-elevenlabs` | via Bundle | Active |
| AI/Providers/Gemini | `@memberjunction/ai-gemini` | via Bundle | Active |
| AI/Providers/Groq | `@memberjunction/ai-groq` | via Bundle | Active |
| AI/Providers/HeyGen | `@memberjunction/ai-heygen` | via Bundle | Active |
| AI/Providers/LMStudio | `@memberjunction/ai-lmstudio` | via Bundle | Active |
| AI/Providers/LocalEmbeddings | `@memberjunction/ai-local-embeddings` | via Bundle | Active |
| AI/Providers/Mistral | `@memberjunction/ai-mistral` | via Bundle | Active |
| AI/Providers/Ollama | `@memberjunction/ai-ollama` | via Bundle | Active |
| AI/Providers/OpenAI | `@memberjunction/ai-openai` | via Bundle | Active |
| AI/Providers/OpenRouter | `@memberjunction/ai-openrouter` | via Bundle | Active |
| AI/Providers/Recommendations-Rex | `@memberjunction/ai-recommendations-rex` | via Bundle | Active |
| AI/Providers/Vertex | `@memberjunction/ai-vertex` | via Bundle | Active |
| AI/Providers/Vectors-Pinecone | `@memberjunction/ai-vectors-pinecone` | MJAPI, MCPServer, A2AServer | Active |
| AI/Providers/xAI | `@memberjunction/ai-xai` | via Bundle | Active |
| AI/Recommendations/Engine | `@memberjunction/ai-recommendations` | via ai-recommendations-rex | Active |
| AI/Vectors/Core | `@memberjunction/ai-vectors` | via ai-vectors-pinecone, ai-vector-sync | Active |
| AI/Vectors/Database | `@memberjunction/ai-vectordb` | via ai-vectors | Active |
| AI/Vectors/Dupe | `@memberjunction/ai-vector-dupe` | via sqlserver-dataprovider | Active |
| AI/Vectors/Memory | `@memberjunction/ai-vectors-memory` | via ai-vector-dupe | Active |
| AI/Vectors/Sync | `@memberjunction/ai-vector-sync` | via ai-vectors-pinecone | Active |

### Actions Packages (13 packages)

| Package | npm Name | Used By | Status |
|---------|----------|---------|--------|
| Actions/Engine | `@memberjunction/actions` | ALL server-side | Active |
| Actions/Base | `@memberjunction/actions-base` | ALL server-side | Active |
| Actions/CoreActions | `@memberjunction/core-actions` | MJAPI, MCPServer, A2AServer | Active |
| Actions/ApolloEnrichment | `@memberjunction/actions-apollo` | via MJServer | Active |
| Actions/CodeExecution | `@memberjunction/code-execution` | via CoreActions | Active |
| Actions/ContentAutotag | `@memberjunction/actions-content-autotag` | via ScheduledActionsServer | Active |
| Actions/ScheduledActions | `@memberjunction/scheduled-actions` | MJAPI, MCPServer, A2AServer | Active |
| Actions/ScheduledActionsServer | `@memberjunction/scheduled-actions-server` | MJAPI | Active |
| Actions/BizApps/Accounting | `@memberjunction/actions-bizapps-accounting` | via MJServer | Active |
| Actions/BizApps/CRM | `@memberjunction/actions-bizapps-crm` | via MJServer | Active |
| Actions/BizApps/FormBuilders | `@memberjunction/actions-bizapps-formbuilders` | via MJServer | Active |
| Actions/BizApps/LMS | `@memberjunction/actions-bizapps-lms` | via MJServer | Active |
| Actions/BizApps/Social | `@memberjunction/actions-bizapps-social` | via MJServer | Active |

### Angular Explorer Packages (25 packages)

All used by MJExplorer - all Active.

| Package | npm Name |
|---------|----------|
| Bootstrap | `@memberjunction/ng-bootstrap` |
| Explorer/ask-skip | `@memberjunction/ng-ask-skip` |
| Explorer/auth-services | `@memberjunction/ng-auth-services` |
| Explorer/base-application | `@memberjunction/ng-base-application` |
| Explorer/base-forms | `@memberjunction/ng-base-forms` |
| Explorer/compare-records | `@memberjunction/ng-compare-records` |
| Explorer/core-entity-forms | `@memberjunction/ng-core-entity-forms` |
| Explorer/dashboards | `@memberjunction/ng-dashboards` |
| Explorer/entity-form-dialog | `@memberjunction/ng-entity-form-dialog` |
| Explorer/entity-permissions | `@memberjunction/ng-entity-permissions` |
| Explorer/explorer-app | `@memberjunction/ng-explorer-app` |
| Explorer/explorer-core | `@memberjunction/ng-explorer-core` |
| Explorer/explorer-modules | `@memberjunction/ng-explorer-modules` |
| Explorer/explorer-settings | `@memberjunction/ng-explorer-settings` |
| Explorer/form-toolbar | `@memberjunction/ng-form-toolbar` |
| Explorer/kendo-modules | `@memberjunction/ng-kendo-modules` |
| Explorer/link-directives | `@memberjunction/ng-link-directives` |
| Explorer/list-detail-grid | `@memberjunction/ng-list-detail-grid` |
| Explorer/record-changes | `@memberjunction/ng-record-changes` |
| Explorer/shared | `@memberjunction/ng-shared` |
| Explorer/simple-record-list | `@memberjunction/ng-simple-record-list` |
| Explorer/user-view-grid | `@memberjunction/ng-user-view-grid` |
| Explorer/user-view-properties | `@memberjunction/ng-user-view-properties` |
| Explorer/workspace-initializer | `@memberjunction/ng-workspace-initializer` |

### Angular Generic Packages (35 packages)

| Package | npm Name | Used By | Status |
|---------|----------|---------|--------|
| Generic/shared | `@memberjunction/ng-shared-generic` | MJExplorer (transitive) | Active |
| Generic/base-types | `@memberjunction/ng-base-types` | MJExplorer (transitive) | Active |
| Generic/action-gallery | `@memberjunction/ng-action-gallery` | MJExplorer (transitive) | Active |
| Generic/actions | `@memberjunction/ng-actions` | MJExplorer (transitive) | Active |
| Generic/ai-test-harness | `@memberjunction/ng-ai-test-harness` | MJExplorer (transitive) | Active |
| Generic/artifacts | `@memberjunction/ng-artifacts` | MJExplorer (transitive) | Active |
| Generic/chat | `@memberjunction/ng-chat` | MJExplorer via ng-ask-skip | Active |
| Generic/code-editor | `@memberjunction/ng-code-editor` | MJExplorer (transitive) | Active |
| Generic/container-directives | `@memberjunction/ng-container-directives` | MJExplorer (transitive) | Active |
| Generic/conversations | `@memberjunction/ng-conversations` | MJExplorer (transitive) | Active |
| Generic/credentials | `@memberjunction/ng-credentials` | MJExplorer (transitive) | **VERIFY** |
| Generic/dashboard-viewer | `@memberjunction/ng-dashboard-viewer` | MJExplorer (transitive) | Active |
| Generic/data-context | `@memberjunction/ng-data-context` | MJExplorer via ng-ask-skip, ng-skip-chat | Active |
| Generic/deep-diff | `@memberjunction/ng-deep-diff` | MJExplorer (transitive) | Active |
| Generic/entity-communication | `@memberjunction/ng-entity-communications` | MJExplorer (transitive) | Active |
| Generic/entity-relationship-diagram | `@memberjunction/ng-entity-relationship-diagram` | MJExplorer (transitive) | Active |
| Generic/entity-viewer | `@memberjunction/ng-entity-viewer` | MJExplorer (transitive) | Active |
| Generic/export-service | `@memberjunction/ng-export-service` | MJExplorer (transitive) | Active |
| Generic/file-storage | `@memberjunction/ng-file-storage` | MJExplorer (transitive) | Active |
| Generic/filter-builder | `@memberjunction/ng-filter-builder` | MJExplorer (transitive) | Active |
| Generic/find-record | `@memberjunction/ng-find-record` | MJExplorer (transitive) | Active |
| Generic/generic-dialog | `@memberjunction/ng-generic-dialog` | MJExplorer (transitive) | Active |
| Generic/join-grid | `@memberjunction/ng-join-grid` | MJExplorer (transitive) | Active |
| Generic/list-management | `@memberjunction/ng-list-management` | MJExplorer (transitive) | Active |
| Generic/markdown | `@memberjunction/ng-markdown` | MJExplorer (transitive) | Active |
| Generic/notifications | `@memberjunction/ng-notifications` | MJExplorer (transitive) | Active |
| Generic/query-grid | `@memberjunction/ng-query-grid` | MJExplorer (transitive) | Active |
| Generic/query-viewer | `@memberjunction/ng-query-viewer` | MJExplorer (transitive) | Active |
| Generic/react | `@memberjunction/ng-react` | MJExplorer (transitive) | Active |
| Generic/record-selector | `@memberjunction/ng-record-selector` | MJExplorer (transitive) | Active |
| Generic/resource-permissions | `@memberjunction/ng-resource-permissions` | MJExplorer (transitive) | Active |
| Generic/skip-chat | `@memberjunction/ng-skip-chat` | MJExplorer (transitive) | Active |
| Generic/tab-strip | `@memberjunction/ng-tabstrip` | MJExplorer (direct) | Active |
| Generic/tasks | `@memberjunction/ng-tasks` | MJExplorer (transitive) | Active |
| Generic/Testing | `@memberjunction/ng-testing` | MJExplorer (transitive) | Active |
| Generic/timeline | `@memberjunction/ng-timeline` | MJExplorer (direct) | Active |
| **Generic/tree-list** | **`@memberjunction/ng-treelist`** | **NONE** | **UNUSED** |
| Generic/trees | `@memberjunction/ng-trees` | MJExplorer (transitive) | Active |
| Generic/user-avatar | `@memberjunction/ng-user-avatar` | MJExplorer (transitive) | Active |

### Communication Packages (10 packages)

| Package | npm Name | Used By | Status |
|---------|----------|---------|--------|
| Communication/base-types | `@memberjunction/communication-types` | ALL server-side | Active |
| Communication/engine | `@memberjunction/communication-engine` | MJAPI, MCPServer, A2AServer | Active |
| Communication/entity-comm-base | `@memberjunction/entity-communications-base` | MJExplorer, MJAPI | Active |
| Communication/entity-comm-client | `@memberjunction/entity-communications-client` | MJExplorer | Active |
| Communication/entity-comm-server | `@memberjunction/entity-communications-server` | MJAPI, MCPServer, A2AServer | Active |
| Communication/notifications | `@memberjunction/notifications` | MJAPI, MCPServer, A2AServer | Active |
| Communication/providers/MSGraph | `@memberjunction/communication-ms-graph` | via MJServer | Active |
| Communication/providers/sendgrid | `@memberjunction/communication-sendgrid` | via MJServer | Active |
| **Communication/providers/gmail** | **`@memberjunction/communication-gmail`** | **NONE** | **UNUSED** |
| **Communication/providers/twilio** | **`@memberjunction/communication-twilio`** | **NONE** | **UNUSED** |

### Infrastructure Packages

| Package | npm Name | Used By | Status |
|---------|----------|---------|--------|
| MJGlobal | `@memberjunction/global` | ALL | Active |
| MJCore | `@memberjunction/core` | ALL | Active |
| MJCoreEntities | `@memberjunction/core-entities` | ALL | Active |
| MJCoreEntitiesServer | `@memberjunction/core-entities-server` | ALL server-side | Active |
| MJServer | `@memberjunction/server` | MJAPI, MCPServer, A2AServer | Active |
| ServerBootstrap | `@memberjunction/server-bootstrap` | MJAPI | Active |
| MJDataContext | `@memberjunction/data-context` | ALL | Active |
| MJDataContextServer | `@memberjunction/data-context-server` | ALL server-side | Active |
| GraphQLDataProvider | `@memberjunction/graphql-dataprovider` | MJExplorer, MJCLI | Active |
| SQLServerDataProvider | `@memberjunction/sqlserver-dataprovider` | ALL server-side | Active |
| Config | `@memberjunction/config` | ALL server-side | Active |
| Encryption | `@memberjunction/encryption` | ALL server-side | Active |
| MJQueue | `@memberjunction/queue` | ALL server-side | Active |
| MJStorage | `@memberjunction/storage` | ALL server-side | Active |
| MJExportEngine | `@memberjunction/export-engine` | MJExplorer, MJAPI | Active |
| DocUtils | `@memberjunction/doc-utils` | MJAPI, MCPServer, A2AServer, CodeGenLib | Active |
| Credentials | `@memberjunction/credentials` | ALL server-side | Active |
| APIKeys/Base | `@memberjunction/api-keys-base` | MJExplorer (transitive) | Active |
| APIKeys/Engine | `@memberjunction/api-keys` | MJAPI, MCPServer, A2AServer | Active |
| CodeGenLib | `@memberjunction/codegen-lib` | MJCLI, MJCodeGenAPI | Active |
| InteractiveComponents | `@memberjunction/interactive-component-types` | ALL | Active |
| SkipTypes | `@memberjunction/skip-types` | ALL | Active |
| ExternalChangeDetection | `@memberjunction/external-change-detection` | MJAPI, MCPServer, A2AServer | Active |
| ContentAutotagging | `@memberjunction/content-autotagging` | via CoreActions, ContentAutotag action | Active |
| MetadataSync | `@memberjunction/metadata-sync` | MJCLI | Active |
| QueryGen | `@memberjunction/query-gen` | MJCLI | Active |
| DBAutoDoc | `@memberjunction/db-auto-doc` | MJCLI | Active |
| ComponentRegistryClientSDK | `@memberjunction/component-registry-client-sdk` | via MJServer | Active |
| Templates/base-types | `@memberjunction/templates-base-types` | ALL | Active |
| Templates/engine | `@memberjunction/templates` | ALL server-side | Active |
| Scheduling/base-types | `@memberjunction/scheduling-base-types` | MJAPI, MCPServer, A2AServer | Active |
| Scheduling/base-engine | `@memberjunction/scheduling-engine-base` | MJAPI, MCPServer, A2AServer | Active |
| Scheduling/engine | `@memberjunction/scheduling-engine` | MJAPI, MCPServer, A2AServer | Active |
| Scheduling/actions | `@memberjunction/scheduling-actions` | MJAPI, MCPServer, A2AServer | Active |
| TestingFramework/EngineBase | `@memberjunction/testing-engine-base` | MJExplorer (transitive), MJCLI | Active |
| TestingFramework/Engine | `@memberjunction/testing-engine` | MJAPI, MJCLI | Active |
| TestingFramework/CLI | `@memberjunction/testing-cli` | MJCLI | Active |
| React/runtime | `@memberjunction/react-runtime` | MJExplorer via ng-react | Active |
| **React/test-harness** | **`@memberjunction/react-test-harness`** | **NONE** | **UNUSED** |
| **ComponentRegistry** | **`@memberjunction/component-registry-server`** | **NONE** | **UNUSED** |
| **AngularElements/demo** | **`mj_angular_elements_demo`** | **NONE** | **UNUSED** |

### Private Entry-Point Packages

| Package | npm Name | Status |
|---------|----------|--------|
| MJAPI | `mj_api` | Entry point - Active |
| MJExplorer | `mj_explorer` | Entry point - Active |
| MJCodeGenAPI | `mj_codegen_api` | Entry point - Active |
| GeneratedEntities | `mj_generatedentities` | App-specific generated code - Active |
| GeneratedActions | `mj_generatedactions` | App-specific generated code - Active |

### Standalone Test Packages

| Package | Location | Status |
|---------|----------|--------|
| **test-vectorization** | `/test-vectorization/` | **UNUSED** - standalone test, not part of any app |

---

## Packages NOT Used by Any Entry Point

### TIER 1: Safe to Remove (High Confidence - No Dependents Found)

These packages are not depended on by any other package in the monorepo:

| # | Package | npm Name | Location | Reasoning |
|---|---------|----------|----------|-----------|
| 1 | **Communication Gmail Provider** | `@memberjunction/communication-gmail` | `packages/Communication/providers/gmail/` | No package depends on it. Not referenced in MJServer or any other package.json. Only self-references in its own package.json. |
| 2 | **Communication Twilio Provider** | `@memberjunction/communication-twilio` | `packages/Communication/providers/twilio/` | Same as Gmail - no dependents found anywhere in the monorepo. |
| 3 | **Angular TreeList** | `@memberjunction/ng-treelist` | `packages/Angular/Generic/tree-list/` | No package depends on it. Not imported by MJExplorer or any Angular module. Notably, the component file inside is actually named `timeline.component.ts` suggesting it may have been abandoned mid-development. |
| 4 | **React Test Harness** | `@memberjunction/react-test-harness` | `packages/React/test-harness/` | No package depends on it. Standalone testing tool, not integrated into any entry point. |
| 5 | **Angular Elements Demo** | `mj_angular_elements_demo` | `packages/AngularElements/mj-angular-elements-demo/` | Private demo package. No dependents. Legacy experiment. |
| 6 | **test-vectorization** | `test-vectorization` | `/test-vectorization/` | Standalone test script at repo root. Not a package used by any application. |

### TIER 2: Likely Removable (Needs Verification)

These packages have no code-level dependents but may be used in deployment or external contexts:

| # | Package | npm Name | Location | Reasoning |
|---|---------|----------|----------|-----------|
| 7 | **Component Registry Server** | `@memberjunction/component-registry-server` | `packages/ComponentRegistry/` | No package in the monorepo depends on `@memberjunction/component-registry-server`. Note: `@memberjunction/component-registry-client-sdk` IS used (by MJServer). The server-side component registry may be deployed separately or may be dead code. **Verify if this is deployed as a standalone service.** |
| 8 | **Angular Credentials** | `@memberjunction/ng-credentials` | `packages/Angular/Generic/credentials/` | Not found as a direct dependency of any package.json. However, it may be loaded via dynamic `@RegisterClass` patterns in the dashboard system (credentials dashboard). **Verify if the credentials dashboard loads this component dynamically.** |

### TIER 3: Keep but Consider Deprecation

| # | Package | npm Name | Reasoning |
|---|---------|----------|-----------|
| 9 | **ng-skip-chat** | `@memberjunction/ng-skip-chat` | Still used by MJExplorer but CLAUDE.md mentions `ng-conversations` is the replacement. When migration is complete, this can be deprecated. |
| 10 | **ng-chat** | `@memberjunction/ng-chat` | Used only by `ng-ask-skip`. May be superseded by `ng-conversations`. Verify if `ng-ask-skip` is migrating. |

---

## Packages Used by Only One Entry Point

These packages are used but have very narrow usage - good candidates for review if that entry point changes:

| Package | npm Name | Only Used By |
|---------|----------|-------------|
| `@memberjunction/server-bootstrap` | server-bootstrap | MJAPI only |
| `@memberjunction/scheduled-actions-server` | scheduled-actions-server | MJAPI only |
| `@memberjunction/metadata-sync` | metadata-sync | MJCLI only |
| `@memberjunction/query-gen` | query-gen | MJCLI only |
| `@memberjunction/db-auto-doc` | db-auto-doc | MJCLI only |
| `@memberjunction/testing-cli` | testing-cli | MJCLI only |
| `@memberjunction/ai-cli` | ai-cli | MJCLI only |
| `@memberjunction/graphql-dataprovider` | graphql-dataprovider | MJExplorer (+ MJCLI) |
| All `ng-*` packages | Various | MJExplorer only |
| All `actions-bizapps-*` packages | Various | MJAPI/MCPServer/A2AServer via MJServer only |

---

## Dynamic Instantiation Considerations

### How the @RegisterClass / ClassFactory System Works

MemberJunction uses a decorator-based class registration system where:
1. Classes are decorated with `@RegisterClass(BaseClass, 'key')`
2. At runtime, `ClassFactory.CreateInstance(BaseClass, 'key')` creates instances
3. This means **static analysis cannot detect usage** - the class appears "unused" in import graphs

### Total Dynamic Registrations Found: 1,273+

| Category | Count | Base Class |
|----------|-------|------------|
| Entity Classes | 275+ | `BaseEntity` |
| Angular Form Components | 283+ | `BaseFormComponent` |
| Action Classes | 284+ | `BaseAction` |
| Angular Resource Components | 35+ | `BaseResourceComponent` |
| Storage Providers | 7 | `FileStorageProviderBase` |
| Content Autotaggers | 5 | `AutotagBase` |
| CodeGen Generators | 10+ | Various base classes |
| Engine Implementations | 7+ | `BaseEngine`, `AIEngine` |
| Template Extensions | Multiple | `TemplateExtensionBase` |
| Test Drivers | Multiple | `BaseTestDriver` |

### Tree-Shaking Prevention

The monorepo uses two mechanisms to prevent tree-shaking of dynamically registered classes:

1. **Auto-generated manifest files** in MJExplorer and MJAPI that explicitly import all `@RegisterClass`-decorated classes
2. **`Load*()` functions** exported from each package's `public-api.ts` that are called during initialization

### Impact on Dead Code Analysis

Because of dynamic instantiation:
- **Entity subclasses** in `entity_subclasses.ts` cannot be statically analyzed for usage - they are ALL used via metadata lookups
- **Action classes** are invoked by string name from the database - ALL registered actions should be considered "in use"
- **Form components** are loaded by entity name at runtime - ALL registered forms should be considered "in use"
- **Resource components** are loaded by dashboard configuration - ALL registered resources should be considered "in use"

**Bottom line**: For @RegisterClass-decorated classes, removal decisions should be based on whether the **package** is loaded, not whether the individual class has static references.

---

## Recommended Actions

### Phase 1: Remove Dead Packages (Safe - No Dependents)

| Action | Package | Steps |
|--------|---------|-------|
| **DELETE** | `@memberjunction/communication-gmail` | 1. `npm deprecate @memberjunction/communication-gmail "Deprecated: unused provider"` 2. Delete `packages/Communication/providers/gmail/` 3. Remove from workspace config |
| **DELETE** | `@memberjunction/communication-twilio` | Same steps as above for twilio |
| **DELETE** | `@memberjunction/ng-treelist` | 1. `npm deprecate @memberjunction/ng-treelist "Deprecated: replaced by ng-trees"` 2. Delete `packages/Angular/Generic/tree-list/` 3. Remove from workspace config |
| **DELETE** | `@memberjunction/react-test-harness` | 1. Deprecate on npm 2. Delete `packages/React/test-harness/` |
| **DELETE** | `mj_angular_elements_demo` | 1. Delete `packages/AngularElements/` (entire directory) |
| **DELETE** | `test-vectorization` | 1. Delete `/test-vectorization/` directory |

### Phase 2: Verify and Potentially Remove

| Action | Package | Verification Needed |
|--------|---------|-------------------|
| **VERIFY** | `@memberjunction/component-registry-server` | Check if deployed as standalone service anywhere. If not, deprecate and delete. |
| **VERIFY** | `@memberjunction/ng-credentials` | Check if loaded dynamically by credentials dashboard. Search for `'CredentialsResource'` or similar keys in dashboard configs. |

### Phase 3: Future Deprecation Candidates

| Package | When to Deprecate | Replacement |
|---------|-------------------|-------------|
| `@memberjunction/ng-skip-chat` | After full migration to ng-conversations | `@memberjunction/ng-conversations` |
| `@memberjunction/ng-chat` | After ng-ask-skip migrates | `@memberjunction/ng-conversations` |

---

## Class-Level Dead Code Candidates

Beyond whole-package removal, some packages contain classes that may be unused. These are harder to identify definitively because of dynamic instantiation, but here are the most likely candidates:

### In `@memberjunction/core-actions` (CoreActions)

The CoreActions package contains a large number of utility actions. Some of these appear to be speculative/template implementations that may never be invoked:

| Class | Registration Key | Concern |
|-------|-----------------|---------|
| `ColorConverterAction` | `'__ColorConverter'` | Very niche utility - verify if any agent/workflow uses it |
| `UnitConverterAction` | `'__UnitConverter'` | Very niche utility |
| `IPGeolocationAction` | `'__IPGeolocation'` | Requires external API key |
| `GetWeatherAction` | `'__GetWeather'` | Requires external API |
| `GetStockPriceAction` | `'__GetStockPrice'` | Requires external API |
| `BusinessDaysCalculatorAction` | `'__BusinessDaysCalculator'` | Very niche |
| `PasswordStrengthAction` | `'Password Strength'` | Very niche |
| `CensusDataLookupAction` | `'__CensusDataLookup'` | Very niche, US-specific |
| `BettyAction` | `'BettyAction'` | Uses external BettyBot service |

**Note**: These actions are registered with `__` prefix suggesting they are internal/experimental. However, since actions are invoked dynamically from the database, the only safe way to confirm non-usage is to query the `Actions` table to see which have execution logs.

### In `@memberjunction/actions-bizapps-social`

Contains implementations for 6 social media platforms (Twitter, Facebook, Instagram, TikTok, YouTube, HootSuite, Buffer) with 60+ action classes. **If your organization doesn't use social media integration, this entire package and its 60+ classes could be removed from MJServer's dependencies.** However, since it's a general-purpose framework, these may be needed by customers.

### In `@memberjunction/actions-bizapps-*` (All BizApps)

Similarly, the CRM (HubSpot), Accounting (QuickBooks, Business Central), LMS (LearnWorlds), and FormBuilders (Google Forms, JotForm, Typeform, SurveyMonkey) packages each contain 8-22 action classes. These are only useful if the respective integrations are configured. Consider making these **optional plugins** rather than required dependencies of MJServer.

### In Generated Entity Forms (`MJExplorer/src/app/generated/Entities/`)

The `MJExplorer` has 77+ generated entity form directories, many of which are untracked (`??` in git status). These are generated by CodeGen and should be regenerated fresh rather than having dead ones accumulate. The untracked directories in git status suggest new entities were added. **Review if any entities have been deleted but their form directories remain.**

---

## Appendix: Full Dependency Graphs per Entry Point

### MJExplorer (84 packages)

<details>
<summary>Click to expand full list</summary>

**Direct (26):** @memberjunction/core, core-entities, global, graphql-dataprovider, ng-ask-skip, ng-auth-services, ng-base-application, ng-base-forms, ng-bootstrap, ng-compare-records, ng-container-directives, ng-core-entity-forms, ng-dashboards, ng-explorer-app, ng-explorer-core, ng-explorer-modules, ng-explorer-settings, ng-form-toolbar, ng-join-grid, ng-link-directives, ng-record-changes, ng-shared, ng-tabstrip, ng-timeline, ng-user-view-grid, ng-workspace-initializer

**Transitive (58+):** ai, ai-core-plus, ai-engine-base, data-context, ng-base-types, ng-shared-generic, actions-base, ng-actions, ng-action-gallery, ng-ai-test-harness, ng-testing, testing-engine-base, ng-chat, ng-conversations, ng-skip-chat, skip-types, ng-artifacts, ng-code-editor, ng-dashboard-viewer, ng-deep-diff, ng-entity-communications, ng-entity-form-dialog, ng-entity-permissions, ng-entity-relationship-diagram, ng-entity-viewer, ng-export-service, ng-file-storage, ng-filter-builder, ng-find-record, ng-generic-dialog, ng-kendo-modules, ng-list-detail-grid, ng-list-management, ng-markdown, ng-notifications, ng-query-grid, ng-query-viewer, ng-record-selector, ng-resource-permissions, ng-simple-record-list, ng-tasks, ng-trees, ng-user-avatar, ng-user-view-properties, ng-react, react-runtime, interactive-component-types, communication-types, entity-communications-base, entity-communications-client, api-keys-base, export-engine, templates-base-types, ng-data-context, ng-credentials

</details>

### MJAPI (84+ packages)

<details>
<summary>Click to expand full list</summary>

**Direct:** server, server-bootstrap, sqlserver-dataprovider, templates, ai, core, core-entities, global, config, mj_generatedentities, mj_generatedactions

**Via @memberjunction/server (45+):** actions, actions-apollo, actions-bizapps-accounting, actions-bizapps-crm, actions-bizapps-formbuilders, actions-bizapps-lms, actions-bizapps-social, ai-agent-manager, ai-agent-manager-actions, ai-agents, ai-core-plus, ai-mcp-client, ai-prompts, ai-provider-bundle, ai-vectors-pinecone, aiengine, api-keys, communication-ms-graph, communication-sendgrid, component-registry-client-sdk, core-actions, core-entities-server, data-context, data-context-server, doc-utils, encryption, entity-communications-server, external-change-detection, graphql-dataprovider, interactive-component-types, notifications, queue, scheduling-actions, scheduling-base-types, scheduling-engine, scheduling-engine-base, skip-types, storage, templates, testing-engine

**Deep transitives (via providers bundle):** All 20+ AI provider packages, ai-recommendations, ai-recommendations-rex, ai-vectors, ai-vectordb, ai-vector-dupe, ai-vectors-memory, ai-vector-sync, communication-types, actions-base, code-execution, content-autotagging, actions-content-autotag, scheduled-actions, scheduled-actions-server, credentials, api-keys-base, templates-base-types, entity-communications-base, export-engine, ai-engine-base

</details>

### MJCLI (52 packages)

<details>
<summary>Click to expand full list</summary>

**Direct (9):** ai-cli, codegen-lib, config, core, db-auto-doc, metadata-sync, query-gen, sqlserver-dataprovider, testing-cli

**Transitive:** actions, actions-base, ai, ai-agents, ai-anthropic, ai-betty-bot, ai-cerebras, ai-core-plus, ai-engine-base, ai-groq, ai-mistral, ai-openai, ai-prompts, ai-provider-bundle, ai-reranker, ai-vector-dupe, ai-vectors-memory, aiengine, core-actions, core-entities, core-entities-server, credentials, data-context, data-context-server, doc-utils, encryption, global, graphql-dataprovider, interactive-component-types, queue, skip-types, storage, templates, templates-base-types, testing-engine, testing-engine-base

</details>

### MCPServer & A2AServer (75 packages each - identical closure)

<details>
<summary>Click to expand full list</summary>

Both converge to the same 75-package transitive closure because both depend on `@memberjunction/server`, which is the dominant aggregator. The full list is identical to MJAPI minus server-bootstrap and the private generated packages.

</details>

---

## Summary of Recommended Removals

### Immediate (Phase 1) - 6 packages to delete

```
packages/Communication/providers/gmail/        # @memberjunction/communication-gmail
packages/Communication/providers/twilio/       # @memberjunction/communication-twilio
packages/Angular/Generic/tree-list/            # @memberjunction/ng-treelist
packages/React/test-harness/                   # @memberjunction/react-test-harness
packages/AngularElements/                      # mj_angular_elements_demo (entire dir)
test-vectorization/                            # test-vectorization (root level)
```

### Verify First (Phase 2) - 2 packages

```
packages/ComponentRegistry/                    # @memberjunction/component-registry-server
packages/Angular/Generic/credentials/          # @memberjunction/ng-credentials
```

### Architectural Recommendation: Make BizApps Optional

The 5 `actions-bizapps-*` packages (Accounting, CRM, FormBuilders, LMS, Social) with 100+ action classes are pulled into every server deployment via `@memberjunction/server`. Consider:
1. Removing them from MJServer's direct dependencies
2. Making them opt-in via a configuration/plugin system
3. This would reduce server bundle size and startup time for deployments that don't need these integrations

### NPM Deprecation Commands

```bash
# Run these before deleting package directories
npm deprecate @memberjunction/communication-gmail@"*" "Deprecated: unused provider, removed from MemberJunction"
npm deprecate @memberjunction/communication-twilio@"*" "Deprecated: unused provider, removed from MemberJunction"
npm deprecate @memberjunction/ng-treelist@"*" "Deprecated: replaced by @memberjunction/ng-trees"
npm deprecate @memberjunction/react-test-harness@"*" "Deprecated: removed from MemberJunction"
```
