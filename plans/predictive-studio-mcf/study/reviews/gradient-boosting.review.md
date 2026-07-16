# Independent Review — `gradient-boosting` family (lightgbm, catboost)

Reviewer built an expected inventory from library-documentation knowledge first (constructor
defaults, native-NaN/native-categorical mechanisms, scale sensitivity, fitted-object outputs,
serialization formats, documented edge cases for `LGBMClassifier`/`LGBMRegressor` and
`CatBoostClassifier`/`CatBoostRegressor`), then opened `sheet-template.md` and the two sheets to
compare. No sheet content was consulted before the inventory was written. Where the inventory
carried genuine uncertainty (CatBoost `bootstrap_type`/`one_hot_max_size` defaults), that
uncertainty is disclosed and was resolved in-session against the official CatBoost docs
(`catboost.ai/docs/en/references/training-parameters/common` and `.../quantization`) and the
official LightGBM API docs (`lightgbm.readthedocs.io`) before writing findings — see Reviewer
errors for what my unaided memory got wrong.

## Confirmed errors

**1. `catboost.sheet.json` — the headline `identity.description` overstates "ordered boosting" as
CatBoost's standing/default mechanism; on CPU the default `boosting_type` is `Plain`, not
`Ordered`.**
The description reads: *"Gradient-boosted ensemble of symmetric (oblivious) trees with **ordered
boosting** and ordered target statistics — its distinguishing mechanism..."* This conflates two
distinct "ordered" mechanisms that the sheet does not separate:
- **Ordered target statistics** (categorical encoding via permutation-based target stats) — this
  IS always-on regardless of `boosting_type`, and the sheet's `invariances[].nativeCategorical`
  entry correctly describes it.
- **Ordered boosting mode** (`boosting_type='Ordered'` vs `'Plain'`) — a *separate* knob governing
  how gradient/leaf estimates are computed to counter prediction shift. Per the official CatBoost
  docs, **CPU defaults to `Plain`**; `Ordered` is only auto-selected on GPU for small (≤50,000
  row) non-MultiClass datasets, and must be requested explicitly on CPU.
Since `CatBoostClassifier`/`CatBoostRegressor` default to `task_type='CPU'`, the model most users
instantiate from this sheet's own `driver.constructor` does **not** use ordered boosting by
default — yet the sheet presents it as *the* distinguishing mechanism without qualification, and
`hpMeta` has no `boosting_type` entry at all to surface the CPU-default-is-Plain fact. This is a
mechanism-accuracy error in the sheet's own headline claim, not a matter of phrasing.

**2. `catboost.sheet.json` — `hpMeta.bagging_temperature` is presented as an active default
(`1.0`) with no note that it is inert under CatBoost's actual default `bootstrap_type`.**
`bagging_temperature` only has any effect when `bootstrap_type='Bayesian'`. Per the official
CatBoost docs, the default `bootstrap_type` for CPU classification/regression
(`sampling_unit=Object`, non-MultiClass) is **`MVS`** (Minimum Variance Sampling, with an implicit
`subsample=0.8`) — **not** `Bayesian`. So out of the box, the `bagging_temperature=1.0` the sheet
lists has zero effect on training, and the model is already doing MVS-based row subsampling by
default, which the sheet never mentions anywhere (no `hpMeta.bootstrap_type` entry, no
`edgeCases[]` entry, no `invariances`/`nodeQualia` reference). This is the *exact* same class of
"parameter silently inactive under the real default" trap that the sibling `lightgbm.sheet.json`
correctly caught and flagged **twice** — once as an `hpMeta.subsample.note`
("silently inactive unless subsample_freq > 0") and once as a dedicated `edgeCases[]` entry
("subsample < 1.0 with subsample_freq = 0 → row bagging silently disabled"). The CatBoost sheet
has no analogous note or edge case, despite the CatBoost trap arguably being more consequential
(the actual default sampler, MVS, is entirely unmentioned, not merely dormant).

Both errors share a root cause: the sheet is careful to scope CPU-vs-GPU where it remembered to
(`border_count.note`: *"CPU default; numeric-feature quantization borders"*;
`one_hot_max_size.note`: *"CPU default; categories at or below this cardinality use one-hot..."*)
— both of which I verified as correct (`border_count` CPU=254/GPU=128, `one_hot_max_size`
default=2 for the standard non-GPU/non-ranking case) — but missed the same CPU/GPU and
Plain/Ordered, Bayesian/MVS distinction for `boosting_type` and `bootstrap_type`, the two params
that back the sheet's own headline "ordered boosting" claim.

