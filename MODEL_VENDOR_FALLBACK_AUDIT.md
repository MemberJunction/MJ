# Model & Vendor Selection / Fallback Audit

> **Branch**: `audit/model-vendor-fallback` (off `origin/next`)
> **Worktree**: `/Users/madhavsubramaniyam/Projects/MJ/MJ/.claude/worktrees/model-vendor-audit`
> **Date**: 2026-04-25
> **Scope**: All AI model / vendor selection sites across the MemberJunction monorepo

---

## 1. Executive summary

- **One sophisticated fallback path exists, but it is *only* exercised by `AIPromptRunner.ExecutePrompt()`.** That central runner has multi-vendor candidate ranking, configuration-aware fallback chains, power-matched fallback, credential-aware filtering, error-classification-driven failover, and per-attempt observability — all driven by `AIPrompt.FailoverStrategy` (default `SameModelDifferentVendor`). See [packages/AI/Prompts/src/AIPromptRunner.ts:124-3001](packages/AI/Prompts/src/AIPromptRunner.ts#L124-L3001).
- **Anything that calls `AIEngine`, `BaseEmbeddings`, `BaseLLM`, or `BaseReranker` directly bypasses that path entirely** — picking one model + one vendor + one API key with no retry to a sibling vendor on failure. There are **14 such files** (excluding tests, `AI/Providers/`, and the runner itself); see §3.
- **`AIModelRunner.RunEmbedding()`** — the lightweight tracked-embedding path used by `TagEngine`, `ContentAutotagging`, and others — also has no failover. It returns `null` from `findBestVendor` if the highest-priority vendor’s API key is missing, then short-circuits if that vendor’s call fails. See [packages/AI/Prompts/src/AIModelRunner.ts:231-244](packages/AI/Prompts/src/AIModelRunner.ts#L231-L244).
- **`AIEngine.SimpleLLMCompletion` / `PrepareLLMInstance` / `EmbedTextLocal`** — used by the React test harness, MJExplorer’s React runtime, the Templates Nunjucks `{% AIPrompt %}` extension, all `EmbedTextLocalHelper`-driven entity hooks, semantic agent/action search — all pick **one** model + driver and **throw if it fails**. See [packages/AI/Engine/src/AIEngine.ts:739-921](packages/AI/Engine/src/AIEngine.ts#L739-L921).
- **Vendor selection inside the central runner itself is consistent** (priority-ordered candidate list, credential pre-flight check, `isInferenceProvider` filter, `Status='Active'`). The bug surface is mainly **outside** the runner.
- **There is no shared `ResolveModelWithFallback()` API.** The runner’s `selectModel` / `buildModelVendorCandidates` / `executeModelWithFailover` are private to `AIPromptRunner`. Anyone wanting fallback must re-implement it or wrap their work in a tracked `AIPromptRun`.
- **Five distinct selection patterns coexist**: (a) `AIPromptRunner.selectModel` (configuration-aware, multi-source candidate ranking), (b) `ExecutionPlanner.selectBestModel` (`PromptModel.Priority` then `PowerRank`), (c) `AIEngine.GetHighestPower(LLM|Model)` (single-vendor by name, then `PowerRank` desc), (d) `AIModelRunner.findBestVendor` (`ModelVendor.Priority` desc, take first with API key), (e) ad-hoc filters (`m.DriverClass === 'GroqLLM' || ...` in `FeedbackResolver`, `modelPower: 'lowest'|'medium'|'highest'` in `RunAIPromptResolver` and the React test harness).
- **Vendor priority semantics are inverted in two places**: `AIModelVendor.Priority` is documented as “higher = more preferred”, and `AIPromptRunner.createCandidatesForAllVendors` sorts `b.Priority - a.Priority` ([AIPromptRunner.ts:2027](packages/AI/Prompts/src/AIPromptRunner.ts#L2027)) — but `RerankerService.getModelDriverInfo` sorts `a.Priority - b.Priority` (lower = better, [RerankerService.ts:247](packages/AI/Reranker/src/RerankerService.ts#L247)). This is a latent bug if a reranker model has more than one vendor.
- **Failover for `ContextLengthExceeded` is correctly marked Fatal** ([AIPromptRunner.ts:3128-3142](packages/AI/Prompts/src/AIPromptRunner.ts#L3128-L3142)), but only inside the runner. The peripheral call sites have no such intelligence.
- **One direct SDK import lurks outside `packages/AI/Providers/`**: `packages/ContentAutotagging/src/LocalFileSystem/generic/AutotagLocalFileSystem.ts:7` imports `OpenAI`. The class declares `static _openAI: OpenAI` but never invokes it — so it’s a dormant landmine, not a live gap.
- **Recommendation**: extract a public `ModelResolver` from `AIPromptRunner` (steps in §5), retrofit the 14 direct-instantiation call sites to use it, and remove `AIEngine.SimpleLLMCompletion` / `PrepareLLMInstance` in favor of it (or thinly delegate). Estimated change list: §6 — **35 specific edits across 18 files**.

---

## 2. Current architecture

### 2.1 Central runner: `AIPromptRunner.ExecutePrompt`

The sole abstraction that has full vendor failover is [`AIPromptRunner.ExecutePrompt()`](packages/AI/Prompts/src/AIPromptRunner.ts#L585) in [packages/AI/Prompts/src/AIPromptRunner.ts](packages/AI/Prompts/src/AIPromptRunner.ts). Flow:

1. `ExecutePrompt(params)` validates the prompt, renders the template, and calls `selectModel()` ([line 1461](packages/AI/Prompts/src/AIPromptRunner.ts#L1461)).
2. `selectModel()` calls `buildModelVendorCandidates()` ([line 1661](packages/AI/Prompts/src/AIPromptRunner.ts#L1661)), which uses a **3-phase strategy**:
   - **Phase 1**: explicit `params.override.modelId` → `buildCandidatesForExplicitModel` ([line 1687](packages/AI/Prompts/src/AIPromptRunner.ts#L1687)).
   - **Phase 2**: `prompt.SelectionStrategy === 'Specific'` → `buildCandidatesForSpecificStrategy` ([line 1713](packages/AI/Prompts/src/AIPromptRunner.ts#L1713)) which orders by configuration inheritance chain → priority desc, and (when `RequireSpecificModels = false`) appends **power-matched fallback candidates** from the global pool via `appendPowerMatchedFallbackCandidates` ([line 1772](packages/AI/Prompts/src/AIPromptRunner.ts#L1772)).
   - **Phase 3**: `Default` / `ByPower` → `buildCandidatesForGeneralSelection` ([line 1862](packages/AI/Prompts/src/AIPromptRunner.ts#L1862)) walks the configuration inheritance chain (decreasing priority per level), then appends NULL-config models as universal fallback.
3. `selectModelWithAPIKeyTracked()` ([line 2414](packages/AI/Prompts/src/AIPromptRunner.ts#L2414)) iterates candidates in priority order, calls `hasCredentialsAvailable()` ([line 503](packages/AI/Prompts/src/AIPromptRunner.ts#L503)) on each (which traverses the full credential hierarchy: per-request → PromptModel binding → ModelVendor binding → Vendor binding → type-based default → legacy `apiKeys[]` → legacy `AI_VENDOR_API_KEY__<DRIVER>` env var), and picks the first credentialed candidate.
4. `executeWithValidationRetries()` ([line 3607](packages/AI/Prompts/src/AIPromptRunner.ts#L3607)) calls `executeModelWithFailover()` ([line 2845](packages/AI/Prompts/src/AIPromptRunner.ts#L2845)).
5. `executeModelWithFailover` iterates `allCandidates` in priority order, calling `executeModel()` ([line 3160](packages/AI/Prompts/src/AIPromptRunner.ts#L3160)) for each. On error, `processFailoverError()` ([line 3951](packages/AI/Prompts/src/AIPromptRunner.ts#L3951)) classifies via `ErrorAnalyzer.analyzeError`, applies `errorScope` filtering (`All` / `NetworkOnly` / `RateLimitOnly` / `ServiceErrorOnly`), and decides retry-same vs continue-to-next vs fatal-stop.
6. Failover metadata (attempts, errors, durations) is persisted on the `MJ: AI Prompt Runs` record via `updatePromptRunWithFailoverSuccess` / `Failure` ([lines 3076 / 3104](packages/AI/Prompts/src/AIPromptRunner.ts#L3076)).

### 2.2 Entities driving selection

From [packages/MJCoreEntities/src/generated/entity_subclasses.ts](packages/MJCoreEntities/src/generated/entity_subclasses.ts):

| Entity | Field | Where it is read |
|---|---|---|
| `MJ: AI Prompts` | `SelectionStrategy` (`Default` / `Specific` / `ByPower`) | `AIPromptRunner.buildModelVendorCandidates` |
| `MJ: AI Prompts` | `MinPowerRank`, `PowerPreference` (`Highest` / `Lowest` / `Balanced`) | `AIPromptRunner.sortByPowerPreference`, `ExecutionPlanner.selectBestModel` |
| `MJ: AI Prompts` | `AIModelTypeID` | every selection path filters by this |
| `MJ: AI Prompts` | `FailoverStrategy` (default `SameModelDifferentVendor`) | `AIPromptRunner.getFailoverConfiguration` ([line 4994](packages/AI/Prompts/src/AIPromptRunner.ts#L4994)) |
| `MJ: AI Prompts` | `FailoverMaxAttempts` (default 3), `FailoverDelaySeconds` (default 5), `FailoverModelStrategy` (default `PreferSameModel`), `FailoverErrorScope` (default `All`) | same |
| `MJ: AI Prompts` | `RequireSpecificModels` (default `0`) | `buildCandidatesForSpecificStrategy` falls back to power-matched candidates when `0`, hard-fails when `1` |
| `MJ: AI Prompts` | `MaxRetries`, `RetryDelayMS`, `RetryStrategy` | retry loop *within the same model*, separate from failover |
| `MJ: AI Prompt Models` | `Priority` (higher = better), `ConfigurationID`, `VendorID` (nullable), `ExecutionGroup`, `ParallelizationMode`, `ParallelCount` | `buildCandidatesFromPromptModels`, `ExecutionPlanner` |
| `MJ: AI Prompt Models` | `Status` (`Active` / `Preview` accepted) | candidate filter |
| `MJ: AI Models` | `PowerRank`, `IsActive`, `AIModelTypeID`, `DriverClass`, `APIName`, `SupportsEffortLevel` | global model pool |
| `MJ: AI Model Vendors` | `Priority` (higher = better, **per the schema description**), `Status`, `DriverClass` (overrides model default), `APIName`, `SupportsEffortLevel`, `SupportsStreaming`, `MaxInputTokens`, `MaxOutputTokens`, `TypeID` (Inference Provider vs Model Developer) | `createCandidatesForAllVendors` ([AIPromptRunner.ts:2027](packages/AI/Prompts/src/AIPromptRunner.ts#L2027)), `AIModelRunner.findBestVendor`, `RerankerService.getModelDriverInfo` |
| `MJ: AI Vendors` | `CredentialTypeID` (used for type-based default credential lookup) | `findDefaultCredentialByType` ([AIPromptRunner.ts:472](packages/AI/Prompts/src/AIPromptRunner.ts#L472)) |
| `MJ: AI Configurations` | parent/child inheritance | `AIEngineBase.GetConfigurationChain` |
| `MJ: AI Vendor Type Definitions` | `Inference Provider` vs `Model Developer` | `isInferenceProvider` filter on every candidate ([AIPromptRunner.ts:231](packages/AI/Prompts/src/AIPromptRunner.ts#L231)) |

### 2.3 Existing fallback / failover code paths

The grep `grep -rni "fallback\|failover\|retry.*model\|next.*vendor\|alternate.*model" packages/ --include="*.ts"` returns 100s of hits, the meaningful ones are:

| Site | Semantics |
|---|---|
| [packages/AI/Prompts/src/AIPromptRunner.ts:2845-3001](packages/AI/Prompts/src/AIPromptRunner.ts#L2845-L3001) `executeModelWithFailover` | The only true cross-vendor failover loop in the codebase. Iterates `allCandidates`, classifies errors, retries-same / continues / aborts. |
| [packages/AI/Prompts/src/AIPromptRunner.ts:1772-1815](packages/AI/Prompts/src/AIPromptRunner.ts#L1772-L1815) `appendPowerMatchedFallbackCandidates` | When the prompt’s configured `AIPromptModel` records all lack credentials and `RequireSpecificModels=false`, appends global-pool candidates sorted by power proximity. |
| [packages/AI/Prompts/src/AIPromptRunner.ts:2126-2189](packages/AI/Prompts/src/AIPromptRunner.ts#L2126-L2189) `addConfigurationFallbackCandidates` | Walks the configuration inheritance chain (parent configs at 3000-500*i priority, NULL config at 1000) so missing credentials in the child config fall through. |
| [packages/AI/Prompts/src/AIPromptRunner.ts:343-374](packages/AI/Prompts/src/AIPromptRunner.ts#L343-L374) `tryCredentialBindingsWithFailover` | Per-binding credential failover (multiple bindings per target are tried in `Priority` order). |
| [packages/AI/Engine/src/AIEngine.ts:980-1080](packages/AI/Engine/src/AIEngine.ts#L980-L1080) `FindSimilarAgentNotes` / `FindSimilarAgentExamples` | Falls back to *cached entity rows without semantic ranking* when the local vector service is unavailable or embedding generation fails. This is a graceful-degradation fallback, not a model fallback. |
| [packages/AI/Knowledge/TagEngine/src/TagEngine.ts:241-256](packages/AI/Knowledge/TagEngine/src/TagEngine.ts#L241-L256) | Falls back from `AIModelRunner.RunEmbedding` (tracked) to `embedBatchDirect` (untracked direct `BaseEmbeddings`) on failure. **Both still pick the same single model + driver class** — there is no second-vendor attempt. |
| [packages/AI/Agents/src/AgentRunner.ts:935-958](packages/AI/Agents/src/AgentRunner.ts#L935-L958) | If the “Name Conversation” prompt is missing or fails, falls back to a hard-coded naming heuristic. Not a model fallback. |
| [packages/MJServer/src/resolvers/RunAIPromptResolver.ts:440-441](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L440-L441) | If none of `preferredModels` are available, falls back to `modelPower` selection (still picks one model with no failover). |

---

## 3. Fallback gaps — full call-site backlog

Search commands used (re-runnable for verification):

```
rg -tts -ln "MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>|MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>|MJGlobal.Instance.ClassFactory.CreateInstance<BaseModel>|MJGlobal.Instance.ClassFactory.CreateInstance<BaseReranker>|MJGlobal.Instance.ClassFactory.CreateInstance<BaseImage>" packages/ \
  | grep -v __tests__ | grep -v "^packages/AI/Providers/"
# 14 hits

rg -tts -ln "GetHighestPowerLLM|GetHighestPowerModel|SimpleLLMCompletion|EmbedTextLocal|RunEmbedding|PrepareLLMInstance" packages/ | grep -v __tests__
# Long tail of consumers — see table below
```

Severity legend:
- **HARD** — call dies on vendor outage / missing credential, no retry to sibling.
- **SOFT** — has retry but only against the *same* model/vendor.
- **OK** — verified to use `AIPromptRunner.ExecutePrompt` so inherits cross-vendor failover.

### 3.1 Direct provider instantiation outside the runner — HARD gaps

| # | File:line | What it calls | Why it’s a gap | Severity |
|---|---|---|---|---|
| G1 | [packages/AI/Engine/src/AIEngine.ts:739-753](packages/AI/Engine/src/AIEngine.ts#L739-L753) `PrepareLLMInstance` | `ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))` | Picks `GetHighestPowerLLM(undefined)` if no model passed, then instantiates **one** driver. No vendor enumeration, no failover. Used by `SimpleLLMCompletion` (G2), `ParallelLLMCompletions` (G3), and via `MJComputerUseEngine` (G6). | HARD |
| G2 | [packages/AI/Engine/src/AIEngine.ts:766-793](packages/AI/Engine/src/AIEngine.ts#L766-L793) `SimpleLLMCompletion` | Calls `PrepareLLMInstance` then `modelInstance.ChatCompletion(params)`. Throws on any failure. | Used by [packages/React/test-harness/src/lib/component-runner.ts:2062](packages/React/test-harness/src/lib/component-runner.ts#L2062) (which is the runtime utility for *all* MJ React components running prompts at runtime) — a Groq outage takes down all React-component prompt execution. | HARD |
| G3 | [packages/AI/Engine/src/AIEngine.ts:809-849](packages/AI/Engine/src/AIEngine.ts#L809-L849) `ParallelLLMCompletions` | Same `PrepareLLMInstance` path, then `ChatCompletions(paramsArray)` for N parallel temperature variations. | Single-model parallel; if the chosen vendor is down all N variations fail. | HARD |
| G4 | [packages/AI/Engine/src/AIEngine.ts:888-921](packages/AI/Engine/src/AIEngine.ts#L888-L921) `EmbedText` / `EmbedTextLocal` | `EmbedTextLocal()` returns `HighestPowerLocalEmbeddingModel` (vendor=`LocalEmbeddings` only). `EmbedText(model)` instantiates a single driver. | Local-only path means no internet-fallback. The semantic-search path for agents/actions/notes/examples fails silently if the local embedder fails. Calls in [packages/AI/Engine/src/AIEngine.ts:888-895](packages/AI/Engine/src/AIEngine.ts#L888-L895). | SOFT (degraded retrieval still works via `fallbackGetNotesFromCache`) |
| G5 | [packages/AI/Engine/src/AIEngine.ts:1305-1349](packages/AI/Engine/src/AIEngine.ts#L1305-L1349) `ExecuteAIAction` (deprecated) | `getDriver(model)` picks one driver and throws on failure. | Marked `@deprecated` but still in code; if anything still calls it (search shows no live callers in `packages/`), it would still die. | HARD (latent) |
| G6 | [packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:1009-1025](packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts#L1009-L1025) `createLLMInstance` | Hard-coded `vendorToDriverClass` map (anthropic→AnthropicLLM, openai→OpenAILLM, google→GeminiLLM, groq→GroqLLM, mistral→MistralLLM). Picks one. | Computer-use `judge` and `controller` paths in `ComputerUseEngine` instantiate via `createLLMInstance`. If the chosen vendor is down, the whole computer-use loop fails. (Note: `@memberjunction/ai-mj-computer-use` MJComputerUseEngine routes through `AIPromptRunner` correctly — only the standalone `@memberjunction/ai-computer-use` package has this gap.) | HARD |
| G7 | [packages/MJServer/src/resolvers/FeedbackResolver.ts:362-370](packages/MJServer/src/resolvers/FeedbackResolver.ts#L362-L370) `categorizeFeedback` | `models.find(m => m.DriverClass === 'GroqLLM') || models.find(m => m.DriverClass === 'OpenAILLM') || models[0]`, then directly `ClassFactory.CreateInstance<BaseLLM>` and `llm.ChatCompletion(...)`. | If Groq is down and OpenAI returns 429, the `try{}` returns `Success: false` to the user. No vendor enumeration, no `AIPrompt`/`AIPromptModel` lookup. The categorization prompt is also hard-coded in code, not in metadata. | HARD |
| G8 | [packages/MJServer/src/resolvers/RunAIPromptResolver.ts:633-661](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L633-L661) `ExecuteSimplePrompt` | `selectModelForSimplePrompt` (lines 401-463) filters all LLMs by `GetAIAPIKey` presence, sorts by `PowerRank`, picks one (`lowest`/`medium`/`highest` index). Then `ClassFactory.CreateInstance<BaseLLM>` + `ChatCompletion`. | Exposed as a GraphQL mutation `ExecuteSimplePrompt` and `ExecuteSimplePromptSystemUser`. Called by external agents / arbitrary clients — bypasses all of `AIPromptRunner`’s failover. | HARD |
| G9 | [packages/SearchEngine/src/generic/VectorSearchProvider.ts:166-196](packages/SearchEngine/src/generic/VectorSearchProvider.ts#L166-L196) `embedQueryAndSearch` | Loads `Models.find(m => UUIDsEqual(m.ID, embeddingModelID))`, takes its single `DriverClass`, instantiates one `BaseEmbeddings`, calls `EmbedText`. | If the embedding vendor (likely OpenAI for non-local indexes) is down, *every* `searchEngine` query for that index returns `[]`. No fallback to a sibling vendor of the same model, no fallback to `EmbedTextLocal`. | HARD |
| G10 | [packages/AI/Vectors/Sync/src/models/entityVectorSync.ts:580-619](packages/AI/Vectors/Sync/src/models/entityVectorSync.ts#L580-L619) `entityVectorSync` (worker setup) | Picks one embedding model + driver per `EntityDocument`. | Periodic vectorization workers (`VectorizeTemplates.ts`, `entityVectorSync.ts`) silently stop producing vectors if the chosen vendor is down. No retry, no second vendor. | HARD |
| G11 | [packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts:26](packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts#L26) | `ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, context.embeddingDriverClass, context.embeddingAPIKey)` then `embedding.EmbedTexts(...)`. | Worker thread; throws if vendor fails. Parent (`entityVectorSync.ts`) does not retry the worker against another vendor. | HARD |
| G12 | [packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts:501-548](packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts#L501-L548) `InitializeProviders` | One embedding vendor + one vector DB vendor for the duplicate-detection scan. Throws on missing API key. | Long-running batch dedup runs blow up if the embedding vendor is down. | HARD |
| G13 | [packages/AI/Knowledge/TagEngine/src/TagEngine.ts:301-334](packages/AI/Knowledge/TagEngine/src/TagEngine.ts#L301-L334) `embedBatchDirect` | The "fallback" used when `AIModelRunner.RunEmbedding` fails. **It uses the exact same `modelInfo.DriverClass` and `modelInfo.APIName`** — i.e., it is a fallback from *tracked* to *untracked*, not from one vendor to another. | Tag embedding pipeline still fails completely if the resolved vendor is down. | HARD |
| G14 | [packages/AI/Reranker/src/RerankerService.ts:135-214](packages/AI/Reranker/src/RerankerService.ts#L135-L214) `getReranker` + `getModelDriverInfo` | Picks `modelVendors.sort((a, b) => a.Priority - b.Priority)[0]` → instantiates one reranker. **The sort direction is opposite of `AIPromptRunner` (which uses `b.Priority - a.Priority`)** — this is a latent bug. Also no failover: if the primary vendor’s reranker call fails, the consumer (agent code) merely degrades to original vector-search ordering. | HARD (no failover) + bug (priority direction) |
| G15 | [packages/Templates/engine/src/extensions/AIPrompt.extension.ts:115-161](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L115-L161) Nunjucks `{% AIPrompt %}` | Hard-defaults to vendor `'Groq'` (`GetHighestPowerModel('Groq', 'llm', ...)`). Picks one model. `ClassFactory.CreateInstance<BaseLLM>` + `ChatCompletion`. Returns `(null, error)` to the template caller on any failure. | Every Nunjucks template using `{% AIPrompt %}` (templates rendered through `TemplateEngineServer`) silently breaks if Groq is unavailable, even when other vendors are configured. | HARD |
| G16 | [packages/AI/Prompts/src/ParallelExecutionCoordinator.ts:546-613](packages/AI/Prompts/src/ParallelExecutionCoordinator.ts#L546-L613) `executeSingleTask` | Instantiates `ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKey)` per planner task and calls `llm.ChatCompletion(innerParams)`. | When `AIPrompt.ParallelizationMode !== 'None'`, the parallel path bypasses `executeModelWithFailover` for each individual task. A failing vendor on one task fails just that task; there is no retry to a sibling vendor for that slot. | SOFT (the prompt-level result-selector may still pick a winner from the surviving siblings, but per-task failover is absent) |
| G17 | [packages/AI/Prompts/src/AIModelRunner.ts:99-106](packages/AI/Prompts/src/AIModelRunner.ts#L99-L106) `RunEmbedding` | Picks `findBestVendor(modelID)` (highest `Priority` desc, take first with API key) and calls `EmbedTexts` once. No retry to next vendor on failure. | Used by `TagEngine` (G13), `EntityDocumentSuggester`, `ContentAutotagging` for embedding-style runs. Single-vendor outage → entire batch fails. | HARD |
| G18 | [packages/AI/Prompts/src/AIModelRunner.ts:231-244](packages/AI/Prompts/src/AIModelRunner.ts#L231-L244) `findBestVendor` | Returns `null` if no vendor with API key — the caller short-circuits. Cannot fall through to the model’s second vendor if the first vendor’s `GetAIAPIKey` succeeds but the call fails at runtime. | Same root cause as G17. Should iterate vendors at execution time, not just selection time. | HARD |
| G19 | [packages/MJServer/src/resolvers/RunAIPromptResolver.ts:469-485](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L469-L485) `selectEmbeddingModelBySize` | Returns one local embedding model. The `GenerateEmbeddings` GraphQL mutation (around line 700) instantiates one driver and calls it. | Embedding GraphQL mutation has no fallback. | HARD |
| G20 | [packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:1605-1614](packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L1605-L1614) `createEmbeddingInstance` | One driver class, throws on missing API key, no retry. | The vectorization side of content auto-tagging silently breaks. The prompt side correctly uses `AIPromptRunner` (line 661-662). | HARD (vector path only) |
| G21 | [packages/ContentAutotagging/src/LocalFileSystem/generic/AutotagLocalFileSystem.ts:7,17](packages/ContentAutotagging/src/LocalFileSystem/generic/AutotagLocalFileSystem.ts#L7) | `import { OpenAI } from "openai"` and `static _openAI: OpenAI` — declared but never instantiated. | Dormant landmine: any future code that fills `_openAI` would hard-couple to OpenAI without going through metadata or fallback. | LATENT |
| G22 | [packages/DBAutoDoc/src/utils/llm-factory.ts:36-59](packages/DBAutoDoc/src/utils/llm-factory.ts#L36-L59) `createLLMInstance` | Hard-coded `PROVIDER_TO_DRIVER_CLASS` map. Used by [LLMSanityChecker.ts:37](packages/DBAutoDoc/src/discovery/LLMSanityChecker.ts#L37) and [PromptEngine.ts:63](packages/DBAutoDoc/src/prompts/PromptEngine.ts#L63). One driver, one API key, no failover. | DBAutoDoc is a CLI tool, but it is shipped as `@memberjunction/db-auto-doc`. Long-running schema analysis dies if the configured provider has a transient issue. | HARD |
| G23 | [packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts:32-80](packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts#L32-L80) | Same factory, same gap. | Same. | HARD |
| G24 | [packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts:298-321](packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts#L298-L321) `selectModel` (the *MJ* computer-use, not the standalone one) | Calls `AIEngine.GetHighestPowerLLM(undefined, ...)`. After that, the actual prompt **is** routed through `AIPromptRunner.ExecutePrompt`. | Selection is single-vendor but execution has failover. The selected `model` here is just used as the metadata default for the prompt run — `AIPromptRunner.selectModel` will still produce a candidate list. | OK at runtime; SOFT for naming the “primary model” |

### 3.2 Higher-level call sites of `AIEngine.SimpleLLMCompletion` / `EmbedTextLocal` (transitive HARD gaps)

These don’t themselves instantiate a driver but pull through one of the gaps above:

| # | File:line | Pulls through |
|---|---|---|
| G25 | [packages/React/test-harness/src/lib/component-runner.ts:2010-2095](packages/React/test-harness/src/lib/component-runner.ts#L2010-L2095) `ExecutePrompt` exposed via `__mjExecutePrompt` window function | `aiEngine.SimpleLLMCompletion` (G2) |
| G26 | [packages/Angular/Generic/react/src/lib/utilities/runtime-utilities.ts:78-95](packages/Angular/Generic/react/src/lib/utilities/runtime-utilities.ts#L78-L95) `ExecutePrompt` exposed to runtime React components | Calls `RunAIPromptResolver.ExecuteSimplePrompt` GraphQL mutation (G8) |
| G27 | [packages/MJCoreEntitiesServer/src/custom/util.ts:10-15](packages/MJCoreEntitiesServer/src/custom/util.ts#L10-L15) `EmbedTextLocalHelper` | `AIEngine.Instance.EmbedTextLocal` (G4) |
| G28 | [packages/MJCoreEntitiesServer/src/custom/MJComponentEntityServer.server.ts:30-31](packages/MJCoreEntitiesServer/src/custom/MJComponentEntityServer.server.ts#L30-L31) | `EmbedTextLocalHelper` → G4 |
| G29 | [packages/MJCoreEntitiesServer/src/custom/MJAIAgentExampleEntityServer.server.ts:20-21](packages/MJCoreEntitiesServer/src/custom/MJAIAgentExampleEntityServer.server.ts#L20-L21) | `EmbedTextLocalHelper` → G4 |
| G30 | [packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts:21-22](packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts#L21-L22) | `EmbedTextLocalHelper` → G4 |
| G31 | [packages/MJCoreEntitiesServer/src/custom/MJQueryEntityServer.server.ts:53-75](packages/MJCoreEntitiesServer/src/custom/MJQueryEntityServer.server.ts#L53-L75) | `EmbedTextLocalHelper` → G4 |
| G32 | [packages/QueryGen/src/vectors/EmbeddingService.ts:46-48](packages/QueryGen/src/vectors/EmbeddingService.ts#L46-L48) | `aiEngine.EmbedTextLocal` (G4) called for `userQuestion`, `description`, `technicalDescription`. Three sequential failures if local embedder is down. |
| G33 | [packages/Actions/CoreActions/src/custom/data/search-query-catalog.action.ts:75](packages/Actions/CoreActions/src/custom/data/search-query-catalog.action.ts#L75) | `(text) => AIEngine.Instance.EmbedTextLocal(text)` — the search-query-catalog Action |
| G34 | [packages/AI/Engine/src/services/ActionEmbeddingService.ts](packages/AI/Engine/src/services/ActionEmbeddingService.ts), [packages/AI/Engine/src/services/AgentEmbeddingService.ts](packages/AI/Engine/src/services/AgentEmbeddingService.ts) | Both call back via `(text) => aiEngine.EmbedTextLocal(text)` callback during agent / action embedding generation. |
| G35 | [packages/AI/MCPServer/src/Server.ts:2604-2610](packages/AI/MCPServer/src/Server.ts#L2604-L2610) `new AIPromptRunner().ExecutePrompt(promptParams)` | OK — uses central runner. Listed for completeness. |

### 3.3 Verified-OK call sites (use `AIPromptRunner.ExecutePrompt`)

These all transit the failover-aware path. Listed so the audit is complete:

- [packages/AI/Agents/src/base-agent.ts](packages/AI/Agents/src/base-agent.ts) — the foundational agent uses `AIPromptRunner` for every step.
- [packages/AI/Agents/src/AgentRunner.ts:957-958](packages/AI/Agents/src/AgentRunner.ts#L957-L958)
- [packages/AI/Agents/src/PayloadFeedbackManager.ts:175-183](packages/AI/Agents/src/PayloadFeedbackManager.ts#L175-L183)
- [packages/AI/Agents/src/memory-manager-agent.ts](packages/AI/Agents/src/memory-manager-agent.ts) (5 sites)
- [packages/Actions/CoreActions/src/custom/ai/execute-ai-prompt.action.ts:153-154](packages/Actions/CoreActions/src/custom/ai/execute-ai-prompt.action.ts#L153-L154)
- [packages/Actions/CoreActions/src/custom/ai/summarize-content.action.ts:271-272](packages/Actions/CoreActions/src/custom/ai/summarize-content.action.ts#L271-L272)
- [packages/Actions/CoreActions/src/custom/data/run-adhoc-query.action.ts:417-418](packages/Actions/CoreActions/src/custom/data/run-adhoc-query.action.ts#L417-L418)
- [packages/Actions/RuntimeHost/src/RuntimeActionBridge.ts](packages/Actions/RuntimeHost/src/RuntimeActionBridge.ts)
- [packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts:148-176](packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts#L148-L176)
- [packages/AI/MCPServer/src/Server.ts:2604-2610](packages/AI/MCPServer/src/Server.ts#L2604-L2610)
- [packages/AI/Reranker/src/LLMReranker.ts:213](packages/AI/Reranker/src/LLMReranker.ts#L213)
- [packages/AI/Vectors/Sync/src/models/EntityDocumentSuggester.ts:179](packages/AI/Vectors/Sync/src/models/EntityDocumentSuggester.ts#L179)
- [packages/CodeGenLib/src/Misc/advanced_generation.ts:155,656](packages/CodeGenLib/src/Misc/advanced_generation.ts#L155)
- [packages/MJCoreEntitiesServer/src/custom/MJUserViewEntityServer.server.ts:78-79](packages/MJCoreEntitiesServer/src/custom/MJUserViewEntityServer.server.ts#L78-L79)
- [packages/MJCoreEntitiesServer/src/custom/MJActionEntityServer.server.ts:215-221](packages/MJCoreEntitiesServer/src/custom/MJActionEntityServer.server.ts#L215-L221)
- [packages/MJCoreEntitiesServer/src/custom/template-extraction/pipeline.ts:134-140](packages/MJCoreEntitiesServer/src/custom/template-extraction/pipeline.ts#L134-L140)
- [packages/MJCoreEntitiesServer/src/custom/query-extraction/enrich.ts:89-95](packages/MJCoreEntitiesServer/src/custom/query-extraction/enrich.ts#L89-L95)
- [packages/QueryGen/src/utils/prompt-helpers.ts:45-46](packages/QueryGen/src/utils/prompt-helpers.ts#L45-L46)
- [packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:661-662](packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L661-L662)
- [packages/TestingFramework/Engine/src/oracles/LLMJudgeOracle.ts:140-141](packages/TestingFramework/Engine/src/oracles/LLMJudgeOracle.ts#L140-L141)

### 3.4 Special-case findings

- **`AgentRunner.ts:935-958` uses `await import('@memberjunction/ai-prompts')`** ([packages/AI/Agents/src/AgentRunner.ts:936](packages/AI/Agents/src/AgentRunner.ts#L936)) — that violates the project rule “NO DYNAMIC `import()` UNLESS NARROWLY JUSTIFIED” (CLAUDE.md §8). Out of scope for this audit but worth flagging since it touches the same code path.
- **`AIEngine.getDriver` uses `await import(driverModuleName)` based on entity field `DriverImportPath`** ([AIEngine.ts:1370-1384](packages/AI/Engine/src/AIEngine.ts#L1370-L1384)) — this is the legacy `BaseModel`-driver-loading path. Safe (it’s genuine plugin discovery from metadata) but interacts badly with bundlers.
- **`ContentAutotagging` instance variable `static _openAI: OpenAI`** is dead code; safe to delete in a follow-up.

---

## 4. Inconsistencies in selection patterns

Five distinct selection patterns coexist; the same intent ("pick a model + vendor") is implemented five different ways:

### 4.1 Five patterns side-by-side

| Pattern | Vendor priority semantics | Power semantics | Credential check | Failover | File:line |
|---|---|---|---|---|---|
| **A. AIPromptRunner.selectModel** | `b.Priority - a.Priority` (higher = better, **per schema description**) | Configurable via `SelectionStrategy`, `MinPowerRank`, `PowerPreference`, `MaxRetries`, `FailoverStrategy` | Pre-flight `hasCredentialsAvailable` traversing 7-tier hierarchy | Yes — `executeModelWithFailover` | [AIPromptRunner.ts:1461,2027](packages/AI/Prompts/src/AIPromptRunner.ts#L1461) |
| **B. ExecutionPlanner.selectBestModel** | n/a (uses `PromptModel.Priority` only) | `PowerPreference` (`Highest`/`Lowest`/`Balanced`) | None | None | [ExecutionPlanner.ts:401-446](packages/AI/Prompts/src/ExecutionPlanner.ts#L401-L446) |
| **C. AIEngine.GetHighestPowerLLM/Model** | Filters by `Vendor` name string only | `PowerRank` desc, take `[0]` | None | None | [BaseAIEngine.ts:367-398](packages/AI/BaseAIEngine/src/BaseAIEngine.ts#L367-L398) |
| **D. AIModelRunner.findBestVendor** | `b.Priority - a.Priority` (higher = better) | n/a | `GetAIAPIKey(driverClass)` (env-only) | None | [AIModelRunner.ts:231-244](packages/AI/Prompts/src/AIModelRunner.ts#L231-L244) |
| **E. RerankerService.getModelDriverInfo** | **`a.Priority - b.Priority` (lower = better) — INVERTED** | n/a | Per-driver via `GetAIAPIKey` | None (caller decides) | [RerankerService.ts:247](packages/AI/Reranker/src/RerankerService.ts#L247) |
| **F. Ad-hoc string filters** | Hard-coded driver-class strings (`'GroqLLM'`, `'OpenAILLM'`) | Manual `lowest`/`medium`/`highest` index | `GetAIAPIKey` | None | [FeedbackResolver.ts:362-365](packages/MJServer/src/resolvers/FeedbackResolver.ts#L362-L365), [RunAIPromptResolver.ts:401-462](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L401-L462), [component-runner.ts:2030-2050](packages/React/test-harness/src/lib/component-runner.ts#L2030-L2050) |
| **G. Hard-coded vendor name** | Vendor=`'Groq'` literal | `GetHighestPowerModel('Groq', 'llm', ...)` | `GetAIAPIKey(driverClass)` | None | [AIPrompt.extension.ts:128](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L128) |

### 4.2 Concrete inconsistency examples

#### Inconsistency I1 — Vendor priority direction is inverted between AIPromptRunner and RerankerService

```ts
// AIPromptRunner.createCandidatesForAllVendors — packages/AI/Prompts/src/AIPromptRunner.ts:2027
.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));   // higher = better

// RerankerService.getModelDriverInfo — packages/AI/Reranker/src/RerankerService.ts:247
const sortedVendors = modelVendors.sort((a, b) => a.Priority - b.Priority);  // lower = better
```

The schema docstring on `MJ: AI Model Vendors.Priority` says “Higher values indicate higher priority.” `RerankerService` is wrong. If a reranker model is configured with two vendors, the wrong one will be picked. Filed under §6 as change item 26.

#### Inconsistency I2 — Five different ways to filter for "active LLMs with credentials"

```ts
// FeedbackResolver.ts:346-356
AIEngine.Instance.Models.filter(m =>
  m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive && m.DriverClass
).filter(m => { try { const key = GetAIAPIKey(m.DriverClass); return key && key.trim().length > 0; } catch { return false; } });

// RunAIPromptResolver.selectModelForSimplePrompt:410-422
AIEngine.Instance.Models.filter(m =>
  m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive === true
);
// then per-model GetAIAPIKey check inline

// AIEngine.LocalEmbeddingModels:858-867
this.Models.filter(m => {
  const modelType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
  const vendor = typeof m.Vendor === 'string' ? m.Vendor.trim().toLowerCase() : '';
  return modelType === 'embeddings' && vendor === 'localembeddings';
});

// AIPromptRunner.getModelPoolForStrategy:2217-2227
AIEngine.Instance.Models.filter(m => m.IsActive &&
  (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID)) &&
  (!preferredVendorName || AIEngine.Instance.ModelVendors.some(mv => ...this.isInferenceProvider(mv))))

// AIModelRunner.findBestVendor:233-242
aiEngine.ModelVendors
  .filter(mv => mv.ModelID === modelID && mv.Status === 'Active' && mv.DriverClass != null)
  .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
```

Some use `m.Vendor` (the denormalized string from the view), some use `m.ModelVendors[].Vendor`, some apply `isInferenceProvider`, some don’t. UUID comparisons mix `===` ([AIModelRunner.ts:233-234](packages/AI/Prompts/src/AIModelRunner.ts#L233-L234) `mv.ModelID === modelID`) and `UUIDsEqual` (everywhere else) — that one (`===`) **breaks SQL Server vs PostgreSQL UUID-case mismatches** as per the project’s UUID guide.

#### Inconsistency I3 — Power selection direction (Lowest/Medium/Highest) is implemented 3 ways

```ts
// AIPromptRunner.sortModelPoolByStrategy → respects prompt.PowerPreference enum
// ExecutionPlanner.selectBestModel:432-444 → switch on prompt.PowerPreference
// RunAIPromptResolver.selectModelForSimplePrompt:447-459 → switch on string param "lowest"/"medium"/"highest" — **picks the array midpoint for "medium"**, which is meaningless if power ranks are nonlinear
// component-runner.ts:2030-2050 → identical midpoint heuristic, parameter-driven
```

#### Inconsistency I4 — `isInferenceProvider` filter applied inconsistently

`AIPromptRunner` filters `ModelVendors` by `isInferenceProvider(mv)` ([AIPromptRunner.ts:1995, 2025, 3205](packages/AI/Prompts/src/AIPromptRunner.ts#L1995)). Nothing else does:
- `AIModelRunner.findBestVendor` ignores `TypeID`.
- `RerankerService.getModelDriverInfo` ignores `TypeID`.
- `AIEngine.GetHighestPowerModel` ignores `TypeID`.
- `entityVectorSync` and the workers ignore `TypeID`.

If a model has both an Inference Provider and a Model Developer vendor row (which is the canonical setup), the non-runner paths can pick the Model Developer entry and try to call its driver class — which is often unset or set to a non-callable placeholder.

#### Inconsistency I5 — Credential resolution: 7-tier vs single env var

`AIPromptRunner.resolveCredentialForExecution` ([line 269](packages/AI/Prompts/src/AIPromptRunner.ts#L269)) traverses:
1. `params.credentialId` override
2. `AICredentialBinding` (PromptModel)
3. `AICredentialBinding` (ModelVendor)
4. `AICredentialBinding` (Vendor)
5. type-based default credential
6. legacy `params.apiKeys[]`
7. legacy `AI_VENDOR_API_KEY__<DRIVER>` env var

**Every other call site uses only #7** (`GetAIAPIKey(driverClass)`). That means: if a deployment is using the new Credentials system but no env vars, *every* call site outside `AIPromptRunner` returns `null`/`""` and falls over with “No API key found for driver X”. The Vector worker and `entityVectorSync.ResolveVectorDBAPIKey` ([line 626-654](packages/AI/Vectors/Sync/src/models/entityVectorSync.ts#L626-L654)) do partial credential resolution but only for the vector-DB key, not the embedding driver key.

#### Inconsistency I6 — Hard-coded vendor / driver-class strings

| Location | Hard-coded |
|---|---|
| [AIPrompt.extension.ts:128](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L128) | `GetHighestPowerModel('Groq', 'llm', ...)` |
| [AIPrompt.extension.ts:170-171](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L170-L171) | `DefaultAIVendorName` returns `'OpenAI'` |
| [FeedbackResolver.ts:362-365](packages/MJServer/src/resolvers/FeedbackResolver.ts#L362-L365) | `find(m => m.DriverClass === 'GroqLLM') || find(m => m.DriverClass === 'OpenAILLM')` |
| [ComputerUseEngine.ts:1030-1040](packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts#L1030-L1040) | `vendorToDriverClass` map (anthropic/openai/google/groq/mistral) |
| [llm-factory.ts:14-26](packages/DBAutoDoc/src/utils/llm-factory.ts#L14-L26) | `PROVIDER_TO_DRIVER_CLASS` map for 11 providers |
| [TagEngine.test.ts:65](packages/AI/Knowledge/TagEngine/src/__tests__/TagEngine.test.ts#L65) | mock `RunEmbedding` (test only) |

---

## 5. Proposed standardization

### 5.1 Recommendation: extract `ModelResolver` from `AIPromptRunner`

Move the candidate-building + credential pre-flight logic out of `AIPromptRunner` and into a new public class **`ModelResolver`** in a new package `@memberjunction/ai-model-resolver` (or as a public export of `@memberjunction/ai-prompts`). `AIPromptRunner` then becomes a consumer of it — same algorithm, no behavioral change for prompt execution.

### 5.2 Proposed API shape

```typescript
// @memberjunction/ai-model-resolver

export interface ModelResolveRequirements {
  /** Restrict to one specific AI Model Type (LLM, Embeddings, Image, Audio, Reranker, etc.) */
  modelTypeId?: string;
  modelTypeName?: string;        // convenience: 'LLM', 'Embeddings', etc.
  /** Restrict to a specific model (escape hatch — disables fallback unless allowVendorFallback) */
  modelId?: string;
  /** Restrict to a specific vendor */
  vendorId?: string;
  vendorName?: string;
  /** Power-rank constraints */
  minPowerRank?: number;
  powerPreference?: 'Highest' | 'Lowest' | 'Balanced';
  /** Configuration-aware (walks AIConfiguration inheritance chain) */
  configurationId?: string;
  /** When false (default) and a prompt has SelectionStrategy='Specific', falls through to power-matched candidates if specifics are missing credentials */
  requireSpecific?: boolean;
  /** Drive failover scope */
  failoverStrategy?: 'None' | 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank';
  /** Per-request credential override */
  credentialId?: string;
}

export interface ResolvedModelCandidate {
  model: MJAIModelEntityExtended;
  vendorId?: string;
  vendor?: MJAIVendorEntity;
  driverClass: string;
  apiName?: string;
  supportsEffortLevel: boolean;
  effortLevel?: number;
  isPreferredVendor: boolean;
  priority: number;          // higher = better
  source: 'explicit' | 'prompt-model' | 'model-type' | 'power-rank' | 'power-match-fallback';
  /** True iff hasCredentialsAvailable() returned true */
  credentialsAvailable: boolean;
}

export interface ResolveModelResult {
  /** Ordered list, highest priority first; only candidates with credentialsAvailable=true */
  candidates: ResolvedModelCandidate[];
  /** Convenience pointer to candidates[0] */
  primary: ResolvedModelCandidate | null;
  /** Diagnostics — every candidate considered, including those filtered out for missing credentials */
  consideredAll: ResolvedModelCandidate[];
}

export class ModelResolver extends BaseSingleton<ModelResolver> {
  public static get Instance(): ModelResolver { return ModelResolver.getInstance(); }
  protected constructor() { super(); }

  /**
   * Entrypoint #1: Resolve from a prompt entity (uses prompt's SelectionStrategy, AIPromptModel records,
   * configuration chain, fallback fields).
   */
  public async resolveForPrompt(
    prompt: MJAIPromptEntityExtended,
    overrides?: { modelId?: string; vendorId?: string; credentialId?: string },
    contextUser?: UserInfo
  ): Promise<ResolveModelResult>;

  /**
   * Entrypoint #2: Resolve without a prompt (for embedding / reranker / non-LLM use cases).
   * Honors `modelTypeName: 'Embeddings'` or `'Reranker'` etc.
   */
  public async resolveForRequirements(
    req: ModelResolveRequirements,
    contextUser?: UserInfo
  ): Promise<ResolveModelResult>;

  /**
   * Entrypoint #3: Execute a function against the candidate list with cross-vendor failover.
   * The fn receives one candidate at a time and is called with each until one succeeds or
   * the list is exhausted. ErrorAnalyzer-driven retry classification is built-in.
   */
  public async withFailover<T>(
    candidates: ResolvedModelCandidate[],
    fn: (c: ResolvedModelCandidate) => Promise<T>,
    options?: { failoverStrategy?: FailoverStrategy; errorScope?: FailoverErrorScope; maxAttempts?: number }
  ): Promise<{ result: T; attemptsUsed: number; failoverAttempts: FailoverAttempt[] }>;

  /**
   * Entrypoint #4: Credential pre-flight check (used by both selection and one-off code).
   * Implements the 7-tier hierarchy (per-request → PromptModel binding → ModelVendor binding
   * → Vendor binding → type-based default → legacy apiKeys → legacy env var).
   */
  public async resolveCredential(
    driverClass: string,
    targetIds: { promptId?: string; modelId?: string; vendorId?: string },
    options?: { credentialId?: string; apiKeys?: ApiKeyEntry[]; contextUser?: UserInfo }
  ): Promise<string | null>;
}
```

### 5.3 Error semantics
- `resolveForPrompt` / `resolveForRequirements` never throw — they return `result.primary === null` with `consideredAll` populated for diagnostics.
- `withFailover` throws only when all candidates fail; on a fatal error (`ContextLengthExceeded`, `Unauthorized`) it short-circuits without trying further candidates and includes the fatal candidate’s error.
- `resolveCredential` returns `null` when no credential is available (so callers can degrade gracefully), but logs a warning per call (rate-limited).

### 5.4 Canonical "before / after" for adoption

#### Before (FeedbackResolver — G7)

```ts
// packages/MJServer/src/resolvers/FeedbackResolver.ts
const allModels = AIEngine.Instance.Models.filter(m =>
  m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive && m.DriverClass
);
const models = allModels.filter(m => {
  try { return GetAIAPIKey(m.DriverClass)?.trim().length > 0; } catch { return false; }
});
const model = models.find(m => m.DriverClass === 'GroqLLM')
  || models.find(m => m.DriverClass === 'OpenAILLM')
  || models[0];

const apiKey = GetAIAPIKey(model.DriverClass);
const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);
const result = await llm.ChatCompletion(chatParams);
```

#### After

```ts
// packages/MJServer/src/resolvers/FeedbackResolver.ts
import { ModelResolver } from '@memberjunction/ai-model-resolver';

const resolved = await ModelResolver.Instance.resolveForRequirements(
  { modelTypeName: 'LLM', powerPreference: 'Lowest', failoverStrategy: 'SameModelDifferentVendor' },
  contextUser
);
if (!resolved.primary) {
  return { Success: false, Error: 'No AI models with valid credentials' };
}

const { result } = await ModelResolver.Instance.withFailover(resolved.candidates, async (c) => {
  const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, c.driverClass, await ModelResolver.Instance.resolveCredential(c.driverClass, { vendorId: c.vendorId }, { contextUser }));
  return await llm.ChatCompletion({ ...chatParams, model: c.apiName });
});
```

### 5.5 Migration strategy

1. **Phase 1 — Extract** (no behavior change). Move `selectModel` + `buildModelVendorCandidates` + helpers + `executeModelWithFailover` core into `ModelResolver`. `AIPromptRunner` becomes a consumer that adds template rendering, validation retries, and persistence.
2. **Phase 2 — Adopt for new HARD gaps**. Convert `AIModelRunner.RunEmbedding` (G17/G18), `RerankerService.getReranker` (G14), and `AIEngine.SimpleLLMCompletion` (G2) to use `ModelResolver.withFailover`. These three are the highest-leverage — they’re called by ~10 downstream sites combined.
3. **Phase 3 — Adopt for resolver/factory hard-codes**. `FeedbackResolver` (G7), `RunAIPromptResolver` (G8/G19), `ComputerUseEngine.createLLMInstance` (G6), `DBAutoDoc.llm-factory` (G22), `Templates.AIPrompt.extension` (G15).
4. **Phase 4 — Adopt for vector/embedding hot paths**. `VectorSearchProvider.embedQueryAndSearch` (G9), `entityVectorSync` (G10), `VectorizeTemplates` worker (G11), `duplicateRecordDetector` (G12), `TagEngine.embedBatchDirect` (G13), `ContentAutotagging.createEmbeddingInstance` (G20), `QueryGen.EmbeddingService` (G32).
5. **Phase 5 — Deprecate** `AIEngine.PrepareLLMInstance` / `SimpleLLMCompletion` / `ParallelLLMCompletions`. Keep them as thin shims around `ModelResolver` for one release, then remove.
6. **No backward-compat shim required** for `AIPromptRunner.ExecutePrompt` — its signature does not change.

---

## 6. Concrete change list

> Numbered backlog. Each item lists file:line and the specific edit. Items 1-9 deliver the new abstraction; items 10-35 retrofit existing call sites.

### Foundation (Phase 1)

1. **Create new package `packages/AI/ModelResolver/`** with `ModelResolver` class extending `BaseSingleton`. Public exports: `ModelResolver`, `ResolvedModelCandidate`, `ResolveModelResult`, `ModelResolveRequirements`, `FailoverAttempt`. Re-uses `AIEngineBase` for metadata.
2. **Extract `buildModelVendorCandidates` + helpers** from `AIPromptRunner.ts:1661-2389` into `ModelResolver.resolveForPrompt` / `resolveForRequirements`. Cite extraction range: [packages/AI/Prompts/src/AIPromptRunner.ts:1661-2389](packages/AI/Prompts/src/AIPromptRunner.ts#L1661-L2389).
3. **Extract `executeModelWithFailover` + `processFailoverError`** from [AIPromptRunner.ts:2845-3001 + 3951-…](packages/AI/Prompts/src/AIPromptRunner.ts#L2845-L3001) into `ModelResolver.withFailover<T>(candidates, fn, options)`. Make the `executeModel` call configurable so non-LLM consumers (embeddings, rerankers) can plug their own per-candidate function.
4. **Extract `resolveCredentialForExecution` + `tryCredentialBindingsWithFailover` + `findDefaultCredentialByType`** from [AIPromptRunner.ts:269-480](packages/AI/Prompts/src/AIPromptRunner.ts#L269-L480) into `ModelResolver.resolveCredential`.
5. **Extract `hasCredentialsAvailable`** from [AIPromptRunner.ts:503-557](packages/AI/Prompts/src/AIPromptRunner.ts#L503-L557) into `ModelResolver.hasCredentialsAvailable`. Use this internally in `resolveForRequirements` to set `credentialsAvailable` on each candidate.
6. **In `AIPromptRunner`**, replace the in-class versions of all extracted methods with calls to `ModelResolver.Instance` so behavior is unchanged. No public-API break.
7. **Add unit tests** to `packages/AI/ModelResolver/src/__tests__/`. Mirror the existing `AIPromptRunner.modelInfo.test.ts` and `AIPromptRunner.credential-errors.test.ts`. Use `@memberjunction/test-utils` for singleton reset.
8. **Document** the new package in its README (no docs file unless requested).

### Retrofits — direct provider instantiation (Phases 2-4)

9. **`packages/AI/Prompts/src/AIModelRunner.ts:80-244`** — replace `findBestVendor` + the single-vendor `EmbedTexts` call with `ModelResolver.resolveForRequirements({ modelTypeName: 'Embeddings', modelId: params.ModelID })` + `ModelResolver.withFailover(candidates, c => embeddingInstance.EmbedTexts(...))`. Also fixes G17 + G18 in one change.
10. **`packages/AI/Reranker/src/RerankerService.ts:135-265`** — replace `getModelDriverInfo` with `ModelResolver.resolveForRequirements({ modelTypeName: 'Reranker', modelId })`. Replace `getReranker` body with `ModelResolver.withFailover(...)` so the consumer gets a list of working rerankers, not just one. Fixes G14 + the priority-direction bug.
11. **`packages/MJServer/src/resolvers/FeedbackResolver.ts:340-410`** — see §5.4 before/after. Fixes G7.
12. **`packages/MJServer/src/resolvers/RunAIPromptResolver.ts:401-462` + `598-679`** — replace `selectModelForSimplePrompt` and the LLM instantiation in `ExecuteSimplePrompt` with `ModelResolver`. Fixes G8 + G19.
13. **`packages/MJServer/src/resolvers/RunAIPromptResolver.ts` `GenerateEmbeddings` mutation** (around line 700) — replace driver instantiation with `AIModelRunner.RunEmbedding` (which after change item 9 has failover).
14. **`packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:298-1040`** — replace `vendorToDriverClass` map and `createLLMInstance` with `ModelResolver`. Fixes G6.
15. **`packages/Templates/engine/src/extensions/AIPrompt.extension.ts:115-184`** — replace `GetHighestPowerModel('Groq', 'llm', ...)` and the `ClassFactory.CreateInstance<BaseLLM>` call with `ModelResolver.resolveForRequirements({ modelTypeName: 'LLM', vendorName: config.AIModel ? undefined : this.DefaultAIVendorName })`. Remove the `'Groq'` literal. Fixes G15.
16. **`packages/Templates/engine/src/extensions/AIPrompt.extension.ts:166-184`** — change `DefaultAIVendorName` from a hardcoded `'OpenAI'` to `undefined` (let `ModelResolver` choose). Same file.
17. **`packages/SearchEngine/src/generic/VectorSearchProvider.ts:160-211`** — replace `embedQueryAndSearch`’s embedding-instance creation with `AIModelRunner.RunEmbedding`. Fixes G9.
18. **`packages/AI/Vectors/Sync/src/models/entityVectorSync.ts:580-619`** — replace `createInfrastructureFromIndex`’s embedding instantiation with `AIModelRunner.RunEmbedding`. Vector DB instantiation stays (separate concern). Fixes G10.
19. **`packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts:26`** — worker can’t use `AIModelRunner` cleanly because it’s in a `worker_threads` context without metadata. Either (a) marshal the candidate list from the parent and try them in order in the worker, or (b) move the embedding back to the parent thread and only do template rendering in the worker. Recommend (b); the embedding API is the I/O bottleneck, not the rendering. Fixes G11.
20. **`packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts:501-548`** — replace `InitializeProviders` with `AIModelRunner` for embedding (or hold a `ResolvedModelCandidate[]` list and iterate per-batch on failure). Fixes G12.
21. **`packages/AI/Knowledge/TagEngine/src/TagEngine.ts:226-334`** — `embedBatchViaModelRunner` already uses `AIModelRunner` (good); `embedBatchDirect` is dead code after change item 9 (since `AIModelRunner` will have failover). Delete `embedBatchDirect` and the `try`/`fallback` branching in `generateTagEmbeddings`. Fixes G13.
22. **`packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:1605-1614`** — replace `createEmbeddingInstance` with `AIModelRunner.RunEmbedding`. Fixes G20.
23. **`packages/ContentAutotagging/src/LocalFileSystem/generic/AutotagLocalFileSystem.ts:7,17`** — delete the dead `import { OpenAI } from "openai"` and `static _openAI: OpenAI` declaration. Fixes G21.
24. **`packages/DBAutoDoc/src/utils/llm-factory.ts:14-77`** — replace `PROVIDER_TO_DRIVER_CLASS` and `createLLMInstance` with a thin wrapper around `ModelResolver`. The DBAutoDoc CLI passes `--ai.provider gemini --ai.apiKey ...` from config; map those to `ModelResolver.resolveForRequirements({ vendorName, credentialId? })` then `withFailover`. Fixes G22.
25. **`packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts:32-80`** — same change as item 24 (uses the same factory). Fixes G23.

### Engine-level deprecations (Phase 5)

26. **`packages/AI/Engine/src/AIEngine.ts:739-753` `PrepareLLMInstance`** — make it a thin wrapper around `ModelResolver.resolveForRequirements(...).primary` + driver instantiation. Mark `@deprecated`. Fixes G1.
27. **`packages/AI/Engine/src/AIEngine.ts:766-793` `SimpleLLMCompletion`** — re-implement on top of `ModelResolver.withFailover` so it inherits cross-vendor failover. Mark `@deprecated`; new code should use `AIPromptRunner` or `ModelResolver` directly. Fixes G2.
28. **`packages/AI/Engine/src/AIEngine.ts:809-849` `ParallelLLMCompletions`** — re-implement so each iteration uses `withFailover`. Otherwise consider removing entirely (low usage). Fixes G3.
29. **`packages/AI/Engine/src/AIEngine.ts:902-921` `EmbedText`** — accept an optional `failover: boolean` flag (default true) that uses `ModelResolver.withFailover`. Fixes G4.
30. **`packages/AI/Engine/src/AIEngine.ts:1305-1349` `ExecuteAIAction`** — remove (already `@deprecated`, no live callers). Fixes G5.
31. **`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:367-398` `GetHighestPowerModel` / `GetHighestPowerLLM`** — keep for backward compat but document that they don’t do failover and recommend `ModelResolver.resolveForRequirements({ powerPreference: 'Highest' }).primary` instead.

### Cross-cutting fixes

32. **`packages/AI/Reranker/src/RerankerService.ts:247`** — fix priority sort direction (`a.Priority - b.Priority` → `b.Priority - a.Priority`). Note: this is fixed implicitly by item 10 (the new `ModelResolver` enforces a single direction). If item 10 is too far out, fix item 32 first as a one-line bug fix. Fixes I1.
33. **`packages/AI/Prompts/src/AIModelRunner.ts:233-234`** — replace `mv.ModelID === modelID` with `UUIDsEqual(mv.ModelID, modelID)`. Avoids SQL-Server vs Postgres UUID-case mismatches. (Also resolved by item 9.)
34. **`packages/AI/Prompts/src/ParallelExecutionCoordinator.ts:546-613`** — wrap the per-task LLM call in `ModelResolver.withFailover` against the task’s configured candidates. Currently single-vendor per task. Fixes G16.
35. **`packages/AI/Agents/src/AgentRunner.ts:935-958`** — replace `await import('@memberjunction/ai-prompts')` with a static import. Out of scope for failover but noted under §3.4.

### Optional follow-ups

- Add an end-to-end test in `packages/AI/ModelResolver/src/__tests__/integration.test.ts` that spins up a mock failing vendor and asserts the failover path produces a result.
- Add a `mj.config.cjs` flag `ai.disableFailover` (boolean, default false) so deployments can opt-out for debugging without editing prompt metadata.
- Surface `consideredAll` diagnostics in MJExplorer’s AI Prompt Run detail view so operators can see why a particular vendor was skipped.

---

## 7. Open questions

1. **Should `AIModelRunner.RunEmbedding` produce one `AIPromptRun` per failover attempt or one summarising all attempts?** Currently it would be one per attempt; the cleaner model is `Status='Failover Recovered'` with attempts JSON, mirroring `AIPromptRunner`.
2. **Embedding-model fallback policy** — when the configured embedding model is down, should we fall back (a) to the *same* model on a different vendor (when the model has multiple vendor implementations), (b) to a *different* embedding model (with potentially different dimensions / different vector index), or (c) just fail? Current behavior is (c). (a) is the safe default; (b) only makes sense if the caller knows the consumer can handle dimension mismatches (e.g., the search-time embedding can match the index-time embedding only if dimensions match).
3. **Reranker fallback policy** — if the configured reranker model is down and reranking is non-critical, should we silently degrade to original vector-search ordering (current `RerankerService` design) or attempt a sibling-vendor reranker first? The agent code currently catches and degrades; the proposed `ModelResolver.withFailover` would attempt sibling first and only return the original ordering if all candidates fail.
4. **DBAutoDoc** — should the CLI accept multiple `--ai.modelOverrides` entries and use them as a failover list, or should it continue to pin one provider per phase? Current docs in `CLAUDE.md` mention "Multi-model support via `ai.modelOverrides` config" — this could become first-class failover with the new resolver.
5. **The `ContextLengthExceeded → Fatal` short-circuit** in `executeModelWithFailover` ([line 3128-3142](packages/AI/Prompts/src/AIPromptRunner.ts#L3128-L3142)) currently fails the whole prompt. Should it instead try a *larger-context* sibling model (e.g., when Claude 4.5 Sonnet (200k) hits the limit, try Gemini 2.5 Pro (1M))? That would require ranking candidates by `MaxInputTokens` and only trying larger ones for that error class. This is a design call.
6. **Should `RequireSpecificModels=true` disable cross-vendor failover entirely**, or only disable falling back to a *different model* (keep same-model-different-vendor allowed)? Current code disables all fallback; the docstring is ambiguous. Worth clarifying in the entity description.
7. **Vendor priority direction** is documented as “higher = better” on `AIModelVendor.Priority` ([packages/MJCoreEntities/src/generated/entity_subclasses.ts:4758-4763](packages/MJCoreEntities/src/generated/entity_subclasses.ts#L4758-L4763)) but documented as “lower = better” in CLAUDE.md (`Priority: Lower number = higher priority (0 is highest)`). One of these is wrong. Both directions exist in the code (see I1). The user needs to declare which is canonical and we update the other.

---

## Appendix — search artifacts

```
# All AI SDK imports outside Providers/ and tests:
$ rg -tts -ln "from ['\"]openai['\"]|from ['\"]@anthropic-ai|from ['\"]@google/generative-ai|from ['\"]groq-sdk|from ['\"]@mistralai|from ['\"]cohere-ai|from ['\"]@aws-sdk/client-bedrock|from ['\"]ollama['\"]|from ['\"]@google-cloud/vertexai" packages/ \
  | grep -v "^packages/AI/Providers/" | grep -v "/__tests__/"
packages/ContentAutotagging/src/LocalFileSystem/generic/AutotagLocalFileSystem.ts

# All direct provider instantiation outside the central runner and Providers/:
$ rg -tts -ln "MJGlobal.Instance.ClassFactory.CreateInstance<(BaseLLM|BaseEmbeddings|BaseModel|BaseReranker|BaseImage)>" packages/ \
  | grep -v __tests__ \
  | grep -v "^packages/AI/Providers/" \
  | grep -v "^packages/AI/Prompts/src/AIPromptRunner.ts$" \
  | grep -v "^packages/AI/Prompts/src/ParallelExecutionCoordinator.ts$" \
  | grep -v "^packages/AI/Prompts/src/AIModelRunner.ts$"
packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts
packages/AI/Engine/src/AIEngine.ts
packages/MJServer/src/resolvers/FeedbackResolver.ts
packages/SearchEngine/src/generic/VectorSearchProvider.ts
packages/MJServer/src/resolvers/RunAIPromptResolver.ts
packages/AI/Knowledge/TagEngine/src/TagEngine.ts
packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts
packages/Templates/engine/src/extensions/AIPrompt.extension.ts
packages/AI/Vectors/Sync/src/models/entityVectorSync.ts
packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts
packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts
packages/DBAutoDoc/src/utils/llm-factory.ts
packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts
packages/AI/Reranker/src/RerankerService.ts
# 14 files

# All AIPromptRunner instantiations:
$ rg -tts -c "new AIPromptRunner\(\)" packages/ | grep -v __tests__
# 22 production files use it correctly
```
