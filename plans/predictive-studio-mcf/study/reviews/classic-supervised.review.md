# Independent Review — `classic-supervised` family (knn, svm, naive_bayes, gp, mlp)

Reviewer built an expected inventory from sklearn documentation/mechanism knowledge first — for
each of the five models: scale sensitivity + its mechanism-derived basis, probability calibration
quality, fit determinism, native uncertainty, and dataset-size limits — before opening
`sheet-template.md` or any of the five sheets. Where a claim required re-deriving the underlying
math rather than recalling it (GaussianNB's affine-invariance, MLP's ReLU piecewise-linear
extrapolation), that derivation is noted inline in the findings below rather than asserted as
recalled fact. No sheet content was consulted before the inventory was written.

## Confirmed errors

**1. `gp.sheet.json` — `axes.deterministicFit: true` is contradicted by the sheet's own chosen
default `hpMeta.n_restarts_optimizer: 2`, with no `random_state` fixed anywhere in `hpMeta` or
`driver.constructor`.**

sklearn's actual default for `GaussianProcessRegressor`/`GaussianProcessClassifier` is
`n_restarts_optimizer=0` (a single L-BFGS run from the kernel's stated initial `theta`, genuinely
deterministic) and `random_state=None`. This sheet's driver *overrides* that default to `2` —
an intentional, defensible choice given the sheet's own `edgeCases[]` entry ("marginal-likelihood
optimizer converges to a bound... increase n_restarts_optimizer") acknowledging the marginal
likelihood surface is multimodal enough that restarts matter. But sklearn's restart-initialization
code path (`self._rng.uniform(bounds[:,0], bounds[:,1])` inside `fit()`) draws its initial `theta`
for each restart from `check_random_state(self.random_state)`. With `random_state` left at its
sklearn default (`None`) and never pinned by this sheet's `hpMeta` or `driver.constructor` snippet,
that RNG resolves to the global NumPy RNG singleton — so two `.fit()` calls on identical data with
this driver's own stated default config can converge to different local optima of the (sheet's own
words) *multimodal* marginal likelihood, and thus different fitted kernel hyperparameters. That is
a real, mechanism-grounded non-determinism in the sheet's *actual* default configuration, not a
hypothetical edge case — yet `axes.deterministicFit` asserts `true` unconditionally, with no
qualifying note the way `hpMeta.max_iter` in the sibling `mlp.sheet.json` explicitly documents its
own default-value override.

This is exactly the failure mode the family's own `mlp.sheet.json` gets right one row over:
`axes.deterministicFit: false` there is earned precisely because MLP's default `solver='adam'` +
random weight init are stochastic absent a fixed seed. GP's own sheet has the identical shape of
problem (a default hyperparameter that introduces RNG-driven variability) but reaches the opposite
axes conclusion, with no `random_state` pin to make `true` actually hold. Fix: either set
`deterministicFit: false` (matching the driver's real default config), or pin `random_state` in the
driver default and note the `n_restarts_optimizer=2` override the way `max_iter` is noted in MLP.

**2. `mlp.sheet.json` — `hpMeta.early_stopping.default: true` silently diverges from sklearn's real
default (`False`) with no override note, unlike the sibling `max_iter` entry in the same block.**

sklearn's `MLPClassifier`/`MLPRegressor` default `early_stopping=False`. This sheet sets the
driver default to `true` — a reasonable, well-justified choice (the note correctly explains *what*
it does: "holds out 10% for validation-loss stopping — the cheap overfit brake") — but unlike
`max_iter` two lines above it in the same `hpMeta` block, which explicitly flags itself as
*"raised from sklearn's 200 default — the stock value routinely ends in ConvergenceWarning,"* the
`early_stopping` entry doesn't disclose it's an override at all. This does not contradict any other
claim in the sheet the way finding #1 does (MLP's `deterministicFit` is already correctly `false`
regardless, and `early_stopping`'s internal train/validation split reuses the same `random_state`
that already governs weight init, so it introduces no *new* class of non-determinism) — it is a
documentation-completeness gap, not a behavior-breaking one. Listed separately from #1 because it
is checkable against sklearn's own default table, not a judgment call.

