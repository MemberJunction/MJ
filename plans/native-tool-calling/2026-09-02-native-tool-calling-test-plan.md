# Native Tool Calling — Test Plan

**Issue:** [MemberJunction/MJ#4082](https://github.com/MemberJunction/MJ/issues/4082)
**Status:** Draft
**Companion doc:** [Implementation plan](./2026-09-02-native-tool-calling.md) — this document
expands §10 of that plan and is the deliverable behind its PRs 4 and 6 (eval gate).

---

## 1. Purpose

Produce **quantifiable results from the existing MJ agent framework as a baseline**, then
run the *same corpus* against the native tool calling implementation and report deltas.
Two properties are non-negotiable:

1. **Deterministic evaluators only.** Every expected outcome is verified structurally —
   response parses, next-step type matches, action name matches, params satisfy declared
   matchers. No LLM-judge in the scoring path. (The framework's `llm-judge` oracle exists
   and may be *attached* to exploratory suites later, but it contributes no weight to
   baseline-vs-native comparison numbers.)
2. **Mode-agnostic expectations.** A test case says *what the agent should decide*
   ("invoke `Run Ad-hoc Query` with these params"), not *how the wire encodes it*. The
   evaluator normalizes both encodings — envelope `nextStep.actions[]` and native
   `ChatToolCall[]` — into one observed-decision record before comparison. This is what
   makes baseline and native runs directly comparable on identical cases.

### How a decision is verified (worked example)

Given an agent with actions A, B, C and a case expecting B: for prompt-level cases,
**no action ever executes** — `AIPromptRunner.ExecutePrompt` returns the model's raw
decision and nothing is dispatched. The oracle is a plain data assertion:
envelope mode parses the JSON and asserts `nextStep.type === 'Actions'` and
`actions[0].name === 'B'`; native mode asserts `toolCalls[0].name === 'B'` on the
normalized result. For loop-level cases (actions do execute), the framework already
persists every step as `AIAgentRunStep` rows (`stepType: 'Actions'`, step name, full
I/O); the trace oracle queries those rows and asserts a B step exists and no A/C step
does. The evaluator is fully deterministic in both cases — what varies run-to-run is
the *model's* choice, which is the quantity being measured. Hence repetition counts
and rates (§6) rather than single pass/fail booleans: 17/20 choosing B is a data
point, not a flaky test.

This is also why the harness is not a plain unit-test suite: mock the model and there
is nothing left to measure; call live models from a unit runner and it's a benchmark
without bookkeeping. The assertion logic itself *is* unit-test-simple and is itself
unit-tested (§5); the framework contributes the campaign around it — live execution,
N-per-cell repetition, persisted per-oracle results, and longitudinal comparison
between the baseline and native runs.

---

## 2. Harness Architecture Decision

Three options were considered for where the harness runs:

| Option | Description | Assessment |
|---|---|---|
| A. Inside MJAPI | Drive tests through the running API server | Rejected. Prompt-run-level testing needs `AIPromptRunner`, a DB provider, and `AIEngine.Config()` — not HTTP. The server adds startup cost, auth plumbing, and noise without adding fidelity at the layer under test. |
| B. Dedicated standalone process | Custom `tsx` scripts bootstrapping the provider directly | **Adopted as the documented fallback (§2.1)** and for Phase B probes. MJ already has this shape (`packages/TestingFramework/integration-test-suite/rigs/` + `rigs/lib/ai-bootstrap.ts`, `integration-test-scripts/run-harness-agent.ts`). Its cost is that test/suite/run persistence, scoring, and comparison tooling must be hand-built. |
| **C. MJ TestingFramework (recommended)** | New driver + oracles in `@memberjunction/testing-engine`, invoked via `mj test` | **Adopted as primary.** Nearly everything this plan needs already exists. |

### Why C: what already exists

- **Metadata-driven test content:** `MJ: Test Types` → `MJ: Tests` (input + oracle config
  as JSON) → `MJ: Test Suites` → persisted `MJ: Test Runs` with `ResultDetails =
  OracleResult[]`. Tests ship as stock metadata exactly like the existing
  **Research Agent Evaluation Suite** (`metadata/test-suites/.research-agent-evaluation-suite.json`,
  `metadata/tests/research-agent/*.json`).
- **Driver dispatch:** `@RegisterClass(BaseTestDriver, …)`; `AgentEvalDriver`
  (`packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts`, 1,113 lines) is a
  worked example — single- and multi-turn, per-turn execution params, cancellation,
  `TestRun.TargetLogID ↔ AIAgentRun.TestRunID` bidirectional linkage.
- **Deterministic oracle contract:** `IOracle { type; evaluate(input, config) →
  {passed, score, message} }`, weighted aggregation (`Engine/src/utils/scoring.ts`),
  public `TestEngine.RegisterOracle()`. Shipping deterministic oracles: `schema-validate`,
  `exact-match`, `sql-validate`, `trace-no-errors`.
- **Persistence verifiers:** `verifyPromptRun` / `verifyAgentRun`
  (`packages/TestingFramework/testing-integration/src/ai-verify.ts`) assert framework-side
  determinism (terminal statuses, token/cost rollups, messages persisted) even when model
  output varies.
- **Tier gating + CI lanes:** `IsTierEnabled('deterministic' | 'mutation' | 'live-model')`;
  deterministic runs on PR CI against a throwaway SQL Server with stock metadata
  (`.github/workflows/integration.yml`); live-model runs weekly, budget-capped.
- **Hermetic LLM substitution:** `TestLLM` + `registerTestLLM` from
  `@memberjunction/unit-testing` scripts exact model outputs through the real ClassFactory
  and real `BaseLLM` routing — golden-transcript replay for testing the harness itself.
- **Tooling:** `mj test run | suite | compare | history | report | validate`, repeat
  counts, `--flaky-check N`, cost calculation, and the Explorer Testing dashboard.

Running under the framework also means the harness is connected to a database with stock
MJ metadata (and optional mock test data), i.e., a genuinely integrated environment —
the benefit of option A without the server.

### What we build (the gaps)

1. **`PromptEvalDriver`** — no prompt-run-level driver exists today (everything is
   agent-level or unit-mocked). See §3.1.
2. **Agent-decision oracles** — deterministic evaluators for envelope/tool-call
   structure. See §3.2.
3. **Configuration-matrix expansion** — the existing variables schema varies
   model/temperature but cannot hold a corpus fixed while sweeping tool-mode × model ×
   action-list × prompt-variant. See §3.3.
4. **Baseline/native comparison report** — `mj test compare` diffs two runs; we need a
   cell-by-cell scorecard across a matrix. See §6.
5. **Bug fix (first win):** the shipped research-agent tests reference a
   `trace-validate-sub-agents` oracle that is **not implemented or registered** —
   25% of their weight silently drops (`Oracle not found`). Implement it
   (`requiredAgents` / `forbiddenAgents` / `minIterations`); it is also directly useful
   for our sub-agent-dispatch cases.

### 2.1 Documented fallback: bespoke harness

If the TestingFramework turns out to be a poor fit in practice, switch to a bespoke
runner **without changing the corpus or evaluator design**. To keep that switch cheap,
one design rule is mandatory from day one:

> **Write the evaluators, matchers, and corpus loader as plain framework-free functions
> in their own module.** The `PromptEvalDriver`/`IOracle` wrappers (option C) and the
> bespoke runner (option B) are both thin shells over the same functions. Neither the
> expectation DSL nor a single matcher may import anything from
> `@memberjunction/testing-engine`.

**Switch triggers** — fall back if any of these materialize while building T2–T4:

- The matrix expansion doesn't fit `MJ: Tests` records cleanly (e.g., suite generation
  produces an unmanageable number of records, or per-cell config fights the test-type
  variables schema).
