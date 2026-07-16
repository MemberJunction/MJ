# Study Arbitration Log (decisions.md)

Coordinator rulings + flagged items for the U2 (vocabulary) / U3 (partition) / U4
(placements) checkpoints. Rulings require a citable source; unresolvable philosophy
is escalated to the named checkpoint.

## Template-level findings (candidates to amend the frozen template — U2/U4)

| # | Raised by | Finding | Provisional ruling | Escalate to |
|---|-----------|---------|--------------------|-------------|
| T-1 | tree-ensembles/decision_tree | Lint rule 3 forbids placement `harmful` when `scaleSensitive:false`, but scaling a tree's inputs harms RULE READABILITY (interpretability), not the fit. Producer downgraded to `irrelevant` + preserved the harm in `why`. | Rule 3 is too strict: it should forbid `required` under `scaleSensitive:false`, but ALLOW `harmful` when the harm is to interpretability/another axis, not fit. Add a `harmDimension` (fit|interpretability|missingness-signal) to placementClaims. | U4 (template amend) |
| T-2 | scorecard, xgboost(gold) | `dataSizeTolerance` free-text values diverge ("medium-to-large", "any-including-zero", "small-friendly"). | Convert to a controlled vocabulary: {tiny-ok, small-friendly, medium, needs-many, needs-history}. | U2 |
| T-3 | scorecard | extra key `learningTypeNote` added outside the template. | Reject extra keys; fold the nuance into `description` or a sanctioned `axes.notes` field (add `notes?` to axes). | U2 |
| T-4 | baselines | `consumes.dtypes:["any"]` — "any" is not an enumerated dtype. | Add "any" to the dtype vocabulary (legitimate for X-ignoring models). | U2 |
| T-5 | baselines | No template slot for "leaderboard floor" — dummies have empty canBeSeeds but ARE the floor every model is compared against. | The floor is an orchestration/strategist concern, not a composition slot — canBeSeeds:[] is correct. No template change. | resolved |

## Per-family review outcomes
(populated as reviews land: Confirmed errors get a ruling; Judgment calls get escalated; Reviewer errors are discarded)

## Port-vocabulary proposals (U2 reconciliation queue)
| proposal | raised by | current workaround | note |
|----------|-----------|--------------------|------|
| `loadings` port (per-model factor loadings, distinct shape from per-row `coefficients`) | pca | rides `coefficients` w/ paramsAsOutput:"loadings" | consider if U2 splits parameter blocks by shape |
| ranked-list / `recommendations` port | (implicit_als, pending) | rides `score` per user-item | TBD when reco family lands |

## Additional port/vocabulary proposals from later families
| proposal | raised by | note |
|----------|-----------|------|
| bare `duration-event` target port (covariate-free survival input) | km | no ALL_PORT_TYPES member carries a bare (duration,event) pair; km fallback documents features:tabular. U2 decide: new port vs keep as targetSpec-only |
| `dataSizeTolerance` values "data-hungry","any-including-zero","needs-history" | rsf/scorecard/arima | → controlled vocab (see T-2) |
| single sheet, two libraryClasses (LogNormalAFTFitter | LogLogisticAFTFitter) | aft | template convention is one class per sheet; allow a distribution HP dispatch — U2 note |

## Port proposals from classic-supervised + clustering (U2 queue, growing)
| proposal | raised by | today's workaround |
|----------|-----------|--------------------|
| `predictive-distribution` (per-row mean+std) | gp | rides `score` (drops native σ) |
| `centroids` (per-model) | kmeans | paramsAsOutput:"centroids" on cluster-id |
| `linkage-tree` / dendrogram | hierarchical | paramsAsOutput:"none" (no port/enum) |
| relax "scale REQUIRED for distance-based" for affine-equivariant EM | gmm | scaleSensitive basis empirical + placement beneficial |
| paramsAsOutput enum lacks `centroids`-without-SE, `linkage`, `predictive-dist` | multiple | U2: widen paramsAsOutput enum |

## Port proposals — linear-glm / reco / pattern / forecasting (U2 queue)
| proposal | raised by |
|----------|-----------|
| **paramsAsOutput enum needs plain `coefficients` (no SE)** — RECURRING across logistic/ridge/lasso/elastic_net/theta | many — HIGH priority U2 |
| `feature-mask` (lasso zero-pattern as selection mask) | lasso |
| `ranked-list` (variable-length top-N (item,score)) | implicit_als |
| `transactions` port (unordered baskets vs ordered event-log) — likely ADAPTER-RELATED not SAME | association_rules |
| `topic-word-dists` (K×vocab) distinct from per-row `topic-mixture` | lda |
| `series-components` (trend/seasonal/holiday decomposition) | prophet |
| fit-only/no-scoring /predict mode | association_rules (defining wrapper need) |

