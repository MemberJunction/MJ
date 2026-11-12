# Decision-Ranked Action and Skill Suggestions

**Status**: Plan only. Nothing here is built.
**Date**: 2026-11-12
**Scope**: `@memberjunction/ai-agents`, `@memberjunction/core-actions`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-prompts`, the Testing Framework.
**Builds on**: typed decisions (`BaseDecision`, `AIDecisionRunner`), catalog narrowing (Task 3.7), decision discovery (Task 3.1), `DecisionReranker`, the decision-eval tooling, and calibration as metadata (`ModelConfiguration.Decision.Calibrations`).

Every claim about current code cites `file:line` at commit `c51c6f323` (branch `next` lineage). Claims I could not verify are marked **(unverified)** and collected in [Appendix A](#appendix-a-unverified-claims).

---

## 1. Summary

Agents find tools two ways today: the prompt describes their catalog, and three search actions (Find Candidate Actions, Find Candidate Skills, Find Candidate Agents) rank by embeddings, optionally fused with a lexical pass. Neither uses the fast decision models we now have, except catalog narrowing, which asks raw, uncalibrated probabilities once per run and only shortens prose that, under native tool calling, the prompt does not even render.

This plan adds one shared primitive, the **catalog-fit decision** (one Likelihood per candidate: "would this item accomplish the task?"), and uses it in two modes:

| | Mode A — search, then decide | Mode B — suggest before the turn |
|---|---|---|
| When | The agent calls a Find Candidate * action | Run start (every user message), and on a few mid-run signals |
| Recall from | Today's hybrid / semantic search, top 30–50 | The agent's own callable catalog (retrieval only above ~60 items) |
| Output | The same result rows, reordered by fit, top 5, each with a calibrated fit, plus `noneFits` | A short `## Suggested Capabilities` block in the trailing `<mj-runtime-state>` message |
| Fails to | Today's hybrid order, unchanged | Nothing injected |
| Budget | ~1.5 s on top of the search | 1.5 s, in parallel with Phase 2 pre-execution |

Decisions this plan makes:

| # | Decision | Why |
|---|---|---|
| D1 | Likelihood per item, not Choice, as the primary question | Independent per-item scores rank, threshold and express "none fits"; a Choice sums to 1 and cannot. §4.3 |
| D2 | Rank with raw probabilities, threshold only with calibrated ones | Platt scaling is monotone for `A > 0`, so ordering needs no calibration; every cut does. §4.5 |
| D3 | Suggestions go in the trailing runtime-state message, never the system prompt or history | Keeps `tools → system → history` byte-stable, so the cache layout from #4508 is untouched. §6.3 |
| D4 | One decision call per run start serves both suggestions and (legacy) narrowing | Avoids two calls over the same catalog. §6.5 |
| D5 | Trimming native tools is a later, separate opt-in, frozen per run | It is where token savings are, and where reachability and caching risks are. §6.6 |
| D6 | Candidates are always the post-permission callable set | A suggestion must never name something the user or agent cannot use. §11 |
| D7 | Shadow mode first, everywhere; nothing is injected until a calibrated threshold is set from data | Same discipline that set discovery's 0.85. §7 |

---

## 2. How agents find actions and skills today

### 2.1 The search actions

All three live in `packages/Actions/CoreActions/src/custom/ai/` and share `RunSemanticEntitySearch` (`semantic-entity-search.helper.ts:56-92`), which calls `Provider.SearchEntity` over a daily-synced `EntityDocument`.

| Action (+ single-result twin) | Base class | Search mode | Searches over | Permission filter | Defaults |
|---|---|---|---|---|---|
| Find Candidate Actions (Find Best Action, deprecated) | `base-find-actions.action.ts` | `semantic` (default arg, `:62`) | **Every** system action (`AIEngine.Instance.SystemActions`, `:70`), minus category Agent Management (`:78-80`) | None | MaxResults 10, MinimumSimilarityScore 0.5 (`:44-45`) |
| Find Candidate Skills (Find Best Skill) | `base-find-skills.action.ts` | `hybrid` (`:109-116`), lexical fallback (`:141-149`) | Active skills; agent-eligible set only when the `AgentID` param is passed (`:197-229`) | Only via `AgentID` (`:205-212`); without it, none (`:216-219`) | MaxResults 10, MinScore 0.35 (`:30-33`) |
| Find Candidate Agents (Find Best Agent) | `base-find-agents.action.ts` | `hybrid` (`:65`), cosine floor on the semantic component, any lexical hit passes (`:84-89`) | All agents | `AIAgentPermissionHelper.FilterRunnableAgents` (`:104`) | MaxResults 5, MinScore 0.5 (`:43-44`) |

Observations that matter for this plan:

- **Find Candidate Actions is system-wide, not agent-scoped.** An agent can only call its effective actions (`validateActionsNextStep`, `base-agent.ts:8021-8060`, retries on anything else). So a hit outside that set is useful for task-graph authoring (the task-graph validator accepts any active action, `base-agent.ts:7965-7976`) and useless as a way to reach an action narrowing hid.
- **Actions search is semantic-only**, so an action created since the last vector sync is invisible to it. Skills and agents added a lexical pass for exactly this reason (`base-find-agents.action.ts:60-64`).
- **Find Candidate Skills ignores the trusted `Context.AgentID`.** `BaseAgent` stamps the calling agent on every action context (`base-agent.ts:13838-13857`), but the skill search reads only the model-authored `AgentID` param. Without it, skills the user may not run can be returned.
- **Find Candidate Skills swallows search errors** (`base-find-skills.action.ts:136-138`, empty `catch`), which the house rules forbid. Fix in passing.
- Results go back as one JSON string in `Message` plus `MatchedActions`/`MatchedSkills`/`MatchedAgents` output params (`base-find-actions.action.ts:133-143`, `base-find-skills.action.ts:151-172`, `base-find-agents.action.ts:118-128`). Scores are cosine or a lexical stand-in, not probabilities.

### 2.2 Hybrid skill ranking

`RankSkillsByHybridRelevance` (`packages/AI/Agents/src/catalog-narrowing.ts:461-531`) scores `0.65 × query fit + 0.20 × frequency + 0.15 × recency` (14-day half-life), pinned first. `PreFilterSkillCandidatesForDecision` (`:549-590`) uses it to cut unpinned skills to `maxSkillDecisionCandidates` (default 30, `:71`) before narrowing asks the decision model.

In practice it is lexical only: the one caller passes no telemetry (`base-agent.ts:12859-12863`), so `SemanticScore`, invocation counts and `LastInvokedAt` are all undefined and only `computeLexicalSkillFit` contributes. Nothing ranks actions by hybrid relevance; actions have only the semantic search above.

### 2.3 How the catalog reaches the model

What the Loop system prompt shows depends on the tool-calling mode resolved for the run (`metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`):

