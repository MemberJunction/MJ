# Independent Review — `linear-glm` family (logistic_regression, ridge, lasso, elastic_net, ols, multinomial_logit)

Reviewer built an expected inventory from sklearn/statsmodels knowledge first — scale-sensitivity
mechanism per model (penalty-driven vs. solver-driven vs. equivariant), which implementations emit
SE/p-values vs. point estimates only, lasso's soft-thresholding sparsity, elastic_net's l1_ratio
endpoint degeneracies, and multinomial logit's IIA assumption — then opened `sheet-template.md` and
the six sheets to compare. No sheet content was consulted before the inventory was written.

Pre-read expectation, stated for the record: all penalized/gradient-fit members (ridge, lasso,
elastic_net, sklearn logistic_regression) are scale-sensitive for a **mechanism** reason — the
penalty operates on raw-unit coefficient magnitudes, so it literally changes the fitted optimum
under rescaling. Unpenalized MLE members (OLS, and — if fit without regularization — multinomial
logit) are scale-**equivariant**: an invertible rescaling of a column rescales only that column's
coefficient; predictions, likelihood, and p-values are unchanged. So for OLS, scale should be
"beneficial" (comparability + `X'X` conditioning), not "required" (identification). The sheets
confirm this split exactly — see Judgment Call A below.

## Confirmed errors

**1. (Most important) The `paramsAsOutput` enum has no plain "point-estimate coefficients" value,
so 4 of 6 sheets (`ridge`, `lasso`, `elastic_net`, `logistic_regression`) are forced to select
`"coefficients+SE"` for outputs that literally have no SE, and compensate with a free-text note.**
This is real, not a per-sheet slip — every sklearn-backed sheet in the family hits it, and every
one flags it correctly:
- `ridge.sheet.json` → `emits[1].note`: *"POINT ESTIMATES ONLY — sklearn computes no SEs..."*
- `lasso.sheet.json` → `emits[1].note`: *"POINT ESTIMATES ONLY (no SEs; post-selection inference is
  a research topic, not a library call)."*
- `elastic_net.sheet.json` → `emits[1].note`: *"POINT ESTIMATES ONLY — no SEs from sklearn..."*
- `logistic_regression.sheet.json` → `emits[1].note`: *"POINT ESTIMATES ONLY — sklearn computes no
  standard errors; **the enum has no plain 'coefficients' value.**"* (this sheet says it outright)

