# Model & Vendor Selection / Fallback Audit

> **Branch**: `audit/model-vendor-fallback` (off `origin/next`)
> **Worktree**: `/Users/madhavsubramaniyam/Projects/MJ/MJ/.claude/worktrees/model-vendor-audit`
> **Date**: 2026-04-25
> **Scope**: All AI model / vendor selection sites across the MemberJunction monorepo

> ### ⚠️ Out-of-scope: DBAutoDoc
> DBAutoDoc (`packages/DBAutoDoc/`) lives in this monorepo for distribution convenience but is a standalone CLI tool — it does not run inside MJAPI / MJExplorer and does not share the `AIPromptRunner` runtime. Its model-selection gaps (**G22, G23**) and the corresponding change-list items (**24, 25**) are kept in the inventory below for completeness but are **not part of this standardization effort**. Effective change list for MJ is **33 items across 16 files**, not 35/18.

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
| G22 | [packages/DBAutoDoc/src/utils/llm-factory.ts:36-59](packages/DBAutoDoc/src/utils/llm-factory.ts#L36-L59) `createLLMInstance` | Hard-coded `PROVIDER_TO_DRIVER_CLASS` map. Used by [LLMSanityChecker.ts:37](packages/DBAutoDoc/src/discovery/LLMSanityChecker.ts#L37) and [PromptEngine.ts:63](packages/DBAutoDoc/src/prompts/PromptEngine.ts#L63). One driver, one API key, no failover. | **OUT OF SCOPE** — DBAutoDoc is a standalone CLI, not part of MJ runtime. Listed for inventory completeness only. | HARD (out of scope) |
| G23 | [packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts:32-80](packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts#L32-L80) | Same factory, same gap. | **OUT OF SCOPE** — same reason as G22. | HARD (out of scope) |
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

### 3.5 Capability matrix (per-capability sufficiency)

> **The guarantee being tested.** "Any single configured vendor sufficient to run any feature it supports." Concretely: for every AI capability MJ uses (LLM, embeddings, reranker, image generation, audio TTS, audio STT, video, etc.), if a deployment has at least one configured vendor whose providers implement that capability, the corresponding feature works without requiring a *specific* vendor. Vendors that don't sell a given capability (e.g., Anthropic for image gen) are accepted gaps — the guarantee is per-capability, not per-vendor.

#### 3.5.1 Capability surface — `AIModelType` rows in MJ today

Source: `AIModelType` seed data in [migrations/v5/B202602151200__v5.0__Baseline.sql:110410-110416](migrations/v5/B202602151200__v5.0__Baseline.sql#L110410) plus base provider classes under [packages/AI/Core/src/generic/](packages/AI/Core/src/generic/).

| `AIModelType.Name` (literal) | Base provider class | Default modality (in → out) | Notes |
|---|---|---|---|
| **`LLM`** | [`BaseLLM`](packages/AI/Core/src/generic/baseLLM.ts) | Text → Text | Most heavily used capability |
| **`Embeddings`** | [`BaseEmbeddings`](packages/AI/Core/src/generic/baseEmbeddings.ts) | Text → Embedding | Used by vector / semantic-search paths |
| **`Reranker`** | [`BaseReranker`](packages/AI/Core/src/generic/baseReranker.ts) | Text → Text (reordering) | Two-stage retrieval improvement |
| **`Image Generator`** | [`BaseImageGenerator`](packages/AI/Core/src/generic/baseImage.ts) (formerly `BaseDiffusion`, deprecated alias still exported from [baseDiffusion.ts](packages/AI/Core/src/generic/baseDiffusion.ts)) | Text → Image | Renamed from `Diffusion` to `Image Generator` in the multi-modal migration |
| **`TTS`** | [`BaseAudioGenerator.CreateSpeech`](packages/AI/Core/src/generic/baseAudio.ts) | Text → Audio | Renamed from `Audio` in the STT split migration |
| **`STT`** | [`BaseAudioGenerator.SpeechToText`](packages/AI/Core/src/generic/baseAudio.ts) | Audio → Text | New row added in `V202601010001__v2.130.x__Multi_Modal_Chat_Support.sql` |
| **`Video`** | [`BaseVideoGenerator`](packages/AI/Core/src/generic/baseVideo.ts) | Text → Video | Avatar / video translation surface |

`BaseDiffusion` is preserved as a deprecated re-export for backward compatibility — see the file header comment.

#### 3.5.2 Per-capability call-site table

Each capability is enumerated below with every MJ runtime consumer (DBAutoDoc excluded per the §1 banner). For each call site:

- **VENDOR-AGNOSTIC** = selection is purely capability-driven; adding a new capable vendor immediately widens the working set.
- **VENDOR-PINNED** = call site hard-codes a specific vendor name, vendor ID, or driver-class string.
- **MODEL-PINNED** = call site hard-codes a specific model entity (by ID, name, or metadata lookup).

##### Capability: `LLM`

| Call site | Status | Notes |
|---|---|---|
| [packages/AI/Prompts/src/AIPromptRunner.ts:585](packages/AI/Prompts/src/AIPromptRunner.ts#L585) `ExecutePrompt` | VENDOR-AGNOSTIC | Reference impl — multi-source candidate ranking + cross-vendor failover. |
| [packages/AI/Engine/src/AIEngine.ts:739-793](packages/AI/Engine/src/AIEngine.ts#L739) `PrepareLLMInstance` / `SimpleLLMCompletion` | VENDOR-AGNOSTIC at selection (`GetHighestPowerLLM(undefined, …)` accepts any LLM vendor) but **single-vendor at execution** — no failover (G1, G2). |
| [packages/AI/Engine/src/AIEngine.ts:809-849](packages/AI/Engine/src/AIEngine.ts#L809) `ParallelLLMCompletions` | VENDOR-AGNOSTIC at selection, single-vendor per task (G3). |
| [packages/AI/Engine/src/AIEngine.ts:1305-1349](packages/AI/Engine/src/AIEngine.ts#L1305) `ExecuteAIAction` (deprecated) | VENDOR-AGNOSTIC at selection, no failover (G5, latent). |
| [packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:1009-1040](packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts#L1009) `createLLMInstance` | **VENDOR-PINNED** — `vendorToDriverClass` map (anthropic/openai/google/groq/mistral) (G6). |
| [packages/MJServer/src/resolvers/FeedbackResolver.ts:362-365](packages/MJServer/src/resolvers/FeedbackResolver.ts#L362-L365) `categorizeFeedback` | **VENDOR-PINNED** — `find(m => m.DriverClass === 'GroqLLM') \|\| find(m => m.DriverClass === 'OpenAILLM')` (G7). |
| [packages/MJServer/src/resolvers/RunAIPromptResolver.ts:633-661](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L633-L661) `ExecuteSimplePrompt` | VENDOR-AGNOSTIC at selection (`PowerRank` ordered), single-vendor at execution (G8). |
| [packages/Templates/engine/src/extensions/AIPrompt.extension.ts:128](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L128) Nunjucks `{% AIPrompt %}` | **VENDOR-PINNED** — `GetHighestPowerModel('Groq', 'llm', …)` literal (G15). Default override returns `'OpenAI'` literal at line 170. |
| [packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts:298-321](packages/AI/MJComputerUse/src/engine/MJComputerUseEngine.ts#L298-L321) `selectModel` | VENDOR-AGNOSTIC at selection (`GetHighestPowerLLM(undefined, …)`), executes through `AIPromptRunner` (G24, OK at runtime). |
| [packages/AI/Prompts/src/ParallelExecutionCoordinator.ts:546-613](packages/AI/Prompts/src/ParallelExecutionCoordinator.ts#L546-L613) per-task LLM call | VENDOR-AGNOSTIC at selection, single-vendor per parallel task (G16). |
| [packages/React/test-harness/src/lib/component-runner.ts:1984](packages/React/test-harness/src/lib/component-runner.ts#L1984) | VENDOR-AGNOSTIC at selection; transitively HARD via `SimpleLLMCompletion` (G25). |
| [packages/AI/AICLI/src/services/PromptService.ts:130](packages/AI/AICLI/src/services/PromptService.ts#L130) | **VENDOR-PINNED (cosmetic)** — pins `vendorUsed: 'OpenAI'` in the result-metadata payload regardless of actual vendor used. Does not affect selection but misleads downstream telemetry. **NEW** finding. |

##### Capability: `Embeddings`

| Call site | Status | Notes |
|---|---|---|
| [packages/AI/Engine/src/AIEngine.ts:858-921](packages/AI/Engine/src/AIEngine.ts#L858-L921) `EmbedTextLocal` / `LocalEmbeddingModels` filter | **VENDOR-PINNED** — filters by `m.Vendor === 'localembeddings'` literal (G4). The "local" semantics intentionally exclude internet vendors. |
| [packages/AI/Engine/src/AIEngine.ts:902-921](packages/AI/Engine/src/AIEngine.ts#L902-L921) `EmbedText(model)` | MODEL-PINNED at call (caller passes one model), VENDOR-AGNOSTIC at selection of that model's first vendor; single-vendor at execution (G4). |
| [packages/AI/Prompts/src/AIModelRunner.ts:80-244](packages/AI/Prompts/src/AIModelRunner.ts#L80-L244) `RunEmbedding` / `findBestVendor` | MODEL-PINNED (caller supplies `modelID`), VENDOR-AGNOSTIC across that model's vendors at selection, single-vendor at execution (G17, G18). |
| [packages/SearchEngine/src/generic/VectorSearchProvider.ts:166-196](packages/SearchEngine/src/generic/VectorSearchProvider.ts#L166-L196) `embedQueryAndSearch` | MODEL-PINNED (`embeddingModelID` from index metadata), single-vendor at execution (G9). |
| [packages/AI/Vectors/Sync/src/models/entityVectorSync.ts:580-619](packages/AI/Vectors/Sync/src/models/entityVectorSync.ts#L580-L619) | MODEL-PINNED per `EntityDocument`, single-vendor at execution (G10). |
| [packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts:26](packages/AI/Vectors/Sync/src/models/workers/VectorizeTemplates.ts#L26) worker | MODEL-PINNED, single-vendor (G11). |
| [packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts:501-548](packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts#L501-L548) `InitializeProviders` | MODEL-PINNED, single-vendor (G12). |
| [packages/AI/Knowledge/TagEngine/src/TagEngine.ts:301-334](packages/AI/Knowledge/TagEngine/src/TagEngine.ts#L301-L334) `embedBatchDirect` | MODEL-PINNED (re-uses tracked `modelInfo.DriverClass`), single-vendor (G13). |
| [packages/MJServer/src/resolvers/RunAIPromptResolver.ts:469-485](packages/MJServer/src/resolvers/RunAIPromptResolver.ts#L469-L485) `selectEmbeddingModelBySize` + `GenerateEmbeddings` mutation | VENDOR-PINNED (filters `Vendor === 'localembeddings'` via `LocalEmbeddingModels`) and single-vendor at execution (G19). |
| [packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:1605-1614](packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L1605-L1614) `createEmbeddingInstance` | MODEL-PINNED, single-vendor (G20). |
| [packages/QueryGen/src/vectors/EmbeddingService.ts:46-48](packages/QueryGen/src/vectors/EmbeddingService.ts#L46-L48), [packages/Actions/CoreActions/src/custom/data/search-query-catalog.action.ts:75](packages/Actions/CoreActions/src/custom/data/search-query-catalog.action.ts#L75), [packages/AI/Engine/src/services/ActionEmbeddingService.ts](packages/AI/Engine/src/services/ActionEmbeddingService.ts), [packages/AI/Engine/src/services/AgentEmbeddingService.ts](packages/AI/Engine/src/services/AgentEmbeddingService.ts), [packages/MJCoreEntitiesServer/src/custom/util.ts:10-15](packages/MJCoreEntitiesServer/src/custom/util.ts#L10-L15) `EmbedTextLocalHelper` and its 4 callers (G27-G31) | All transit `EmbedTextLocal` (G4) → **VENDOR-PINNED** to `LocalEmbeddings` (G32, G33, G34). |

##### Capability: `Reranker`

| Call site | Status | Notes |
|---|---|---|
| [packages/AI/Reranker/src/RerankerService.ts:135-265](packages/AI/Reranker/src/RerankerService.ts#L135-L265) `getReranker` + `getModelDriverInfo` | MODEL-PINNED (caller supplies `modelID`), VENDOR-AGNOSTIC across that model's vendors at selection (with the inverted-priority bug — I1), single-vendor at execution (G14). |
| [packages/AI/Reranker/src/LLMReranker.ts:213](packages/AI/Reranker/src/LLMReranker.ts#L213) | VENDOR-AGNOSTIC — uses `AIPromptRunner.ExecutePrompt`. The "reranker via LLM" alternate path correctly inherits failover. |

##### Capability: `Image Generator`

| Call site | Status | Notes |
|---|---|---|
| [packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts:228-296](packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts#L228-L296) `prepareImageGenerator` (action `Generate Image`) | VENDOR-AGNOSTIC at selection — filters `m.AIModelType === 'image generator' && m.IsActive`, picks highest `PowerRank`, picks the **first** active `ModelVendor` with a `DriverClass`. **Single-vendor at execution, no failover.** **NEW gap** (was not in §3.1 because the search pattern was scoped to `BaseLLM\|BaseEmbeddings\|BaseModel\|BaseReranker\|BaseImage`, and this file uses the more recent `BaseImageGenerator` class name, which `BaseImage` matches as a prefix only via the `baseImage.ts` filename — the audit's `rg` pattern `BaseImage` does match in `entity_subclasses.ts` exports but the `ClassFactory` instantiation here was not surfaced in the original 14-file count.) |

There are **no other MJ runtime consumers** of `BaseImageGenerator` outside of `packages/AI/Providers/{OpenAI,Gemini,BlackForestLabs}/`.

##### Capability: `TTS` (Text-to-Speech)

| Call site | Status | Notes |
|---|---|---|
| _(none in MJ runtime)_ | — | No code in `packages/` outside of `packages/AI/Providers/{OpenAI,ElevenLabs}/` instantiates `BaseAudioGenerator.CreateSpeech`. The capability is declared in the data model and providers ship implementations, but **no MJ feature consumes it today.** |

##### Capability: `STT` (Speech-to-Text)

| Call site | Status | Notes |
|---|---|---|
| _(none in MJ runtime)_ | — | Same situation as TTS. `BaseAudioGenerator.SpeechToText` exists in the providers but no MJ feature calls it. |

##### Capability: `Video`

| Call site | Status | Notes |
|---|---|---|
| _(none in MJ runtime)_ | — | `BaseVideoGenerator` is implemented by `packages/AI/Providers/HeyGen/` only. No MJ feature consumes it. |

#### 3.5.3 Vendor support matrix

Source: which provider packages under [packages/AI/Providers/](packages/AI/Providers/) ship `@RegisterClass`-decorated subclasses of each base class.

|  | LLM | Embeddings | Reranker | Image Gen | TTS | STT | Video |
|---|---|---|---|---|---|---|---|
| **OpenAI** | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| **Anthropic** | ✓ | — | — | — | — | — | — |
| **Gemini** (Google) | ✓ | — | — | ✓ | — | — | — |
| **Vertex** (Google) | ✓ | — | — | — | — | — | — |
| **Azure** | ✓ | ✓ | — | — | — | — | — |
| **Bedrock** (AWS) | ✓ | ✓ | — | — | — | — | — |
| **Mistral** | ✓ | ✓ | — | — | — | — | — |
| **Ollama** | ✓ | ✓ | — | — | — | — | — |
| **Groq** | ✓ | — | — | — | — | — | — |
| **xAI** | ✓ | — | — | — | — | — | — |
| **Cerebras** | ✓ | — | — | — | — | — | — |
| **Fireworks** | ✓ | — | — | — | — | — | — |
| **OpenRouter** | ✓ | — | — | — | — | — | — |
| **LMStudio** | ✓ | — | — | — | — | — | — |
| **MiniMax** | ✓ | — | — | — | — | — | — |
| **Zhipu** | ✓ | — | — | — | — | — | — |
| **BettyBot** | ✓ | — | — | — | — | — | — |
| **LocalEmbeddings** | — | ✓ | — | — | — | — | — |
| **Cohere** | — | — | ✓ | — | — | — | — |
| **BlackForestLabs** | — | — | — | ✓ | — | — | — |
| **ElevenLabs** | — | — | — | — | ✓ | ✓ (via SpeechToText) | — |
| **HeyGen** | — | — | — | — | — | — | ✓ |

✓ = provider package ships an `@RegisterClass`-decorated subclass of the relevant base. — = none in this provider package. The `Bundle` and `Recommendations-Rex` provider packages ship no model providers (they are aggregators / placeholders).

`BettyBot` is an internal/legacy LLM driver. `STT` for `OpenAI` is implemented through `OpenAIAudioGenerator` (Whisper).

#### 3.5.4 Per-capability post-Phase-5 verdict

For each capability, given the change list in §6 (items 1-35) and the proposed `ModelResolver` (§5.2), the user's per-capability sufficiency guarantee is evaluated below.

| Capability | Verdict | Reason |
|---|---|---|
| **LLM** | **SATISFIED** | After items 1-8 (Phase 1 Foundation), 11 (G7 FeedbackResolver), 12 (G8/G19 RunAIPromptResolver), 14 (G6 ComputerUseEngine), 15-16 (G15 Templates `{% AIPrompt %}` + DefaultAIVendorName), 27-28 (G2/G3 SimpleLLMCompletion / ParallelLLMCompletions), and 34 (G16 ParallelExecutionCoordinator), every LLM call site routes through `ModelResolver.resolveForRequirements({ modelTypeName: 'LLM', … })` + `ModelResolver.withFailover(…)`. No remaining hard-coded vendor strings on the live path. |
| **Embeddings** | **SATISFIED with one caveat** | Items 9 (G17/G18 AIModelRunner), 13 (`GenerateEmbeddings` mutation), 17 (G9 VectorSearchProvider), 18 (G10 entityVectorSync), 19 (G11 worker), 20 (G12 Dupe), 21 (G13 TagEngine), 22 (G20 AutotagBaseEngine) cover all embeddings consumers. **Caveat**: `EmbedTextLocal` (G4) is intentionally pinned to `LocalEmbeddings` for the local-only path; this is by design (offline / privacy) but means semantic-search consumers G27-G34 still fail when no LocalEmbeddings model is configured *and* the deployment only has cloud embedding vendors. Item 29 adds an optional `failover: boolean` to `EmbedText` but does not redefine `EmbedTextLocal`. **Sub-verdict**: SATISFIED for arbitrary embeddings; NOT SATISFIED for the specific "local-only" semantic search variant unless we add change item 36 below. |
| **Reranker** | **SATISFIED** | Item 10 rewrites `RerankerService.getReranker` to use `ModelResolver.resolveForRequirements({ modelTypeName: 'Reranker', modelId })` + `withFailover`. Item 32 fixes the inverted priority direction (subsumed by item 10). Any Cohere — or future Voyage / Jina / Mixedbread — reranker that ships an `@RegisterClass(BaseReranker, …)` will be picked up automatically. |
| **Image Generator** | **NOT SATISFIED** | The §6 change list has no item for `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts:228-296`. After Phase 5 the action still picks a single `ModelVendor` and instantiates one `BaseImageGenerator` with no failover. With OpenAI (DALL·E), Gemini (Imagen), and BlackForestLabs (Flux) all available, the user's guarantee — "any single configured image-gen vendor sufficient" — is partially met (selection *is* capability-driven; it filters by `AIModelType === 'image generator'`) but execution is single-vendor: a transient OpenAI outage breaks the action even when Gemini/BlackForestLabs are configured. **Add change item 37 below.** |
| **TTS** | **VACUOUSLY SATISFIED** | No MJ consumer exists today. The data-model column / provider class are present but not wired to any feature. Once a consumer is built it must use `ModelResolver.resolveForRequirements({ modelTypeName: 'TTS' })` from day one. **Add change item 38 below as a forward-looking guard rail** (to prevent recreating the `Generate Image` pattern). |
| **STT** | **VACUOUSLY SATISFIED** | Same as TTS. |
| **Video** | **VACUOUSLY SATISFIED** | Same as TTS. Only HeyGen ships a provider — there is no concept of vendor failover yet because there is only one vendor; this becomes a real concern when a second video vendor is added. |

#### 3.5.5 Additional change-list items to satisfy the per-capability guarantee

Continuing the numbering from §6 (items 1-35):

36. **`packages/AI/Engine/src/AIEngine.ts:858-921` `EmbedTextLocal` / semantic-search consumers** — Add an optional second-pass fallback inside `EmbedTextLocal`: if no `LocalEmbeddings` model is configured *or* the local embedding fails, fall back to `ModelResolver.resolveForRequirements({ modelTypeName: 'Embeddings' })` and use the highest-priority cloud embedding vendor. Document the dimensionality-mismatch caveat (a search-time embedding only matches an index built with the same model). Required so G27-G34 (the Helper-driven semantic-search paths) inherit cross-vendor resilience under the user's guarantee. Fixes the only remaining gap in **Embeddings**.

37. **`packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts:228-296` `prepareImageGenerator`** — Replace the manual model + vendor pick with `ModelResolver.resolveForRequirements({ modelTypeName: 'Image Generator' })`. Wrap the per-image generation call in `ModelResolver.withFailover(candidates, async (c) => generator.GenerateImage(genParams))` so that if OpenAI's `images.generate` returns 429 or 5xx, the action falls through to Gemini's Imagen or BlackForestLabs' Flux automatically. Required to satisfy **Image Generator**. Also delete the redundant `vendor.Name` API-key fallback at lines 278-284 (the new resolver's credential hierarchy supersedes it).

38. **Forward-looking guard rail for TTS / STT / Video** — When the first consumer of `BaseAudioGenerator` or `BaseVideoGenerator` is built (whether in `Actions/CoreActions/`, in `MJServer/resolvers/`, or elsewhere), it must route through `ModelResolver.resolveForRequirements({ modelTypeName: 'TTS' \| 'STT' \| 'Video' })` + `ModelResolver.withFailover(…)`. Add an **eslint rule or a CI grep gate** that flags any `MJGlobal.Instance.ClassFactory.CreateInstance<BaseAudioGenerator>` / `<BaseVideoGenerator>` outside of `packages/AI/Providers/` and outside of `packages/AI/ModelResolver/`. This prevents a future PR from re-introducing the `Generate Image` pattern. Same rule should retroactively cover `BaseImageGenerator`, `BaseLLM`, `BaseEmbeddings`, `BaseReranker` to lock in the post-Phase-5 invariant.

39. **`MJ: AI Prompts.FailoverStrategy` CHECK constraint cleanup** — The CHECK constraint on this column has each option listed twice. The generated TypeScript type signature is the visible symptom:
    ```ts
    get FailoverStrategy(): 'NextBestModel' | 'NextBestModel' | 'None' | 'None' | 'PowerRank' | 'PowerRank' | 'SameModelDifferentVendor' | 'SameModelDifferentVendor'
    ```
    Add a one-shot migration that drops the duplicated CHECK clauses, leaving exactly one of each enum literal, then run CodeGen so the generated entity type collapses to `'None' | 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank'`. Surfaced by AN-BC during PR review of this spec — bundled into the same release as Phase 1 since `ModelResolver` switches on this field and the duplicated literals make the TypeScript exhaustiveness check on the discriminated union confusing.

#### 3.5.6 Vendor-pinning inventory (cross-cutting)

Cross-cutting list of every place in the **MJ runtime** (DBAutoDoc out of scope per the §1 banner; tests excluded) that pins to a specific vendor name, vendor ID, model name, or driver-class string. Each entry is marked **IN GAP LIST** (already cited as G#) or **NEW** (newly surfaced by this §3.5 sweep).

| Site | Pin type | Status |
|---|---|---|
| [packages/Templates/engine/src/extensions/AIPrompt.extension.ts:128](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L128) | Vendor name `'Groq'` | IN GAP LIST (G15) |
| [packages/Templates/engine/src/extensions/AIPrompt.extension.ts:170](packages/Templates/engine/src/extensions/AIPrompt.extension.ts#L170) `DefaultAIVendorName` | Vendor name `'OpenAI'` | IN GAP LIST (G15, change item 16) |
| [packages/MJServer/src/resolvers/FeedbackResolver.ts:362-365](packages/MJServer/src/resolvers/FeedbackResolver.ts#L362-L365) | Driver class `'GroqLLM'`, `'OpenAILLM'` | IN GAP LIST (G7) |
| [packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts:1010,1030-1040](packages/AI/ComputerUse/src/engine/ComputerUseEngine.ts#L1010) `vendorToDriverClass` | Vendor→driver map (anthropic/openai/google/groq/mistral) | IN GAP LIST (G6) |
| [packages/AI/Engine/src/AIEngine.ts:858-867](packages/AI/Engine/src/AIEngine.ts#L858-L867) `LocalEmbeddingModels` filter | Vendor name `'localembeddings'` (intentional but propagates) | IN GAP LIST (G4) — addressed by change item 36 |
| [packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts:228-296](packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts#L228-L296) | Single-vendor pick from a model's `ModelVendors` array (no failover) | **NEW** — addressed by change item 37 |
| [packages/AI/AICLI/src/services/PromptService.ts:130](packages/AI/AICLI/src/services/PromptService.ts#L130) | Hardcoded `vendorUsed: 'OpenAI'` in result-metadata payload | **NEW** (cosmetic — does not affect selection but misleads telemetry; one-line fix during item 12 retrofit) |

`packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts:1167` (`item.DriverClass === driverClass`) is a runtime equality compare against a parameter, not a hard-coded literal — not a pinning site.

`packages/DBAutoDoc/src/utils/llm-factory.ts` (G22, G23, change items 24-25) remains explicitly **out of scope** per the §1 banner.

#### 3.5.7 Provider & model registration consistency

The §3.5.3 vendor matrix above checks the **provider package layer** — does each `packages/AI/Providers/<vendor>/` ship `@RegisterClass`-decorated subclasses for each capability. That's necessary for `ModelResolver` to consider a vendor at all, but it isn't sufficient for the per-capability sufficiency guarantee. There is a second consistency layer to audit: the **metadata layer** — for each shipped provider, are the actual `MJ: AI Models` and `MJ: AI Model Vendors` rows in place that wire that provider's catalog into the runtime?

Why both layers matter:
- The provider package layer answers: *can MJ instantiate this driver class at all?*
- The metadata layer answers: *does any selectable `(model, vendor)` candidate row exist for `ModelResolver.resolveForRequirements` to return?*

A new vendor is only operationally useful when both layers are populated. Today there is no enforced consistency between them — a provider package can ship while no `AIModel` rows for its catalog exist, or `AIModel` rows can reference a `DriverClass` whose provider package was removed. Symptoms today:
- New vendors land in metadata as a `MJ: AI Vendors` row + a few `MJ: AI Models` for headline models, but the long tail of models that vendor publishes (especially fast-moving rosters like Bedrock and Gemini) is filled in opportunistically when someone needs it.
- The metadata seed file `metadata/ai-models/.ai-models.json` is the source of truth; there is no automated cross-check that every model a vendor's API exposes has a corresponding row, nor that every `AIModelVendor.DriverClass` value matches a class actually registered in the provider package layer.

**Concrete recently-added vendors to check** (input requested from reviewers — see PR description for tagged owners):

| Vendor | Provider package shipped? | Headline `AIModel` rows present? | `AIModelVendor` rows present? | Long-tail models (smaller / older / regional / fine-tunes) covered? |
|---|---|---|---|---|
| **Bedrock** (AWS) | ✓ ([packages/AI/Providers/Bedrock/](packages/AI/Providers/Bedrock/)) | Needs spot-check (Claude family, Llama, Titan, Cohere-on-Bedrock, Mistral-on-Bedrock) | Needs spot-check that `DriverClass='BedrockLLM'` rows are paired with each model | Needs reconciliation against `aws bedrock list-foundation-models` |
| **Gemini** (Google) | ✓ ([packages/AI/Providers/Gemini/](packages/AI/Providers/Gemini/)) | Needs spot-check (Gemini 2.5 Pro / Flash / Flash-Lite, Gemini 3 Flash, embedding model) | Needs spot-check that `DriverClass='GeminiLLM'` rows are paired with each model + that ImageGenerator coverage exists for Imagen | Needs reconciliation against `https://ai.google.dev/gemini-api/docs/models` |
| **Vertex** (Google) | ✓ ([packages/AI/Providers/Vertex/](packages/AI/Providers/Vertex/)) | Needs spot-check — overlaps with Gemini for Google models but routed through Vertex's separate API surface | Needs spot-check that any model offered both via Gemini API and Vertex has rows for both vendors | Long-tail (PaLM, MedLM, etc.) likely incomplete |
| **Bundle / Recommendations-Rex** | aggregator packages, no provider classes | n/a | n/a | n/a |

Older providers (OpenAI, Anthropic, Groq, Cerebras, etc.) are well-covered because they have been the active consumers; the audit is mainly to ensure newer additions don't drift into a "ships but not selectable" state.

**Recommended change items** (Phase 5 housekeeping; not blocking for ModelResolver extraction but should land before the Phase-5 CI guard rail in item 38 fires):

40. **Vendor-roster reconciliation tool** — add a one-off `scripts/audit-model-vendor-rows.ts` that, for each provider package under `packages/AI/Providers/`, lists the registered driver classes and cross-checks against `MJ: AI Model Vendors` rows referencing the same `DriverClass`. Output is a markdown table of (a) `DriverClass`-with-no-rows (provider shipped but unwired) and (b) `DriverClass`-rows-with-no-class (rows pointing to a removed provider). Run it as part of `npm run mj:manifest` so future drift is caught at build time.

41. **Bedrock and Gemini metadata reconciliation pass** — manual spot-check (and bulk-add via mj-sync) of the model rows currently missing for these two vendors specifically. Bedrock and Gemini were called out by reviewers as the most likely places where the runtime is missing entries.

42. **Provider-package registration tests** — for each `packages/AI/Providers/<vendor>/` add a `__tests__/registration.test.ts` that asserts the expected base classes (`BaseLLM`, `BaseEmbeddings`, etc.) have a matching `@RegisterClass` registration with the expected driver class name. Catches the dead-import landmine pattern (G21) at unit-test time instead of at runtime.

#### 3.5.8 `MJAIPromptEntity.FailoverStrategy` is the prompt designer's escape hatch — must be preserved

AN-BC raised this explicitly during PR review, and it bears calling out at the audit level: the per-prompt `FailoverStrategy` field is **not** just one of several knobs `ModelResolver` exposes — it is the **escape hatch** that lets a prompt designer say "I want this to hard-fail, not silently degrade onto a model the configuration doesn't endorse." The Skip-style use case is the canonical example: a configuration enumerates a curated set of acceptable-quality models in `MJ: AI Prompt Models`; if none of those specific models are available the desired behavior is a hard error so the configuration gets fixed, *not* a silent fallback to whatever else the deployment happens to have credentials for.

**Hard requirements on `ModelResolver` (carried through into Phase 1 spec §`withFailover` semantics):**

1. `failoverStrategy: 'None'` MUST stop after the first candidate fails. No vendor-shopping, no model-shopping, no retry beyond the in-flight attempt's own retry budget.
2. `failoverStrategy: 'SameModelDifferentVendor'` MUST never substitute a *different* model — if the prompt's enumerated models cannot resolve, the call fails. Cross-vendor failover is allowed only within the same `AIModel.ID`.
3. `failoverStrategy: 'NextBestModel'` is the only strategy that may walk to a different model row — and even there, the prompt-level `RequireSpecificModels` flag (when set) restricts the candidate pool to models enumerated on `MJ: AI Prompt Models` for that prompt.
4. `withFailover` callers (Phase 2-5 retrofit sites) MUST pass through the prompt's strategy verbatim — no silent upgrade from `'None'` to `'SameModelDifferentVendor'` "for resilience." If a non-prompt caller (e.g., `RerankerService`) has no `AIPrompt` to read from, the default for non-prompt callers is `'SameModelDifferentVendor'` (not `'None'`), explicitly distinguishing prompt-driven hard-fail-by-design from infrastructure resilience for capabilities that have no prompt.

These are essentially restating §2.1's existing runner behavior — but in the audit because the post-extraction `ModelResolver` now becomes the canonical surface that every retrofit site sees, and conformance to these semantics is a non-negotiable acceptance criterion for Phase 1.

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
24. **~~`packages/DBAutoDoc/src/utils/llm-factory.ts:14-77`~~** — **OUT OF SCOPE**. DBAutoDoc is a standalone CLI tool that does not share the `AIPromptRunner` runtime. If DBAutoDoc later wants failover, it can adopt the published `ModelResolver` independently — no MJ-side change needed.
25. **~~`packages/DBAutoDoc/src/discovery/LLMDiscoveryValidator.ts:32-80`~~** — **OUT OF SCOPE**, same reason as item 24.

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
