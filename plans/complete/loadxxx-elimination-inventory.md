# LoadXXX() Function Elimination Inventory

## Background

PR #1872 introduced a build-time **class registrations manifest generator** (`mj codegen manifest`) that automatically discovers all `@RegisterClass`-decorated classes across the dependency tree and generates a manifest file with named imports + a `CLASS_REGISTRATIONS[]` array. This creates static code paths that bundlers cannot tree-shake, eliminating the need for manual `LoadXXX()` stub functions.

**How the new system works:**
- `mj codegen manifest` walks a package's transitive dependency tree
- Discovers every `@RegisterClass`-decorated class
- Verifies each class is exported from its package's public API (via `.d.ts` entry points)
- Generates a manifest file with named imports and an exported array referencing all classes
- Runs as a `prebuild`/`prestart` script for MJAPI and MJExplorer

**Current manifests:**
- **MJAPI**: 674 classes from 54 packages (`packages/MJAPI/src/generated/class-registrations-manifest.ts`)
- **MJExplorer**: 433 classes from 16 packages (`packages/MJExplorer/src/app/generated/class-registrations-manifest.ts`)

## Scope

**714 total `export function Load*` definitions** found across the codebase. Every one of these is a candidate for removal now that the manifest system handles tree-shaking prevention automatically.

---

## Inventory by Package Area

### 1. AI Framework (50 functions)

