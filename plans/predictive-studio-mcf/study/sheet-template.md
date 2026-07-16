# Spec-Sheet Template (Doc 2 §1) — the frozen shape every model sheet fills

Each model in the catalog gets one `study/sheets/<family>/<modelKey>.sheet.json`. The
sheet is the authoritative, lint-checked source that Doc 1's catalog metadata,
Doc 3's driver, and Doc 4's tree/vocabulary are all derived from. **U1 freezes this
template** (proven across the 3 shape regimes by the gold sheets: xgboost /
cox_ph / arima) before the 16-family fan-out.

## Sections (JSON keys)

- **identity** — `modelKey` (future sidecar `_REGISTRY` key), `family`, `libraryClass`
  (e.g. `xgboost.XGBClassifier`), `aliases[]`, `displayName`, `description`.
- **axes** — the 6 taxonomy axes that CodeGen'd into `MJ: ML Components`:
  `task` (10-value union), `learningType` (Supervised|Unsupervised|Temporal),
  `parametric` (Yes|No|Semi), `ensembleType` (None|Single|Bagging|Boosting|Stacking),
  `interpretabilityClass` (Coefficients|Rules|ImportanceOnly|BlackBox),
  `dataShape` (Tabular|Sequence|EventLog|InteractionMatrix|Any). Plus `deterministicFit` (bool).
- **consumes[]** — each: `portType`, `dataShape` (row-matrix|series|event-sequence|
  transactions|interactions), `dtypes[]`, `targetSpec` (plain|duration+event|series|
  treatment+outcome|none), `required` (bool). The composition INPUT contract.
- **emits[]** — each: `portType`, `granularity` (per-row|per-series|per-model|per-group),
  `paramsAsOutput` (coefficients+SE|transition-matrix|centroids|loadings|survival-curve|
  components|rules|topic-dists|latent-factors|none), `probabilistic` (native|via-calibration|none).
- **learnsVsFixed** — `learns` (bool), `reusability` (trainable|reusable-only|both).
- **hyperparameters** — `@file:` ref to the JSON-Schema; per-param `{default, prior,
  searchable, conditionalOn?}` in `hpMeta`.
- **invariances** — each flag carries a `basis` (`mechanism-derived` | `empirical`) —
  the epistemic move that keeps coincidental nesting out of the tree:
  `scaleSensitive`, `nativeNaN`, `nativeCategorical`, `distributionalAssumption`,
  `dataSizeTolerance`, `monotoneTransformInvariant`, `extrapolates`.
- **nodeQualia** — `featureStats[]` + `modelMetrics[]`, EACH with a one-sentence
  `why` tied to the model's math (missing `why` = lint failure). These are the lenses
  the Statistician (Doc 5) computes for THIS family.
- **edgeCases[]** — each: `condition`, `behavior`, `mitigation` (gate|bank-entry|reject-input).
- **driver** — `constructor`, `deps[]`, `wrapperNeeds`, `serialization`
  (joblib|xgboost-json|lightgbm-text|prophet-json|catboost-cbm), `threadSafety`, `tranche`.
- **canBeSeeds[]** — `{template, slot}` fills this model affords (⊆ emits∪consumes).
- **placementClaims[]** — per preprocessing position `{position (impute|transform|scale|
  encode), verdict (required|beneficial|irrelevant|harmful), why}`.

## U2 amendments (2026-07-16 — ratified; additive to the frozen shape)

- **B1** `emits[].paramsAsOutput` enum gains **`coefficients`** (plain point estimates,
  no SE) alongside `coefficients+SE`. sklearn-backed models emit the former.
- **B2** `consumes[]` gains a **`granularity`** field (per-row | per-model) — required
  where a port could carry either a per-row or per-model shape (topic-mixture vs
  topic-word-dists, embedding user-vs-item factors). Disambiguates wiring.
- **B3** `placementClaims[]` gains **`harmDimension`** (fit | interpretability |
  missingness-signal). Lint rule 3 relaxed: forbids only `required` under
  `scaleSensitive:false`; `harmful` is legal when `harmDimension` ≠ fit.
- **B4** `invariances` `dataSizeTolerance.value` ∈ controlled vocab
  **{tiny-ok, small-friendly, medium, needs-many, needs-history}**.
- **B5** model-reference ports (`trained-model`) carry sanctioned **`dataShape: "n/a"`**.
- **B6** No undeclared top-level keys. Free-text nuance goes in a sanctioned
  **`axes.notes?`** or a per-field **`note?`**. (Kills `note`/`learningTypeNote` drift.)
- **B7 (deferred to U3)** possible 5th `interpretabilityClass` value `Structure`
  (dendrograms/state-machines) — decided with the partition.

**New port types (U2):** `dynamics-matrix`, `topic-word-dists`, `transactions`,
`predictive-distribution`, `ranked-list`, `quantile-band` (ALL_PORT_TYPES → 29).
**New adapter:** `event-log → transactions` (lossy groupby-collapse).

## Embedded lint (enforced by `sheet-lint.mjs`, Doc 2 exit gate)

1. every `nodeQualia` entry has a non-empty `why`
2. `canBeSeeds[].portType` ⊆ (`emits[].portType` ∪ `consumes[].portType`)
3. `placementClaims` may not contradict `invariances`: `scaleSensitive:false` ⇒ scale
   placement is never `required` (but MAY be `harmful` with `harmDimension`≠fit, per B3)
4. every `axes.task` ∈ ALL_TASKS; every `portType` ∈ ALL_PORT_TYPES (29, post-U2)
5. `targetSpec` ∈ the enum; `learns:false` ⇒ `reusability` includes `reusable-only`
6. `dataSizeTolerance.value` ∈ the B4 controlled vocab (warn-only during migration)

## Gold sheets (the U1 evidence — one per shape regime)
- `gradient-boosting/xgboost.sheet.json` — Tabular / Supervised / plain target
- `survival/cox_ph.sheet.json` — Tabular / Semiparametric / **duration+event** target
- `forecasting/arima.sheet.json` — **Series** / Temporal / **series** target
