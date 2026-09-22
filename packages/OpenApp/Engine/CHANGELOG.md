# @memberjunction/open-app-engine

## 6.1.3

### Patch Changes

- Updated dependencies [7cdf2cc]
- Updated dependencies [3707f26]
- Updated dependencies [5e937c4]
  - @memberjunction/core@6.1.3
  - @memberjunction/core-entities@6.1.3
  - @memberjunction/global@6.1.3
  - @memberjunction/sql-dialect@6.1.3

## 6.1.2

### Patch Changes

- Updated dependencies [e1a8894]
  - @memberjunction/core-entities@6.1.2
  - @memberjunction/core@6.1.2
  - @memberjunction/global@6.1.2
  - @memberjunction/sql-dialect@6.1.2

## 6.1.1

### Patch Changes

- Updated dependencies [f219477]
  - @memberjunction/core@6.1.1
  - @memberjunction/core-entities@6.1.1
  - @memberjunction/global@6.1.1
  - @memberjunction/sql-dialect@6.1.1

## 6.1.0

### Minor Changes

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

### Patch Changes

- 8643a3d: `DownloadMigrations` fetches what skyway will actually run, and an empty download fails instead of passing.

  Two defects in the same function. It listed the migrations directory **non-recursively**, while the local scanner (`RuntimeSchemaManager.collectFilesRecursively`) walks the tree — so a migration in a subdirectory applied correctly under a local `mj migrate`, was never downloaded to a host, and both sides reported success. The walk now mirrors the scanner, preserves each file's path relative to the migrations root (flattening `file.name` would let two same-named migrations in different subdirectories overwrite each other), and is bounded to 6 levels so a pathological tree cannot be walked forever.

  Second, zero `.sql` files returned `Success: true, Files: []`. This function is only reached because a manifest declared a migrations directory, so an empty download is a defect — and treating it as success let an install proceed past the migration phase, record the app as installed, and leave the host with an empty schema and a green result. It now fails with a message naming `migrations.directory` in `mj-app.json` and the ref that was searched.

