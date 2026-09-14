# @memberjunction/testing-engine

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
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/testing-engine-base@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/testing-engine-base@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/testing-engine-base@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

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
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/testing-engine-base@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- e68d90d: Sequence IT85 ahead of the live suite's client bundle, and guard the invariant

  `IT85 - Entity Embedded Records` is a server-transport bundle that sat at `Sequence` 69 in the
  Live Model suite, behind `IT63` (client) at 15. A client bundle rebinds the process-global
  provider, so IT85 bootstrapped against a `Network` provider and could not run at all:
  `transport 'server' resolved a 'Network' provider — the process-global provider was rebound`.

  That is the #3251 invariant, and a guard for it already existed — but it only read the
  **deterministic** suite, so the live suite's violation passed 196 green tests and only surfaced
  on a release run that actually executed the tier. The invariant is a property of the process, not
  of one suite, so the guard now runs over both.

  Verified by restoring the bad sequence: the live-model case fails with the offending pair named,
  and passes once IT85 sequences ahead of IT63.

### Patch Changes

- 07cb22e: Fix `$`-sequence corruption in `String.prototype.replace` calls carrying runtime data (#3171).

  `replace(search, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1`–`$99` as metacharacters when `replacement` is a **string**. Every site below passed runtime data there, so a `$` in that data was silently executed rather than inserted. The `$&`/`` $` ``/`$'` forms are worse than value corruption: they splice surrounding text _into_ the value. All are fixed by passing a replacement **function**, whose return value is used literally.
  - **`@memberjunction/installer` — corrupted secrets (highest impact).** Re-running `mj install` syncs the root `.env` into MJAPI's. A DB password containing `$&` had the _stale_ MJAPI password spliced into it; ``$` `` spliced in the preceding `.env` line. The result was a wrong secret written to disk with no error, surfacing later as "MJAPI can't connect". Only the replace branch was affected — fresh installs (append branch, string concatenation) were always correct, which is why this survived. Also fixes the `newUserSetup` block (embeds user name/email) and the `mjRepoVersion` and Explorer `environment.ts` patchers.
  - **`@memberjunction/core` — rewritten RLS predicates.** `RowLevelSecurityFilterInfo.MarkupFilterText` substitutes user properties, magic-link scope and `{{Acting*}}` tokens into row-level-security filters. A `$` in any of them rewrote the predicate — the exact outcome the neighbouring `'`-escaping exists to prevent. This feeds `GetEffectiveRowFilterWhereClause`, used across RunView reads, Create and Update. Also fixes organic-key `Custom` normalization, which builds a SQL `WHERE` from a data value.
  - **`@memberjunction/generic-database-provider`, `@memberjunction/postgresql-dataprovider`** — end-user search terms substituted into `UserSearchParamFormatAPI` predicates, plus view-template inner SQL and PG identifier quoting. Also `QueryCompositionEngine.renameSQLIdentifier`, which rewrites CTE identifiers in composed queries: the search side was regex-escaped but the replacement side was not, so a `$` in a deconflicted CTE name (SQL Server bracketed and PG quoted identifiers both permit one) was expanded into the executed SQL.
  - **`@memberjunction/ai-prompts`, `@memberjunction/computer-use`, `@memberjunction/ai-vector-sync`, `@memberjunction/aiengine`, `@memberjunction/ai-agents`** — assistant prefill text (routinely contains `$$` for LaTeX or currency), computer-use goals/URLs/step summaries, embedding-document field values, and entity field values, all interpolated into prompts and templates.
  - **`@memberjunction/metadata-sync`** — parameter values in the debug SQL log.
  - **`@memberjunction/testing-engine`** — test input/expected/actual values into the LLM-judge prompt, and parameter values into `SQLValidatorOracle`'s generated SQL.
  - **`@memberjunction/sql-converter`** — the configured schema name substituted into emitted PostgreSQL view SQL, in both `ViewRule` and its previously-missed twin in `InsertRule`. The schema is now escaped on the _search_ side too: a `$` in it acted as an end-anchor, so the pattern matched nothing and the conversion silently emitted no rewrite.
  - **`@memberjunction/sql-parser`** — `restoreAliases` swaps generated aliases back to the caller's original bracketed identifiers. Two of its three branches used `split`/`join` and were already safe; the third expanded `$`-sequences, so `[a$'b]` spliced surrounding SQL into an identifier. The aliasing path fires precisely _because_ an identifier contains a non-word character, so the input that triggers aliasing is the input that corrupted the restore. Reached from the public `ToSQL()`.
  - **`@memberjunction/sqlserver-dataprovider`** — batch execution rewrites `@name` placeholders to `@q<N>_name`; the parameter name went into the `RegExp` unescaped, so a `$` in it prevented the rewrite entirely and mssql failed with "Must declare the scalar variable". Sibling of the PostgreSQL `escapeRegExp` fix below.
  - **`@memberjunction/react-linter`** — component data substituted into diagnostic messages.
  - **`@memberjunction/actions-bizapps-social`, `@memberjunction/ai-cli`** — hardened a numeric-only site; documented the AICLI JSON highlighter's `$1` back-references as intentional.

  Also fixes a **test-tooling safety defect** found while verifying the above on a clean database: `@memberjunction/testing-cli` loaded `.env` with `dotenv.config({ override: true })`, so a variable already set in the environment was overwritten. `DB_DATABASE=MJ_scratch mj test …` was silently discarded and the suite ran — **including mutation tests** — against whatever `.env` pointed at. That made the "one database per agent" rule unenforceable by environment variable and diverged from every other `mj` command (`migrate`, `codegen`, `sync push` all honour the environment). `override` is now dotenv's default `false`, so `.env` still fills in anything unset but an explicit value wins. Guarded by a unit test. **Note the inverse hazard when upgrading:** any environment that exports `DB_*` globally — a Docker image, a CI container, a stale `export` in a shell profile — now wins over `.env`, where `.env` used to be authoritative. If a `mj test` run suddenly targets an unexpected database, check the exported environment first; the CLI prints `config.dbDatabase: <name>` at startup.

  And an adjacent defect found while testing the above: `PostgreSQLDataProvider.quoteFieldNamesInToken` interpolated a field name into a `RegExp` **without escaping regex metacharacters**, so a column named `a.b` matched (and wrongly quoted) unrelated text like `axb`, and a column containing `$` was never matched at all — which had also made the replacement-side fix on that line unreachable. Field names are now escaped before interpolation.

  Also adds `.github/scripts/check-dynamic-replace.mjs`, a CI gate that flags `.replace()`/`.replaceAll()` whose replacement is neither a string literal nor a function. No existing lint rule covered this — the React `string-replace-all-occurrences` rule only ever inspects the _search_ argument. The gate is line-aware (only lines a change touches), since ~100 pre-existing sites remain and a bare identifier holding a function reference is indistinguishable from one holding a string; `--all` is available for auditing. Regression tests now push `$$`, `$&`, `` $` ``, `$'` and `$1` through each fixed path.

  Also fixes a **silently inert security check** found while verifying the above. `BaseTestDriver.Provider` fell back to `new Metadata() as unknown as IMetadataProvider`. `Metadata` is a facade that proxies a hand-maintained subset of members to the global provider, not a provider itself, and the cast is the only reason the compiler accepted it. Members it does not proxy read `undefined` — `RowLevelSecurityFilters` among them. The integration suite's `discoverTokenFilter` reads exactly that property to find a `{{UserID}}`-scoped filter, so it always found none: the `rls-isolation` RLS1/RLS2 token-substitution checks skipped-as-pass **on every database**, while the bundle reported green. There were 13 filters present, 5 of them `{{UserID}}`-scoped. The fallback now returns the global provider, which is what the getter's own doc comment always promised, and both checks now execute. A new `rls-isolation` check (RLS11) additionally pushes `$$`, `$&`, `` $` ``, `$'` and `$1` through a substituted user property and executes the resulting predicate, so the RLS half of this fix has live coverage rather than unit coverage alone.