- `TestEngine`'s execution model resists rate-based measurement (repetition,
  aggregate-over-N) rather than pass/fail semantics.
- Seeding test records into local/CI databases adds more friction than the persistence
  tooling returns.

**What carries over unchanged:** the golden-file corpus + expectation DSL (§4), all
evaluator/matcher logic (per the rule above), the bootstrap path
(`rigs/lib/ai-bootstrap.ts` `bootstrapAI()` → `{pool, user, provider}` with
`AIEngine.Config` done, or `initializeMJProvider()` from
`packages/TestingFramework/CLI/src/lib/mj-provider.ts`; import
`@memberjunction/server-bootstrap-lite` for LLM/agent-type class registration; explicit
`contextUser` always), and `TestLLM` for hermetic harness verification.

**What must be hand-built** (rough shape, a few hundred lines total):

- `rigs/prompt-eval/run.ts` — loads a corpus directory, expands the matrix from a
  config file, executes N reps per cell (serial or small bounded concurrency), calls
  the shared evaluators. CLI: `npx tsx rigs/prompt-eval/run.ts --matrix baseline.json
  --cases corpus/ --reps 20 --label baseline-2026-09`.
- Result persistence — JSON-lines, one record per (case, cell, rep):
  `results/<label>.jsonl` with observed decision, per-oracle results, tokens, latency,
  finish reason, model/vendor/mode identifiers.