| Mode | Actions | Skills | Sub-agents |
|---|---|---|---|
| Envelope (no native tools) | Full prose catalog with parameters, `{{ actionDetails }}` (`:935-939`) | Prose catalog (`:942`) | Prose catalog |
| Native tool calling, hybrid control | **Header only**, no `actionDetails` (`:917-934`); every action declared as a tool | Prose catalog | Prose catalog |
| Native-only (implicit control) | Header only; every action declared as a tool | **Not rendered** (`:942`, `not _NATIVE_ONLY`) | Declared as `delegate_to_*` tools |

`applyNativeTools` declares every effective action, explicitly ignoring narrowing (`base-agent.ts:6186-6250`, comment at `:6200-6203`), because a call to an undeclared tool is refused and native mode has no `Actions` envelope to fall back on.

Two consequences:

1. **Action narrowing is a no-op under native tool calling.** It narrows `actionDetails`, which those modes do not render. The token cost there is the tool declarations themselves.
2. `actionDetails` also drives a template conditional: the Document Creation Workflow docs render only when `'Create Document' in actionDetails` (`:989`). Narrowing that hides Create Document drops those docs. Any trim we add must keep such couplings in mind.

Skills are progressive-disclosure: the prompt shows name and description, and the model activates by name with a `Skill` step (`guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md:25`, template `:942-960`). The self-activation set is `GetAutoActivatableSkillsForAgent(agent, user)` filtered by the `filterAvailableSkills` policy (`base-agent.ts:12707-12708`); it is already permission-filtered.

### 2.4 Catalog narrowing (Task 3.7)

`ensureCatalogNarrowing` (`base-agent.ts:12832-12888`), called from `gatherPromptTemplateData` (`:12715`):

- Off unless `decisionsEnabled` and a positive `maxActionsInPrompt` / `maxSubAgentsInPrompt` / `maxSkillsInPrompt` (`:12845-12851`; `catalog-narrowing.ts:136-141`).
- Once per run, **sequentially before the first prompt**, with a 30 s timeout (`base-agent.ts:2280`, `:12981-13026`).
- One Likelihood per unpinned candidate: `This {kind} is useful for the request: {name}: {description}` (`catalog-narrowing.ts:224-227`), state = the opening request capped at 8,000 chars (`:65`, `:190-202`).
- Keeps the top N by **raw** probability, no threshold, no calibration (`:248-272`, sort at `:266`). A missing answer fails open (`:274-285`).
- Pinned and never asked: actions with `MinExecutionsPerRun`, the four finder actions (`:57-62`), sub-agents with `MinExecutionsPerRun`, explicitly assigned skills (`base-agent.ts:12917-12940`).
- Actions are narrowed only when the agent has Find Candidate Actions (`catalog-narrowing.ts:180-183`).
- Recorded as a `Catalog narrowing` Decision step whose prompt run counts toward the run's cost and tokens (`base-agent.ts:13057-13087`, `:13066`).
- No quality measurement exists for it.

### 2.5 Decision discovery (Task 3.1): the precedent

`InjectDecisionDiscovery` (`base-agent.ts:5297-5329`), launched inside Phase 2's `Promise.all` (`:3134`):

- Choice over up to 25 agents (`decision-discovery.ts:45`), narrowed by the same semantic search when larger, plus an any-applies Likelihood (`:179-180`).
- 1.5 s budget (`:140`); a timeout aborts and injects nothing, and a late prompt run is still linked to the step.
- Calibrated threshold 0.85 (`:64`), measured on 258 labelled requests (Jev: 21.7% coverage at 95.3% precision). Uncalibrated models inject nothing and warn once.
- Only on the conversation's opening turn (`IsOpeningTurn`, `decision-discovery.ts:310`; set at `base-agent.ts:3028`).
- Injected as a `<suggested_agent>` system message unshifted to the front of the conversation (`base-agent.ts:5324`, `:3138-3144`).
- Known gap #4938: the any-applies Likelihood never sees the options, because a per-question driver answers each question on its own (`decision-discovery.ts:164-178`). So "none fits" is weak.

The per-question point generalizes: with Jev bound first in `Default Decision` (`metadata/prompts/.default-decision-prompt.json`, priority 10 vs LLM Decision 5), **each question is judged independently**. A design that needs the model to compare candidates inside one question will not get that from Jev.

### 2.6 DecisionReranker

`packages/AI/Reranker/src/DecisionReranker.ts`: one Likelihood per document, 20 documents per call by default (`:46`), parallel batches within a 15 s budget (`:38`, `:187-196`). Its private `DecisionRerankRunner` (`:74-115`) reads the smallest `Decision.MaxQuestionsPerCall` across the prompt's candidate models, which is the batching rule we need. Used for agent memory/example injection only.

### 2.7 Decision model limits in metadata

`DecisionConfigurationSettings` (`packages/AI/Core/src/generic/modelConfiguration.ts:469-478`): `MaxQuestionsPerCall`, `MaxChoiceOptions`, `MaxScoreLevels`, `MaxStateTokens`.

| Model | MaxQuestionsPerCall | MaxChoiceOptions | MaxStateTokens |
|---|---|---|---|
| Jev (`metadata/ai-models/.jev-models.json`) | not declared | 255 | 32,000 |
| Clef (`.clef-models.json:14`) | 64 | 255 | — |
| Perplexity Decider (`.perplexity-decider-models.json:14`) | 128 | 255 | — |

The brief's "up to 1,000 questions per call" is **(unverified)** for Jev: nothing declares it. The Gemini driver's tests show a provider rejecting more than 1,000 (`packages/AI/Providers/Gemini/src/__tests__/geminiDecision.test.ts:252`). We batch by the declared minimum and treat 1,000 as an upper bound, not a plan input.

`DecisionParams.State` should be kept narrow "to avoid state projection degradation" (`packages/AI/Core/src/generic/decision.types.ts:108-111`).

### 2.8 Prompt-cache constraints

From `guides/AGENT_PROMPT_CACHING_GUIDE.md`:

- Caches are a prefix match over `tools → system → messages` (`:13`). A change in tools or the system prompt invalidates everything after it.
- Volatile state lives in a trailing `user` message, `<mj-runtime-state>`, built by `buildVolatileStateMessage` (`base-agent.ts:7214-7262`) and never persisted (`:40`). Anthropic's breakpoint sits before it, so it is sent uncached.
- Prefix-cache providers (OpenAI, xAI) run append-only: prior fragments are retained and the new one appended.
- Native tools on Anthropic are append-only, and **a change to tools or system prompt mid-run drops replayed reasoning** (`:60`).
- Measured gains: 66–96% cached on iterations 3+, 37–80% prompt cost cut (`packages/AI/Agents/docs/PROMPT_CACHE_PERFORMANCE_BRIEFING.md` §2).

So: anything per-turn goes in the trailing fragment; anything that touches tools or the system prompt is decided once per run and frozen. Narrowing already changes the system prompt per run, which costs cross-run cache reuse **(unverified: cross-run reuse was not measured in the briefing)**.

### 2.9 Real catalog sizes

Counted from `metadata/agents/*.json` (`MJ: AI Agent Actions` rows) and `metadata/ai-skills/*.json` (11 skills, 10 `ActivationMode: Auto`):

