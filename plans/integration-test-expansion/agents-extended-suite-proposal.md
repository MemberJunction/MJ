# Extended Agents Integration Test Sub-Suite — Proposal

**Status:** DRAFT for Amith's review (2026-07-21) · Author: Claude (research pass on `an-dev-35`)
**Parent plan:** [README.md](README.md) (integration-test expansion) · Catalog: [test-catalog.md](test-catalog.md) Domain 4
**Scope:** a new family of **deterministic** agent-framework bundles — the advanced behaviors (compaction, carry-forward, artifact tools, payload guards, skills/plan-mode, memory guards, RAG/search) — powered by a **scripted stand-in LLM driver** and a **purpose-built test-agent roster** seeded via `metadata-optional/`. Explicitly **NOT** in scope: LLM-as-judge / output-quality evals (deferred, §11).

---

## 1. Executive summary

The agent framework's most valuable machinery — the loop's step lineage, cross-turn compaction, tool-result carry-forward, sub-agent payload scoping, skill activation, plan-mode gating, memory-write guards, artifact interrogation — is today tested only at the edges: unit tests mock the loop, and the two loop-touching integration bundles either avoid the LLM entirely (`conversation-compaction` CC1–CC12 exercises the *assembly* layer with hand-fabricated runs) or cost tokens and are non-deterministic (`agent-runner`, live-model tier). **The whole middle — "does the real loop, run end-to-end, do what the design docs say?" — has zero deterministic coverage.**

