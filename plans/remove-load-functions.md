# Remove LoadXXX() Anti-Tree-Shake Functions

## Background

### The Problem LoadXXX() Was Solving

MemberJunction uses a runtime class registration system built on the `@RegisterClass` decorator and a global `ClassFactory`. When a class is decorated with `@RegisterClass(BaseClass, 'key')`, the decorator executes at module load time and registers the class in `MJGlobal.Instance.ClassFactory`. Later, the system dynamically instantiates these classes by looking them up by base class and key -- for example, the action engine finds action implementations, the form system finds form components, and the AI engine finds model providers.

The problem: bundlers (Webpack for Angular, esbuild for Node) perform tree-shaking -- static analysis to remove "unused" code. Since these registered classes are never directly referenced in application code (they're instantiated dynamically via the factory), bundlers see them as dead code and strip them out. When that happens, the `@RegisterClass` decorators never execute, the classes never register, and the runtime factory finds nothing.

### The Old Solution: LoadXXX() Stub Functions

The workaround was to create empty stub functions alongside every `@RegisterClass`-decorated class:

```typescript
@RegisterClass(BaseAction, 'Create Record')
export class CreateRecordAction extends BaseAction { /* ... */ }

export function LoadCreateRecordAction() {
    // empty -- exists solely to create an import reference
}
```

Then aggregator functions collected these stubs:

```typescript
export function LoadAllCoreActions() {
    LoadCreateRecordAction();
    LoadGetRecordAction();
    // ... 90+ more calls
}
```

And application entry points called the aggregators:

```typescript
// MJServer/src/index.ts
LoadAllCoreActions();
LoadAIProviders();
LoadSchedulingEngine();
// ... 13 total import+call pairs
```

This created a static import chain that bundlers could trace, preventing tree-shaking. But it meant maintaining **~679 empty function definitions** and **~150+ invocation sites** by hand, and every new `@RegisterClass` class needed a corresponding Load function added to the right aggregator.

### The New Solution: CodeGen Manifest

The manifest system (`mj codegen manifest`) was built to replace this entire pattern. It:

1. Walks the app's full transitive dependency tree from `package.json`
2. Scans every dependency's TypeScript source for `@RegisterClass` decorators
3. Verifies each discovered class is exported from its package's public API (via `.d.ts` analysis)
4. Generates a single TypeScript file with named imports for every class and an exported array referencing them all

The generated manifest looks like:

```typescript
// AUTO-GENERATED FILE - DO NOT EDIT
import { CreateRecordAction, GetRecordAction } from '@memberjunction/core-actions';
import { OpenAILLM } from '@memberjunction/ai-openai';
// ... hundreds more imports

export const CLASS_REGISTRATIONS: any[] = [
    CreateRecordAction, GetRecordAction, OpenAILLM, /* ... */
];
export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;
export const CLASS_REGISTRATIONS_COUNT = 715;
```

This single file replaces all 679 Load function definitions and all 150+ invocation sites.

### What's Already Done (Phase 1 Complete)

The manifest infrastructure is fully built and operational:

- **Generator code**: `packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts` (816 lines)
- **CLI command**: `mj codegen manifest` via `packages/MJCLI/src/commands/codegen/manifest.ts`
- **Auto-generation hooks** in both apps:
  - `packages/MJAPI/package.json`: `"prebuild": "mj codegen manifest --output ./src/generated/class-registrations-manifest.ts"`
  - `packages/MJExplorer/package.json`: `"prebuild": "mj codegen manifest --output ./src/app/generated/class-registrations-manifest.ts"`
- **Import statements already present** in both apps:
  - `packages/MJAPI/src/index.ts:14`: `import './generated/class-registrations-manifest.js';`
  - `packages/MJExplorer/src/app/app.module.ts:28`: `import './generated/class-registrations-manifest';`
- **Root-level convenience scripts**: `npm run mj:manifest`, `npm run mj:manifest:api`, `npm run mj:manifest:explorer`
- **Verified working** in real builds -- manifests generate correctly and apps function with them

The manifests currently run **alongside** the old LoadXXX() functions (belt and suspenders). This plan removes the old functions.

---

## Architecture Context

### Two Separate Dependency Trees

The two apps that need manifests have completely different dependency trees:

**MJAPI (Server-Side)**:
- Entry: `packages/MJAPI/src/index.ts` -- thin 29-line file calling `createMJServer()`
- Bootstrap: `packages/ServerBootstrap/src/index.ts` -- config discovery, calls `serve()`
- Core: `packages/MJServer/src/index.ts` -- the actual server library with all Load calls (lines 32-69)
- Manifest: `packages/MJAPI/src/generated/class-registrations-manifest.ts`
- Covers: Actions, AI providers, entity extensions, scheduling, communication providers

**MJExplorer (Client-Side Angular)**:
- Entry: `packages/MJExplorer/src/app/app.module.ts` -- Angular module with Load calls (lines 23-46)
- Manifest: `packages/MJExplorer/src/app/generated/class-registrations-manifest.ts`
- Covers: Angular form components, dashboard components, resource wrappers, custom forms

### Three Categories of LoadXXX() Code

| Category | Count | Where Changed |
|----------|-------|---------------|
| **CodeGen-generated** | ~212 functions | Modify templates in `CodeGenLib`, then re-run CodeGen |
| **Manual definitions** | ~379 functions | Edit each source file to remove the function |
| **Invocations** | ~150+ call sites | Edit aggregator files, public-api.ts, modules |

---

## Inventory of All LoadXXX() Code to Remove

### CodeGen Templates (2 files to modify)

#### 1. Angular Form Component Template
**File**: `packages/CodeGenLib/src/Angular/angular-codegen.ts`

What to change:
- **Line 136**: Remove `Load${componentName}` from the import statement template. Change from:
  ```typescript
  import { ${componentName}, Load${componentName} } from "./Entities/...";
  ```
  To:
  ```typescript
  import { ${componentName} } from "./Entities/...";
  ```
- **Lines 243-250**: Remove the entire `Load${modulePrefix}GeneratedForms()` function template
- **Lines 466-468**: Remove the `Load${entity.ClassName}FormComponent()` function template from each generated component file

#### 2. Action Subclasses Template
**File**: `packages/CodeGenLib/src/Misc/action_subclasses_codegen.ts`

What to change:
- **Lines 83-86**: Remove the `LoadGeneratedActions()` function template

### Server-Side Invocations (1 file)

#### MJServer/src/index.ts (lines 32-69)
Remove these 13 import+call pairs and the one hack:

| Lines | Import | Call |
|-------|--------|------|
| 32-33 | `LoadAllCoreActions` from `@memberjunction/core-actions` | `LoadAllCoreActions()` |
| 34-36 | `LoadApolloAccountsEnrichmentAction`, `LoadApolloContactsEnrichmentAction` from `@memberjunction/actions-apollo` | Both called |
| 38-39 | `LoadCoreEntitiesServerSubClasses` from `@memberjunction/core-entities-server` | Called |
| 41-42 | `LoadAgentManagementActions` from `@memberjunction/ai-agent-manager-actions` | Called |
| 45-46 | `LoadAgentManagerCore` from `@memberjunction/ai-agent-manager` | Called |
| 48-49 | `LoadSchedulingEngine` from `@memberjunction/scheduling-engine` | Called |
| 51-52 | `LoadAllSchedulingActions` from `@memberjunction/scheduling-actions` | Called |
| 54-55 | `GetTypeformResponsesAction` hack -- `const x = GetTypeformResponsesAction` | Remove entirely |
| 59-63 | `LoadAIEngine` from `@memberjunction/aiengine`, `LoadAIProviders` from `@memberjunction/ai-provider-bundle` | Both called |
| 66-69 | `LoadMSGraphProvider` from `@memberjunction/communication-ms-graph`, `LoadProvider as LoadSendGridProvider` from `@memberjunction/communication-sendgrid` | Both called |

Also clean up the now-unused `resolve` import on line 57 if it becomes unused after the removal of line 54.

### Client-Side Invocations (7+ files)

#### 1. MJExplorer/src/app/app.module.ts (lines 13-46)
- **Lines 15-17**: Remove `LoadCoreGeneratedForms`, `LoadCoreCustomForms`, `LoadResourceWrappers` from the import
- **Lines 23-25**: Remove the three `Load*()` calls
- **Line 40**: Remove `LoadGeneratedForms` from the import of `generated-forms.module`
- **Line 46**: Remove `LoadGeneratedForms()` call

#### 2. Angular/Explorer/dashboards/src/public-api.ts (lines 200-298)
- **Lines 200-209**: Remove all `LoadXXX` re-exports (keep component re-exports)
- **Lines 214-298**: Remove the entire block of ~60 Load function calls
- Also remove all Load function imports throughout the file (scattered across lines 1-199 as part of import statements)

#### 3. Angular/Explorer/core-entity-forms/src/lib/custom/custom-forms.module.ts (lines 192-210)
- Remove the entire `LoadCoreCustomForms()` function definition
- Remove all Load function imports at the top of the file

#### 4. Angular/Explorer/explorer-core/src/lib/resource-wrappers/resource-wrappers-loader.ts (entire file)
- **Delete this file entirely** -- it exists only to aggregate Load calls
- Remove the export of `LoadResourceWrappers` from the package's public-api.ts/index.ts

#### 5. Angular/Explorer/explorer-settings/src/public-api.ts
- Remove calls to: `LoadRoleManagementDashboard()`, `LoadUserManagementDashboard()`, `LoadEntityPermissionsDashboard()`, `LoadApplicationManagementDashboard()`, `LoadSqlLoggingDashboard()`, `LoadSettingsComponent()`, `LoadExplorerSettings()`

#### 6. Angular/Generic/dashboard-viewer/src/public-api.ts
- Remove calls to: `LoadDashboardViewerModule()`, `LoadWebURLConfigPanel()`, `LoadViewConfigPanel()`, `LoadQueryConfigPanel()`, `LoadArtifactConfigPanel()`, `LoadAllDashboardParts()`, `LoadDashboardBrowser()`, `LoadDashboardBreadcrumb()`

#### 7. Other public-api.ts and module files
- `Angular/Generic/query-viewer/src/public-api.ts`: Remove `LoadQueryViewerModule()`
- `Angular/Generic/trees/src/public-api.ts`: Remove `LoadNgTreesModule()`
- `Angular/Generic/file-storage/src/public-api.ts`: Remove `LoadFileBrowserResource()`
- `Angular/Generic/versions/src/public-api.ts`: Remove `LoadMjLabelCreateComponent()`
- `Angular/Explorer/auth-services/src/lib/auth-services.module.ts`: Remove `LoadMJMSALProvider()`, `LoadMJAuth0Provider()`, `LoadMJOktaProvider()`
- `Angular/Explorer/dashboards/src/MCP/mcp.module.ts`: Remove `LoadMCPModule()` function and its 8 internal Load calls
- `Angular/Generic/credentials/src/lib/credentials.module.ts`: Remove `LoadCredentialsModule()` and its 4 internal Load calls
- `Angular/Explorer/explorer-core/src/lib/oauth/oauth.module.ts`: Remove `LoadOAuthCallbackComponent()`

### Manual Load Function Definitions (~379 files)

These are grouped by package. Each file has an `export function LoadXXX() {}` definition that must be removed, plus the export of that function from the package's index.ts/public-api.ts.

#### Actions Package (~140 definitions)

**CoreActions custom actions** (~95 files in `packages/Actions/CoreActions/src/custom/`):

| Subdirectory | Files | Example Functions |
|-------------|-------|-------------------|
| `ai/` | 9 | `LoadExecuteAIPromptAction`, `LoadFindBestActionAction`, `LoadBettyAction`, `LoadSummarizeContentAction`, `LoadFindBestAgentAction`, `LoadLoadAgentSpecAction`, `LoadGenerateImageAction`, `LoadCheckUserPermissionAction` |
| `code-execution/` | 1 | `LoadCodeExecutionAction` |
| `communication/` | 2 | `LoadSendSingleMessageAction`, `LoadSlackWebhookAction` |
| `crud/` | 5 | `LoadCreateRecordAction`, `LoadGetRecordAction`, `LoadGetRecordsAction`, `LoadUpdateRecordAction`, `LoadDeleteRecordAction` |
| `data/` | 9 | `LoadCSVParserAction`, `LoadJSONTransformAction`, `LoadXMLParserAction`, `LoadAggregateDataAction`, `LoadDataMapperAction`, `LoadExploreDatabaseSchemaAction`, `LoadGetEntityListAction`, `LoadGetEntityDetailsAction`, `LoadExecuteResearchQueryAction` |
| `demo/` | 6 | `LoadGetWeatherAction`, `LoadGetStockPriceAction`, `LoadCalculateExpressionAction`, `LoadColorConverterAction`, `LoadTextAnalyzerAction`, `LoadUnitConverterAction` |
| `files/` | 20 | `LoadPDFGeneratorAction`, `LoadPDFExtractorAction`, `LoadExcelReaderAction`, `LoadExcelWriterAction`, `LoadFileCompressAction`, `LoadListObjectsAction`, `LoadGetMetadataAction`, `LoadGetObjectAction`, `LoadGetFileContentAction`, `LoadGetDownloadUrlAction`, `LoadGetUploadUrlAction`, `LoadObjectExistsAction`, `LoadDirectoryExistsAction`, `LoadCopyObjectAction`, `LoadMoveObjectAction`, `LoadDeleteObjectAction`, `LoadCreateDirectoryAction`, `LoadDeleteDirectoryAction`, `LoadSearchStorageFilesAction`, `LoadListStorageAccountsAction` |
| `integration/` | 5 | `LoadHTTPRequestAction`, `LoadGraphQLQueryAction`, `LoadOAuthFlowAction`, `LoadAPIRateLimiterAction`, `LoadGammaGeneratePresentationAction` |
| `lists/` | 7 | `LoadAddRecordsToListAction`, `LoadGetListRecordsAction`, etc. |
| `mcp/` | 6 | `LoadExecuteMCPToolAction`, `LoadListMCPToolsAction`, etc. |
| `security/` | 1 | `LoadPasswordStrengthAction` |
| `user-management/` | 5 | `LoadCreateUserAction`, `LoadCreateEmployeeAction`, `LoadAssignUserRolesAction`, `LoadValidateEmailUniqueAction` |
| `utilities/` | 6 | `LoadQRCodeAction`, `LoadIPGeolocationAction`, `LoadCensusDataLookupAction`, `LoadExternalChangeDetectionAction`, `LoadBusinessDaysCalculatorAction`, `LoadVectorizeEntityAction` |
| `visualization/` | 7 | `LoadCreateSVGChartAction`, `LoadCreateSVGDiagramAction`, `LoadCreateMermaidDiagramAction`, etc. |
| `web/` | 6 | `LoadWebSearchAction`, `LoadWebPageContentAction`, `LoadURLLinkValidatorAction`, `LoadURLMetadataExtractorAction`, `LoadPerplexitySearchAction`, `LoadGoogleCustomSearchAction` |
| `workflow/` | 5 | `LoadConditionalAction`, `LoadLoopAction`, `LoadParallelExecuteAction`, `LoadRetryAction`, `LoadDelayAction` |

**CoreActions aggregator**: `packages/Actions/CoreActions/src/index.ts`
- Remove `LoadAllCoreActions()` function definition (lines 207-303)
- Remove all Load function imports throughout the file
- Keep non-Load exports intact

**BizApps FormBuilders** (~42 files in `packages/Actions/BizApps/FormBuilders/src/providers/`):
- TypeForm: 11 Load functions
- SurveyMonkey: 9 Load functions
- JotForm: 9 Load functions
- Google Forms: 5 Load functions
- Plus aggregator indices

**Other action packages**:
- `packages/Actions/ContentAutotag/src/generic/content-autotag-and-vectorize.action.ts`: `LoadAutotagAndVectorizeContentAction`
- `packages/Actions/ApolloEnrichment/src/contacts.ts`: `LoadApolloEnrichmentContactsAction`
- `packages/Actions/ApolloEnrichment/src/accounts.ts`: `LoadApolloEnrichmentAccountsAction`

#### AI Package (~52 definitions)

**AI CorePlus** (`packages/AI/CorePlus/src/`):
- `index.ts`: `LoadAICorePlus`
- `AIPromptExtended.ts`: `LoadAIPromptEntityExtended`
- `AIAgentExtended.ts`: `LoadAIAgentEntityExtended`
- `AIModelExtended.ts`: `LoadAIModelExtended`
- `AIAgentRunExtended.ts`: `LoadAIAgentRunEntityExtended`
- `AIAgentRunStepExtended.ts`: `LoadAIAgentEntityRunStepExtended`
- `AIPromptCategoryExtended.ts`: `LoadAIPromptCategoryEntityExtended`

**AI Base Engine** (`packages/AI/BaseAIEngine/src/`):
- `index.ts`: `LoadBaseAIEngine`
- `AICredentialBindingEntityExtended.ts`: `LoadAICredentialBindingEntityExtended`
- `PriceUnitTypes.ts`: `LoadPriceUnitTypes`

**AI Engine**: `packages/AI/Engine/src/AIEngine.ts`: `LoadAIEngine`

**AI Providers** (~25 files across `packages/AI/Providers/*/src/`):
- OpenAI: `LoadOpenAILLM`, `LoadOpenAIEmbedding`, `LoadOpenAIImageGenerator`
- Anthropic: `LoadAnthropicLLM`
- Azure: `LoadAzureLLM`, `LoadAzureEmbedding`
- Bedrock: `LoadBedrockLLM`, `LoadBedrockEmbedding`
- BettyBot: `LoadBettyBotLLM`
- Cerebras: `LoadCerebrasLLM`
- Cohere: `LoadCohereReranker`
- ElevenLabs: `LoadElevenLabsAudioGenerator`
- Fireworks: `LoadFireworksLLM`
- Gemini: `LoadGeminiLLM`, `LoadGeminiImageGenerator`
- Groq: `LoadGroqLLM`
- HeyGen: `LoadHeyGenVideoGenerator`
- LMStudio: `LoadLMStudioLLM`
- LocalEmbeddings: `LoadLocalEmbedding`
- Mistral: `LoadMistralLLM`, `LoadMistralEmbedding`
- Ollama: `LoadOllamaLLM`, `LoadOllamaEmbedding`
- OpenRouter: `LoadOpenRouterLLM`
- Rex: `LoadRexRecommendationsProvider`
- Pinecone: `LoadPineconeVectorDB`
- Vertex: `LoadVertexLLM`
- xAI: `LoadxAILLM`
- BlackForestLabs: `LoadFLUXImageGenerator`

**AI Provider Bundle** (`packages/AI/Providers/Bundle/src/index.ts`):
- Remove `LoadAIProviders()` function (lines 51-93) and all Load imports (lines 15-36)
- This entire file may become empty/unnecessary -- the manifest handles everything it was doing

**AI Prompts**: `packages/AI/Prompts/src/AIPromptRunner.ts`: `LoadAIPromptRunner`

**AI Agents** (`packages/AI/Agents/src/`):
- `AgentDataPreloader.ts`: `LoadAgentDataPreloader`
- `utils/ConversationMessageResolver.ts`: `LoadConversationMessageResolver`
- `agent-types/flow-agent-type.ts`: `LoadFlowAgentType`
- `agent-types/loop-agent-type.ts`: `LoadLoopAgentType`

**AI Agent Manager**:
- `packages/AI/AgentManager/core/src/index.ts`: `LoadAgentManagerCore`
- `packages/AI/AgentManager/actions/src/index.ts`: `LoadAgentManagementActions`

**AI MCP Client** (`packages/AI/MCPClient/src/`):
- `index.ts`: `LoadMCPClient`
- `oauth/index.ts`: `LoadOAuthModule`
- `AgentToolAdapter.ts`: `LoadAgentToolAdapter`

#### MJCoreEntitiesServer (~15 definitions)

All in `packages/MJCoreEntitiesServer/src/custom/`:
- `AIPromptEntityExtended.server.ts`: `LoadAIPromptEntityExtendedServerSubClass`
- `AIPromptRunEntity.server.ts`: `LoadAIPromptRunEntityServerSubClass`
- `ActionEntity.server.ts`: `LoadActionEntityServer`
- `ApplicationEntity.server.ts`: `LoadApplicationEntityServer`
- `QueryEntity.server.ts`: `LoadQueryEntityServerSubClass`
- `TemplateContentEntity.server.ts`: `LoadTemplateContentEntityServerSubClass`
- `reportEntity.server.ts`: `LoadReportEntityServerSubClass`
- `userViewEntity.server.ts`: `LoadUserViewEntityServerSubClass`
- Plus ~7 more custom entity extensions
- Aggregator in `index.ts`: `LoadCoreEntitiesServerSubClasses`

#### Angular Dashboard Components (~70 definitions)

Scattered across `packages/Angular/Explorer/dashboards/src/`:
- Each dashboard component file has a `LoadXXX()` definition
- Each resource component file has a `LoadXXX()` definition
- Major subfolders: `AI/`, `Actions/`, `Scheduling/`, `Communication/`, `Credentials/`, `MCP/`, `DataExplorer/`, `Home/`, `Lists/`, `APIKeys/`, `SystemDiagnostics/`, `VersionHistory/`

#### Angular Generic Components (~80 definitions)

Scattered across `packages/Angular/Generic/*/src/lib/`:
- `dashboard-viewer/`: `LoadDashboardViewerModule`, `LoadArtifactPart`, `LoadQueryPart`, `LoadWebURLConfigPanel`, `LoadViewConfigPanel`, `LoadQueryConfigPanel`, `LoadArtifactConfigPanel`, `LoadAllDashboardParts`, `LoadDashboardBrowser`, `LoadDashboardBreadcrumb`
- `actions/`: `LoadActionsModule`
- `credentials/`: `LoadCredentialsModule`, `LoadCredentialEditPanel`, `LoadCredentialTypeEditPanel`, `LoadCredentialCategoryEditPanel`, `LoadCredentialDialog`
- `versions/`: `LoadMjLabelCreateComponent`
- `query-viewer/`: `LoadQueryViewerModule`
- `flow-editor/`: `LoadFlowEditorModule`
- `trees/`: `LoadNgTreesModule`
- `file-storage/`: `LoadFileBrowserResource`
- Plus others

#### Angular Explorer Core (~12 definitions)

`packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/`:
- `dashboard-resource.component.ts`: `LoadDashboardResource`
- `view-resource.component.ts`: `LoadViewResource`
- `query-resource.component.ts`: `LoadQueryResource`
- `record-resource.component.ts`: `LoadRecordResource`
- `search-results-resource.component.ts`: `LoadSearchResultsResource`
- `artifact-resource.component.ts`: `LoadArtifactResource`
- `chat-conversations-resource.component.ts`: `LoadChatConversationsResource`
- `chat-collections-resource.component.ts`: `LoadChatCollectionsResource`
- `chat-tasks-resource.component.ts`: `LoadChatTasksResource`
- `list-detail-resource.component.ts`: `LoadListDetailResource`
- `notifications-resource.component.ts`: `LoadNotificationsResource`

#### Angular Custom Forms (~15 definitions)

`packages/Angular/Explorer/core-entity-forms/src/lib/custom/`:
- Various extended form components each with a Load function

#### Angular Auth Services (~3 definitions)

`packages/Angular/Explorer/auth-services/src/lib/providers/`:
- `mjexplorer-msal-provider.service.ts`: `LoadMJExplorerMSALProvider`
- `mjexplorer-okta-provider.service.ts`: `LoadMJExplorerOKTAProvider`
- `mjexplorer-auth0-provider.service.ts`: `LoadMJExplorerAuth0Provider`

#### Scheduling (~14 definitions)

- `packages/Scheduling/actions/src/`: 8 individual action Load functions + `LoadAllSchedulingActions` aggregator
- `packages/Scheduling/engine/src/`: `LoadSchedulingEngine`, `LoadActionScheduledJobDriver`, `LoadAgentScheduledJobDriver`, `LoadScheduledJobDrivers`
- `packages/Scheduling/base-engine/src/`: `LoadBaseSchedulingEngine`, `LoadScheduledJobEntityExtended`

#### Communication (~5 definitions)

- `packages/Communication/entity-comm-client/src/client.ts`: `LoadEntityCommunicationsEngineClient`
- `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts`: `LoadMSGraphProvider`
- `packages/Communication/providers/twilio/src/TwilioProvider.ts`: `LoadProvider`
- `packages/Communication/providers/sendgrid/src/SendGridProvider.ts`: `LoadProvider`
- `packages/Communication/providers/gmail/src/GmailProvider.ts`: `LoadProvider`

#### Other Packages (~10 definitions)

- `packages/Templates/engine/src/extensions/AIPrompt.extension.ts`: `LoadAIPromptExtension`
- `packages/Templates/engine/src/extensions/TemplateEmbed.extension.ts`: `LoadTemplateEmbedExtension`
- `packages/APIKeys/Engine/src/index.ts`: `LoadAPIKeysEngine`
- `packages/APIKeys/Base/src/index.ts`: `LoadAPIKeysBase`
- `packages/MJServer/src/entitySubclasses/entityPermissions.server.ts`: `LoadEntityPermissionsServerSubClass`
- `packages/MJServer/src/auth/exampleNewUserSubClass.ts`: `LoadExampleNewUserSubClass`
- `packages/MJServer/src/resolvers/MCPResolver.ts`: `LoadMCPResolver`
- `packages/MJCoreEntities/src/engines/EncryptionEngineBase.ts`: `LoadEncryptionEngineBase`
- `packages/MJDataContextServer/src/index.ts`: `LoadDataContextItemsServer`
- `packages/GeneratedEntities/src/index.ts`: `LoadGeneratedEntities`

#### Demos (~4 definitions)

- `Demos/EventAbstractSubmission/code/UI/src/dashboards/events-dashboard/events-dashboard.component.ts`: `LoadEventsDashboardComponent`
- `Demos/EventAbstractSubmission/code/UI/src/forms/event-form/event-form.component.ts`: `LoadEventFormComponent`
- `Demos/EventAbstractSubmission/code/UI/src/forms/speaker-form/speaker-form.component.ts`: `LoadSpeakerFormComponent`
- `Demos/EventAbstractSubmission/code/UI/src/forms/submission-form/submission-form.component.ts`: `LoadSubmissionFormComponent`

---

## Execution Plan

### Phase 2: Remove Server-Side Load Calls from MJServer

**Scope**: `packages/MJServer/src/index.ts` lines 32-69

**What to do**:
1. Delete lines 32-69 entirely (all 13 import+call pairs plus the `GetTypeformResponsesAction` hack)
2. Verify the `resolve` import on line 57 is still needed elsewhere in the file (it is -- used on line 142). Do NOT remove it. But it should be consolidated with the existing `resolve` import if one exists higher up, or left where it is.
3. Verify no other code in MJServer references these Load functions

**What NOT to do**:
- Do NOT remove the Load function **definitions** from the source packages yet (that's Phase 5)
- Do NOT remove the Load function **exports** from package index files yet (that's Phase 5)

**Verification**:
- Build `packages/MJServer`: `cd packages/MJServer && npm run build`
- Build `packages/MJAPI`: `cd packages/MJAPI && npm run build`
- Start the API server: `npm run start:api`
- Verify all actions, AI providers, entity extensions, scheduling, and communication providers register correctly by checking startup logs

---

### Phase 3: Modify CodeGen Templates

**Scope**: 2 template files in CodeGenLib

#### 3a. Angular Form Component Template

**File**: `packages/CodeGenLib/src/Angular/angular-codegen.ts`

1. **Line 136**: Change the component import template from:
   ```
   import { ${componentName}, Load${componentName} } from "./Entities/...";
   ```
   To:
   ```
   import { ${componentName} } from "./Entities/...";
   ```

2. **Lines 243-250**: Remove the entire `Load${modulePrefix}GeneratedForms()` function generation block

3. **Lines 466-468**: Remove the `Load${entity.ClassName}FormComponent()` function generation from each component template

#### 3b. Action Subclasses Template

**File**: `packages/CodeGenLib/src/Misc/action_subclasses_codegen.ts`

1. **Lines 83-86**: Remove the `LoadGeneratedActions()` function generation

#### 3c. Build CodeGenLib

- `cd packages/CodeGenLib && npm run build`

**Verification**:
- Build CodeGenLib successfully
- Do NOT re-run CodeGen yet -- that happens in Phase 6

---

### Phase 4: Remove Client-Side Invocations

**Scope**: All files that CALL LoadXXX() functions in Angular packages

#### 4a. MJExplorer app.module.ts

**File**: `packages/MJExplorer/src/app/app.module.ts`

1. Remove `LoadCoreGeneratedForms`, `LoadCoreCustomForms`, `LoadResourceWrappers` from the import on lines 15-17
2. Remove the three calls on lines 23-25
3. Remove `LoadGeneratedForms` from the import on line 40
4. Remove the `LoadGeneratedForms()` call on line 46

#### 4b. Dashboards public-api.ts

**File**: `packages/Angular/Explorer/dashboards/src/public-api.ts`

1. Remove all `LoadXXX` names from export statements (lines 200-209, and throughout the file)
2. Remove the entire block of ~60 Load function calls (lines 214-298)
3. Remove all Load function imports from throughout the file
4. Keep all component/class exports and non-Load imports intact

#### 4c. Custom Forms Module

**File**: `packages/Angular/Explorer/core-entity-forms/src/lib/custom/custom-forms.module.ts`

1. Remove the `LoadCoreCustomForms()` function (lines 192-210)
2. Remove all Load function imports at the top of the file

#### 4d. Resource Wrappers Loader

**File**: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/resource-wrappers-loader.ts`

1. Delete this file entirely
2. Remove the export of `LoadResourceWrappers` from the package's barrel exports (public-api.ts or index.ts)

#### 4e. Explorer Settings

**File**: `packages/Angular/Explorer/explorer-settings/src/public-api.ts`

1. Remove all LoadXXX() calls and imports

#### 4f. Dashboard Viewer

**File**: `packages/Angular/Generic/dashboard-viewer/src/public-api.ts`

1. Remove all LoadXXX() calls and imports

#### 4g. Other Module/Public-API Files

Remove Load calls from:
- `Angular/Generic/query-viewer/src/public-api.ts`
- `Angular/Generic/trees/src/public-api.ts`
- `Angular/Generic/file-storage/src/public-api.ts`
- `Angular/Generic/versions/src/public-api.ts`
- `Angular/Explorer/auth-services/src/lib/auth-services.module.ts`
- `Angular/Explorer/dashboards/src/MCP/mcp.module.ts`
- `Angular/Generic/credentials/src/lib/credentials.module.ts`
- `Angular/Explorer/explorer-core/src/lib/oauth/oauth.module.ts`

#### 4h. Explorer Modules Re-exports

**File**: `packages/Angular/Explorer/explorer-modules/src/public-api.ts`

This file likely re-exports `LoadCoreGeneratedForms`, `LoadCoreCustomForms`, `LoadResourceWrappers` from downstream packages. Remove those re-exports.

**Verification**:
- Build all affected Angular packages
- Build MJExplorer
- Run `npm run start:explorer` and verify all forms, dashboards, and resources load correctly

---

### Phase 5: Remove All Manual Load Function Definitions

**Scope**: ~379 files across the entire codebase

This is the largest phase. For each file, remove:
1. The `export function LoadXXX() {}` definition
2. The export of `LoadXXX` from the package's index.ts or public-api.ts

Work through packages in this order (from least to most interconnected):

#### 5a. Communication Providers (5 files)
- `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts`
- `packages/Communication/providers/twilio/src/TwilioProvider.ts`
- `packages/Communication/providers/sendgrid/src/SendGridProvider.ts`
- `packages/Communication/providers/gmail/src/GmailProvider.ts`
- `packages/Communication/entity-comm-client/src/client.ts`

#### 5b. Templates (2 files)
- `packages/Templates/engine/src/extensions/AIPrompt.extension.ts`
- `packages/Templates/engine/src/extensions/TemplateEmbed.extension.ts`

#### 5c. APIKeys (2 files)
- `packages/APIKeys/Engine/src/index.ts`
- `packages/APIKeys/Base/src/index.ts`

#### 5d. MJDataContextServer (1 file)
- `packages/MJDataContextServer/src/index.ts`

#### 5e. MJCoreEntities (1 file)
- `packages/MJCoreEntities/src/engines/EncryptionEngineBase.ts`

#### 5f. GeneratedEntities (1 file)
- `packages/GeneratedEntities/src/index.ts`

#### 5g. MJServer Internal Load Definitions (3 files)
- `packages/MJServer/src/entitySubclasses/entityPermissions.server.ts`
- `packages/MJServer/src/auth/exampleNewUserSubClass.ts`
- `packages/MJServer/src/resolvers/MCPResolver.ts`

#### 5h. MJCoreEntitiesServer (~16 files)
- All files in `packages/MJCoreEntitiesServer/src/custom/`
- Aggregator in `packages/MJCoreEntitiesServer/src/index.ts`

#### 5i. Scheduling (~14 files)
- All files in `packages/Scheduling/actions/src/`
- All files in `packages/Scheduling/engine/src/` and `packages/Scheduling/base-engine/src/`

#### 5j. AI Packages (~52 files)
- All provider files across `packages/AI/Providers/*/src/`
- AI Provider Bundle: `packages/AI/Providers/Bundle/src/index.ts` -- remove `LoadAIProviders` and all imports. Consider whether this package should be deprecated entirely since the manifest replaces its purpose.
- AI CorePlus, BaseAIEngine, Engine, Prompts, Agents, AgentManager, MCPClient

#### 5k. Actions (~140 files)
- All custom action files in `packages/Actions/CoreActions/src/custom/`
- The `LoadAllCoreActions` aggregator in `packages/Actions/CoreActions/src/index.ts`
- All files in `packages/Actions/BizApps/FormBuilders/src/providers/`
- `packages/Actions/ContentAutotag/` and `packages/Actions/ApolloEnrichment/`
- Generated action files: `packages/Actions/CoreActions/src/generated/action_subclasses.ts` and `packages/GeneratedActions/src/generated/action_subclasses.ts`

#### 5l. Angular Explorer Core (~12 files)
- All resource wrapper component files in `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/`

#### 5m. Angular Custom Forms (~15 files)
- All custom form component files in `packages/Angular/Explorer/core-entity-forms/src/lib/custom/`
- Note: Some of these files call their own Load function at the bottom (self-referencing pattern seen in Test components). Remove those calls too.

#### 5n. Angular Auth Services (3 files)
- All provider files in `packages/Angular/Explorer/auth-services/src/lib/providers/`

#### 5o. Angular Dashboard Components (~70 files)
- All dashboard and resource component files in `packages/Angular/Explorer/dashboards/src/`

#### 5p. Angular Generic Components (~80 files)
- All files across `packages/Angular/Generic/*/src/lib/` that define Load functions

#### 5q. Angular Explorer Settings
- Load function definitions in `packages/Angular/Explorer/explorer-settings/src/`

**Verification after each sub-phase**:
- Build the affected package: `cd packages/<package> && npm run build`
- Spot check that exports still compile (no missing references)

**Full verification after Phase 5 complete**:
- Full build from root: `npm run build`
- Start API: `npm run start:api`
- Start Explorer: `npm run start:explorer`

---

### Phase 6: Re-Run CodeGen to Clean Generated Files

**Scope**: All generated files that currently contain Load functions

After Phase 3 modified the templates, this phase regenerates:

1. All Angular form components in `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/*/` -- each file will no longer have a `LoadXXXFormComponent()` definition
2. The `generated-forms.module.ts` files -- will no longer import Load functions or define `LoadGeneratedForms()`
3. The `action_subclasses.ts` files in `packages/Actions/CoreActions/src/generated/` and `packages/GeneratedActions/src/generated/` -- will no longer have `LoadGeneratedActions()`
4. MJExplorer generated forms in `packages/MJExplorer/src/app/generated/`

**How to regenerate**:
- Run the MJ CodeGen process according to the standard CodeGen workflow
- Verify the regenerated files no longer contain Load functions

**Verification**:
- Full build from root
- Start API and Explorer
- Compare the generated file diffs to confirm only Load-related code was removed

---

### Phase 7: Demos and Edge Cases

**Scope**: Demo apps and any remaining references

1. Remove Load functions from `Demos/EventAbstractSubmission/code/UI/src/`:
   - `dashboards/events-dashboard/events-dashboard.component.ts`
   - `forms/event-form/event-form.component.ts`
   - `forms/speaker-form/speaker-form.component.ts`
   - `forms/submission-form/submission-form.component.ts`

2. Evaluate the AI Provider Bundle package (`packages/AI/Providers/Bundle/`):
   - Its sole purpose was to aggregate LoadXXX calls for AI providers
   - With manifests, it may be completely unnecessary
   - Decision: either deprecate/remove the package, or keep it as a convenience re-export package
   - If keeping: remove Load functions, keep any non-Load exports
   - If removing: update all consumers to import providers directly (the manifest handles registration)

3. Final grep across entire codebase for any remaining `Load` function patterns:
   ```
   grep -r "export function Load" packages/
   grep -r "LoadAll.*Actions\|LoadAIProviders\|LoadResourceWrappers\|LoadCoreGeneratedForms\|LoadCoreCustomForms\|LoadGeneratedForms\|LoadGeneratedActions\|LoadGeneratedEntities" packages/
   ```

4. Update any documentation that references the Load function pattern

5. Verify the `@memberjunction/ng-explorer-modules` package no longer re-exports Load functions

**Final Verification**:
- Clean build from root: `rm -rf node_modules && npm install && npm run build`
- Start API and verify all features
- Start Explorer and verify all forms, dashboards, resources, and AI features work
- Run any existing test suites

---

## Risk Mitigation

- **Each phase is independently deployable** -- if Phase 3 causes issues, Phases 2 and 4 still work
- **Manifests run alongside Load functions initially** -- double coverage until Load functions are confirmed unnecessary
- **Generated code changes (Phase 6) are reversible** -- just re-run CodeGen with old templates to restore
- **The manifest's `CLASS_REGISTRATIONS_COUNT` export** provides an easy sanity check -- compare the count before and after removing Load functions to ensure no classes were lost
- **Phase ordering matters**: Remove invocations (Phases 2, 4) before definitions (Phase 5) to avoid build errors from missing imports

## Estimated Scope

| Phase | Files Modified | Risk Level |
|-------|---------------|------------|
| Phase 2 | 1 file | Low -- server-only, manifest covers everything |
| Phase 3 | 2 files | Low -- template changes, no runtime impact until Phase 6 |
| Phase 4 | ~15 files | Medium -- many Angular files, but manifest covers all classes |
| Phase 5 | ~379 files | Medium -- high volume but each change is trivial (delete a function) |
| Phase 6 | ~210+ generated files | Low -- CodeGen regeneration, fully automated |
| Phase 7 | ~5 files + validation | Low -- demos and cleanup |
