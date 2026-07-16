# Independent Review — `glm-counts/{poisson,neg_binomial,quantile,tweedie,zero_inflated,ordinal,gam}.sheet.json`

Reviewer built an expected inventory from statsmodels/pyGAM mechanics BEFORE opening `sheet-template.md`
or any sheet: Poisson equidispersion (variance=mean, the dispersion-ratio qualia); NegBinomial's extra
MLE-fitted dispersion parameter for overdispersion; QuantReg's distribution-free pinball loss; Tweedie's
compound-Poisson-gamma shape and its approximate (EQL) log-likelihood; ZeroInflated's two-part mixture
with a structural-zero submodel distinct from the count submodel; OrderedModel for genuinely ORDERED
categories (with the open question of how a 10-value task union without `ordinal` should host it); GAM's
smooth terms plus its extra `pygam` dependency. Two claims (Tweedie's EQL default, ZeroInflated's
`predict(which=...)` semantics) were verified against the live statsmodels source (`family.py`,
`count_model.py`) rather than trusted from memory, since they anchor confirmed errors below. Comparison
follows.

## Confirmed errors

1. **`zero_inflated.sheet.json` `driver.wrapperNeeds` inverts `prob-main` and pi.** The note reads:
   `"predict(which='mean') for the score port and predict(which='prob-main') / inflation pi for the
   probability port"` — i.e., it tells the wrapper to use `predict(which='prob-main')` AS pi. Verified
   against `statsmodels/discrete/count_model.py`: `which='prob-main'` returns `1 - w`, the probability of
   the **main/count regime** (NOT being a structural zero) — the complement of pi, not pi itself. There
   is no `which='prob-infl'`; the correct derivation is `pi = 1 - predict(which='prob-main')`. This is
   the single most consequential finding in the family: the spec sheet is explicitly "the authoritative...
   source... Doc 3's driver... derived from" (template intro), so a wrapper built literally from this note
   would silently emit `1-pi` through the `probability` port instead of pi — both are valid-looking
   numbers in `[0,1]`, so nothing crashes and nothing looks wrong downstream. It just reports "probability
   this member behaves normally" where the emits note promises "P(structural zero | x)." Fix: correct the
   note to `pi = 1 - predict(which='prob-main')` (or note that `predict(which='prob-zero')` gives the
   *mixture* P(Y=0), a third, different quantity, so the three must not be conflated).

2. **`tweedie.sheet.json` self-contradicts on whether the exact density is ever used.** `hpMeta.eql` is
   fixed (`"prior": "fixed"`, non-searchable) at `true`, with the note "extended quasi-likelihood for
   loglike-based diagnostics; the true Tweedie density has no closed form." But `emits[0]` (score) says
   "though its density is evaluated by series approximation." Verified against
   `statsmodels/genmod/families/family.py`: these describe **two different, mutually exclusive** code
   paths. `eql=False` (the library's actual default, not this sheet's) computes the genuine Tweedie
   density via a Wright-Bessel series expansion for `var_power` in `(1,2)` — precisely this sheet's
   declared range. `eql=True` (what this sheet hard-fixes) instead computes the Nelder–Pregibon Extended
   Quasi-Likelihood, a *different, cruder* approximation that does not evaluate the density at all. So
   the sheet locks in the coarser EQL path while its own emits-note describes the finer series-evaluated
   path as if that's what's running — and it forecloses (via `"searchable": false`) ever using
   statsmodels' actual native likelihood for exactly the p-range this model targets, without stating why.
   Either flip the default to `eql=false` (getting the real density, matching the score note) or correct
   the score note to say the density is *not* natively evaluated under this driver's fixed configuration
   — but the two currently can't both be true.

3. **`gam.sheet.json`'s `coefficients` port claims a shape (`paramsAsOutput: "coefficients+SE"`) its own
   note contradicts.** The note says the port is "exported per-term as partial-dependence **curves with
   confidence bands**" — a curve-plus-envelope object, not a scalar-plus-standard-error pair the way every
   other sheet in this family genuinely uses `coefficients+SE` (poisson/neg_binomial/tweedie/zero_inflated/
   quantile/ordinal all emit one number + one SE per feature). `sheet-template.md`'s own `paramsAsOutput`
   enum already contains a curve-shaped alternative (`survival-curve`), and the family's own U2 queue
   (`decisions.md`) already resolved this *exact* category of mismatch for `pca` — "loadings" got its own
   enum value rather than being folded into `coefficients+SE` precisely because per-component loadings are
   a different shape from per-feature linear slopes. GAM's per-term smooth-plus-band is at least as
   different in shape from a scalar+SE as loadings are, arguably more so (a plottable function, not a
   point). Unlike the other three flags this family raised, this one is **not** in `decisions.md`'s
   glm-counts queue — a real gap in the producer's own escalation trail, given the directly-analogous
   pca precedent should have triggered it. Slightly softer than #1/#2 since `paramsAsOutput`'s exact
   contract (loose "any parameter block" vs strict "matches this shape") wasn't settled by reading
   `sheet-lint.mjs`, but flagged with high confidence given the in-family precedent.

## Judgment calls