- 6bb2e1f: Fix Open App registration and migrations under pnpm (#3677). server-bootstrap now resolves runtime-configured packages (`dynamicPackages.server[]`, `codeGeneration.packages`) from the host application when a bare import cannot — pnpm's strict layout resolves bare specifiers from the importing package, which cannot declare runtime-known names. open-app-engine now declares the skyway packages as optionalDependencies so app migrations resolve them in every topology; a resolved provider's own load/constructor errors are no longer misreported as "provider not found".
- 394d276: Open App migrations run per-migration by default, and the mode is now selectable

  `RunAppMigrations` built its Skyway config without ever setting `TransactionMode`, and the
  option was declared only on the module's internal Skyway config shape — never on the public
  `MigrationRunOptions`. No caller could select a mode, so Open App installs always fell
  through to Skyway's `per-run` default: one transaction wrapping the entire pending set.

  Two changes:
  - `MigrationRunOptions` accepts `TransactionMode?: 'per-run' | 'per-migration'`, threaded onto
    the config handed to Skyway.
  - The default is now **`per-migration`** — each migration file runs and commits in its own
    transaction. `per-run` remains available opt-in.

  This aligns app installs with `mj migrate`, which MJCLI already defaults to `per-migration`;
  the two paths previously had silently different transaction semantics.

  The reason the default matters: `per-run` cannot host every valid migration set. SQL Server
  cannot create a table type and instantiate a variable of that type in the same transaction —
  the `CREATE TYPE` holds a schema-modification lock while TVP instantiation, which runs in a
  nested system transaction that does not share the session's lock ownership, requests
  schema-stability on the same type, so the session deadlocks against itself (error 1205).
  Minimal reproduction, no MemberJunction involved:

  ```sql
  BEGIN TRAN;
      CREATE TYPE dbo.IDList AS TABLE (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
  GO
      DECLARE @ids dbo.IDList;   -- Msg 1205
  GO
  COMMIT;
  ```

  On a from-zero install every migration is pending, so under `per-run` the whole app is one
  transaction and no arrangement of migration files avoids this — making a table type, a
  standard T-SQL construct, impossible to ship. It surfaces only on a clean install, never on an
  incremental development database where the type was committed by an earlier run.

  Note on failure semantics: under `per-migration`, a set that fails partway leaves earlier
  migrations committed and recorded in the app's history table. Undoing a failed install is
  therefore the orchestrator's responsibility rather than the database's.

- 50860ad: Fix `spRebindLayeredOuterView` on PostgreSQL, which could never restar a layered outer view. It shipped with an undeclared `v_starred` variable — PL/pgSQL compiles the whole body on first call, so every invocation failed, including the `spRebindLayeredOuterViewsInSchema` call Open App's metadata refresh issues first in its batch (aborting the field-heal statements behind it). Removing that dead write exposed a second defect: single-argument `btrim()` strips spaces but not newlines, and `pg_get_viewdef` pretty-prints, so the SELECT-item scan stopped after one column and rebuilt the view as `SELECT g.*, <every inner column again>` — rejected as `column ... specified more than once`. Both are corrected in a new pg-only migration. Also makes integration checks LBV2–LBV5 run on PostgreSQL instead of silently skipping while still scoring as passed.
- 647bd71: Enable layered base views on PostgreSQL. CodeGen writes the inner view and restars the application-owned outer wrapper so `g.*` re-expands after inner regeneration (no more throw). New pg-only migration ships `spRebindLayeredOuterView` plus core MJ inner/outer views. Open App `mj migrate` rebinds layered outers in the app schema before field heal.
- d90a3ea: After each Open App migrate (`mj migrate --schema` and `mj app install`), run the core metadata-heal steps (SQL Server: R\_\_RefreshMetadata members with dependency-ordered view refresh; PostgreSQL: AllowsNull, orphan prune, catalog Sequence). CodeGen inserts new EntityFields at the live BaseView ordinal after parking existing sequences, then `spUpdateExistingEntityFieldsFromSchema` rewrites the entity — Pass 2 after views are current.

  **Superseded in part by #4292**: the "insert at the live BaseView ordinal after parking existing sequences" step was reverted. CodeGen inserts carry an apply-time `MAX(Sequence)` expression and there is no park; the post-migrate heal steps described above are unchanged.

- 49f3592: Fix version resolution and temp-file handling in the Open App engine's GitHub layer.

  `compareSemver` ran `Number()` across the dot-split version string, so any prerelease
  parsed to `NaN` (`1.2.0-beta.1` → `[1, 2, NaN, 1]`) and the comparator returned `NaN` —
  making `Array.prototype.sort` ordering implementation-defined for any tag list containing
  a prerelease, and letting `GetLatestVersion` report an arbitrary tag as the newest version.
  Version parsing, precedence and prerelease detection now come from the `semver` package,
  which was already a dependency of this package and already imported by
  `install/install-orchestrator.ts`. Sorting goes through `semver.rcompare` on the normalized
  core; every version this module returns is normalized by `semver.valid`. That also fixes a
  second-order case the hand-rolled version had: a release tagged `v1.2.3+build.7` was
  returned verbatim, and `1.2.3+build.7` can never equal an installed `1.2.3`, so it read as
  a permanent "update available".

  `GetLatestVersion` now also picks the highest _version_ rather than the first entry in
  GitHub's own order, on both paths: the tag path prefers a stable tag over a prerelease, and
  the releases path sorts by semver precedence instead of taking the most recently _created_
  stable release — which offered a patch backported to an older line as the upgrade target
  for an app already on a newer major. Both paths now exclude prereleases by the version
  STRING, not only by GitHub's `prerelease` flag. That flag is a checkbox a maintainer can
  forget: tag `v2.1.0-rc.1`, leave it unticked, and the releases path offered a release
  candidate as the upgrade target while the tag path correctly said `2.0.0`.

  `ListGitHubReleases` / `ListGitHubTags` were unpaginated at `per_page: 100`. Since GitHub
  returns tags in its own order rather than semver order, a repo that tags many apps could
  hide the newest version past the first page: against the live API, `MemberJunction/Integrations`
  (374 tags) resolved **every** app to `null` before this change. Both now use `octokit.paginate`.

  Pagination is per-REPOSITORY while tag filtering is per-app, so a sweep over several apps
  sharing one repo was paying for the whole paginated walk once per app — measured at 36 HTTP
  requests where 4 suffice, growing with the repo's tag count on every release. `ListGitHubTags`
  now reuses a recently fetched tag list for the same repository (60s TTL, keyed by the resolved
  token so a private repo's tags are never served to a caller who did not supply that token;
  failed fetches are never cached). Live, the same 9-app sweep went from 36 requests / 9.3s to
  4 requests / 1.1s with identical resolved versions. `ClearGitHubTagCache` is exported for
  tests and for a caller that has just pushed a tag.

  The cache holds the IN-FLIGHT PROMISE rather than the settled array, so concurrent lookups
  join one fetch instead of each starting their own — caching the resolved value only helped a
  caller that awaited between apps, which left the saving contingent on `check-updates` being
  a sequential loop in a package this one does not own. `ListGitHubReleases` is memoized on
  the same key and TTL: pagination fixed its silent truncation at 100 but made every call cost
  one request per page, and both `GetLatestVersion` and `ResolveVersionRange` call it. Entries
  are evicted on write (expired first, then oldest, bounded at 64) so the cache cannot grow for
  the life of the process while holding a token in each key.

  When a repository has no repo-wide-versioned release at all, `GetLatestVersion` now returns
  `null` rather than the first release's tag name. Handing back `@memberjunction/connector-nimble-ams@1.3.2`
  as an app's "latest version" — which is what it did — yields a string that can never equal the
  installed version, so it reads as a permanent "update available" pointing at a target
  `mj app upgrade` would act on. Falling through to the tag path resolves to `null` honestly.

  `HandleMigrations` and `HandleTeardown` each created a temp download directory and never
  removed it, leaving a copy of the app's `.sql` migrations in the OS temp dir on every
  install, upgrade, and remove. Both now clean up in a `finally` via a shared best-effort
  helper that warns rather than failing the operation that created the directory.

  `ExtractDeclaredApplicationIds`' third temp directory now uses the same shared helper as the
  other two rather than its own inline `rmSync`, so a cleanup failure is reported instead of
  swallowed.

  `IsPrereleaseVersion` and `ClearGitHubTagCache` are newly exported. `ListGitHubTags` still
  returns tag TEXT (`v1.0.7`) — only the ordering changed. No other public signature changes.

- 394d276: Align zod to ^3.25.0 with the rest of the workspace (was the last ^3.24.3 straggler; the AI SDK family peers on zod ^3.25).
- 394d276: Fix: a failed Open App install now removes everything it wrote, not just its schema

  With migrations applying per-migration, a set that fails partway leaves earlier files
  committed — the database will not undo them, and it cannot: one transaction spanning a whole
  app's migrations is not something SQL Server can always host. The install's all-or-nothing
  guarantee therefore has to be a compensating action.

  `CompensateSchemaOnFailure` previously did one of the three things `RemoveApp` does — it
  dropped the app's schema. Rows the app's seed migrations wrote into the **shared** core schema
  were left orphaned, because dropping the app's own schema cannot reach them.

  It now runs the same three-step sequence `RemoveApp` uses, in the same order:
  1. `RemoveAppEntityMetadata` — the app's entity metadata and the Application rows its
     migrations declared, in the core schema.
  2. `HandleTeardown` — the app's declared `migrations.teardownDirectory` inverse DELETEs,
     which retire what its seed migrations wrote into the shared core schema.
  3. `DropAppSchema` — the app's own schema, which takes its migration history table with it so
     a retry starts from a clean slate rather than resuming a half-applied set.

  Unchanged: compensation still runs only for a schema **this run actually created**, never a
  reused or adopted one. Because the run created it, no other installed app can legitimately
  share it, so no co-tenant check is needed here.

  Every step is best-effort and reported. One failing step does not skip the others (a teardown
  failure must not leave the schema behind), and nothing here turns a failed install into a
  successful one. An app that declares migrations but no `teardownDirectory` now emits an
  explicit warning that rows in the shared core schema may remain, rather than letting a partial
  rollback look complete.

- 23c2521: Close silent-failure gaps in Open App config writes, class registration, and update checks — and
  fix the first real collision the new class-registration diagnostic found.

  `dynamicPackages` idempotency matched the whole config file rather than the target array, so a
  `shared` package — which must be written to both `server` and `client` — had its client insert
  skipped by the server entry written moments earlier. The package never reached
  `dynamicPackages.client`, so its `@RegisterClass` components were tree-shaken out of the browser
  bundle with no error raised anywhere. The check is now scoped to the target array's body.

  Upgrades were add-only, so `mj.config.cjs` converged on the union of every version ever installed
  and a package dropped in v2 kept being bootstrapped. `PruneDynamicPackagesNotInManifest` now runs
  on the upgrade path, after the adds; surviving entries are left byte-identical so an operator's
  `Enabled: false` is not silently reset, keep-sets are per-array, and an entry shape that cannot be
  parsed is a no-op rather than a guess. A renamed `startupExport` is retargeted in place — keying
  only on package name left the old export name in the config forever, and ServerBootstrap then reads
  `mod[StartupExport]`, gets `undefined`, skips it because it is not a function, and still logs
  `(ran <old name>)`. The add-then-prune order is chosen for the failure case: these are two writes
  to the same files with no rollback between them, and adding first leaves that window holding
  (old ∪ new), so a server that restarts mid-upgrade still finds every entry it needs. Pruning first
  would leave a subset of both versions and the app's registrations would vanish.

  `@RegisterClass` passes `priority = 0`, which routes to the auto-increment branch, so a later
  registration always wins — correct for an inheritance chain, silently wrong for two unrelated
  classes colliding on a key. Only `priority > 0` ever warned, so in practice nothing warned.
  `ClassFactory.Register` now warns naming every prior unrelated registration for that
  `(base class, key)` pair, using a new `AreClassesRelated` that compares by name as well as identity
  so a module loaded through two paths does not read as a collision. Registration behavior is
  unchanged; the warning is diagnostic only. Measured over a realistic MJAPI load — 1,318 real
  registrations across 697 `(base, key)` groups — it fires on exactly one pair, with no false
  positives.

  That one pair was a real bug, fixed here. `MJConversationDetailEntityServer` and
  `MJConversationDetailEntityExtended` both registered for `BaseEntity` under
  `'MJ: Conversation Details'` as siblings, each extending the generated entity directly. The server
  package loads last, so it won outright and the Extended class's `Save`/`Delete` permission gate —
  the check that only a conversation's owner may set `UserRating`/`UserFeedback`, and that a
  non-owner without a resource grant cannot write at all — never ran. The gate is explicitly written
  to run server-side (`ProviderType === 'Database'`), which is exactly where it was being shadowed
  out. `MJConversationDetailEntityServer` now extends `MJConversationDetailEntityExtended`, so the
  edit-flag logic and the permission gate compose instead of one replacing the other. The resolved
  class is unchanged; only its base is.

  `mj app check-updates` dropped the per-repo `TokenMap` that `install` and `upgrade` both use, so
  private repos reported "up to date" forever; dropped each app's `Subpath`, so a multi-app repo
  reported a **sibling app's** version as this app's latest; and let one throwing app kill the sweep
  or vanish from a report that still concluded "All apps are up to date". The loop moved into a
  testable `CheckAppsForUpdates` helper with the version lookup injected, and failures are collected
  per app and reported.

  A lookup that returns no version at all is now reported as `Unresolved` — a third outcome, distinct
  from both an update and a failure — and the green "All apps are up to date" line is printed only
  when every app actually produced an answer. Every app in the list is installed, so it resolved from
  a real ref once; finding no version now means the resolver and the repository disagree. This matters
  because `ListGitHubTags` reads a single page of the GitHub tags API: against
  `MemberJunction/Integrations` (374 tags), the scoped `<subpath>@<semver>` tag line for every
  installed connector sits past page 1, so all nine apps resolve to nothing. Without this, scoping the
  lookup by `Subpath` would have traded a wrong-but-obvious answer for a confident false green.
  Pagination itself is fixed separately in #3353, which should land with or before this.

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [1fdd5d0]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [4eb87c5]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/sql-dialect@6.1.0

## 6.1.0-edge.7

### Minor Changes

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [44fca09]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/sql-dialect@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/sql-dialect@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 23c2521: Close silent-failure gaps in Open App config writes, class registration, and update checks — and
  fix the first real collision the new class-registration diagnostic found.

  `dynamicPackages` idempotency matched the whole config file rather than the target array, so a
  `shared` package — which must be written to both `server` and `client` — had its client insert
  skipped by the server entry written moments earlier. The package never reached
  `dynamicPackages.client`, so its `@RegisterClass` components were tree-shaken out of the browser
  bundle with no error raised anywhere. The check is now scoped to the target array's body.

  Upgrades were add-only, so `mj.config.cjs` converged on the union of every version ever installed
  and a package dropped in v2 kept being bootstrapped. `PruneDynamicPackagesNotInManifest` now runs
  on the upgrade path, after the adds; surviving entries are left byte-identical so an operator's
  `Enabled: false` is not silently reset, keep-sets are per-array, and an entry shape that cannot be
  parsed is a no-op rather than a guess. A renamed `startupExport` is retargeted in place — keying
  only on package name left the old export name in the config forever, and ServerBootstrap then reads
  `mod[StartupExport]`, gets `undefined`, skips it because it is not a function, and still logs
  `(ran <old name>)`. The add-then-prune order is chosen for the failure case: these are two writes
  to the same files with no rollback between them, and adding first leaves that window holding
  (old ∪ new), so a server that restarts mid-upgrade still finds every entry it needs. Pruning first
  would leave a subset of both versions and the app's registrations would vanish.

  `@RegisterClass` passes `priority = 0`, which routes to the auto-increment branch, so a later
  registration always wins — correct for an inheritance chain, silently wrong for two unrelated
  classes colliding on a key. Only `priority > 0` ever warned, so in practice nothing warned.
  `ClassFactory.Register` now warns naming every prior unrelated registration for that
  `(base class, key)` pair, using a new `AreClassesRelated` that compares by name as well as identity
  so a module loaded through two paths does not read as a collision. Registration behavior is
  unchanged; the warning is diagnostic only. Measured over a realistic MJAPI load — 1,318 real
  registrations across 697 `(base, key)` groups — it fires on exactly one pair, with no false
  positives.

  That one pair was a real bug, fixed here. `MJConversationDetailEntityServer` and
  `MJConversationDetailEntityExtended` both registered for `BaseEntity` under
  `'MJ: Conversation Details'` as siblings, each extending the generated entity directly. The server
  package loads last, so it won outright and the Extended class's `Save`/`Delete` permission gate —
  the check that only a conversation's owner may set `UserRating`/`UserFeedback`, and that a
  non-owner without a resource grant cannot write at all — never ran. The gate is explicitly written
  to run server-side (`ProviderType === 'Database'`), which is exactly where it was being shadowed
  out. `MJConversationDetailEntityServer` now extends `MJConversationDetailEntityExtended`, so the
  edit-flag logic and the permission gate compose instead of one replacing the other. The resolved
  class is unchanged; only its base is.

  `mj app check-updates` dropped the per-repo `TokenMap` that `install` and `upgrade` both use, so
  private repos reported "up to date" forever; dropped each app's `Subpath`, so a multi-app repo
  reported a **sibling app's** version as this app's latest; and let one throwing app kill the sweep
  or vanish from a report that still concluded "All apps are up to date". The loop moved into a
  testable `CheckAppsForUpdates` helper with the version lookup injected, and failures are collected
  per app and reported.

  A lookup that returns no version at all is now reported as `Unresolved` — a third outcome, distinct
  from both an update and a failure — and the green "All apps are up to date" line is printed only
  when every app actually produced an answer. Every app in the list is installed, so it resolved from
  a real ref once; finding no version now means the resolver and the repository disagree. This matters
  because `ListGitHubTags` reads a single page of the GitHub tags API: against
  `MemberJunction/Integrations` (374 tags), the scoped `<subpath>@<semver>` tag line for every
  installed connector sits past page 1, so all nine apps resolve to nothing. Without this, scoping the
  lookup by `Subpath` would have traded a wrong-but-obvious answer for a confident false green.
  Pagination itself is fixed separately in #3353, which should land with or before this.

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [4eb87c5]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/sql-dialect@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- 8643a3d: `DownloadMigrations` fetches what skyway will actually run, and an empty download fails instead of passing.

  Two defects in the same function. It listed the migrations directory **non-recursively**, while the local scanner (`RuntimeSchemaManager.collectFilesRecursively`) walks the tree — so a migration in a subdirectory applied correctly under a local `mj migrate`, was never downloaded to a host, and both sides reported success. The walk now mirrors the scanner, preserves each file's path relative to the migrations root (flattening `file.name` would let two same-named migrations in different subdirectories overwrite each other), and is bounded to 6 levels so a pathological tree cannot be walked forever.

  Second, zero `.sql` files returned `Success: true, Files: []`. This function is only reached because a manifest declared a migrations directory, so an empty download is a defect — and treating it as success let an install proceed past the migration phase, record the app as installed, and leave the host with an empty schema and a green result. It now fails with a message naming `migrations.directory` in `mj-app.json` and the ref that was searched.

- 50860ad: Fix `spRebindLayeredOuterView` on PostgreSQL, which could never restar a layered outer view. It shipped with an undeclared `v_starred` variable — PL/pgSQL compiles the whole body on first call, so every invocation failed, including the `spRebindLayeredOuterViewsInSchema` call Open App's metadata refresh issues first in its batch (aborting the field-heal statements behind it). Removing that dead write exposed a second defect: single-argument `btrim()` strips spaces but not newlines, and `pg_get_viewdef` pretty-prints, so the SELECT-item scan stopped after one column and rebuilt the view as `SELECT g.*, <every inner column again>` — rejected as `column ... specified more than once`. Both are corrected in a new pg-only migration. Also makes integration checks LBV2–LBV5 run on PostgreSQL instead of silently skipping while still scoring as passed.
- 647bd71: Enable layered base views on PostgreSQL. CodeGen writes the inner view and restars the application-owned outer wrapper so `g.*` re-expands after inner regeneration (no more throw). New pg-only migration ships `spRebindLayeredOuterView` plus core MJ inner/outer views. Open App `mj migrate` rebinds layered outers in the app schema before field heal.
- d90a3ea: After each Open App migrate (`mj migrate --schema` and `mj app install`), run the core metadata-heal steps (SQL Server: R\_\_RefreshMetadata members with dependency-ordered view refresh; PostgreSQL: AllowsNull, orphan prune, catalog Sequence). CodeGen inserts new EntityFields at the live BaseView ordinal after parking existing sequences, then `spUpdateExistingEntityFieldsFromSchema` rewrites the entity — Pass 2 after views are current.
- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/sql-dialect@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 49f3592: Fix version resolution and temp-file handling in the Open App engine's GitHub layer.

  `compareSemver` ran `Number()` across the dot-split version string, so any prerelease
  parsed to `NaN` (`1.2.0-beta.1` → `[1, 2, NaN, 1]`) and the comparator returned `NaN` —
  making `Array.prototype.sort` ordering implementation-defined for any tag list containing
  a prerelease, and letting `GetLatestVersion` report an arbitrary tag as the newest version.
  Version parsing, precedence and prerelease detection now come from the `semver` package,
  which was already a dependency of this package and already imported by
  `install/install-orchestrator.ts`. Sorting goes through `semver.rcompare` on the normalized
  core; every version this module returns is normalized by `semver.valid`. That also fixes a
  second-order case the hand-rolled version had: a release tagged `v1.2.3+build.7` was
  returned verbatim, and `1.2.3+build.7` can never equal an installed `1.2.3`, so it read as
  a permanent "update available".

  `GetLatestVersion` now also picks the highest _version_ rather than the first entry in
  GitHub's own order, on both paths: the tag path prefers a stable tag over a prerelease, and
  the releases path sorts by semver precedence instead of taking the most recently _created_
  stable release — which offered a patch backported to an older line as the upgrade target
  for an app already on a newer major. Both paths now exclude prereleases by the version
  STRING, not only by GitHub's `prerelease` flag. That flag is a checkbox a maintainer can
  forget: tag `v2.1.0-rc.1`, leave it unticked, and the releases path offered a release
  candidate as the upgrade target while the tag path correctly said `2.0.0`.

  `ListGitHubReleases` / `ListGitHubTags` were unpaginated at `per_page: 100`. Since GitHub
  returns tags in its own order rather than semver order, a repo that tags many apps could
  hide the newest version past the first page: against the live API, `MemberJunction/Integrations`
  (374 tags) resolved **every** app to `null` before this change. Both now use `octokit.paginate`.

  Pagination is per-REPOSITORY while tag filtering is per-app, so a sweep over several apps
  sharing one repo was paying for the whole paginated walk once per app — measured at 36 HTTP
  requests where 4 suffice, growing with the repo's tag count on every release. `ListGitHubTags`
  now reuses a recently fetched tag list for the same repository (60s TTL, keyed by the resolved
  token so a private repo's tags are never served to a caller who did not supply that token;
  failed fetches are never cached). Live, the same 9-app sweep went from 36 requests / 9.3s to
  4 requests / 1.1s with identical resolved versions. `ClearGitHubTagCache` is exported for
  tests and for a caller that has just pushed a tag.

  The cache holds the IN-FLIGHT PROMISE rather than the settled array, so concurrent lookups
  join one fetch instead of each starting their own — caching the resolved value only helped a
  caller that awaited between apps, which left the saving contingent on `check-updates` being
  a sequential loop in a package this one does not own. `ListGitHubReleases` is memoized on
  the same key and TTL: pagination fixed its silent truncation at 100 but made every call cost
  one request per page, and both `GetLatestVersion` and `ResolveVersionRange` call it. Entries
  are evicted on write (expired first, then oldest, bounded at 64) so the cache cannot grow for
  the life of the process while holding a token in each key.

  When a repository has no repo-wide-versioned release at all, `GetLatestVersion` now returns
  `null` rather than the first release's tag name. Handing back `@memberjunction/connector-nimble-ams@1.3.2`
  as an app's "latest version" — which is what it did — yields a string that can never equal the
  installed version, so it reads as a permanent "update available" pointing at a target
  `mj app upgrade` would act on. Falling through to the tag path resolves to `null` honestly.

  `HandleMigrations` and `HandleTeardown` each created a temp download directory and never
  removed it, leaving a copy of the app's `.sql` migrations in the OS temp dir on every
  install, upgrade, and remove. Both now clean up in a `finally` via a shared best-effort
  helper that warns rather than failing the operation that created the directory.

  `ExtractDeclaredApplicationIds`' third temp directory now uses the same shared helper as the
  other two rather than its own inline `rmSync`, so a cleanup failure is reported instead of
  swallowed.

  `IsPrereleaseVersion` and `ClearGitHubTagCache` are newly exported. `ListGitHubTags` still
  returns tag TEXT (`v1.0.7`) — only the ordering changed. No other public signature changes.

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 6bb2e1f: Fix Open App registration and migrations under pnpm (#3677). server-bootstrap now resolves runtime-configured packages (`dynamicPackages.server[]`, `codeGeneration.packages`) from the host application when a bare import cannot — pnpm's strict layout resolves bare specifiers from the importing package, which cannot declare runtime-known names. open-app-engine now declares the skyway packages as optionalDependencies so app migrations resolve them in every topology; a resolved provider's own load/constructor errors are no longer misreported as "provider not found".
- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Open App migrations run per-migration by default, and the mode is now selectable

  `RunAppMigrations` built its Skyway config without ever setting `TransactionMode`, and the
  option was declared only on the module's internal Skyway config shape — never on the public
  `MigrationRunOptions`. No caller could select a mode, so Open App installs always fell
  through to Skyway's `per-run` default: one transaction wrapping the entire pending set.

  Two changes:
  - `MigrationRunOptions` accepts `TransactionMode?: 'per-run' | 'per-migration'`, threaded onto
    the config handed to Skyway.
  - The default is now **`per-migration`** — each migration file runs and commits in its own
    transaction. `per-run` remains available opt-in.

  This aligns app installs with `mj migrate`, which MJCLI already defaults to `per-migration`;
  the two paths previously had silently different transaction semantics.

  The reason the default matters: `per-run` cannot host every valid migration set. SQL Server
  cannot create a table type and instantiate a variable of that type in the same transaction —
  the `CREATE TYPE` holds a schema-modification lock while TVP instantiation, which runs in a
  nested system transaction that does not share the session's lock ownership, requests
  schema-stability on the same type, so the session deadlocks against itself (error 1205).
  Minimal reproduction, no MemberJunction involved:

  ```sql
  BEGIN TRAN;
      CREATE TYPE dbo.IDList AS TABLE (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
  GO
      DECLARE @ids dbo.IDList;   -- Msg 1205
  GO
  COMMIT;
  ```

  On a from-zero install every migration is pending, so under `per-run` the whole app is one
  transaction and no arrangement of migration files avoids this — making a table type, a
  standard T-SQL construct, impossible to ship. It surfaces only on a clean install, never on an
  incremental development database where the type was committed by an earlier run.

  Note on failure semantics: under `per-migration`, a set that fails partway leaves earlier
  migrations committed and recorded in the app's history table. Undoing a failed install is
  therefore the orchestrator's responsibility rather than the database's.

- 394d276: Align zod to ^3.25.0 with the rest of the workspace (was the last ^3.24.3 straggler; the AI SDK family peers on zod ^3.25).
- 394d276: Fix: a failed Open App install now removes everything it wrote, not just its schema

  With migrations applying per-migration, a set that fails partway leaves earlier files
  committed — the database will not undo them, and it cannot: one transaction spanning a whole
  app's migrations is not something SQL Server can always host. The install's all-or-nothing
  guarantee therefore has to be a compensating action.

  `CompensateSchemaOnFailure` previously did one of the three things `RemoveApp` does — it
  dropped the app's schema. Rows the app's seed migrations wrote into the **shared** core schema
  were left orphaned, because dropping the app's own schema cannot reach them.

  It now runs the same three-step sequence `RemoveApp` uses, in the same order:
  1. `RemoveAppEntityMetadata` — the app's entity metadata and the Application rows its
     migrations declared, in the core schema.
  2. `HandleTeardown` — the app's declared `migrations.teardownDirectory` inverse DELETEs,
     which retire what its seed migrations wrote into the shared core schema.
  3. `DropAppSchema` — the app's own schema, which takes its migration history table with it so
     a retry starts from a clean slate rather than resuming a half-applied set.

  Unchanged: compensation still runs only for a schema **this run actually created**, never a
  reused or adopted one. Because the run created it, no other installed app can legitimately
  share it, so no co-tenant check is needed here.

  Every step is best-effort and reported. One failing step does not skip the others (a teardown
  failure must not leave the schema behind), and nothing here turns a failed install into a
  successful one. An app that declares migrations but no `teardownDirectory` now emits an
  explicit warning that rows in the shared core schema may remain, rather than letting a partial
  rollback look complete.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0

## 5.50.0

### Patch Changes

- a7dfaf5: fix(open-app): detect the workspace layout and write config to every file a consumer loads (#3270, #3271)

  `mj app install` could complete — or report success — while leaving an app that never actually loads. Two causes, both in the install's `[Packages]` / `[Config]` steps.

  **#3270 — workspace layout.** The installer defaulted to the monorepo paths (`packages/MJAPI`, `packages/MJExplorer`), but `mj install` scaffolds a distribution under `apps/`. Installing onto a host created by MJ's own installer failed with `Could not read package.json at <root>/packages/MJAPI/package.json: ENOENT`, and it failed _after_ schema creation and migrations had committed, leaving the app recorded with `Status='Error'`. Both paths are now probed (`packages/…`, then `apps/…`) via a shared `workspace-paths` module, so a plain `mj app install` works on either layout with no configuration; an explicit `openApps.serverPackagePath` / `clientPackagePath` still wins.

  **#3271 — config write target.** Config edits went to a single file: the server workspace's `mj.config.cjs` when present, else the repo root. But the `dynamicPackages.client` array is consumed by `mj codegen manifest --open-app-client-bootstrap`, which resolves config from the _client_ workspace and so never sees a server-workspace config; and a container / App Service deployment that ships only the root config never sees the `server` entry. Either way the miss is silent: the client bootstrap reports `0 client packages wired` so the app's `@RegisterClass` decorators never fire, and a deployed API loads no server package at all — its GraphQL schema lacks every one of the app's types while `__mj.OpenApp` still reports the app `Active`. All config writes (`dynamicPackages`, `entityPackageName`, `excludeSchemas`) now target **every** `mj.config.cjs` a consumer may load. Entry insertion is idempotent, so a config that already has the entry is unchanged.

  A file that genuinely cannot be edited — most commonly the distribution's `module.exports = require('../../mj.config.cjs')` re-export, which has no object literal to insert into — is now reported as a warning instead of failing the install, since it re-exports the root config that _did_ get written. The install fails only when no config could be updated. `ConfigOperationResult` gains an optional `Warnings` field and the orchestrator surfaces them via `OnWarn`.

- d79dd11: fix(open-app): coerce prerelease host versions to base tuple in the MJ version compatibility gate

  `CheckMJVersionCompatibility` called `semver.satisfies(mjVersion, range)` directly, and semver ranges exclude prerelease versions unless tuple-anchored. Once MJ's Edge prerelease grammar activates (every dev/fast-channel build versioned `X.Y.Z-edge.N`), every dev host would fail `satisfies('6.2.0-edge.3', '>=6.0.0 <7.0.0')` and reject every app install even though the app's range is era-correct.

  The host MJ version is now coerced to its base release tuple (`6.2.0-edge.3` → `6.2.0`) via the new exported `CoerceToBaseVersion` helper before the range check. Base-tuple coercion is used instead of `{ includePrerelease: true }` because semver orders a prerelease below its release: `satisfies('7.0.0-edge.0', '>=6.1.0 <7.0.0', { includePrerelease: true })` is `true`, so a 7-era Edge host would wrongly pass a `<7.0.0` cap — coercion correctly fails it as `7.0.0`.

  Only the host-side gate changes; installed app/dependency version comparison (`CheckDependencyVersionCompatibility`, `IsValidUpgrade`) is untouched (tracked separately in #3310).

- 918563e: Harden the Open App install engine: four independent fixes to install, upgrade and remove.

  **Manifest values can no longer inject code into `mj.config.cjs`.** That file is `require`d — and therefore executed — by every `mj migrate`, `codegen` and build. The config writer built entries by concatenating single-quoted strings, so a manifest-sourced value containing a quote could escape its literal and have arbitrary expressions evaluated on the next `mj` command. Every injected value is now emitted as a fully escaped literal, and the removal/detection regexes accept both quote styles so entries written by earlier versions stay removable. As defence in depth — the config writer is not the only consumer of these values — package names and `schema.entityPackage` must now be valid npm names and `startupExport` a single JavaScript identifier, rejected at manifest validation before any engine code touches them.

  **Schema names are compared case-insensitively at read, fixing Postgres install/remove/reinstall.** PostgreSQL folds unquoted DDL identifiers to lowercase, so a schema declared as `__mj_BizAppsCommon` exists as `__mj_bizappscommon` while stored metadata may carry either casing. Three paths were comparing raw casing: the schema-existence check now tests the canonical name the create path actually produces (raw-casing checks sent Postgres reinstalls into an "already exists" dead end), the legacy `Schema Info` delete filter now matches case-insensitively, and the shared-schema check does too — previously two apps storing different casings of the same schema missed each other, and removing one could cascade-drop a schema the other still lives in. Healing happens at read rather than by rewriting stored rows, so installs that already carry mixed casing are fixed the moment this ships.

  **Removing an app keeps npm dependencies that co-installed apps still declare.** The remove path already computed the other installed manifests for prebundle excludes but never passed them to package removal, so uninstalling one app stripped `package.json` entries a surviving app depends on. Package removal now accepts a retain list, and the orchestrator derives it from every other installed app's server, client and shared package lists.

  **A failed `npm install` during upgrade finalizes the app as Disabled.** The upgrade path wrote `Active` unconditionally even when dependency installation had failed, leaving the server to load packages that were never installed. It now mirrors the install path: finalize `Disabled`, switch the app's dynamic-package entries off so the server loader and client bootstrap skip it, and tell the operator to run `npm install` followed by `mj app enable`.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Minor Changes

- f9f60d7: Fix the v5.46.0 PostgreSQL Open App outage (`column "LastCompletedStep" does not exist` on every `mj app` operation). `V202607090600` added `OpenApp.LastCompletedStep` / `LastCompletedStepTargetVersion` + EntityField metadata on PG but did not bake the CodeGen output, so `__mj."vwOpenApps"` never exposed the columns.

  New migration `V202607101200` is the raw `mj codegen` (PostgreSQL) output against a fresh v5.46-migrated DB (generated with the companion PG-codegen differential fix, so it is the differential emit — ~10 entities — not a 184k full regen). It regenerates the OpenApp base view + CRUD sprocs to expose the two columns, and additionally normalizes drifted seed metadata (SS-style type-names/lengths, timestamp defaults) for a handful of recent PG entities that codegen legitimately corrects. The `EntityFieldValue` inserts for the LastCompletedStep value list are guarded with `WHERE NOT EXISTS` so databases that used the documented "run `mj codegen` after migrating" v5.46 workaround don't get duplicate value-list rows (`EntityFieldValue` has no unique key on `(EntityFieldID, Value)`).

### Patch Changes

- 06a1e44: Make the Open-App metadata teardown dialect-driven with full PostgreSQL parity. The FK-graph cascade in `RemoveAppEntityMetadata` (introduced for SQL Server) now runs on **both SQL Server and PostgreSQL**: identifier quoting comes from the provider's `SQLDialect` (`QuoteSchema`/`QuoteIdentifier`) and the FK-graph catalog query comes from a new `SQLDialect.ForeignKeyGraphSQL(schema)` (SQL Server `sys.foreign_keys`; PostgreSQL `pg_catalog.pg_constraint`, with source-column nullability + composite-FK column-count). Previously PostgreSQL fell back to a hardcoded ~6-entity delete list that **under-deleted** (missing e.g. `RecordChange`), so a used PG app could fail remove/reinstall on a foreign-key violation — that path is now the same complete cascade as SQL Server. The provider-selection gate is `has-a-Dialect` (no longer `!== 'postgresql'`), and only a caller that passes no provider uses the legacy entity-layer fallback. Polymorphic tables are covered via their real single-column `EntityID` FK (nullable → `SET NULL`, NOT-NULL → `DELETE`); the FK-less `RecordID` string half is out of scope (a separate single-record-delete concern).
- 31da520: Open-App teardown review follow-ups. Completes the "Dialect owns it" direction and hardens the seam:
  - **`SQLDialect.AtomicBatchScript(statements)`** (new, SS + PG) now owns the all-or-nothing transaction/session wrapper, so `buildTeardownBatchScript` no longer sniffs `PlatformKey` — the last platform branch leaves the OpenApp engine.
  - `RemoveAppEntityMetadata` is now exported from the package index; a deterministic, self-cleaning **integration suite** (`open-app-teardown-tests.ts`, registered in `run-all.ts`) codifies the used-app remove/reinstall scenario (blocking `RecordChange` + link-less fixed-GUID `Application` → clean teardown → re-create without `PK_Application` collision).
  - `RemoveApp` now passes the context's bound provider (not `undefined`) into `RemoveAppEntityMetadata`, so its metadata reads honor the multi-provider rule instead of the process-global `Metadata`.
  - **PostgreSQL schema-name case-sensitivity** (found via a full PG install → remove lifecycle — the true test of PG parity): PostgreSQL folds unquoted identifiers, so an app whose manifest declares schema `__mj_BizAppsTasks` is created + registered on the `Entity` rows as `__mj_bizappstasks`, while the `OpenApp` record keeps the manifest casing. `RemoveAppEntityMetadata`'s case-sensitive `SchemaName = '…'` therefore matched **zero** entities on PG — the teardown silently cleared nothing yet reported success (masked on SQL Server by case-insensitive collation). The entity lookup, the SchemaInfo cleanup, and `buildRootDoomedPredicate` now compare `LOWER(SchemaName) = LOWER(…)`, so the teardown works on PostgreSQL. Without this, the FK-graph PG "parity" was mechanism-correct but never actually deleted anything for a real CLI-installed app.
  - **Reinstall idempotency** (found via a full install → remove → reinstall lifecycle): `mj app remove` soft-removes (keeps the `OpenApp` row + its `OpenAppDependency` rows), so a reinstall reused that record and the blind dependency insert collided on `UQ_OpenAppDep`. `RecordInstallationAtomically` now clears any pre-existing dependency rows for the app in the same transaction group before re-recording (delete-then-insert, atomic — mirrors the upgrade path). Reinstall of a previously-removed app now succeeds.
  - SQL Server `ForeignKeyGraphSQL` gains `ORDER BY fk.name` (deterministic edge/statement order) and a note that disabled FKs are intentionally included (conservative-safe).
  - Docs corrected to match the has-a-Dialect gate (both dialects run the cascade); the migration-declared-`Application` scan is documented as SQL-Server-only (a PostgreSQL follow-up); `RunFkGraphTeardown`/`RemoveAppEntityMetadata` now warn that the raw-SQL teardown bypasses the `BaseEntity` pipeline (no cache invalidation) for in-process callers; the cross-schema-FK limitation and the downloaded-migrations temp-dir cleanup are addressed.

- bfd0de1: Fix Open-App remove/reinstall teardown. `RemoveAppEntityMetadata` now clears **all** of an entity's FK-dependent `__mj` metadata via a dynamic, FK-graph-driven cascade (enumerated from the live FK graph) instead of a hardcoded shortlist — so removing an app that has been _used_ no longer fails on a foreign-key violation (e.g. an orphaned `RecordChange`). It also deletes the app-owned `Application` rows declared in the app's own migrations (unioned with the existing link-based detection), preventing a `PK_Application_ID` collision when the app is reinstalled. (The cascade is dialect-driven and runs on both SQL Server and PostgreSQL — see the companion changeset for the dialect / PG-parity details.)
- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- 33741fc: Make `mj app` install/upgrade/uninstall resumable and idempotent. The install orchestrator now records its last-completed step (new `OpenApp.LastCompletedStep` and `OpenApp.LastCompletedStepTargetVersion` columns) so a crashed or interrupted run picks up where it left off instead of re-running already-applied steps, and mutex guards prevent concurrent install/upgrade/uninstall operations against the same app from racing each other.
- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/sql-dialect@5.45.1

## 5.45.0

### Patch Changes

- 21e33fe: Move Skip to a client-side Open App and remove server-embedded agent; scope-gate query/view/search resolvers with API-key scope authorization; add credential-store fallback for component registry keys; support Open App in-process lifecycle hooks with interactive prompts.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/sql-dialect@5.45.0

## 5.44.0

### Minor Changes

- 7279819: Fixes PostgreSQL lowercase-schema entity class names breaking mixed-case OpenApp builds.

### Patch Changes

- 6cf6c43: Fix `mj app install` corrupting `mj.config.cjs` (#2975). When inserting a new top-level section (`dynamicPackages` / `entityPackageName`) before the closing brace of `module.exports = { ... }`, the preceding property is now comma-terminated, so a config whose last property is a brace-terminated block (e.g. `openApps: { ... }` with no trailing comma) stays valid JavaScript instead of breaking the next `require('mj.config.cjs')` (the `mj migrate` / `mj codegen` / build steps an install runs). The comma logic is string- and comment-aware so a `//` inside a value like `'http://x'` or braces inside strings are never miscounted. Additionally, every config write (all six add/remove/toggle functions) now passes through a post-write parse guard that compiles the result first and, on any malformed output, fails loudly with the file left untouched — so a bad edit can never silently ship a broken config.
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Minor Changes

- 9200b13: feat(open-app): connector-extraction modality — multi-app repos, in-repo subpath, teardown, and `OpenApp.Subpath`

  Adds the Open-App capabilities needed to ship vendor connectors as installable apps from a single multi-app repo (e.g. `MemberJunction/Integrations`):
  - **Multi-app repos via in-repo subpath** — `mj app install <repo>/<subpath>` resolves a per-app manifest under a subdirectory; scoped-tag version resolution (`<subpath>@<version>`) per app.
  - **`OpenApp.Subpath` column** (migration + CodeGen) persists which in-repo directory an app installed from, so upgrade/remove re-fetch the right manifest.
  - **Remove-time teardown** (`migrations.teardownDirectory`) — retires the rows an app's seed migrations wrote into the shared core schema (`__mj` Integration/IO/IOF/Action), which dropping the app's own schema cannot reach. Platform-aware (`-pg` on Postgres) + subpath-aware.
  - **Array-form `dependencies`** accepted in the manifest (normalized to a record), so apps that ship `dependencies` as an array of `{ name, repository, versionRange }` validate and install.

### Patch Changes

- a95ef89: fix(open-app): `mj app` runtime-load + lifecycle correctness, plus installer/Explorer fixes

  The next-applicable subset of the OpenApp lifecycle audit — runtime-load and install/upgrade/remove correctness — across four packages:
  - **`@memberjunction/open-app-engine`.** Makes an installed Open App actually take effect and the lifecycle reversible/repeatable: installed server packages load at boot from `dynamicPackages.server[]` (and their generated GraphQL resolvers enter the live schema), and installed client packages are recorded in `dynamicPackages.client[]`; install status + reinstall correctness (npm-install failure leaves the app `Disabled` not falsely `Active`; an `Error`-state app is reinstallable; rollback drops only a schema we created; migrations baseline so a `V1` migration is never skipped); atomic upgrade dependency rewrite; and remove data-safety (DB-first ordering, co-tenant shared-schema guard, and metadata cleanup committed in one transaction on PostgreSQL). Also removes an app's **own `Application` row on uninstall** — an app's metadata-sync migration registers an `Application` (fixed UUID) grouping its entities; removal previously left it orphaned, so a reinstall's migration re-`INSERT`ed the same UUID and failed on `PK_Application_ID`. Removal now deletes an Application **wholly owned** by the removed schema (best-effort, after the atomic metadata commit; an Application that also groups other apps' entities, or one with user-added dependents, is left intact and reused). +unit tests.
  - **`@memberjunction/cli`.** The Open App client load mechanism now lives in distributed packages instead of bespoke MJExplorer files. `mj codegen manifest` gains `--open-app-client-bootstrap`: after generating the class-registrations manifest, it appends a managed, idempotent block of side-effect imports — one per installed Open App client package recorded in `dynamicPackages.client[]` — so the apps' `@RegisterClass` decorators run when the client bundle loads. The block is rebuilt on every run, so it tracks install/remove/enable/disable (each of which edits `dynamicPackages.client`). This lets MJExplorer drop its hand-written `ensure-open-app-bootstrap.mjs` script, the separate generated bootstrap file, and the extra `app.module.ts` import — keeping the app paper-thin (changes there don't auto-distribute like npm packages). +unit tests for the pure block transform.
  - **`@memberjunction/installer`.** The configure phase wrote a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets via `git init && git add .`. It now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`); idempotent — appends only missing entries, never rewriting user lines.
  - **`@memberjunction/ng-explorer-app`.** Fixes an MJExplorer login crash where `MJNotificationService.Instance` was read before DI constructed the singleton (surfaced by magic-link's instant, no-redirect login) — the service is now injected into `MJExplorerAppComponent` so it's constructed before `handleLogin` runs.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0

## 5.42.0

### Patch Changes

- 63d7610: App-level PostgreSQL support (code-only — no schema/metadata changes):
  - **open-app-engine**: `mj app install/upgrade/remove` now work on PostgreSQL — the CLI orchestrator
    builds a `PostgreSQLDataProvider` when `dbPlatform=postgresql` (was hardcoded to SQL Server), and
    the installer selects the platform-specific migration directory (`<dir>-pg` / `migrations.directoryPostgres`)
    so PG apps run plpgsql migrations instead of T-SQL.
  - **db-auto-doc**: dialect-aware description write-back — emits PostgreSQL `COMMENT ON` statements
    (double-quoted identifiers, no `sp_addextendedproperty` / `GO`) when the configured provider is postgresql.

- b7092ca: PostgreSQL runtime correctness, found during fresh-DB PG end-to-end testing:
  - **codegen-lib**: clean MJAPI engine load on PostgreSQL — `AutoUpdatePath` written as a
    dialect-correct boolean literal, plus a PG-only migration removing orphan related-entity-name
    virtual EntityField rows whose column the generated PG base view never emits (these crashed
    EntityActionEngine / AI Credential Bindings / Scheduling with `column "..." does not exist`).
  - **open-app-engine**: app uninstall now deletes all FK-dependent metadata (Entity Field Values,
    Entity Settings) in dependency order and reports a real failure instead of swallowing errors
    into a false "success".
  - **postgresql-dataprovider**: dialect-correct per-field entity-search predicate (no `N'...'`
    literal prefix, no `ESCAPE` clause) — fixes `syntax error at or near "ESCAPE"` on live search.

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- 21d967f: feat(open-app): resolve the full transitive dependency graph up front, with real cross-repo cycle detection; forward `AllowDoubleUnderscoreSchema` / `Verbose` to dependency installs

  `mj app install` now fetches every reachable dependency's manifest and resolves the complete transitive graph before installing anything, installing members in leaf-first topological order. This detects genuine cross-repo cycles (e.g. `A -> B -> A`) and fails fast with a clear message instead of recursing unbounded. Resolution runs once up front; pre-resolved members install without re-resolving their own subtrees.

  Also fixes a latent bug in the existing recursive install: the `--dangerously-ignore-dbl-underscore-schema-rule` override (and `--verbose`) set on the top-level `mj app install` were not forwarded to the recursive dependency installs. An app whose dependency uses a `__`-prefixed schema (e.g. BCSaaS → `mj-bizapps-common` with schema `__mj_BizAppsCommon`) would fail at the dependency step with "Schema names starting with '\_\_' are reserved for MJ internals" even when the override was set on the parent. Inherited install-behavior options now propagate to dependency installs. App-identity options (`Source`, `Version`) are intentionally not forwarded — each dependency has its own.

  Public `InstallApp`/`UpgradeApp` signatures are unchanged.

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 39710b1: Fix baseline migrations being silently skipped during `mj app install`. The install orchestrator passed `BaselineVersion: '0'` to Skyway, but the resolver only auto-selects the highest baseline file when `BaselineVersion === '1'`. Changed to `'1'` so baseline files (B\* prefix) are correctly discovered and executed on fresh database installs. Also allowed mixed-case schema names in manifest validation (SQL Server is case-insensitive) to support apps like BizApps Common (`__mj_BizAppsCommon`).
- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- 29a1fad: no migration/metadata, just da patch
- 0279a5c: Open App: exact version pins, per-repo tokens, and workspace-wide prefix bumps
  - `--version` flag now pins packages to exact versions (no ^ prefix) and validates the GitHub tag exists before proceeding
  - Per-repo GitHub token map (`openApps.github.tokens`) for multi-private-repo dependency chains
  - `GetLatestVersion` falls back to tags when no GitHub Releases exist
  - Schema reuse when `createIfNotExists: true` and schema already exists (adopts sidestep installs)
  - Don't pass `--registry` for default npm registry (fixes private scoped package auth)
  - Prevent duplicate `dynamicPackages.server` entries on re-install
  - npm install failures demoted to warnings when package.json was updated (auth issues don't abort install)
  - `packages.prefix` manifest field for workspace-wide dependency bumps during install/upgrade

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- 21a04c1: Support per-schema entity package resolution in CodeGen for OpenApp multi-package distribution
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 6214edf: feat: Provider-agnostic OpenApp Engine with configurable project layouts, package manager auto-detection, Azure SQL support, and MJ version fallback detection

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- 8a11457: Add centralized fire-and-forget pattern for all long-running GraphQL mutations (RunTest, RunTestSuite, RunAIAgent, RunAIAgentFromConversationDetail) to avoid Azure's ~230s HTTP proxy timeout. Use fire-and-forget mutation to avoid Azure proxy timeouts on agent execution, allow \_\_ prefixed schema names in Open App manifest validation, add inlineSources to Angular tsconfig for vendor sourcemap support, and add .env.\* to gitignore
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/core@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Minor Changes

- 61079e9: Add Open App system for installing, managing, and removing third-party apps via `mj app` CLI commands. Includes manifest validation, dependency resolution, schema isolation, migration execution, npm package management, and config-manager integration.

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