| Agent | Actions | Sub-agents | Auto skills it can see* | Has Find Candidate Actions / Skills | Native tools |
|---|---|---|---|---|---|
| Sage | 28 | 2 | 10 | No / No | default |
| Chief of Staff | 17 | 0 | 10 | No / No | default |
| Research Agent | 9 | 1 child + 4 relationships | 10 | No / Yes | `DeclareActionsAsNativeTools: false` |
| Query Builder | 3 | 1 | 10 | No / No | default |
| ActionSmith / SkillSmith | 11 / 8 | 0 | — | — | default |

\* `SkillActivationMode: Auto` and `AcceptsSkills: All` on Sage, Chief of Staff, Research Agent, Query Builder; the visible set is further cut by user permission and policy.

So shipped catalogs sit at 13–40 items. Sage (28 + 10 + 2 = 40) and Chief of Staff (27) cross a threshold of 20; most others do not. Customer installs grow skills into the hundreds (`guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md:278-280`), which is the case that matters. None of the shipped agents sets `decisionsEnabled` or any narrowing limit.

### 2.10 Documentation mismatches found

| Where | Says | Code does |
|---|---|---|
| `loop-agent-prompt-params.ts:612-615` | With `decisionsEnabled` false, skills get "direct top-N hybrid selection" | `ensureCatalogNarrowing` returns before narrowing anything (`base-agent.ts:12845-12847`) |
| `AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md:300-301` | `maxSkillsInPrompt` defaults to 25; `maxSkillDecisionCandidates` 60 | No default for the first; 30 for the second (`catalog-narrowing.ts:71`) |
| Same guide `:303-317` | `narrowCatalogsIfConfigured`, `selectRelevantCatalogItems`, weights 0.55/0.25/0.20, 7-day half-life, usage telemetry | None of those names exist; weights 0.65/0.20/0.15, 14 days (`catalog-narrowing.ts:466-469`); no telemetry passed |
| Same guide `:318` | Activated and requested skills are pinned (`pinnedSkillIDs`) | Only assigned skills are pinned (`base-agent.ts:12925-12938`) |

Phase 0 fixes these docs; they would otherwise mislead anyone implementing this plan.

---

## 3. Design principles

1. **Recall from search, precision from the decision.** Embeddings find plausible candidates cheaply; the decision model judges fit against the actual task.
2. **Advisory, never restrictive** (until Phase 3 opts in). A suggestion never removes the ability to call anything permitted.
3. **Fail open to today's behaviour.** Every error, timeout, cancellation or uncalibrated model leaves the agent exactly as it is now.
4. **Calibrated before acted on.** No threshold is applied to a raw probability. Calibrations are metadata keyed by use, question and resolved model.
5. **Cache-stable.** Tools and system prompt never change because of a suggestion within a run.
6. **Measured before on.** Every mode ships with `shadow` and an eval.

---

## 4. The shared core: the catalog-fit decision

### 4.1 Candidates

```ts
// packages/AI/CorePlus/src/catalog-fit.ts (new, pure)
export type CatalogFitKind = 'action' | 'skill' | 'agent';

export interface CatalogFitCandidate {
    Kind: CatalogFitKind;
    ID: string;
    Name: string;
    Description: string;          // trimmed, capped at CATALOG_FIT_DESCRIPTION_MAX_CHARS (400)
    Detail?: string;              // actions: input parameter names; skills: bundled action names
    Pinned: boolean;              // never asked; see §6.7
}
```

A candidate with a blank description is not asked (the decision model would judge on its name alone); it is recorded as `WithoutDescription`, as discovery does (`decision-discovery.ts:373`).

### 4.2 Questions and state

One Likelihood per unpinned candidate, keyed `c1…cN` like narrowing (`catalog-narrowing.ts:229-240`):

| Mode | State | Question instructions |
|---|---|---|
| A (search) | `Task: <TaskDescription>` + `\nUser request: <opening request>` when the call comes from an agent run | `This {kind} can accomplish the task: {Name}: {Description}{Detail}` |
| B (suggest) | `<latest user message>` (8,000-char cap, as narrowing) | same wording |

One wording for both modes means one calibration per kind, not two. The difference in state is deliberate: in Mode A the model has already told us what it needs, which is a better signal than the user's raw message. Whether adding the user request helps or hurts Mode A is an eval arm (§7.2), because of the state-projection warning in `decision.types.ts:108-111`.

The narrowing wording ("is useful for the request") stays as is: it is not calibrated and changing it is free, but D4 replaces its call anyway.

### 4.3 Likelihood per item vs Choice

| | Likelihood per candidate | One Choice over candidates |
|---|---|---|
| Output | Independent `P(fits)` per item | Distribution summing to 1, plus a confidence |
| Top-k | Natural: sort | Only the top answer is reliable; the tail is a softmax over leftovers |
| "None fits" | Expressible: max calibrated P below a floor | Not expressible (`decision-discovery.ts:164-178`) |
| Multi-tool tasks (search, then summarize) | Several items can be high | Forced to pick one |
| Per-question drivers (Jev) | Exactly what they do | Fine, but the separate any-applies question cannot see the options |
| Option limits | `MaxQuestionsPerCall` (batch) | `MaxChoiceOptions` (255 on Jev) |
| Calibration | One Platt per kind | Confidence Platt, as discovery |
| Cost | N questions | 1 question, N option descriptions |

Decision: **Likelihood per item** for both modes. A Choice is kept as an eval arm for the single-result actions (Find Best Skill / Agent / Action), where only one answer is wanted, and to compare against discovery's numbers. If the Choice arm wins for single-result calls by a clear margin, those actions use it; nothing else does.

### 4.4 Batching and cost

- Batch size = smallest `Decision.MaxQuestionsPerCall` declared by any model the decision prompt can run on, else 64. Extract `DecisionRerankRunner.GetMaxQuestionsPerCall` (`DecisionReranker.ts:84-115`) into `@memberjunction/ai-prompts` so the reranker and this feature share it.
- Batches run in parallel within one budget, as the reranker does (`:187-196`).
- Size per question ≈ 60–120 tokens with a 400-char description. At 50 candidates and a 500-token state: ~5K–6K input tokens per call. If a per-question driver re-reads the state per question (**unverified** how Jev bills), ~30K tokens. At $0.04–0.10 per 1M input tokens either is well under $0.01 per call.
- State must stay under `MaxStateTokens` (32,000 on Jev); the 8,000-char cap keeps it there.

### 4.5 Calibration

Platt scaling is `sigmoid(A · logit(p) + B)` (`decision.types.ts:236-265`). For `A > 0` it is monotone, so **ranking by raw probability equals ranking by calibrated probability**. Calibration matters only where we cut:

| Calibration key (`use` / `question`) | Used for |
|---|---|
| `catalog-fit` / `action`, `skill`, `agent` | The fit shown to the model, Mode B's inclusion threshold, Mode A's per-row confidence |
| `catalog-fit` / `<kind>.best` | `noneFits`: a Platt fitted on `max_i p_i` against "a correct item was among the candidates" |