**Most important: #1.** It is a top-level axis claim (`deterministicFit`) — the kind of flag a
downstream consumer (e.g., a "run twice, expect identical output" test harness, or a UI badge
promising reproducibility) would take at face value without reading the hyperparameter block that
quietly undermines it. Compounding this: GP is the one model in the family whose entire identity is
built on being the *principled, honest* one (native σ, explicit `distributionalAssumption: true`,
the only model that "SAYS so" when uncertain per its own `extrapolates` note) — an unflagged
determinism gap sits awkwardly against that self-presentation.

All other checked facts came back correct: every `hpMeta` default across all five sheets
(`n_neighbors=5, weights='uniform', metric='minkowski', p=2, leaf_size=30` for kNN; `C=1.0,
kernel='rbf', gamma='scale', degree=3, epsilon=0.1, class_weight=None, probability=False` for SVM;
`var_smoothing=1e-9, alpha=1.0, fit_prior=True, priors=None` for naive_bayes; `alpha=1e-10,
normalize_y` — overridden to `True` with a stated rationale, unlike the two override gaps above —
for GP; `hidden_layer_sizes=(100,), activation='relu', alpha=0.0001, solver='adam',
learning_rate_init=0.001, batch_size='auto'` for MLP) matches the official sklearn API defaults
exactly. The `native`/`via-calibration` classification of each model's `probability` emit is
applied correctly and consistently across all five (kNN/naive_bayes/GP/MLP = native because the
probability falls out of the base prediction mechanism with no extra fitting step; SVM =
via-calibration because `probability=True` triggers a genuinely separate Platt-sigmoid fit on
5-fold CV — and the "5-fold" figure itself is a verbatim match to sklearn's own SVC documentation).
GaussianNB's `scaleSensitive: false` is mechanistically correct: re-deriving it — an affine
rescale `x→ax+b` shifts a feature's fitted Gaussian log-likelihood by `-log(a)` uniformly across
every class, a class-independent additive constant that cancels in the posterior argmax — confirms
the sheet's claim exactly. MLP's `extrapolates: true` ("a ReLU network is globally piecewise-affine
... extrapolates linearly and with unwarranted confidence") and naive_bayes's `extrapolates: true`
("log-likelihood ratio grows quadratically... producing extremely (over)confident posteriors") are
both correct, non-obvious mechanism claims I had not pre-derived and independently verified while
reading. GP's `predictive-distribution` `portTypeProposal` note is correctly scoped to the port
vocabulary layer (a new `portType`, proposed only in prose per lint rule 4, never smuggled into the
enum) rather than misfiled under `paramsAsOutput` (which is reserved for the *model's own fitted
parameters*, not a per-row prediction quantity) — a genuine and well-executed piece of forward-
compatible design, not an error.

## Judgment calls

**A. `naive_bayes.sheet.json` — `axes.interpretabilityClass: "Coefficients"` with zero
`emits[].paramsAsOutput` entry set to `coefficients+SE` (the only enum value that fits).**
- *Reading 1 — defensible as-is*: sklearn exposes no native standard-error estimate for either
  `GaussianNB`'s per-class means/variances or `MultinomialNB`'s `feature_log_prob_` (no Fisher-
  information-matrix machinery the way `statsmodels` GLMs have). Emitting `coefficients+SE` would
  require fabricating an SE the model doesn't actually produce — exactly the kind of unearned
  precision this codebase's broader "provable-only" discipline (seen throughout the connector
  conventions) argues against. Skipping the emit rather than inventing a value is the safer call.
- *Reading 2 — a real, under-documented gap*: `MultinomialNB`'s `feature_log_prob_` is not merely
  "coefficient-like" — the model's joint log-likelihood is *literally* `X @ feature_log_prob_.T +
  class_log_prior_`, i.e. MultinomialNB **is** a linear classifier in log-count-space, making
  `feature_log_prob_` a genuine coefficient matrix. And the sibling `gp.sheet.json` shows the
  *right* way to handle an analogous situation (a capability the model has but the current
  vocabulary can't cleanly express): it adds an explicit `portTypeProposal` note. `naive_bayes`
  has no equivalent note anywhere explaining why `Coefficients`-class interpretability produces no
  queryable output.
- **Ruling**: not a confirmed error (nothing false is stated), but the omission should either carry
  an inline note (mirroring GP's `portTypeProposal` pattern — e.g. a proposed bare `coefficients`
  enum value without the `+SE` requirement) or the `interpretabilityClass` should be reconsidered.

**B. `naive_bayes.sheet.json.canBeSeeds` omits a Stacking Template entry that both sibling
black-box models (`svm.sheet.json`, `mlp.sheet.json`) include.**
Both SVM (`via: "score→features:tabular adapter"`) and MLP (`via:
"probability→features:tabular adapter"`) list a Stacking Template seed. naive_bayes's `emits[]`
already contains the `probability` portType that would satisfy the same lint-rule-2 prerequisite
(`canBeSeeds[].portType ⊆ emits[].portType ∪ consumes[].portType`) MLP uses for its own Stacking
entry, and NB is a textbook strong stacking base learner precisely *because* its miscalibrated-but-
well-ranked, high-bias/independence-driven errors are usefully decorrelated from other model
families' errors. This reads as an editorial omission rather than a mechanism-driven exclusion —
worth a second look, not a confirmed defect (curatorial choices are inherently the producer's call).

**C. `naive_bayes.sheet.json` compresses two sklearn classes (`GaussianNB`, `MultinomialNB`) with
genuinely opposite scale-sensitivity into one `invariances[].scaleSensitive: false` boolean.**
The `why` field and `placementClaims` (`verdict: "harmful"`, correctly stronger than a plain
`irrelevant`, since Multinomial's failure mode is a hard `ValueError` not mere wasted compute)
carry the Multinomial caveat responsibly in prose. But a consumer reading `invariances[].value`
programmatically (without parsing `why`) would see a flat `false` and could reasonably standardize
features before a Multinomial-routed fit, triggering the documented hard error. This is a structural
consequence of merging two variants into one sheet rather than a factual mistake, and the prose
mitigation is genuinely good — flagging as an architecture question (should this be two sheets?)
rather than something the producer got wrong within the current one-sheet structure.

**D. `axes.deterministicFit`'s intended scope (default-hyperparameter-config determinism vs.
core-algorithm determinism) is never defined in `sheet-template.md`.** SVM's `true` is correct
under either reading (its default `probability=False` never touches the CV-shuffle path at all).
GP's `true` (confirmed error #1) only survives under the more charitable "core inference algorithm"
reading, and even then is undermined by its own default-restarts choice. Recommend the template
be tightened to state explicitly which reading governs, since the ambiguity is exactly what let
finding #1 through.

**E. Lint rule 3's illustrative wording ("scaleSensitive:false ⇒ scale placement must be
irrelevant/beneficial, never required") does not explicitly cover `harmful`**, the value
`naive_bayes.sheet.json` uses for its scale `placementClaims`. Ruled *not* a violation — `harmful`
is consistent with (arguably a stronger form of) the rule's actual intent of forbidding a
`scaleSensitive:false` + `required` contradiction — but the rule's phrasing should be widened to
name `harmful` explicitly so future sheets and the lint script itself aren't left inferring intent.

## Reviewer errors

None of the five pre-read predictions (scale-sensitivity + basis, calibration quality, fit
determinism, native uncertainty, size limits) were contradicted by the sheets on re-check — GP's
`n_restarts_optimizer=0`/`random_state=None` sklearn defaults, which is what made confirmed error
#1 findable, were recalled correctly from the outset, not corrected mid-review. Two things worth
disclosing for calibration of this review's own reliability, not because either was wrong:

- The pre-read inventory was scoped to the five dimensions the task specified and did not cover
  the sheets' `extrapolates` axis. On reading, all five `extrapolates` claims (kNN=false/bounded-
  by-neighbor-targets, SVM=false/RBF-collapses-to-bias except linear kernel, naive_bayes=true/
  quadratic overconfidence, GP=false-but-self-aware via σ-inflation, MLP=true/piecewise-linear)
  checked out as mechanistically sound under independent derivation — this is a scope gap in what
  was pre-committed to paper, not a factual miss once examined.
- The naive_bayes `MultinomialNB`-is-a-linear-classifier equivalence (central to judgment call A)
  was worked out in full during this review rather than being part of the initial written
  inventory, which only characterized NB coefficients loosely as "not a coefficient+SE structure."
  The initial framing was not wrong, just less precise than the derivation that followed — noting
  this so judgment call A is weighted as "derived in-session," consistent with how this family's
  sibling reviews (e.g. `gradient-boosting.review.md`) disclose in-session verification separately
  from unaided recall.
