# Independent Review — `baselines` family (dummy_classifier, dummy_regressor)

Reviewer built an expected inventory from sklearn knowledge first (strategies, learned
attributes, fit/predict/predict_proba semantics, why preprocessing is inert), then opened
`sheet-template.md` and the two sheets to compare. No sheet content was consulted before the
inventory was written.

## Confirmed errors

**1. `dummy_classifier.sheet.json` → `emits[1]` (`probability`) note over-generalizes
`strategy='prior'` behavior to the whole model.**
The note reads: *"predict_proba returns the class prior for every row — constant across rows."*
This is true **only** for `strategy='prior'`. Actual sklearn `DummyClassifier.predict_proba`
behavior per strategy:
- `most_frequent` → a **hard one-hot** on the majority class (argmax of the prior), not the
  prior fractions themselves.
- `prior` → the true `class_prior_` vector, replicated per row (the only strategy the note
  correctly describes).
- `uniform` → a **flat `1/n_classes`** vector, unrelated to the observed marginal (unless the
  marginal happens to be uniform).
- `constant` → a one-hot on the user-supplied class.
- `stratified` → a **fresh random one-hot draw per row** (`rng.multinomial(1, class_prior_,
  size=n_samples)`) — this is explicitly **not** "constant across rows."
This is the textbook `most_frequent` vs. `prior` footgun (identical `predict()` output, very
different `predict_proba()`), and the note also silently mis-describes `stratified`/`uniform`/
`constant`. It cascades into `nodeQualia.modelMetrics.prior_brier_score`'s claim of "perfectly
calibrated, zero resolution," which is likewise only true under `strategy='prior'` —
`most_frequent` is maximally *overconfident* (miscalibrated) whenever the majority share < 1.0.

**2. `dummy_classifier.sheet.json` → `emits[0]` (`class-label`) note conflates `stratified` and
`uniform`.**
*"the same label (or a marginal-distributed draw, under stratified/uniform) for every row"* —
only `stratified` respects the empirical class marginal
(`rng.multinomial(1, class_prior_, size=n_samples)`). `uniform` is explicitly
**marginal-blind**: `rng.randint(n_classes_, size=n_samples)` draws each observed class with
equal probability regardless of its true frequency. Respecting-vs-ignoring the marginal is the
entire reason both strategies exist as distinct options; bundling them under one description
erases that distinction.

**3. `dummy_classifier.sheet.json` → `learnsVsFixed.note` mischaracterizes `uniform` as
"learning nothing."**
*"constant/uniform learn nothing and are fully specified by their hyperparameters."* `constant`
fits this description (its output is entirely given by the `constant` hyperparameter). `uniform`
does not: it has no hyperparameter naming which classes to draw from or how many — that comes
from `classes_`/`n_classes_`, computed from `y` at fit time. Change the training set's observed
class support and `uniform`'s output space and `predict_proba` values (`1/n_classes_`) change
with it, without any hyperparameter change. It is data-derived, just not frequency-derived.

