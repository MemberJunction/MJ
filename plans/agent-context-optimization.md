# Agent Context Optimization — Prompt Subtraction + Capability-Aware Rendering

**Status:** Proposed
**Owner:** AI / Agents
**Branch:** `claude/mj-agent-context-optimization-eptdee`
**Last updated:** 2026-07-27
**Source:** [Anthropic — *The new rules of context engineering for Claude 5 generation models*](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) (July 24, 2026)

> **Related plan:** [`agent-token-optimization.md`](agent-token-optimization.md) covers *runtime*
> token reduction — structural JSON compression, cache-aligned prefixes, AST-aware code reduction.
> This plan covers *authoring-time* reduction: what we write into prompts in the first place. The
> two are complementary and share no work items.

---

## Summary

MJ ships ~250k tokens of hand-authored prompt text across 103 templates. A quarter of it
is worked examples that frontier models no longer need — and that measurably *narrow* their
exploration space. Meanwhile 23 of 26 agents receive every optional prompt section regardless
of whether they can use it, and the model that will actually run a prompt is chosen *after*
the prompt is rendered, so the prompt can't adapt to it.

This proposal does two things at once:

1. **Subtract** — remove redundant examples, deduplicate instructions into the interfaces that
   already describe them, and push rarely-needed content behind progressive disclosure.
2. **Condition** — resolve the model *before* rendering so templates can include or exclude
   content based on the measured capability of the model actually running.

These are complementary. Subtraction sets the floor (what every model gets); conditioning sets
the ceiling (what weaker models additionally need). Doing only the first risks regressions on
mid-tier models; doing only the second leaves the redundancy in place for everyone.

---

## Part 1: Current State

### 1.1 Measured baseline

| Measure | Value |
|---|---|
| Authored prompt templates | 103 files, 927 KB ≈ **250k tokens** |
| Share inside fenced code blocks (mostly examples) | **25% — 228 KB ≈ 62k tokens** |
| Loop system prompt template | 33.4 KB ≈ 9k tokens, **37% fenced**, 16 JSON example blocks |
| …plus `{@include}`d generated type docs | +10 KB → **~12k tokens before agent-specific content** |
| Agents defined in metadata | 26 |
| Agents that trim anything via `AgentTypePromptParams` | **3** (Sage, Demo Loop, Demo Minimal Loop) |
| Guardrail markers (`NEVER`/`MUST`/`CRITICAL`/`🚨`/`⚠️`/`❌`) | **861** |
| Agent Eval tests in metadata | **2** |
| `MJ: Test Rubrics` records seeded | **0** |
| Distinct models in catalog | 167 |

Worst offenders by fenced-block share:

| Template | Size | % fenced |
|---|---|---|
| `research-agent/research-report-writer.md` | 51.6 KB | **52%** (incl. a ~580-line literal HTML template, lines 336–918) |
| `agent-manager/architect-agent.template.md` | 23.0 KB | **53%** |
| `system/sql-query-param-extraction.template.md` | 20.6 KB | **56%** |
| `agents/codesmith.template.md` | 20.4 KB | **48%** |
| `system/loop-agent-type-system-prompt.template.md` | 33.4 KB | **37%** |
| `agents/actionsmith.template.md` | 40.1 KB | 32% (8 numbered "Turn type" examples, lines 377–582) |
| `agent-manager/planning-designer-agent.template.md` | 76.3 KB | 27% (138 guardrail markers) |

### 1.2 What MJ already does right

This is a trim, not a rewrite. Four of the post's six shifts are partly or wholly shipped:

- **Interfaces over examples (partial).** `packages/AI/CorePlus/scripts/generate-prompt-types.mjs`
  compiles TS interfaces into `generated-for-prompt/*.md`, pulled into the Loop template via
  `{@include}`. The `AgentScratchpad` output is exactly the target shape: typed interface,
  inline field comments, two sentences of usage note, zero examples. **The machinery exists;
  it just isn't the default authoring habit.**