- `rigs/prompt-eval/report.ts` — per-cell rates with confidence intervals; two-label
  delta report (replaces `mj test compare`).
- A cost/budget guard (estimated-token manifest before a run; hard stop on overrun).

This is deliberately viable — option C is preferred for its bookkeeping reuse, not
because option B is infeasible. If the fallback triggers, deliverables T2 (driver) and
parts of T5 are replaced by the runner above; T1, T3, T4, T6–T8 are unaffected.

---

## 3. Harness Components

### 3.1 `PromptEvalDriver`

New driver in `packages/TestingFramework/Engine/src/drivers/`, structurally copied from
`AgentEvalDriver` with `AIPromptRunner.ExecutePrompt` in place of
`AgentRunner.RunAgentInConversation`.

A test case's input definition supplies exactly the state the user-visible example
describes — *"a starting payload, a given conversation array of messages, and a system
prompt"* — mapped onto `AIPromptParams`
(`packages/AI/CorePlus/src/prompt.types.ts`):

| Test case input | `AIPromptParams` / mechanism |
|---|---|
| Agent under test (Research / Sage / Marketing / synthetic) | Resolves the agent's prompt + agent-type system prompt via the same composition `BaseAgent` uses (`childPrompts` + `agentSpecificPrompt` placeholder), so the rendered prompt is byte-identical to a real agent iteration |
| Starting payload | `_CURRENT_PAYLOAD` template data |
| Conversation messages | `conversationMessages` (includes prior action-result annotations for mid-loop cases) |
| System prompt variant | `systemPromptOverride` / template-data flags (`__agentTypePromptParams.*`) |
| Action list | Template data driving the action catalog section; in native mode, also the `ChatTool[]` declarations |
| Model/vendor/settings | `override`, `configurationId`, `effortLevel`; per-cell from the matrix (§3.3) |

