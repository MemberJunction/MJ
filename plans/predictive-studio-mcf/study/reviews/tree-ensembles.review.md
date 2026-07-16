# Independent review — tree-ensembles (random_forest, extra_trees, decision_tree)

Reviewer built an expected inventory from sklearn knowledge *before* opening the sheets, then read
`sheet-template.md` + the three `.sheet.json` files, then verified the two version-sensitive
native-NaN claims and the `n_estimators`/`max_features` defaults directly against the live
scikit-learn changelog/docs (WebSearch + WebFetch), since the task called out that the exact
version matters and my own prior on that point turned out to be wrong (see Reviewer errors).

---

## Confirmed errors

1. **`random_forest.sheet.json` — `hpMeta.n_estimators.default = 200` is wrong; the library default is 100.**
   scikit-learn's documented default for both `RandomForestClassifier` and `RandomForestRegressor`
   is `n_estimators=100` (changed from 10 in v0.22 — this is one of the most stable, unambiguous
   facts in the library). The sheet's own sibling, `extra_trees.sheet.json`, correctly lists
   `"n_estimators": {"default": 100, ...}`. This is the single most material error in the family:
   if the driver instantiates `RandomForestClassifier(**hp)` off this schema's stated default, it
   silently ships double the trees the library ships, and any downstream "default" documentation
   or cost/compute estimate derived from this sheet is wrong.

