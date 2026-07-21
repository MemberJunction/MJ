# Extended Agents Integration Test Sub-Suite — Proposal v2 (real models, structural determinism)

**Status:** DRAFT v2 for Amith's review (2026-07-21). **Supersedes v1** (the scripted `ItTestLLM` stand-in-driver design — preserved in this file's git history) per direction change: **no new/fake/custom driver — test agents are configured purely via metadata to use REAL drivers and REAL models (Gemini, OpenAI, Cerebras, etc.), API keys assumed present in the test system's `.env`.**
**Parent plan:** [README.md](README.md) · Catalog: [test-catalog.md](test-catalog.md) Domain 4
**Scope:** a new family of agent-framework integration bundles covering the advanced behaviors — long-conversation compaction, tool-result carry-forward, artifact interrogation, payload guards, skills/plan-mode, memory guards, RAG/search — via **purpose-built test agents seeded in `metadata-optional/`** (never polluting the base system) plus **structural checks over the shipped agents** (Query Builder, Sage, Research Agent). Determinism = **process-level/structural assertions over framework observables**, never model prose. Explicitly **NOT** in scope: LLM-as-judge / output-quality evals (§11).

---

## 1. Executive summary

The agent framework's most valuable machinery — loop step lineage, cross-turn compaction, tool-result carry-forward, sub-agent payload scoping, skill activation, plan-mode gating, memory-write guards, artifact interrogation, agent-facing search — has no end-to-end integration coverage: unit tests mock the loop; `conversation-compaction` CC1–CC12 exercises only the *assembly* layer with hand-fabricated runs; `agent-runner` AR1 is a single live smoke.

**Ground rules (Amith):** real drivers, real models, metadata-only configuration, no credential gymnastics — and still **deterministic-correctness** testing. The resolution: the *model* is nondeterministic but the *framework* is not. Every check asserts state the framework produces deterministically — `AIAgentRunStep` types/ordering/`Skills` provenance, `AIAgentRun.Status`/`PlanMode`, `MJ: AI Agent Requests` rows, payload-violation records in step `OutputData`, **`AIPromptRun.Messages`** (the byte-exact prompt each turn actually received), artifact-tool extractions (pure code over checked-in assets), and arithmetic identities over real token counts. Model prose is **never** asserted.

This is already an in-repo precedent: the **agent-memory rig** (`packages/TestingFramework/integration-test-suite/rigs/agent-memory-tests.ts`) runs live Sage and asserts only deterministic transitions — its own header: *"The SPECIFIC memories are nondeterministic (LLM), so every assertion is at the PROCESS level"* — with marker-string isolation and self-cleaning `finally`. This proposal generalizes that pattern into registered bundles and adds two disciplines: a **two-phase compliance/assertion protocol with bounded retries** (§3.3) so residual model flake is surfaced honestly (never skip-as-pass, never vacuous), and **fabricate-then-observe** (§3.4) — hand-create prior persisted state, then spend exactly ONE live turn observing the framework's reaction.

