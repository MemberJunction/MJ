# U2 — Vocabulary & Template Reconciliation Packet (for user sign-off)

**Input:** 58 model sheets (16 families, all lint-clean) + 13 independent Sonnet reviews
(different model than producers). Reviewers found **~15 confirmed errors — all mechanical
content fixes, zero structural/template-shape failures.** The frozen template (U1) held.

This packet asks you to ratify: **(A)** the port-vocabulary changes, **(B)** the template
amendments, **(C)** the two task-union rulings, and greenlights **(D)** the confirmed-error
fix pass. My coordinator recommendation is marked ▶ on each; change any you disagree with.

---

## A. Port vocabulary — SAME / ADAPTER-RELATED / DISTINCT / NEW

The reviewers gave clean verdicts by testing wiring consequences (the Doc-2 §3 method).

**A1 — Confirmed DISTINCT (must be separate ports; punning enables illegal wiring):**
| pair | verdict | evidence |
|---|---|---|
| `dynamics-matrix` (VAR lag/companion) vs `transition-matrix` (Markov) | ▶ **NEW port `dynamics-matrix`** | row-stochastic vs unconstrained real operator; steady-state eigenvector calc silently misfires on a companion matrix |
| `topic-word-dists` (K×vocab) vs `topic-mixture` (N×K) | ▶ **NEW port `topic-word-dists`** | `consumes[]` has no granularity field → a `topic-mixture` consumer can't disambiguate; same latent issue in als `embedding` |

**A2 — Confirmed ADAPTER-RELATED (keep distinct types + a declared lossy adapter):**
| pair | verdict | note |
|---|---|---|
| `transactions` (unordered baskets) vs `event-log` (timestamped) | ▶ **NEW port `transactions`** + `event-log→transactions` groupby-collapse adapter (lossy) | **study-wide**: association_rules AND the 3 CLV sheets all conflated these |

**A3 — New ports proposed by families (my recommendation each):**
| proposal | raised by | ▶ recommendation |
|---|---|---|
| `predictive-distribution` (per-row mean+std) | gp | **ADD** — native uncertainty is GP's whole point; regression σ is real signal |
| `centroids` (per-model) | kmeans | **KEEP as paramsAsOutput** — not wired anywhere; a param-block, not a port |
| `linkage-tree` / dendrogram | hierarchical | **KEEP as paramsAsOutput** (add enum value) — not a wireable data product |
| `ranked-list` (variable-length top-N) | implicit_als | **ADD** — recommendations genuinely aren't per-row `score`; lossy to flatten |
| `feature-mask` (lasso zero-pattern) | lasso | **KEEP** — derivable from `coefficients`; not a distinct product |
| `quantile-band` (multi-quantile intervals) | quantile | **ADD** — interval output has no home; forecasting intervals want it too |
| `series-components` (trend/seasonal/holiday) | prophet | **KEEP as paramsAsOutput** for now — decomposition is a param-block |
| `rfm-summary` (event-log→RFM) | CLV, km-adjacent | **land as specialized `features:tabular`** + the RFM featurizer is its own Transformation component (Doc-2 placement) |
| CLV monetary distinct port | gamma_gamma | **KEEP `score`** — plain regression output |

**Net if you approve ▶: +4 new port types** (`dynamics-matrix`, `topic-word-dists`,
`transactions`, `predictive-distribution`, `ranked-list`, `quantile-band` = actually **+6**),
**+1 adapter** (`event-log→transactions`). Updates `ALL_PORT_TYPES` (23→29) + `metadata/ml-port-types/`.

---

## B. Template amendments (the frozen shape needs these fields — all additive)