- **`ordinal` mapped to `task: "classification"` rather than a new task value.** RULING: **approve —
  classification is right, no new task-union value warranted.** Three reasons. (a) Shape: `ordinal`'s
  `emits` (`probability` as a K-vector, `class-label` as argmax) are byte-for-byte the same port types
  `logistic_regression`/`multinomial_logit` emit; nothing downstream that consumes those ports needs to
  change to consume this one. (b) Division of labor: the template already has a purpose-built escape
  valve for exactly this concern — `nodeQualia.modelMetrics`, "the lenses the Statistician... computes for
  THIS family" — and the sheet uses it correctly: `ranked_probability_score` ("charges MORE for
  predictions further from the true level in the ORDER... exactly the structure this model exists to
  exploit") and `target_order_evidence` are precisely where order-awareness belongs, not in a coarse
  10-value routing tag. (c) Contrast with the harder case in the same decisions log: CLV
  (`bg_nbd`/`pareto_nbd`/`gamma_gamma`) has **no** existing task that fits even loosely — `ordinal` has
  one that fits at the port/shape level and only diverges at the loss-function level, which is nodeQualia's
  job by design. Minor companion observation, not enough to overturn the ruling: `gam.sheet.json` uses
  `secondaryTasks: ["classification"]` to flag its own regression/classification duality (LinearGAM vs
  LogisticGAM), but `ordinal.sheet.json` leaves `secondaryTasks: []` even though its own `class-label`
  emit note flags an analogous duality ("downstream may prefer expected level `sum(k*p_k)` for ordinal
  loss" — a regression-flavored consumption of the same fitted model). Worth tidying for family-internal
  consistency, not worth escalating.

- **`quantile-band` port proposal (quantile.sheet.json).** RULING: **approve, recommend adoption at U2.**
  Fitting several `q`'s to get a prediction interval is the single most common real use of quantile
  regression, and no existing port expresses a multi-quantile bundle — `score` per q is a real information
  loss (the band's WIDTH, and whether it's coherent, are the point). The sheet's own
  `quantile_crossing_rate` modelMetric ("independently-fitted q's can produce crossing predictions...
  needing monotone rearrangement") only makes sense as a diagnostic if a band-shaped emission exists to
  diagnose — the proposal and the qualia are two halves of one coherent idea, which is a good sign it's a
  real gap rather than a nice-to-have. The interim workaround (`wrapperNeeds`: "one fit per requested q...
  loops q's and stacks predictions") is a reasonable stopgap pending the vocabulary addition.

- **Zero-inflated pi riding `probability` (zero_inflated.sheet.json).** RULING: **approve as pragmatic
  reuse; no new port needed, but the open question should close, not linger.** The sheet is honest about
  the mismatch in its own note ("though of a latent regime rather than a class label") — pi genuinely is
  a `[0,1]` per-row native quantity, which is what `probability` as a port TYPE requires; what it lacks is
  a *semantics* tag distinguishing "P(structural zero | x)" from "P(class=1 | x)." That distinction
  matters concretely within this very family: `ordinal.sheet.json`'s `probability` emit is a genuine
  per-category classification probability, while `zero_inflated.sheet.json`'s is a latent mixture-regime
  probability — same port type, two different meanings, both correctly documented via prose `note` fields
  today. Recommend the U2 queue resolve this with a lightweight `emits[].semantics` free-text/enum
  companion field (paralleling how `paramsAsOutput` already disambiguates shape within `coefficients`)
  rather than fragmenting `probability` into new port types — but don't leave it open indefinitely; this
  family alone gives two clean worked examples to settle it.

- **Family bucketing: `quantile`/`gam`/`ordinal`/`tweedie` under `family: "glm-counts"`.** Only
  `poisson`/`neg_binomial`/`zero_inflated` are actually count models in the statistical sense — QuantReg
  isn't a GLM at all (no exponential-family likelihood, no link function in the GLM sense), OrderedModel
  targets ordered categories not counts, GAM is a structural generalization orthogonal to the count/
  continuous distinction. This reads like a "statsmodels miscellaneous regression" bucket of convenience
  rather than a statistically coherent family. Not a sheet-level defect (family assignment is presumably
  fixed upstream in the roadmap/family list, out of scope for a per-sheet review) but worth a light note
  since it's the kind of grouping that quietly misleads a reader who assumes family membership implies
  shared statistical structure — the same instinct that makes `ordinal→classification` non-obvious at
  first glance.

## Reviewer errors

1. I expected NegBinomial's `alpha` to be under-specified or accidentally conflated between "the MLE-fitted
   dispersion parameter" and "an unrelated regularization knob that happens to share the name." The sheet
   gets this exactly right and calls it out explicitly: `hpMeta.alpha.note` states the schema's `alpha` is
   "fit_regularized L1 penalty strength (NOT the dispersion parameter, which is estimated by MLE)," and the
   dispersion parameter itself surfaces correctly through `emits.coefficients` ("plus the estimated
   dispersion alpha, reported with its own SE") and `modelMetrics.alpha_dispersion_lr_pvalue`. I
   under-anticipated how carefully this specific name collision would be handled.

2. I expected the odd family placement of QuantReg (see the bucketing note above) to leak into the sheet
   itself — e.g., an inherited assumption that the target is a count, or a stray count-family qualia stat.
   It doesn't: `distributionalAssumption:false` is stated cleanly, `consumes[0].note` explicitly says
   "continuous target; counts are tolerated but mass points slow IRLS convergence," and
   `target_mass_points` in `nodeQualia.featureStats` turns the count-adjacency into a genuine diagnostic
   (ties in discrete y flatten the pinball-loss surface) rather than an inherited assumption. The sheet
   handled a structurally awkward family slot better than I expected going in.

3. I expected GAM's `extrapolates` flag to default to `true` on the (wrong) assumption that a smooth
   function still "extends" reasonably past the training range the way a line does. The sheet correctly
   sets `extrapolates:false` with an accurate mechanistic reason (outside the boundary knots the spline
   basis has no data support; the boundary polynomial runs uncontrolled) — a real and non-obvious
   distinction from every other model in this family (all of which correctly extrapolate via their
   log-linear or linear-index forms). I had the direction of this one backwards before reading the sheet.