- **Progressive disclosure for skills (done).** `BaseAgent.formatSkillsCatalog()`
  (`base-agent.ts:7167`) emits name + description only; `Instructions` load on activation, with
  the agent's `reason` recorded in the audit trail.
- **Auto-memory (done).** `memoryWrites` + Memory Manager replaces manual memory curation.
- **Prompt-cache discipline (done, and good).** The comment at
  `loop-agent-type-system-prompt.template.md:715` documents deliberately placing volatile blocks
  last to preserve a byte-stable cacheable prefix; `ContextCrush`'s `PartitionStablePrefix`
  supports the same goal.

### 1.3 Where the old tax is being paid

**Redundant examples.** The `LoopAgentResponse` interface is self-describing, then 6.5 KB across
16 JSON blocks re-demonstrate it. Specific redundancies:

| Block | Lines | Why it's redundant |
|---|---|---|
| Message Expansion example | `:157-166` | Interface already documents `messageIndex?: number` with a `when type='Retry'` comment |
| Skill activation example | `:576-586` | Interface documents `skills?: Array<{name, reason?}>`; prose above already explains activation |
| Client-tool navigation example | `:636-646` | Interface documents `clientTools?: Array<{Name, Params}>` |
| ForEach ❌/✅ contrast | `:379-401` | Teaches a frontier model that one call beats ten |
| Response Forms example | `:417-438` | `response-forms.ts.generated-for-prompt.md` is **already included** — this duplicates it |
| Commands example | `:446-473` | `ui-commands.ts.generated-for-prompt.md` is **already included** — this duplicates it |

**Instruction repetition.** The `⚠️ CRITICAL - Loop Results Are Temporary` warning appears three
times (`:208`, `:233`, `:352-353`), each restating the same fact.

**Instructions in the wrong place.** `loop-agent-type-system-prompt.template.md:617-625`
string-matches the *rendered action catalog* to conditionally inject workflow prose into the
system prompt:

```njk
{% if actionDetails and 'Create Document' in actionDetails %}
### Document Creation Workflow
... You must ALWAYS call Finalize Document after adding content ...
```

That is a property of three Actions, not of the agent type. `formatActionDetails()`
(`base-agent.ts:7212`) already renders Description, typed Input/Output params, and Result Codes —
the interface exists, it's just underused as the place to say things. Same pattern with the
"Choosing between Actions and Client Tools" block (`:648-651`).

**No progressive disclosure for Actions.** `maxActionsInPrompt` is blunt truncation (first N, no
search). There is no `ToolSearch` analogue, so an agent with a large action set pays for the full
catalog on every turn.

**Everything defaults to on.** `DEFAULT_LOOP_AGENT_PROMPT_PARAMS`
(`loop-agent-prompt-params.ts:325-342`) sets every inclusion flag to `true`. The Duplicate
Resolution Agent, Infographic Agent, and Memory Manager all carry ForEach docs, While docs,
response-form docs, command docs, message-expansion docs, and pipeline docs whether or not they
can ever use them.

### 1.4 The model is chosen after the prompt is rendered

`AIPromptRunner.executePrompt` has two branches with **opposite ordering**:

| Branch | Model selection | Template render |
|---|---|---|
| Hierarchical (`:774`) | `selectModel()` at **`:784`** | `:796-798` — **after** |
| Regular template (`:803`) | `selectModel()` at **`:843`** | `:821` — **before** |

`selectModel()` (`:1674`) takes `(prompt, explicitModelId, contextUser, configurationId, vendorId,
params)` and **never reads the rendered text**. There is no data dependency preventing the
regular branch from matching the hierarchical one.

Corroborating evidence this is the intended direction: `_MODEL_ID` and `_VENDOR_ID` **already
exist** as system placeholders (`prompt.system-placeholders.ts:243-257`) but resolve to
`params.override?.modelId || ''` — **empty on every normal run**, precisely because rendering
precedes selection. This is an existing latent gap, not just a missing feature.

