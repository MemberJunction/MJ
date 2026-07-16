# Doc 2 Fan-Out Plan — the 16 family batches (PREPARED, NOT EXECUTED)

**Status: ready to run the moment U1 (template freeze) is given. Nothing here has been executed.**

## The roster — 16 family batches, 55 remaining sheets (3 gold done)

| # | Family | Models (sheet keys) | Count | Tranche |
|---|--------|--------------------|-------|---------|
| 1 | gradient-boosting | ~~xgboost~~✅, lightgbm, catboost | 2 | T0/T1 |
| 2 | tree-ensembles | random_forest, extra_trees, decision_tree | 3 | T0/T1 |
| 3 | linear-glm | logistic_regression, ridge, lasso, elastic_net, ols, multinomial_logit | 6 | T0/T1/T2 |
| 4 | glm-counts | poisson, neg_binomial, quantile, tweedie, zero_inflated, ordinal, gam | 7 | T2 |
| 5 | classic-supervised | knn, svm, naive_bayes, gp, mlp | 5 | T1 |
| 6 | baselines | dummy_classifier, dummy_regressor | 2 | T1 |
| 7 | clustering | kmeans, dbscan, gmm, hierarchical | 4 | T3 |
| 8 | dim-reduction | pca, umap | 2 | T3 |
| 9 | anomaly | isolation_forest | 1 | T3 |
| 10 | survival | ~~cox_ph~~✅, km, weibull_aft, aft, rsf | 4 | T4 |
| 11 | forecasting | ~~arima~~✅, ets, prophet, theta, croston, seasonal_naive, sma | 6 | T5 |
| 12 | sequence-state | markov_chain, hmm, markov_switching, kalman_dlm, structural_ts, var | 6 | T6 |
| 13 | clv-btyd | bg_nbd, pareto_nbd, gamma_gamma | 3 | T7 |
| 14 | recommendation | implicit_als | 1 | T7 |
| 15 | pattern-mining | association_rules, lda | 2 | T7 |
| 16 | scorecard | rubric_weighted_scorecard (the Sonar 58th) | 1 | T1 |

Total: 55 to produce + 3 gold = **58** (the locked catalog).

## Per-batch protocol (Doc 2 §2, verbatim discipline)

1. **Producer agent** per family. Context given: `sheet-template.md` + ONE gold exemplar
   (matched by shape regime: tabular→xgboost, survival/duration→cox_ph, series→arima) +
   a one-page ontology primer + library-doc extracts for that family. **Producers never
   see other families' sheets** (independence makes reconciliation informative).
2. **Mechanical lint** (`sheet-lint` — 6 rules, reference implementation proven on the
   gold sheets) on every produced sheet before review.
3. **Family reviewer** on a DIFFERENT model than the producer: builds its own expected
   inventory from library docs FIRST, then opens the sheets. Output = three sections:
   Confirmed errors / Judgment calls / Reviewer errors. One round.
4. **Arbitration**: coordinator rules only with citable sources; unresolvable philosophy
   goes on the U2 agenda; every ruling logged in `study/decisions.md`.

## Producer brief (the prompt, ready to instantiate per family)

> You are producing spec sheets for the `<FAMILY>` family of the PS Model Component
> Framework catalog. Fill `sheet-template.md`'s JSON shape EXACTLY for each model:
> `<MODEL LIST>`. Use the attached gold exemplar (`<EXEMPLAR>`) as the calibration for
> depth and tone. Rules: every invariance carries a `basis` (mechanism-derived —
> provable from the algorithm's math — or empirical); every nodeQualia stat carries a
> one-sentence `why` tied to the model's math; placementClaims may not contradict
> invariances; ports are named for DATA SHAPE never algorithm; targetSpec from the
> 5-value enum; do not invent hyperparameters — read the library's documentation.
> Where the library documents an edge case, record it with a mitigation
> (gate | bank-entry | reject-input). Output one `.sheet.json` per model, nothing else.

## Reviewer brief (ready to instantiate per family)

> You are the independent reviewer for the `<FAMILY>` sheets. FIRST, from the library
> documentation alone, write your own expected inventory: the models' real constructor
> params, native-NaN/categorical behavior, scale sensitivity (from mechanism),
> emissions (what the fitted object actually exposes), and known edge cases. ONLY THEN
> open the produced sheets and compare. Report exactly three sections: (1) Confirmed
> errors — sheet says X, docs/mechanism say Y, citation; (2) Judgment calls — defensible
> either way, state both; (3) Reviewer errors — where your own inventory was wrong.
> Do not rewrite sheets; report.

## Checkpoints after fan-out (definitions, so they're ready)

- **U2 — vocabulary sign-off**: after cross-model reconciliation (harvest port strings →
  cluster → SAME/ADAPTER-RELATED/DISTINCT by wiring consequences both directions →
  adapter closure). Deliverable: `vocabulary.md` + mechanical rename diff + the
  seeded-port-types amendment diff. User approves the port vocabulary + adapter set.
- **U3 — partition sign-off**: after `matrix.json` (58 × invariances/axes) +
  `containment.mjs` (nests AND mechanism-derived = hierarchy-eligible) + stability test
  (5 held-out plausible models: hdbscan, sarimax, quantile-gbm, x-learner, softmax-reg —
  zero node-claim violations). User approves the tree(s) + facet list.
- **U4 — contested placements**: after every accumulated idea is bucketed
  (BANK-ENTRY | FACET/GATE | COMPONENT | UI-SURFACE | REJECTED-with-reason). User rules
  on the contested bucket list. Two placements already evidence-forced by validation:
  composition demand-gate requires LABEL-LINKED structure evidence (RD-COMPOSE);
  imbalance gate's load-bearing element is the PR-AUC/lift metric, not class-weighting
  (RD-MICRO).

## Execution estimate (when green-lit)
16 producer runs + 16 reviewer runs + arbitration ≈ 32 agent tasks, parallelizable ~4–6
at a time; reconciliation + matrix/containment are single passes after. All output is
in-repo markdown/JSON — no DB, no code, no LLM keys beyond the agent runtime itself.
