# Predictive Studio — The Business-User Experience (the conversational north-star, made real)

> **Companion to [predictive-studio.md](./predictive-studio.md).** That doc specs the *platform* (Phase 1) and the *model-as-primitive reach* (Phase 2, shipped + integration-proven). **This** doc plans the **experience layer**: turning the north-star into something a *non-technical business user* can actually do, see, and trust — and demo end to end.
>
> Status: **PLAN / not started.** Authored 2026-06-28, grounded in a live audit of the agent + UX layers (below).

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

Beats 1–4 work today. Beat 5–7's *"refresh monthly"* is the agent gap. Beat 8 (the payoff) is the UX gap.

---

## 2. Where we are — grounded audit (2026-06-28)

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

### WS0 — Close the agent loop (the conversational "refresh monthly") · *small, do first*
- Seed/sync the **Schedule Model Scoring** action (`primaryKey`/`sync` via `mj sync push`); add a `MJ: Action Result Codes` review pass.
- Wire it into the **Model Development Agent**'s `MJ: AI Agent Actions`.
- (Recommended for parity) expose **`PredictiveStudio.ScheduleModelScoring`** as a Remote Op (CodeGen metadata row + the thin op body delegating to `createScheduledModelScoring`), so client + agent + workflow share one typed surface.
- Update the agent prompt (Experiment Designer / the orchestrator report step) to **offer operationalization** after a successful promote — the beat-5 "want me to score everyone and refresh monthly?" — and to call Schedule Model Scoring on yes.
- **AC:** in chat, the agent completes train → promote → write-back → **schedule monthly**, end to end, and says so in plain language.

### WS1 — The Renewal-Risk card on the member (the payoff) · *medium, highest business value*
- A reusable **prediction/risk form panel** (`BaseFormPanel` extension; see `packages/Angular/.../base-forms` PANELS) that, for any record, looks up **`MJ: ML Model Scoring Bindings`** for that entity, finds bound output columns, and renders a card: the value as a **meaningful indicator** (band + color via status tokens — e.g. *"18% likely to renew · HIGH RISK"*), the **top drivers** (from the model's feature importance), the **model + version**, and **last scored**.
- Generic by construction (driven by bindings), so it lights up on *any* entity a model writes to — not just Members.
- **AC:** open a high-risk member → a clear renewal-risk card at the top of the record (not a raw number).

### WS2 — "Models in Production" overview (the control tower) · *medium*
- A new Studio section (or a Home card promoted to a section): published models × what each writes (entity/column) × cadence + next run × last run (time + rows scored) × **prediction distribution** (e.g. "412 high-risk / 1,930 low-risk"). Wired to `MJ: ML Model Scoring Bindings` + `MJ: Process Runs` (+ a quick distribution `RunView`/aggregate over the written column).
- **AC:** a business user sees, at a glance, what's deployed and the current at-risk count — and can jump to the at-risk segment.

### WS3 — De-mock the Studio (make it credible) · *medium–large*
- Replace `SAMPLE_*` with live engine data + wire the dead buttons:
  - **Home** KPIs + activity → real (best holdout from `Models`, scored-this-week from `Process Runs`, activity from recent runs/promotions).
  - **Experiments** kanban + Pause/Cancel → real `Experiment Session Iterations` + the Control-Experiment op.
  - **Registry** detail metrics + feature importance → real (`Metrics`/`HoldoutMetrics` + a feature-importance surface on the engine); Promote/Archive → the Promote op.
  - **Compare Runs** → real training runs from a session leaderboard.
- Expose the missing engine surfaces the panels need (holdout-metric + feature-importance accessors, noted as TODOs in the components).
- **AC:** every Studio number/action reflects reality; no sample arrays in the shipped path.

### WS4 — Foundational enablers · *small*
- Add **`'ML Model'` to the `RecordProcess.WorkType` value-list** (metadata + CodeGen) so it's a real **dropdown option** in the Bulk-Operations/Record-Process studio (today it saves via helper/agent only). Pairs with the dropped CHECK from Phase 2.
- **Enrichment GraphQL marshaling** (PS2-3 follow-up): thread `RunQueryParams.Enrichment` through the RunQuery resolver + client so **browser/Query-Builder** callers (and dashboard widgets) can request scored queries, not just server-side Skip.
- **AC:** 'ML Model' is selectable in the UI; a scored query works from the client.

### WS5 — Member-form polish + entry ergonomics · *small, optional*
- A subtle **"model output" affordance** on bound columns in the generic form (icon/badge) so even outside the risk card, users know a value came from a model + when.
- Make Home's **"Ask the agent"** entry path actually open the docked chat with a seeded prompt ("Build a model that predicts…").
- **AC:** the conversational entry is one click from Home; model-written fields are visibly distinguished.

### WS6 — Demo dataset + the run-through · *small, demo-readiness · LOCAL/THROWAWAY only*
- **Local, uncommitted test setup** (same discipline as the AssociationDemo install — never committed): a clean renewal target + a prediction column on the demo entity to write into (the existing throwaway prediction columns are fine; if a tidier one helps the demo, it's a *local* schema tweak, not a product migration).
- A rehearsed, scripted end-to-end run (the §1 journey) proving the **generic** surfaces light up on the demo entity.
- **AC:** the §1 journey runs clean, repeatably, in < ~10 minutes — and every surface it exercises is entity-agnostic (would work identically for a different client's entity + model).

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
