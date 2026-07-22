# Predictive Studio — The Business-User Experience (the conversational north-star, made real)

> **Companion to [predictive-studio.md](./predictive-studio.md).** That doc specs the *platform* (Phase 1) and the *model-as-primitive reach* (Phase 2, shipped + integration-proven). **This** doc plans the **experience layer**: turning the north-star into something a *non-technical business user* can actually do, see, and trust — and demo end to end.
>
> Status: **DONE — shipped, committed, and integration-proven** (completed 2026-06-28; authored same day, grounded in the live audit of the agent + UX layers below). Every workstream WS0–WS5 is merged with a targeted commit (refs per §3); WS6 stays local/throwaway by design. The §1 journey runs end-to-end — see the [Demo run-through](#demo-run-through) below — and the core data flow is proven by `ps-inproc-scheduled-scoring.ts`.

---

## 0. The one-sentence goal

> A membership director, in chat, asks *"which members are likely to lapse this year?"* — and minutes later **every member record shows a renewal-risk score that refreshes monthly**, with the whole thing driven and explained conversationally, and the deployed model visible in a control-tower view.

If we can demo that, cleanly, we've delivered the vision.

### 🚨 Cardinal principle — EVERYTHING GENERIC
**Members / renewal / AssociationDemo are throwaway *test data*, never a build target.** Every product surface here is **metadata-driven and entity-agnostic**: the risk card is driven by `MJ: ML Model Scoring Bindings` (lights up on *any* entity a model writes to), the production view reads bindings + process runs generically, scoring + scheduling are already generic. **No entity-specific code, no `Member`-named components, no committed `Members` migration.** The demo dataset (WS6) is *local, uncommitted* test setup — same discipline as the AssociationDemo install: never committed. If a task tempts an entity-specific shortcut, stop and make it generic.

**Execution:** all workstreams in sequence, autonomously; **one targeted commit per workstream** (only my files; no throwaway); unit + integration tests where the stack is touched; design-token-clean UX; final report.

---

## 1. The demo we're building (the journey, beat by beat)

1. **Ask.** The business user opens Predictive Studio (or any MJ chat) and types: *"Which members are likely to not renew this cycle?"*
2. **Collaborate.** The **Model Development Agent** clarifies in plain English (target = Members, outcome = renewal, this cycle), then proposes a plan: *"I'll build a model from tenure, event attendance, payment history and engagement, hold out recent data to score it honestly, and watch for anything that would cheat. Sound good?"*
3. **Approve.** User: *"yes."*
4. **Build (visible).** The agent runs the experiment; the **Experiments board populates live**. It reports in business terms: *"Done — it's right about 85% of the time. The strongest signals are members who stopped attending events and have a lapsed payment."*
5. **Offer to operationalize.** *"Want me to score every member, put a **renewal risk** on each member's record, and refresh it on the 1st of every month?"*
6. **Confirm.** User: *"yes, please."*
7. **Operationalize (one move).** The agent scores the membership, **writes `RenewalProbability` onto each Member**, and **schedules monthly** re-scoring. *"Done. 412 members are high-risk right now. Every member's record shows their renewal risk, refreshing monthly."*
8. **See the value.** User clicks a high-risk member → a **Renewal-Risk card** at the top of the record: *"18% likely to renew — HIGH RISK · top signals: no events in 9 months, lapsed dues · last scored today."* And a **Models in Production** view shows the deployed model, what it writes, its schedule, last run, and the at-risk distribution.

Beats 1–4 worked at audit time. Beat 5–7's *"refresh monthly"* was the agent gap (closed by WS0). Beat 8 (the payoff) was the UX gap (closed by WS1 + WS2). **All eight beats now work.**

### Demo run-through

The exact §1 journey a user follows now, and which workstream makes each step real:

1. **Open the Studio → Home → click "Ask the agent."** The seeded Model-Dev-Agent chat opens docked in-section with the starter prompt pre-filled (**WS5**).
2. **Describe the goal in chat** — *"which members are likely to not renew this cycle?"* The agent collaborates (Goal Analyst → Data Scout → Experiment Designer), proposes a `ModelingPlanSpec`, and asks for approval. You say *yes*; it trains an experiment and reports the result in business terms. The **Experiments** + **Registry** sections show the live runs/models, not samples (**WS3**).
3. **Promote.** The agent promotes the model to Published. Because the prompt now teaches it to **close the loop**, it immediately offers: *"Want me to score every active member, write the renewal-risk onto each record, and refresh it on the 1st of every month?"* (**WS0**).
4. **Say yes.** The agent calls `Schedule Model Scoring` (default `Cadence='Monthly'`). The helper creates the scheduled Record Process **and** the `MJ: ML Model Scoring Binding` (the binding fix), so the surfaces light up (**WS0** + binding fix).
5. **Open a scored member record.** The **renewal-risk card** renders at the top — value as a band, top drivers, model + version, last-scored — driven entirely by the binding, on a generic `'*'`-wildcard form panel (**WS1**).
6. **Open "Models in Production."** The control-tower section shows the deployed model, what it writes (entity/column), its cadence + next run, last run (time + rows), and the current prediction distribution (**WS2**).

The data flow underneath beats 2–6 (train → bind → schedule → write-back, with the binding asserted) is **integration-proven** by `ps-inproc-scheduled-scoring.ts` (one `createScheduledModelScoring(...)` call → owned Scheduled Job + a real scored write-back + binding assertion). Scored-query enrichment (**WS4b**) is proven by `ps-inproc-scored-query.ts`; the `ps-live-*` suite drives the same paths over GraphQL against a running MJAPI. None of these surfaces are entity-specific — they would work identically for any client's entity + model.

---

## 2. Where we are — grounded audit (2026-06-28)

> The audit below captured the **pre-build** state. It's preserved as the starting point; the §3 workstreams (each ✅ **DONE** with a commit ref) describe what shipped on top of it.

### Agent layer — ~95% there
- **Model Development Agent: BUILT + Active.** `metadata/agents/.model-development-agent.json` — a Loop agent with the "sharp, friendly analyst" persona, three payload-guarded sub-agents (**Goal Analyst** → target/metric; **Data Scout** → sources/features + leakage flags; **Experiment Designer** → ranked experiments/validation/budget), the Agent-Manager pattern (collaborate → typed `ModelingPlanSpec` → approval → deterministic execution → LLM business report), and an **ML Experiment Results** artifact.
- **Ground truth wired:** approved `MJ: Queries`, DBAutoDoc, Agent Notes, existing approved `MJ: ML Models`; agent-drafted queries land `Pending` (don't pollute the trusted layer).
- **Toolkit wired:** Train ML Model · Score Record Set · Run Experiment Session · Promote ML Model · Write Entity Field(s).
- **The one gap:** **Schedule Model Scoring** (built in source as `PredictiveStudioScheduleModelScoringAction`) is **not metadata-synced** (no `primaryKey`/`sync`), **not in `MJ: AI Agent Actions`** for the agent, and **not a Remote Op**. So the agent cannot perform beat 5–7's *"refresh monthly."*

### UX layer — real engine + a lot of mock
- **Embedded chat: wired.** The Studio docks `<mj-conversation-chat-area>` pinned to the Model Dev Agent, app-context-aware (active section + live model/session counts). Conversational entry exists.
- **Live, interactive:** **Algorithm Catalog** (reads `engine.UseCases`/`Rankings`/`Algorithms`, re-ranks on scenario select) and **Model Registry** master list (reads `engine.Models`).
- **Mock / sample (looks real, isn't):** **Home** KPIs (`bestHoldout='0.864'`, `scoredThisWeek='48,210'`, a fake activity feed), the **Training Pipelines** DAG (hard-coded nodes; the real authoring surface is the Record-Process editor in Knowledge Hub), the **Experiments** kanban (`SAMPLE_*` arrays), **Compare Runs** (`SAMPLE_COMPARE_RUNS`), and the **Registry detail** (feature-importance + most metrics hard-coded). Promote/Archive (Registry) and Pause/Cancel (Experiments) buttons **emit nothing**.
- **The payoff is missing:** a written-back prediction renders as a **plain field** on the member form — no risk card, no provenance. There is **no "models in production"** surface (published models, what each writes, schedule, last run, at-risk distribution) even though the data exists (`MJ: ML Model Scoring Bindings`, `MJ: Process Runs`).

---

## 3. Workstreams

> Ordered so the **minimum compelling demo** = WS0 + WS1 + WS6. WS2–WS5 deepen credibility and polish.

### WS0 — Close the agent loop (the conversational "refresh monthly") · *small, do first* · ✅ **DONE** (`332189538b`)
- Seed/sync the **Schedule Model Scoring** action (`primaryKey`/`sync` via `mj sync push`); add a `MJ: Action Result Codes` review pass.
- Wire it into the **Model Development Agent**'s `MJ: AI Agent Actions`.
- (Recommended for parity) expose **`PredictiveStudio.ScheduleModelScoring`** as a Remote Op (CodeGen metadata row + the thin op body delegating to `createScheduledModelScoring`), so client + agent + workflow share one typed surface.
- Update the agent prompt (Experiment Designer / the orchestrator report step) to **offer operationalization** after a successful promote — the beat-5 "want me to score everyone and refresh monthly?" — and to call Schedule Model Scoring on yes.
- **AC:** in chat, the agent completes train → promote → write-back → **schedule monthly**, end to end, and says so in plain language.
- **Shipped:** `Schedule Model Scoring` is metadata-synced (`metadata/actions/predictive-studio/.predictive-studio-actions.json` — full `ModelID`/`TargetEntityName`/`OutputField`/`ScopeFilter`/`Cadence`/`PrimaryKeyField`/`ValueKind` params, `SUCCESS`/`VALIDATION_ERROR`/`SCHEDULE_FAILED` result codes, all with `primaryKey`/`sync`) and added to the Model Development Agent's `MJ: AI Agent Actions` (`metadata/agents/.model-development-agent.json`). The agent prompt (`metadata/prompts/templates/model-development-agent/model-development-agent.template.md`, §5 "Operationalize — proactively offer — close the loop") instructs the agent, after a clean promote, to offer "score every active member now, write each one's renewal-risk onto their record, refresh monthly" via `suggestedResponses` and, on yes, to call `Schedule Model Scoring` with the right params (default `Cadence='Monthly'`).

### WS1 — The Renewal-Risk card on the member (the payoff) · *medium, highest business value* · ✅ **DONE** (`b338e16fd4`)
- A reusable **prediction/risk form panel** (`BaseFormPanel` extension; see `packages/Angular/.../base-forms` PANELS) that, for any record, looks up **`MJ: ML Model Scoring Bindings`** for that entity, finds bound output columns, and renders a card: the value as a **meaningful indicator** (band + color via status tokens — e.g. *"18% likely to renew · HIGH RISK"*), the **top drivers** (from the model's feature importance), the **model + version**, and **last scored**.
- Generic by construction (driven by bindings), so it lights up on *any* entity a model writes to — not just Members.
- **AC:** open a high-risk member → a clear renewal-risk card at the top of the record (not a raw number).
- **Shipped:** `ModelPredictionPanel` (`packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/`), a `BaseFormPanel` registered under the **`'*'` wildcard entity** (`@RegisterClassEx(BaseFormPanel, { metadata: { entity: '*', slot: 'after-fields', sortKey: 40 } })`). On any record it `RunView`s `MJ: ML Model Scoring Bindings` filtered to `TargetEntityID=<this entity> AND TargetColumn IS NOT NULL`, and renders a card per binding: the bound value as a meaningful indicator (entity-neutral low/mid/high band shaded with `--mj-brand-primary` opacity; 0–1 → "%", regression → grouped number, classification → class label, missing → "—"), the **top 5 drivers** parsed from the model's `FeatureImportance`, the **model + version** ("Pipeline v{n}"), and **last scored**. It **self-hides** (`@if (HasPredictions)`, i.e. `Cards.length > 0`) when no binding applies — so it's invisible on every entity a model doesn't write to. The `'*'` wildcard support was added to the slot host (`packages/Angular/Generic/base-forms/src/lib/panel-slot/`): `entityMatches()` treats `'*'` as "mount on every entity's form," documented as the entity-agnostic-panel contract.

### WS2 — "Models in Production" overview (the control tower) · *medium* · ✅ **DONE** (`a307dba663`)
- A new Studio section (or a Home card promoted to a section): published models × what each writes (entity/column) × cadence + next run × last run (time + rows scored) × **prediction distribution** (e.g. "412 high-risk / 1,930 low-risk"). Wired to `MJ: ML Model Scoring Bindings` + `MJ: Process Runs` (+ a quick distribution `RunView`/aggregate over the written column).
- **AC:** a business user sees, at a glance, what's deployed and the current at-risk count — and can jump to the at-risk segment.
- **Shipped:** a new **"Models in Production"** Studio section — `PSProductionComponent` (`packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-production.component.*`) inside `PSProductionResourceComponent` (`resources/ps-production-resource.component.ts`, `@RegisterClass(BaseResourceComponent, 'PredictiveStudioProductionResource')`). Per deployed model it shows: model label + algorithm + problem type + status, the **entity/column it writes to**, the **mode + schedule phrase** (`humanizeCron`), the **last run** (latest `MJ: Process Runs` row for the binding's `RecordProcessID` — status, time, success/error counts) or the binding's `LastScoredAt`/`LastRowCount`, and a **prediction-distribution mini-viz**. The distribution (`production-distribution.ts`, pure + unit-testable) samples up to 5,000 non-null values of the bound column and buckets them entity-neutrally — numeric → three terciles ("Lower/Middle/Upper third"), categorical → top-8-by-frequency + "Other". All data comes from `MJ: ML Model Scoring Bindings` + `MJ: Process Runs` + the target entity via metadata; **zero Member-specific code**.

### WS3 — De-mock the Studio (make it credible) · *medium–large* · ✅ **DONE** (`820ded4794`)
- Replace `SAMPLE_*` with live engine data + wire the dead buttons:
  - **Home** KPIs + activity → real (best holdout from `Models`, scored-this-week from `Process Runs`, activity from recent runs/promotions).
  - **Experiments** kanban + Pause/Cancel → real `Experiment Session Iterations` + the Control-Experiment op.
  - **Registry** detail metrics + feature importance → real (`Metrics`/`HoldoutMetrics` + a feature-importance surface on the engine); Promote/Archive → the Promote op.
  - **Compare Runs** → real training runs from a session leaderboard.
- Expose the missing engine surfaces the panels need (holdout-metric + feature-importance accessors, noted as TODOs in the components).
- **AC:** every Studio number/action reflects reality; no sample arrays in the shipped path.
- **Shipped:** the `SAMPLE_*` arrays are gone from the shipped path (the only `SAMPLE_` token left is the `PRODUCTION_SAMPLE_CAP = 5000` constant). The transforms live in pure, testable view-models (`predictive-studio.view-models.ts`): Registry reads `engine.Models` (metrics/holdout/feature-importance parsed live); Experiments reads `engine.Sessions`/`engine.Iterations` (kanban + leaderboard); Home computes real KPIs + an activity feed from `engine.Models`/`engine.Sessions` + recent `MJ: Process Runs`; Compare reads the session leaderboard. The previously-dead buttons are wired to Remote Operations behind a `ps-confirm-modal`: **Promote / Mark Validated / Archive** → `PredictiveStudioPromoteModelOperation` (`{ modelId, targetStatus, signOff?, reason? }`, with a required leakage sign-off reason when flagged); **Pause / Resume / Cancel** → `PredictiveStudioControlExperimentSessionOperation` (`{ sessionId, action }`). Each mutation force-refreshes the engine (`Config(true, …)`) and reports success/failure via notification.

### WS4 — Foundational enablers · *small* · ✅ **DONE** (WS4a `a001322a19`, WS4b `9fe44db496`)
- **WS4a** — Make **`'ML Model'` a `RecordProcess.WorkType` dropdown option** in the Bulk-Operations/Record-Process studio (today it saves via helper/agent only).
  - **Shipped:** migration `V202606280215__v5.44.x__RecordProcess_WorkType_AddMLModel.sql` adds `'ML Model'` to the `CK_RecordProcess_WorkType` CHECK constraint — **drop the old constraint + add the new one** (`'Action' | 'Agent' | 'Infer' | 'FieldRules' | 'ML Model'`) **in a single migration**. The CHECK is the source of truth: CodeGen derives the value list, `ValueListType`, and the generated union from it, so after `mj codegen` the union becomes `'Action' | 'Agent' | 'FieldRules' | 'Infer' | 'ML Model'` and it's a real dropdown option. The `RecordProcessorRegistry` still resolves the processor at execution time; the CHECK validates the stored value at save time. **Needs CodeGen** to regenerate the union. *(This consolidates + replaces the original two-migration approach — one dropping the CHECK for "pluggability", one hand-seeding `EntityFieldValue`/`ValueListType` — which was wrong: never manipulate that metadata directly; it's CodeGen-derived from the CHECK.)*
- **WS4b** — **Enrichment GraphQL marshaling** (PS2-3 follow-up): thread `RunQueryParams.Enrichment` through the RunQuery resolver + client so **browser/Query-Builder** callers (and dashboard widgets) can request scored queries, not just server-side Skip.
  - **Shipped:** the RunQuery resolver (`packages/MJServer/src/resolvers/QueryResolver.ts`) accepts `@Arg('Enrichment', () => GraphQLJSONObject, { nullable: true })` and threads it into `RunQuery({ …, Enrichment })`; the `GraphQLDataProvider` client carries the same `Enrichment?: RunQueryEnrichment` (`{ EnricherKey, Config }`) field. The `'ML Model Score'` enricher (`MLModelScoreEnricher`, PS2-3) appends a prediction column to a query result from the browser.
- **AC:** 'ML Model' is selectable in the UI; a scored query works from the client.

### WS5 — Member-form polish + entry ergonomics · *small, optional* · ✅ **DONE** (`4805f9b92e`)
- Make Home's **"Ask the agent"** entry path actually open the docked chat with a seeded prompt ("Build a model that predicts…").
- **Shipped:** the Home panel (`ps-home.component.ts`) emits `askAgent(PS_AGENT_STARTER_PROMPT)` from the hero/entry CTA; the Home resource (`ps-home-resource.component.ts`) handles it by setting `pendingPrompt` + opening the docked `<mj-conversation-chat-area>` (pinned to the Model Dev Agent via `[defaultAgentId]`, `[pendingMessage]="pendingPrompt"` so the starter prompt auto-sends). One click from Home drops the user into a seeded Model-Dev-Agent conversation in-section. *(The bound-column "model output" badge was not pursued — the risk card (WS1) is the model-output surface; a parallel per-field badge was deemed redundant.)*
- **AC:** the conversational entry is one click from Home.

### WS6 — Demo dataset + the run-through · *small, demo-readiness · LOCAL/THROWAWAY only*
- **Local, uncommitted test setup** (same discipline as the AssociationDemo install — never committed): a clean renewal target + a prediction column on the demo entity to write into (the existing throwaway prediction columns are fine; if a tidier one helps the demo, it's a *local* schema tweak, not a product migration).
- A rehearsed, scripted end-to-end run (the §1 journey) proving the **generic** surfaces light up on the demo entity.
- **AC:** the §1 journey runs clean, repeatably, in < ~10 minutes — and every surface it exercises is entity-agnostic (would work identically for a different client's entity + model).
- **Status:** intentionally **local/throwaway** — no committed `Members` migration, no entity-specific code. The §1 journey is rehearsed against the local demo dataset; the *generic* data flow it depends on is committed and proven by the integration scripts below (so the demo is reproducible without shipping demo data).

### The binding fix that lights up the surfaces · ✅ **DONE** (`cf4c1a4b79`)
WS1's risk card and WS2's production view both read `MJ: ML Model Scoring Bindings`. For them to light up, **operationalizing** a model must record a binding — not just create a scheduled Record Process. So `createScheduledModelScoring` (`packages/AI/PredictiveStudio/Engine/src/scheduling/scheduled-model-scoring.ts`) now, after saving the Record Process, calls `upsertScoringBinding(...)` to create/update the `MJ: ML Model Scoring Binding` row with `MLModelID`, `RecordProcessID`, `TargetEntityID`, `TargetColumn`, and `Mode='Scheduled'`. This is the **lineage record** the UX surfaces key off — "this model is in production, scoring these records into this column on this schedule." Without it the scheduled job would run silently and the WS1/WS2 surfaces would stay dark.

> Supporting commits: build fix `cca1362cec`; this plan doc `444f22630d`.

---

## 4. Sequencing

- **Sprint A (demo-critical):** WS0 (agent loop) → WS1 (risk card) → WS6 (dataset + run-through). This alone makes the §1 demo real.
- **Sprint B (credibility):** WS2 (production overview) → WS3 (de-mock).
- **Sprint C (polish/enablers):** WS4 + WS5.

Each item ships behind the same discipline as Phase 2: unit + (where it touches the stack) integration tests, design-token-clean UX, targeted commits, no throwaway.

## 5. Acceptance — "we can demo it"
1. A business user, in chat, completes the full §1 journey **without leaving the conversation** (incl. "refresh monthly").
2. Opening a scored member shows a **renewal-risk card** with band, drivers, model, and last-scored.
3. A **Models in Production** view shows the deployed model + the live at-risk count.
4. The Studio shows **real data** for the demo paths (no sample arrays on screen).
5. The whole thing is reproducible from the integration suite where it makes sense, and demoable live.

## 6. Out of scope (deferred, tracked elsewhere)
- **Materialized prediction columns / #2770** — the auto-refreshing population-wide column (the optional `MaterializedResultID` tie-in). Gated on PR #2770; write-back covers the need today.
- Multi-tenant sidecar limits, drift-detection UX, and the broader maintenance dashboards (see `predictive-studio.md` §13–16).
