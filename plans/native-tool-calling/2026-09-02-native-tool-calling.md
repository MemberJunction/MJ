# Native Tool Calling in BaseLLM and the Agent Framework — Implementation Plan

**Issue:** [MemberJunction/MJ#4082](https://github.com/MemberJunction/MJ/issues/4082)
**Status:** Draft
**Branch:** `JF_Native_Tool_Calling` (from `next`)
**Companion doc:** [Test plan](./2026-09-02-native-tool-calling-test-plan.md) (mirrors the layers below)

---

## For the Implementer

This branch carries only these two design docs — you build the feature; the design
authors do PR review. Orientation:

- **Reading order:** this doc top to bottom, then the test plan, plus two existing
  documents this feature builds on directly: `plans/model-configuration.md` (the
  shipped `ModelConfiguration` cascade §4.1 extends — including the lockstep-copies
  contract and 4-step update ordering) and the tool-calling support audit in this
  directory (the source data for per-model/vendor flag values). §11 here and §8 of
  the test plan are the work breakdown; the test plan's T1–T6 and this doc's PRs 1–4
  can all start immediately and largely in parallel.
- **Provenance:** the problem statement and evidence are in issue #4082. The metadata
  design (JSON `Configuration` columns instead of ever-widening capability columns; the
  model → vendor → prompt → prompt-model cascade) came from design discussion between
  the issue author and project leadership — treat the cascade semantics in §6 as agreed,
  not open.
- **Decisions already made** (don't re-litigate without raising it in the PR):
  deterministic evaluators only in the comparison scoring; test content never ships in
  stock MJ; Phase 1 is non-streaming; the envelope path stays the default and fully
  supported; Phase 2 (Layer 5) ships only through the test plan's staged gates (§6.3
  there).
- **Genuinely open** items are collected in §9 here and §9 of the test plan — those are
  yours to investigate, and several are answered by data the test plan produces.
- **Questions / review:** tag the issue author on the PR.

---

## 1. Background

MJ's LLM providers do not use the native tool/function-calling APIs that every major
vendor now exposes. Agent actions are described as prose in the system prompt, and the
model replies with a JSON `LoopAgentResponse` envelope that the framework parses and
dispatches. That design is portable — it works on models with no tool support at all —
but newer agentically-trained models are beginning to fight it:

- `gemini-3.7-flash` returned `finishReason: MALFORMED_FUNCTION_CALL` on **~35%** of
  Loop-agent requests when no tools were declared (tokens discarded, driver reports
  "No output received from model"). With one matching tool declared: **0%** malformed.
- Loop system prompts render at 56–104KB, much of it action-contract prose that tool
  definitions would carry more efficiently (and that providers cache better).

The catch: declaring a tool dropped *envelope* text output to 1/8 in the same
experiment — the model called the function instead of returning `taskComplete` /
`nextStep`. So this cannot be "just pass tools through"; it needs deliberate design.

This plan makes native tool calling an **opt-in capability**, gated by metadata at four
levels, plumbed through `BaseLLM` as ephemeral per-call params, instrumented so both
paths can be measured, with the agent-loop integration fenced as a separate,
eval-gated phase. The vendor-agnostic text path remains the default and fully
supported. Nothing is forced to migrate.

---

## 2. Goals and Non-Goals

### Goals

1. `BaseLLM` / `ChatParams` gain an optional, provider-neutral tool surface
   (declarations, tool-choice control, normalized tool-call output).
2. Implement in three drivers first: **Anthropic, OpenAI, Gemini**.
3. New `Configuration` JSON columns on `AIModel` and `AIModelVendor` (typed via MJ's
   `JSONType` CodeGen mechanism) holding capability + policy flags, so these tables
   stop widening with every new provider option.
4. Prompt-level opt-in: `UseNativeToolCalling` on `AIPrompt`, overrideable per
   `AIPromptModel`.
5. `AIPromptRunner` resolves the gates and fills the ephemeral `ChatParams` fields.
6. Instrumentation: record which tool-calling mode was actually used per prompt run
   (surfaced per agent run step), plus fallback events.
7. Fallback: a native-mode failure degrades to the envelope path rather than failing
   the run.

### Non-Goals (explicitly out of scope for Phase 1)

- Replacing the JSON envelope or mandating tool calling anywhere.
- **Streaming + tools.** Phase 1 is non-streaming only (see §5.5).
- The hybrid agent loop itself (Phase 2, §8) — designed here, but built and shipped
  atomically with its eval suite in a separate effort.
- `payloadChangeRequest` as a tool (open question for Phase 2 evals, §9).

---

## 3. Design Overview — Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5 (Phase 2, fenced): Hybrid agent loop                    │
│   actions-as-tools, implicit control flow, template conditionals│
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: Instrumentation + fallback (AIPromptRun, AgentRunStep) │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Prompt-runner gating (AIPromptRunner resolves flags,   │
│   fills ephemeral ChatParams — the ONLY metadata-aware layer)   │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: BaseLLM / ChatParams tool surface + driver adapters    │
│   (metadata-ignorant; pure input/output normalization)          │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1: Schema — Configuration JSONType columns + prompt bits  │
└─────────────────────────────────────────────────────────────────┘
```

Layers 1–4 are Phase 1 and are safe to build and merge without behavior change:
until a prompt opts in, every code path is identical to today. Layer 5 is Phase 2
and must ship atomically with its testing/eval work.

---

## 4. Layer 1 — Schema Changes

### 4.1 The `ModelConfiguration` bag — **already exists; extend it, don't duplicate it**

The column this plan originally proposed **already shipped** (August 2026 — see
`plans/model-configuration.md`, status *complete*): a `ModelConfiguration` JSONType
column on **three** catalog entities, forming an inherit-with-override cascade
resolved base-first with per-key deep merge:

```
AIModelType.ModelConfiguration          (type-wide default)
  <  AIModel.ModelConfiguration         (per-model)
    <  AIModelVendor.ModelConfiguration (per model-on-this-provider — the winner)
```

Everything needed is in place: the JSONType source interface
(`metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`), its lockstep
runtime mirror (`AIModelConfiguration` in
`packages/AI/Core/src/generic/modelConfiguration.ts` — the "`IAgentSettings` pact"),
the resolver `ResolveEffectiveModelConfiguration` in `@memberjunction/ai` (unit-tested),
CodeGen-emitted typed `ModelConfigurationObject` accessors on all three entities, and a
stated **boundary rule**: engine filter/sort/join fields stay columns; driver-consumed
call-time knobs go in the bag, one section per modality. The `LLM` section is reserved
with *"tool-calling behavior flags"* explicitly listed as candidate contents.

**This feature's Layer 1 work is therefore an interface extension, not a migration** on
the model-catalog side:

```typescript
LLM?: {
    /**
     * Whether this model (or this vendor's serving of it) supports native
     * tool/function calling. Capability flag — a hard gate. Absent = inherit
     * from the layer below / false at the base.
     */
    SupportsNativeToolCalling?: boolean | null;

    /**
     * Whether prompts run against this model default to native tool calling
     * when they express no preference. Policy flag. Absent = inherit / false.
     */
    DefaultToNativeToolCalling?: boolean | null;
} | null;
```

(PascalCase properties, matching the bag's existing convention.) Update **both**
lockstep copies, re-push the JSONType metadata, and read values through
`ResolveEffectiveModelConfiguration` — the vendor ?? model ?? type chains in §6 come
from that resolver, with the type-wide layer as the base default (useful for e.g.
"LLM-type models default to supported=false" without touching every row).

### 4.2 Prompt-level opt-in columns

- `AIPrompt.UseNativeToolCalling` — `bit NULL`. `NULL` = no preference (fall through
  to model/vendor defaults).
- `AIPromptModel.UseNativeToolCalling` — `bit NULL`. `NULL` = inherit from prompt.

**Open question for team review (see §9.6):** bit columns vs. a `Configuration`
JSONType column on these tables too. `AIPrompt` already carries a large number of
columns (and `AIPromptModel` a fair number), so the same column-explosion argument that
motivated §4.1 arguably applies here — a prompt-level `Configuration` JSON could absorb
`UseNativeToolCalling` and future options from day one. Bit columns are simpler and
directly queryable; JSON is consistent with the model/vendor layer and future-proof.
The schema migration should not merge until this is decided — it's a cheap choice now
and an annoying reversal later.

### 4.3 Instrumentation column (see Layer 4)

- `AIPromptRun.ToolCallingMode` — `nvarchar(25) NULL`, CHECK constraint:
  `'Native' | 'Envelope' | 'NativeFallback'`. `NULL` = pre-feature rows / not
  applicable.

### 4.4 Migration notes

- **Model-catalog side: no migration.** §4.1 is an interface extension — update both
  lockstep copies of `IAIModelConfiguration` (JSONType source +
  `packages/AI/Core/src/generic/modelConfiguration.ts`), re-push the JSONType
  metadata, re-run CodeGen. Follow the 4-step ordering documented in
  `plans/model-configuration.md`.
- **One migration** in `migrations/v2/` for the genuinely new columns:
  `AIPrompt.UseNativeToolCalling`, `AIPromptModel.UseNativeToolCalling` (§4.2 —
  pending the §9.6 decision), and `AIPromptRun.ToolCallingMode` (§4.3), with
  `sp_addextendedproperty` descriptions. Hardcoded UUIDs; no `__mj` timestamp
  columns; standard CodeGen run afterward.
- **No seed data flips any flag on.** Enabling `LLM.SupportsNativeToolCalling` for
  specific model/vendor rows happens in later `.ai-models.json` metadata updates,
  per-provider, once the driver work (Layer 2) is verified against that provider —
  the tool-calling support audit (`plans/native-tool-calling/…-audit.md`) is the
  source for those values.

---

## 5. Layer 2 — BaseLLM / ChatParams Tool Surface

`BaseLLM` is the abstraction layer that standardizes/adapts LLM API input and output
for the rest of MJ. All tool support is expressed provider-neutrally here; each driver
adapts to its SDK. Drivers remain metadata-ignorant — they see only `ChatParams`.

### 5.1 New `ChatParams` fields (`packages/AI/Core/src/generic/chat.types.ts:154`)

```typescript
/**
 * Optional tool declarations for this request. When provided and the driver
 * supports tools, these are passed to the provider's native tool-calling API.
 * Drivers that do not support tools ignore this (see SupportsTools).
 */
tools?: ChatTool[];

/**
 * Controls how the model may use declared tools.
 *  - 'auto'     (default when tools present): model decides
 *  - 'none'     : tools declared but model must not call them this turn
 *  - 'required' : model must call some tool
 *  - { name }   : model must call the named tool
 */
toolChoice?: ChatToolChoice;

/**
 * Whether the model may emit multiple tool calls in one turn.
 * Default true (provider defaults). Maps to parallel_tool_calls /
 * disable_parallel_tool_use per provider.
 */
parallelToolCalls?: boolean;
```

With:

```typescript
type ChatToolChoice = 'auto' | 'none' | 'required' | { name: string };

interface ChatTool {
    name: string;
    description?: string;
    /**
     * JSON Schema for the tool's input. JSON Schema is the least common
     * denominator across OpenAI (parameters), Anthropic (input_schema), and
     * Gemini (parametersJsonSchema / OpenAPI-subset declarations).
     */
    inputSchema: Record<string, unknown>;
}
```

### 5.2 Normalized output — "zero or more tool calls + optional text"

All three major APIs structurally allow mixed output in one assistant turn (Anthropic
`text` + `tool_use` content blocks; OpenAI nullable `content` alongside `tool_calls`;
Gemini `text` + `functionCall` parts). The normalized result must model both — never
either/or. Extend the choice message with:

```typescript
interface ChatToolCall {
    /** Provider call id, echoed back when returning the result. */
    id: string;
    name: string;
    /** Parsed arguments. Drivers parse provider JSON-string args before returning. */
    arguments: Record<string, unknown>;
}
// ChatResultChoice.message gains: toolCalls?: ChatToolCall[]
// finish_reason normalization gains a 'tool_calls' value across drivers.
```

Nothing downstream may assume text content exists on a tool-call turn (forced
`tool_choice` typically suppresses it; Anthropic disables extended thinking under
forced tool choice).

### 5.3 Tool results in the conversation

Multi-turn tool use requires representing "here is the result of call X" in
`ChatMessage[]`. Provider mapping (driver responsibility):

| Provider  | Assistant tool-call turn | Tool result turn |
|-----------|--------------------------|------------------|
| OpenAI    | `assistant` + `tool_calls` | `tool` role message per call, `tool_call_id` |
| Anthropic | `assistant` + `tool_use` blocks | `user` turn with `tool_result` blocks |
| Gemini    | `model` + `functionCall` parts | `user`/`function` turn with `functionResponse` parts |

Neutral representation: add a `tool` value to `ChatMessageRole` plus a tool-result
content block type (id, name, content, `isError?`) alongside the existing
`ChatMessageContentBlock` machinery, and a `toolCalls` field on assistant messages so
prior calls round-trip. Each driver maps to/from its SDK's shape. (Exact block shape
to be finalized against `chat.types.ts` content-block serialization —
`CONTENT_BLOCKS_PREFIX` — so tool turns persist correctly in message logs.)

### 5.4 Driver capability + scope

- `BaseLLM` gains `public get SupportsTools(): boolean { return false; }`. Drivers
  that implement the mapping override to `true` (pattern: `SupportsStreaming`).
- If `tools` are passed to a driver with `SupportsTools === false`, the driver
  ignores them and the result is flagged (see Layer 4) — the prompt runner should
  never let this happen, but the layer must be safe standalone.
- Phase 1 drivers: **Anthropic, OpenAI, Gemini** (`packages/AI/Providers/…`). Others
  follow once the pattern is proven; many (Groq, Mistral, Cerebras, xAI, OpenRouter,
  Bedrock, Vertex) are OpenAI-or-Anthropic-shaped and should be cheap.

### 5.5 Streaming: out of scope

If `streaming === true` and `tools` are present in Phase 1, drivers fall back to
non-streaming for that call (mirroring the existing "streaming unsupported →
non-streaming" fallback) and note it in `modelSpecificResponseDetails`. Streaming
tool-call delta assembly differs significantly per provider and is deferred.

### 5.6 Interaction with `responseFormat`

`responseFormat: 'JSON'` combined with declared tools behaves inconsistently across
providers. Phase 1 does not need the combination (tools without JSON mode for the
exploratory harness; the agent loop keeps JSON mode without tools until Phase 2).
The BaseLLM test matrix (§10) measures the combination per provider so Phase 2 can
decide with data.

---

## 6. Layer 3 — Prompt-Runner Gating

`AIPromptRunner` (`packages/AI/Prompts/src/AIPromptRunner.ts`) is the only layer that
reads metadata. At execution time, for the selected (prompt, promptModel, model,
vendor) it resolves:

```
cfg      = ResolveEffectiveModelConfiguration(type, model, vendor)  // existing resolver, §4.1

supports = cfg.LLM.SupportsNativeToolCalling ?? false      // capability — hard gate
           // (resolver already applied vendor ?? model ?? type precedence)

want     = promptModel.UseNativeToolCalling
        ?? prompt.UseNativeToolCalling
        ?? cfg.LLM.DefaultToNativeToolCalling
        ?? false                                   // policy — cascades

effective = supports AND want AND toolsProvidedByCaller
```

First non-null wins at each `??`. Within the catalog cascade the existing resolver's
precedence applies — vendor overrides model overrides type-wide default — so the
model-level value wins when the vendor level is absent (per design discussion), and a
type-level base default is available for free.

### 6.1 Truth table

| promptModel.Use | prompt.Use | vendor.default | model.default | supports | effective | notes |
|---|---|---|---|---|---|---|
| null | null | null | null | any   | **false** | today's behavior, untouched |
| null | null | null | true | true  | **true**  | model-level default |
| null | null | false| true | true  | **false** | vendor default overrides model default |
| null | true | any  | any  | true  | **true**  | prompt opts in |
| null | true | any  | any  | false | **false** + warn | policy cannot beat capability |
| false| true | any  | any  | true  | **false** | promptModel overrides prompt |
| true | any  | any  | any  | true  | **true**  | most specific wins |
| true | any  | any  | any  | false | **false** + warn | hard gate |

**Capability vs. policy is the invariant:** no policy setting at any level can force
tools onto a (model, vendor) whose `supports` resolves false. When `want === true`
but `supports === false`, log a warning and record `ToolCallingMode = 'Envelope'` so
misconfiguration is visible rather than silent.

When `effective === true`, the runner fills `ChatParams.tools` / `toolChoice` /
`parallelToolCalls` from what the caller supplied (e.g., the agent framework in
Phase 2, or any direct `AIPromptRunner` caller passing tool definitions). The runner
itself does not invent tools; with no tools supplied, native mode is a no-op and the
run proceeds exactly as today.

Failover note: model/vendor failover selects a new (model, vendor) pair — the gate
must be re-resolved per attempt, since the failover target may not support tools.

---

## 7. Layer 4 — Instrumentation and Fallback

Cheap to add during Phase 1, very expensive to retrofit. This is what makes Phase 3
("measure, then decide") possible.

### 7.1 Recording the mode

- `AIPromptRun.ToolCallingMode`:
  - `'Native'` — tools declared, run completed on the native path.
  - `'Envelope'` — no tools declared (default path, including "wanted but
    unsupported" with warning).
  - `'NativeFallback'` — native attempt failed; run completed via envelope retry.
- Agent framework surfaces the value from the prompt run onto the corresponding
  `AIAgentRunStep` output data so per-step analysis needs no joins into prompt-run
  internals. (Phase 2 wires this; the column lands now.)

### 7.2 Fallback semantics

When a native-mode call fails in a tools-specific way (provider rejects the tool
declarations; response contains a tool call that cannot be parsed/matched; or the
provider discards output with a tool-related finish reason), the runner retries the
same step **once** with `tools` stripped — i.e., today's exact path — and records
`'NativeFallback'`. Non-tool-related failures follow existing retry/failover logic
unchanged. Fallback events also log at warning level with the provider error, so a
misbehaving driver/provider combination is diagnosable from logs alone.

---

## 8. Layer 5 (Phase 2, fenced) — Hybrid Agent Loop

**Ships atomically with its testing and evaluation work — not before.** Everything in
this section is design intent to be validated by the BaseLLM test matrix and agent
eval suite; it must not ship dark alongside Phase 1. The rollout is staged — actions
first, then `payloadChangeRequest`, then task completion / control flow — with an eval
gate at each stage; see test plan §6.3 (stages N1–N4). This section describes stage N1.

### 8.1 The central design decision: implicit control flow for Actions

The measured failure mode (declaring tools dropped envelope output to 1/8) means the
model cannot be asked to emit tools *and* the envelope in the same turn. Industry
harnesses (Claude Code, Codex, Gemini CLI) resolve this with implicit control flow:
tool call ⇒ continue; plain text with no tool call ⇒ turn over. Adopting that for the
Actions branch only:

- **A native tool call *is* `nextStep.type='Actions'`.** The framework executes the
  action(s), appends tool results (§5.3), and continues the loop. No envelope is
  expected on that turn.
- **No tool call ⇒ the model must emit the envelope** for everything else:
  `taskComplete`, `Chat`, `Sub-Agent`, `Retry`, `payloadChangeRequest`, etc.
- Rejected alternative — envelope-always (model returns tools + envelope together):
  contradicts the 1/8 evidence and provider-inconsistent JSON-mode+tools behavior.

`LoopAgentResponse` structure changes when native mode is on: the `actions` array is
removed from the schema and `'Actions'` leaves the `nextStep.type` union; the rest is
unchanged but only expected on non-tool-call turns. Because tool calls are not prose,
the existing defense of recording action invocations as second-person `user`-role
annotations (to stop in-context learners imitating them) can be revisited —
tool-call/tool-result turns are the native representation.

### 8.2 Mapping actions and parameters to tool definitions

Every major provider declares tool parameters the same way: **JSON Schema with
per-property `description` strings** — `input_schema` (Anthropic), `parameters`
(OpenAI), `parameters`/`parametersJsonSchema` (Gemini). The prose that today lives in
the rendered action catalog maps onto schema keywords: shape → `type`/`items`/nested
`properties`; allowed values → `enum`; optionality → the `required` array; defaults and
format hints → the property `description`. Tool descriptions should be prescriptive
about *when* to call ("call this when…"), not just what the tool does — this
measurably improves should-call rates on current models.

A `buildToolFromAction(action)` generator (Phase 2, lives with the agent framework)
maps `ActionParam` metadata:

| ActionParam field | ChatTool inputSchema |
|---|---|
| `Name` | property key |
| `Description` | property `description` (defaults/format hints appended) |
| `IsRequired` | membership in `required[]` |
| `IsArray` | `{type: "array", items: <element schema>}` |
| `Type` | only `Input` / `Both` params included |
| `DefaultValue` | noted in the property description |
| `ValueType` | see below — the one lossy mapping |

Two constraints:

- **Tool names:** providers require `[a-zA-Z0-9_-]`, ≤64 chars. Action names ("Run
  Ad-hoc Query") need deterministic sanitization (`run_ad_hoc_query`) plus a reverse
  map so the framework resolves calls back to Actions. Collisions after sanitization
  are a hard error at tool-build time.
- **Schema subset:** `ChatTool.inputSchema` sticks to the cross-provider common subset
  (`type`, `description`, `enum`, `items`, `properties`, `required`) — Gemini's classic
  function-declaration schema is an OpenAPI subset without `additionalProperties` etc.;
  drivers adapt anything beyond that.

**The typing gap:** `ActionParam.ValueType` is only
`'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'MediaOutput' | 'Other'` — it
cannot distinguish string/number/boolean, and objects carry no shape; today that
information lives as prose in `Description` (the field's own metadata says so).
Two-stage approach:

1. **Phase 2 baseline — permissive mapping, no schema change.** `Scalar` →
   `{type: ["string", "number", "boolean"]}`, `Simple Object` → `{type: "object"}`
   (no `properties`), `BaseEntity Sub-Class`/`Other`/`MediaOutput` → `{type: "object"}`
   with the prose description doing the work. This is exact parity with the prose
   catalog — same information, structurally attached — and the test plan's
   param-fidelity metric measures whether it suffices.
2. **Follow-on — optional `ValueSchema` column on `ActionParam`** (JSONType-typed,
   holding a JSON Schema fragment) that the generator prefers when present. Unlocks
   `enum`s, nested shapes, and eventually provider strict mode
   (`additionalProperties: false` + complete `required`). Backfill incrementally on
   actions where eval data shows param errors — no bulk migration. Strict mode stays
   off until this exists.

### 8.3 Per-step `tool_choice` policy

- Normal iterations: `'auto'`.
- Framework needs a control-flow decision (e.g., final iteration before max-iteration
  cutoff, or forced summarization): `'none'`, so the model must produce the envelope.
- `'required'` / named forcing: available for experimentation, not part of the
  baseline design.

### 8.4 Template changes

`metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` is
already conditional throughout — `__agentTypePromptParams.includeResponseTypeDefinition.*`
flags gate each envelope section and the `nextStep.type` union is assembled from
conditionals. Native mode adds a flag to the template data (e.g.,
`_NATIVE_TOOL_CALLING`) that:

- suppresses the action-catalog prose and the `actions` field / `'Actions'` union
  member,
- adds a short section: tools are declared natively — call them directly; never
  describe actions inside the JSON envelope; when not calling a tool, respond with
  the envelope.

No new templating mechanism is required, and suppressing the action catalog is where
the 56–104KB prompt-size win is realized.

### 8.5 Instrumentation completion

Wire `ToolCallingMode` from prompt runs onto `AIAgentRunStep` (per §7.1), plus
per-step counts of native calls made, so the eval comparison (envelope vs. hybrid on
the same agents) is queryable directly from run history.

---

## 9. Open Questions

1. **Hybrid coherence** — does implicit control flow (native Actions + envelope for
   everything else) confuse models less than either pure approach? → Answered by
   Phase 2 evals (test plan stages N1 and N3); this is the gate on shipping Layer 5.
2. **`payloadChangeRequest` as a tool** — semantically a state write, which harnesses
   model as tools. Deferred; measure the actions-only hybrid first. → Staged as N2 in
   the test plan (§6.3), gated on N1 results.
3. **Cross-provider variance** — parallel-call behavior, forcing semantics, mixed
   text+call frequency. → Answered empirically by the BaseLLM test matrix (§10).
4. **How much fragility is prompt-level, not architectural** — a single corrected
   exemplar moved one agent's malformed rate ~35% → ~10% (p ≈ 0.007). An audit of
   agent prompts for exemplars contradicting `LoopAgentResponse` should run in
   parallel with Phase 1; it re-sizes the urgency of Phase 2.
5. **"Search Tools" scalability** — with tool counts exploding, a future direction is
   a meta-tool for tool discovery so requests don't declare hundreds of tools. Out of
   scope; noted so the `ChatTool[]` surface isn't designed in a way that precludes it.
6. **`Configuration` JSON on `AIPrompt` / `AIPromptModel`** — should the prompt-level
   flags live in a JSONType `Configuration` column instead of bit columns? Both tables
   already carry many columns, so the anti-widening argument applies to them too — and
   the model catalog's `ModelConfiguration` bag (§4.1) plus the `IAgentSettings` pact
   are direct precedents for the pattern, including the lockstep-interface discipline
   a prompt-level bag would follow. **Needs a team decision before the schema
   migration (PR 1) merges** — see §4.2.
7. **`ValueSchema` on `ActionParam`** (§8.2 follow-on) — whether to add the optional
   JSON Schema column for typed action parameters, and how far to backfill stock
   actions. The permissive baseline mapping ships first either way; the corpus's
   param-fidelity metric is the decision instrument, but the schema addition itself
   deserves explicit team evaluation since it touches the Actions subsystem beyond
   this feature.

---

## 10. Test Plan (outline)

Full companion doc: [Native Tool Calling — Test Plan](./2026-09-02-native-tool-calling-test-plan.md),
which supersedes this outline where they differ. Mirrors the layers:

1. **Layer 1 — schema:** migration applies cleanly; CodeGen emits typed
   `ConfigurationObject` accessors + Zod schemas; tri-state round-trips (absent
   property ≠ false at vendor level).
2. **Layer 2 — BaseLLM matrix (the centerpiece):** a harness driving each Phase 1
   driver directly against live providers across
   {no tools | tools+auto | tools+none | tools+required | tools+named} ×
   {responseFormat Any | JSON} × several models per provider, recording: text
   present?, tool call well-formed?, parallel call count, envelope compliance,
   finish reason. Answers §9.3 and §5.6 with data. Plus unit tests per driver for
   request mapping and response normalization (SDK mocked), including tool-result
   round-tripping (§5.3).
3. **Layer 3 — gating:** unit tests enumerating the §6.1 truth table exactly,
   including the warn-on-unsupported path and re-resolution on failover.
4. **Layer 4 — instrumentation/fallback:** forced tool-failure injection → single
   envelope retry, `'NativeFallback'` recorded, warning logged; mode recorded
   correctly on all three paths.
5. **Layer 5 — agent evals (Phase 2 gate):** same agents, envelope vs. hybrid,
   comparing malformed-response rate, iterations-to-completion, token usage
   (prompt-size reduction), action-call accuracy. Uses `ToolCallingMode` for
   attribution. Ships with Layer 5, not after.

---

## 11. Phasing and PR Breakdown

| # | Deliverable | Depends on | Behavior change? |
|---|-------------|------------|------------------|
| 1 | `IAIModelConfiguration.LLM` extension (both lockstep copies) + migration for prompt-table flags + `ToolCallingMode` + CodeGen | — | None (all flags null/off) |
| 2 | `ChatParams`/`ChatResult` tool surface + Anthropic, OpenAI, Gemini drivers | — (parallel with 1) | None (fields unused) |
| 3 | `AIPromptRunner` gating + instrumentation + fallback | 1, 2 | None until a flag is set |
| 4 | BaseLLM test matrix harness + results write-up | 2 | n/a (test tooling) |
| 5 | Prompt-exemplar audit (§9.4) | — | Prompt fixes only |
| 6 | **Phase 2:** hybrid loop + template conditionals + agent evals (atomic) | 1–4 | Opt-in per agent/prompt |

PRs 1–4 are independent enough to parallelize across two people; PR 6 is the fenced,
eval-gated effort and should not start until the matrix results (PR 4) are in.