## glm-counts findings (U2/U3)
| item | raised by | escalate |
|------|-----------|----------|
| NO `ordinal` task in ALL_TASKS — ordinal mapped to `classification` w/ order-evidence qualia + RPS | ordinal | U3: is ordinal a distinct task or a classification facet? (leaning facet) |
| `quantile-band` port (multi-quantile intervals) | quantile | U2 |
| zero-inflated pi (latent-regime prob) riding `probability` — borderline | zero_inflated | U2: distinct port or note? |

## clv-btyd — the deepest findings (U3-level: is the 10-task union complete?)
| item | raised by | escalate |
|------|-----------|----------|
| **`taskProposal: clv`** — BG/NBD, Pareto/NBD, Gamma-Gamma have NO honest home in ALL_TASKS (used regression+survival as least-wrong) | all 3 CLV | **U3: is CLV a distinct task, or regression+survival composed? (touches the 10-task union — a Doc-1 migration CHECK change if adopted)** |
| `rfm-summary` port + the event-log→RFM featurizer is a REQUIRED upstream transformation component | all 3 CLV | U2 + Doc-2 placement (the featurizer is its own component) |
| **model-reference ports have no `dataShape`** (gamma_gamma consumes bg_nbd's fitted MODEL via `trained-model`) — template gap | gamma_gamma | U2: `trained-model` port needs dataShape 'n/a' sanctioned |
| `trained-model` emission implicit-vs-declared across ALL fitters | all | U2 convention: do all trainable models implicitly emit trained-model? |
| CLV monetary output rides generic `score` — may want distinct port | gamma_gamma | U2 |

## sequence-state findings (U2)
| item | raised by | note |
|------|-----------|------|
| `series:multi`/`panel` port OR arity-K binding rule (VAR needs aligned K-variate bundle) | var | `series` is singular; interim wide-frame convention declared |
| **`dynamics-matrix` MUST stay DISTINCT from `transition-matrix`** (companion/VAR-lag ≠ row-stochastic Markov) — a real SAME-looking-but-DISTINCT catch | var | U2 DISTINCT verdict candidate; ships in `coefficients` until then |
| custom-driver libraryClass (no canonical sklearn class) for markov_chain/kalman_dlm | markov_chain, kalman_dlm | driver convention: custom numpy/statsmodels-subclass permitted |
| nativeNaN TRUE ⇒ impute HARMFUL for state-space (Kalman exact gap handling) | kalman_dlm, structural_ts | mirrors the T-1 "harmful" placement finding — reinforces harmDimension proposal |

---
## U2 RATIFIED + APPLIED (2026-07-16)
- **Ports 23→29**: +dynamics-matrix, +topic-word-dists, +transactions, +predictive-distribution, +ranked-list, +quantile-band (port-types.ts + metadata/ml-port-types). +1 adapter (event-log→transactions). Core tests 49/49 green.
- **Template amended B1–B6** (paramsAsOutput plain coefficients; consumes.granularity; placement harmDimension; dataSizeTolerance vocab; trained-model dataShape n/a; no undeclared keys). B7 (interpretabilityClass 'Structure') → U3.
- **Task-union UNCHANGED**: ordinal=classification; CLV=composition (clv-composite template), not a task → NO Doc-1 migration change.
- **~15 confirmed-error fixes applied** across 12 sheets (RF 200→100, gp determinism, gmm n_init, implicit_als parametric, zero_inflated pi, arima seasonal P/D/Q, catboost, dummy proba note, markov_switching filtered channel, scorecard zero-variance, extra_trees NaN routing).
- **Re-lint: 58/58 CLEAN** against the post-U2 vocabulary. km normalized to sanctioned duration+event input.
- Next: **U3** — property matrix + containment + tree(s) + tree-check.mjs (the permanent soundness gate).

## U3 RATIFIED (2026-07-16)
- **Tree**: estimator-mechanism, 5 nodes (split-based 8 / weighted-sum 18 / distance-kernel 8 / probabilistic-generative 11 / recurrence-temporal 10), 55 placed, tree-check 0 violations, stability PASS (5 held-out).
- **Non-mechanistic facet**: dummy_classifier, dummy_regressor, association_rules (don't learn a mechanism → facet, not leaf).
- **B7 APPROVED**: interpretabilityClass gains 'Structure' (dendrograms/state-machines) — migration CHECK updated (pre-ship).
- **tree-check.mjs = permanent CI gate** (gates every future insertion).
- Node-inherited banks recorded → Doc-4 bank seed.

## U4 RATIFIED — STUDY COMPLETE (2026-07-16)
- 38 ideas bucketed (BANK-ENTRY 9 / FACET-GATE 9 / COMPONENT 10 / UI-SURFACE 5 / REJECTED 5).
- C1 as-of aggregates → TS row-reducer (SQL later). C2 SHAP → optional-extras. C3 momentum → Transformation component.
- 3 validation-forced gates locked (label-linked compose evidence / metric-not-weighting / mask-linear-distance-only).
- Study outputs → seed diffs amending Doc-1 catalog (10→58 + placement COMPONENTs).