2. **`extra_trees.sheet.json` mischaracterizes its own native-NaN mechanism as "learned" — it is
   documented as *random* routing, a materially different mechanism from RF/DT.** The claim
   appears twice, identically wrong both times:
   - `invariances[].nativeNaN.why`: *"sklearn >=1.6 extends **learned** missing-value routing to the random splitter"*
   - `placementClaims[].impute.why`: *"**learned** NaN routing (driver floor sklearn>=1.6) ..."*

   Verified against the scikit-learn 1.6 changelog (PR #28268) and the current `ExtraTreesClassifier`
   docs page: *"Missing-values are handled by randomly moving all of the samples to the left, or
   right child node as the tree is traversed."* That is **random** routing, not the impurity-gain
   `learned` routing that `RandomForestClassifier`/`DecisionTreeClassifier` use (PR #26391, v1.4:
   *"the tree grower learns at each split point whether samples with missing values should go to
   the left or right child, based on the potential gain"*) — which the `random_forest.sheet.json`
   sheet correctly describes as "learned direction."
   The **version number itself, `>=1.6`, is correct** — verified independently, see Reviewer errors
   below — only the mechanism word is wrong. This is a real miss because it's actually a *nicer*
   point than what's written: Extra-Trees' defining randomization philosophy (random split
   thresholds) extends coherently to random NaN routing too, rather than borrowing RF's
   gain-optimizing approach. The sheet should say "random," not "learned," in both places.

3. **`random_forest.sheet.json` and `extra_trees.sheet.json` both state `max_features` default
   `"sqrt"` unqualified, but that is only the *classifier* default — the *regressor* default is
   `1.0`.** Verified against `RandomForestRegressor` docs: *"max_features ... default=1.0 ...
   Changed in version 1.1: The default of max_features changed from 'auto' to 1.0."* Both sheets'
   `driver.constructor` explicitly builds either `RandomForestClassifier(**hp)` or
   `RandomForestRegressor(**hp)` (same for ExtraTrees) from one shared `hp` dict/schema — so
   stating a single "default" that silently diverges from the real regressor default (`sqrt` picks
   a much smaller per-split feature subset than `1.0`/all-features) is a checkable, material
   inaccuracy, not a style choice, and it hits both RF and ET identically.

---

## Judgment calls

**(a) extra_trees `monotoneTransformInvariant:false` — ruling: mechanistically correct, keep it.**
RF/DecisionTree's best-split search only depends on the *rank order* of a feature's values (the
candidate splits are the n−1 midpoints between sorted order statistics), so any strictly monotonic
transform preserves which partition is optimal — full invariance. Extra-Trees instead draws its
candidate threshold **uniformly in raw value space** over `[min, max]`; the probability a given
partition (the gap between two consecutive order statistics) gets selected is proportional to that
gap's *raw width*. A nonlinear monotonic transform (log, rank) redistributes relative gap widths
even though it preserves order, so it shifts the split-selection distribution — Extra-Trees is only
invariant to *affine/linear* rescaling, not to general monotonic transforms. The sheet's own `why`
text states exactly this reasoning correctly, and — notably — the producer applied it consistently
downstream: `scaleSensitive:false` (affine transforms preserve relative gap *proportions*, so it
stays scale-invariant) is correctly kept distinct from `monotoneTransformInvariant:false`, and the
`transform` placementClaim is correctly bumped from `irrelevant` (RF/DT) to `beneficial` (ET) with
a mechanism-consistent reason ("unskewing places candidate thresholds where the data mass lives").
This is careful, correct work — I agree with the producer's flag.

**(b) decision_tree scale placement, `irrelevant` vs `harmful` — ruling: side with the producer, `harmful` is the more accurate verdict, and it is scoped correctly.**
The template's lint rule 3, as written in `sheet-template.md`, only forbids `required` for
`scaleSensitive:false` ("must be irrelevant/beneficial, never required" — `harmful` is not in the
forbidden set, and isn't in the given example's allowed set either, but nothing in the prose
excludes it). `harmful` also does not actually contradict `scaleSensitive:false`: that flag is a
claim about the *fit* being invariant to scale, which remains true; the harm the producer wants to
record is to a *separate* axis — the human-readability of the emitted rule thresholds — not to the
fit. `decision_tree` is the only sheet in the family with `interpretabilityClass:"Rules"` and an
explicit `emits[].rules` output whose entire stated value proposition (per the sheet's own
`identity.description`: "the value proposition is the explanation, not the accuracy ceiling") is
those human-readable thresholds. Standardizing before this model turns `income > $52,000` into
`income > 0.73 SD` — a real, essentially universal degradation of the model's defining output — for
zero offsetting benefit (no accuracy or compute gain, since the fit is unchanged). That is the
textbook shape of "harmful," not "no effect either way." The scoping is right too: RF/ET correctly
keep `scale:irrelevant` since their `interpretabilityClass` is `ImportanceOnly` — there is no
rule-readability output for scaling to harm on those two sheets, so this verdict change should
apply to `decision_tree` only. Recommend flipping just this one cell to `harmful` and confirming
against `sheet-lint.mjs` directly (not opened as part of this review — the ruling above is from the
template's prose rule) that it doesn't choke on a `harmful` verdict for `scaleSensitive:false`.

**(c) Same "why says cost, verdict says irrelevant" shape recurs — more weakly — on `impute` across all three sheets.** RF's and ET's `impute` `why` text both argue real cost ("unnecessary and
sometimes harmful — it erases the missingness signal") while the verdict stays `irrelevant`. I do
not press this as hard as (b): the RF/ET wording hedges with "sometimes" (conditional on whether
missingness happens to be informative in the specific dataset), which is a legitimately softer,
data-dependent case than decision_tree's near-universal, mechanism-certain readability hit. Worth
the same scrutiny for consistency, but I would not force a change here on the evidence in the
sheets alone.

**(d) `canBeSeeds[]` field naming vs. the template's stated lint rule 2.** `sheet-template.md` names
the field `canBeSeeds[].portType` for lint rule 2 ("⊆ emits∪consumes"), but all three sheets use
`via` (plus an unlisted `note` field) — there is no literal `portType` key anywhere in `canBeSeeds`
entries. Given the pattern is identical and consistent across all three family sheets, this reads
like template-prose/implementation drift already baked into the (unopened) gold sheets rather than
a producer defect — but it's worth a one-line confirmation against `sheet-lint.mjs` that it actually
reads `via`, since if it literally looks for `portType` the check is vacuously unenforced on every
sheet in this shape.

**(e) Minor completeness gap, not a defect as configured.** The verified RF changelog restricts
native-NaN support to specific criteria only (`gini`/`entropy`/`log_loss` for classification,
`squared_error`/`friedman_mse`/`poisson` for regression — notably **not** `absolute_error`), and the
sheet's `nativeNaN.why` states the capability unconditionally. This is currently moot because
`criterion` isn't exposed as a searchable hyperparameter in either sheet's `hpMeta` (both stay on
the supported defaults), but the caveat should be added if `criterion` is ever opened up.

---

## Reviewer errors

1. **I assumed, before opening the sheets, that RandomForest and ExtraTrees would gain native-NaN
   support in the same scikit-learn release, since both are forests built on the same underlying
   tree-splitter infrastructure — this was wrong.** Verified against the official changelogs:
   `RandomForestClassifier`/`Regressor` got it in **1.4** (PR #26391, gain/impurity-*learned*
   routing direction), while `ExtraTreesClassifier`/`Regressor` didn't get it until **1.6**
   (PR #28268) — a full two-minor-version gap — and via a **genuinely different mechanism**
   (*random* routing), because Extra-Trees' random-threshold splitter needed separate, later
   engineering work to support missing values at all; it wasn't a free corollary of RF's fix
   landing. The sheets had both version numbers exactly right (1.4 and 1.6 respectively); my
   "shared infrastructure ⇒ shared timeline" prior was the wrong lens, and I only caught my own
   mistake — and, in the process, the sheet's real defect (item 2 in Confirmed errors, the
   "learned" vs "random" mechanism mischaracterization for ET) — by pulling the primary-source
   changelog text rather than trusting recall on either side. This is exactly the version-drift
   trap the task brief warned mattered, and it's worth flagging that a plausible-sounding shared-
   infrastructure argument is not a substitute for checking the actual PR/changelog per class.