| File | Function | Type |
|------|----------|------|
| `packages/AI/AgentManager/actions/src/index.ts` | `LoadAgentManagementActions()` | Aggregator |
| `packages/AI/AgentManager/core/src/index.ts` | `LoadAgentManagerCore()` | Aggregator |
| `packages/AI/Agents/src/AgentDataPreloader.ts` | `LoadAgentDataPreloader()` | Custom |
| `packages/AI/Agents/src/agent-types/flow-agent-type.ts` | `LoadFlowAgentType()` | Custom |
| `packages/AI/Agents/src/agent-types/loop-agent-type.ts` | `LoadLoopAgentType()` | Custom |
| `packages/AI/Agents/src/utils/ConversationMessageResolver.ts` | `LoadConversationMessageResolver()` | Custom |
| `packages/AI/BaseAIEngine/src/AICredentialBindingEntityExtended.ts` | `LoadAICredentialBindingEntityExtended()` | Custom |
| `packages/AI/BaseAIEngine/src/PriceUnitTypes.ts` | `LoadPriceUnitTypes()` | Custom |
| `packages/AI/BaseAIEngine/src/index.ts` | `LoadBaseAIEngine()` | Aggregator |
| `packages/AI/CorePlus/src/AIAgentExtended.ts` | `LoadAIAgentEntityExtended()` | Custom |
| `packages/AI/CorePlus/src/AIAgentRunExtended.ts` | `LoadAIAgentRunEntityExtended()` | Custom |
| `packages/AI/CorePlus/src/AIAgentRunStepExtended.ts` | `LoadAIAgentEntityRunStepExtended()` | Custom |
| `packages/AI/CorePlus/src/AIModelExtended.ts` | `LoadAIModelExtended()` | Custom |
| `packages/AI/CorePlus/src/AIPromptCategoryExtended.ts` | `LoadAIPromptCategoryEntityExtended()` | Custom |
| `packages/AI/CorePlus/src/AIPromptExtended.ts` | `LoadAIPromptEntityExtended()` | Custom |
| `packages/AI/CorePlus/src/index.ts` | `LoadAICorePlus()` | Aggregator |
| `packages/AI/Engine/src/AIEngine.ts` | `LoadAIEngine()` | Custom |
| `packages/AI/MCPClient/src/AgentToolAdapter.ts` | `LoadAgentToolAdapter()` | Custom |
| `packages/AI/MCPClient/src/index.ts` | `LoadMCPClient()` | Aggregator |
| `packages/AI/Prompts/src/AIPromptRunner.ts` | `LoadAIPromptRunner()` | Custom |
| `packages/AI/Reranker/src/LLMReranker.ts` | `LoadLLMReranker()` | Custom |
| **AI Providers (29 functions):** | | |
| `packages/AI/Providers/Anthropic/src/models/anthropic.ts` | `LoadAnthropicLLM()` | Custom |
| `packages/AI/Providers/Azure/src/models/azure.ts` | `LoadAzureLLM()` | Custom |
| `packages/AI/Providers/Azure/src/models/azureEmbedding.ts` | `LoadAzureEmbedding()` | Custom |
| `packages/AI/Providers/Bedrock/src/models/bedrockEmbedding.ts` | `LoadBedrockEmbedding()` | Custom |
| `packages/AI/Providers/Bedrock/src/models/bedrockLLM.ts` | `LoadBedrockLLM()` | Custom |
| `packages/AI/Providers/BettyBot/src/models/BettyBotLLM.ts` | `LoadBettyBotLLM()` | Custom |
| `packages/AI/Providers/BlackForestLabs/src/index.ts` | `LoadFLUXImageGenerator()` | Custom |
| `packages/AI/Providers/Bundle/src/index.ts` | `LoadAIProviders()` | **Key Aggregator** |
| `packages/AI/Providers/Cerebras/src/models/cerebras.ts` | `LoadCerebrasLLM()` | Custom |
| `packages/AI/Providers/Cohere/src/models/CohereReranker.ts` | `LoadCohereReranker()` | Custom |
| `packages/AI/Providers/ElevenLabs/src/index.ts` | `LoadElevenLabsAudioGenerator()` | Custom |
| `packages/AI/Providers/Gemini/src/geminiImage.ts` | `LoadGeminiImageGenerator()` | Custom |
| `packages/AI/Providers/Gemini/src/index.ts` | `LoadGeminiLLM()` | Custom |
| `packages/AI/Providers/Groq/src/models/groq.ts` | `LoadGroqLLM()` | Custom |
| `packages/AI/Providers/HeyGen/src/index.ts` | `LoadHeyGenVideoGenerator()` | Custom |
| `packages/AI/Providers/LMStudio/src/models/lm-studio.ts` | `LoadLMStudioLLM()` | Custom |
| `packages/AI/Providers/LocalEmbeddings/src/models/localEmbedding.ts` | `LoadLocalEmbedding()` | Custom |
| `packages/AI/Providers/Mistral/src/models/mistral.ts` | `LoadMistralLLM()` | Custom |
| `packages/AI/Providers/Mistral/src/models/mistralEmbedding.ts` | `LoadMistralEmbedding()` | Custom |
| `packages/AI/Providers/Ollama/src/models/ollama-embeddings.ts` | `LoadOllamaEmbedding()` | Custom |
| `packages/AI/Providers/Ollama/src/models/ollama-llm.ts` | `LoadOllamaLLM()` | Custom |
| `packages/AI/Providers/OpenAI/src/models/openAI.ts` | `LoadOpenAILLM()` | Custom |
| `packages/AI/Providers/OpenAI/src/models/openAIEmbedding.ts` | `LoadOpenAIEmbedding()` | Custom |
| `packages/AI/Providers/OpenAI/src/models/openAIImage.ts` | `LoadOpenAIImageGenerator()` | Custom |
| `packages/AI/Providers/OpenRouter/src/models/openRouter.ts` | `LoadOpenRouterLLM()` | Custom |
| `packages/AI/Providers/Recommendations-Rex/src/provider.ts` | `LoadRexRecommendationsProvider()` | Custom |
| `packages/AI/Providers/Vectors-Pinecone/src/models/PineconeDatabase.ts` | `LoadPineconeVectorDB()` | Custom |
| `packages/AI/Providers/Vertex/src/models/vertexLLM.ts` | `LoadVertexLLM()` | Custom |
| `packages/AI/Providers/xAI/src/models/x.ai.ts` | `LoadxAILLM()` | Custom |

### 2. Actions (137 functions)

