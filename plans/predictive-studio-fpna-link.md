# Predictive Studio ↔ FP&A ↔ Sonar — the link, designed now, built later

**Status:** Design note (2026-08-30). Defines the seams between the typed-component model in
Predictive Studio (PS), Sonar's engagement scores, and bizapps-fpna's deterministic cash
forecast. **Nothing here touches bizapps-fpna before its Nov 15 go-live** — FP&A Phase 1 is
deliberately deterministic ("a forecast nobody trusts has negative value"), and this note's whole
point is that the link needs zero Phase-1 code.

## 1. Forward seam — a PS model as a pluggable FP&A stream source (2027)

FP&A's engine already has the seam by design: *"The engine is a module with pluggable stream
sources"* — `OrdersAdapter` and `SalesAdapter` are plain classes invoked from
`FPNAEngine.materialize` (`packages/CoreEntitiesServer/src/FPNAEngine.ts:394-402`), and
`OrdersAdapter.emitReserve` emits one `Stream=Reserve` line per company per week-ending bucket at
`Amount = −Σ(assumed renewal) × AssumptionSet.RenewalChurnRate`.

The 2027 shape: a third adapter, `PredictiveReserveAdapter`, that replaces the FLAT churn rate
with per-subscription probabilities — `Amount = −Σ(renewal amount × p_churn)` — reading a
**PS write-back column on Orders' Subscriptions** (e.g. `RenewalRiskProbability` +
`RenewalRiskScoredAt`), maintained by a scheduled `WorkType='ML Model'` Record Process (PS2-1).
Rules that keep FP&A's discipline intact:

- **Reserve stays a Reserve line** — never a haircut on a `Renewal` line (schema-cash decision W).
- **Basis is an explicit assumption**: a new `AssumptionSet.ReserveBasis ∈ {Rate, Model}` column
  (2027) selects the adapter; switching basis shows in the Bridge as an `AssumptionChange`
  because the `LineKey` (`RESERVE:{companyId}:{isoDay}`) is unchanged.
- **Provenance on every line**: `OriginEntityID` = `MJ: ML Model Scoring Bindings`,
  `OriginRecordID` = the binding, `OriginLabel` = "<model> v<n> scored <date>".
- **Staleness fails loud**: `RenewalRiskScoredAt` older than `AssumptionSet.PredictionMaxAgeDays`
  → a new `FPNAErrorCode 'STALE_PREDICTION'`, never a silent fallback to the flat rate.
- **No LLM in the number path** — the score is a deterministic model output; the FP&A Analyst
  agent's "never invents numbers" rule holds.

## 2. The model behind the column — where Sonar and the typed components come in

The renewal-risk model is where the stack composes: a **Sonar engagement rubric** published as a
PS model (`algorithm=rubric` — the glass-box component ported in the typed-component work), or
any trained PS model, scored over Subscriptions (query-backed source joining anchor →
subscription). Sonar's anchor is a member/org; FP&A's renewal lines key on Subscriptions — the
link is the **write-back column on the entity FP&A already reads**, never a cross-schema FK from
`__mj_BizAppsFPNA` to `__mj_BizAppsSonar`. Scenarios (base/under/over) become `AssumptionSet`
variants (`ReserveBasis`, model version, `PredictionMaxAgeDays`); BvA reads the same lines.

## 3. Reverse seam — FP&A history as PS dated sources (data-gated, ~Q1 2027)

Zero FP&A code: `MJ_BizApps_FPNA: Snapshot Lines` (weekly frozen photos) and `Bridge Lines`
(typed change events) are natural `DatedSourceSpec` sources for the widened as-of aggregates —
forecast-reliability models, collections-timing features. Gated on data, not engineering:
meaningful only after ~8-12 weekly snapshots exist.

## 4. Not before Nov 15 (the explicit no-list)

No code, entities, or `mj-app.json` dependencies in bizapps-fpna; no production write-back onto
Orders' Subscriptions without the Orders owner's consent (write-back generates Record Changes at
scoring volume on an entity Orders owns); "The FP&A Test" intact — FP&A owns zero transactional
state, the score lives on Orders' record and PS's run history.

## 5. Observations for the FP&A owner (informational, not actions)

- README lists `bizapps-contracts`/`bizapps-tasks` as dependencies; `mj-app.json` declares
  neither (drift). README badge says MJ 5.40+, manifest says `>=6.1.0-edge.3`.
- No `.github/` at all — no build/test/distribution gate on a penny-correctness app; the
  `protect-next` ruleset guards only deletion/force-push. bizapps-sales' `ci.yml` +
  `distribution-gate.yml` are the closest port (pnpm repo).
- The hard-coded 8% commission rate in `FPNAEngine.emitCommissions` is the one business rule not
  driven by `AssumptionSet` data.
