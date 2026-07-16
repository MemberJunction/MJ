# Independent Review — `clustering` family (kmeans, dbscan, gmm, hierarchical)

Reviewer built an expected inventory from sklearn-documentation knowledge first — scale-sensitivity
mechanism for each of the four (squared-Euclidean objective / fixed-radius Euclidean ball / EM
under full vs. diag/spherical covariance / linkage-distance merges), which family members lack a
native `predict()` on new points (dbscan, hierarchical — the defining wrapper gap) vs. which have
one natively (kmeans nearest-centroid, gmm posterior-under-mixture), k/component-selection method
per model (silhouette for the distance-native three, BIC/AIC for the likelihood-native gmm), soft
vs. hard assignment (gmm alone is soft-native), density- vs. centroid- vs. linkage-based geometry,
determinism (random-init for kmeans/gmm vs. structurally deterministic hierarchical vs.
deterministic-with-a-border-point-caveat dbscan), and degenerate/empty-cluster edge cases per
model — **before** opening `sheet-template.md` or any of the four sheets (see
`study/clustering-independent-inventory.md`-style scratch notes retained by the reviewer). Where
the inventory carried genuine uncertainty (GMM `n_init`/`n_components` sklearn defaults, current
AgglomerativeClustering `n_clusters` default, whether sklearn's own docs state the DBSCAN
border-point caveat), that uncertainty was resolved in-session against the official scikit-learn
API reference (`scikit-learn.org/stable/modules/generated/sklearn.{cluster.KMeans,cluster.DBSCAN,
cluster.AgglomerativeClustering,mixture.GaussianMixture}.html`) before finalizing findings — see
Reviewer errors for what the unaided inventory got wrong or over-hedged.

The coordinator's `decisions.md` already logs three of the four flagged items in its "Port
proposals from classic-supervised + clustering" queue (`centroids`/kmeans, `linkage-tree`/hierarchical,
the GMM scale relaxation) — this review's independent derivation of the same conclusions, reached
before that file was consulted, is corroborating rather than circular; the fourth (dbscan
determinism) is a `deterministicFit` question not yet in that queue.

## Confirmed errors