Cross-checked against `sheet-template.md` §emits: the documented enum is literally
`coefficients+SE|transition-matrix|centroids|loadings|survival-curve|components|rules|topic-dists|
latent-factors|none` — no bare `coefficients`. So this is a **U1-frozen-template defect**, not a
producer authoring mistake: the producer diagnosed it accurately and consistently, worked around it
honestly (never silently claimed SEs that don't exist), but the underlying vocabulary gap is real
and will recur in every other family with an sklearn-only coefficient-emitting model (this family
alone is 4/6; the pattern isn't linear-glm-specific). Severity: not blocking *this* family's sign-off
(the notes are truthful), but it needs a follow-up vocabulary extension (add a bare `coefficients`
value) before Doc 3's driver or Doc 4's tree can programmatically distinguish "has SE" from "point
estimate only" without parsing free text — and it should be logged now, before the fan-out compounds
it across the remaining families.

**2. `logistic_regression.sheet.json` → `hpMeta.penalty` enum (`[l2,l1,elasticnet]`) omits
`None`.** `sklearn.linear_model.LogisticRegression(penalty=None)` is a real, supported configuration
(unpenalized MLE via `lbfgs`/`newton-cg`/`newton-cholesky`) under the pinned `scikit-learn>=1.4`. Its
omission is a completeness gap in an otherwise-categorical enum, and it has a substantive
downstream implication: at `penalty=None` this model becomes exactly the same shape as `ols`/
`multinomial_logit` — an unpenalized MLE — and by the same mechanism argument in Confirmed-Error-
adjacent Judgment Call A/B below, it would become scale-**equivariant** too, which the sheet's
unconditional `scaleSensitive: true` (mechanism-derived, "the penalty ‖w‖ is unit-dependent") does
not caveat. I did not find this a blocking problem — see the ruling folded into Judgment Call A —
but the missing enum value itself is a plain factual gap independent of that ruling.

**3. Minor, low-confidence: the `solver` hpMeta enums in `ridge` (`[auto,cholesky,svd,lsqr,saga]`)
and `logistic_regression` (`[lbfgs,saga,liblinear,newton-cholesky]`) both look short relative to my
recollection of the full solver menus (`sklearn.linear_model.Ridge` also exposes `sparse_cg`, `sag`,
and — since 1.4, for `positive=True` — `lbfgs`; `LogisticRegression` also exposes `newton-cg` and
`sag`).** Neither field is `searchable`, so this is documentation completeness only, not a behavior
bug — I'm flagging it at low severity and low confidence (see Reviewer errors: not verified against
an installed sklearn this session).

## Judgment calls

**A. `ols.sheet.json` → `placementClaims[2]` (`scale`, verdict `"beneficial"`) against
`invariances[0]` (`scaleSensitive: true`).** The sheet explicitly reconciles what looks like a
contradiction: the `why` on `scaleSensitive` says *"the fit itself is scale-EQUIVARIANT (predictions
and p-values unchanged under rescaling), so scaling is comparability + numerics, not
identification"* and the placement `why` echoes it (*"the fit is scale-equivariant... scaling is not
mechanically required"*). Checked against the template's own lint rule 3 (`scaleSensitive:false ⇒
placement must be irrelevant/beneficial, never required`) — that rule is one-directional and doesn't
forbid `scaleSensitive:true` + `beneficial`, so this isn't even a near-miss on the letter of the
rule. On the substance: this is **correct**. OLS solved by direct linear algebra (`pinv`/`qr`) is a
textbook case of scale-equivariant MLE — rescale a column, its coefficient rescales inversely, the
fitted `Xβ̂`, residuals, R², t-stats and p-values are all numerically identical (bar floating-point
noise). "Required" would overstate the claim; "beneficial" (comparability of coefficient magnitudes,
better `X'X` conditioning per the sheet's own `condition_number` featureStat) is the right verdict.
**Ruling: not an error — this is the family's best-reasoned placement claim.**

**B. Companion question the task explicitly raises: does the same beneficial-not-required logic
apply to `multinomial_logit`, an equally unpenalized MLE?** `multinomial_logit.sheet.json` →
`placementClaims[2]` sets `scale: "required"` (not `beneficial`), with `why`: *"Newton's step
inverts a Hessian whose conditioning degrades with unscaled features — ill-scaling is a real
convergence failure mode, not just cosmetics."* At first pass this reads as an inconsistency with
OLS (both are unpenalized MLE; both are, in exact arithmetic, scale-equivariant at their true
optimum — rescaling a covariate in a GLM's linear predictor is a standard affine reparametrization
that leaves the likelihood surface's global optimum, and hence the fitted probabilities/log-odds,
unchanged). But the sheets are drawing a genuinely different distinction, and I rule it's
**correct, not inconsistent**: OLS's `pinv`/QR solve is a single closed-form linear-algebra step —
poor conditioning degrades numerical *precision* but the solve doesn't *fail*. MNLogit's default
`method="newton"` is iterative and inverts a Hessian at every step — poor conditioning there is a
genuine **non-convergence** failure mode (the model may simply not fit), not just reduced precision.
That is a real, mechanism-grounded difference in what "required" is protecting against (numerical
convergence vs. numerical precision), even though both models are analytically scale-equivariant at
their true optimum. **Net ruling on the task's central question: OLS = beneficial (fit doesn't
change, closed-form solve tolerates poor conditioning); multinomial_logit = required (fit doesn't
change either, but the iterative Newton solve can genuinely fail to reach it) — both verdicts are
correct, for two different and correctly-articulated reasons.** One soft critique: the binary
`required|beneficial|irrelevant|harmful` verdict enum conflates "required for numerical convergence
in practice" (MNLogit) with "required for the fitted model's correctness at all" (ridge/lasso/
elastic_net/logistic_regression, where scaling changes the actual answer, not just whether an
iterative solver reaches it) — both currently render as `required`. Worth a future distinction, not
a blocking issue now.

