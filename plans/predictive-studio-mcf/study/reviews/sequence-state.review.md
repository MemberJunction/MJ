# Independent Review — `sequence-state` family (markov_chain, hmm, markov_switching, kalman_dlm, structural_ts, var)

Reviewer built an expected inventory BEFORE opening `sheet-template.md` or any sheet:
MarkovChain (observed states, transition-matrix by counting, deterministic MLE); HMM (hidden
regimes, EM local-optima → non-deterministic + seed matters, label-switching, the validated
latent-state→features:tabular activity-cadence use); MarkovSwitching (regime-switching
regression, multimodal likelihood → multi-start hedge); Kalman/DLM (linear-Gaussian state
space, exact in-filter NaN handling → impute HARMFUL, filtered-vs-smoothed leakage discipline);
StructuralTS (UnobservedComponents level/trend/seasonal, same Kalman machinery as DLM);
VAR (multivariate — needs K aligned series, per-equation OLS deterministic, companion/lag
matrix which must NOT be punned onto `transition-matrix` since it is not row-stochastic).
Comparison below, plus source-level fact-checking against the `statsmodels`/`hmmlearn`
installs present in this repo's `phase0/.venv` (grepped `structural.py`, `markov_switching.py`,
`markov_regression.py`, `var_model.py`, `hmm.py` directly, since the venv's compiled numpy is
broken for import but the source text is intact).

All six sheets' library-class facts checked out against source: `UnobservedComponents`'s
`'llevel'/'lltrend'/'rwdrift'/'strend'` abbreviations are real (not invented shorthand);
`GaussianHMM`'s `covariance_type='diag'`/`min_covar=1e-3` defaults match; `MarkovRegression`'s
`k_regimes`/`trend`/`order` and `MarkovSwitching.fit`'s `search_reps` param are real;
`VAR.fit`'s `ic∈{aic,fpe,hqic,bic,None}` / `trend∈{c,ct,ctt,n}` match exactly. No fabricated
API surface anywhere in the family.

## Confirmed errors