#### CoreActions (~103 functions)
| File | Function | Type |
|------|----------|------|
| `packages/Actions/CoreActions/src/index.ts` | `LoadAllCoreActions()` | **Key Aggregator** |
| `packages/Actions/CoreActions/src/generated/action_subclasses.ts` | `LoadGeneratedActions()` | Generated |
| `packages/Actions/CoreActions/src/custom/ai/betty.action.ts` | `LoadBettyAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/execute-ai-prompt.action.ts` | `LoadExecuteAIPromptAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/find-best-action.action.ts` | `LoadFindBestActionAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/find-best-agent.action.ts` | `LoadFindBestAgentAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/find-candidate-actions.action.ts` | `LoadFindBestActionAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/find-candidate-agents.action.ts` | `LoadFindBestAgentAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` | `LoadGenerateImageAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/load-agent-spec.action.ts` | `LoadLoadAgentSpecAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/ai/summarize-content.action.ts` | `LoadSummarizeContentAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/code-execution/execute-code.action.ts` | `LoadCodeExecutionAction()` | Custom |
| `packages/Actions/CoreActions/src/custom/communication/*.ts` | 3 functions | Custom |
| `packages/Actions/CoreActions/src/custom/crud/*.ts` | 5 functions | Custom |
| `packages/Actions/CoreActions/src/custom/data/*.ts` | 9 functions | Custom |
| `packages/Actions/CoreActions/src/custom/demo/*.ts` | 6 functions | Custom |
| `packages/Actions/CoreActions/src/custom/files/*.ts` | 18 functions | Custom |
| `packages/Actions/CoreActions/src/custom/integration/*.ts` | 5 functions | Custom |
| `packages/Actions/CoreActions/src/custom/lists/*.ts` | 7 functions + aggregator | Custom |
| `packages/Actions/CoreActions/src/custom/mcp/*.ts` | 6 functions + aggregator | Custom |
| `packages/Actions/CoreActions/src/custom/security/*.ts` | 1 function | Custom |
| `packages/Actions/CoreActions/src/custom/user-management/*.ts` | 5 functions | Custom |
| `packages/Actions/CoreActions/src/custom/utilities/*.ts` | 6 functions | Custom |
| `packages/Actions/CoreActions/src/custom/visualization/*.ts` | 7 functions | Custom |
| `packages/Actions/CoreActions/src/custom/web/*.ts` | 6 functions | Custom |
| `packages/Actions/CoreActions/src/custom/workflow/*.ts` | 5 functions | Custom |

#### BizApps Actions (~34 functions)
| File | Function | Type |
|------|----------|------|
| `packages/Actions/BizApps/FormBuilders/src/providers/google-forms/actions/index.ts` | `LoadAllGoogleFormsActions()` | Aggregator |
| `packages/Actions/BizApps/FormBuilders/src/providers/google-forms/actions/*.ts` | 4 leaf functions | Custom |
| `packages/Actions/BizApps/FormBuilders/src/providers/jotform/actions/index.ts` | `LoadAllJotFormActions()` | Aggregator |
| `packages/Actions/BizApps/FormBuilders/src/providers/jotform/actions/*.ts` | 8 leaf functions | Custom |
| `packages/Actions/BizApps/FormBuilders/src/providers/surveymonkey/actions/index.ts` | `LoadAllSurveyMonkeyActions()` | Aggregator |
| `packages/Actions/BizApps/FormBuilders/src/providers/surveymonkey/actions/*.ts` | 8 leaf functions | Custom |
| `packages/Actions/BizApps/FormBuilders/src/providers/typeform/actions/index.ts` | `LoadAllTypeformActions()` | Aggregator |
| `packages/Actions/BizApps/FormBuilders/src/providers/typeform/actions/*.ts` | 10 leaf functions | Custom |

#### Other Actions
| File | Function | Type |
|------|----------|------|
| `packages/Actions/ApolloEnrichment/src/accounts.ts` | `LoadApolloAccountsEnrichmentAction()` | Custom |
| `packages/Actions/ApolloEnrichment/src/contacts.ts` | `LoadApolloContactsEnrichmentAction()` | Custom |
| `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts` | `LoadAutotagAndVectorizeContentAction()` | Custom |

### 3. Angular Explorer - Generated Entity Forms (~372 functions)

#### Core Entity Forms - Generated (~280 forms)
Located in `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/*/`

Each entity form component has a `LoadXxxFormComponent()` function. These are **CodeGen-generated** and include forms for every MJ core entity (AIAgent, AIModel, Action, Application, Dashboard, Entity, User, etc.)

**Aggregator:** `packages/Angular/Explorer/core-entity-forms/src/lib/generated/generated-forms.module.ts` -> `LoadCoreGeneratedForms()`