The extension point is clean: `renderPromptTemplate()` merges
`SystemPlaceholderManager.resolveAllPlaceholders(params)` into the Nunjucks data context
(`:3009-3016`), and the manager exposes a public `registerPlaceholder` API.

### 1.5 Catalog data is not ready for capability-conditional prompts

**PowerRank is an ordinal within model type, not a normalized cross-type scale.** Measured
across all 167 distinct models:

```
Rerankers:  80, 90, 100, 110
LLMs:       0 … 26   (plus one outlier at 30)
```

A template writing `{% if _MODEL_POWER_RANK > 20 %}` is correct for LLMs and meaningless for a
reranker.

**Within LLMs, the ranks contain errors:**

```
P=30  DeepSeek V4 Flash     ← outranks every frontier model
P=26  Gemini 3.1 Pro
P=26  Claude Fable 5
P=25  Grok 4.5
P=24  Claude Opus 4.8
P=19  Claude Sonnet 5
```

**Claude Opus 5 is absent from the catalog entirely** — the Anthropic entries stop at Opus 4.8,
though Fable 5 and Sonnet 5 are both present.

This matters more than it looks. **Today a wrong PowerRank costs a suboptimal model choice —
visible and recoverable. Once prompt *content* keys off it, a wrong PowerRank silently ships the
wrong instructions, and the failure surfaces as degraded output with no obvious cause.** Rank
accuracy becomes load-bearing.

**Root cause — the authoring guidance bakes in inflation.** `.claude/commands/add-ai-model.md:57-72`
instructs: *"PowerRank (1-21+): … 21+: State-of-the-art frontier models"*. An open-ended top band,
filled by estimation with no external anchor, guarantees compression at the ceiling as new models
arrive. The three rank fields also have no stated direction; the semantics are inferable only from
data (higher power = better, higher speed = faster, **higher cost = more expensive**, i.e. cost is
inverted relative to the other two).

**The rebase is cheap right now and gets more expensive.** Across 96 prompts:

| Setting | Count |
|---|---|
| `SelectionStrategy: 'Specific'` | 64 |
| `SelectionStrategy` unset / `Default` | 32 |
| `MinPowerRank` set | **0** |

No prompt anywhere pins an absolute rank threshold. `PowerPreference` (Highest/Balanced/Lowest) is
rank-*order* relative and therefore invariant under rescaling. **A rebase today has effectively
zero migration blast radius** — that stops being true the moment anyone sets `MinPowerRank`.

### 1.6 One render, many models

Two paths break the "one model per render" assumption that capability-conditional content requires.
**Both are resolved by re-rendering per model (Phase 4c), not by constraining selection** — see
that phase for the cost analysis.

- **Parallel execution.** `executePromptInParallel(prompt, renderedPromptText, ...)` takes a
  *single* rendered string and fans it across N tasks. `ExecutionPlanner.ts:424-446` selects
  candidates by `PowerRank >= MinPowerRank` sorted by `PowerPreference`, so those N models can
  span a wide power range sharing one prompt. (It already short-circuits to a single task when
  `existingSelection?.model` is set — pre-selection *simplifies* this path.)
- **Failover.** `FailoverStrategy` includes a literal `'PowerRank'` mode that walks to a
  different-power model *after* rendering.

---

## Part 2: Goals & Non-Goals

### Goals

1. Reduce rendered system-prompt size for the top agents by a measured, non-trivial margin
   with **no regression** on agent evals.
2. Make "interface, not example" the default authoring mode, enforced rather than encouraged.
3. Give templates the ability to adapt content to the measured capability of the model actually running.
4. Establish the eval baseline that makes claims 1–3 verifiable rather than asserted.

### Non-Goals

- Rewriting agent-specific business logic or changing any agent's behavior contract.
- Removing safety-critical rules. **Guardrails whose violation is unrecoverable stay**
  (JSON-only response, `taskComplete` semantics, the plan-mode gate). Judgment replaces
  *stylistic* rules, not *safety* rules.