- f5ec13b: Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

  **`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
  which a split-token expression walked straight through:
  `[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
  climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
  confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
  conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
  is parsed and every node checked before compilation, rejecting computed member access whose key is
  not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
  outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
  be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
  `name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
  parse-without-executing on top of it.

  **The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
  almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
  structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
  ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
  optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
  denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
  methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
  `.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
  expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
  that store them before upgrading.

  **Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
  `@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
  `parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
  `Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
  (`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
  none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
  imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
  must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
  list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
  `@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
  pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
  is why a screen that refused `Math.abs(x)` passed it.

  **A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
  the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
  stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
  reason only on `hold`.

  **Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
  and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
  Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
  summary aggregator counts skips separately and averages over the executed set.

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
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
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [f5ec13b]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/testing-engine-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/testing-engine-base@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
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
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/testing-engine-base@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/testing-engine-base@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/testing-engine-base@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [c382605]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/testing-engine-base@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/testing-engine-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 1a15bd2: Add the **"Integration Test" `TestType`** — a headless, metadata-driven integration tier that runs the real MJ provider stack (live SQL Server / GraphQL, real cache managers + engines, real entity saves; no browser, no mocks) inside the Testing Framework, focused first on cache-integrity. The standalone `tsx` cache suites in `packages/MJServer/integration-test-scripts/` are graduated into first-class check bundles on one shared registry, so the same definitions run identically via the `npm run test:integration` aggregator **and** via `mj test` / `TestRun` (the `IntegrationTestDriver`) — a single source of truth.

  **New package `@memberjunction/testing-integration`.** Dedicated-process bootstrap that installs an instrumented `LocalCacheManager` as the first caller (`bootstrapIntegrationServer` / `bootstrapIntegrationClient` / `installInstrumentedCacheFirst`, gated by `MJ_INTEGRATION_TEST=1`); the `IntegrationCheckRegistry` + `NamedCheck` contract; the `InstrumentedLocalStorageProvider` / `UniqueFilter` / `TestRunner` / `ai-verify` proof primitives; and the `IntegrationTestDriver` (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`), which dispatches a Test's configured bundles against one bootstrapped context and maps each check to an `OracleResult`. `@memberjunction/testing-cli`'s run/suite commands install the instrumented cache first under `MJ_INTEGRATION_TEST=1` (byte-for-byte unchanged otherwise); the old `lib/harness.ts` becomes a thin re-export shim. The pre-built `@memberjunction/server-bootstrap` class-registration manifest is regenerated (and the package gains a `@memberjunction/testing-integration` dependency) so `IntegrationTestDriver` is registered in-process and survives tree-shaking.

  **Graduated check bundles (single source of truth).** Every standalone suite is now a thin dispatcher of a registry bundle with a metadata `Test` record (IT01–IT23) joined to an "Integration Tests" suite:
  - **Deterministic server:** `server-cache` (S1–S31), `runquery-cache`, `dataset-cache`, `aggregates-cache` (AGG1–3), `record-process`, `record-process-facade`, `scheduled-jobs`, `field-rules-bulk-update`, `remote-operations`, `ai-skills`, `api-keys`, `predictive-studio` seams, `rls-isolation` (RLS1–RLS10 — the two overlapping RLS implementations were merged into one canonical bundle), plus the final three graduated in this pass: `lists` (LS1–3, keyset pagination), `open-app-teardown` (OAT1–2, the FK-graph cascade + link-less Application cleanup — adds a `@memberjunction/open-app-engine` dependency), and `user-routines` (UR1–16, the entity servers + dispatcher end-to-end).
  - **Deterministic client** (needs a live MJAPI; skips cleanly otherwise): `remote-op-wire-progress` (the client bootstrap now derives a `ws(s)://` subscription URL from the HTTP endpoint so the RO-3 progress WebSocket actually connects — it previously passed an empty `wsurl` and threw `Invalid URL` the moment a live MJAPI was reachable, so the check could never pass), and `rls-isolation-client` (RLS7 — the client smart-cache companion to `rls-isolation`, now given its own seeded-Skip IT record instead of being a driver-only orphan).
  - **Live-model** (`RUN_AGENT_TESTS`): `prompt-runner`, `agent-runner`, `concurrent`, `remote-op-ai-authoring`.

  **tsx↔metadata sibling parity is now enforced.** The check logic lives once in a registry bundle; its two "siblings" are a `tsx` dispatcher script and a metadata `Test` record — both thin pointers. A new `sibling-parity.test.ts` drift-check (unit test) fails the build if any registered bundle is missing a dispatcher or an IT record, or if either points at a non-existent bundle (a small, reasoned `NO_TSX_DISPATCHER` allowlist covers deliberately driver/MJAPI-only bundles like `rls-isolation-client`). Backed by a new `IntegrationCheckRegistry.GetBundleNames()`; the coverage-loss guard was extended to the three new bundles. This closed the last three un-graduated `tsx` suites and the one registry-only bundle so all bundles now have both siblings.

  **Tiering & gating.** A single tier model (`tiers.ts`: `deterministic` | `mutation` | `live-model`, with `IsTierEnabled()` reading `RUN_MUTATION_TESTS` / `RUN_AGENT_TESTS`) is honored identically by the aggregator and the driver, so a flag skip-passes the same way on both paths.

  **Engine-level fixture lifecycle.** A per-bundle `BundleLifecycle` (Setup → run → Teardown in FK-safe order) plus suite-scoped `SuiteFixtureContext` (`@memberjunction/testing-engine-base`) with additive `BaseTestDriver.SetupSuite()` / `TeardownSuite()` hooks; `TestEngine.RunSuite` guarantees teardown + run-status update in a `finally` (pass / fail / thrown `Execute` / timeout), and a thrown `Execute` now resolves to a `Status='Error'` `TestRun` instead of wedging `'Running'`. Mutating suites self-clean identically on both front-ends.

  **RLS / multi-user cache isolation.** New version-controlled seed metadata — a purpose-built **"Integration Test: RLS Scoped Reader"** role (scoped read on `MJ: AI Agent Runs` via `UserID = '{{UserID}}'` and nothing else) plus three inert, login-less test accounts — so the strongest RLS checks (fingerprint divergence / server-superset no-cross-serve / live no-leak) **execute for real** instead of skipping on an admin-only DB. Accounts are `Type='User'`, no auth linkage, clearly named, safe to delete. **The test-only integration records — the IT01–IT23 Tests, the integration suite, AND these RLS principals — live in a dedicated optional sibling root `metadata-optional/integration-test/`, NOT the default-pushed `metadata/` tree**, so none of it (least of all the synthetic `IsActive` accounts) ever reaches a production DB that only syncs `metadata/`. (The inert `Integration Test` TestType definition stays in normal `metadata/test-types/` — it's just a type row, no data or security surface — and the IT records `@lookup` it by name.) Seed the optional records with `mj sync push --dir=metadata-optional/integration-test`; the RLS checks skip-as-pass (with the exact push command logged) when absent.

  **Dashboard legibility.** The custom `MJ: Test Runs` form's `getCheckResults()` now reads `ResultDetails` as the bare `OracleResult[]` the engine actually writes (fixing per-check rendering for all engine runs; mapping extracted into an Angular-free, unit-tested `test-run-checks.ts`), and the runs view binds `<mj-execution-context>` to the run's machine/CI fields. The Test Run dialog's "Execution Failed" banner no longer renders empty — a `failureMessage` getter falls back through top-level `errorMessage` → a synthesized per-test summary → the single test's message → a generic note (applies to every TestType).

  **CI / release gate.** New `run-all.ts` aggregator + root `npm run test:integration` spawn each deterministic server suite in its own process (so each owns `LocalCacheManager.Initialize` as first caller) and collapse the per-suite `0/1/2` exit codes into one. The deterministic SQL Server tier is a blocking PR gate.

  **Cross-platform & cross-server seams.** `DbConfig` gains a `Platform` field (`DB_PLATFORM` ∈ {sqlserver, postgresql}, default sqlserver) and `bootstrapIntegrationServer` dispatches accordingly (the PG path ships behind the tracked PG user-cache prerequisite; no PG CI lane yet). A `RUN_CROSS_SERVER=1` spec proves a `Save()` in one MJAPI invalidates a cached read in a second sharing one DB + Redis.

  **RunView cache-layer fixes (`@memberjunction/core`).** Four real bugs the new suites surfaced, fixed in `localCacheManager.ts` + `providerBase.ts`:
  - **SECURITY:** the cache-hit path returned _before_ the DB provider's read-permission gate, so a user lacking `CanRead` could be served rows a permitted user had warmed (an observed cross-user data leak). `PreRunView` and the `RunViews` batch now skip the cache when the user lacks read permission on the entity, falling through to the DB path's proper denial (server-cache S31).
  - **SECURITY:** closed the **ViewID-only** variant of that bypass. The S31 gate keys off the entity resolved from `params.EntityName`; a `ViewID`/`ViewName`-only request (the Explorer-standard saved-view shape) resolved no entity there, so a read-denied user could still hit a slot a permitted user warmed for the same ViewID. `ProviderBase.cacheDeniedForViewOnlyRequest` (both cache paths) now resolves `ViewEntity` synchronously and applies the `CanRead` gate, or **fails closed** for a `ViewID`/`ViewName`-only request whose entity is only known after the async view lookup the cache-hit path skips. This also closes the RLS cross-serve for view-by-ID (two differently-scoped users no longer share a ViewID slot). Pinned by `providerBase.viewOnlyCacheGate.test.ts` + integration check server-cache **S31b** (**operators: prioritize this upgrade — S31 + S31b are both data-leak fixes**).
  - **SECURITY:** a **stored view's identity** now participates in the RunView cache fingerprint (`vw:` segment). A saved view carries its own server-side `WhereClause` that is not reflected in `params.ExtraFilter`, so a filtered view and a plain unfiltered read of the same entity previously produced identical fingerprints and cross-served — the view was handed the unfiltered slot and returned rows _outside its own WhereClause_. Keyed by ViewID / ViewName / ViewEntity PK, appended only when a view identifier is present → plain entity+filter fingerprints stay byte-identical, no cache invalidation (server-cache S29).
  - **`IgnoreMaxRows`** now participates in the RunView cache fingerprint, so an `IgnoreMaxRows` request no longer collides with (and is served) the capped slot for the same entity. Appended only when true → existing fingerprints stay byte-identical, no cache invalidation (server-cache S28).
  - **`AggregateResults`** are remapped to the caller's requested order on a cache hit; the aggregate fingerprint is order-insensitive by design, so a reordered request must not inherit the warming caller's order (aggregates-cache AGG3).

  **Review-response hardening (PR #3020).** Beyond S31b above: a lifecycle bundle's `Setup` and `Teardown` now run inside ONE `try/finally` on both front-ends (driver + tsx dispatchers), and every mutating fixture publishes its handle up-front + populates it as records are created — so a mid-`Setup` crash still tears down whatever was created instead of orphaning it (`runquery-cache` aligned to the shared lifecycle pattern). A single hung check is now bounded by the remaining run budget (a per-check race) instead of running past the driver timeout forever. The integration CI gate's trigger surface was widened (`migrations/**`, the `metadata-optional/**` root, `mj.config.cjs`/`tsconfig*`/`turbo.json`) and given a `push:` backstop mirroring the unit-test gate; the non-`Active` suite-membership exclusion is now surfaced with a concise always-on log; the testing CLI fails fast when it cannot install the instrumented cache first; and the sibling-parity drift-check was extended to cover the `run-all.ts` aggregator wiring and suite-join membership. `mj sync push` now honors `MJ_MIGRATION_REQUEST_TIMEOUT` (MetadataSync's env-driven config defaults, mirroring MJCLI) so the CI metadata push gets the same cold-server request-timeout headroom as `mj migrate` — mssql's 15s default could otherwise abort the push mid-transaction under embedding-on-save + engine-load latency on a cold runner.

  One related cache gap is **deliberately deferred** and documented in-check as a self-healing skip-as-pass: cross-entity **denormalization** invalidation (server-cache S30) — renaming a parent record does not invalidate cached child rows that denormalize its name, because invalidation keys on the changed entity, not on dependent entities. Fixing it requires fanning invalidation out to dependent entities (a broad, higher-risk change), tracked separately; the check re-arms automatically once that lands.

  All changes are additive / back-compat. Verified live against `mj_integrations` via both the `tsx` scripts and the `IntegrationTestDriver` (server-cache 31/31 with `RUN_MUTATION_TESTS`, aggregates-cache 3/3, rls-isolation 9/9; MJCore unit tests 1484/1484, testing-integration 145/145, testing-engine 45/45, testing-cli 23/23); golden-equivalence (`scripts/integration-golden-diff.mjs`) enforces no coverage loss between the two front-ends.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [5473e9a]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/testing-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [2143b98]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-agents@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/testing-engine-base@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-agents@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/testing-engine-base@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-agents@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/testing-engine-base@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-agents@5.45.1
  - @memberjunction/aiengine@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/testing-engine-base@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [19ec4b0]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-agents@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/testing-engine-base@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [eb38a42]
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [91842c3]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agents@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-prompts@5.44.0
  - @memberjunction/testing-engine-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [aa21fef]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-agents@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/testing-engine-base@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [e7c2437]
- Updated dependencies [0c6bf61]
- Updated dependencies [78f834d]
- Updated dependencies [4ec1732]
- Updated dependencies [008f449]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-agents@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/testing-engine-base@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai-agents@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-prompts@5.41.0
  - @memberjunction/testing-engine-base@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-agents@5.40.2
- @memberjunction/ai@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-prompts@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/testing-engine-base@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agents@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/testing-engine-base@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [6ea4de7]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ai-agents@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/testing-engine-base@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [3d4510c]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/ai-agents@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/testing-engine-base@5.39.0

## 5.38.0

### Patch Changes

- 67d6562: Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
- 48dc77a: Add full-stack regression test suite for MJ Explorer driven by the Computer Use engine. New `Drag` browser action with smooth multi-step mouse motion, parallel browser worker contexts shared across tests with auto-rotation after 20 uses, JSON-on-disk run comparison via `mj test compare --from-json`, and `--dry-run` / `--parallel` / `--flaky-check` flags on the testing CLI.
- Updated dependencies [6b6c321]
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-agents@5.38.0
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/testing-engine-base@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-agents@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/testing-engine-base@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agents@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/testing-engine-base@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [e9d4b1c]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ai-agents@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/testing-engine-base@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-agents@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/testing-engine-base@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ai-agents@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/testing-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [7716c98]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-prompts@5.33.0
  - @memberjunction/ai-agents@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/testing-engine-base@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agents@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/testing-engine-base@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai-agents@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/testing-engine-base@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agents@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/testing-engine-base@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/ai-agents@5.30.0
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/testing-engine-base@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agents@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/testing-engine-base@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-agents@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/testing-engine-base@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-agents@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/testing-engine-base@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-agents@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-prompts@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/testing-engine-base@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/ai-agents@5.26.0
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/testing-engine-base@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [62af878]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ai-agents@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/testing-engine-base@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-agents@5.24.0
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/testing-engine-base@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-agents@5.23.0
  - @memberjunction/ai-prompts@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/testing-engine-base@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [21e0b69]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-prompts@5.22.0
  - @memberjunction/ai-agents@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/testing-engine-base@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [b29716c]
- Updated dependencies [76cd2bc]
- Updated dependencies [845c980]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-agents@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-prompts@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/testing-engine-base@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [7ab01a8]
- Updated dependencies [2298f8a]
  - @memberjunction/ai-agents@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-prompts@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/testing-engine-base@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- Updated dependencies [f9001de]
  - @memberjunction/ai-agents@5.19.0
  - @memberjunction/ai@5.19.0
  - @memberjunction/ai-core-plus@5.19.0
  - @memberjunction/aiengine@5.19.0
  - @memberjunction/ai-prompts@5.19.0
  - @memberjunction/core@5.19.0
  - @memberjunction/core-entities@5.19.0
  - @memberjunction/global@5.19.0
  - @memberjunction/testing-engine-base@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [5f91957]
- Updated dependencies [48f7296]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-agents@5.18.0
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ai-prompts@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/testing-engine-base@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ai-agents@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-prompts@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/testing-engine-base@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-agents@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-prompts@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/testing-engine-base@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-prompts@5.15.0
  - @memberjunction/ai-agents@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/testing-engine-base@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ai-agents@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-prompts@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/testing-engine-base@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-agents@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-prompts@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/testing-engine-base@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/ai-agents@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ai-prompts@5.12.0
  - @memberjunction/testing-engine-base@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [0dca9db]
  - @memberjunction/core@5.11.0
  - @memberjunction/ai-agents@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-prompts@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/testing-engine-base@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-agents@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-prompts@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/testing-engine-base@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ai-agents@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-prompts@5.10.0
  - @memberjunction/testing-engine-base@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-agents@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/ai-prompts@5.9.0
  - @memberjunction/testing-engine-base@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ai-agents@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-prompts@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/testing-engine-base@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ai-prompts@5.7.0
  - @memberjunction/ai-agents@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/testing-engine-base@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-agents@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-prompts@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/testing-engine-base@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [2973c64]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ai-agents@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-prompts@5.5.0
  - @memberjunction/testing-engine-base@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-agents@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-prompts@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/testing-engine-base@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
- Updated dependencies [bc993b8]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-agents@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-prompts@5.4.0
  - @memberjunction/testing-engine-base@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-agents@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-prompts@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/testing-engine-base@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [ebf057a]
- Updated dependencies [1692c53]
  - @memberjunction/ai-agents@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-prompts@5.3.0
  - @memberjunction/testing-engine-base@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ai-agents@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/ai-prompts@5.2.0
  - @memberjunction/testing-engine-base@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-agents@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/ai-prompts@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/testing-engine-base@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-agents@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/ai-prompts@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/testing-engine-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-agents@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-prompts@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/testing-engine-base@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-agents@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-prompts@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/testing-engine-base@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [6f4d33f]
- Updated dependencies [564e1af]
  - @memberjunction/ai-agents@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-prompts@4.3.0
  - @memberjunction/testing-engine-base@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-agents@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-prompts@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/testing-engine-base@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-agents@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-prompts@4.1.0
  - @memberjunction/testing-engine-base@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- 58ec618: Fix multi-turn Agent Eval tests to reuse same conversation instead of creating separate conversations for each turn
- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/ai-agents@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-prompts@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/testing-engine-base@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [d596467]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-prompts@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-agents@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/testing-engine-base@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [4bbb600]
- Updated dependencies [ca551dd]
  - @memberjunction/ai-agents@3.3.0
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-prompts@3.3.0
  - @memberjunction/testing-engine-base@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [011c820]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ai-agents@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-prompts@3.2.0
  - @memberjunction/testing-engine-base@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-agents@3.1.1
- @memberjunction/ai@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-prompts@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/testing-engine-base@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-agents@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-prompts@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/testing-engine-base@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-agents@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-prompts@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/testing-engine-base@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-agents@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-prompts@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/testing-engine-base@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [3604aa1]
- Updated dependencies [81598e3]
- Updated dependencies [d3d2926]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-agents@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-prompts@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/testing-engine-base@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-agents@2.130.1
- @memberjunction/ai@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-prompts@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/testing-engine-base@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
- Updated dependencies [f4e1f05]
  - @memberjunction/ai-agents@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/ai-prompts@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/testing-engine-base@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [573179f]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-agents@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ai-prompts@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/testing-engine-base@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-prompts@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-agents@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/testing-engine-base@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ai-agents@2.127.0
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-prompts@2.127.0
  - @memberjunction/testing-engine-base@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-agents@2.126.1
- @memberjunction/ai@2.126.1
- @memberjunction/ai-core-plus@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-prompts@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/testing-engine-base@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [d424fce]
- Updated dependencies [703221e]
  - @memberjunction/ai-agents@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-prompts@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/testing-engine-base@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ai-agents@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-prompts@2.125.0
  - @memberjunction/testing-engine-base@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [4b2181d]
- Updated dependencies [cabe329]
- Updated dependencies [629cf5a]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-agents@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-prompts@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/testing-engine-base@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-agents@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-prompts@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/testing-engine-base@2.123.1

## 2.123.0

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-agents@2.123.0
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/ai-prompts@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/testing-engine-base@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/ai-agents@2.122.2
  - @memberjunction/ai-prompts@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/testing-engine-base@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-agents@2.122.1
- @memberjunction/ai-core-plus@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-prompts@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/testing-engine-base@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-agents@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-prompts@2.122.0
  - @memberjunction/testing-engine-base@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai-agents@2.121.0
  - @memberjunction/ai-prompts@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/testing-engine-base@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-agents@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-prompts@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/testing-engine-base@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [62790f4]
- Updated dependencies [0a133df]
- Updated dependencies [efc6451]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-agents@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-prompts@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/testing-engine-base@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- a49a7a8: migration
- 1bb5c29: migration

### Patch Changes

- Updated dependencies [a2901ff]
- Updated dependencies [264c57a]
- Updated dependencies [a49a7a8]
- Updated dependencies [096ece6]
- Updated dependencies [7dcfd9c]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/ai-agents@2.118.0
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/testing-engine-base@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-prompts@2.118.0
  - @memberjunction/global@2.118.0