**Most important: #1** — it is a factual error in the sheet's own top-line description of what
the model *is*, not a missing footnote on a secondary hyperparameter. A reader taking the
`identity.description` at face value would believe every default CatBoost fit uses ordered
boosting; on CPU (the library's own default `task_type`) it does not.

All other checked facts came back correct: LightGBM's full `hpMeta` block
(`n_estimators=100, num_leaves=31, learning_rate=0.1, max_depth=-1, min_child_samples=20,
subsample=1.0, subsample_freq=0, colsample_bytree=1.0, reg_alpha=0.0, reg_lambda=0.0`) matches the
official `LGBMClassifier`/`LGBMRegressor` API docs exactly; CatBoost's `iterations=1000,
depth=6, l2_leaf_reg=3.0, random_strength=1.0, grow_policy='SymmetricTree', border_count=254,
one_hot_max_size=2, learning_rate="auto" (~0.03)` all match the official CatBoost training-
parameters docs exactly. The Fisher's-method categorical-split citation (LightGBM), the
ordered-target-statistics description (CatBoost), the `use_missing`/learned-default-direction NaN
mechanism (LightGBM), the `nan_mode='Min'` NaN mechanism (CatBoost), the `subsample_freq`
interaction edge case, the `num_leaves > 2^max_depth` "leaf budget unreachable" edge case, the
"one-hot defeats native categorical splits" placement claims for both models, and the structural
lint rules (portType ⊆ ALL_PORT_TYPES, task ∈ ALL_TASKS, scaleSensitive:false ⇒ scale placement
not `required`) all check out against source and against `Core/src/{port-types,tasks}.ts`.

## Judgment calls

**A. `invariances[].distributionalAssumption: false` for both models.**
- *Reading 1 — correct as stated*: the tree-ensemble structure itself makes no assumption about
  the marginal or error distribution; this is the standard framing used to distinguish GBTs from
  GLM-family models (Poisson/Cox/etc.) elsewhere in this catalog, and both sheets apply it
  identically to their sibling `xgboost.sheet.json` gold sheet.
- *Reading 2 — arguably overstated*: the *loss function* each model minimizes by default
  (LightGBM's `regression` objective = L2/squared-error; CatBoost's default `RMSE`/`Logloss`)
  does carry an implicit distributional assumption under a maximum-likelihood framing (L2 ⇒
  Gaussian noise, Logloss ⇒ Bernoulli). Since `task`/`secondaryTasks` cover both classification
  and regression under one flag, the claim is at best true for the ensemble mechanism and
  debatable for the default loss.
- **Ruling**: not a confirmed error — this is a catalog-wide convention question (how the axis is
  scoped: mechanism vs. objective), not something either model sheet gets wrong relative to its
  siblings.

**B. `catboost.sheet.json.nodeQualia.modelMetrics` omits `train_valid_metric_gap`, present in the
LightGBM sheet.**
- *Reading 1 — intentional and defensible*: ordered boosting/ordered target statistics were
  specifically designed to reduce the train/valid divergence that leaf-wise LightGBM is prone to,
  so the diagnostic is less central for CatBoost.
- *Reading 2 — an omission*: ordered boosting reduces but does not eliminate overfitting risk
  (the sheet's own `edgeCases[]` still lists "n < ~100 with high-cardinality categoricals" and
  "severe class imbalance" as gate conditions), so the same generic diagnostic would still carry
  signal.
- **Ruling**: judgment call, not a confirmed error — reasonable curation either way.

**C. Neither sheet's `hpMeta` includes `boosting_type` (LightGBM: gbdt/dart/goss/rf) or
`importance_type` (LightGBM) / `boosting_type` (CatBoost: Plain/Ordered).**
For LightGBM this is a defensible curation choice (the schema doesn't require exhaustiveness, and
`gbdt` is uncontroversially the default). For CatBoost, given Confirmed error #1 above, I'd argue
this crosses from "curation choice" into "should have been included" — but I'm listing the general
omission pattern here as a judgment call for the framework-level question of how exhaustive
`hpMeta` is meant to be, independent of the specific CatBoost miss already counted above.

**D. Both sheets' `hyperparameters.schema` (`@file:schemas/lightgbm.schema.json` /
`@file:schemas/catboost.schema.json`) point to files that do not exist in the repo yet.**
A same-named but differently-valued `lightgbm.schema.json` already exists at
`metadata/ml-algorithms/schemas/lightgbm.schema.json` (a pre-existing, unrelated artifact from a
different catalog effort) whose `n_estimators.default` is `300` — conflicting with this sheet's
(verified-correct) `100`. This is very likely out of scope for a model-facts review (the same
local-`schemas/`-vs-canonical-path split appears across roughly a dozen other family sheets, not
just this pair, so it reads as a known/pending follow-up rather than a lightgbm/catboost-specific
defect) — flagging for the coordinator's awareness rather than as a confirmed error.

## Reviewer errors

- My unaided inventory initially assumed CatBoost auto-detects `object`/`category`-dtype pandas
  columns as categorical without requiring `cat_features` to be passed explicitly. This is
  **wrong** — verified against CatBoost's own FAQ and a GitHub feature-request thread
  (`catboost/catboost#1386`, still open) confirming no such auto-detection exists; `cat_features`
  must always be explicit. The sheet's `edgeCases[]` entry ("string/object categorical column not
  declared in cat_features → fit raises CatBoostError") and `driver.wrapperNeeds` ("cat_features
  column list must be forwarded to fit() ... ") are correct as written; my first-pass instinct to
  second-guess them would have produced a false confirmed-error had I not verified.
- Going in, I was **genuinely unsure** whether CatBoost's default CPU `bootstrap_type` was
  `Bayesian` or `MVS` (both appear across various CatBoost-adjacent material depending on version/
  vintage) and flagged it in my private inventory as needing verification rather than asserting it
  confidently either way. The `MVS`-is-default finding that drives Confirmed error #2 above is
  therefore a verified lookup, not something my unaided library knowledge supplied outright —
  disclosing this so the finding is weighted as "checked," not "recalled."
- Similarly, I initially hedged on whether `one_hot_max_size`'s default was a flat `2` or a more
  context-dependent "auto" value; the official docs confirm `2` is correct for the standard
  (non-GPU, non-ranking) path the sheet describes, matching the sheet. My hedge was unnecessary
  caution, not a finding.
- I did not independently execute or install either library in this session — all defaults were
  cross-checked against the official hosted docs (`lightgbm.readthedocs.io`,
  `catboost.ai/docs/en/references/training-parameters/*`) via fetch rather than against an
  installed package's introspected signature, so a very recent (post-cutoff) default change in
  either library would not be caught by this review.