- Changing model *selection* logic. This proposal changes selection *timing* only (Phase 4a) and
  rebases the values selection reads (Phase 0.5) without altering how it reads them.
- Renormalizing `SpeedRank` / `CostRank`. Neither drives any runtime logic today — the only
  non-generated consumers are display and filtering in `model-management.component.ts`. Normalize
  them when something consumes them, not before.

---

## Part 3: Implementation Plan

Phases are ordered by dependency. Phase 0 gates everything; Phases 1–3 are independent of
Phases 4–5 and can run in parallel.

### Phase 0 — Prerequisites (gating)

> **Scoping note.** The review scoped this proposal to build items 1–6. Phase 0 is included
> anyway because items 1–6 are unverifiable without it: with 2 agent-eval tests, "no measurable
> loss" is unmeasurable by construction. It is deliberately minimal and can be cut, but cutting
> it means accepting the subtraction work on faith.

**0a. Eval baseline.** Grow `metadata/tests/` from 2 Agent Eval tests to ~5–8 per high-traffic
agent (Sage, Agent Manager, Research Agent, ActionSmith, Query Builder). Weight toward the
**deterministic** oracles — `schema-validate` and `trace-validate-sub-agents` — because they catch
the specific failure mode this work risks: *the model stopped emitting valid JSON because we
deleted the example*. `llm-judge` covers quality; the deterministic oracles cover the regression.
Reuse the existing pattern in
`metadata/tests/research-agent/.research-agent-mixed-db-and-web-question.json`.

**0b. Token-budget reporting.** Add per-agent rendered system-prompt size to the eval run output,
tracked over time. `ContextCrush` already provides the measurement primitives. This turns "we cut
40%" into a measured claim.

**0c. PowerRank rebase — absolute, anchored, locked.** See Part 3.5 below. *Gates Phase 4 only.*

**Definition of done:** eval suite runs green on current `next`, producing a per-agent token
baseline table.

---

### Phase 0.5 — PowerRank rebase: absolute, anchored, locked

This is the design detail behind Phase 0c. It gates Phase 4 only; Phases 1–3 and 5 do not depend
on it.

#### The model

**PowerRank is an absolute, permanent, monotonically-growing measure of model capability.** Not a
percentile, not a within-catalog ordinal.

Capability is a property of the model, not of its standing among peers. A model does not become
less capable when better models ship. Two consequences follow, and both are the point:

- **Ranks are locked once assigned.** Adding a new model can never change an existing model's
  rank, therefore can never change an existing model's prompt content. Prompt behavior for a given
  model is stable unless a human deliberately edits a threshold.
- **A capability threshold never rots.** `>= 500` asserts *"this much capability suffices for terse,
  example-free prompts."* That claim stays true as the ceiling rises; more models simply qualify
  over time, which is the desired behavior.

A relative/percentile scheme was considered and **rejected** for three reasons:

1. `AIPromptRun.ModelPowerRank` is persisted on every run (`AIPromptRunner.ts:2839-2840`). A
   percentile makes that historical column time-dependent and non-comparable across runs,
   destroying longitudinal analysis of quality and cost against capability.
2. Adding a model to the catalog would silently re-tier *existing* models and change prompt content
   estate-wide with no code or config change — the exact silent-failure class this spec exists to
   avoid.
3. It would demote still-capable older models and start feeding them verbose prompts they do not
   need. Wrong behavior, applied automatically.

#### The scale

- **Range: 1–1000 for today's catalog**, with current frontier models landing around the **500s**.
  This deliberately reserves roughly half the range as headroom. The column is `int`, so the scale
  can extend past 1000 if the arc demands it — 1000 is a working convention, not a ceiling.
- **Scoped per `AIModelTypeID`.** Each model type is rebased onto its own anchored scale, and every
  threshold comparison is type-scoped. A specialized, narrow-capability model class (rerankers,
  embeddings) must **not** carry high power values — today's rerankers at 80–110 would trip an
  LLM-oriented `>= 500` check the moment thresholds go live if left unscoped.