**1. `gmm.sheet.json` has no route — in either its search prior or its `nodeQualia` — to discover
"this data has no real cluster structure," even though the family's own demand-gate lesson (see
below) applies to GMM at least as strongly as to k-means.**
`kmeans.sheet.json` and `hierarchical.sheet.json` both carry an explicit `hopkins_statistic`
featureStat precisely because a clusterer will confidently emit *k* plausible-looking segments on
pure noise (kmeans: *"even a high value only licenses segmentation, never supervised lift"*;
hierarchical: *"a dendrogram is ALWAYS produced, even on uniform noise, so tendency must be
established before any cut is read as structure"*). GMM shares this exact failure mode — EM will
fit *k* Gaussians with real means/covariances to structureless data just as readily — yet
`gmm.sheet.json.nodeQualia.featureStats` has no Hopkins-equivalent entry. Nor does GMM's own
selection mechanism rescue this: `hpMeta.n_components.prior` is `"int-uniform[2,15]"`, which
**excludes k=1 from the search space**, so a BIC sweep can never surface "the data prefers a single
Gaussian" (i.e., no real multi-modal structure) — the one value that would let BIC itself detect the
no-structure case is defined out of the search. (Excluding 1 is independently well-motivated —
`edgeCases[]` correctly flags `n_components = 1` as degenerate, "a density estimator, not a
segmentation" — but that motivation addresses a different problem than tendency-detection and
doesn't substitute for it.) DBSCAN's parallel omission is comparatively defensible: its own
`noise_fraction` / `cluster_count_vs_eps_stability` metrics already self-diagnose the no-structure
case (all-noise or one blob), so a redundant Hopkins entry there is a genuine judgment call, not a
gap. GMM has no equivalent built-in tell.
*Ruling*: add a `hopkins_statistic`-class featureStat to `gmm.sheet.json.nodeQualia.featureStats`
(same rationale as its siblings), and/or widen `n_components.prior` to include 1 so the BIC sweep
can itself surface the no-structure verdict.

**2. `gmm.sheet.json.hpMeta.n_init.default` is `5`; scikit-learn's actual (and, per the docs,
version-stable — no "changed in version X" note the way `KMeans.n_init` carries) default for
`GaussianMixture` is `1`.** Verified directly against the current API reference. This is lower
materiality than #1 but is a clean, unambiguous, verifiable transcription slip, not a judgment call:
unlike the family's "k-like" parameters (kmeans `n_clusters`, gmm `n_components`, hierarchical
`n_clusters` — all `searchable:true` and explicitly documented as swept rather than literal
constants), `n_init` is marked `searchable:false`, meaning it is presented as the value actually
used, not overridden by search. There is no `note` explaining a deliberate deviation from the
library default — contrast with `hierarchical.sheet.json.hpMeta.compute_distances.default:true`
(sklearn's real default is `false`), which the sheet correctly annotates with *"must be true to
export the dendrogram"* to justify the deviation. GMM's `n_init:5` carries no analogous
justification. (Minor, same-class nit: `hierarchical.sheet.json.hpMeta.n_clusters.default` is `4`;
sklearn's actual default is `2`. Lower priority than the GMM case — `n_clusters` there is
`searchable:true` with an explicit "sweepable... not a fit parameter" note, and `2` is not
independently flagged as degenerate the way GMM's `n_components=1` is, so a plausible-round-number
default is a much smaller stretch. Flagging for completeness, not as a separate material finding.)
*Ruling*: correct `n_init.default` to `1`, or add a `note` if `5` is a deliberate robustness choice
(more EM restarts is a defensible answer to EM's well-known local-optima sensitivity) — mirroring
the `compute_distances` convention already established in the sibling sheet.

**Most important: #1.** It is a structural gap in exactly the axis the task asked this review to
verify (the demand-gate/Hopkins lesson), not a leaf-level default-value typo — and it means the
lesson the study clearly wants encoded family-wide is currently protected for 2 of 4 members and
silently unreachable-by-design for the third (GMM), while being redundant-but-harmless for the
fourth (DBSCAN).

## Judgment calls

**A. DBSCAN `deterministicFit: true` alongside an explicit border-point order-dependence caveat in
`edgeCases[]` — ruling: correct as designed, not an error.**
`edgeCases[]` states plainly: *"border point reachable from two clusters" → "assignment depends on
row order — the one non-deterministic seam in an otherwise deterministic fit"* (mitigation:
`bank-entry`). This is not a contradiction of `deterministicFit:true`; it matches scikit-learn's own
framing almost exactly (the algorithm is deterministic for a fixed dataset/order, but *some* border
points can fall to whichever cluster's core point claims them first, which depends on processing
order — a genuinely different, narrower kind of non-determinism than kmeans/gmm's RNG-seed
dependence). The two families of "non-determinism" are not the same fact: kmeans/gmm can produce a
*different* result on two `.fit()` calls against the identical, identically-ordered input unless
`random_state` is pinned (no such algorithm exists for DBSCAN at all — it has zero randomness). The
top-level boolean correctly captures that coarser, more consequential distinction (does this model
need a seed to be reproducible at all); the narrower row-order caveat is correctly housed in
`edgeCases[]` rather than overloading the axis. **Constructive note for U2/U4**: `invariances[]`
flags carry a `basis` field for exactly this kind of nuance-without-collapsing-to-a-single-bit;
`axes.deterministicFit` has no equivalent (no `caveat`/`basis` companion), which is why this nuance
had to live entirely in a differently-scoped section (`edgeCases`) disconnected from the axis it
qualifies. Worth flagging as a template extension candidate, though the current sheet's choice
within the existing template is sound.

**B. `gmm.sheet.json`'s `scaleSensitive: true` / `basis: "empirical"` (not `mechanism-derived`) paired
with `placementClaims.scale.verdict: "beneficial"` (not `required`) — ruling: confirmed correct, and
the most precisely-reasoned resolution in the whole family.**
This is the exact nuance the independent inventory flagged as the crux question before reading any
sheet: full-covariance EM is, in the idealized limit, affine-equivariant (each component's own
covariance absorbs a linear rescaling — a real, well-established property distinguishing GMM from
kmeans's single global isotropic metric), so "scale REQUIRED" in the same unconditional,
mechanism-level sense as kmeans/dbscan/hierarchical genuinely overstates the case. The sheet's
`why` string independently names the three concrete reasons scaling still matters in practice — the
kmeans-based initialization (`init_params` default `kmeans`), the `reg_covar` floor being an
absolute-unit constant, and the diag/spherical `covariance_type` options collapsing toward
kmeans-like behavior — which is precisely the resolution the independent inventory arrived at before
reading the sheet. Tagging the flag `empirical` rather than `mechanism-derived`, and downgrading the
`scale` placement from `required` to `beneficial` (the *only* placement in the family not marked
`required` for an otherwise-`scaleSensitive:true` model), is internally consistent with lint rule 3
(which forbids `required` only under `scaleSensitive:false`, not the reverse) and is the correct
epistemic move: it distinguishes "empirically recommended for numerical stability/convergence" from
"mathematically necessary for the objective to be meaningful." No escalation needed beyond what
`decisions.md` already logs.

**C/D. kmeans `centroids` port proposal and hierarchical `linkage-tree` port proposal — ruling: both
confirmed sound, advance to U2.**
Both proposals correctly identify a real structural gap: the fitted artifact that most defines each
model (kmeans's k×p centroid matrix; hierarchical's full merge tree, `children_`+`distances_`) has
no dedicated port or `paramsAsOutput` enum value today, so it rides as a side-note on the `cluster-id`
emission (`paramsAsOutput:"centroids"` for kmeans — already an enum value, just not a typed edge;
`paramsAsOutput:"none"` for hierarchical, a genuine enum gap since no value exists for it at all).
Both proposals correctly scope the ask (a downstream nearest-centroid scorer or profiler needs the
k×p matrix as typed data, not indirectly via a cluster-id side-channel; a taxonomy display / multi-
resolution re-cut / cophenetic-analysis consumer needs the tree, not just one fixed cut's labels) and
correctly note the interim workaround already in place. Consistent with the analogous already-queued
proposals from other families (`loadings` for pca, `predictive-distribution` for gp) — this is a
recurring, legitimate pattern (a model's headline fitted-parameter artifact deserves a typed port),
not a clustering-specific one-off.

**E. hierarchical `interpretabilityClass: "Rules"` for a dendrogram — ruling: defensible-by-elimination
within the current closed 4-value enum, but genuinely stretches the ordinary meaning of "Rules" and
is worth escalating as a taxonomy question, not treating as settled.**
The sheet is admirably self-aware about this — `identity.description` states outright: *"'Rules' is
the nearest 4-way fit for the dendrogram: a human-readable nested merge structure, though **not**
literal decision rules."* Walking the alternatives inside `{Coefficients|Rules|ImportanceOnly|
BlackBox}`: `Coefficients` doesn't fit (no per-feature readable vector is the model's fitted
knowledge — the dendrogram encodes merge order/structure, not per-feature values, which is exactly
why the sheet also proposes `linkage-tree` as a missing artifact type in finding C/D above);
`ImportanceOnly` doesn't fit (no feature-importance notion at all); `BlackBox` — the bucket DBSCAN
correctly gets — would actually *understate* hierarchical's interpretability relative to DBSCAN's:
DBSCAN's fitted artifact is genuinely opaque beyond a raw label set (`paramsAsOutput:"none"`, "no
parametric summary exists"), whereas a dendrogram is routinely read visually by analysts to reason
about nested sub-population structure — a real, qualitative difference the enum has no room to
express. So "Rules" is the least-wrong of four bad options, correctly disclosed as such. But a
downstream consumer who takes `interpretabilityClass` at face value (e.g., "export this as IF-THEN
logic," the ordinary meaning "Rules" carries for a decision tree or rule list) would be misled — a
dendrogram cannot be read off as feature-threshold rules. **Same tension, lower stakes, appears for
kmeans/gmm's `Coefficients`** — a centroid vector is a per-feature readable value structurally similar
to a coefficient row, but semantically it's a cluster mean location, not an effect-on-target
coefficient; the analogy holds better than hierarchical's but is still an analogy, not identity.
*Ruling*: not a confirmed error given the closed enum and the sheet's own disclosure, but escalate to
U2/U4 as a taxonomy question — does the 4-value `interpretabilityClass` enum need a 5th bucket
(e.g., `Structure`/`Hierarchical`) for human-navigable-but-not-rule-based artifacts, or is
"least-wrong-of-four plus a disclosed caveat in `description`" the intended long-term convention?

**F. Real-data demand-gate lesson (cluster tendency ≠ supervised lift) — confirmed encoded, with the
gap noted in Confirmed error #1.**
`kmeans.sheet.json.additionalObservations[0]` ("demand-gate") states it almost verbatim to the
instruction's framing: *"cluster tendency (Hopkins) alone does NOT imply supervised lift... Clusters
are a segmentation deliverable FIRST (profiling, targeting, reporting) and a candidate feature
SECOND — gate cluster-feature promotion on measured lift in the supervised pipeline, never on
cluster-quality metrics alone."* This is reinforced by the matching `hopkins_statistic` featureStat
`why` and by `edgeCases[]`'s "single cluster truly present (Hopkins ≈ 0.5)" entry (`kmeans still
returns k confident segments — an artifact`, mitigation `gate`). `hierarchical.sheet.json`
independently reinforces the same lesson via its own `hopkins_statistic` entry. The lesson is real
and correctly encoded for 2 of 4 family members; see Confirmed error #1 for the GMM gap and DBSCAN's
lower-priority, self-diagnosing exception.

## Reviewer errors

- The independent inventory's first-pass framing of the DBSCAN finding (item A) implied the
  `deterministicFit:true` flag itself needed qualification — on inspection, the qualification is
  present and correctly located (`edgeCases[]`), and scikit-learn's own documented framing draws the
  identical "deterministic overall, except a narrow border-point seam" distinction. The more accurate
  statement is that the *caveat needs a structural home co-located with the axis it qualifies* (a
  template gap, noted above), not that the sheet's flag value is wrong. Retracting the implication
  that the boolean itself was mis-set.
- The inventory flagged a real risk that a sheet might map k-selection to silhouette uniformly across
  the family, including GMM, without acknowledging BIC/AIC as GMM's more principled,
  likelihood-native criterion. This did not happen — `gmm.sheet.json.hpMeta.n_components.note`
  correctly leads with BIC/AIC and uses silhouette only as a family-comparability cross-check,
  matching `nodeQualia.modelMetrics.bic_vs_k_curve`'s explicit framing ("GMM's unique privilege in
  this family"). Recording this as a pre-registered concern that was **not** borne out, not as an
  error to fix.
- The inventory under-anticipated the richness of GMM's `emits[]`: it expected the soft/hard
  assignment duality (`soft-assignment` + `cluster-id`) but did not anticipate the third port,
  `anomaly-score` (native `score_samples`), as a natural corollary of GMM being a genuine density
  model. This was a gap in the reviewer's own inventory, not in the sheet — the sheet's handling is
  more complete than what was independently expected going in.
- The inventory was initially unsure whether `KMeans.n_init`'s sklearn default was still the literal
  integer the sheet lists (`10`) or the newer `'auto'`. Verification confirmed `'auto'` became the
  default in sklearn 1.4, but the sheet's own declared dependency floor (`scikit-learn>=1.3`) still
  used the literal `10` (with a deprecation warning) at that floor version — so `10` is accurate
  relative to the sheet's stated dependency, not an error. Contrasted directly against GMM's `n_init`
  (Confirmed error #2), whose incorrect default of `5` cannot be explained by any analogous
  version-drift, since scikit-learn's docs show no "changed in version X" note for that parameter at
  any point — strengthening rather than undermining that finding.