Execution details the driver must honor: explicit `contextUser` (the CLI provider's
`CurrentUser` is null — issue #3251), `AIEngine.Instance.Config()` before first run, and
`WaitForPendingPromptRunSaves()` before oracles read `AIPromptRun` rows back (persistence
is fire-and-forget).

Single prompt runs are the corpus workhorse: given frozen mid-loop state, evaluate *one*
model decision deterministically. A smaller set of loop-level cases (multi-step, action
results fed back) runs through the existing `AgentEvalDriver` + `verifyAgentRun`
unchanged.

### 3.2 Agent-decision oracles

One new oracle family, registered via `TestEngine.RegisterOracle()` — but implemented
as framework-free functions per the §2.1 rule, with the `IOracle` classes as wrappers:

- **`agent-decision-match`** — the centerpiece. Normalizes the prompt-run result into an
  observed decision:
  - envelope mode: parse `LoopAgentResponse` → `{kind, actions[], subAgent, payloadChangeRequest, message, …}`
  - native mode: `ChatToolCall[]` present ⇒ `{kind: 'action', actions: toolCalls}` (per
    the implicit-control-flow design); otherwise parse the envelope as above
  then compares against the declarative expectation (§4.2). Score decomposes into
  decision-kind / action-name / per-param components so aggregate metrics fall out of
  `ResultDetails` without re-running anything.
- **`response-well-formed`** — no empty/discarded output, finish-reason recorded and
  acceptable, envelope parses when required. This is the oracle that measures the
  `MALFORMED_FUNCTION_CALL` class directly.
- **`prompt-run-persisted`** — thin wrapper over `verifyPromptRun`, plus (post-Layer 4)
  asserting `AIPromptRun.ToolCallingMode` matches the cell's expected mode — which also
  makes the instrumentation column itself a tested surface.
- **`trace-validate-sub-agents`** — the missing shipped oracle (§2, gap 5), used by
  loop-level cases.

Param matching supports per-param matchers (§4.2) because exact string equality is wrong
for LLM-authored values like SQL text: exact for enums/booleans/ids, JSON-schema for
structured params, regex/predicate for free text.

### 3.3 Configuration matrix

Axes (each test cell = corpus case × one combination):

| Axis | Values (baseline phase) | Added for native phase |
|---|---|---|
| Tool-calling mode | `envelope` (today's path) | `native`, `native+fallback` |
| Model × vendor | One model per generation per LLM developer (Anthropic, OpenAI, Google) — including the newest agentically-trained generation, the failure class under study. For each selected model, **every AIModelVendor pair is its own cell** (direct provider API plus each aggregator/cloud serving it — e.g. OpenRouter, Azure, Bedrock, Vertex), since inference-provider behavior is exactly what the vendor-level capability flags exist to capture | same |
| `toolChoice` | n/a | `auto`, `none`, `required` |
| Prompt settings | `responseFormat` Any/JSON; one non-default `effortLevel` cell | tools × JSON-mode interaction cells |
| Agent settings | stock agent configs (e.g., Research Draft/Standard/High) | `UseNativeToolCalling` at prompt vs promptModel level (gating exercised end-to-end) |
| Action list | 1 action; ~5 actions; Sage's full ~27; an ambiguous-names variant (near-duplicate action names) | identical, expressed as `ChatTool[]` |
| System prompt | full loop template; trimmed variant | native-conditional template (Phase 2, action catalog suppressed) |

Mechanism: a suite-generation script (in `integration-test-suite`) expands
corpus × matrix into `MJ: Tests` records via the test `Configuration` JSON — cells are
themselves metadata, so `mj test history/compare` and the dashboard work per cell.
Repeat count per cell: **N=20** for headline comparisons (detects a 35%→10%-scale shift
comfortably; the exemplar-fix experiment resolved significance at 40/condition),
**N=5** for broad sweep cells. The full matrix is deliberately sparse — not every axis
crosses every other; the generator encodes the meaningful slices and logs what it skips.

---

## 4. The Corpus

### 4.1 Sources

1. **Stock agents** — the corpus centers on **Research Agent, Sage, and Marketing
   Agent** (all Loop type), because they ship in every MJ environment and their metadata
   is public; Skip's agents are proprietary and stay out of MJ test content.
2. **Real run shapes, genericized** — Skip production runs (inspected via the Skip MCP
   server) provide realistic mid-loop states; each is translated onto a stock-agent
   equivalent before entering the corpus. Example actually observed: a Query Writer
   iteration whose envelope invoked `Test SQL Statement` with a multi-line SQL string, a
   nested `Parameters` object, and a boolean `Profile` flag — genericized onto the
   Database Research Agent's `Run Ad-hoc Query`. Loop shapes observed and mirrored:
   prompt → action → prompt (×6) → max-iteration failure; conductor-style sub-agent
   dispatch → dispatch → terminal synthesis.
3. **Synthetic adversarial cases** — targeting known failure modes: exemplars that bait
   prose imitation, params requiring careful quoting/escaping, near-duplicate action
   names, an actions-disabled agent asked to act, huge action catalogs.

### 4.2 Case format

Corpus cases are golden files (`@file:` referenced from `MJ: Tests` records, mirroring
`FinalPayloadValidation: @file:…` precedent) so inputs/expectations are reviewable and
diffable:

```jsonc
{
  "id": "research-db-adhoc-query-01",
  "agent": "Database Research Agent",
  "description": "Mid-loop: prior search found the entity; next step must run the ad-hoc query",
  "input": {
    "payload": { "databaseResearch": { "entitiesFound": ["Members"], "queries": [] } },
    "conversationMessages": [
      { "role": "user", "content": "How many members joined per month this year?" },
      { "role": "assistant", "content": "…prior envelope…" },
      { "role": "user", "content": "…action result annotation for Get Entity Details…" }
    ]
  },
  "expect": {
    "kind": "action",
    "actions": [{
      "name": "Run Ad-hoc Query",
      "params": {
        "SQL":    { "matcher": "regex", "pattern": "(?i)SELECT[\\s\\S]+FROM[\\s\\S]+GROUP BY" },
        "Format": { "matcher": "exact", "value": "json", "optional": true }
      }
    }],
    "allowAdditionalActions": false
  }
}
```

Expectation kinds — one per decision the envelope can express (plus a combinator):

| `expect.kind` | Verifies | Envelope encoding | Native encoding |
|---|---|---|---|
| `action` | name(s) + param matchers, parallel count | `nextStep.type='Actions'` + `actions[]` | `ChatToolCall[]` |
| `subAgent` | sub-agent name | `nextStep.type='Sub-Agent'` | envelope (stays) |
| `chat` | message present; **no** action/tool call | `nextStep.type='Chat'` | envelope + no tool calls |
| `taskComplete` | terminal + message; no calls | `taskComplete` | envelope + no tool calls |
| `payloadChange` | ops match (path-level matchers) | `payloadChangeRequest` | envelope (Phase 1/2) |
| `retry` | retry signaled | `nextStep.type='Retry'` | envelope |
| `anyOf` | any listed expectation passes | — | — |

Param matchers: `exact`, `schema` (JSON Schema), `regex`, `oneOf`, `numericTolerance`,
`optional` flag; unknown extra params configurable as warn or fail per case.

### 4.3 Case categories (initial corpus, ~40–60 cases)

| Category | Stock-agent anchor | Expectation | Why it matters |
|---|---|---|---|
| First-step action selection | Research → `Scoped Search`; Sage → `Get Weather` (clean deterministic params) | `action` | The basic accuracy number |
| Mid-loop action with rich params | Database Research → `Run Ad-hoc Query` | `action` w/ regex+schema matchers | The Skip-observed workhorse shape; param fidelity |
| Action-error recovery | Prior turn = failed action result → corrected retry | `action` (changed params) | Loop resilience, both modes |
| Action disambiguation | Sage full 27-action catalog; ambiguous-names variant | `action` | Where native calling should shine; where envelope degrades |
| Parallel actions | Multi-search fan-out (Google + Perplexity) | `action` ×2, parallel | Parallel-call variance across providers |
| Sub-agent dispatch | Marketing (pure orchestrator) → Copywriter/Editor; Research → Web/DB Research | `subAgent` | Stays in envelope in native mode — the hybrid-coherence probe |
| Terminal synthesis | After sub-agent results in conversation → final answer | `taskComplete` | The 1/8 failure class: does declaring tools suppress the envelope? |
| Plain chat / clarify | Ambiguous user question | `chat` or `anyOf(chat, action)` | Over-eager tool calling detection |
| Payload change | Marketing payload paths (`PayloadDownstreamPaths` scoping) | `payloadChange` | Envelope-side regression watch under native mode |
| Forced control flow | Max-iteration boundary state | `taskComplete` (native: `toolChoice='none'` cell) | Phase 2 forcing policy |
| Adversarial exemplars | Synthetic | varies | Quantifies prompt-level vs architectural fragility (issue §open-q 4) |

Loop-level companions (via `AgentEvalDriver`, ~6–10 cases): full Research/Sage/Marketing
runs on canned questions asserting trace shape (`trace-validate-sub-agents`,
`trace-no-errors`, iteration bounds) — extending the existing shipped research-agent
suite rather than replacing it.

---

## 5. Tiers

| Tier | LLM | Runs | Purpose |
|---|---|---|---|
| Unit | mocked | PR CI (Vitest) | Oracle logic (each matcher/kind against canned envelopes and tool-call results); §6.1 gating truth table; driver request-mapping (correct `ChatParams.tools` per provider, TestLLM-observed) |
| Integration — deterministic | `TestLLM` scripted | PR CI (`npm run test:integration`) | Harness end-to-end against live DB + stock metadata with scripted model outputs: `PromptEvalDriver` plumbing, prompt composition byte-fidelity, oracle wiring, `ToolCallingMode` persistence, fallback path (scripted tool-failure → envelope retry → `NativeFallback`) |
| Integration — live-model | real | **on-demand** — LTS builds and major agent-framework changes (registered in the integration-test list; no recurring cron) | The actual measurement: corpus × matrix, baseline and native phases |

The deterministic tier means the *measurement instrument* is verified on every PR without
spending a model token; live-model runs then only carry measurement noise, not harness
bugs.

---

## 6. Measurement Methodology

### 6.1 Metrics (per matrix cell, aggregated from `OracleResult[]`)

1. **Usable-response rate** — non-empty, non-discarded output (`response-well-formed`);
   1 − this is the malformed/discard rate, the issue's headline number.
2. **Structural validity** — envelope parses (envelope turns) / tool call well-formed
   and name-resolvable (native turns).
3. **Decision accuracy** — observed decision kind matches expectation.
4. **Action accuracy** — right action name(s), given an action was expected.
5. **Param fidelity** — per-param matcher pass rate.
6. **Cost profile** — prompt tokens (the 56–104KB claim, measured), completion tokens,
   latency, provider-reported cost, cache hit info.
7. **Finish-reason distribution** — provider-level diagnostic.
8. *(loop-level cases)* iterations-to-completion, fallback count, `ToolCallingMode`
   distribution.

### 6.2 Phases

- **Phase A — baseline (before any native code merges).** Corpus × envelope-mode matrix,
  N per §3.3. Persisted as `MJ: Test Runs`; this is the quantified current-state of the
  framework and stands alone as a deliverable (it also re-measures the issue's Gemini
  evidence inside MJ rather than outside it). **Expectation:** most current models
  should score at or near ceiling (~99%) on decision accuracy — the suite's primary
  role is **regression assurance** for the new behavior, not demonstrating broad
  improvement. The models where the baseline is *not* clean (the newest
  agentically-trained generation, the `gemini-3.7-flash` class) are where improvement
  is expected and measured. Pin provider model-snapshot IDs wherever the provider
  supports pinning, so Phase C reruns months later compare against the same weights.
- **Phase B — BaseLLM-layer probe (with implementation plan PR 2).** Direct driver-level
  sweep (option-B rigs are acceptable here): providers × {no tools, tools+auto,
  tools+none, tools+required, tools+named} × {responseFormat Any, JSON}, recording text
  present / call well-formed / parallel count / finish reason. Answers the cross-provider
  variance and JSON-mode interaction open questions with data before Phase 2 design
  freezes.
- **Phase C — native comparison (implementation plan PR 6 gate).** Identical corpus,
  native cells on — executed **incrementally, one expansion stage at a time (§6.3)**,
  not as a single big-bang run. Per stage: per-cell baseline vs native deltas on
  metrics 1–6, two-proportion significance tests on rates (the exemplar-fix precedent:
  40/condition resolved p ≈ 0.007), and a written go/no-go recommendation per provider.
  `mj test compare` per cell + a small scorecard script aggregating across cells (gap 4).

### 6.3 Native expansion stages

Native tool calling grows scope incrementally — actions first, then payload change
requests, then task completion / control flow. Each expansion gets its own bounded
comparison run and an explicit gate before the next stage starts. The mode-agnostic
expectation design (§1) is what makes this cheap: **the corpus never changes across
stages** — only the decision normalizer learns a new native encoding per stage, and
previously-passed stages re-run as regression watch.

| Stage | Native surface added | Corpus focus for this stage's cells | Evaluator change | Gate to advance |
|---|---|---|---|---|
| **N0** | none — baseline | entire corpus, envelope mode | — | Phase A recorded and written up (T6) |
| **N1** | Actions as native tools; envelope keeps all control flow | All `action` categories in native encoding, **plus every envelope category run with tools declared** — the coherence probe: the model must *not* emit a tool call when `chat` / `taskComplete` / `subAgent` / `payloadChange` is the right decision (this is the 1/8 failure class) | Normalizer reads `ChatToolCall[]` as `kind: 'action'` | ≥ baseline on decision accuracy + structural validity; materially better on at least one of malformed rate / prompt tokens / action accuracy; terminal-synthesis and dispatch regression within an agreed bound — per provider enabled |
| **N2** | `payloadChangeRequest` as a tool | `payloadChange` category in native encoding; mixed-decision turns (action + payload change in one iteration); payload-scoping cases (Marketing `PayloadDownstreamPaths`) | `payloadChange` kind gains a native encoding | Payload-op fidelity ≥ envelope baseline; **no regression** in re-run N1 cells |
| **N3** | Task completion + control flow as tools (full-tool model, fully implicit control flow: no tool call + text ⇒ terminal) | `taskComplete`, `subAgent`, `chat` categories as tool calls / absence-of-calls | Those kinds gain native encodings; "text, zero calls" normalizes to terminal | Full-surface comparison; per-provider decision on whether the envelope can be retired for these paths; no regression in N1/N2 cells |
| **N4** | Policy + multi-turn: per-step `toolChoice` forcing, tool results fed back as native `tool_result` turns; streaming still out of scope | Forced-control-flow cases (max-iteration boundary with `toolChoice: 'none'`); multi-turn native loop cases (schema shape reserved, §9.3) | Multi-turn support in the driver | — (measurement continues; no further surface planned) |

Stage boundaries are also **merge boundaries** for the implementer: each stage can ship
behind its metadata gates once its comparison run passes, without waiting for later
stages. N1 corresponds to implementation plan §8 (Phase 2 hybrid loop); N2 resolves
implementation-plan open question 2; N3 resolves open question 1 with data.

Phase C's stage gates are collectively the **eval gate for the native rollout**, and
they are regression-first: since baseline decision accuracy is expected near ceiling
for most models, the primary pass condition at every stage is **no regression** vs.
baseline on decision accuracy and structural validity, per provider enabled. The
affirmative-improvement condition (better malformed rate / prompt tokens / action
accuracy) applies to the cells where the baseline is degraded — the newest model
generations that motivated this work.

---

### 6.4 Manual and downstream validation (MJ Explorer + Skip)

The automated suites are complemented by hands-on validation in real environments at
each stage:

- **MJ Explorer manual testing.** The interactive AI test harness UI
  (`@memberjunction/ng-ai-test-harness` — Agent / Prompt / Action modes with the
  execution-tree monitor) for exploratory verification: flipping the gating flags,
  observing fallback behavior, and running the stock agents interactively.
- **Skip downstream validation — the originating environment.** The
  malformed-function-call failures motivating this work were first observed in Skip,
  a downstream agent product built on MJ, so it is the highest-signal real-world
  check. Per expansion stage:
  1. Import the MJ branch into a local Skip-Brain environment (yalc / npm link /
     `mj dev`).
  2. **Reproduce the baseline failure:** run Skip's Query Writer agent on the
     "Gemini 3.7 Flash" configuration (its prompt currently pins Gemini 3 Flash) and
     observe the intermittent action-invocation failures.
  3. **Enable native tool calling** for that prompt/model pair and measure whether
     action invocation improves and the Query Writer run-failure rate drops.
  4. Repeat for each expansion stage (N1–N3), and run the **full Skip pipeline
     end-to-end** with native tool calling enabled before a stage is considered
     validated.
- **Version caveat:** Skip currently pins MJ **5.51.2**. Local downstream testing
  requires bumping the Skip-Brain environment to MJ 6.x first (database migrations +
  package updates) before the branch can be linked in — budget setup time for this;
  it is the known-tricky part of the loop.

## 7. Invocation Reference

```bash
# from MJ repo root (env + mj.config.cjs are cwd-relative)
npm run test:integration                                   # deterministic tier (PR gate)
MJ_INTEGRATION_TEST=1 npx mj test suite --name "Native Tool Calling — Baseline"
MJ_INTEGRATION_TEST=1 npx mj test run --name "research-db-adhoc-query-01 [gemini-3.7-flash × envelope]"
npx mj test compare …                                      # cell-level baseline vs native
npx mj test validate --type "Prompt Eval"                  # corpus lint, no execution
```

Seeding: **this test content is never part of stock MJ.** Corpus + suite records live
under `metadata-optional/` (the same never-shipped, opt-in-push location as the existing
integration-test fixtures and synthetic "IT:" agents) and are pushed only into local/CI
test databases; golden files live in the private `integration-test-suite` package
(`private: true`, never published). No customer environment ever receives any of it.

---

## 8. Deliverables

| # | Deliverable | Where | Depends on |
|---|---|---|---|
| T1 | `trace-validate-sub-agents` oracle (bug fix) | `Engine/src/oracles/` | — |
| T2 | `PromptEvalDriver` + `Prompt Eval` test type | `Engine/src/drivers/`, `metadata/test-types/` | — |
| T3 | Decision oracles + matcher library + unit tests | `Engine/src/oracles/` | — |
| T4 | Corpus v1 (~40–60 prompt-level + ~8 loop-level golden files) + suite generator | `integration-test-suite`, `metadata-optional/` | T2, T3 |
| T5 | Deterministic-tier checks (TestLLM-backed harness verification) | `integration-test-suite/src/checks/` | T2–T4 |
| T6 | **Phase A baseline run + write-up** | test runs + short report doc | T4, T5 |
| T7 | Phase B BaseLLM matrix rigs + write-up | `integration-test-suite/rigs/` | impl. plan PR 2 |
| T8 | Phase C staged comparison runs (§6.3, one per stage N1–N4) + scorecard script + per-stage go/no-go reports | — | impl. plan PR 6, T6, T7 |

T1–T6 have no dependency on any native-tool-calling code and can start immediately —
which is the point: **the baseline exists before the feature does.**

## 9. Open Questions

1. Multi-turn native cases (tool results fed back as `tool_result` turns) need Phase 2
   plumbing before they're expressible — corpus schema should reserve the shape now.

Resolved since first draft: model-snapshot pinning — yes, where the provider supports
it (§6.2); live-model cadence — on-demand at LTS builds and major agent-framework
changes, no recurring cron (§5); the suite generator should still emit an
estimated-cost manifest per run so an on-demand invocation's spend is known up front
(§3.3).