- **Resolution.** 136 LLMs over a 1–1000 range gives room to express real differences instead of
  the current clustering (19 models share PowerRank 8 today).

#### Direction and semantics (document explicitly)

| Field | Higher means | Higher is | Treatment |
|---|---|---|---|
| `PowerRank` | more capable | better | **Absolute, anchored, locked** |
| `SpeedRank` | faster | better | **Relative**, may be renormalized over time |
| `CostRank` | more expensive | **worse** | Relative; inverted vs. the other two |

Speed is treated relatively on purpose, and the asymmetry is principled rather than inconsistent:
speed has no absolute external anchor (throughput varies by vendor, region, and load) and "fast" is
inherently relative to current expectations. Capability has an anchor; speed does not.

Any future composite or `Balanced` scoring must account for **cost being inverted**. Measured
correlations across 136 LLMs show the three axes are near-independent — Power↔Speed `r = -0.220`,
Power↔Cost `r = +0.137` — so none is a usable proxy for another.

#### Authority and external sources

**MJ's ranks are authoritative.** External evaluations (Artificial Analysis blended intelligence
index, and other independent benchmarks) are *inputs used to place new models on our scale* — they
are never the scale itself, and MJ ranks are never re-derived when an external provider rebases its
methodology.

Per model, record: **source, index version, and as-of date**. Derive once at entry; never
re-derive. This is what preserves the lock.

#### Lock policy

"Locked" means **locked by default, not immutable.** Entry errors happen — DeepSeek V4 Flash at
PowerRank 30 outranking every frontier model is one sitting in the catalog today. Literal
immutability would enshrine it permanently.

- Ranks do not drift silently and are never changed as a side effect of adding another model.
- Corrections are a deliberate, rare, explicitly logged event. MJ's Record Changes provides the
  audit trail.
- The guarantee is *"ranks don't drift silently,"* not *"ranks never change."*

#### Work items

1. **Rebase every model type** onto its own 1–1000 anchored scale, with existing models placed by
   reference to independent evals rather than re-estimated by band. Correct the DeepSeek V4 Flash
   outlier in the same pass. Add **Claude Opus 5**, which is absent from the catalog entirely
   (Anthropic entries stop at Opus 4.8, though Fable 5 and Sonnet 5 are present).
2. **Rewrite the rank guidance in `add-ai-model`** — the weekly model-update routine. Currently
   `.claude/commands/add-ai-model.md:57-72` prescribes estimation into an open-ended `21+` band.
   Replace with: consult independent evaluations (Artificial Analysis blended intelligence index and
   peers), place the new model **relative to already-ranked models on our scale** rather than
   guessing a number, record source + version + as-of date, and never modify an existing model's
   rank as part of adding a new one. Update all three copies: `.claude/commands/`,
   `templates/claude-pack/commands/`, `templates/claude-pack/dist/v5/.claude/commands/`.
3. **Document direction, scale, and lock policy** in the column descriptions and in
   `metadata/ai-models/` guidance, so the semantics stop being inferable-only-from-data.
4. **Validate entry against evals.** When a model is added, confirm its measured performance on the
   Phase 0a suite is consistent with the rank the external index implies — then lock it. Validate
   once, at the moment of maximum doubt. This is a better fit than continuous re-ranking and gives a
   defensible answer to "why is this model ranked here?"

---

### Phase 1 — Configure what already exists (build item 1)

Set `AgentTypePromptParams` deliberately on the 23 agents that currently take defaults. Sage's
config is the reference model:

```json
{
  "includeForEachDocs": false,
  "includeWhileDocs": false,
  "includeVariableRefsDocs": false,
  "includeScratchpadDocs": true,
  "includeMessageExpansionDocs": false
}
```

Per-agent audit: does this agent ever iterate collections? poll? collect user input? trigger UI
commands? expand compacted messages? compose pipelines? Turn off what it cannot use.