1. **`markov_switching` silently drops the filtered-vs-smoothed leakage discipline that its two
   state-space siblings (`kalman_dlm`, `structural_ts`) correctly enforce — a real,
   mechanism-derived omission, not a stylistic gap.** Verified directly against
   `statsmodels/tsa/regime_switching/markov_switching.py`: `MarkovSwitching`/`MarkovRegression`/
   `MarkovAutoregression` results expose **both** `filtered_marginal_probabilities` (Hamilton
   filter, forward-only, as-of-safe) **and** `smoothed_marginal_probabilities` (Kim smoother,
   conditions on the whole sample) as separate attributes — the exact same forward-filter /
   backward-smoother pair that `kalman_dlm` and `structural_ts` build their entire
   filtered-vs-smoothed discipline around. But `markov_switching.sheet.json`'s `latent-state`
   emit documents only "smoothed marginal regime probabilities per time step — the primary
   product," its `canBeSeeds` entry says "current-regime probability as a feature" with no
   `(FILTERED)` qualifier (contrast `kalman_dlm`'s and `structural_ts`'s explicit "latent-state
   (FILTERED) →" phrasing), its `driver.wrapperNeeds` never calls out exposing filtered vs.
   smoothed as separate channels (contrast `kalman_dlm`: "expose filtered vs smoothed states as
   SEPARATE latent-state channels so the as-of/leakage distinction survives into feature
   assembly"), and there is no `edgeCases` entry parallel to `kalman_dlm`'s/`structural_ts`'s
   "smoothed states used as as-of features → leakage → gate." A feature-assembly consumer that
   naively takes `markov_switching`'s regime probability as an as-of member feature gets a
   probability that was computed using the member's entire future — silently — exactly the bug
   the sibling sheets exist to prevent. `decisions.md`'s own sequence-state row ("nativeNaN TRUE
   ⇒ impute HARMFUL for state-space … kalman_dlm, structural_ts") already names the two siblings
   but misses that `markov_switching` needs the *other* half of the same state-space discipline
   (filtered/smoothed, not NaN-handling — `markov_switching.nativeNaN` is correctly `false` since
   the Hamilton filter needs a gap-free series, so this is not a NaN-handling gap, it's the
   leakage-discipline gap specifically).

2. **`hmm`'s `consumes[0].dtypes` variant-split isn't stated explicitly, breaking with the
   established cross-family convention for exactly this situation** (lower severity). HMM lists
   `["numeric-multichannel", "categorical-token"]` in one `consumes[0]` entry because
   `GaussianHMM` (numeric-only) and `CategoricalHMM` (categorical-only) are mutually exclusive
   estimator variants — but the note only explains hmmlearn's concatenated-X-plus-lengths
   packing, never which dtype routes to which class. The precedent for this exact
   variant-dispatch situation already exists in the corpus:
   `classic-supervised/naive_bayes.sheet.json` states it explicitly — *"variant-split contract:
   continuous features → GaussianNB; non-negative count-like features → MultinomialNB (negative
   values are a hard error there)."* HMM's split is recoverable from `identity.libraryClass` +
   `driver.constructor`, but a reader of only the `consumes` block (the composition-input
   contract, per the template) doesn't get it, unlike naive_bayes. A one-clause addition
   ("Gaussian variant ← numeric-multichannel; Categorical variant ← categorical-token") would
   close this at zero cost.

## Judgment calls

1. **VAR `dynamics-matrix` DISTINCT from `transition-matrix` — RULING: DISTINCT, confirmed with
   high confidence.** A `markov_chain`/`hmm`/`markov_switching` `transition-matrix` is, by
   construction, **row-stochastic**: every entry ∈ [0,1], every row sums to 1, and it represents
   conditional probabilities P(next state | current state). VAR's per-lag coefficient matrices
   (and the VAR(1) companion-form assembled from them) carry **no such constraint** — entries
   are unconstrained reals (can be negative, can exceed 1), and rows carry no probabilistic
   meaning at all; the object's only structural invariant is a stability condition on its
   *eigenvalues* (companion eigenvalue modulus < 1), not row-sum-to-1. Punning the two onto one
   port would be a genuine type-safety failure with a concrete downstream victim already visible
   in this very family: `markov_chain.sheet.json`'s own `transition-matrix` emit note says the
   matrix is "directly consumable downstream (steady-state analysis, churn-path features)" — a
   steady-state computation is exactly a left-eigenvector-at-eigenvalue-1 of a row-stochastic
   matrix, which is either undefined or silently wrong when run against a VAR companion matrix
   that has no eigenvalue pinned at 1 by construction. The sheet's `dynamics-matrix` proposal
   (deferred to U2, structure shipping inside `coefficients` until then) is the correct call, and
   notably the producer identified and hedged this risk *before* I opened the file — it matches
   my blind pre-registered expectation exactly and required no correction from me.
2. **VAR `series:multi`/`panel` port proposal — RULING: approve as a genuine gap, correctly
   scoped as an interim convention.** Every other family member's `series` port is a single
   `numeric-time-indexed` scalar stream; VAR needs K series accessed **simultaneously per
   timestep** (the joint K-vector IS the state — you cannot fit a VAR from K independently-typed
   univariate `series` ports without an explicit alignment/bundling contract). That's a different
   shape than "several `series` ports happen to share an index," so the current "wide-frame on
   `series`" stopgap, explicitly declared as such in the sheet rather than silently assumed, is
   the right interim move. `decisions.md` already queues this correctly for U2.
3. **`kalman_dlm`/`structural_ts` `nativeNaN:true` ⇒ impute `harmful` — RULING: confirmed
   correct, and correctly NOT over-generalized.** Verified against `structural.py`: both models
   ride the identical Kalman-filter machinery, which skips the measurement update exactly at a
   missing observation and propagates the state prior with honestly widened uncertainty — so
   pre-imputation genuinely fabricates certainty the filter would otherwise represent honestly.
   Both sheets state the mechanism identically and correctly. Equally important: the other four
   family members correctly do NOT inherit this exemption — `markov_chain` (gap-splicing
   fabricates a transition), `hmm` (Baum-Welch has no missing-observation update), `markov_switching`
   (Hamilton filter needs a gap-free series), and `var` (OLS on a lagged design needs a complete
   aligned panel) all correctly keep `nativeNaN:false` + impute `required`. The family draws this
   line exactly where the math draws it, not by analogy across all "sequence" models.
4. **`markov_switching` omits `forecasting` from `secondaryTasks` and emits no `forecast-series`
   port, despite `statsmodels.tsa.regime_switching.markov_switching.MarkovSwitching.forecast()`
   existing** (verified in source). This is a defensible, explicitly-reasoned scope decision —
   `invariances.extrapolates.why` states "though the family's product is the regime path, not the
   forecast" — and it's internally consistent (no `forecast-series` in `emits`, so no
   `secondaryTasks` claim to back it). But since the library capability is real and a downstream
   composition need ("regime-aware forecast" as a template) is plausible, flag for a U3 sanity
   check that this is deliberate scope, not an oversight carried over from the sibling sheets'
   copy-paste.
5. **Literal-math overlap between `kalman_dlm(state_spec=local-level)` and
   `structural_ts(level='llevel', seasonal=null, cycle=false, autoregressive=null)`.** Both are,
   for that one configuration, the identical fitted `UnobservedComponents`-class object —
   `kalman_dlm`'s own description even calls local-level "a canonical instance." Not a factual
   error (both sheets acknowledge the relationship), and the two are reasonably distinguished by
   product framing (`kalman_dlm`'s `paramsAsOutput:"none"` raw latent-state + TVP-regression +
   explicit filtered/smoothed-channel emphasis vs. `structural_ts`'s `paramsAsOutput:"components"`
   named-decomposition framing, extensible to seasonal/cycle/AR) — but worth a U3-level check that
   a composition/recommendation layer doesn't end up double-offering both for a bare
   local-level-only need with no way to tell them apart.
6. **`dataSizeTolerance:"needs-total-length"` (hmm)** is a new free-text value not in the T-2
   controlled-vocabulary draft (`{tiny-ok, small-friendly, medium, needs-many, needs-history}`
   from `decisions.md`). Not a new problem specific to this family — T-2 is already an open
   cross-family item, and sequence-state's other five sheets mostly land on already-seen values
   (`small-friendly` ×2, `needs-history` ×3) — this just adds one more divergent string to the
   pile T-2 is meant to eventually collapse. Flagged for completeness, not escalated.

## Reviewer errors

1. I went in expecting to have to be the one to catch the VAR companion-matrix /
   `transition-matrix` type-punning risk (it was explicitly named in my task brief as the thing
   to scrutinize hardest). It turned out to already be correctly identified and hedged by the
   sheet itself, with a more precise justification (row-stochastic vs. unconstrained real-valued,
   with the eigenvalue-stability framing) than I'd have produced cold. My adversarial prior
   overestimated the likelihood of finding an error in exactly the spot I was told to look
   hardest at.
2. I flagged, mid-review, VAR's lack of an explicit Granger-causality / impulse-response-function
   emit port as a possible gap (the description text namechecks both "Granger structure" and
   "impulse responses" with no matching port). On closer read this is explicitly and correctly
   scoped out by the sheet's own `dynamics-matrix` proposal note: *"If IRF/Granger consumers
   emerge, propose a distinct `dynamics-matrix` port for U2; until then the structure ships inside
   `coefficients`."* Deliberately deferred and clearly flagged, not an oversight — I should not
   have logged this as independent evidence beyond the single already-tracked proposal.
3. I suspected `portTypeProposal` (used twice in `var.sheet.json`) might be an ungoverned,
   family-invented key — the same species of template drift the coordinator already rejected for
   `scorecard`'s `learningTypeNote` (T-3 in `decisions.md`: "Reject extra keys; fold the nuance
   into `description` or a sanctioned field"). A full-corpus grep showed `portTypeProposal` is
   already used by 14 sheets across 8 other families (km, pca, lasso, kmeans, hierarchical, gp,
   quantile, prophet, lda, association_rules, bg_nbd, gamma_gamma, pareto_nbd, implicit_als) and
   is already tracked as a sanctioned escape hatch in `decisions.md`'s port-vocabulary-proposal
   queues. Not template drift — an established convention I hadn't cross-checked before
   suspecting it.

## Summary

- **Counts**: 2 confirmed errors (1 high-confidence mechanism-derived omission, 1 low-severity
  documentation-completeness gap), 6 judgment calls, 3 reviewer errors (self-corrected).
- **Most important confirmed error**: `markov_switching` emits only *smoothed* regime
  probabilities as `latent-state` with no filtered channel, no `(FILTERED)`-qualified
  `canBeSeeds`, and no leakage `edgeCase` — even though `statsmodels` exposes
  `filtered_marginal_probabilities` right alongside `smoothed_marginal_probabilities` via the
  same Hamilton-filter/Kim-smoother machinery its siblings `kalman_dlm`/`structural_ts` correctly
  split into two disciplined channels. This is a real as-of-leakage trap for any feature-assembly
  consumer, not a stylistic inconsistency.
- **`dynamics-matrix` vs `transition-matrix` verdict: DISTINCT.** Row-stochastic Markov
  transition probabilities and an unconstrained real-valued VAR companion/lag-coefficient
  operator are different mathematical objects with different downstream-safe operations
  (steady-state eigenvector analysis is valid on the former, meaningless on the latter); punning
  them onto one port would silently enable illegal/undefined wiring. The sheet's proposed split
  (defer to a new `dynamics-matrix` port at U2, ship inside `coefficients` until then) is correct
  and should be adopted as written.
