# U3 — The Partition (tree + facets) for sign-off

**Input:** the 58-model property matrix (`matrix.json`, post-U2). **Method:** containment
(a property is hierarchy-eligible only if it *nests* AND is *mechanism-derived*), a candidate
mechanism tree, `tree-check.mjs` (every node assertion true of every descendant), and a
stability test (5 held-out plausible models). **Result:** one clean tree, `tree-check` **PASS**.

## The tree — estimator-mechanism (5 nodes, `tree.json`)

Each node carries an **inherited assertion** — one hard, mechanism-derived claim that
`tree-check` verifies against the matrix for every member (0 violations).

| node | inherited assertion (checked) | n | members |
|---|---|---|---|
| **split-based** | partitions by threshold comparisons ⇒ **scale-insensitive** | 8 | decision_tree, random_forest, extra_trees, xgboost, lightgbm, catboost, isolation_forest, rsf |
| **weighted-sum** | (link-transformed) linear/additive combo ⇒ scale-sensitive, coefficient-interpretable | 18 | logistic/ridge/lasso/elastic_net/ols/multinomial_logit, poisson/neg_binomial/quantile/tweedie/zero_inflated/ordinal/gam, cox_ph/weibull_aft/aft, rubric_scorecard, mlp |
| **distance-kernel** | decisions from geometric distance/similarity ⇒ scale-sensitive | 8 | knn, svm, kmeans, dbscan, hierarchical, pca, umap, gp |
| **probabilistic-generative** | fits a likelihood/density, infers latent structure ⇒ distributional assumption | 11 | naive_bayes, gmm, hmm, lda, bg_nbd, pareto_nbd, gamma_gamma, markov_switching, kalman_dlm, structural_ts, km |
| **recurrence-temporal** | value as a function of its own past / time ⇒ temporal or sequence/interaction shape | 10 | markov_chain, var, arima, ets, theta, croston, seasonal_naive, sma, implicit_als, prophet |

**55 placed, 0 tree-check violations.** `node tree-check.mjs` → PASS (runs in CI forever;
gates every future insertion, incl. agent-authored primitives).

## The honest residual — a real finding

**3 models do NOT fit a mechanism node**, because they don't *learn a mechanism*:
`dummy_classifier`, `dummy_regressor` (constant predictors — the leaderboard floor) and
`association_rules` (exhaustive co-occurrence counting, no fitted estimator). Per the plan's
design (**tree owns mechanism; facets own the rest**) they are handled by a
**non-mechanistic facet**, not forced into a leaf. This is the tree/facet boundary working
as intended — not a gap.

## Facets (orthogonal to the tree — the properties that DON'T nest)

Properties that are real but **empirical-basis or non-nesting**, so they stay facets rather
than tree nodes (the epistemic guard against coincidental hierarchy):
- `task` (10-value) — orthogonal to mechanism (a split-based model can be classification OR regression OR survival)
- `nativeNaN`, `nativeCategorical` — empirical/version-gated (sklearn version), never mechanism-hierarchical
- `interpretabilityClass` — cross-cuts mechanism; **U3 decision needed on B7** (add a 5th `Structure` value for dendrograms/state-machines? ▶ recommend **yes**)
- `deterministicFit`, `dataSizeTolerance`, `learnsVsFixed` — per-model facets
- `reusability` (trainable / reusable-only / both) — the reusable≠trainable axis

## Stability (the tree isn't overfit to today's 58)

5 held-out plausible models placed with **0 node-claim violations**: hdbscan→distance-kernel,
sarimax→recurrence-temporal, quantile_gbm→split-based, x_learner→weighted-sum,
softmax_reg→weighted-sum. The tree absorbs new models by mechanism without edits.

## Node-inherited banks (what each node gives its leaves — feeds Doc 4)

The tree's payoff: **wisdom inherited by mechanism.** Each node seeds preprocessing/gate
priors its descendants share (the Doc-4 bank seed):
- split-based → scale bank **empty** (scale-invariant); impute **native/skip**; encode **required**
- weighted-sum → scale **standardize (required)**; impute **required**; VIF/collinearity gate
- distance-kernel → scale **standardize (required)**; PCA-whiten option; n-gate (GP: n<10k)
- probabilistic-generative → distributional-fit checks; label-switching gate (mixtures)
- recurrence-temporal → **time-ordered holdout (required)**; stationarity/seasonality gates; MASE floor

## What I need from you (U3 sign-off)

1. **Ratify the 5-node mechanism tree** (or propose a different partition).
2. **Confirm the non-mechanistic facet** for dummies + association_rules (vs forcing a 6th node).
3. **Decide B7** — add `interpretabilityClass: Structure`? (▶ yes)
4. Greenlight `tree-check.mjs` as a **permanent CI gate**.

On approval → **U4** (place every accumulated idea into BANK-ENTRY / FACET-GATE / COMPONENT /
UI-SURFACE / REJECTED buckets — the last study checkpoint), then the study's seed diffs amend
the Doc-1 catalog and we're into Doc 3/4 build. Say **"approve U3"** (or mark changes).