- **Files:** `metadata/agents/*.json` only.
- **Risk:** Low — pure config, trivially revertable per agent.
- **Payoff:** Several thousand tokens per turn for most agents, immediately.

---

### Phase 2 — Subtract from the Loop system prompt (build items 2 & 3)

**2a. Delete redundant example blocks.** Remove the six blocks catalogued in §1.3. Target: 16
JSON blocks → ~4 or fewer. The two duplicating already-included generated interfaces
(Response Forms, Commands) are unambiguous deletions.

**2b. Deduplicate the repeated warning.** Collapse the three "Loop Results Are Temporary"
statements (`:208`, `:233`, `:352-353`) into one, stated once as a property of the mechanism.

**2c. Relocate tool-specific instructions.** Move the Document Creation Workflow block
(`:617-625`) into the `Create Document` / `Add Document Content` / `Finalize Document` Action
descriptions and Result Codes. Move "Choosing between Actions and Client Tools" (`:648-651`) into
per-tool descriptions. Delete the `{% if actionDetails and 'Create Document' in actionDetails %}`
string-match entirely.

- **Files:** `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`,
  `metadata/actions/*.json`.
- **Risk:** Medium — this is the shared system prompt for all 26 agents. Gated on Phase 0a.
- **Note:** Requires `mj sync push` to take effect; `@file:` references resolve at push time.

---

### Phase 3 — Make the pattern stick (build items 4 & 5)

**3a. Extend `generate-prompt-types.mjs` coverage** so every shape an agent must emit has a
generated interface, not a hand-written example.

**3b. Add an authoring rule.** In `metadata/CLAUDE.md` (and/or `.claude/rules/`): *no hand-written
JSON example for a type that has a generated interface.* Consider a `npm run check:prompts` CI
gate that fails when a template's fenced-block share exceeds a threshold, mirroring the existing
`check:ui` / `check:esm` / `check:claude-md` gates.

**3c. Externalize the large inline examples as references.** Per the post, references are good —
inlining them into every turn's system prompt is not:

- `research-report-writer.md` lines 336–918 (~580-line HTML template) → an artifact or skill file
  loaded when the agent is actually writing the report.
- `actionsmith.template.md` lines 377–582 (8 "Turn type" examples) → delete or reduce to a skill.

- **Risk:** Low-medium. 3c is per-agent and independently revertable.

---

### Phase 4 — Capability-aware rendering (the conditioning half)

**4a. Reorder selection before render.** In `AIPromptRunner.executePrompt`, move the regular-branch
`selectModel()` call (`:843`) above the render (`:821`), matching the hierarchical branch. Thread
the resulting `ModelSelectionResult` into `renderPromptTemplate()`.

Independently fixes `_MODEL_ID` / `_VENDOR_ID` resolving to empty on normal runs.

**4b. Add resolved system placeholders.** Via `SystemPlaceholderManager.registerPlaceholder`:

| Placeholder | Value |
|---|---|
| `_MODEL_POWER_RANK` | raw `PowerRank` of the selected model |
| `_MODEL_TYPE` | the model's type name, so a threshold can be guarded to its scale |
| `_MODEL_SPEED_RANK` | raw `SpeedRank` — available, but see the power-only rule below |
| `_MODEL_NAME` | for diagnostics and prompt-run traceability |

**Design decision: templates compare raw PowerRank against absolute thresholds. There is no tier
abstraction.**

```njk
{% if _MODEL_POWER_RANK < 100 %}
### ForEach: Process Collections Efficiently
...worked example...
{% endif %}
```

A named-tier layer (`frontier` / `standard` / `light`) was designed and **rejected**. Those labels
are definitionally market-relative, so they reintroduce exactly the time-dependence that Phase 0.5
eliminates from the rank itself — one level up, where it is harder to see. The failure mode is
concrete: a maintainer reads "frontier," observes that the boundary value is now mid-pack, and
raises it — silently changing prompt content for every model in between, none of whose capability
changed.