**C. `lasso.sheet.json` → `emits[1].note` proposes `portTypeProposal: 'feature-mask'` for the
zero/nonzero support pattern; `elastic_net.sheet.json`, whose own `identity.description` says it
"keeps lasso's exact-zero selection," carries no equivalent proposal note.** Ruling: the proposal
itself is well-scoped — it's explicitly conditional ("if selection composition becomes a template"),
not an unrequested vocabulary addition, which is the right restraint given the template's own stated
goal of keeping "coincidental nesting" out of the tree. Not an error. The asymmetry with elastic_net
is a minor consistency gap worth mirroring (elastic_net's support is equally mask-shaped except at
`l1_ratio=0`), but low-priority since the proposal is inert (not yet implemented) either way.

**D. `invariances[].basis` tagging for `dataSizeTolerance` is `"mechanism-derived"` everywhere in
the family except `logistic_regression.sheet.json`, which tags it `"empirical"`** despite a
structurally similar parameter-counting argument (*"a penalized convex MLE with O(p) parameters is
stable from tens of rows per feature"*) to `multinomial_logit`'s `mechanism-derived`-tagged version
(*"fits (K-1)*(p+1) parameters and the effective sample is the smallest category"*). Weak
justification exists for the split — "tens of rows per feature" is a rule-of-thumb heuristic with no
hard derivation, whereas MNLogit's claim is a direct combinatorial consequence of the parameter-count
formula — but it's a thin distinction to hang a different `basis` tag on. Minor taxonomy
inconsistency, not a factual error; would benefit from normalizing in a later pass.

**E. Validated, not an error — flagging as confirmation, not a finding:** `elastic_net.sheet.json`'s
`hpMeta.l1_ratio.prior` is `uniform[0.05,0.95]`, deliberately excluding both endpoints, with the note
*"1.0 IS lasso, and sklearn's own docs advise Ridge over coordinate descent at 0.0"* — and both
degeneracies are separately documented in `edgeCases[]` (`l1_ratio=0` → bank-entry to ridge;
`l1_ratio=1` → gate, "exactly lasso"). This is exactly right per sklearn's actual guidance and I have
no correction to offer here.

## Reviewer errors

- The exact current solver menus for `sklearn.linear_model.Ridge` and `LogisticRegression`
  (Confirmed-error #3) are reconstructed from training-time memory of the sklearn API surface, not
  verified against an installed `scikit-learn>=1.4` or its source/changelog in this session.
  Confidence is moderate, not execution-verified.
- `sklearn.linear_model.LogisticRegression(penalty=None)`'s availability and exact spelling
  (Confirmed-error #2) under the pinned `scikit-learn>=1.4` is likewise asserted from memory of the
  `'none'`-string → `None` deprecation cycle, not confirmed against an installed version this
  session.
- `statsmodels.discrete.discrete_model.MNLogit`'s default `maxiter=35` and `OLS.fit()`'s default
  `method='pinv'` (both of which I treated as correct, uncontested background facts while reading
  the `ols`/`multinomial_logit` sheets) are also asserted from memory, not confirmed against
  installed `statsmodels>=0.14` source in this session.
- I did not verify the sklearn version at which `Ridge`'s default `tol` moved from `1e-3` to
  `1e-4` (if it did) — I chose not to flag the sheets' `tol: 0.0001` default as a possible error
  given this uncertainty, rather than guess; noting the omission for the record instead of silently
  treating it as confirmed-correct.
