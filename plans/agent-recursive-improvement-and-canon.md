# Agent Recursive Improvement & Canon

## Plan — learning from *Harness²* to make MJ agents improve themselves with evidence

**Version**: 0.1 — plan only, no code
**Date**: October 2026
**Status**: Proposed — implementation targeted for **November 2026**
**Owner**: Arie Glazier (@arie-glazier-bcc)
**Source paper**: Xu et al., *Harness²: Recursive Agent Harnessing for an Open World*, Google Cloud AI Research / Northwestern, arXiv **[2610.14224](https://arxiv.org/abs/2610.14224)** (9 Oct 2026) · code: [github.com/google-research/harness2](https://github.com/google-research/harness2) · site: [harness2.github.io](https://harness2.github.io)
**Code references** are against `next` @ `223669eb0` (2026-10-17). Line numbers drift; file paths are the anchor.

---

## Executive summary

MJ already has almost every component of an agent "harness" the paper studies: system prompt, guardrails, memory, tool guidance, sub-agents, skills, scripts. It also has a rich set of registries whose approved entries are reused by every later run. In this plan we call those registries **canon**: Actions, Queries, Components, Skills, approved Agent Notes, entity metadata, Rubrics, ML models, and others (§3).

MJ is missing the paper's actual contribution: **a loop that turns run evidence into tested changes, and that remembers why each change worked.** Today:

- **Memory is factual and preference-only.** It is trusted because an LLM said "confidence ≥ 80", not because anything showed it helps. MJ cannot tell whether an injected note changed a run, let alone improved it (§4).
- **Canon promotion is either automatic or a silent dropdown edit.**
  - There is no shared review queue.
  - Evidence is not stored with the item: ActionSmith discards its test cases, and query sample results are never kept.
  - **Nothing is re-checked after approval.** No re-check happens when the schema, the model, or a dependency changes.
- **Nothing proposes harness edits from telemetry.** `MJ: AI Agent Learning Cycles` exists in the schema and nothing writes to it.

This plan:
1. Defines **canon** and a thin **canon contract**: lifecycle, provenance, evidence, a "when to use" cue, telemetry, and re-verification.
2. Defines an **evidence ladder** for answering "did this memory/canon item help?"
3. Adds a **promotion pipeline**: artifact → probe → candidate → canon. Promotion is automatic within a narrow scope on evidence; a human promotes to org-wide canon.
4. Proposes a **Harness Refiner**: the paper's Propose–Probe–Compose step, run offline over MJ's eval and test infrastructure, writing into the empty Learning Cycles entity.
5. Proposes **agent middleware hooks** as metadata, the one harness component MJ lacks.
6. Lists **Phase 0 bugs** found during the research. Several of them silently break today's memory loop.

Predictive Studio's promotion lifecycle is MJ's best existing pattern (§7), and `MJ: Experiments` was designed with an `AgentConfigSearch` kind in mind, so a lot of this is reuse rather than new invention.

---

## 1. The paper in brief

**Agent = frozen model + harness.** The paper's harness has eight editable components, each a file:
- system prompt
- guardrails
- memory
- tool guidance
- sub-agents
- skills (on-demand)
- scripts (deterministic helpers)
- plugins (hooks inside the tool loop that *enforce* rather than instruct)

**Task-level recursion (Propose → Probe → Compose), with no ground truth:**
1. Run the task once under the current harness. This is the *reference*.
2. Two **scoped** editors each propose a candidate harness edit:
   - *invariant*: how the agent **works** (tool use, sequencing, verification);
   - *domain*: what a **practitioner** knows (deliverable shape, controlling sources, checks).
3. **Probe**: run each candidate on the same task, with the same model and environment. Compare trajectories to get a *behavioral contrast*.
4. **Compose**: merge the supported edits, adopt one candidate, or `KEEP_BASE`. Every decision must name the moment in a trajectory that justifies it.
5. Scale it either way:
   - *parallel*: k candidates and k independent composers, then a blind selector;
   - *sequential*: k chained steps.

**Harnessing-level recursion (the improvement library).** After each task, a reflector diffs every candidate against the base and labels each edit `helped | hurt | no observed effect | confounded`. It writes **at most one** transferable lesson (`cue / lesson / evidence / confidence`), or `NO_ENTRY`. The adopted harness and its `EXPERIENCE.md` go into a library. Later tasks start from the **base** harness and read the library as examples to adapt. They **re-verify** any fact copied from it rather than inheriting it.

**Results that matter for us:**
- One improvement step added +11.5 on WorkBuddy-Bench, +4.5 on JobBench, and +11.8 pp on Harvey LAB.
- Parallel recursion at k=5 added another 2.6–6.7.
- The method sits on the compute-vs-performance Pareto frontier.
- A weaker model with an improved harness beat a stronger model with a stock harness.
- Using the same model as both executor and editor still improved every benchmark.
- Starting from OpenCode, it beat unmodified Claude Code and Codex on every WorkBuddy domain.
- Harnesses refined for one model transfer to other models, with variance.

**Ablations and lessons:**
- **Probing is essential.** Editing without rerunning made scores *worse* (73.4 → 63.2 on code).
- **Scoped editors** were worth 2.9–3.7 points, the **library** 1.8–3.1, and **composition** 1.6–1.9.
- **Skills** mattered most (−5.3 when removed), then **scripts** (−3.7), then prompt text (−1.5).
- Memory was the least-edited component.
- **ReasoningBank**, which only retrieves distilled prose strategies (MJ's notes are the analogue), was inconsistent and sometimes hurt (−6.6 on code).
- The editor prompt's order of preference: **skill > script > subagent > plugin > always-on text last**. "Always-on prose is the expensive option."
- Failure modes:
  - a blind selector picking a weaker candidate (55 over 95);
  - a prior hardening into a rule that caps every candidate;
  - a checker written by the editor that cannot catch the editor's own assumption.

**Directly relevant to MJ.** The paper's executors were OpenCode and Codex. `packages/AI/AgentHarness` already runs OpenCode, Codex, Claude Code, Gemini CLI and Pi as the reasoning layer for an MJ agent. The paper's findings therefore apply directly to MJ's harness agents.

---

## 2. Where MJ stands

### 2.1 Harness component mapping

| Paper component | MJ today | Gap |
|---|---|---|
| System prompt | Loop agent-type system prompt (`metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`, sections toggled by `AgentTypePromptParams`) wrapping the agent's own prompt | No telemetry on always-on prompt size |
| Guardrails | **Stronger than the paper's**: cost/token/iteration/time limits and tree budgets, `FinalPayloadValidation`, rubric SelfCheck, finishIf gate, action circuit breaker | — |
| Memory | Agent Notes / Examples injected as a system message (`agent-context-injector.ts`, `agent-memory-context-builder.ts`) | Facts and preferences only; no effect measurement (§4) |
| Tool guidance | Action descriptions, params and result codes formatted into the prompt; catalog narrowing | No learned tool guidance |
| Sub-agents | Child agents plus `MJ: AI Agent Relationships`; parallel fan-out; durable task graphs | — |
| Skills | `MJ: AI Skills`: progressive disclosure, SKILL.md import/export, double-gated auto-activation | No tests and no effectiveness tracking |
| Scripts | Actions, including ActionSmith **runtime** actions (sandboxed JS via `packages/Actions/CodeExecution`) | Weak test gate; no re-verification (§3) |
| **Plugins / middleware** | **Missing.** `BaseAgent` passes `Filters: []` to ActionEngine (`packages/AI/Agents/src/base-agent.ts` ≈ L11817/L11893). Harness adapters declare `PermissionHooks:false`. | §6 Phase 4 |

### 2.2 Learning loop today

- **Memory Manager** (`packages/AI/Agents/src/memory-manager-agent.ts`) runs every 15 minutes. It extracts notes and examples from rated conversations and failed runs, dedups them (exact match, vector match, then an LLM), and **saves them as `Active`, auto-approved** (≈ L1833). It also maintains them: importance scoring, consolidation, contradiction resolution, decay.
- **In-flight writes** (`MemoryWriteManager.ts`) land as `Provisional` and are injectable immediately. Hardening is only a duplicate check before promotion to `Active`.
- **Failed runs** become at most one Issue/Context note, built from the run's status and error message only. No trajectory is analysed.
- **Rubric SelfCheck** (`self-check.ts`) retries within a run, but nothing persists across runs.
- Nothing writes Scoped Prompt Parts, Skills, action guidance, or `MJ: AI Agent Learning Cycles` from run evidence.
- **The paper's equivalent, done by hand.** Skip-Brain's audit rounds (`plans/audits/` in Skip-Brain) sort failures into "data context" (fixed by editing notes) and "Skip bug" (fixed in code or prompts). That is the paper's domain/invariant split, done manually.

---

## 3. Canon

### 3.1 Definition

> **Canon** is any record that, once approved, is **reused by later runs** as a capability, a reference, or an instruction.

Canon is MJ's real **procedural memory**. Prose memory should be the last resort, which matches the paper's results: skills and scripts beat retrieved strategies.

### 3.2 Inventory

| Know-how | Canon entity | Created at runtime by | Promotion today | Reuse lookup |
|---|---|---|---|---|
| **Do / compute** | `MJ: Actions` (Runtime, Generated, MCP-backed) | ActionSmith (+ Codesmith); MCP sync | `CodeApprovalStatus` Pending → Approved (human; Action form) | `Find Candidate Actions` (embeddings) |
| | `MJ: Remote Operations` (AI-authored code) | Dev-time metadata | Human code approval | n/a |
| | `MJ: ML Models` / Training Pipelines | Predictive Studio agents | Draft → Validated → Published, holdout + trust verdict; publishing auto-generates a "Score with …" Action | Through the Actions catalog |
| **Get data** | `MJ: Queries` (+ Parameters / Fields / Entities / Dependencies) | Query Builder → Query Strategist; QueryGen; Skip Query Writer | `Status` Pending / Approved / Rejected / Expired. **Approved is required for composition and catalog search** | `Search Query Catalog` (mandatory first step for the Strategist) |
| **Present** | `MJ: Components` | Form Builder (Interactive Forms); curated metadata; Skip (separate store) | Draft / Published / Deprecated; form path is lint-gated, then the user activates it | Few-shot examples only; no whole-component reuse |
| | `MJ: Entity Form Overrides` / Contributions | Form Builder | Pending / Active; agents write User scope only, humans promote Role/Global | Get Active Form For Entity |
| **Orchestrate** | `MJ: AI Agents` (+ steps, paths, prompts) | Agent Manager (Architect → Builder) | Pending / Active / Disabled; structural checks only | Find Candidate Agents |
| | Saved Workflows (Flow agent + Scheduled Job) | Workflow Planner → `Workflow.Save` | WorkflowSpec Draft / Active / Paused | As agents |
| **Instruct** | `MJ: AI Skills` | SkillSmith; SKILL.md import | Active / Pending / Deprecated. **DB default Active**; Pending is only a prompt convention | Skill catalog |
| | `MJ: Scoped Prompt Parts` / Configs | Humans only | Active / Provisional / Archived; Provisional resolves exactly like Active | Resolver |
| | **Approved Agent Notes / Examples** | Memory Manager; in-flight writes; humans | Provisional → Active (dedup only); protection tiers | Semantic / scoped injection |
| **Describe** | **Entity metadata**: `MJ: Entities`, `MJ: Entity Fields` (descriptions, display names, categories, relationships, value lists), Entity Settings, `MJ: Generated Codes` (CHECK-constraint validators) | CodeGen (AI-assisted), DBAutoDoc, Database Designer, humans | Implicit: `AutoUpdateDescription` / `AutoUpdateDisplayName` / `AutoUpdateCategory` / `AutoUpdateRelatedEntityInfo` = false acts as "human-locked". Generated Codes are inserted as Approved | Every agent prompt that sees schema (Skip sees *only* schema metadata) |
| **Judge** | `MJ: Rubrics` / Rubric Versions | Rubric Architect (draft only) | Draft → Published (human only) | `MJ: AI Agent Rubrics` |
| | Computer-use replay scripts (on `MJ: Tests`) | Recorded from judge-approved passing runs | **First script auto-promoted; a replacement waits in a pending slot for a human** | The owning test |
| **Vocabulary** | `MJ: Tags` / Tag Suggestions / Synonyms | Autotag pipeline | Pending → Approved through a governance inbox | Tag embeddings |

**Convergence point.** MCP tools, published ML models and runtime actions all end up as `MJ: Actions`. The Actions catalog is already the de facto shared library of executable capabilities. Keep it that way: every *executable* canon item should be callable as an Action.

### 3.3 What canon is missing, across the board

1. **Provenance.**
   - Who approved is not recorded:
     - `CodeApprovedByUserID` is never set. The Action form sets only `CodeApprovedAt` (`action-form.component.ts` ≈ L936), and its comment says the server sets the user, which it does not.
     - Queries have no approver fields at all.
   - The Save Query dialog writes `Status='Approved'` directly (`save-query-dialog.component.ts` ≈ L671), so whoever saves is the approver.
2. **Stored evidence.**
   - ActionSmith's test cases are thrown away. A single empty-input smoke test is enough to persist an action.
   - No `MJ: Tests` rows are created for any canon item.
   - Query sample results are never stored.
3. **Re-verification.**
   - No canon item is re-tested after approval. That holds for a schema change, a model change, and a change to a bundled action or sub-agent alike.
   - Queries have an `Expired` status that nothing ever sets.
   - Editing a **Runtime** action's code does not reset its approval. Only `Generated` actions reset (`MJActionEntityServer.server.ts` ≈ L71).
4. **Telemetry.**
   - Queries have no run log. `IQueryConfiguration.LogExecution` points at an `MJ: Query Execution Logs` entity that does not exist.
   - Skip's component `ExecutionCount` is always 0, and only downloads are logged.
   - Action success rates are computed only in the browser, and action logs do not link to agent runs.
5. **Cue ("when to use me").** Only Queries have it, in `Configuration` (`UsageGuidance`, `WhenNotToUse`, `AlternativeQuestions`). This is the paper's `cue` field and should be standard everywhere.
6. **Reuse-first discipline is uneven.**
   - Queries: good, but catalog vectors sync daily, so new canon is invisible for up to a day.
   - ActionSmith: its search does not filter on approval.
   - Skip components: effectively none.
7. **No review queue.**
   - Skip writes learned queries as Pending but searches only Approved (`Skip-Brain/packages/core/src/utils/vectors.ts` ≈ L220). Nothing Skip learns ever re-enters its own pool without a human.
   - Approval UI exists only on individual forms.

### 3.4 The canon contract

Don't build a canon mega-table. Keep the existing entities and add a **thin shared contract**, implemented per entity where it makes sense:

| Property | Contract |
|---|---|
| **Lifecycle** | Common vocabulary mapped onto each entity's own field: `Candidate → Probation → Canon → Deprecated / Expired` |
| **Provenance** | Created by (agent run / user), approved by, approved at, and the source artifact/run |
| **Evidence** | Linked `MJ: Tests` and their runs, rubric evaluations, and probe results (§4). Evidence is stored, not discarded |
| **Cue** | `UsageGuidance` / `WhenNotToUse` / `AlternativeQuestions`, generalised from Queries; this is the retrieval key |
| **Telemetry** | Uses, successes, failures, last used; linked to the agent run that used the item |
| **Re-verification** | A schedule plus triggers (schema change, model change, dependency change) that rerun stored evidence. On failure the item moves to `Expired` or `Probation` |

### 3.5 Tiered autonomy

Generalise the Form Builder and computer-use replay rules:

> **Promote automatically within a narrow scope** (one user, one agent) when the evidence supports it. **Only a human promotes to org-wide canon**, through **one shared review inbox**.

`MJ: AI Agent Requests` already exists as a general human-in-the-loop channel (Requested / Approved / Rejected / …) and is the obvious substrate for the inbox.

---

## 4. How do we know a memory (or canon item) helped?

**Today we cannot know.** What exists today:

- **Exposure is only partly recorded.** Each prompt step writes `memoryAttribution` (injected note and example IDs) into `AIAgentRunStep.OutputData` (`base-agent.ts` ≈ L14518), as JSON only. RAG chunks and scoped prompt parts are not recorded. The full prompt text is in `AIPromptRun.Messages`, but notes are rendered without IDs.
- **No usage signal.** Nothing says whether the model acted on a note. It could not cite one even if asked.
- **No experiment lever.** There is no per-run way to turn injection off. `ExecuteAgentParams.override` and `AgentEvalDriver` override only model, vendor and configuration.
- **The importance score has no outcome signal.** Of its seven signals, `relevance` and `goalAlignment` are always unavailable, and `llmImportance` is a string match on the word "confidence".
- **Two bugs corrupt even the usage signals** (Phase 0).

### The evidence ladder

"Helped" is two questions: **(a) did it change behavior?** and **(b) was the change better?** (a) is cheap and catches the common case, notes that do nothing but cost tokens on every run.

| Rung | Question | Mechanism | Cost | Strength |
|---|---|---|---|---|
| 0. **Exposure** | Was it present? | Join rows per run × note/example/skill/prompt-part/RAG chunk: rank, score, **arm** (injected / withheld) | Low | Prerequisite for everything else |
| 1. **Usage** | Did the model act on it? | Render notes with short IDs (`[N3]`); add `memoryUsed: string[]` to the Loop response (and a native control tool) | Low | Self-reported and biased; separates "ignored" from "acted on" |
| 2. **Correlation** | Do runs with it do better? | Join exposure to existing outcomes: rubric ProductionSampling scores, regenerate (`ConversationDetail.ReplacedAt`), edit-and-resend (`OriginalMessageChanged`), validation retries, tool-error steps, run success, cost and turns, ratings | Low | Confounded; use it to screen, not to prove |
| 3. **Counterfactual replay** *(the paper's probe)* | Does removing it change the decision, and is the result better? | Take the stored prompt in `AIPromptRun.Messages`, remove the note block (or swap the candidate edit in), and **rerun that single decision** under the same model and config (PromptEvalDriver style). Same output → *no effect*. Different output → judge or deterministic oracle compares the two | Medium | Strong per instance; **no side effects**, because only one decision is replayed |
| 4. **Randomised holdout** | Does it help on average in production? | For eligible notes, withhold with small probability (≈10%) using the deterministic run-ID bucketing in `packages/Rubrics/Base/src/sampling.ts`; compare outcomes between arms. **Never withhold** `Constraint` notes or the `Immutable` / `Protected` tiers | Low per run; needs volume | Causal; aggregate by note type, agent or cluster when per-note volume is low |

**Policy that follows from the ladder:**
- `Provisional → Active` requires a rung-3 positive contrast, or (for low-risk types) rung-1 usage plus no rung-2 regression.
- `Active → Archived` when repeated rung-3 replays show *no effect*. This reclaims always-on context.
- Replace the dead importance signals with an **`EffectScore`** (with evidence count and last-evaluated date) and feed it into decay.
- The same ladder applies to canon. Executable canon has cheaper, deterministic signals: it ran, its stored tests pass, its output was used downstream.

**Prior art to reuse.**
- Skip-Brain's `ai-model-evals/` already replays production `AIPromptRun.Messages` with a pairwise Claude judge. That is rung 3 for model comparison, and it needs a "with vs without context" mode.
- `packages/TestingFramework/Engine/src/decision-eval/metrics.ts` has bootstrap confidence intervals and seeded RNG for rung 4.

---

## 5. Procedural memory: artifacts → probe → canon

Artifacts are the **staging area**, not the memory. They are conversation-scoped, there is no cross-conversation artifact retrieval, and code-type artifacts are only displayed, never executed. The pipeline:

```
agent run ──produces──► Artifact (versioned, conversation-scoped)
                           │
                           ▼  probe: lint · stored tests · replay contrast · judge
                        Candidate canon item (Probation, scoped to user/agent)
                           │
              evidence ok? ├── auto-promote within scope
                           └── human review inbox ──► org-wide Canon
                                                         │
                                       scheduled re-verification ◄┘
```

Two promotion paths exist today: Data artifact → Query, and form component artifact → Component. **Generalise them** with a promoter per artifact type. Artifact types already carry a viewer `DriverClass` and a `ToolLibraryClass`.

| Artifact type | Promotes to | Probe |
|---|---|---|
| JS / TS code | Runtime Action | Stored test cases (persisted as `MJ: Tests`) |
| SQL / Data | Query | Test run with sample params; results snapshot stored |
| Component / Report | MJ: Component | Component linter + `packages/React/test-harness` |
| Plan / task graph | Workflow (Flow agent) | `Workflow.Validate` + a dry run |
| Procedure markdown | Skill | Replay contrast with and without the skill (rung 3) |
| Lesson ("cue / lesson / evidence") | Learning Cycle record → Scoped Prompt Part, skill, or note | Rung 3 |

**Learning Cycles become the "improvement library".** `MJ: AI Agent Learning Cycles` (description: "what it learned and changes it requested for stored metadata") is the natural home for the paper's reflector output: per-edit verdict rows and at most one lesson, linked to the canon items it produced. The paper's Prompt 6 (Experience Reflector) gives a ready-made output contract.

---

## 6. Phased plan

### Phase 0 — fix the plumbing (bugs found during research; small, independent PRs)

Each of these was confirmed in code on `223669eb0`.

1. **The Memory Manager reads a rating store nothing writes.**
   - `metadata/queries/SQL/get-conversations-for-memory-manager.sql` reads `vwConversationDetailRatings`.
   - Explorer's rating widget (`conversation-message-rating.component.ts`) writes `ConversationDetail.UserRating` / `UserFeedback`.
   - No TypeScript in MJ writes `MJ: Conversation Detail Ratings`.
   - Likely effect: positive/negative selection for extraction is empty.
   - Decide on one store, then fix the query or add the writes.
2. **Injection doesn't count as access.** `AIAgentNote.AccessCount` / `LastAccessedAt` are not updated when a note is injected. Decay and the staleness filters therefore treat a note injected on every run as "never accessed".
3. **`CodeApprovedByUserID` is never set** on Action approval (`action-form.component.ts`). Do it server-side in `MJActionEntityServer`.
4. **Editing a Runtime action's code doesn't reset its approval.** `MJActionEntityServer.server.ts` resets it only for `Type='Generated'`.
5. **`Find Candidate Actions` does not filter on approval.** It can suggest unapproved runtime actions, which then fail with NOT_APPROVED (`base-find-actions.action.ts`).
6. **Running a non-approved query only logs a warning** (`GenericDatabaseProvider.ts` ≈ L4171). Decide whether that is intended; document it or gate it.
7. **A dangling reference.** `IQueryConfiguration.LogExecution` documents `MJ: Query Execution Logs`, which does not exist.
8. **High-value runs are loaded and counted but never mined** (`memory-manager-agent.ts`, `loadHighValueAgentRuns` ≈ L825, used ≈ L4079).
9. **`ReflectionInsights` on ConversationDetail** has no reader or writer. Use it in Phase 3 or drop it.
10. **The runtime action's `limits.maxMemoryMB` is ignored.** `RuntimeActionExecutor.ts` hardcodes 30 s / 128 MB.

### Phase 1 — exposure and effect measurement (rungs 0–3)

- Add a run × memory-item exposure entity, replacing JSON-only `memoryAttribution`. Cover notes, examples, skills, scoped prompt parts and RAG chunks.
- Short IDs in the rendered notes block; `memoryUsed` in the Loop response and the native control tool.
- A per-run injection override (`ExecuteAgentParams`) and an `AgentEvalDriver` option to run with or without memory.
- A single-decision replay probe over `AIPromptRun.Messages` (rung 3), plus an `EffectScore` on notes and examples.
- Change the Memory Manager so that extracted notes land as `Provisional` / `Pending` and are promoted on evidence (§4 policy).

### Phase 2 — canon contract tightening (per entity, in priority order)

1. **Actions:**
   - Persist ActionSmith test cases as `MJ: Tests`, and require at least one non-smoke case.
   - Provenance fields.
   - Server-side success/failure counters, with action logs linked to agent runs.
2. **Queries:**
   - Approver fields.
   - The Save Query dialog goes through the same gate as other creators.
   - Store test-run snapshots.
   - Create the query execution log, or remove the documented reference.
   - Index newly approved queries on save, not by the daily sync.
3. **Agent Notes** (the approved ones are canon): effect-gated promotion (Phase 1); human-authored `AuthorType=User` notes count as canon by default.
4. **Entity metadata:**
   - Treat `AutoUpdate*=false` fields as human-approved canon.
   - Record the provenance of AI-written descriptions (DBAutoDoc / CodeGen).
   - Put Generated Codes through Pending, with the CHECK-constraint source as evidence.
5. **Skills:**
   - Make Pending a real status (it is currently a prompt convention, and the DB default is Active).
   - Add approver fields and a replay-contrast test.
6. **Components** (Skip and MJ): a whole-component reuse lookup before generating, plus real execution telemetry.
7. **Shared review inbox** on `MJ: AI Agent Requests`, and a common lifecycle vocabulary mapping (§3.4).

### Phase 3 — Harness Refiner (Propose → Probe → Compose, offline, human-approved)

Inputs:
- low-rated / regenerated runs;
- failed and "instructive failed" runs;
- rubric ProductionSampling failures;
- high-value runs.

Steps:
1. **Propose:** two scoped editor prompts, *invariant* (how the agent works) and *domain* (practitioner knowledge for this tenant or entity area), ported from the paper's Prompts 1 and 2. They emit edits **as canon candidates**:
   - Scoped Prompt Parts (the domain → company scope maps naturally onto MJ's scope model);
   - Skills;
   - action guidance;
   - runtime actions;
   - config changes.
2. **Probe:** clone the agent (RecordCloning already deep-clones agents) or apply the edit as a scoped override. Rerun the source input via `AgentEvalDriver` in eval/sandbox mode; runs carry `TestRunID`, and AgentHarness agents already run in sandboxes. Compare trajectories.
3. **Compose:** a composer prompt (paper Prompts 3 and 4) chooses merge, adopt, or `KEEP_BASE`, each decision tied to evidence. Where needed, a blind selector (paper Prompt 5) runs as the `ResultSelectorPromptID` judge.
4. **Reflect:** write `MJ: AI Agent Learning Cycles` rows (per-edit verdicts plus at most one lesson). Proposed canon items go to the review inbox; scoped auto-promotion follows §3.5.
5. **Track:** run it on `MJ: Experiments`, which was designed with an `AgentConfigSearch` / `PromptOptimization` kind, so iterations, scores and cost are recorded the same way Predictive Studio's are.

**First target: Skip-Brain.** Its manual audit loop is already this process, and it has a component test runner, scoring and rubrics.

### Phase 4 — agent middleware hooks (the missing harness component)

- Metadata-registered hooks (ClassFactory) at `BeforeAction`, `AfterAction`, `AfterTurn` and `BeforeFinish`, plus wiring for ActionEngine's existing `BaseActionFilter` (currently passed `[]`).
- Hooks the paper found recurring:
  - trim oversized tool output;
  - add a targeted hint after a repeating error signature;
  - cap a runaway tool;
  - verify a write immediately after it happens;
  - warn after N calls with no artifact produced.

  In the paper, edits like these cut the tool-error rate from 14.4% to 9.1%.
- Hooks are canon too: versioned, approved, and with telemetry recorded.

### Phase 5 — later

- **Scheduled re-verification** of all canon, triggered by schema changes (CodeGen runs), model changes (new default models, failover targets) and dependency changes. Failures go to `Expired` / `Probation`, with an inbox item.
- **Online refinement** for AgentHarness agents inside sandboxes.
- **Adaptive budget:** spend probes where the evidence is thin or the task is high-value; stop when probes add nothing.
- **Cross-model validation** of harness edits against each agent's failover models.

---

## 7. Reuse what already exists

| Need | Existing MJ piece |
|---|---|
| Promotion lifecycle with a held-out test, trust verdict, and challenger kept out of auto-promotion | **Predictive Studio** (`packages/AI/PredictiveStudio`, `Core/src/trust.ts`, MaintenanceEngine drift checks) |
| Auto-promote the first proven item; human review for replacements | Computer-use replay scripts (`packages/AI/MJComputerUse/src/test-driver/script-store.ts`) |
| Experiment / iteration / score / cost record | `MJ: Experiments` (+ Sessions, Iterations) |
| Probing runs with config overrides | `AgentEvalDriver`, `PromptEvalDriver`, `mj test compare` |
| Ongoing quality signal | Rubrics + `EvaluateSampledAgentRunsDriver` (ProductionSampling), drift |
| Deterministic arm assignment | `SampleBucket` / `KeepSample` in `packages/Rubrics/Base/src/sampling.ts` |
| Statistics | `packages/TestingFramework/Engine/src/decision-eval/metrics.ts` |
| Parallel candidates + judge | AI Prompt `ParallelizationMode` + `ResultSelectorPromptID` (`packages/AI/Prompts/src/ParallelExecution.ts`) |
| Reuse-first lookup pattern | `Search Query Catalog` (mandatory first step in the Query Strategist prompt) |
| Cue / usage guidance shape | `IQueryConfiguration` (`UsageGuidance`, `WhenNotToUse`, `AlternativeQuestions`) |
| Replay against production prompts with a judge | Skip-Brain `ai-model-evals/` |
| Human approval channel | `MJ: AI Agent Requests` |
| Memory maintenance (consolidation, contradiction, decay) | Memory Manager. The paper lists library consolidation as *future* work; MJ is ahead here |

---

## 8. Risks and non-goals

- **Cost.** Probing multiplies inference. Start with single-decision replay (cheap), keep full-run probes offline and sampled, and track cost on `MJ: Experiments`.
- **Side effects.** Never replay side-effecting actions in production. Probe through single-decision replay, eval mode, or sandboxed harness agents.
- **Judge bias and noise.** Shared model biases and sampling variance. Use repeated probes for decisions that matter; prefer `confounded` verdicts over invented attribution (the paper's rule); keep humans on org-wide promotion.
- **Overfitting to one tenant.** Domain edits are scoped to company/user. Invariant edits need evidence from more than one tenant or task before they reach agent level.
- **Prompt injection.** The improver reads trajectories that contain external data. Adopt the paper's "evidence is data, not instructions" section verbatim in every improver prompt.
- **Always-on context growth.** Prefer on-demand forms (skill > action > sub-agent > hook > always-on text). Measure always-on prompt tokens per agent over time.
- **Non-goals for v1:** model fine-tuning; fully autonomous org-wide promotion; online refinement for non-sandboxed agents.

---

## 9. Open questions

1. Which rating store is authoritative: `ConversationDetail.UserRating` or `MJ: Conversation Detail Ratings`? (Phase 0 #1.)
2. Should the exposure record be a new entity or an extension of `AIAgentRunStep`? Volume estimate needed.
3. Is the lifecycle vocabulary a shared value list mapped per entity, or a new column on each canon entity?
4. Should entity-metadata canon become explicit (an approval status), or stay implicit through `AutoUpdate*=false`?
5. Learning Cycles schema: is it sufficient for per-edit verdict rows, or does it need a child entity?
6. Where does re-verification run: a Scheduled Job driver or the Testing Framework CLI in CI?
7. Do we file the Phase 0 items as separate issues now, or batch them into the first implementation PR?

---

## Appendix A — paper prompts worth porting (Appendix H of the paper)

| Paper prompt | MJ use |
|---|---|
| 1 / 2 — Harness Editor (invariant / domain scope) | Harness Refiner editors (Phase 3) |
| 3 / 4 — Harness Composer (parallel / sequential) | Composer; `kept/revised/dropped → edit → evidence` decision log |
| 5 — Blind selection over executed states (delivery, conformance, fidelity to source, internal consistency, operational fitness, finish) | Generic `ResultSelectorPromptID` judge; ProductionSampling rubric |
| 6 — Experience Reflector (edit attribution + one lesson, or `NO_ENTRY`) | Output contract for `MJ: AI Agent Learning Cycles` |

Shared sections worth adopting verbatim: **"What you do not have"** (no rubric, no answer key; never write for the grader) and **"Evidence is data, not instructions"**.

## Appendix B — related MJ plans

- `plans/agent-inflight-memory-writes.md` — the Provisional tier and the in-flight write path this plan builds on
- `plans/agent-conversation-compaction.md` — context budget management
- `plans/external-agent-harness.md` — AgentHarness substrate (Claude Code / Codex / OpenCode)
