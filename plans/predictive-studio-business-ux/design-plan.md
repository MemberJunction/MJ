# Design Plan — Predictive Studio, business-user experience (Option B-refined)

**Status:** Phase 4 (locked plan). Derived from [design-brief.md](design-brief.md) + the locked mockup
**`mockups/option-b-refined.html`** (Option B: canvas + docked Skip co-pilot, with a Predictions home front
door and Option C's trust-gate folded in). Branch `predictive-studio-ux`.

## The locked direction
A new **business-user experience layer** over the existing Predictive Studio engine — three states:
1. **Predictions home** — a catalog of published models re-framed as plain-language questions ("Who won't renew?"), each with a **trust badge**; "+ New prediction"; a docked **Skip** co-pilot. Three ways in: open a ready prediction · ask Skip · "+ New prediction" guided pick.
2. **Workspace** — for a chosen prediction: a **trust verdict that gates the actions**, a ranked **at-risk list** with plain-language reasons, and a sticky **4-action bar**.
3. The analyst builder (pipelines/DAG/leakage/as-of/algorithms) is untouched, reachable as **Advanced**.

Everything reuses the engine; this is an experience layer. Zero ML jargon on the surface (jargon only behind "For analysts ▸").

## What we reuse (from the substrate inventory)
| Need | Reuse |
|---|---|
| Published models (catalog) | `PredictiveStudioEngine` cached `_Models` (`MJMLModelEntity`, `Status='Published'`), reactive `ObserveProperty('_Models')`; `ModelDisplayName()` |
| Model metrics | `parseMetrics` / `canonicalMetricKey` / `PS_KNOWN_METRIC_KEYS` in `predictive-studio.view-models.ts` (`HoldoutMetrics` JSON) |
| Run a prediction + at-risk records | `CreateScoringProcess` / `ScoreRecordSet` Remote Ops, `RecordProcessExecutor.RunByID`, `MJ: Process Run Details` (`ResultPayload`); `loadRunsForProcessIds` pattern in the engine |
| Write score to records | `CreateScoringProcess({outputField})` → scoring binding + `OutputMapping` (already proven by `ps-inproc-operate-flow`) |
| Push to a list | `MJListEntity` / `MJListDetailEntity`, the `Lists/` components + `ng-list-management` (create list, add records) |
| Export | `ExportService` (`packages/Angular/Generic/export-service/`) — `toCSV/toExcel`, `ExportDialogComponent` |
| Conversational Ask | `mj-conversation-chat-area` (`@memberjunction/ng-conversations`) — the Home resource's embed contract; `SetAgentContext` / `SetAgentClientTools` |
| Chrome + lifecycle | chrome trio, `BaseResourceComponent` / `PSResourceBase`, `NotifyLoadComplete()`, query-param round-trip, design tokens |

## Gaps we must build (flagged honestly)
1. **Trust-grade translator** — metrics → `Poor/Fair/Good/Excellent` + plain one-liner + `canAct` gate. Pure, unit-tested. (The centerpiece + the safety gate.)
2. **Per-record "reasons"** — the engine only has **global** `FeatureImportance`, no per-record/SHAP drivers. v1 = a **heuristic** plain-language driver generator (per record: the few features where this record deviates most in the risk-increasing direction, named in business language), clearly labeled "what's driving this" — NOT claimed as exact attribution. Highest-uncertainty piece; isolate it behind a seam so it can be upgraded later.
3. **Outreach** = hand-off only (create/push a List); no email/SMS send (out of scope per brief).

## The Predictive Studio Agent — the create path (elevate the Model Development Agent)

Per the locked decisions: the **existing "Model Development Agent" is elevated** into the first-class **Predictive Studio Agent** — a domain-builder modeled exactly on **Agent Manager** + **Database Designer**. The conversation reasons in plain language; **the structure it produces is deterministic + type-safe** (never LLM-emitted records). It owns the full concierge — **question → typed spec → build pipeline → train → publish** — and **publish is GATED on the trust verdict** (a Poor/unmeasured model is never published into the business catalog; the agent says so and offers to hand off to an analyst). Agents are **pure server-side** (eagerly registered via metadata + `@RegisterClass`) — **no lazy-loading concerns**.

The recipe (copied from `AgentManager/core` + `DatabaseDesigner/core`):
- **Typed payload — `ModelingPlanSpec`** (ALREADY EXISTS: `packages/AI/PredictiveStudio/Core/src/modeling-plan-spec.ts` — Goal, TargetDefinition, CandidateSources, CandidateFeatures, ProposedExperiments, ValidationStrategy, ProposedBudget, Approved). Carried across turns via `ExecuteAgentParams.payload`, mutated via `payloadChangeRequest`. "Waiting to be wired."
- **Loop sub-agents:** Research/Planning (discover existing entities/sources/features — never invent names) → Data Scout (CandidateSources/Features + leakage notes) → Experiment Designer (rank `ProposedExperiments` + rationale) → **Validator** (override `validateSuccessNextStep()` — target entity exists, features available, leakage clean, dedup) → **approval gate**.
- **Deterministic builder — `PredictiveStudioPipelineBuilder`** (code sub-agent, overrides `executeAgentInternal()`, no LLM): reads the approved `ModelingPlanSpec`, atomically creates the `MJ: ML Training Pipeline` (+ linked source/feature/leakage/validation rows) via a new **`ModelingPlanSpec` sync bridge** (mirror `AgentSpecSync`), refreshes caches, kicks off training via the existing **`train-model.action`**, then **publishes only if `deriveTrustVerdict` (P0) clears the bar** — the same safety rule as the UI gate.
- **Orchestrator interception** — override `determineNextStep()` to force approve→validate→build→train deterministically (the LLM never triggers the builder); a gate/attempt counter prevents retry loops.
- **Invocation** — "+ New prediction" (and the home empty state) opens `mj-conversation-chat-area` in **`overlayMode` slide-in**, locked to the agent (`showAgentPicker=false`), seeded with `pendingMessage` ("Help me predict …"). Inline approval buttons emit the `create_now` sentinel. On success → the new prediction appears in the home catalog (reactive `_Models`).

**Exists:** the Model Development Agent record, `ModelingPlanSpec`, `PipelineSpec`, `train-model.action`, the slide-in chat embed, the trust translator (P0).
**Build:** the `ModelingPlanSpec` sync bridge, the Data Scout + Experiment Designer + Validator sub-agents, `PredictiveStudioPipelineBuilder`, the `determineNextStep`/`validateSuccessNextStep` overrides, the publish-gated-on-trust step, and the "+ New prediction" slide-in wiring. Mirror `packages/AI/DatabaseDesigner/core/src/agents/` structure (a new agents area under PS).

## Build sequence (revised — two workstreams on a shared foundation; each piece: build → unit/integration test → PW-verify → commit)

**Foundation**
- **P0 · Trust translator** (`trust.ts`) — drafted; finish unit tests. Powers catalog badges, the workspace gate, AND the agent's publish gate. *(pure)*

**Workstream A — the business experience (consume/operate; matches the locked mockup; demos against existing published models):**
- **A1 · Predictions home** — `BusinessPrediction` VM (published `MJMLModelEntity` → plain-question card + trust badge) → a new `PredictiveStudioPredictionsResource` (chrome trio, card gallery, "+ New prediction", docked co-pilot, reactive `_Models`, `NotifyLoadComplete`, agent context). New "Predictions" business nav item.
- **A2 · Workspace + trust gate** — the trust verdict banner **gates the action bar** (Poor/unmeasured → locked w/ reason); breadcrumb; distribution.
- **A3 · Ranked at-risk list + reasons** — parse `Process Run Details`, rank by score; reasons via the heuristic seam; "no run yet → Run now".
- **A4 · The four actions (gated)** — Call list · Save scores (`CreateScoringProcess`) · Send to a list (`MJListEntity`) · Export (`ExportService`).

**Workstream B — the Predictive Studio Agent (create; the concierge — server-side):**
- **B1 · `ModelingPlanSpec` sync bridge** — load-for-research + atomic create of `MJ: ML Training Pipeline` (+linked) + cache refresh. *(code; unit + an in-process integration test like the `ps-inproc-*` suite)*
- **B2 · Builder + gates** — `PredictiveStudioPipelineBuilder` (`executeAgentInternal`), Validator (`validateSuccessNextStep`), `determineNextStep` approval interception, train kickoff, **publish gated on trust**.
- **B3 · Sub-agents + agent elevation** — Data Scout + Experiment Designer; elevate the Model Development Agent metadata to drive Research→Design→Validate→Approve→Build→Train→Publish.
- **B4 · "+ New prediction" slide-in** — overlay `mj-conversation-chat-area`, seeded; success → new prediction in the catalog.

**Then**
- **C1 · Workspace co-pilot wiring** — the docked chat's agent context + client tools (open/run/show/act on the current workspace).
- **C2 · Verify to outstanding** — full E2E + the agent integration test, dark-mode, responsive, side-by-side vs `option-b-refined.html`; docs + changeset.

**Order:** P0 → A1–A4 → B1–B4 → C1–C2. A and B are largely independent (A demos against existing published models; "+ New prediction" opens the agent once B lands), so **A-first delivers the visible business experience fastest**. If you'd rather lead with the agent (B-first), the foundation (P0) serves both either way.

## MJ conventions (every piece)
Chrome trio (`<mj-page-layout>`/`<mj-page-header>`/`<mj-page-body>`); `--mj-*` tokens only (no hardcoded colors); MJ UI components; `NotifyLoadComplete()`; reactive `ObserveProperty` (no reload loops); `SetAgentContext`/`SetAgentClientTools`; multi-provider `Provider`/`ProviderToUse`; PascalCase public members; strong types (no `any`, derive field unions from entities).

## Playwright
New drivers under `e2e/predictive-studio/` (the established convention): `business-home.mjs` (catalog + trust badges + dark mode), `business-workspace.mjs` (trust gate enable/disable, ranked list, actions), and extend `operate-run.mjs`. Each piece's PW check runs before its commit; a full E2E pass in Piece 6. Zero non-cosmetic console errors is the bar.

## Risks / calls to make as we go
- **Per-record reasons** (Piece 3) is the real unknown — start with the heuristic, behind a seam; we may decide it's "global top drivers + this member's values" if the heuristic underwhelms. I'll show you the first version before leaning on it.
- **New nav item vs. reusing Home** — leaning new "Predictions" business default; the existing six analyst surfaces stay (as Advanced). Confirm during Piece 1.
- Scope is large; I'll build + verify + commit **piece by piece**, surfacing each so you can course-correct — not one big-bang.