One investment unlocks all of it: a **scripted `@RegisterClass(BaseLLM, 'ItTestLLM')` driver** (already named by the catalog's `agent-loop-standin` foundational enabler at [test-catalog.md:150-165](test-catalog.md) — "register a scripted `@RegisterClass(BaseLLM,'ItTestLLM')` driver + fixture model row → converts live-only invariants to DET" — and [README.md §3 principle 5](README.md); AI9–AI11 depend on it; grep-verified **unbuilt** — the only `TestLLM` in the tree is a non-exported unit-test local in `packages/AI/Core/src/__tests__/baseLLM.test.ts:8`) that replays check-authored `LoopAgentResponse` JSON turn-by-turn. Because `BaseAgent`, `AIPromptRunner`, the payload manager, the skill/plan gates, and the compaction manager are all deterministic code — the only entropy is the model — replacing the model with a script makes **the entire agent loop byte-deterministic**, including token accounting (the driver reports scripted usage numbers).

This proposal specifies: the driver design (§3), a 12-agent test roster declared in `metadata-optional/integration-test/ai/` (§4, extending the seeded-principal precedent of `it-rls-*@integration.test`), checked-in **test asset files** (JSON/CSV/XML/MD/PDF/PNG) for artifact interrogation (§4.4), and **nine new bundles (66 checks)** with per-check assertions and the failure each would catch (§5–§10). Everything is self-cleaning and LLM-free — eligible for the blocking deterministic tier under the `mutation-by-design` precedent set by IT30.

---

## 2. Where coverage stands today (verified inventory)

| Existing asset | What it covers | What it deliberately does NOT cover |
|---|---|---|
| `conversation-compaction` bundle CC1–CC12 (`packages/TestingFramework/integration-test-suite/src/checks/conversation-compaction.checks.ts`, IT30) | Sequence trigger; `GetAgentContextWindow` boundary selection/recursion/exclusion; retrieval tools paging stored history; single-INSERT Compaction step; **CC10** carry-forward *loader* (DB fallback, cache precedence, agent-scoped both directions); `AssembleContextWindow` parity; concurrent sequence assignment | The compaction **manager's LLM leg is always mocked/hand-set** — no end-to-end "run fires a real compaction pass" coverage; no pre-turn live-message collapse; no budget-knob resolution against real metadata |
| `ai-skills` bundle AS1–AS21 (`.../checks/ai-skills.checks.ts`, IT12) | ALL data-layer gates: availability (None/All/Limited), double-activation-gate math, permission validators, SKILL.md round-trip; AS10 *hand-fabricates* PlanMode + `Skills` JSON persistence | Nothing that requires the **loop actually running**: real `Skill` step emission, runtime skill demotion, plan pause/resume/reject |
| `agent-runner` + `prompt-runner` bundles (IT17/IT16, live-model tier) | Real LLM smoke of agent/prompt execution; ON by default locally, `RUN_AGENT_TESTS=0` in CI | Deterministic assertions — outputs vary run to run |
| Unit tests in `packages/AI/Agents/src/__tests__/` | `prior-turn-tool-results.test.ts` (carry-forward units), skill-step / plan-mode-gate logic units, `agent-pre-execution-rag.test.ts` (mocked) | The seams between them; **PayloadManager guard-enforcement methods have ZERO unit tests** (verified — see §7) |
| `packages/SearchEngine/src/__tests__/` (PM-01–PM-10 etc.) | Mocked RRF/permission/provider logic | **Zero TestingFramework search coverage** (grep-verified) — no live-DB SearchEngine check exists |

Net: the deterministic integration tier currently proves the agent framework's *storage and metadata* layers. This sub-suite proves its *behavior*.

---

## 3. The keystone — `ItTestLLM` deterministic driver (the catalog's `agent-loop-standin` enabler)

### 3.1 Why it works

- **The contract is small.** `BaseLLM` (`packages/AI/Core/src/generic/baseLLM.ts:37`): a concrete driver must implement `nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult>` (:160) — the only method that matters here — plus throw-stubs for `ClassifyText`/`SummarizeText` (:162-163) and the three streaming abstracts (unreached with `SupportsStreaming=false`, :169 default). `ChatResult.data = { choices:[{message:{role:'assistant',content}}], usage }` (shape reference: `baseLLM.test.ts:15-19`). `AIPromptRunner` instantiates drivers with `MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKey)` (`packages/AI/Prompts/src/AIPromptRunner.ts:3513`), where `driverClass = modelVendor.DriverClass || model.DriverClass` (:3480,3492).
- **Credential gate must be satisfied.** Model selection drops candidates with no resolvable credential (`AIPromptRunner.ts:2660-2683`, `unavailableReason: 'No credentials configured…'`). The cheap satisfier: `AI_VENDOR_API_KEY__ITTESTLLM=dummy` in the test process env (prefix from `packages/AI/Core/src/generic/apiKeyDictionary.ts:25`); the driver ignores the ctor `apiKey` value.
- **The loop's expected response shape is fully typed.** `LoopAgentResponse` (`packages/AI/Agents/src/agent-types/loop-agent-response-type.ts`) — `taskComplete`, `message`, `payloadChangeRequest`, `scratchpad`, `artifactToolCalls`, `conversationToolCalls`, `memoryWrites`, and `nextStep.type ∈ 'Actions'|'ClientTools'|'Sub-Agent'|'Chat'|'Retry'|'ForEach'|'While'|'Pipeline'|'Skill'|'Plan'`. `LoopAgentType.DetermineNextStep` (`agent-types/loop-agent-type.ts:144`) parses it via `parseJSONResponse` (`base-agent-type.ts:291`) — the driver must emit a **raw JSON string, no code fences/prose** (the parser + retry feedback explicitly reject markdown). A check authors these objects directly; the driver serializes them as the assistant message.
- **Token accounting becomes assertable.** The driver returns scripted `promptTokens`/`completionTokens` in `ChatResult.data.usage`, so `AIPromptRun` cost/rollup checks (catalog AI7-adjacent) get exact expected numbers.

### 3.2 Design

**Class:** `ItTestLLM extends BaseLLM`, `@RegisterClass(BaseLLM, 'ItTestLLM')` (the exact registration the catalog names at `test-catalog.md:151`).

**Scripting seam — two mechanisms, phased.**

*Phase 1 (primary): in-process script register.* Agent bundles run **server-transport, in-process** (verified: `IntegrationTestDriver.ts` `CLIENT_BUNDLES` at :55 lists only `client-cache`/`rls-isolation-client`/`remote-op-wire-progress`; everything else — including today's `agent-runner` — executes the check body in the same process as AIEngine/`BaseAgent`). So the check and the driver share a heap, and the cleanest channel is a static register the check populates before calling `AgentRunner.RunAgent`:

```ts
ItTestLLM.SetScript('IT: Payload Parent', {   // keyed by agent name (or agent ID / '*' default)
  turns: [
    { expect: { contains: '__PROBE_A' },      // optional guard: assert prompt content before answering
      usage: { prompt: 1200, completion: 80 },
      response: { /* LoopAgentResponse */ } },
    { response: { taskComplete: true, message: 'done' } }
  ],
  onExhausted: 'fail'                          // never loop silently past the script
});
```

On each `ChatCompletion` the driver: (1) resolves the script for the calling agent (agent identity travels in the prompt params/messages; fallback key `'*'`); (2) derives the turn index by counting prior **assistant** messages in `params.messages` (a pure function of the transcript — correct across retries, and per-agent because each agent's prompt has its own transcript; parent and child replay **independent scripts** under their own keys); (3) if `expect` is present and unmatched, returns a scripted *failure* `ChatResult` naming the mismatch — turning "wrong prompt assembled" into a first-class, debuggable check failure instead of a hang; (4) emits `turns[i].response` as a raw-JSON assistant message with the scripted usage. Bundle `Teardown` calls `ItTestLLM.ClearScripts()`.

*Phase 2 (transport-agnostic option): in-message sentinel.* When runs later execute inside a **separate MJAPI process** (client transport over `RunAIAgentResolver`), the register isn't reachable from the check. Fallback: embed the script as a `[[MJ_SCRIPTED_LLM v1]]{…}` block in the run's first user message, which the driver parses from `params.messages`. Caveat: a compaction pass can fold the sentinel behind the boundary in long conversations (→ Q4); the register has no such issue, which is another reason it's the Phase-1 primary.

**Leak prevention (README §7 risk: "Stand-in LLM must be registered carefully"):**
1. The driver **throws** when no script is registered/found for the call — it can never silently answer a real prompt.
2. It additionally refuses unless `MJ_INTEGRATION_TEST=1` is set in its process (same env the suite already requires, `INTEGRATION_TESTING_QUICKSTART`), an environmental second fuse.
3. The seeded model row (§4.1) is a test-named model bound only to test prompts — never referenced by production agents, and `metadata-optional/` keeps it out of default pushes.

**Where the class lives / process visibility (decides Phase-1 transport):**
- **Phase 1 — server transport.** Register the driver inside `@memberjunction/integration-test-suite` (the private check package — imported by the bundle module so the decorator fires). `mj test` loads that package via the `mj.config.cjs` `testing.checkModules` seam ([framework-restructure-proposal.md](framework-restructure-proposal.md) as-built deviation 2), i.e. the `@RegisterClass` executes in the same process that runs `BaseAgent`. Zero production exposure — the private package never ships, and no MJAPI manifest edit is needed.
- **Phase 2 — client transport** (the doctrine's end-state): drive runs over GraphQL via `RunAIAgentResolver` (which already accepts `planMode` + `requestedSkillIDs`). That requires the driver registered **inside MJAPI** (server-bootstrap / class-registrations-manifest territory). Recommended: a tiny `@memberjunction/ai-scripted-driver` package MJAPI loads **only when `MJ_INTEGRATION_TEST=1`** (config-gated, mirroring the checkModules seam — a legitimate CLAUDE.md rule-8 category-5 runtime plugin, not a bare dynamic import). This is a security-relevant server change → explicit human sign-off per README §3a. Until decided, agent bundles run server-transport, sequenced before any client bundle (suite ordering invariant, `.integration-suite.json`).

**Model pinning.** Fixture `AI Model` "IT: Scripted Model" + Active `AIModelVendor` row, both carrying `DriverClass='ItTestLLM'` + an `APIName`; each roster prompt gets an `MJ: AI Prompt Models` binding to it (credential-priority rung 2 in `resolveCredentialForExecution`, `AIPromptRunner.ts:416-483`), so selection deterministically lands on the scripted model without touching PowerRank games or production models.

### 3.3 What the driver deliberately does NOT do

No fuzzing, no generation, no "smart" behavior. It is a replay head. Anything requiring actual language competence (summarization quality, plan quality, reasoning) stays in the live-model tier or the deferred eval track (§11).

---

## 4. Test fixtures in `metadata-optional/integration-test/` (mj-synced, never polluting base metadata)

Extends the seeded-principal precedent (`users/.integration-test-users.json` → `it-rls-a/b@integration.test`, `it-nogrant@integration.test`; role `Integration Test: RLS Scoped Reader` documented "Safe to delete"). All new records: `uuidgen` primary keys, no `sync` blocks on authoring, names prefixed `IT:` and descriptions carrying the standard "(mj-integration-test — safe to delete)" tag. New subtree added to the root `.mj-sync.json` `directoryOrder`:

```
metadata-optional/integration-test/
├── ai/
│   ├── vendors/.it-vendor.json              # "IT: Scripted Vendor" (Inference Provider)
│   ├── models/.it-scripted-model.json       # "IT: Scripted Model" → DriverClass 'ItTestLLM' (shape mirrors metadata/ai-models/.ai-models.json)
│   ├── prompt-categories/ + prompts/        # one Loop-format prompt per roster agent, each pinned via MJ: AI Prompt Models → IT: Scripted Model
│   │   └── templates/*.md                   # @file: prompt bodies (minimal — the script drives behavior, not the prompt)
│   ├── agent-categories/.it-agent-category.json
│   ├── agents/.it-*.json                    # the roster (§4.2), TypeID=@lookup Loop, wired to prompts + actions
│   ├── skills/.it-probe-skill.json          # one Active skill bundling one harmless action (mirror ai-skills fixture semantics)
│   ├── search/.it-search-scope.json         # scope + Search Scope Providers/Entities rows for §10
│   └── artifact-assets/                     # PLAIN FILES, not entity records (§4.4)
│       ├── sample.json  sample.csv  sample.xml  sample.md
│       ├── sample.pdf   sample.png  sample.bin
│       └── MANIFEST.json                    # expected values: row counts, sha256s, page count, node values
```

### 4.1 Why metadata-seed the model/agents but runtime-create conversations/artifacts

- **Agents, prompts, model, vendor, skill, scope** are *definitions* — stable IDs let checks `@lookup` them and let `mj sync push --dir=metadata-optional/integration-test` provision any environment in one step (exactly how the RLS principals work). Runtime creation of an agent graph per run would re-test mj-sync, not the loop.
- **Conversations, ConversationDetails, Artifacts/Versions, AIAgentRuns** are *run products* — created by bundle `Setup`/checks and FK-order-deleted by `Teardown` (the `conversation-compaction` accumulator-fixture pattern, `ConversationCompactionFixture` in `packages/TestingFramework/testing-integration/src/check.ts:292`).
- **Artifact content**: text types inline in `ArtifactVersion.Content` (`ContentMode='Text'`); binary types (PDF/PNG/bin) as `data:<mime>;base64,` URLs in `Content` — `ArtifactToolManager`'s `ExtractBase64FromDataUrl` decodes these, avoiding an MJStorage/FileID dependency in the fixture entirely.

### 4.2 The test-agent roster

| Agent (all `Type=Loop`, `Status=Active`, category `IT: Integration Test`) | Distinctive metadata | Powers (bundle) |
|---|---|---|
| **IT: Echo Agent** | bare minimum; no actions/sub-agents | `agent-loop-standin` — smoke, terminal lineage, cost |
| **IT: Tool Loop Agent** | granted one harmless action — reuse **Calculate Expression** (the `user-routines` fixture precedent, `UserRoutinesFixture.CalcActionID`) | `agent-loop-standin` action steps; `agent-carry-forward` |
| **IT: Payload Parent** | `PayloadDownstreamPaths=["customer.*"]`, `PayloadUpstreamPaths=["analysis.*:add,update"]`, child = IT: Payload Child | `agent-payload-guards` |
| **IT: Payload Child** | sub-agent (ParentID=Payload Parent); scripted to emit both allowed and violating `payloadChangeRequest`s | `agent-payload-guards` |
| **IT: Payload Scoped Child** | `PayloadScope='/analysis'` | `agent-payload-guards` scope slice/reverse |
| **IT: Self-Write Restricted Agent** | `PayloadSelfWritePaths=["notes.*"]` | `agent-payload-guards` self-write |
| **IT: Plan Agent** | `SupportsPlanMode=true` (planMode per-request) | `agent-plan-mode` |
| **IT: Always-Plan Agent** | `RequirePlanMode=true` | `agent-plan-mode` forced gate |
| **IT: Skill Probe Agent** | `AcceptsSkills='Limited'` + grant to IT: Probe Skill; `SkillActivationMode='RequestedOnly'` | `agent-skills-loop` |
| **IT: Artifact Reader Agent** | plain loop agent; artifacts attached per-run | `agent-artifact-tools` |
| **IT: Compaction Agent** | explicit tight budget knobs (Agent-level compaction fields) so a scripted multi-turn convo crosses `TriggerTokens` deterministically | `agent-compaction-e2e` |
| **IT: Memory Writer Agent** | `AllowMemoryWrite=true`, note-type restriction set | `agent-memory-guards` |
| **IT: Search Agent** | `SearchScopeAccess='Assigned'` + assignment to IT: Search Scope; granted `__Scoped_Search` | `agent-rag-search` |

### 4.3 Seeded principals reuse

Payload/skills/search permission-negative checks reuse `it-nogrant@integration.test` (no roles) and the `it-rls-*` pair rather than minting new users — the `RlsFixture` resolver in `testing-integration/src/check.ts:54` already shows the resolve-by-email pattern.

### 4.4 Test asset files + MANIFEST

`MANIFEST.json` is the single source of expected values (headers, row counts, sha256, page count, JSON node values, XML sentinel strings) so checks never hardcode duplicated constants. Assets are tiny (<20KB each), text-layer PDF (generated once, checked in), 1×1-style PNG. **Known product gaps the assets deliberately expose** (from the artifact-tool research, §8): XML has *no* type-specific library (falls to `TextToolLibrary` grep) and images have *no* metadata extraction (only `GenericBinaryToolLibrary` sha256/size) — the checks assert what exists today and the gaps go to Amith as product questions (Q7).

---

## 5. Bundle `agent-loop-standin` (AL1–AL8) — the scripted loop foundation

Named to match the catalog's Domain-4 bundle (`test-catalog.md:150`); absorbs AI9–AI11. **Transport:** server (Phase 1). **Tier:** deterministic (mutation-by-design, self-cleaning — IT30 precedent). **Fixture:** accumulator (`AgentRuns`/`Steps`/`Conversations` + created PromptRun IDs), FK-ordered teardown. Assertion bodies **reuse the existing deep verifiers** `verifyAgentRun`/`verifyPromptRun` in `packages/TestingFramework/testing-integration/src/ai-verify.ts` — the same ones live AR1/PR1 use — so the deterministic and live tiers assert identical invariants.

| ID | Assertion (one line) | Failure it catches |
|---|---|---|
| AL1 | `ItTestLLM` resolves via ClassFactory from the seeded model's `DriverClass` and answers a bare prompt run | driver registration / metadata→ClassFactory seam broken (the `mj app` ERR_MODULE class of bug) |
| AL2 | Echo Agent run reaches `Status='Completed'`; **every** `AIAgentRunStep` terminal with `CompletedAt` set (catalog **AI10** verbatim, `ai-verify.ts:96` invariant) | steps left dangling `Running` — the orphan-step regression class |
| AL3 | Two-turn Tool Loop run: step sequence is exactly Prompt→Actions→Prompt→(terminal), `StepType`/`TargetLogID` lineage intact | loop mis-sequencing, missing action-step linkage |
| AL4 | `AIAgentRun.TotalTokensUsed`/cost equals the sum of scripted usage numbers; child `AIPromptRun`s roll up to the run (catalog AI7 seam) | cost double-billing or dropped rollup |
| AL5 | Script emits malformed JSON turn 1, valid turn 2 → runner retries per validation config then succeeds (catalog **AI11**) | Strict-retry ladder regression in `AIPromptRunner` (:972,1004) |
| AL6 | Script emits `nextStep.type='Chat'` → run pauses `AwaitingFeedback` with the Chat-shaped terminal step; conversation detail written | HITL pause path broken (prereq for plan-mode + carry-forward bundles) |
| AL7 | Scripted `expect.contains` on turn 2 proves the actions' output was injected into turn 2's prompt (assert independently via `AIPromptRun.Messages` → `MJAIPromptRunEntityExtended.ParseMessagesData()`) | action results silently dropped from context |
| AL8 | A deliberately failing scripted run (`onExhausted:'fail'`) lands `Status='Failed'` + `ErrorMessage` populated, still all steps terminal | failure path leaves runs/steps inconsistent |

`AIPromptRun.Messages` (persisted assembled messages) is the **universal deterministic observable** this whole suite leans on — established here, reused everywhere.

*Housekeeping found while researching:* `prompt-runner.checks.ts` PR1's header says "gated by RUN_AGENT_TESTS" but the `NamedCheck` does **not** set `RequiresLiveModel: true` (unlike AR1 at `agent-runner.checks.ts:63`) — a gating discrepancy to fix when this bundle lands.

---

## 6. Bundle `agent-carry-forward` (CF1–CF6) — tool-result carry-forward end-to-end

Machinery (verified): `packages/AI/Agents/src/prior-turn-tool-result-cache.ts` (BaseSingleton, `MJLruCache` 500/30min, key `NormalizeUUID(conversationId)::NormalizeUUID(agentId)`, empty-array = valid negative cache), `tool-result-format.ts`, injection in `base-agent.ts` (single transient user message, `metadata.messageType='tool-result'`, `expirationTurns:2`, per-result 500-char compact, `maxStandaloneToolResultChars=100000` cap with omitted-for-size markers), populated in `finalizeAgentRun` only at `depth===0 && Status∈{Completed,AwaitingFeedback}`. CC10 already covers the *loader*; this bundle covers the **prompt-visible behavior** CC10 cannot.

| ID | Assertion | Failure it catches |
|---|---|---|
| CF1 | Turn-2 run (same conversation+agent) — `AIPromptRun.Messages` contains exactly ONE injected message with the "Tool results from your previous turn (still valid — reuse instead of re-calling):" header and the compacted (≤500-char) result, NOT the full payload | the optimization silently regressing to full re-dump (token blow-up) or to nothing (agent re-calls tools) |
| CF2 | A >100k combined prior-turn result set is size-capped: injected message carries truncation + omitted-for-size markers, total under cap | unbounded context growth |
| CF3 | Cold cache (evict via a fresh process/`Clear`) → DB-fallback path (2 RunViews over prior settled root run + its Tool steps' `OutputData`) produces the identical injected message as the cache-hit path (byte-compare) | cache/DB divergence — stale or differently-shaped replay |
| CF4 | Same conversation, **different agent** → NO injected message (key scoping); same agent in a *different* conversation → NO injection | cross-agent / cross-conversation tool-result leakage |
| CF5 | Prior run that ended `Failed` → no carry-forward (only settled statuses populate) | replaying results from a failed run |
| CF6 | The injected message expires per `expirationTurns:2` — absent from turn-4's `AIPromptRun.Messages` when not refreshed | transient message immortality (context bloat) |

---

## 7. Bundle `agent-payload-guards` (PG1–PG9) — sub-agent payload scoping

Machinery (verified): `PayloadManager` (`packages/AI/Agents/src/PayloadManager.ts:159`) + `base-agent.ts`. Fields on `AIAgentEntity`: `PayloadDownstreamPaths`/`PayloadUpstreamPaths` (NOT-null, default `["*"]`, dot-notation + per-op suffix `path:add,update`), `PayloadSelfReadPaths`/`PayloadSelfWritePaths` (nullable → **unrestricted by default**, `getDefaultPayloadSelfWritePaths` returns `undefined`, base-agent.ts:8735/8953), `PayloadScope` (slash path; `applyPayloadScope` PayloadManager.ts:1692, missing path = **hard Critical failure** — the one fail-closed guard, base-agent.ts:9294). Downstream extraction silently strips (base-agent.ts:9241); upstream merge blocks disallowed ops into `blockedOperations[]`, persisted as `payloadValidation.upstreamMergeViolations` **inside `AIAgentRunStep.OutputData`** (base-agent.ts:8303) — the per-step deterministic observable. **These enforcement methods have zero unit AND zero integration coverage today (grep-verified) — this bundle is the highest-value payload work.**

| ID | Assertion | Failure it catches |
|---|---|---|
| PG1 | Parent (`Downstream=["customer.*"]`) invokes child; child's `AIPromptRun.Messages` payload contains `customer.*` only — sibling keys stripped | downstream leak of parent state into sub-agents |
| PG2 | Child's scripted `payloadChangeRequest` writes an allowed `analysis.*` path AND a disallowed `secret.*` path → parent payload gains only `analysis.*`; the Sub-Agent step's `OutputData.payloadValidation.upstreamMergeViolations` names `secret.*` with op + reason | violation merged silently, or blocked-but-unlogged (unauditable) |
| PG3 | Op-suffix enforcement: `Upstream=["analysis.*:add,update"]` → child's scripted **delete** on `analysis.x` is blocked and recorded | per-operation suffix regression (delete sneaking through an add/update grant) |
| PG4 | `PayloadUpstreamPaths=[]` (empty array) → ALL child changes ignored + the "No upstream paths specified" warning recorded (PayloadManager.ts:257) | empty-grant treated as all-grant |
| PG5 | Scoped child (`PayloadScope='/analysis'`): child sees ONLY the subtree (as payload root); its writes land back under `/analysis` via `reversePayloadScope` (PayloadManager.ts:1729) | scope slice/unslice asymmetry corrupting the parent payload |
| PG6 | `PayloadScope` naming a missing path → run **fails hard** with the "Critical: Failed to extract payload scope" message (base-agent.ts:9294) — pinned as the intended fail-closed contract | accidental softening of the one fail-closed guard |
| PG7 | Self-write: default agent (null paths) may write anywhere (pin fail-open contract); `IT: Self-Write Restricted` (`["notes.*"]`) writing `config.x` is blocked + recorded | default flipping closed (breaks all agents) or restriction not enforcing |
| PG8 | Failed child run → NO upstream merge occurs at all | merging partial state from failed sub-agents |
| PG9 | BREAK ATTEMPT — malformed `PayloadDownstreamPaths` JSON currently **fails open to `["*"]`**: pin whichever behavior Amith rules (Q6); check documents + enforces the ruling | silent behavior drift on a security-adjacent default |

*Flag for Amith (product asymmetry, not a check):* the related-agent (non-child) mapping path (~base-agent.ts:10435) builds its summary **without** attaching `upstreamMergeViolations` — related-agent violations may surface only as generic warnings. → Q6.

---

## 8. Bundle `agent-artifact-tools` (AT1–AT10) — artifact interrogation across types

Machinery (verified): per-type `BaseArtifactToolLibrary` subclasses resolved via ClassFactory from `ArtifactType.ToolLibraryClass`, orchestrated by `ArtifactToolManager` (`packages/AI/Agents/src/ArtifactToolManager.ts` — alpha IDs, manifest, `CompositeArtifactToolLibrary` leaf-first inheritance, exception-wrapped dispatch at :498, >50k text externalization). Agent invokes via `LoopAgentResponse.artifactToolCalls`; results injected next turn via `_ARTIFACT_TOOL_RESULTS`. Libraries: JSON (`json_path/keys/search/iterate`), CSV (`get_columns/get_rows/search`), PDF (pdfjs-dist: `get_page_count/get_text/search_text/get_metadata`), Excel/Docx/Text, `GenericBinaryToolLibrary` (`get_metadata` → sizeBytes + sha256). Fixture: `Setup` creates Artifact/ArtifactVersion rows from `artifact-assets/` (§4.4), attaches to the run's conversation via `MJ: Conversation Detail Artifacts`.

| ID | Assertion (expected values from `MANIFEST.json`) | Failure it catches |
|---|---|---|
| AT1 | Manifest injection: turn-1 prompt (`AIPromptRun.Messages`) lists all attached artifacts with alpha IDs | `gatherConversationArtifacts` → manifest seam broken (agent blind to artifacts) |
| AT2 | CSV: scripted `get_columns` → next-turn `_ARTIFACT_TOOL_RESULTS` carries exact headers + `rowCount===N`; `get_rows{start,count}` paging returns known cell values | CSV parser / paging regression |
| AT3 | JSON: `json_path("a.0.b")` returns the known value; `json_keys("")` returns the exact top-level key set; `json_search` finds the sentinel | JSON navigation regression |
| AT4 | PDF: `get_page_count === N`; `search_text` finds the seeded phrase with page number; `get_metadata.title/author` match | pdfjs extraction regression (incl. dependency-upgrade breakage) |
| AT5 | Markdown/Text: `grep` returns the exact match count + line for a sentinel regex | text library regression |
| AT6 | XML (today's contract): falls to `TextToolLibrary` — `grep` for an element sentinel works; **no** `xpath` tool exists (assert absent from the tool manifest, pinning the current surface) | undocumented surface drift; keeps Q7 honest |
| AT7 | PNG via `GenericBinaryToolLibrary.get_metadata`: `sizeBytes` + `sha256` equal MANIFEST values (the universal deterministic binary anchor) | binary content corruption anywhere in the artifact store→decode→tool chain |
| AT8 | Malformed artifact (truncated JSON) → tool dispatch returns a **structured error result** (exception-wrapped, :498), run continues to a scripted terminal | one bad artifact crashing the whole run |
| AT9 | Name-instead-of-alphaID tolerance + sole-artifact default resolve behave as coded | LLM-ergonomics fallbacks silently removed |
| AT10 | >50k text artifact is externalized (`ShouldExternalizeContent`) — manifest advertises tools-only, full content NOT inlined in the prompt | context blow-up from large artifacts |

---

## 9. Bundles `agent-skills-loop` (SL1–SL5), `agent-plan-mode` (PM1–PM6), `agent-compaction-e2e` (CE1–CE10), `agent-memory-guards` (MG1–MG5)

### 9.1 `agent-skills-loop` — what AS1–AS21 cannot reach (loop required)

| ID | Assertion | Failure it catches |
|---|---|---|
| SL1 | Run IT: Skill Probe with `requestedSkillIDs=[ProbeSkill]` → loop emits a real `StepType='Skill'` step whose `AIAgentRunStep.Skills` provenance records the requested-activation (from `preActivateRequestedSkills`, base-agent.ts:11449, root-only) | activation happens but leaves no audit trail, or never happens |
| SL2 | `requestedSkillIDs` including an unentitled skill (use `it-nogrant`) → dropped + the `notifyDroppedSkillRequests` system note present; run proceeds | silent grant escalation OR hard-fail on a droppable request |
| SL3 | Script emits `nextStep.type='Skill'` naming a **nonexistent** skill → `validateSkillNextStep` (:4181) demotes to Retry (step recorded as such) | hallucinated-skill activation |
| SL4 | Script self-activates a `RequestedOnly` skill (not requested) → demoted (double activation gate honored **at runtime**, complementing AS-gate math) | ActivationMode enforced in metadata but not in the loop |
| SL5 | Post-activation turn's prompt (Messages) contains the skill Instructions appended + widened tool surface | activation recorded but not actually applied |

### 9.2 `agent-plan-mode` — pause/approve/reject via the entity-driven resume

Resume is entity-driven: `MJAIAgentRequestEntityServer.Save()` on `Requested→{Approved,Rejected,Responded}` fire-and-forget spawns `resumeAgent()`, which re-injects `planMode` **only** for Plan-step resumes and links `ResumingAgentRunID` — checks poll for that link.

| ID | Assertion | Failure it catches |
|---|---|---|
| PM1 | IT: Plan Agent with `planMode=true` → script's Plan turn produces a `StepType='Plan'` step + an `MJ: AI Agent Requests` row (`Status='Requested'`, `OriginatingAgentRunStepID`=plan step) + Chat-shaped terminal pause (`executePlanStep`, :11762); `AIAgentRun.PlanMode` stamped | plan gate produces no auditable pause |
| PM2 | Pre-approval scripted `nextStep='Actions'` → demoted to Retry by `validateNextStep` (:3800) — the gate actually blocks work | agent doing work before human approval (the whole point of plan mode) |
| PM3 | Approve the request (entity save as context user) → resumed run (`ResumingAgentRunID` linked) executes Actions normally to scripted completion | approval not resuming, or resuming without releasing the gate |
| PM4 | Reject → resumed run has the gate **re-engaged** (next scripted Actions demoted again; must re-Plan) | rejection treated as approval |
| PM5 | IT: Always-Plan (`RequirePlanMode=true`) gates even with `planMode=false` (`resolvePlanModeGate` :8074: `depth===0 && (RequirePlanMode || (SupportsPlanMode && planMode))`) | mandatory-plan agents bypassable per-request |
| PM6 | Post-approval scripted `nextStep='Skill'` → demoted to Retry (:4161) — skill activations legal only pre-approval | plan-scope widening after human sign-off |

### 9.3 `agent-compaction-e2e` — the ten verified gaps beyond CC1–CC12

Mechanism facts to encode: trigger = token budget (`TriggerTokens = floor(MaxTokens × trigger%)`); knobs resolve Agent → AgentType → model → defaults **75/30 via `||`** in `resolveCompactionBudget` (incl. clamp-to-model and target≥trigger clamp); boundary never index 0 nor the newest row; `SUMMARY_RESERVE=1500`, `MIN_GAIN=500`, `MIN_MESSAGES=4`; per-conversation re-entrancy guard; post-turn fire-and-forget on settled statuses; summary written to the boundary `ConversationDetail.SummaryOfEarlierConversation` + `SummaryPromptRunID` (no new rows). The **summary text itself is scripted** — the compaction pass's LLM call routes to `ScriptedTestLLM` too (the "Summarize Conversation Range" prompt gets pinned to the IT model in the fixture), so even the summary content is byte-assertable.

| ID | Assertion | Failure it catches |
|---|---|---|
| CE1 | Budget-knob precedence: Agent-level knobs beat AgentType beat defaults through `resolveCompactionBudget` against REAL metadata; clamps applied (needs NO LLM at all) | precedence flip (`||` vs `??` class bug) mis-sizing every window |
| CE2 | First real end-to-end pass: scripted long convo crosses TriggerTokens → boundary row gains scripted summary + `SummaryPromptRunID`; next window = [summary, tail] | compaction never firing / firing without persisting |
| CE3 | **Multi-compaction recursion**: pass 2 folds prior-summary+delta only; new higher-sequence boundary wins; old summary deselected by `GetAgentContextWindow` | recursive re-summarizing the full history (cost) or losing the baseline |
| CE4 | Compaction + carry-forward co-firing in `finalizeAgentRun`: both fire on one settle; `ExcludeDetailIds` vs carry-forward capture don't cannibalize each other; agent-B in the shared convo unaffected | the two post-turn machines corrupting each other's inputs |
| CE5 | **Post-compaction retrieval round-trip**: next turn's window is [summary, tail]; scripted `conversationToolCalls` pages an exact pre-boundary row back in (visible in the following `AIPromptRun.Messages`) | "compacted = lost" — the RLM retrieval promise broken |
| CE6 | `applyCompactionToLiveMessages` (base-agent.ts:13765) collapses the in-flight message array pre-turn — **currently ZERO coverage** | live-turn window diverging from the persisted window |
| CE7 | `checkPreTurnCompaction` gating: explicit-budget-only (BoundedBy), depth-0 only, under-trigger skip | pre-turn compaction firing for sub-agents / un-budgeted agents |
| CE8 | Failed pass records a `success=false` Compaction step; the quiet-no-op branch records NO step | silent failures, or step spam on no-ops |
| CE9 | `topUpRunTokenTotalsAfterPostTurnCompaction`: fresh-Load path vs resumed `AwaitingFeedback` runs both account the summary prompt's tokens exactly once | token totals drifting on resume |
| CE10 | Churn/unsatisfiable-budget guards land `SkippedReason`/`Warnings` in the real step `OutputData` | guard outcomes invisible to operators |

### 9.4 `agent-memory-guards` — the 6-stage memoryWrites pipeline (AGENT_MEMORY_GUIDE §3)

Each stage observable via the `'Memory Write'` Tool step's disposition in `OutputData`: MG1 type restriction (disallowed note type rejected+recorded); MG2 per-run cap (6 scripted writes → 5 land, 6th disposition=capped); MG3 scope clamp never-broadens (User-scoped agent writing Global → clamped, recorded); MG4 idempotency (identical write twice in one run → one note); MG5 provenance + Provisional status + TTL fields on the created `MJ: AI Agent Notes` row. *(Near-dup embedding stage @0.85 is fail-open and embedding-dependent — deferred to the gated tier per §10's embedding caveat.)* Failure class: an agent silently exceeding memory-write policy — the exact abuse the guard pipeline exists for.

---

## 10. Bundle `agent-rag-search` (RS1–RS7) — search/RAG for agents, deterministic paths only

Verified: agents consume search via (a) the `__Scoped_Search` action (`packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`, enforcing `AIAgent.SearchScopeAccess` All/Assigned/None) → `SearchEngine.Search` (`packages/SearchEngine/src/generic/SearchEngine.ts`: provider fan-out → RRF → permission safety-net → enrich → `SearchExecutionLog`), and (b) pre-execution RAG (`packages/AI/Agents/src/agent-pre-execution-rag.ts`) injecting a `<retrieved_context>` system message. **The fully deterministic path is keyword**: `EntitySearchProvider` LIKE over `AllowUserSearchAPI=true` entities (≥3-char `MIN_TERM_LENGTH`), `NoopReRanker`, no embeddings. Fixture: sentinel-token records in a searchable entity + the seeded IT: Search Scope; teardown includes the engine's best-effort `SearchExecutionLog` rows.

| ID | Assertion | Failure it catches |
|---|---|---|
| RS1 | `SearchEngine.Search(sentinel, [IT scope])` returns exactly the seeded record IDs with `SourceCounts.Entity` correct | provider fan-out / fusion dropping deterministic hits |
| RS2 | Scope `ExtraFilter` (Nunjucks-rendered with `SearchContext`) excludes the out-of-filter seeded record | scope constraints not applied |
| RS3 | Permission safety-net: `it-nogrant` search over an RLS-protected corpus returns zero protected rows (`filterByPermissions` late gate; complements mocked PM-01–PM-10 with a live-DB proof) | cross-user search leakage — the highest-severity search bug |
| RS4 | IT: Search Agent (Assigned) via scripted `__Scoped_Search` action step gets structured results injected next turn; results match RS1's set | agent-facing action path diverging from engine path |
| RS5 | `SearchScopeAccess='None'` agent → `ACCESS_DENIED` error code from the action, run continues to scripted terminal | access-level enforcement regression |
| RS6 | Pre-execution RAG: agent with an active `Phase='PreExecution'` row gets the `<retrieved_context>` system message in turn-1 `AIPromptRun.Messages`, containing the sentinel record | RAG injection silently absent (agent flying blind) |
| RS7 | Sub-3-char query short-circuits (MIN_TERM_LENGTH guard) — empty result, no provider fan-out logged | guard regression causing table-scan-ish LIKE storms |

**Embedding caveat:** `LocalEmbedding` (`@RegisterClass(BaseEmbeddings,'LocalEmbedding')`) is deterministic and key-free, **but** lazily downloads model weights from HuggingFace on cold cache — network-dependent, CPU-heavy. Semantic/vector RS checks therefore go to a **gated follow-on** (env `RUN_EMBEDDING_TESTS=1` or warm-cache-detected skip-as-Skipped), not the blocking tier.

---

## 11. Explicitly deferred

1. **LLM-as-judge / quality evals** (Amith's explicit exclusion): plan quality, summary faithfulness, reasoning quality, retrieval relevance beyond exact-match — a future eval track, likely on the Testing Framework's AI-verify substrate.
2. **Live multi-vendor failover ladders** (catalog AI9's live leg), real `resumeAgent()` continuation semantics under a live model — stays live-model tier.
3. **Semantic/vector RAG end-to-end** (embedding caveat above) and the near-dup memory stage.
4. **Product gaps discovered, not tested around**: XMLToolLibrary (XPath), image metadata/OCR extraction, scanned-PDF OCR fallback — build-or-decline decisions for Amith (Q7), then checks follow.

## 12. Phasing & effort

| Phase | Contents | Effort | Depends on |
|---|---|---|---|
| **A** | `ItTestLLM` driver + `ai/` metadata subtree (model/vendor/prompts/roster) + `agent-loop-standin` (AL1–AL8) + IT31 record/suite membership | **M** | nothing (server transport) |
| **B** | `agent-payload-guards` (PG1–PG9) + `agent-carry-forward` (CF1–CF6) | **M** | A |
| **C** | `agent-plan-mode` (PM1–PM6) + `agent-skills-loop` (SL1–SL5) | **M** | A |
| **D** | `agent-artifact-tools` (AT1–AT10, incl. asset files) + `agent-memory-guards` (MG1–MG5) | **M** | A |
| **E** | `agent-compaction-e2e` (CE1–CE10) + `agent-rag-search` (RS1–RS7) | **M/L** | A (CE4 also B) |
| **F** | Client-transport migration of the family via MJAPI-registered driver (§3.2 Phase 2) — rides the parent plan's A8 | **M** | A8 + Q2 sign-off |

Each phase lands with **both siblings** per the parity rule: the bundle in `integration-test-suite/src/checks/` + an `.IT3x-*.json` record joined to "Integration Tests — Deterministic" (client-members-last ordering respected), new fixture interfaces added to `check.ts`, and the folder README table updated. 66 checks total across 9 bundles → a large step toward the parent plan's 300-check target, concentrated on its least-covered domain.

## 13. Open questions for Amith

1. **Q1 — Deterministic-tier placement:** these bundles are mutation-by-design but self-cleaning and LLM-free (IT30 precedent). Confirm they join the blocking deterministic suite rather than the mutation gate.
2. **Q2 — Driver-in-MJAPI:** approve (or decline) the `MJ_INTEGRATION_TEST=1`-gated registration of `ScriptedTestLLM` inside MJAPI for Phase F client transport (a real server-surface decision per README §3a). Until then the family is a documented server-transport exception.
3. **Q3 — Roster size:** 12 agents is the fully-factored roster; happy to collapse (e.g., one payload family agent with per-check metadata mutation) if seed-footprint matters more than per-check isolation.
4. **Q4 — Phase-2 scripting seam:** the Phase-1 in-process register sidesteps compaction entirely, but the client-transport future needs the in-message sentinel (or a DB-record script channel) — and a compaction pass can fold a sentinel behind the boundary in long conversations. Preference between sentinel-with-tail-retention-guarantee vs. a small `MJ: Tests`-adjacent script record the MJAPI-side driver reads?
5. **Q5 — Compaction knob surface:** CE1 pins Agent→AgentType→default precedence including the `||` (not `??`) semantics — pin as contract, or is `||`-on-zero a bug to fix first?
6. **Q6 — Payload guard rulings needed before PG9/PG7 pin:** (a) malformed path-JSON fails **open** to `["*"]` — intended? (b) self-write default-unrestricted — intended? (c) the related-agent path's missing `upstreamMergeViolations` attachment (~base-agent.ts:10435) — bug or by-design?
7. **Q7 — Artifact-type product gaps:** build `XMLToolLibrary` (XPath/node queries) and an image `get_metadata` (dimensions/format) so AT6/AT7 can graduate from "pin the gap" to real extraction checks? (OCR is a bigger question, fine to defer.)
8. **Q8 — Search fixture entity:** seed sentinel rows into an existing `AllowUserSearchAPI` entity (lowest infra, small pollution risk) vs. flipping the flag on a dedicated throwaway entity in the fixture (cleaner, heavier)?

---
*Every code claim above was verified against the working tree on 2026-07-20/21 — primary sources: `packages/AI/Agents/src/{base-agent.ts, PayloadManager.ts, prior-turn-tool-result-cache.ts, ArtifactToolManager.ts, agent-types/loop-agent-response-type.ts, agent-pre-execution-rag.ts}`, `packages/AI/Core/src/generic/baseLLM.ts`, `packages/AI/Prompts/src/AIPromptRunner.ts`, `packages/SearchEngine/src/generic/SearchEngine.ts`, `packages/Actions/CoreActions/src/custom/search/scoped-search.action.ts`, `packages/TestingFramework/{testing-integration/src/*, integration-test-suite/src/checks/*}`, `metadata-optional/integration-test/**`, and the guides (`AGENT_SKILLS_AND_PLAN_MODE_GUIDE`, `AGENT_MEMORY_GUIDE`, `SEARCH_SCOPES_AND_RAG_GUIDE`) + `plans/agent-conversation-compaction.md`.*
