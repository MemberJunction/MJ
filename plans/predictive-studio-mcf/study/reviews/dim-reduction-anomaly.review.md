# Independent Review — dim-reduction (pca, umap) + anomaly (isolation_forest)

Reviewer process: wrote an expected inventory cold (no sheets open), then read
`sheet-template.md`, all three sheets, the xgboost gold sheet (for hpMeta/`canBeSeeds`
convention cross-checks), and `decisions.md` (for the U2 port-vocabulary queue), then
externally verified two falsifiable library-behavior claims before ruling.

## Confirmed errors

**None found.** This was checked, not assumed — the following were independently
verified rather than taken on the sheets' word:

1. **`isolation_forest.invariances.nativeNaN = false`** — verified via web search +
   direct fetch of the current scikit-learn `IsolationForest` docs. Scikit-learn has
   added native missing-value support to several tree ensembles (`RandomForest*`,
   `ExtraTrees*`, `HistGradientBoosting*`) but **not** to `IsolationForest` as of the
   current release. The sheet's claim is correct, and it's also the more consequential
   check here precisely because `IsolationForest` was a plausible candidate for having
   picked up that support in a recent release the way its sibling ensembles did.
2. **The `score_samples` sign-flip note** (`emits[0].note`: "driver flips sklearn's sign
   so HIGHER = more anomalous ... score_samples natively returns lower = more abnormal")
   — matches scikit-learn's own docstring wording ("The lower, the more abnormal")
   essentially verbatim. Correct and a sign the producer read the actual API, not a
   remembered gloss.
3. **PCA's `n_components` hpMeta default of `0.95`** initially looked like a mismatch
   against sklearn's real constructor default (`None`, i.e. keep all components) — a
   strong confirmed-error candidate. Cross-checked against the xgboost **gold** sheet's
   `hpMeta` (the U1 frozen-template evidence) and found the same pattern repeated there:
   `n_estimators:300` (real XGBoost default is 100), `subsample:0.9` and
   `colsample_bytree:0.9` (real defaults are both 1.0). So `hpMeta.default` is an
   established, intentional framework convention — a curated "safe pipeline starting
   point," not a transcription of the library constructor default — and PCA's
   `0.95` (with the explicit rationale "the variance-retained form is the safer
   pipeline default") is consistent with that convention, not a deviation from it.
4. Full lint pass against `sheet-template.md`'s embedded rules: every `nodeQualia`
   entry has a non-empty `why`; every `canBeSeeds[].via` ⊆ `emits[].portType` (`via` —
   not `portType` — is confirmed as the sheet-wide field name via the xgboost gold
   sheet, so this isn't a naming deviation specific to these two sheets); every
   `placementClaims` entry respects rule 3 (no `required` scale placement where
   `scaleSensitive:false` — isolation_forest correctly uses `irrelevant`, the stricter
   and more accurate of the two permitted values, not just `beneficial`); every
   `axes`/`portType`/`granularity`/`probabilistic`/`targetSpec`/`paramsAsOutput` value
   used is a member of its template-enumerated vocabulary.

## Judgment calls

**(a) PCA loadings on `coefficients` port vs. a dedicated `loadings` port.**
Ruling: **defensible as authored, correctly flagged, not an error.** The template's
`paramsAsOutput` enum already contains `loadings` as a value distinct from
`coefficients+SE` and `components` — i.e. the two-tier design (coarse `portType` +
shape-refining `paramsAsOutput`) was already built to carry exactly this kind of
distinction without a new port. The producer used that existing mechanism rather than
inventing a port unilaterally, and logged the ambiguity in `decisions.md`'s "Port-
vocabulary proposals (U2 reconciliation queue)" — the same pattern the study already
uses for kmeans's `centroids` and gp's `predictive-distribution`. One real nuance
worth carrying into U2: a `coefficients`-port consumer built against the 1-D
per-feature-vector shape that most linear/GLM sheets emit would need to branch on
`paramsAsOutput` to detect the k×features loadings-matrix case — which is exactly the
scenario that would justify splitting to a dedicated `loadings` port later. Correct
call for the template-freeze phase; the open question is legitimately open, not
under-flagged.

**(b) UMAP `distributionalAssumption: true`.**
Ruling: **correct, not overreach.** "Uniform on a locally-connected Riemannian
manifold" is the actual theoretical premise underlying UMAP's fuzzy-simplicial-set
construction (the local-radius normalization to each point's nearest neighbor is
exactly an assumption of locally uniform density) — it's a genuine generative/
structural claim about the data, not merely a computational-compatibility requirement
(cf. `nativeNaN`, `nativeCategorical`). The three sheets in this review apply this
distinction consistently: PCA is `false` (the SVD needs no claim about how the data is
distributed — its assumption is that *linear* structure is worth keeping, which is a
different kind of claim); isolation_forest is `false` (its premise — "anomalies are
few and different" — is structural/relative, not a parametric or generative
distributional form); UMAP is `true` for the reason above. That's a well-calibrated,
internally consistent standard applied across all three, not a one-off inflation.

**(c) IsolationForest `monotoneTransformInvariant: false`.**
Ruling: **correct, and the reasoning is precise.** Split thresholds in isolation
trees are drawn uniformly in **value** at each node (uniformly between the current
min/max of the feature within that node's subsample), not uniformly in **rank**. An
affine transform (scale + shift) maps a uniform draw onto a uniform draw over the
rescaled range one-for-one, so isolation-depth distributions — and hence anomaly
scores — are unchanged; that's exactly why `scaleSensitive:false` holds. A nonlinear
but strictly monotone transform (e.g. log) preserves rank order but *redistributes the
spacing* of values within the min/max range, which changes the probability that a
uniformly-drawn split falls on one side or the other of any given point, changing
expected path length. So the two flags are precisely complementary: invariant to the
affine subgroup of monotone maps, not to the full monotone group. `false` is the right
answer, and the sheet's own `why` text for both flags already carries this distinction
(uniform-on-range vs. uniform-on-order) even though it doesn't name the affine/monotone
split explicitly — nothing further to add or correct.

**Minor 4th observation (not rising to a confirmed error):** `isolation_forest.consumes[0].dtypes`
lists `["numeric", "encoded-categorical"]` while `pca`/`umap`'s equivalent entries list
only `["numeric"]`. Nothing here is factually wrong — all three algorithms only ever
see a numeric matrix post-encoding — but the asymmetry in how explicitly that's stated
is a minor cross-sheet style inconsistency worth a note for a future consistency pass,
not a correctness issue.

## Reviewer errors

None. The pre-registered inventory (written before opening any sheet) converged with
all three sheets' conclusions on every item ruled above, including the mechanism-level
reasoning (affine-vs-monotone invariance for isolation_forest; distribution-free-but-
parametric-in-representation for PCA; uniform-on-manifold as a real assumption for
UMAP). Two claims were checked externally rather than trusted on recollection — the
`IsolationForest` NaN-support status and the `score_samples` sign convention — both
confirmed the sheets rather than contradicting them. One internal candidate error (PCA's
`n_components` default appearing to diverge from sklearn's real default) was caught and
resolved *before* being written up, by cross-checking the xgboost gold sheet's `hpMeta`
convention — logged above under Confirmed errors as a worked example rather than
silently dropped, since a near-miss is useful calibration signal even when it resolves
to "not an error."
