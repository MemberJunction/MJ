# Independent Review — `scorecard/rubric_weighted_scorecard.sheet.json`

Reviewer built an expected inventory (normalization strategies, hand- vs fitted-weight duality,
exact additive attribution math, banding, and edge cases) BEFORE opening the sheet-template or the
sheet itself. Comparison below.

## Confirmed errors

1. **Zero-variance (constant) factor is not covered anywhere** — not in `nodeQualia.featureStats`,
   not in `edgeCases`. This is the same failure class the sheet already takes seriously twice over
   (`all weights zero` → score collapses to a constant; `unnormalized mixed-scale factors` →
   one factor silently dominates): a factor that is constant across the population silently burns
   its weight budget on zero discrimination while still contributing an offset to the score, and can
   itself be a leakage/data-quality signal (e.g., a factor that's constant in training but not in
   production). Given the family's own established pattern of instrumenting "ways a factor can
   silently break the additive story," this omission reads as an oversight rather than a scope
   decision — a `featureStat` like `factor_variance` (or equivalent) belongs alongside
   `factor_scale_heterogeneity` and `factor_pairwise_correlation`.

2. **No diagnostic for normalizer-choice/distribution mismatch** — the schema lets the operator pick
   any of percentile/minmax/zscore/logistic/banded/lookup per factor, but nothing in `nodeQualia` or
   `edgeCases` catches the case where the chosen normalizer is a poor fit for the raw distribution
   (e.g., `zscore` chosen for a heavy-tailed/skewed factor, where `percentile` would be far more
   robust). This is a softer call than #1 — it may be judged out of scope for a spec-sheet (as
   opposed to Statistician runtime behavior) — but it sits squarely in the same "does the rubric's
   declared structure match what the data actually looks like" territory the sheet otherwise
   prioritizes, so it's flagged with only slightly less confidence than #1.

## Judgment calls

- **`learns:true` + `reusability:"both"` for a component usable with zero training rows.** RULING:
  approve. `reusability` is a three-valued enum (`trainable|reusable-only|both`) that already
  anticipates exactly this hybrid; the lint rule only forces `learns:false ⇒ reusable-only`, it never
  forbids `learns:true` from coexisting with `both`. Reading `learns` as a *capability* flag ("can
  this model type ever learn from data?") rather than a *default-behavior* flag ("does the modal
  invocation learn?") is the more internally consistent interpretation — `fit_weights=true` genuinely
  performs a constrained linear fit against a target, so `learns:false` would misrepresent that mode
  entirely. The `why` field earns its keep by stating the rationale explicitly rather than leaving it
  implicit.

- **`dataSizeTolerance:"any-including-zero"` as a new value.** RULING: approve, with a follow-up
  recommendation. No other model in the frozen-template family (xgboost/cox_ph/arima) can run on zero
  training rows by construction, so a genuinely new taxonomy value is warranted rather than forcing
  this into an existing "low/none" bucket that would understate the claim. The `why` (hand-weighted
  mode needs zero rows by construction; fitted mode stabilizes from tens of rows given it's a
  low-variance constrained linear fit) is accurate and mechanism-derived. Recommend this string gets
  canonicalized into the shared cross-family vocabulary (Doc 4) now, before other families invent
  their own near-synonyms (`"none-required"`, `"zero-or-more"`, etc.) for the same concept.

- **The extra `learningTypeNote` key (and, not separately flagged by the producer but the same
  species of issue, `secondaryTasks`).** RULING: split verdict. The *content* is valuable and
  arguably necessary — without it, `learningType:"Supervised"` would misleadingly imply every
  invocation sees a target, when the hand-weighted default never does. But the *mechanism* is
  template drift: `sheet-template.md`'s axes section lists exactly `task, learningType, parametric,
  ensembleType, interpretabilityClass, dataShape, deterministicFit` with no note-field convention,
  unlike `nodeQualia`/`invariances`/`placementClaims`, which already have a sanctioned `why` slot for
  exactly this kind of caveat. Bolting a free-floating `*Note` key onto `axes` (and adding an
  undeclared `secondaryTasks` key alongside it) is the kind of per-family ad-hoc extension the frozen
  template (explicitly frozen "before the 16-family fan-out") exists to prevent — 16 families each
  inventing their own note-key conventions defeats the point of a uniform, diffable shape. Whether
  this actually breaks anything depends on `sheet-lint.mjs`'s strictness (open vs. closed schema),
  which wasn't in scope to inspect here. Recommend the team decide once, explicitly, whether
  conditional-axis caveats are (a) tolerated as a documented `*Note` convention across all families,
  or (b) required to go through the existing `why`/note infrastructure instead — rather than letting
  this sheet's ad hoc choice become precedent by default.

- **`canBeSeeds[]` entries use a `via` string (e.g., `"score→features:tabular adapter"`) rather than
  a literal `portType` field.** The template's own prose describes the shape as `{template, slot}`
  with no `portType` key shown, yet lint rule 2 explicitly checks `canBeSeeds[].portType ⊆
  (emits[].portType ∪ consumes[].portType)`. That's an ambiguity in the template document itself, not
  a decision this sheet clearly got wrong — but it's worth flagging since the ambiguity is exactly
  the kind of thing that produces mechanical lint surprises. Not resolved without reading
  `sheet-lint.mjs` and a sibling gold sheet, which was out of scope for this review.

- **`class-label` as the port type for banded tiers.** Tiers (Bronze/Silver/Gold, A–F) are ordinal,
  not nominal. If `ALL_PORT_TYPES` distinguishes an ordinal label type, `class-label` may understate
  the semantics; if it doesn't, this is a non-issue. Flagged but not resolved — vocabulary file wasn't
  read.

- **`consumes[0].required:true` next to a note saying the target is optional.** Plausible reading:
  `required` describes the whole `features:tabular` port (always needed), and the note narrows only
  the target sub-part to conditional-on-`fit_weights`. That's defensible and doesn't assert anything
  false — the template has no `conditionalOn` mechanism for `consumes[]` the way it does for
  `hyperparameters`, so a prose note is a reasonable workaround rather than a bug. Judgment call, not
  promoted to a confirmed error.

## Reviewer errors

1. I expected the sheet would need to explicitly model **weight-vector search** (exploring candidate
   weight vectors against an objective) as part of the component's hyperparameter surface. The sheet
   correctly scopes this OUT — both `learnsVsFixed.why` and `hpMeta.weights.prior` state that weight
   search is "a wave-strategist concern layered on top... deliberately not modeled as a component
   behavior." I hadn't considered that this framework draws an explicit line between
   component-level concerns and orchestration/wave-level concerns; my inventory conflated the two.

2. I expected an explicit edge case for **non-monotonic (U-shaped) factor-to-outcome relationships**
   (e.g., very young and very old members both higher-risk) that a simple direction flag can't
   express. On reflection this is a non-issue by design: the `banded`/`lookup` normalizers already
   let the operator assign arbitrary per-bucket sub-scores, so a U-shaped raw relationship is
   trivially expressible as a monotonic (in fact arbitrary) mapping in normalized space. I
   over-anticipated a gap the model's own structure already closes without needing a special case.

3. I expected the exact-vs-approximate attribution contrast with SHAP would need to show up as a
   configurable option or hyperparameter (e.g., an "attribution method" toggle). The sheet instead
   treats exactness as a fixed axiom of the family — `interpretabilityClass:"Coefficients"` plus the
   `emits.attributions` note ("EXACT... no SHAP approximation needed") — with no toggle at all, since
   exactness is guaranteed unconditionally by the additive-linear structure. That's a cleaner
   treatment than what I expected going in; there was nothing to configure.