The question a template asks is capability-absolute — *"can this model follow the response protocol
without a worked example?"* — not *"is this model near the top of the current market?"* After the
rebase, PowerRank answers the first question directly and permanently. A tier enum answers the
second while appearing to answer the first.

**A threshold is a capability claim, and it does not move.** `>= 100` asserts "this much capability
suffices for terse, example-free prompts." That claim stays true as the ceiling rises; more models
simply qualify over time, which is the intent. A threshold changes only when the claim is shown to
be wrong — rare, deliberate, and backed by the Phase 0a eval that establishes it. Each conditional
block should carry a short comment naming the claim and the eval behind the number, so a future
reader knows what evidence would justify changing it.

**Thresholds are power-only.** Speed and cost inform model *selection*; they must never gate prompt
*content*. Measured Power↔Speed correlation is `r = -0.220` — near-independent — and four models are
simultaneously fast and frontier-class (Gemini 3.6 / 3.5 / 3 Flash, MiniMax-M2.5-highspeed).
Deriving prompt content from speed would hand exactly those models a reduced-capability prompt.

**Thresholds are only meaningful within a model type.** Each type is rebased onto its own scale
(Phase 0.5), so a bare `>= 100` would pass for a specialized model ranked 110 on a different scale.
Agent prompts run on LLMs in practice, making this largely theoretical today — but `_MODEL_TYPE` is
exposed so a conditional can guard itself where it matters, and the authoring guidance states the
rule explicitly.

**If a third distinct threshold appears, revisit.** Two or three raw comparisons are honest and
self-contained. A larger set would justify naming the capability claims — but that is a decision to
make against real usage, not to pre-build.

**4c. Re-render per model on the multi-model paths.** Existing selection logic stays exactly as
it is — whatever the developer configured at runtime (parallel pools, `PowerRank` failover,
`PowerPreference`) remains authoritative. Rendering adapts to selection, never the reverse.

Rendering is cheap enough to make this the obvious choice rather than a tradeoff:

- All 26 system placeholders are `async` in signature only — no DB, no network, no file IO — and
  resolve in parallel via `Promise.all` (`prompt.system-placeholders.ts:393-405`).
- `@include` is a **MetadataSync push-time** construct; resolved content is stored in the DB, so
  there is no file IO at render time.
- `TemplateEngineServer.Config()` and `loadTemplate()` run in the *caller*
  (`AIPromptRunner.ts:812-818`), not inside `renderPromptTemplate()` — a re-render re-runs the
  render step only, with no template reload.

Net: a re-render is a Nunjucks string pass plus pure-computation placeholders. Near-zero
execution time, and no reason to constrain selection to avoid it.

The actual work: `executePromptInParallel` currently accepts a single `renderedPromptText`
(`AIPromptRunner.ts:1077`) and shares it across all N tasks. Change it to render per task from the
task's own selected model, so each model in a mixed-power pool receives prompt content matched to
its capability. Same for the failover loop — re-render against the model actually being retried.

This is strictly better behavior than the alternative, not merely equivalent: failover to a
lower-power model currently inherits a prompt written for the original model, and per-model
rendering fixes that automatically.

- **Risk:** Medium-high — touches the core execution path for every prompt in the system.
  Reordering is behavior-preserving by inspection (no data dependency), but warrants the full
  integration tier, not just unit tests.

**Composition note:** this does not conflict with Phase 1. `AgentTypePromptParams` expresses *what
this agent needs*; `_MODEL_POWER_RANK` expresses *what this model needs told*. Different axes, both
multiplying into the same render.

**Caching note:** this does not degrade the prompt-cache design. The model is fixed for a run's
duration, so the rendered prefix stays byte-stable across turns exactly as intended at
`loop-agent-type-system-prompt.template.md:715` — there is simply a different stable prefix per
capability threshold.

---

### Phase 5 — Action-catalog progressive disclosure (build item 6)