Deliverables: a 13-agent metadata-seeded roster whose **prompts are a first-class engineering surface** (imperative single-action scripts + the framework's own `OutputType='object'`/`ValidationBehavior='Strict'`/`MaxRetries` structured-output ladder, §3.2); **multi-vendor model bindings as both resilience AND a test target** (failover is itself checked, §3.5); checked-in artifact asset files + expected-value MANIFEST (§4.4); and **ten bundles (~65 checks)** (§5–§10), each stating the failure it catches and why it cannot pass vacuously. Tier: **live-model — ON by default** since the 2026-07-20 gate inversion (`tiers.ts:7`); CI pins `RUN_AGENT_TESTS=0`, so these run locally/nightly, not in the PR gate (§3.6). A handful of engine-level checks need no LLM and join the blocking deterministic tier. Honest cost: **well under $1 per full run** on Flash/nano-class models (§3.5).

---

## 2. Where coverage stands today (verified inventory)

| Existing asset | What it covers | What it deliberately does NOT cover |
|---|---|---|
| `conversation-compaction` CC1–CC12 (`packages/TestingFramework/integration-test-suite/src/checks/conversation-compaction.checks.ts`, IT30, deterministic tier) | Sequence trigger; `GetAgentContextWindow` boundary selection/recursion/exclusion; retrieval tools paging stored history; single-INSERT Compaction step; **CC10** carry-forward *loader* (DB fallback, cache precedence, agent-scoping both directions); `AssembleContextWindow` parity; concurrent sequence assignment | Everything requiring a real turn: no run ever *fires* a compaction pass; no prompt ever *receives* a carried-forward replay |
| `ai-skills` AS1–AS21 (`.../checks/ai-skills.checks.ts`, IT12) | ALL data-layer gates: availability (None/All/Limited), double-activation-gate math, permission validators, SKILL.md round-trip; AS10 *hand-fabricates* `PlanMode` + `Skills` JSON persistence | Real `Skill` step emission, runtime demotion, plan pause/resume/reject — the loop legs |
| `agent-runner` AR1 / `prompt-runner` PR1 (IT17/IT16, live-model) | Live smoke: one agent + one prompt run reach terminal, verified by the deep verifiers `verifyAgentRun`/`verifyPromptRun` (`testing-integration/src/ai-verify.ts`) | Any advanced behavior. Housekeeping: PR1's header claims RUN_AGENT_TESTS gating but its `NamedCheck` doesn't set `RequiresLiveModel` (AR1 does, `agent-runner.checks.ts:63`) — fix when this family lands |
| **`rigs/agent-memory-tests.ts`** (standalone rig, live-model, client transport) | **The precedent this proposal generalizes**: live Sage runs → only deterministic transitions asserted (≥1 `MJ: AI Agent Notes` Provisional→Active→injected, `AccessCount` bump), marker-isolated, robust to "the LLM may not emit a write this run" by running a few convos and asserting ≥1 | It's a rig — no IT record/suite membership; one memory phase only (no guard-pipeline coverage) |
| Unit tests (`packages/AI/Agents/src/__tests__/`) | carry-forward units (`prior-turn-tool-results.test.ts`), skill-step/plan-gate logic units, mocked pre-execution RAG | The seams; **PayloadManager guard enforcement: ZERO unit AND zero integration coverage** (grep-verified) |
| `packages/SearchEngine/src/__tests__/` | Mocked RRF/permission/provider logic | **Zero TestingFramework search coverage** (grep-verified) |

---

## 3. Determinism strategy — structural correctness over real models

### 3.1 The observable surface (deterministic even when the model isn't)

| Observable | Where | What it proves |
|---|---|---|
| Step lineage | `AIAgentRunStep.StepType/Status/CompletedAt/TargetLogID` ordering | loop sequencing; terminality (the `ai-verify.ts:96` invariant); pause/resume linkage |
| Run state | `AIAgentRun.Status/PlanMode/TotalTokensUsed/ErrorMessage/ResumingAgentRunID` | terminal correctness, gate stamping, resume chains |
| **The assembled prompt** | `AIPromptRun.Messages` → `MJAIPromptRunEntityExtended.ParseMessagesData()` | byte-exact proof of what a turn *received*: carry-forward reference vs. full dump, payload strip, skill instructions, `<retrieved_context>`, artifact manifest — **the single most valuable observable in this suite** |
| Guard outcomes | `payloadValidation.upstreamMergeViolations`/`blockedOperations` in Sub-Agent step `OutputData` (`base-agent.ts:8303`); `FinalPayloadValidationMessages` (:4405); Memory-Write step dispositions | enforcement + auditability in one assertion |
| HITL surface | `MJ: AI Agent Requests` rows (`Status`, `OriginatingAgentRunStepID`); Chat-shaped terminal steps | plan-mode pause/approve/reject mechanics |
| Skills provenance | `AIAgentRunStep.Skills` JSON; dropped-request system notes | activation audit trail |
| Compaction persistence | boundary `ConversationDetail.SummaryOfEarlierConversation` (asserted non-null, never content-asserted) + `SummaryPromptRunID`; Compaction step `OutputData`; window shape from `GetAgentContextWindow` | cross-turn compaction machinery |
| Tool results | `_ARTIFACT_TOOL_RESULTS` / injected tool messages; action step `OutputData` | extraction correctness — pure code over checked-in assets, byte-deterministic even when invocation is model-driven |
| Arithmetic identities | run totals = Σ child `AIPromptRun` totals; `AccessCount` deltas; sequence monotonicity | cost rollup / injection proof — exact math over nondeterministic magnitudes |

### 3.2 Prompts as a design surface (engineering compliance up)

Each test agent's prompt is an **imperative single-action script**, not an open task: *"You are a test agent. On your first response you MUST return `nextStep.type='Actions'` calling `Calculate Expression` with `expression` exactly `'6*7'`. On your second response you MUST return `taskComplete=true`. Never do anything else."* Reliability levers — all ordinary metadata on the `MJ: AI Prompts` row (fields verified in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`):

- **Framework-enforced structured output**: `OutputType='object'` + `OutputExample` + `ValidationBehavior='Strict'` + `MaxRetries` (:7163–7193) — the runner's own Strict-retry ladder re-asks on malformed/non-conforming JSON, so structural compliance is *enforced by the framework*, not hoped for.
- **`Temperature`/`TopP`** on the prompt row (:6616–6621), pinned to 0/low where the vendor supports it.
- **Small decision space**: each agent gets exactly one action / one sub-agent / one artifact, so the instructed call is the only sensible move.
- **Loop format**: the Loop system prompt already demands raw-JSON `LoopAgentResponse` (`packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` — `taskComplete`, `payloadChangeRequest`, `artifactToolCalls`, `conversationToolCalls`, `memoryWrites`, `nextStep.type ∈ …|'Skill'|'Plan'`); test prompts restate the exact `nextStep` object expected.

### 3.3 Two-phase assertion + bounded retry policy (flake handled honestly)

Every live check separates **compliance** from **correctness**:

1. **Phase P — precondition (model compliance):** did the model take the instructed action? Proven from positive artifacts (the Actions/Sub-Agent/Skill/Plan step exists; the persisted raw response contains the attempted path/tool/skill name). **On P-failure:** re-run the whole scenario with a fresh marker, up to **2 retries (3 attempts total)**. Still non-compliant → the check **FAILS loudly with a `model-noncompliance:` message** — never skip-as-pass (plugs into the parent plan's A1 honest-status work; chronic noncompliance is a prompt bug to fix, not flake to absorb).
2. **Phase A — assertion (framework correctness):** given P held, assert the machinery. **Never retried** — one observation of wrong framework behavior is a genuine failure.

**Anti-vacuity rule:** a guard assertion may only run after P proved the guarded behavior was *attempted* — "no violation recorded" can never pass when no violation was tried.

### 3.4 Fabricate-then-observe (one live turn per scenario)

The framework reads persisted state, so checks **hand-fabricate prior state in the DB** (the CC1–CC12 fixture technique) and spend exactly one live turn observing the reaction:

- **Carry-forward:** fabricate a settled prior root run (`AwaitingFeedback`) + Tool steps with known/oversized `OutputData` (exactly what CC10 fabricates), run one real turn, assert the injected replay in that turn's `AIPromptRun.Messages`. This is how the 100k-cap check works with real models — no live action produces 100k on demand.
- **Compaction:** fabricate a long `ConversationDetail` history + tight seeded budget knobs, run one real turn, assert the post-turn pass persisted the boundary summary and the *next* window folds to [summary, tail].

This collapses multi-turn scenarios to single live calls — cheaper, faster, and far less compliance surface.

### 3.5 Model/vendor strategy — metadata-pinned real models; failover is a test target

Every roster prompt carries `MJ: AI Prompt Models` bindings (credential-priority rung 2 in `resolveCredentialForExecution`, `packages/AI/Prompts/src/AIPromptRunner.ts:416-483`; driver resolution `modelVendor.DriverClass || model.DriverClass`, instantiated via `ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKey)` at :3513, keys resolved by the standard `GetAIAPIKey`/`.env` path — **zero test-specific credential machinery**). Registered real driver classes (grep-verified in `packages/AI/Providers/*/src/models/*.ts`): `OpenAILLM`, `CerebrasLLM`, `GroqLLM`, `AnthropicLLM`, `xAILLM`, `MistralLLM`, `FireworksLLM`, … (`GeminiLLM` is the DriverClass on the Gemini model rows in `metadata/ai-models/.ai-models.json`; provider package at `packages/AI/Providers/Gemini` [VERIFY exact registration file — a naming-pattern grep missed it]).

| Rank | Model (existing rows in `metadata/ai-models/.ai-models.json`) | Driver | Role |
|---|---|---|---|
| Primary | **Gemini 2.5 Flash-Lite** (or Gemini 3 Flash) | `GeminiLLM` | fast, near-free, strong JSON compliance |
| Secondary | **GPT 4.1 Nano** / **GPT 5-nano** | `OpenAILLM` | vendor-diversity failover |
| Tertiary | Cerebras/Groq-served open-weight rows | `CerebrasLLM`/`GroqLLM` | latency floor, third-vendor resilience |

Two consequences, both deliberate:
- **Resilience:** a vendor outage degrades to the next binding instead of failing the suite — and because assertions are structural, **swapping models never rewrites a check**.
- **Failover chains are a first-class test target** (catalog AI9's spirit, with real vendors): a check deactivates the primary binding in-fixture and asserts the run completed on the secondary — the winning model/vendor is persisted on the `AIPromptRun`, so the assertion is structural — with no double-billing in the rollup identity. See AL7.

**Honest cost estimate:** ~48 live checks × ~2–3 model calls × (≈2–4k in + ≈0.2–0.5k out) tokens ≈ **0.3–0.7M input / 40–80k output per full run** → cents at Flash-Lite/nano pricing. The shipped-agent bundle (§5b — Query Builder/Sage/Research Agent are heavier, multi-step, on their own configured models) adds a few tens of larger calls. **Conservative ceiling: < $1 per full-suite run; worst-case compliance retries ×3 still low single-digit dollars.** Negligible at local/nightly cadence.

### 3.6 Tier placement and its implications

All loop-running bundles are **live-model tier** (`RequiresLiveModel: true`), joined to the **"Integration Tests — Live Model"** suite. Per the 2026-07-20 gate inversion (`testing-integration/src/tiers.ts:7-11`) the tier is **ON by default — opt out with `RUN_AGENT_TESTS=0`** (invoking the live suite is already an explicit act; the old double-opt-in was removed). So: every local/nightly `mj test suite "Integration Tests — Live Model"` run exercises the whole family with `.env` keys; **CI pins `RUN_AGENT_TESTS=0`** (no credentials, no flake budget), leaving the PR gate unaffected. Stated plainly: agent-behavior regressions surface on dev machines and nightly runs, not per-PR — acceptable because the deterministic PR gate still holds the assembly/data layers (CC/AS bundles), and a scheduled keyed CI lane can adopt the live suite later (Q3). The LLM-free checks below (CE1, RS1–RS3/RS7) are ordinary deterministic-tier members.

---

## 4. Test fixtures in `metadata-optional/integration-test/` (mj-synced; base system never polluted)

Extends the seeded-principal precedent (`users/.integration-test-users.json` → `it-rls-a/b@integration.test`, `it-nogrant@integration.test`; role `Integration Test: RLS Scoped Reader`, "Safe to delete"). All new records: `uuidgen` primary keys, no `sync` blocks at authoring, `IT:`-prefixed names, descriptions tagged "(mj-integration-test — safe to delete)". New `ai/` subtree in the root `.mj-sync.json` `directoryOrder`:

```
metadata-optional/integration-test/
├── ai/
│   ├── prompt-categories/ + prompts/        # one Loop-format prompt per roster agent — the §3.2 design surface
│   │   └── templates/*.md                   # @file: imperative single-action prompt bodies
│   │   (each prompt: OutputType='object' + OutputExample + ValidationBehavior='Strict' + Temperature 0
│   │    + MJ: AI Prompt Models bindings to the §3.5 ladder — @lookup by model Name)
│   ├── agent-categories/.it-agent-category.json
│   ├── agents/.it-*.json                    # roster (§4.2): TypeID=@lookup Loop, prompts, actions, sub-agent wiring
│   ├── skills/.it-probe-skill.json          # one Active skill bundling one harmless action
│   ├── search/.it-search-scope.json         # scope + provider/entity rows for §10
│   └── artifact-assets/                     # PLAIN FILES, not entity records (§4.4)
│       ├── sample.json  sample.csv  sample.xml  sample.md
│       ├── sample.pdf   sample.png  sample.bin
│       └── MANIFEST.json                    # expected values: headers, row counts, sha256s, page count, node values
```

**No test model/vendor rows and no test drivers** — the roster binds to *production* model rows by `@lookup` name; the only AI metadata created is prompts/bindings/agents/skill/scope, all IT-prefixed and removable in one sweep.

### 4.1 Seed vs. runtime split

- **Definitions** (agents, prompts, bindings, skill, scope) are mj-synced — stable IDs, one-command provisioning (`npx mj sync push --dir=metadata-optional/integration-test`), the RLS-principal pattern. Runtime creation of the agent graph per run would re-test mj-sync, not the loop.
- **Run products** (Conversations/Details, Artifacts/Versions, AIAgentRuns/Steps, notes) are created by bundle `Setup`/checks with a per-run **marker string** (the rig's isolation technique) and FK-order-deleted in `Teardown` (the `ConversationCompactionFixture` accumulator pattern, `testing-integration/src/check.ts:292`).
- **Artifact content:** text types inline in `ArtifactVersion.Content`; binary (PDF/PNG/bin) as `data:<mime>;base64,` URLs in `Content` — `ArtifactToolManager`'s `ExtractBase64FromDataUrl` decodes these; no MJStorage/FileID dependency.

### 4.2 The test-agent roster (13 agents, `Type=Loop`, `Status=Active`, category `IT: Integration Test`)

| Agent | Distinctive metadata | Powers |
|---|---|---|
| **IT: Echo Agent** | bare minimum; prompt: `taskComplete` immediately | `agent-loop-live` smoke/lineage/cost |
| **IT: Tool Loop Agent** | one action — **Calculate Expression** (the `user-routines` fixture precedent, `UserRoutinesFixture.CalcActionID`) | action steps; carry-forward observing turns |
| **IT: Failover Agent** | same prompt shape; primary model binding deliberately deactivatable in-fixture | AL7 failover chain |
| **IT: Payload Parent** | `PayloadDownstreamPaths=["customer.*"]`, `PayloadUpstreamPaths=["analysis.*:add,update"]` | `agent-payload-guards` |
| **IT: Payload Child** | sub-agent; prompt: MUST return `payloadChangeRequest` writing `analysis.result` AND `secret.leak` | violation attempts |
| **IT: Payload Scoped Child** | `PayloadScope='/analysis'` | scope slice/reverse |
| **IT: Self-Write Restricted** | `PayloadSelfWritePaths=["notes.*"]`; prompt writes `notes.a` + `config.b` | self-write guard |
| **IT: Plan Agent** | `SupportsPlanMode=true` | per-request plan gate |
| **IT: Always-Plan Agent** | `RequirePlanMode=true` | forced gate |
| **IT: Skill Probe Agent** | `AcceptsSkills='Limited'` + grant to IT: Probe Skill; `SkillActivationMode='RequestedOnly'` | `agent-skills-live` |
| **IT: Artifact Reader** | prompt: MUST call the named artifact tool with given args, then stop | `agent-artifact-tools` |
| **IT: Compaction Agent** | tight agent-level compaction budget knobs | `agent-compaction-e2e` |
| **IT: Memory Writer** | `AllowMemoryWrite=true` + note-type restriction; prompt: MUST emit the listed `memoryWrites` | `agent-memory-guards` |
| **IT: Search Agent** | `SearchScopeAccess='Assigned'` + IT scope; granted `__Scoped_Search` | `agent-rag-search` live legs |

Permission-negative legs reuse `it-nogrant@integration.test` / `it-rls-*` (resolve-by-email, `check.ts:54`) rather than minting users.

### 4.4 Asset files + MANIFEST

`MANIFEST.json` is the single source of expected values (headers, row counts, sha256s, page count, node values, sentinel strings) so checks never duplicate constants. Assets tiny (<20KB), text-layer PDF (generated once, checked in), deterministic PNG. Known product gaps the assets deliberately expose (verified): **no XMLToolLibrary** (XML falls to `TextToolLibrary` grep) and **no image metadata extraction** (only `GenericBinaryToolLibrary` sha256/size) → Q6.

---

## 5. Bundle `agent-loop-live` (AL1–AL7) — the live loop foundation

**Tier:** live-model. **Fixture:** accumulator + marker, FK-ordered teardown. Bodies reuse `verifyAgentRun`/`verifyPromptRun` (`testing-integration/src/ai-verify.ts`) so this family and AR1/PR1 assert identical invariants.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| AL1 | IT: Echo run → `Status='Completed'`, **every** step terminal with `CompletedAt` (catalog AI10, `ai-verify.ts:96`) | orphan `Running` steps |
| AL2 | IT: Tool Loop run → step sequence contains Prompt→Actions(`TargetLogID` set)→Prompt→terminal in order; P-artifact: the Actions step with the instructed action name | loop mis-sequencing, action-linkage loss |
| AL3 | Post-action `AIPromptRun.Messages` contains the action's output (`42` for `'6*7'` — deterministic *action* output, not model output) | action results dropped from context |
| AL4 | Cost-rollup identity: `AIAgentRun.TotalTokensUsed` = Σ child `AIPromptRun` totals; all counts > 0 (exact arithmetic over nondeterministic magnitudes) | double-billing / dropped rollup (catalog AI7 seam) |
| AL5 | Chat pause: instructed `Chat` step → run lands `AwaitingFeedback`, Chat-shaped terminal step + conversation detail written | HITL pause path broken (prereq for §9) |
| AL6 | Failure path: agent whose only action is deactivated in-fixture → run terminates non-`Completed`, `ErrorMessage` populated, steps still terminal | failure leaving runs/steps inconsistent |
| AL7 | **Failover chain (real vendors):** primary binding deactivated in-fixture → run completes on the secondary (persisted `AIPromptRun` model/vendor = the secondary binding), rollup identity still holds | failover ladder silently broken / double-billing on failover (catalog AI9, real-vendor form) |

*Deferred from v1 (impossible without a scripted model, by design):* forced-malformed-JSON Strict-retry ladder (v1 AL5 / catalog AI11 — you cannot reliably instruct a real model to emit invalid JSON; belongs in a fault-injection unit test in `packages/AI/Prompts`) and exact scripted token-count equality (v1 AL4 — replaced by the AL4 rollup identity).

## 5b. Bundle `shipped-agents-live` (SA1–SA4) — the real shipped agents as standard live members

Per direction: the shipped agents are themselves standard live-tier test subjects, asserted structurally (never on content). Names verified in `metadata/agents/`: **Sage** (`.sage-agent.json`), **Query Builder** (`.query-builder-agent.json`, sub-agent **Query Strategist**), **Research Agent** (`.research-agent.json`, sub-agents **Database/File/Web Research Agent**, **Research Report Writer**) — all `Type=Loop`, `Status=Active`.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| SA1 | Sage: bounded instructed task → terminal run, all steps terminal, rollup identity holds (`verifyAgentRun` deep pass) | flagship-agent wiring rot (prompts/actions/model bindings drift) |
| SA2 | Query Builder: trivially-scoped instructed task → run completes; if it delegated, the Sub-Agent step for Query Strategist links a child run that is itself step-terminal | parent↔sub-agent lineage breakage on a shipped hierarchy |
| SA3 | Research Agent: narrowly-bounded task ("answer from the provided text only" — no web) → terminal run; any sub-agent runs linked + terminal; no orphan steps across the whole tree | multi-sub-agent tree termination/linkage regressions |
| SA4 | All three: `ConversationID`/details written when run with a conversation; artifacts (if `ArtifactCreationMode` fires) linked, not orphaned | conversation/artifact plumbing drift on real agents |

Smoke-depth by design — shipped prompts aren't imperative test scripts, so P-compliance is looser and assertions stick to what ANY successful run must satisfy. Deeper shipped-agent behavior stays with the Computer-Use suite (and the deferred eval track).

## 6. Bundle `agent-carry-forward` (CF1–CF6) — fabricate-then-observe

Machinery (verified): `packages/AI/Agents/src/prior-turn-tool-result-cache.ts` (BaseSingleton, `MJLruCache` 500/30min, key `NormalizeUUID(conversationId)::NormalizeUUID(agentId)`, empty-array negative cache), `tool-result-format.ts`, injection in `base-agent.ts` — ONE transient user message (`metadata.messageType='tool-result'`, `expirationTurns:2`, per-result 500-char compact, `maxStandaloneToolResultChars=100000` cap + omitted-for-size markers, header "Tool results from your previous turn (still valid — reuse instead of re-calling):"), populated in `finalizeAgentRun` only at `depth===0 && Status∈{Completed,AwaitingFeedback}`. CC10 covers the *loader*; this bundle proves the **prompt-visible behavior**, fabricating the prior turn (§3.4) so only the observing turn is live.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| CF1 | Fabricated settled prior run + Tool steps with known `OutputData` → one live turn: its `AIPromptRun.Messages` contains exactly ONE injected message with the carry-forward header and the ≤500-char compacted result — NOT the full payload | regression to full re-dump (token blow-up) or to nothing (agent re-calls tools) |
| CF2 | Fabricated >100k combined prior results → injected message size-capped with truncation/omitted-for-size markers | unbounded context growth |
| CF3 | Cache-cold vs. cache-warm observing turns produce byte-identical injected messages (DB fallback ≡ cache) | cache/DB divergence — stale or differently-shaped replay |
| CF4 | Same conversation + different agent, and same agent + different conversation → NO injected message | cross-agent / cross-conversation tool-result leakage |
| CF5 | Fabricated prior run `Status='Failed'` → no injection (settled statuses only) | replaying results from failed runs |
| CF6 | Injected message absent after expiry (`expirationTurns:2`): observe turn 1 (present) vs. turn 3 (absent) | transient message immortality (context bloat) |

## 7. Bundle `agent-payload-guards` (PG1–PG9) — sub-agent payload scoping

Machinery (verified): `PayloadManager` (`packages/AI/Agents/src/PayloadManager.ts:159`); `AIAgentEntity.PayloadDownstreamPaths`/`PayloadUpstreamPaths` (default `["*"]`, dot-paths + `:add,update` op suffixes); nullable `PayloadSelfWritePaths` (**unrestricted default**, `base-agent.ts:8735/8953`); `PayloadScope` (`applyPayloadScope` :1692; missing path = hard Critical failure, `base-agent.ts:9294` — the one fail-closed guard). Downstream extraction silently strips (:9241); upstream merge blocks into `blockedOperations`, persisted as `payloadValidation.upstreamMergeViolations` in the Sub-Agent step's `OutputData` (:8303). **Zero existing unit or integration coverage — the highest-value bundle in this proposal.** P-artifact for every guard check: the child's persisted raw response contains the attempted path — "nothing blocked" cannot pass when nothing was tried.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| PG1 | Child's `AIPromptRun.Messages` payload contains `customer.*` only — sibling keys stripped (downstream filter) | parent-state leak into sub-agents |
| PG2 | Child attempts `analysis.result` + `secret.leak` → parent payload gains only `analysis.*`; step `OutputData.payloadValidation.upstreamMergeViolations` names `secret.leak` with op + reason | violation merged silently, or blocked-but-unlogged (unauditable) |
| PG3 | Instructed **delete** on `analysis.x` under an `:add,update` grant → blocked + recorded | per-op suffix regression (delete sneaking through) |
| PG4 | `PayloadUpstreamPaths=[]` variant → ALL child changes ignored + "No upstream paths specified" warning (`PayloadManager.ts:257`) | empty-grant treated as all-grant |
| PG5 | Scoped child sees ONLY the `/analysis` subtree as its payload root (its prompt Messages prove it); writes land back under `/analysis` (`reversePayloadScope` :1729) | scope slice/unslice asymmetry corrupting the parent payload |
| PG6 | `PayloadScope` naming a missing path → hard fail with the "Critical: Failed to extract payload scope" message — pinned fail-closed contract | softening of the one fail-closed guard |
| PG7 | Default (null paths) agent writes anywhere (pin fail-open contract); IT: Self-Write Restricted: `config.b` blocked + recorded, `notes.a` lands | default flipping closed (breaks all agents) / restriction not enforcing |
| PG8 | Child run forced to fail (deactivated action) → NO upstream merge at all | merging partial state from failed sub-agents |
| PG9 | BREAK ATTEMPT — malformed `PayloadDownstreamPaths` JSON currently fails **open** to `["*"]`; check pins whichever behavior Amith rules (Q4) | silent drift on a security-adjacent default |

*Flag (verified product asymmetry, not a check):* the related-agent mapping path (~`base-agent.ts:10435`) builds its summary **without** attaching `upstreamMergeViolations` — related-agent violations surface only as generic warnings → Q4c.

## 8. Bundle `agent-artifact-tools` (AT1–AT9) — interrogation across artifact types

Machinery (verified): per-type `BaseArtifactToolLibrary` subclasses resolved via ClassFactory from `ArtifactType.ToolLibraryClass`, orchestrated by `ArtifactToolManager` (`packages/AI/Agents/src/ArtifactToolManager.ts` — alpha IDs, manifest, `CompositeArtifactToolLibrary`, exception-wrapped dispatch :498, >50k text externalization). Agent invokes via `LoopAgentResponse.artifactToolCalls`; results injected next turn via `_ARTIFACT_TOOL_RESULTS`. Libraries: JSON (`json_path/keys/search`), CSV (`get_columns/get_rows/search`), PDF (pdfjs: `get_page_count/get_text/search_text/get_metadata`), Text/MD (`grep`), `GenericBinaryToolLibrary` (`sizeBytes`+`sha256`). **Key insight: extraction is pure code over checked-in assets — results are byte-deterministic even though invocation is model-driven.** P-artifact per check: the tool call recorded with the instructed tool+args.

| ID | Structural assertion (expected values from MANIFEST.json) | Failure it catches |
|---|---|---|
| AT1 | Turn-1 `AIPromptRun.Messages` lists all attached artifacts with alpha IDs | agent blind to artifacts (manifest seam) |
| AT2 | CSV `get_columns`/`get_rows`: exact headers, `rowCount===N`, known cell values in `_ARTIFACT_TOOL_RESULTS` | CSV parser/paging regression |
| AT3 | JSON `json_path`/`json_keys`: known node value + exact top-level key set | JSON navigation regression |
| AT4 | PDF: `get_page_count===N`; `search_text` finds the seeded phrase w/ page number; metadata title/author match | pdfjs extraction regression (incl. dependency upgrades) |
| AT5 | MD/Text `grep`: exact match count + line for a sentinel regex | text library regression |
| AT6 | XML (today's contract): `grep` via `TextToolLibrary` works; NO xpath tool in the manifest — pins the current surface honestly | undocumented surface drift; keeps Q6 honest |
| AT7 | PNG `get_metadata`: `sizeBytes`+`sha256` equal MANIFEST values (the universal binary anchor) | binary corruption anywhere in the store→decode→tool chain |
| AT8 | Truncated-JSON artifact → structured error result (:498); run continues to terminal | one bad artifact crashing the whole run |
| AT9 | >50k text artifact externalized (`ShouldExternalizeContent`): manifest advertises tools-only; content NOT inlined in the prompt | context blow-up from large artifacts |

## 9. Bundles `agent-skills-live` (SL1–SL5), `agent-plan-mode` (PM1–PM6), `agent-compaction-e2e` (CE1–CE9), `agent-memory-guards` (MG1–MG5)

### 9.1 `agent-skills-live` — what AS1–AS21 cannot reach

Entry: `RunAIAgentResolver` / `ExecuteAgentParams.requestedSkillIDs`; `preActivateRequestedSkills` (`base-agent.ts:11449`, root-only, drops unentitled + `notifyDroppedSkillRequests` system note); `validateSkillNextStep` (:4181) demotes hallucinated/`RequestedOnly` self-activations to Retry.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| SL1 | Run with `requestedSkillIDs=[ProbeSkill]` → real `StepType='Skill'` step with `AIAgentRunStep.Skills` provenance recording the requested activation | activation without audit trail, or none |
| SL2 | Request including an unentitled skill → dropped + system note present; run proceeds | silent grant escalation / hard-fail on droppable |
| SL3 | Instructed `nextStep='Skill'` naming a nonexistent skill (P-artifact: raw response contains it) → demoted-to-Retry step recorded | hallucinated-skill activation |
| SL4 | Instructed self-activation of the `RequestedOnly` skill un-requested → demoted (runtime leg of the double gate, complementing AS math) | ActivationMode enforced in metadata only |
| SL5 | Post-activation turn's `AIPromptRun.Messages` contains the skill Instructions + widened tool surface | activation recorded but not applied |

### 9.2 `agent-plan-mode` — pause/approve/reject via the entity-driven resume

`resolvePlanModeGate` (:8074): active = `depth===0 && (RequirePlanMode || (SupportsPlanMode && planMode))`; `validateNextStep` (:3800) demotes Actions/Sub-Agent→Retry until approved; `executePlanStep` (:11762) emits the Plan step + `MJ: AI Agent Requests` row (`Status='Requested'`, `OriginatingAgentRunStepID`) + Chat-shaped pause. Resume is **entity-driven**: `MJAIAgentRequestEntityServer.Save()` on `Requested→{Approved,Rejected,Responded}` spawns `resumeAgent()` (re-injects planMode only for Plan-step resumes; links `ResumingAgentRunID` — checks poll for it). Plan *content* is model prose — never asserted; only the machinery.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| PM1 | `planMode=true` run → `StepType='Plan'` step + Requested request row + pause; `AIAgentRun.PlanMode` stamped | no auditable pause |
| PM2 | Instructed Actions pre-approval (P-artifact: raw response) → demoted to Retry — the gate blocks work | work before human approval (the whole point of plan mode) |
| PM3 | Approve via entity save → resumed run (`ResumingAgentRunID` linked) executes Actions to completion | approval not resuming / not releasing the gate |
| PM4 | Reject → resumed run's next instructed Actions demoted again (gate re-engaged; must re-Plan) | rejection treated as approval |
| PM5 | IT: Always-Plan gates even with `planMode=false` | mandatory plan bypassable per-request |
| PM6 | Post-approval instructed `nextStep='Skill'` → demoted (:4161) — skill activations legal only pre-approval | plan-scope widening after human sign-off |

### 9.3 `agent-compaction-e2e` — beyond CC1–CC12, fabricate-then-observe

Facts (verified): trigger = `TriggerTokens = floor(MaxTokens × trigger%)`; knobs resolve Agent→AgentType→defaults **75/30 via `||`** in `resolveCompactionBudget` (+ clamp-to-model, target≥trigger); `SUMMARY_RESERVE=1500`, `MIN_GAIN=500`, `MIN_MESSAGES=4`; post-turn fire-and-forget on settled statuses; summary → boundary `ConversationDetail.SummaryOfEarlierConversation` + `SummaryPromptRunID` (no new rows). Summary *text* is real-model output — asserted only non-null/non-empty.

| ID | Structural assertion | Failure it catches |
|---|---|---|
| CE1 | **(deterministic tier — no LLM)** budget-knob precedence Agent→AgentType→defaults + clamps via `resolveCompactionBudget` against real seeded metadata | `||`-precedence flip (`||` vs `??` class bug) mis-sizing every window |
| CE2 | Fabricated long history + tight knobs + one live turn → boundary row gains non-empty summary + `SummaryPromptRunID`; next `GetAgentContextWindow` = [summary, tail] | compaction never firing / not persisting |
| CE3 | Second pass over fabricated delta → new higher-sequence boundary wins; old boundary deselected (multi-compaction recursion) | recursive full-history re-summarizing (cost) or baseline loss |
| CE4 | Compaction + carry-forward co-fire on one settle in `finalizeAgentRun`; each machine's output intact; agent-B in the shared convo unaffected | the two post-turn machines corrupting each other's inputs |
| CE5 | Post-compaction retrieval: instructed `conversationToolCalls` page-back of a known pre-boundary sequence (P-artifact: the call) → next `AIPromptRun.Messages` contains the exact stored message | "compacted = lost" — the RLM retrieval promise broken |
| CE6 | Failed pass (compaction prompt's model binding deactivated in-fixture) → `success=false` Compaction step; quiet no-op branch records NO step | silent failures / step spam on no-ops |
| CE7 | `topUpRunTokenTotalsAfterPostTurnCompaction`: run totals increase by exactly the summary prompt run's totals, once (fresh vs. resumed `AwaitingFeedback` paths) | token drift on resume |
| CE8 | Churn/unsatisfiable-budget guards land `SkippedReason`/`Warnings` in real step `OutputData` | guard outcomes invisible to operators |
| CE9 | Pre-turn gating: no pass fires for sub-agents / un-budgeted agents / under-trigger (fabricated variants of `checkPreTurnCompaction`) | pre-turn compaction firing where it must not |

*Deferred:* deep in-run live-message-collapse shape assertions (`applyCompactionToLiveMessages`, `base-agent.ts:13765`) — forcing mid-run collapse with a real model is slow/flaky; better served at unit level. Noted as a coverage gap.

### 9.4 `agent-memory-guards` — the 6-stage memoryWrites pipeline (AGENT_MEMORY_GUIDE)

Generalizes the rig's Phase A/B/C into a registered bundle and adds the **guard** legs the rig skips. Prompt instructs exact `memoryWrites` arrays; P-artifact: the Memory Write tool step with the instructed writes. **MG1** disallowed note type → rejected + disposition recorded in the step `OutputData`; **MG2** per-run cap (6 instructed → 5 land, 6th disposition `capped`); **MG3** scope clamp never-broadens (User-scoped agent writing Global → clamped, recorded); **MG4** same-run idempotency (identical write twice → one note); **MG5** provenance + `Provisional` status + TTL fields on the created `MJ: AI Agent Notes` rows (marker-isolated, rig-style cleanup). *Near-dup embedding stage (0.85, fail-open) deferred — embedding-dependent.* Failure class: agents silently exceeding memory-write policy — the guards' whole purpose.

## 10. Bundle `agent-rag-search` (RS1–RS7) — deterministic engine core + live agent legs

Verified: agents consume search via the `__Scoped_Search` action (`packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`, enforcing `AIAgent.SearchScopeAccess` All/Assigned/None) → `SearchEngine.Search` (`packages/SearchEngine/src/generic/SearchEngine.ts`: provider fan-out → RRF → permission safety-net → `SearchExecutionLog`), and pre-execution RAG (`packages/AI/Agents/src/agent-pre-execution-rag.ts`) injecting a `<retrieved_context>` system message. The keyword path (`EntitySearchProvider` LIKE over `AllowUserSearchAPI=true` entities, ≥3-char `MIN_TERM_LENGTH`, `NoopReRanker`) is fully deterministic. Fixture: sentinel-token records + the seeded IT scope; teardown includes best-effort `SearchExecutionLog` rows.

| ID | Tier | Structural assertion | Failure it catches |
|---|---|---|---|
| RS1 | DET | `SearchEngine.Search(sentinel, [IT scope])` returns exactly the seeded record IDs; `SourceCounts` correct | fan-out/fusion dropping deterministic hits |
| RS2 | DET | Scope `ExtraFilter` excludes the out-of-filter seeded record | scope constraints unapplied |
| RS3 | DET | `it-nogrant` search over an RLS-protected corpus → zero protected rows (live-DB proof complementing mocked PM-01–PM-10) | cross-user search leakage — highest-severity search bug |
| RS7 | DET | Sub-3-char query short-circuits; no provider fan-out logged | MIN_TERM_LENGTH guard regression |
| RS4 | LIVE | IT: Search Agent instructed `__Scoped_Search` (P-artifact: action step) → structured results injected next turn, matching RS1's set | agent action path diverging from engine path |
| RS5 | LIVE | `SearchScopeAccess='None'` variant → `ACCESS_DENIED` from the action; run continues to terminal | access-level enforcement regression |
| RS6 | LIVE | Agent with a `Phase='PreExecution'` RAG row → turn-1 `AIPromptRun.Messages` contains `<retrieved_context>` with the sentinel record | RAG injection silently absent (agent flying blind) |

*Deferred:* semantic/vector legs — `LocalEmbedding` is key-free but cold-downloads HF weights (network/CPU); hosted embeddings make ranked assertions nondeterministic infrastructure. The keyword contract above is what's worth gating.

---

## 11. Explicitly deferred (with reasons)

1. **LLM-as-judge / output-quality evals** (Amith's exclusion): plan quality, summary faithfulness, retrieval relevance beyond exact-match, shipped-agent answer quality — a future eval track.
2. **Real-model-impossible checks** (each redirected, not badly redesigned): forced-malformed-JSON Strict-retry ladder → fault-injection unit test in `packages/AI/Prompts`; exact token equality → AL4 rollup identity; mid-run live-message-collapse deep shapes → unit level.
3. **Semantic/vector RAG + the near-dup memory stage** — embedding infrastructure (§10, §9.4).
4. **Product gaps discovered, not tested around:** XMLToolLibrary (XPath), image metadata/OCR, scanned-PDF OCR — build-or-decline (Q6), checks follow.

## 12. Phasing & effort

| Phase | Contents | Effort | Notes |
|---|---|---|---|
| **A** | `ai/` metadata subtree (prompts+bindings+roster core) + `agent-loop-live` (AL1–AL7) + IT31 in the Live Model suite; prompt-reliability tuning loop | **M** | proves §3.2/§3.3 on the simplest bundle |
| **B** | `agent-payload-guards` (PG1–PG9) + `agent-carry-forward` (CF1–CF6) | **M** | highest value; CF is fabricate-then-observe (≈1 live call/check) |
| **C** | `agent-plan-mode` (PM1–PM6) + `agent-skills-live` (SL1–SL5) + `shipped-agents-live` (SA1–SA4) | **M** | rides AL5's pause plumbing |
| **D** | `agent-artifact-tools` (AT1–AT9, incl. asset files) + `agent-memory-guards` (MG1–MG5, generalizing the rig) | **M** | |
| **E** | `agent-compaction-e2e` (CE1–CE9) + `agent-rag-search` (RS1–RS7, split-tier) | **M/L** | CE1 + RS1–3/7 join the deterministic suite |

Each phase lands **both siblings** per the parity rule (bundle in `integration-test-suite/src/checks/` + an `.IT3x-*.json` record joined to the right suite — live bundles to **"Integration Tests — Live Model"**; the DET checks to the deterministic suite, client-members-last ordering respected), new fixture interfaces in `check.ts`, README table updates. **~65 checks across 10 bundles** (≈48 live + ≈17 DET/fabricated-leaning), **< $1 per full run** at §3.5 pricing — a large step toward the parent plan's 300-check target, concentrated on its least-covered domain.

## 13. Open questions for Amith

1. **Q1 — Compliance-failure semantics:** confirm §3.3 — bounded (≤2) scenario retries on model-noncompliance, then a loud FAIL (never skip-as-pass). Or a distinct `Skipped`/`Inconclusive` status once the parent plan's A1 lands?
2. **Q2 — Model ladder:** confirm Gemini Flash-Lite primary / GPT-nano secondary / Cerebras-or-Groq tertiary (all existing metadata rows + shipped drivers), or name your preferred trio. Any vendor NOT to burn test tokens on?
3. **Q3 — Nightly keyed lane:** with CI pinning `RUN_AGENT_TESTS=0`, want a scheduled keyed CI job running "Integration Tests — Live Model", or is local/nightly-dev cadence enough for now?
4. **Q4 — Payload guard rulings (needed before pinning):** (a) malformed path-JSON fails **open** to `["*"]` — intended? (b) self-write default-unrestricted — intended? (c) related-agent path missing `upstreamMergeViolations` attachment (~`base-agent.ts:10435`) — bug or by-design?
5. **Q5 — Compaction `||` semantics:** CE1 pins Agent→AgentType→default precedence including `||`-on-zero — pin as contract, or fix to `??` first?
6. **Q6 — Artifact-type product gaps:** build `XMLToolLibrary` (XPath/node queries) + image `get_metadata` (dimensions/format) so AT6/AT7 graduate from gap-pinning to real extraction checks? OCR defer?
7. **Q7 — Search fixture entity:** seed sentinel rows into an existing `AllowUserSearchAPI=true` entity (lowest infra, small pollution risk) vs. a dedicated throwaway searchable entity in the fixture (cleaner, heavier)?
8. **Q8 — Transport:** the memory rig runs client transport (GraphQL → live MJAPI via `GraphQLAIClient.RunAIAgent`); registered bundles today default server-in-process. Adopt client transport for this family from day one (doctrine-aligned; `RunAIAgentResolver` already accepts `planMode`+`requestedSkillIDs`), accepting the MJAPI-running prerequisite — or start server-side and migrate under Workstream M?

---
*Every code claim verified against the working tree 2026-07-20/21 (items marked [VERIFY] pending a final look) — primary sources: `packages/AI/Agents/src/{base-agent.ts, PayloadManager.ts, prior-turn-tool-result-cache.ts, ArtifactToolManager.ts, agent-types/loop-agent-response-type.ts, agent-pre-execution-rag.ts}`, `packages/AI/Prompts/src/AIPromptRunner.ts`, `packages/AI/Providers/*`, `packages/SearchEngine/src/generic/SearchEngine.ts`, `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`, `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (AIPrompt `Temperature`:6616, `OutputType/OutputExample/ValidationBehavior/MaxRetries`:7163–7193), `packages/TestingFramework/{testing-integration/src/{tiers.ts, ai-verify.ts, check.ts, IntegrationTestDriver.ts}, integration-test-suite/{src/checks/*, rigs/agent-memory-tests.ts}}`, `metadata/ai-models/.ai-models.json`, `metadata/agents/{.sage-agent.json, .query-builder-agent.json, .research-agent.json}`, `metadata-optional/integration-test/**`, guides (`AGENT_SKILLS_AND_PLAN_MODE_GUIDE`, `AGENT_MEMORY_GUIDE`, `SEARCH_SCOPES_AND_RAG_GUIDE`) + `plans/agent-conversation-compaction.md`.*