**4. `dummy_regressor.sheet.json` → `hpMeta.quantile.default: 0.5` misstates sklearn's actual
default, which is `None`.** `DummyRegressor(strategy='quantile')` requires the caller to
explicitly set `quantile`; left at its true default, `fit()` raises `ValueError` ("has to be
specified when the quantile strategy is used"). By contrast, the classifier sheet's
`hpMeta.constant.default: null` correctly reflects sklearn's real default — so this isn't a
house convention of substituting a driver-chosen default (as `random_state: 0` legitimately is,
and is documented as such via the edge-case note). It's an unflagged, plain wrong value. It is
also a **missing edge case**: `edgeCases[]` has no entry for "strategy='quantile' with quantile
unset → ValueError," the direct regressor-side analog of the classifier sheet's correctly
documented "strategy='constant' with a label absent from y → ValueError." (Minor, same-shaped
gap on the classifier side: no edge case for "strategy='constant' with `constant=None` →
ValueError" either — lower severity there only because the default value itself, `null`, is not
misstated.)

**Most important**: #1 (the `predict_proba` conflation) — it's the classic, highest-impact
sklearn gotcha for this exact model pair, it's wrong for 4 of the 5 strategy values, and it
silently corrupts a *derived* metric (`prior_brier_score`'s calibration claim) elsewhere in the
same sheet, not just the one field it's stated in.

## Judgment calls

**A. `axes.parametric: "Yes"`** (producer flagged this as open on the regressor; the classifier
sheet asserts the identical value without flagging it).
- *Reading 1 — "Yes" is correct*: under the standard statistical definition, "parametric" means
  characterized by a fixed, finite parameter count independent of `n`. `DummyRegressor.constant_`
  is exactly one location parameter (mean/median/quantile/constant are just different estimators
  of it); `DummyClassifier.class_prior_` is `k` fixed parameters. This is structurally an
  intercept-only / null model — a standard, uncontroversial example of a parametric model in
  statistics.
- *Reading 2 — "Yes" mis-categorizes it*: in ML taxonomy usage, "parametric" usually implies a
  fitted functional relationship `y = f(X; θ)`. Dummy never reads `X`, so it isn't modeling a
  feature→target relationship at all; tagging it alongside real parametric predictors (linear/
  logistic regression) overstates what it does.
- **Ruling**: "Yes" stands, given the 3-value enum (`Yes|No|Semi`). `No` would be more wrong (it
  implies non-parametric methods like KNN, where effective complexity grows with `n` — the
  opposite of Dummy, whose parameter count is fixed). `Semi` doesn't fit either (no nonparametric
  component exists). "Yes" is the least-wrong available answer under the given definition; not a
  confirmed error. Process note, not a factual one: the classifier sheet asserts the same value
  under the identical reasoning without the open-call flag — for consistency it should probably
  carry the same flag the regressor got, even though the ruling on the value itself is the same.

**B. `consumes[].dtypes: ["any"]`** (both sheets).
- *Reading 1 — correct*: `fit(X, y)` in both estimators never inspects `X`'s element values —
  only `check_consistent_length(X, y)` (i.e., `len(X) == len(y)`). No numeric coercion, no
  NaN-rejection, no dtype check ever touches `X`'s contents, so literally any per-value dtype
  (string, object, mixed) is accepted. This is corroborated by each sheet's own
  `nativeNaN: true` / `nativeCategorical: true` invariance flags, which say the same thing in
  different words.
- *Reading 2 — overstated*: `X` still needs to support `len()`/`.shape[0]` to be checked against
  `y`, so "any" arguably overstates permissiveness if read as "any Python object whatsoever"
  rather than "any per-cell value dtype within an array-like."
- **Ruling**: "any" is correct under the natural reading (per-value dtype, not container type),
  and is internally consistent with the rest of each sheet. Not a confirmed error.

## Reviewer errors

- The predict_proba/predict() per-strategy mechanics (the `rs.multinomial` vs. `rs.randint`
  calls, the exact `fit()` validation branches) are reconstructed from training-time memory of
  the sklearn source, not verified in-session against an installed sklearn or its GitHub source.
  I did not run `python -c "import sklearn; ..."` or fetch the source to confirm line-by-line —
  confidence is high (these are well-documented, frequently-discussed behaviors) but not
  execution-verified.
- Likewise, sklearn's current default for `DummyClassifier(strategy=...)` being `'prior'` (vs.
  the older, now-deprecated `'stratified'` default) is asserted from memory of the deprecation
  cycle, not confirmed against a specific installed version in this session. It matches what
  both reviewer and producer independently landed on, which is corroborating but not
  independent verification of ground truth.
- I did not attempt to verify the `sklearn>=1.4` minimum-version pin in either sheet's
  `driver.deps` — not material to any finding above, but flagging that it went unchecked rather
  than silently treating it as confirmed-correct.