The second key is what fixes the #4938 shape for this feature: "none fits" is learned from the set's best score, not asked as a separate blind question.

Lookups go through `FindDecisionCalibration` with a `DecisionCalibrationSource` (`packages/AI/CorePlus/src/decision-calibration.ts:53-60`), reading `ModelConfiguration.Decision.Calibrations` (the in-flight calibration-as-metadata work; assumed merged). An answer from a model with no entry: Mode A still reorders by raw probability but reports `fit: null` and `noneFits: null`; Mode B injects nothing and warns once per model, as discovery does (`base-agent.ts:5410`).

A guard: if a fitted `A ≤ 0` ever appears, treat the calibration as invalid (it would invert the ranking) and log it.

### 4.6 Latency, fallback, cancellation

Reuse discovery's bound (`boundDecisionDiscovery`, `base-agent.ts:5431-5460`): one `AbortController`, aborted by timeout or the run's cancellation token, the call raced against it, and a late prompt run still linked to the step so its cost counts. Generalize it into a helper used by discovery, narrowing and this feature, instead of a third copy.

Budgets: Mode A 1,500 ms for the decision (on top of the search, typically 100–400 ms **(unverified)**); Mode B 1,500 ms in parallel. Jev's ~150–250 ms leaves room for one LLM Decision fallback on small batches; LLM Decision on large batches will often miss the budget, which is acceptable (fail open).

---

## 5. Mode A: search, then decide

### 5.1 Flow

```
Find Candidate X(TaskDescription, MaxResults, …)
  1. hybrid / semantic search, over-fetch K = max(30, 3 × MaxResults), cap 50
  2. existing filters (permissions, invocation mode, eligibility, bound params)
  3. if decision ranking is on: one catalog-fit decision over the survivors (≥ 3 of them)
  4. sort by fit (ties keep search order), return top MaxResults
  5. annotate each row and the envelope
```

Step 3 runs after the filters, so the decision only ever sees what the caller may use (D6).

### 5.2 When it is on

| Caller | Switch |
|---|---|
| Inside an agent run | `BaseAgent` stamps `Context.CatalogFit = { Mode: 'off' \| 'shadow' \| 'on', PromptName, OpeningRequest, CallableActionIDs? }` when the agent's merged prompt params have `decisionsEnabled: true` and `catalogSearchRanking` ≠ `'off'` (§8). The action trusts the stamp, never a model-authored param, for enabling. |
| Anywhere else (MCP, direct, workflow) | New optional input param `RankWithDecision` (default `false`). An explicit use, so not gated by the master switch, consistent with `loop-agent-decisions.md:51-65`. |

In `shadow` the action asks, records, and returns hybrid order.

### 5.3 Output (additive)

Existing rows keep every field. Added per row: `fit` (calibrated, or null), `rawFit`. Added to the envelope and as output params: `rankedBy: 'decision' | 'search'`, `noneFits: boolean | null`, `bestFit: number | null`, `fallbackReason?`. `MaxResults` keeps its meaning; inside an agent run with ranking on, its default becomes 5 (the agent can still ask for more).

When `noneFits` is true the message says so in one line ("No result fits the task well; try a broader or different description"), so the model widens the search instead of forcing a poor match.

### 5.4 Scope fixes that ride along

- **Find Candidate Actions gains `Scope: 'all' | 'agent'`.** Default `'all'` (task-graph authoring keeps working). `'agent'` restricts to `Context.CallableActionIDs`, which `BaseAgent` stamps from `_effectiveActions`, so runtime `actionChanges` and skill-granted actions count. The narrowing note (`catalog-narrowing.ts:345`) tells the model to pass `Scope: "agent"`.
- **Actions search becomes hybrid**, with the same semantic-floor rule the agent search uses (`base-find-agents.action.ts:84-89`), so newly created actions are findable.
- **Find Candidate Skills defaults `AgentID` to `Context.AgentID`** when inside a run, so the permission filter always applies there.
- The empty `catch` (`base-find-skills.action.ts:136-138`) logs.

### 5.5 Where the code lives

`@memberjunction/core-actions` deliberately avoids loading the agent runtime (`base-find-actions.action.ts:29-33`), so the pure logic goes in `@memberjunction/ai-core-plus` (`catalog-fit.ts`) and the call goes through `AIDecisionRunner` directly, as `run-decision.action.ts` already does. One helper, `catalog-fit-rerank.helper.ts`, is called by all three base classes.

---

## 6. Mode B: suggest before the turn

### 6.1 When it runs

All must hold:

- `decisionsEnabled: true` and `catalogSuggestions` ≠ `'off'`.
- Loop agent, not session-driven (realtime) and not Flow.
- `unpinned callable actions + visible auto skills` > `catalogSuggestionMinItems` (default 20). Sub-agents are counted and asked only when `catalogSuggestionIncludeSubAgents` is true (default false: discovery and `delegate_to_*` already cover them, and mixing kinds in one ranking needs its own calibration).
- The run has a user message and a context user.

Triggers:

| Trigger | When | Why |
|---|---|---|
| Run start | Every run, i.e. every user message (one run per message in conversations) | The need is set by the latest message. Unlike discovery, suggesting a tool for a follow-up cannot pull the agent away from an engaged sub-agent, so follow-ups are included. |
| Search came back empty | A Find Candidate Action/Skill returned `NO_*_FOUND` or `noneFits: true` | The agent is looking and failing; re-ask with its `TaskDescription` as state |
| Unknown-tool retry | `validateActionsNextStep` retries for a missing action (`base-agent.ts:8047-8060`), or native mode refuses an undeclared tool (`:4386-4391`) | Same |
| Skill activated | A `Skill` step changes the callable set | Suggestions may now name the newly unlocked actions |

At most `catalogSuggestionMaxRefreshes` (default 2) mid-run refreshes per run. Not re-asked on every iteration: the latest user message has not changed, so neither has the answer.

### 6.2 Candidates

Built from the same sets the prompt uses: `_effectiveActions` and `availableSkills(..., 'catalog', ...)` (`base-agent.ts:12707-12708`), so permission and the `filterAvailableSkills` policy apply. Pinned items are excluded (§6.7). Already-activated skills are excluded (they are not choices any more).

Above `catalogFitMaxCandidates` (default 60) unpinned items, pre-filter to that many with **real** retrieval: `SearchEntity` in hybrid mode against the latest message for skills (and actions once their search is hybrid), merged with `RankSkillsByHybridRelevance` fed the semantic scores it is currently denied (§2.2). Below it, ask about everything: 60 questions is one or two calls.

### 6.3 Where it goes

Run-start suggestions are computed in Phase 2 alongside memory, RAG and discovery (`base-agent.ts:3121-3145`), and stored on the run (`_catalogSuggestions`). They are **rendered into the trailing `<mj-runtime-state>` message**, as a new section built by `RuntimeStateFragmentBuilder` (`runtime-state-fragment.ts`):