Add a two-tier action catalog mirroring the Skills pattern: agents see `name — one-line
description` for their full action set, and request full param schemas for the ones they intend to
use (results arriving next turn, like `artifactToolCalls`). Replaces `maxActionsInPrompt`'s blunt
truncation with actual search.

- **Risk:** Highest — new round-trip semantics in the agent loop.
- **Sequencing:** Last. Largest structural win, most design surface. Should not block Phases 1–4.

---

## Part 4: Risks

| Risk | Mitigation |
|---|---|
| Deleting examples breaks JSON-format adherence on some model | Phase 0a deterministic oracles (`schema-validate`) catch exactly this; Phase 4 lets lower-ranked models keep the examples |
| Guardrails deleted for Opus-class models bite lower-ranked / non-Anthropic models | Gate the cuts on an absolute PowerRank threshold rather than applying globally; MJ agents run a configurable model set, not one model |
| Bad PowerRank data silently selects the wrong prompt variant | Phase 0.5 gates Phase 4: rebase against independent evals, validate at entry, lock |
| Rebasing PowerRank changes the meaning of existing configuration | Measured: 0 prompts set `MinPowerRank`; `PowerPreference` is rank-order relative and invariant under rescaling. Blast radius is nil **today** and grows once anyone pins an absolute threshold |
| An entry error becomes permanent under a lock policy | Lock is "no silent drift," not immutability — corrections are deliberate, rare, and logged via Record Changes |
| External index rebases its methodology, breaking comparability | MJ ranks are authoritative and derived **once** at entry; source + version + as-of date recorded per model; never re-derived |
| A specialized model type (reranker, embedding) trips an LLM threshold | Each type is rebased onto its own scale; `_MODEL_TYPE` is exposed so a conditional can guard itself, and the authoring guidance states the rule |
| Capability-conditional blocks multiply the test matrix | Every conditional block needs coverage on both sides of its threshold, or the below-threshold variant ships untested. Budget for this in Phase 0a |
| Parallel/failover renders one prompt for mixed-power models | Phase 4c re-renders per model; selection logic is left untouched |
| Loop-template changes affect all 26 agents at once | Phase 2 gated on Phase 0a; changes land per-block, not as one commit |

---

## Part 5: Success Metrics

1. **Token reduction** — rendered system-prompt size per agent, before vs after, from the Phase 0b
   report. Target: ≥30% on the top five agents.
2. **No eval regression** — Phase 0a suite scores within noise of baseline; deterministic oracles
   at 100%.
3. **Authoring durability** — fenced-block share across `metadata/prompts/templates/` trending
   down, enforced by the Phase 3b gate rather than vigilance.
4. **Threshold coverage** — every capability-conditional block has an eval on both sides of its
   threshold.
5. **Rank integrity** — every active model carries a rebased PowerRank on its type's 1–1000 scale
   with a recorded source, index version, and as-of date; no rank changes as a side effect of
   adding another model.

---

## Appendix: Mapping to the post's six shifts

| Post's shift | MJ status | Addressed by |
|---|---|---|
| Rules → judgment | 861 guardrail markers; repetition in Loop template | Phase 2b (safety rules explicitly retained) |
| Examples → interfaces | Generator exists, habit doesn't | Phases 2a, 3a, 3b |
| Upfront → progressive disclosure | Done for Skills; absent for Actions; 23/26 agents untrimmed | Phases 1, 3c, 5 |
| Repeat yourself → tool descriptions | Workflow prose in system prompt via string-match | Phase 2c |
| CLAUDE.md memory → auto-memory | **Already done** (`memoryWrites` + Memory Manager) | — |
| Simple specs → rich references | `TestRubric` entity exists, 0 records seeded | Phase 0a (rubrics are the natural follow-on) |
| *(MJ-specific)* model-adaptive context | Not possible — model resolved after render | Phase 4 |
| *(MJ-specific)* capability measurement | PowerRank inflating on an open-ended `21+` band, per-type scales colliding | Phase 0.5 |