| # | amendment | driven by | ▶ |
|---|---|---|---|
| B1 | **`paramsAsOutput` enum: add plain `coefficients` (no SE)** | linear-glm (5 families forced to mis-use `coefficients+SE`) — HIGH | ADD |
| B2 | **`consumes[].granularity`** field (per-row / per-model) | reco/pattern DISTINCT argument — without it, ports can't disambiguate | ADD |
| B3 | **`placementClaims[].harmDimension`** (fit / interpretability / missingness-signal); relax lint rule 3 to forbid only `required` under scaleSensitive:false, allow `harmful` | tree-ensembles (T-1), sequence-state (Kalman) | ADD |
| B4 | **`dataSizeTolerance` controlled vocab** {tiny-ok, small-friendly, medium, needs-many, needs-history} | scorecard/rsf/arima free-text divergence (T-2) | ADD |
| B5 | **`trained-model` port gets sanctioned `dataShape:'n/a'`** (model-reference ports) | gamma_gamma consumes a fitted model | ADD |
| B6 | **kill undeclared keys** (`note`/`learningTypeNote`/`axes.note`) → sanctioned `axes.notes?` + per-field `note?` | forecasting/scorecard template drift (T-3) | ADD |
| B7 | **`interpretabilityClass`: add `Structure`** (dendrograms/state-machines) — OPTIONAL | clustering, hierarchical | **DEFER to U3** (taxonomy, not vocab) |

---

## C. Task-union — both questions RESOLVE WITHOUT a migration change

The 10-value Task union (and its Doc-1 migration CHECK) **stays as-is**. Two open questions, both resolved by reviewers:

- **ordinal** → ▶ **`classification`** (glm-counts reviewer): ports shape-identical to multiclass; order-awareness lives in nodeQualia (`ranked_probability_score`). No new task.
- **CLV** → ▶ **a composition, not a task** (clv-btyd reviewer): CLV is a property of the `clv-composite` **template** (mirrors the leaderboard-floor precedent), not any model's `axes.task`. BG/NBD & Pareto/NBD keep `regression`+`survival` secondary; gamma_gamma is plain `regression`. **No task-union value, no migration CHECK change.**

*(This is the biggest de-risk in the packet: the study does NOT force a Doc-1 schema change.)*

---

## D. Confirmed-error fix pass (greenlight to apply — all mechanical)

~15 content fixes, none structural. Representative (full list in `study/reviews/*.review.md`):

| family | fix |
|---|---|
| tree-ensembles | random_forest `n_estimators` 200→**100**; extra_trees NaN routing "learned"→**"random"** |
| gradient-boosting | catboost: drop "ordered boosting" as *defining* mechanism (CPU default `Plain`); mark `bagging_temperature` inert under MVS default |
| glm-counts | zero_inflated: pi = **1 − predict('prob-main')** (was inverted); tweedie: resolve eql-vs-series contradiction |
| classic-supervised | gp `deterministicFit` true→**false** (n_restarts>0, no seed) |
| clustering | gmm: add Hopkins-class featureStat + k=1 in search; `n_init` 5→**1** |
| baselines | dummy_classifier `predict_proba` note → per-strategy (most_frequent/prior/uniform/stratified differ) |
| recommendation | implicit_als `parametric` Semi→**Yes** |
| sequence-state | markov_switching: add filtered channel + as-of-leakage edgeCase |
| forecasting | arima gold sheet: add seasonal P/D/Q to hpMeta, fix `conditionalOn` |
| scorecard | add zero-variance-factor edgeCase |

---

## What I need from you (U2 sign-off)

1. **Ratify Section A** — the +6 new ports / +1 adapter (or trim the list).
2. **Ratify Section B** — the 6 template amendments B1–B6 (B7 deferred).
3. **Confirm Section C** — ordinal=classification, CLV=composition, **no migration change**.
4. **Greenlight Section D** — apply the ~15 mechanical fixes.

On approval I: apply the fixes, amend the template + re-lint all 58, update `ALL_PORT_TYPES`
+ `metadata/ml-port-types` + adapters, then move to **U3** (the tree/partition — property
matrix, containment, `tree-check.mjs`). Say **"approve U2"** (or mark changes).