```
## Suggested Capabilities
A decision model judged these the best fit for the latest request (fit = calibrated probability):
- Action **Web Search** (0.94)
- Skill **Data Visualization** (0.91)
Use them if they fit. Every other capability is still available.
```

Why there and not where discovery puts `<suggested_agent>` (unshifted to the front, `base-agent.ts:5324`):

| Placement | Cache effect | Verdict |
|---|---|---|
| System prompt | Changes per run; on mid-run refresh, invalidates everything | No |
| Front of history (discovery's choice) | Fine on an opening turn with no history; on a follow-up, shifts the whole history and misses the cross-run cache | No, because Mode B runs on follow-ups |
| New message appended to history on refresh | Persists into history; append-only providers carry it forever | No |
| Trailing runtime-state fragment | Already volatile, already outside Anthropic's breakpoint, never persisted (`AGENT_PROMPT_CACHING_GUIDE.md:40`) | **Yes** |

Two rules keep the cost bounded:

- **Replace-in-place providers**: the section is in every iteration's fragment (~60–120 tokens, uncached either way).
- **Append-only providers** (prefix caches, and native tools on Anthropic): the section is included only in the fragment of the iteration on which the suggestions were computed or changed. Later fragments omit it; the earlier fragment is still in the history, so the model still sees it.

The template's static `## Runtime State` pointer (`template :1158-1163`) gains one clause, "and, when present, suggested capabilities", inside the existing `if`. That is a one-time change to a static string, so it keeps the system prompt byte-stable across iterations. `loop-agent-system-prompt-snapshot.test.ts` is updated deliberately.

"State only, never rules" (`AGENT_PROMPT_CACHING_GUIDE.md:38`) holds: the section is a framework judgment plus one sentence of usage, not new behaviour.

### 6.4 Selection

- Keep candidates with calibrated fit ≥ `catalogSuggestionMinConfidence`, at most `catalogSuggestionMax` (default 5), ordered by fit.
- If none clears the threshold, inject nothing. "Nothing fits" is not announced in Mode B: the agent has its full catalog and the finder actions.
- The threshold has **no shipped default until the eval sets one** (§7.4). With no threshold configured and no calibration, the feature can only run in `shadow`.

### 6.5 Interaction with catalog narrowing

Narrowing and suggestions judge the same catalog against the same message. Phase 2 merges them:

- When both are on, **one** catalog-fit call at run start answers both. Narrowing reads the raw probabilities (its top-N rule is unchanged); suggestions read the calibrated ones. `ensureCatalogNarrowing` (`base-agent.ts:12832`) waits on the Phase 2 promise instead of asking again, so narrowing also stops being a sequential 30 s step.
- Narrowing keeps its own question wording only until the shared call replaces it; its results are uncalibrated and unmeasured, so nothing depends on its exact wording.
- Long term (Phase 4), if shadow data shows suggestions plus finders cover what narrowing covers, deprecate `maxActionsInPrompt` for actions: under native tool calling it does nothing (§2.3), and in envelope mode it changes the system prompt per run.

A suggested item is always visible in the catalog: if narrowing would hide something that suggestions selected, it is un-hidden.

### 6.6 Native tools: trimming the declared set (Phase 3, separate opt-in)

The prose catalog is not where native-mode tokens go; the tool declarations are. So the real saving is to declare fewer tools. That is also where the risks are:

| Risk | Mitigation |
|---|---|
| A needed tool is undeclared; the call is refused and native mode has no `Actions` envelope (`base-agent.ts:6200-6203`) | Declared set = pinned + the four finders + suggestions + top-`catalogToolLimit` by raw fit (default 15). Always keep Find Candidate Actions declared with `Scope: "agent"` so a hidden action is reachable. |
| Reaching a hidden tool | When an agent-scoped Find Candidate Actions returns a callable but undeclared action, push it onto `params.actionChanges` with `scope: 'specific'` (as skill activation does, `AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md:122`) so it is declared from the next turn. |
| Changing tools mid-run invalidates the cache and drops replayed reasoning on Anthropic (`AGENT_PROMPT_CACHING_GUIDE.md:60`) | The trimmed set is decided once at run start and frozen. Only the widening above changes it, at most `catalogToolMaxWidenings` (default 2) times, and the drop is the documented, accepted cost of a skill activation today. |
| Cross-run cache: a different tool set per run misses the previous run's cached tools + system prompt | Measure it (§7.5). If it costs more than it saves, Phase 3 stays off. |
| Template couplings (`'Create Document' in actionDetails`, `template :989`) | Trim applies to `promptParams.tools` only; `actionDetails` is unchanged in native mode, so the conditional is unaffected. Add a test. |
| Native-only agents cannot see the skills catalog at all (`template :942`) | Out of scope; noted as a separate gap. |

Trimming ships only after shadow data shows recall of the trimmed set ≥ 0.98 on actions the agents actually called (§7.4), and only under `catalogToolTrim: true`.

### 6.7 Pinned items and `MinExecutionsPerRun`

- Same pinning as narrowing (`base-agent.ts:12917-12940`): actions and sub-agents with `MinExecutionsPerRun > 0`, the finder actions, explicitly assigned skills when unpinned ones exist.
- Pinned items are never asked, never suggested, never trimmed. They are already required or always shown; spending a question on them adds nothing, and naming them in suggestions would dilute the list.
- `MinExecutionsPerRun` validation (`base-agent.ts:22168-22205`) is unchanged.

---

## 7. Measurement plan (before anything is turned on)

Modelled on discovery's eval (`decision-discovery.ts:47-62`) and the tooling in `packages/TestingFramework/Engine/src/decision-eval/`.

### 7.1 Labelled corpus

New rig `rigs/generate-catalog-fit-corpus.ts`, shaped like `rigs/generate-discovery-corpus.ts`:

- Loads the callable catalog of a target agent (Sage, Chief of Staff) for a context user, through the same shared functions production uses.
- For each action and skill: `--per-item` requests it should handle (`label: 'single'`, `itemIds: [id]`).
- Multi-tool requests built from co-occurring pairs (`label: 'multi'`, `itemIds: [...]`; any listed item counts as a hit, all items for the strict metric).
- `--none` requests no catalog item fits (`label: 'none'`; chat, out-of-domain, answerable directly).
- A **synthetic large catalog** arm: the shipped catalog padded with plausible distractor skills to 200 and 1,000 items, since shipped catalogs are only 13–40 items (§2.9).
- Search-mode records add a `taskDescription` as an agent would phrase it (a second generation pass from the request).
- Writes outside any git tree and refuses otherwise, like the discovery rig.

**Silver labels from production** (opt-in, per installation): pairs of (run's opening request, actions and skills the run actually executed successfully) from `MJ: AI Agent Run Steps`. Biased toward what agents already find, so used for the shadow comparison (§7.3), not for calibration.

### 7.2 Offline eval

A `Decision Eval — Catalog Fit` suite (sibling of `DEFAULT_DISCOVERY_EVAL_SUITE_NAME`, `discovery-types.ts:57`), run through `PinnedDecisionRunner` per model (Jev, LLM Decision on GPT-OSS-120B, Clef, Gemini Decision 1), three repeats each.

Arms:

| Arm | Mode | Ranking |
|---|---|---|
| `search` | A | Today's search order (semantic for actions, hybrid for skills) |
| `hybrid-skill` | B | `RankSkillsByHybridRelevance` with semantic scores |
| `decision` | A and B | Likelihood per item |
| `decision+request` | A | State includes the user request |
| `choice` | single-result | Choice over candidates |

Metrics (reuse `metrics.ts`: `FitPlatt` `:431`, `OutOfFoldPlatt` `:472`, `BrierScore`, `CalibrationBins`, `BootstrapInterval`, `OperatingPoints`):

| Metric | Definition |
|---|---|
| Recall@5 (any / all) | Share of labelled requests with any / every correct item in the top 5 |
| MRR, nDCG@5 | Rank quality |
| Retrieval ceiling | Recall of the pre-decision candidate pool; the decision cannot exceed it |
| Calibration | ECE, Brier per kind, out-of-fold Platt, 5 folds (`DECISION_EVAL_CALIBRATION_FOLDS`) |
| Injection operating points | For each threshold: coverage (share of requests with ≥1 injected item), precision (share of injected items that are correct), false-injection rate on `none` |
| None detection | ROC-AUC and operating points of `bestFit` against `label: 'none'` |
| On-time | Share answered inside 1,500 ms, scored as production would (late = nothing) |

### 7.3 Shadow mode in production

Both modes ship with `'shadow'`: the decision runs, its step is recorded, nothing changes for the model. A new rig `rigs/catalog-fit-shadow-report.ts` joins `Catalog fit` Decision steps to the same run's Actions, Skill and Sub-Agent steps and reports:

| Online metric | Meaning |
|---|---|
| Suggestion hit rate | Share of runs where the agent used ≥1 item that would have been suggested |
| Suggestion precision | Share of would-be-suggested items the agent used |
| Miss rate | Items the agent used successfully that were not in the top 5 |
| Search-call rate | Share of runs calling a finder action (baseline for "rarely needs to search") |
| Mode A agreement | Whether the item the agent picked from a search result was the decision's top 1 vs the search's top 1 |
| Cost and latency | Decision tokens, cost, p50/p95 latency, timeout rate |

Shadow precision understates true precision (the agent may succeed with a different tool). It is a floor, read alongside the offline eval.

### 7.4 Thresholds

- **Mode B inclusion**: the lowest calibrated threshold with offline precision ≥ 0.90 and false-injection rate on `none` ≤ 5%, confirmed by shadow precision. Like discovery, prefer precision: a wrong suggestion costs a turn, a missed one costs nothing new.
- **Mode A `noneFits`**: the `bestFit` threshold with ≥ 0.90 precision on `none`.
- **Phase 3 trim**: recall of the trimmed set ≥ 0.98 on shadow-used actions.
- Every threshold is recorded with its corpus size, date and model in the calibration metadata's description, as discovery's constant comment does.

### 7.5 On-mode A/B

Per agent, randomized per conversation (or a per-run override for a controlled study): turns per run, total input tokens, cached share, cost per run (MJ's cache-aware costing), wall time, finder-call rate, and task outcome where rated. Phase 3 additionally measures cross-run cache hit rate with and without trimming. Use `rigs/measure-prompt-sizes.cjs` to report tool-declaration tokens per agent before Phase 3, so the saving is known before the risk is taken.

---

## 8. Settings and defaults

All Loop agent-type prompt params, documented in `loop-agent-prompt-params.ts` and the Loop type's `PromptParamsSchema` (`metadata/agent-types/.agent-types.json`), all under `decisionsEnabled`. Merge order is unchanged: schema < agent `AgentTypePromptParams` < run `data.__agentTypePromptParams` (`loop-agent-decisions.md:29-33`).

| Param | Type | Default | Meaning |
|---|---|---|---|
| `catalogSearchRanking` | `'off' \| 'shadow' \| 'on'` | `'off'` | Mode A inside this agent's runs |
| `catalogSuggestions` | `'off' \| 'shadow' \| 'on'` | `'off'` | Mode B |
| `catalogSuggestionMinItems` | number | `20` | Unpinned actions + visible skills above which Mode B runs |
| `catalogSuggestionMax` | number | `5` | Most suggestions shown |
| `catalogSuggestionMinConfidence` | number \| null | `null` | Calibrated threshold; `null` means "use the calibration entry's recommended threshold", and with none, `'on'` behaves as `'shadow'` |
| `catalogSuggestionIncludeSubAgents` | boolean | `false` | Ask about sub-agents too |
| `catalogSuggestionMaxRefreshes` | number | `2` | Mid-run refreshes per run |
| `catalogFitMaxCandidates` | number | `60` | Above this, pre-filter by retrieval |
| `catalogToolTrim` | boolean | `false` | Phase 3: trim declared native tools |
| `catalogToolLimit` | number | `15` | Phase 3: unpinned tools declared |
| `decisionPromptName` | string | `Default Decision` | Existing; shared |

The recommended threshold travels with the calibration entry (one more optional field, `RecommendedThreshold`, on `DecisionCalibrationEntry`), so refitting a model updates both together and no code constant is needed. If the in-flight calibration PR's entry shape cannot take it, keep a per-use constant like `DECISION_DISCOVERY_MIN_CONFIDENCE` instead (open question 3).

`loop-agent-decisions.md`'s table (`:15-22`) gains two rows.

---

## 9. Telemetry and cost

- Each call is one `Decision` run step, `Catalog fit` (Mode B) or a `Catalog fit (search)` sub-record on the finder's action step (Mode A), with input: mode, trigger, kinds asked, counts, prompt name; output: per-item raw and calibrated fit, kept/suggested names, `bestFit`, `noneFits`, model and resolved model, calibrated or not, latency, `failedOpen` and reason. Same shape as `finishCatalogNarrowingStep` (`base-agent.ts:13057-13087`).
- The decision prompt run is attached to the step (`attachDecisionPromptRun`), so it counts toward the run's tokens and cost, as every decision does (`:13066`). Whether `MaxCostPerRun` enforcement reads that same total is **(unverified)**; check before Phase 2.
- Mode A outside an agent run records the decision prompt run only (no run step exists).
- Warnings use `LogErrorEx` categories `CatalogFit` / `CatalogFitSearch`; uncalibrated models warn once per process.
- The step stores names and probabilities, not descriptions, keeping steps small.

---

## 10. Failure modes

| Failure | Behaviour |
|---|---|
| Decision prompt missing, no credentials, provider error | Mode A: search order, `rankedBy: 'search'`, `fallbackReason`. Mode B: nothing injected. Step `failedOpen`. |
| Timeout or run cancelled | Same; late prompt run linked to the step |
| Partial answers (a batch failed, an answer not a finite probability) | Mode A: fail open for the whole result (never mix ranked and unranked). Mode B: inject nothing. Mirrors `askedProbabilities` (`catalog-narrowing.ts:274-285`). |
| Uncalibrated answering model | Mode A: reorder by raw, `fit: null`, `noneFits: null`. Mode B: nothing, warn once. |
| Calibration with `A ≤ 0` | Treated as missing, logged |
| Fewer than 3 candidates after filters (Mode A) | No decision; search order |
| Catalog changed between suggestion and use (skill deactivated, action status) | Validation still governs calls; a stale suggestion fails like any other bad call |
| Suggestion names a hidden (narrowed) item | Un-hidden (§6.5) |
| Model treats suggestions as mandatory | Wording says "use them if they fit"; measured by shadow vs on (§7.5) |
| Prompt injection via descriptions | Descriptions are metadata authored by admins; the decision model only returns numbers, so a malicious description cannot make it emit text into the prompt. Names in the block are rendered from our records, not from the decision. |

---

## 11. Security

- **Only permitted items are candidates.** Mode B uses the run's effective actions and the permission- and policy-filtered skill set (`base-agent.ts:12707-12708`). Mode A ranks after each action's existing filters; Find Candidate Skills defaults `AgentID` to the trusted `Context.AgentID`; `Scope: 'agent'` restricts actions to `Context.CallableActionIDs`.
- **Context stamps are trusted, params are not.** Enabling and scoping read `Context.*` set by `stampActionContext` (`base-agent.ts:13838-13857`), never values the model authored.
- **Data leaving the instance.** The user's message and catalog descriptions go to the decision model's vendor, which may differ from the chat model's vendor (Jev via OpenRouter). Discovery and narrowing already do this. Agents that require zero data retention should be able to refuse it: honour `Privacy.ZeroDataRetention` on the decision model when the agent requires it **(the agent-level requirement exists for realtime channel exposure; reusing it here is open question 5)**.
- Whether actions carry their own user-level authorization that the effective set does not reflect is **(unverified)**; if so, Mode B must filter by it too.

---

## 12. Rollout phases

| Phase | Ships | Default | Exit criterion |
|---|---|---|---|
| 0 | Doc fixes (§2.10); `Scope` and hybrid search on Find Candidate Actions; `Context.AgentID` default and logged catch in Find Candidate Skills; shared bounded-decision helper; extracted batch-size reader | — | Unit + IT green |
| 1 | `catalog-fit.ts`; Mode A and Mode B in `shadow` only; corpus and shadow-report rigs; eval suite | off | Offline eval run on ≥ 2 models; calibrations fitted and stored in metadata |
| 2 | Mode A `'on'`; Mode B `'on'`; narrowing merged into the shared call | off; enabled per agent (Sage, Chief of Staff first) | Shadow precision ≥ threshold; on-mode A/B shows fewer finder calls and no rise in turns or failed runs |
| 3 | `catalogToolTrim` | off | Trimmed-set recall ≥ 0.98; net cost down including cross-run cache effects |
| 4 | Decide on deprecating `maxActionsInPrompt` for actions; consider moving discovery to per-agent Likelihood (#4938) on this machinery | — | Data from phases 2–3 |

---

## 13. Implementation outline

### 13.1 New files

| File | Contents |
|---|---|
| `packages/AI/CorePlus/src/catalog-fit.ts` | `CatalogFitCandidate`, `CatalogFitKind`; `BuildCatalogFitQuestions`, `CatalogFitState`; `JudgeCatalogFit` (raw → calibrated, sort, cut, `bestFit`, `noneFits`, partial-answer failure); `SuggestedCapabilitiesSection` renderer; calibration keys; constants (`CATALOG_FIT_DESCRIPTION_MAX_CHARS`, `CATALOG_FIT_MIN_CANDIDATES = 3`, `CATALOG_FIT_TIMEOUT_MS = 1500`). Pure, no engine. Export from `index.ts`. |
| `packages/AI/Prompts/src/decision/decision-batching.ts` | `GetMaxQuestionsPerCall(prompt)` lifted from `DecisionRerankRunner` (`DecisionReranker.ts:84-115`); `ExecuteBatchedDecision(runner, params, batchSize, signal)` returning merged answers or a failure. |
| `packages/AI/Agents/src/catalog-suggestions.ts` | Agent-side pure glue: `ShouldSuggestCatalog(params, counts)`, `CatalogSuggestionCandidates(actions, skills, subAgents, pinning)`, trigger types, refresh bookkeeping. |
| `packages/Actions/CoreActions/src/custom/ai/catalog-fit-rerank.helper.ts` | `RerankWithCatalogFit(params, kind, rows, taskDescription)`: reads `Context.CatalogFit` or `RankWithDecision`, calls the batched runner, applies `JudgeCatalogFit`, returns rows + envelope fields. |
| `packages/TestingFramework/integration-test-suite/rigs/generate-catalog-fit-corpus.ts` (+ `src/catalog-fit-corpus/{generator,prompts}.ts`) | Corpus generator (§7.1) |
| `packages/TestingFramework/integration-test-suite/rigs/catalog-fit-shadow-report.ts` | Shadow report (§7.3) |
| `packages/TestingFramework/Engine/src/decision-eval/catalog-fit-{types,corpus,metrics,scorecard,suite}.ts` | Eval suite, mirroring the `discovery-*` files |

### 13.2 Changed files

| File | Change |
|---|---|
| `packages/Actions/CoreActions/src/custom/ai/base-find-actions.action.ts` | Hybrid mode with semantic floor; `Scope`; call the rerank helper after filters; additive output fields |
| `.../base-find-skills.action.ts` | Default `AgentID` from `Context.AgentID`; log in the catch at `:136-138`; rerank helper |
| `.../base-find-agents.action.ts` | Rerank helper after `FilterRunnableAgents` |
| `packages/AI/Reranker/src/DecisionReranker.ts` | Use the extracted batch-size reader |
| `packages/AI/Agents/src/base-agent.ts` | `stampActionContext` (`:13838`): add `CatalogFit`, `CallableActionIDs`. Phase 2 `Promise.all` (`:3121-3145`): add `InjectCatalogSuggestions`. `buildVolatileStateMessage` (`:7251`): pass suggestions and the include-once rule for append-only mode. `ensureCatalogNarrowing` (`:12832`): consume the shared answers. Mid-run triggers at the finder-result path, `validateActionsNextStep` (`:8047`), the native refusal (`:4386`) and skill activation. Phase 3: `applyNativeTools` (`:6186`) trim and widening. Generalize `boundDecisionDiscovery` (`:5431`) into a shared helper. |
| `packages/AI/Agents/src/runtime-state-fragment.ts`, `constants.ts` | `Suggestions` input, `## Suggested Capabilities` heading constant |
| `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts` | New params (§8); fix `:612-615` |
| `packages/AI/Agents/src/catalog-narrowing.ts` | Note text points to `Scope: "agent"`; accept externally supplied answers |
| `packages/AI/CorePlus/src/decision-calibration.ts` | Optional `RecommendedThreshold` on the entry (if the calibration PR's shape allows) |
| `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` | One static clause in the `## Runtime State` pointer (`:1158-1163`) |
| `metadata/agent-types/.agent-types.json` | Schema entries and defaults for the new params; update the `decisionsEnabled` description (`:129`) |
| `metadata/actions/.agent-manager-actions.json`, `.skill-discovery-actions.json`, `.find-best-agent-action.json` | New params `RankWithDecision`, `Scope`; new outputs `RankedBy`, `NoneFits`, `BestFit`. JSON only, no `Metadata_Sync` migration (release work). |
| `packages/AI/Agents/docs/loop-agent-decisions.md`, `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` | New rows; fix §2.10 mismatches |

No schema change and no migration: everything is prompt params, action params, metadata JSON and run-step JSON.

### 13.3 Tests

**Unit (vitest)**

| File | Covers |
|---|---|
| `packages/AI/CorePlus/src/__tests__/catalog-fit.test.ts` | Question building and caps; blank descriptions skipped; ranking equals raw order when calibrated; `A ≤ 0` rejected; `noneFits` from `bestFit`; partial answers fail; section rendering |
| `packages/AI/Prompts/src/__tests__/decision-batching.test.ts` | Smallest declared limit wins; default 64; parallel batches merged in order; one failed batch fails the whole call |
| `packages/AI/Agents/src/__tests__/catalog-suggestions.test.ts` | Threshold gating, pinned exclusion, activated-skill exclusion, refresh cap, trigger handling |
| `packages/AI/Agents/src/__tests__/base-agent-catalog-suggestions.test.ts` | Runs in parallel with Phase 2; timeout fails open; suggestions land in the fragment and never in the system prompt or history; include-once in append-only mode; shared answers reach narrowing; un-hiding |
| `packages/AI/Agents/src/__tests__/loop-agent-system-prompt-snapshot.test.ts` | Updated once for the pointer clause; still byte-identical across iterations |
| `packages/Actions/CoreActions/src/__tests__/find-candidate-*.action.test.ts` | Decision order replaces search order; fallback paths; `Scope: 'agent'`; `Context.AgentID` default; output fields additive |
| `packages/TestingFramework/Engine/src/__tests__/catalog-fit-*.test.ts` | Corpus schema, metrics, scorecard, as the discovery tests do |

**Integration (deterministic tier)**: new bundle `IT1xx - Catalog Fit Decisions` (next free number; the highest today is IT169) with metadata in `metadata-optional/integration-test/tests/integration/`, using `ScriptedDecision` (`integration-test-suite/src/checks/decision-test-double.ts`), whose `LikelihoodFor(instructions)` lets each check script per-candidate probabilities by name, and `TestLLM` for the chat side, as `agent-decisions-switch.checks.ts` does.

The stand-in reports `ResolvedModel = 'it-scripted-decision'` (`decision-test-double.ts:121`), which has no calibration, so Setup must register an identity calibration (`A = 1, B = 0`, a known `RecommendedThreshold`) for that resolved model through a test `DecisionCalibrationSource` or a metadata row it removes in Teardown.

| Check | Asserts |
|---|---|
| CF1 | Switch off: no `Catalog fit` step, no decision prompt run, fragment has no section |
| CF2 | Catalog at or below `catalogSuggestionMinItems`: nothing asked |
| CF3 | `'on'`: scripted high fit for one action and one skill; both appear in the fragment with fits; step records probabilities; prompt run linked and counted in run cost |
| CF4 | `'shadow'`: step recorded, fragment unchanged |
| CF5 | Scripted failure and scripted delay past budget: nothing injected, `failedOpen`, run completes |
| CF6 | Calibration removed: `'on'` injects nothing and records the uncalibrated model |
| CF7 | A skill the user lacks Run permission for is never among the questions (`ScriptedDecision.Calls`) |
| CF8 | Pinned (`MinExecutionsPerRun`) action is never asked and always declared |
| CF9 | System prompt and tool list byte-identical with suggestions on vs off |
| CF10 | Find Candidate Actions with `RankWithDecision`: scripted fits invert search order; `rankedBy: 'decision'`; on scripted failure, search order and `rankedBy: 'search'` |
| CF11 | All fits low: `noneFits: true` and the widening message |
| CF12 | `Scope: 'agent'` returns only callable actions, including a runtime-added one |
| CF13 | Mid-run refresh after a `NO_ACTIONS_FOUND` result; cap respected |
| CF14 | (Phase 3) Trim on: declared tools = pinned + finders + suggestions + limit; undeclared action found through agent-scoped search is declared next turn; set frozen otherwise |

Register the bundle's count in `integration-test-suite/src/__tests__/check-registry.test.ts`, as IT97 is (`:205`).

---

## 14. Open questions

1. **State for follow-ups.** "Do the same for March" is ambiguous alone. Add the previous user message and a truncated last assistant reply to Mode B's state, or keep it narrow? Decide with an eval arm; default narrow.
2. **Sub-agents in Mode B.** Discovery covers agents on opening turns only. Is a per-sub-agent Likelihood on every turn useful, or noise next to `delegate_to_*` descriptions?
3. **Where the recommended threshold lives.** A field on the calibration entry (preferred) or a code constant per use, as discovery does. Depends on the in-flight calibration PR.
4. **Should Mode B run in sub-agent runs?** Sub-agents get a focused brief from their parent and usually small catalogs; the threshold gate may already exclude them. Default: same rules at every depth.
5. **Zero data retention.** Reuse the realtime agent-level ZDR requirement for decision calls, or add a decision-specific one?
6. **Discovery convergence.** Once per-item Likelihood plus a `bestFit` calibration is measured here, should discovery switch to it and close #4938? Requires re-measuring discovery.
7. **Hybrid action search scores.** Moving actions to hybrid changes `similarityScore` semantics for callers who pass `MinimumSimilarityScore`; the agent search's floor-on-semantic rule keeps it compatible, but external callers should be checked.
8. **Skills in native-only mode.** The skills catalog is not rendered there (`template :942`). Is that intended? If not, Mode B suggestions are currently the only way such an agent would learn of a skill, and it still has no activation path in that mode **(unverified)**.

---

## Appendix A: unverified claims

| Claim | How to verify |
|---|---|
| Jev accepts up to 1,000 questions per call | Provider docs; no `MaxQuestionsPerCall` is declared (`.jev-models.json`) |
| How a per-question driver bills state (once vs per question) | Inspect `OpenRouterDecision` / System One wire format and prompt-run token counts |
| Search latency of `SearchEntity` (100–400 ms) | Time the finder actions on a dev database |
| Cross-run cache reuse of tools + system prompt, and how narrowing affects it | Prompt-run `CacheReadTokens` on the first iteration of consecutive runs in one conversation |
| `MaxCostPerRun` enforcement includes decision prompt runs attached to steps | Read the cost accumulator in `base-agent.ts` |
| Actions have user-level authorization not reflected in the agent's effective set | Read `ActionEngineServer` run-time authorization checks |
| Native-only agents have no skill-activation path | Read `framework-tools.ts` and the native-only template branch |
| `DeclareActionsAsNativeTools` default value | Generated entity default / migration |