#### Core Entity Forms - Custom (~22 forms)
| File | Function | Type |
|------|----------|------|
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/custom-forms.module.ts` | `LoadCoreCustomForms()` | **Aggregator** |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/ai-agent-form.component.ts` | `LoadAIAgentFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIPrompts/ai-prompt-form.component.ts` | `LoadAIPromptFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-form.component.ts` | `LoadActionFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Actions/action-execution-log-form.component.ts` | `LoadActionExecutionLogFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Entities/entity-form.component.ts` | `LoadEntityFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/EntityActions/entityaction.form.component.ts` | `LoadEntityActionExtendedFormComponent()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.ts` | `LoadListFormComponentExtended()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Queries/query-form.component.ts` | `LoadQueryFormExtendedComponent()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Templates/templates-form.component.ts` | `LoadTemplatesFormExtendedComponent()` | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/*.ts` | 7 test-related form functions | Custom |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run.component.ts` | `LoadAIAgentRunFormComponent()` | Custom |

### 4. MJExplorer - Generated Entity Forms (~79 functions)

Located in `packages/MJExplorer/src/app/generated/Entities/*/`

These are client-specific entity forms (AccreditingBody, AdvocacyAction, BoardMember, Campaign, Certificate, Chapter, Committee, Competition, Event, Invoice, Member, Organization, Product, etc.)

**Aggregator:** `packages/MJExplorer/src/app/generated/generated-forms.module.ts` -> `LoadGeneratedForms()`

### 5. Angular Explorer - Dashboards & Resources (~70+ functions)

Located in `packages/Angular/Explorer/dashboards/src/`

Includes dashboard components for:
- Entity Admin, Component Studio, Scheduling, Testing, Communication
- Credentials, API Keys, MCP, Data Explorer
- AI dashboards (Actions, Agents, Prompts, Models)
- System diagnostics, Query browser

**Call site:** `packages/Angular/Explorer/dashboards/src/public-api.ts` calls all Load functions at module level.

### 6. Angular Generic Components (~28 functions)

| File | Function | Type |
|------|----------|------|
| `packages/Angular/Generic/credentials/src/lib/credentials.module.ts` | `LoadCredentialsModule()` | Aggregator |
| `packages/Angular/Generic/credentials/src/lib/dialogs/credential-dialog.component.ts` | `LoadCredentialDialog()` | Custom |
| `packages/Angular/Generic/credentials/src/lib/panels/*.ts` | 3 panel load functions | Custom |
| `packages/Angular/Explorer/base-forms/src/lib/explorer-entity-data-grid.component.ts` | `LoadExplorerEntityDataGridComponent()` | Custom |
| `packages/Angular/Explorer/auth-services/src/lib/providers/*.ts` | 3 auth provider functions | Custom |
| `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/resource-wrappers-loader.ts` | `LoadResourceWrappers()` | **Key Aggregator** |
| Plus ~15 resource wrapper load functions | | Custom |

### 7. Server-Side Entity Extensions (~18 functions)

| File | Function | Type |
|------|----------|------|
| `packages/MJCoreEntitiesServer/src/index.ts` | `LoadCoreEntitiesServerSubClasses()` | **Key Aggregator** |
| `packages/MJCoreEntitiesServer/src/custom/AIAgentExampleEntity.server.ts` | `LoadAIAgentExampleEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/AIAgentNoteEntity.server.ts` | `LoadAIAgentNoteEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/AIPromptEntityExtended.server.ts` | `LoadAIPromptEntityExtendedServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/AIPromptRunEntity.server.ts` | `LoadAIPromptRunEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/ActionEntity.server.ts` | `LoadActionEntityServer()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/ApplicationEntity.server.ts` | `LoadApplicationEntityServer()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/ArtifactVersionExtended.server.ts` | `LoadArtifactVersionExtendedServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/ComponentEntity.server.ts` | `LoadComponentEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/ConversationDetailEntity.server.ts` | `LoadConversationDetailEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/DuplicateRunEntity.server.ts` | `LoadDuplicateRunEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/QueryEntity.server.ts` | `LoadQueryEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/TemplateContentEntity.server.ts` | `LoadTemplateContentEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/reportEntity.server.ts` | `LoadReportEntityServerSubClass()` | Custom |
| `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts` | `LoadUserViewEntityServerSubClass()` | Custom |
| `packages/MJServer/src/auth/exampleNewUserSubClass.ts` | `LoadExampleNewUserSubClass()` | Custom |
| `packages/MJServer/src/entitySubclasses/entityPermissions.server.ts` | `LoadEntityPermissionsServerSubClass()` | Custom |
| `packages/MJServer/src/resolvers/MCPResolver.ts` | `LoadMCPResolver()` | Custom |

### 8. Scheduling System (~15 functions)

| File | Function | Type |
|------|----------|------|
| `packages/Scheduling/base-engine/src/index.ts` | `LoadBaseSchedulingEngine()` | Aggregator |
| `packages/Scheduling/base-engine/src/ScheduledJobEntityExtended.ts` | `LoadScheduledJobEntityExtended()` | Custom |
| `packages/Scheduling/engine/src/index.ts` | `LoadSchedulingEngine()` | Aggregator |
| `packages/Scheduling/engine/src/drivers/index.ts` | `LoadScheduledJobDrivers()` | Aggregator |
| `packages/Scheduling/engine/src/drivers/ActionScheduledJobDriver.ts` | `LoadActionScheduledJobDriver()` | Custom |
| `packages/Scheduling/engine/src/drivers/AgentScheduledJobDriver.ts` | `LoadAgentScheduledJobDriver()` | Custom |
| `packages/Scheduling/actions/src/index.ts` | `LoadAllSchedulingActions()` | Aggregator |
| `packages/Scheduling/actions/src/BaseJobAction.ts` | `LoadBaseJobAction()` | Custom |
| `packages/Scheduling/actions/src/CreateJobAction.ts` | `LoadCreateScheduledJobAction()` | Custom |
| `packages/Scheduling/actions/src/DeleteJobAction.ts` | `LoadDeleteScheduledJobAction()` | Custom |
| `packages/Scheduling/actions/src/ExecuteJobNowAction.ts` | `LoadExecuteScheduledJobNowAction()` | Custom |
| `packages/Scheduling/actions/src/GetJobStatisticsAction.ts` | `LoadGetScheduledJobStatisticsAction()` | Custom |
| `packages/Scheduling/actions/src/QueryJobsAction.ts` | `LoadQueryScheduledJobsAction()` | Custom |
| `packages/Scheduling/actions/src/UpdateJobAction.ts` | `LoadUpdateScheduledJobAction()` | Custom |

### 9. Communication & Templates (~8 functions)

| File | Function | Type |
|------|----------|------|
| `packages/Communication/entity-comm-client/src/client.ts` | `LoadEntityCommunicationsEngineClient()` | Custom |
| `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts` | `LoadMSGraphProvider()` | Custom |
| `packages/Communication/providers/gmail/src/GmailProvider.ts` | `LoadProvider()` | Custom |
| `packages/Communication/providers/sendgrid/src/SendGridProvider.ts` | `LoadProvider()` | Custom |
| `packages/Communication/providers/twilio/src/TwilioProvider.ts` | `LoadProvider()` | Custom |
| `packages/Templates/engine/src/extensions/AIPrompt.extension.ts` | `LoadAIPromptExtension()` | Custom |
| `packages/Templates/engine/src/extensions/TemplateEmbed.extension.ts` | `LoadTemplateEmbedExtension()` | Custom |

### 10. Infrastructure & Other (~12 functions)

| File | Function | Type |
|------|----------|------|
| `packages/APIKeys/Base/src/index.ts` | `LoadAPIKeysEngineBase()` | Custom |
| `packages/APIKeys/Engine/src/index.ts` | `LoadAPIKeyEngine()` | Aggregator |
| `packages/GeneratedEntities/src/index.ts` | `LoadGeneratedEntities()` | Generated |
| `packages/GeneratedActions/src/generated/action_subclasses.ts` | `LoadGeneratedActions()` | Generated |
| `packages/CodeGenLib/src/Misc/action_subclasses_codegen.ts` | `LoadGeneratedActions()` | Generated template |
| `packages/MJCoreEntities/src/engines/EncryptionEngineBase.ts` | `LoadEncryptionEngineBase()` | Custom |
| `packages/MJDataContextServer/src/index.ts` | `LoadDataContextItemsServer()` | Custom |

---

## Key Aggregator Functions (Call Chains)

These are the "top-level" Load functions that cascade into many others. Removing these and their children is the priority:

### Server Side (MJAPI)
```
LoadAIProviders()  (called in 11+ files)
  -> LoadAnthropicLLM(), LoadOpenAILLM(), LoadGroqLLM(), ... (29 providers)

LoadCoreEntitiesServerSubClasses()  (called in CodeGenLib, MJServer)
  -> 14 server entity extension loaders

LoadAllCoreActions()
  -> 103+ individual action loaders

LoadAllSchedulingActions()
  -> 8 scheduling action loaders

LoadSchedulingEngine()
  -> LoadScheduledJobDrivers() -> individual driver loaders
  -> LoadBaseSchedulingEngine() -> LoadScheduledJobEntityExtended()
```

### Client Side (MJExplorer)
```
LoadGeneratedForms()  (MJExplorer app.module.ts)
  -> 57 custom entity form loaders

LoadCoreGeneratedForms()  (app.module.ts)
  -> 280+ core entity form loaders (via sub-modules)

LoadCoreCustomForms()  (app.module.ts)
  -> 22 custom form extension loaders

LoadResourceWrappers()  (app.module.ts)
  -> 18 resource wrapper loaders

LoadGeneratedEntities()  (app.component.ts)
  -> Empty stub, triggers side-effect import
```

---

## Summary Statistics

| Category | Count | Generated | Custom |
|----------|-------|-----------|--------|
| AI Framework | 50 | 0 | 50 |
| Actions (Core + BizApps + Other) | 137 | 2 | 135 |
| Angular Core Entity Forms (generated) | ~280 | 280 | 0 |
| Angular Core Entity Forms (custom) | 22 | 0 | 22 |
| MJExplorer Entity Forms | 79 | 79 | 0 |
| Angular Dashboards & Resources | 70+ | 0 | 70+ |
| Angular Generic Components | 28 | 0 | 28 |
| Server Entity Extensions | 18 | 0 | 18 |
| Scheduling | 15 | 0 | 15 |
| Communication & Templates | 8 | 0 | 8 |
| Infrastructure & Other | 12 | 3 | 9 |
| **TOTAL** | **~714** | **~364** | **~350** |

---

## Refactoring Strategy

### Phase 1: Generated Code (CodeGen changes)
- **Target**: ~364 generated LoadXXX functions
- **Approach**: Modify CodeGen templates to stop emitting `LoadXxxFormComponent()` functions from generated form components and entity subclass files
- **Files to update**: CodeGen templates for entity forms, action subclasses, generated-forms.module.ts
- **Risk**: Low - these are purely generated and the manifest already covers them

### Phase 2: Server-Side Custom Code
- **Target**: ~100 functions (AI providers, server entities, actions, scheduling, communication)
- **Approach**: Remove LoadXXX function definitions and their call sites. The manifest handles all `@RegisterClass` classes automatically.
- **Key aggregators to remove first**: `LoadAIProviders()`, `LoadCoreEntitiesServerSubClasses()`, `LoadAllCoreActions()`, `LoadAllSchedulingActions()`
- **Call sites in index.ts files**: These need to be cleaned up to remove the cascading calls
- **Risk**: Medium - need to verify each class is picked up by the manifest

### Phase 3: Client-Side Custom Code
- **Target**: ~250 functions (dashboards, resources, custom forms, auth providers, credentials)
- **Approach**: Remove LoadXXX function definitions and call sites from public-api.ts files, module files, and component files
- **Key aggregators to remove**: `LoadResourceWrappers()`, `LoadCoreCustomForms()`, all dashboard Load functions
- **Note**: Angular's NgModule declarations already prevent tree-shaking for components declared in modules. The manifest provides additional safety.
- **Risk**: Medium - Angular components need extra care to verify they're included

### Phase 4: Cleanup
- Remove aggregator index.ts exports
- Remove LoadXXX imports from consuming files
- Clean up any remaining dead code
- Update documentation

### Verification Approach
Before removing any LoadXXX function:
1. Confirm the class it protects has `@RegisterClass` decorator
2. Confirm the class appears in the generated manifest for the relevant app (MJAPI or MJExplorer)
3. For Angular components: confirm they're declared in an NgModule
4. Build both MJAPI and MJExplorer after changes
5. Spot-check runtime behavior for critical paths (AI providers, entity forms, actions)
