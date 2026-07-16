# Independent Review — `forecasting/{arima,ets,prophet,theta,croston,seasonal_naive,sma}.sheet.json`

Reviewer built an expected inventory (time-ordered validation as a mandatory gate; MASE-vs-seasonal-naive
as the honest floor; learns-vs-reusable-only split; ETS statespace-vs-Holt-Winters interval nativeness;
Prophet's cmdstan dependency + prophet-json serialization + changepoint/seasonality decomposition; Croston
for intermittent demand; monotone-transform commutativity) BEFORE opening `sheet-template.md` or any of the
7 sheets. Comparison below. `arima` is one of the 3 GOLD sheets that froze the template (U1 evidence), so
findings against it carry extra weight.

## Confirmed errors

1. **`arima.hyperparameters.hpMeta` is missing the seasonal AR/I/MA orders (P, D, Q) that its own driver
   constructor requires, and the one seasonal hyperparameter it does declare has an incoherent
   `conditionalOn`.** `driver.constructor` is literally `"ARIMA(endog, order=(p,d,q),
   seasonal_order=(P,D,Q,s)).fit()"` — four seasonal-order symbols (P, D, Q, s). Only `s` (as
   `seasonal_periods`) has a corresponding `hpMeta` entry; `P`, `D`, `Q` never appear anywhere in
   `hyperparameters`. As specified, nothing (search/wave strategist or otherwise) has a declared surface to
   propose seasonal AR/I/MA depth — SARIMA's seasonal fitting is asserted (`aliases: ["SARIMA", ...]`,
   description: "and (with seasonal terms) periodicity", `edgeCases`/`nodeQualia` both discuss seasonal
   orders at length) but not actually exposed as tunable. Compounding this, `seasonal_periods.conditionalOn`
   is set to `"d"` (the non-seasonal differencing order) — logically, whether the cycle length `s` needs
   searching depends on whether seasonality is *present in the data*, not on the value of `d`. Contrast with
   `ets.sheet.json`, which handles the analogous case correctly: an explicit `seasonal` categorical
   hyperparameter, and `seasonal_periods.conditionalOn: "seasonal"` — the right pattern, applied to the
   wrong (or a nonexistent) target key in `arima`. This is the family's most concrete, mechanically
   checkable gap, and it sits in a gold sheet.

2. **Undeclared `note` keys recur in two different locations across three sheets, extending the
   already-open T-3 template-drift item to new evidence.** `decisions.md` T-3 currently reads narrowly
   ("extra key `learningTypeNote` added outside the template" — raised against `scorecard`). This family
   independently reproduces the same failure mode twice, in two different sections:
   - `prophet.axes.note` — an undeclared key bolted onto `axes`, same location/species as T-3's original
     finding. (`axes.secondaryTasks` is NOT flagged here — the gold `arima.sheet.json` itself carries
     `secondaryTasks: []`, so that key is part of the true frozen shape even though the template prose
     under-documents it; `axes.note` has no such gold-sheet cover.)
   - `seasonal_naive.learnsVsFixed.note` and `sma.learnsVsFixed.note` — a **third, previously unlogged**
     location. The template's declared `learnsVsFixed` shape is exactly `{learns (bool), reusability
     (trainable|reusable-only|both)}`; two of seven sheets in this family alone add a free-floating `note`
     field there.
   Because producers author independently and never see other families' sheets, three separate producers
   converging on the identical "just add a `note` key where I need one" workaround (in three different
   locations, no less) is strong, fresh evidence that `sheet-template.md` needs an actual sanctioned
   `notes?`/`note?` extension point — not that any one sheet made an isolated mistake. Recommend folding
   this family's instances into T-3 rather than opening a parallel item.
   (Noted but NOT flagged as drift: `hpMeta.<param>.note` is used in literally every `hpMeta` entry across
   all 7 sheets, with zero exceptions — that uniformity, unlike the sporadic 1-of-7/2-of-7 pattern above,
   reads as an already-accepted de facto convention rather than drift, so it's excluded from this finding.)

3. **`prophet.portTypeProposals`** is a fourth undeclared top-level key (the template's twelve named
   sections do not include it). Its *content* is sound and is already independently captured in
   `decisions.md`'s "Port proposals — linear-glm / reco / pattern / forecasting (U2 queue)" table
   (`series-components | prophet`) — so the coordinator's extraction pipeline evidently already copes with
   this pattern. Filed here as a confirmed structural finding (an undeclared key literally exists in the
   sheet), but see the Judgment calls section for the mechanism ruling — this is the same split as #2, just
   a fresh location, and given decisions.md already has a proposal-queue table shape, formalizing
   `portTypeProposals[]` as a sanctioned template key (rather than re-deriving the same ad hoc pattern per
   family) seems like the cheap fix.

## Judgment calls

- **Prophet `series-components` port-type proposal.** RULING: approve. `paramsAsOutput: "components"` on
  the `forecast-series` emit is already a legal enum value per the template (`...|survival-curve|components|
  rules|...`), so Prophet's actual emission is spec-conformant on its own. The *separate* proposal — that
  the per-timestamp trend/seasonal/holiday decomposition deserves a first-class `series-components` port
  distinct from both `forecast-series` (which "hides" it) and `coefficients` (which "misdescribes" a
  per-timestamp series as a per-model scalar block) — is well-reasoned and correctly scoped as a *proposal*
  (not asserted as adopted), consistent with the queued state it already has in `decisions.md`. Approve the
  content; the *location* (`portTypeProposals[]` as an undeclared top-level key) is the mechanism question
  addressed above, not a content defect.

- **Croston `IMPLEMENTATION SOURCE UNRESOLVED`.** RULING: approve, good practice. `statsmodels` genuinely
  has no Croston implementation; the sheet honestly surfaces the real choice (take a `statsforecast` dep for
  one niche method vs. hand-roll ~40 LOC) rather than silently picking one and hiding the tradeoff, and
  restates the uncertainty consistently in both `identity.libraryClass` and `driver.deps`/`driver.constructor`.
  Minor-only style note: stuffing the caveat into `identity.libraryClass` (documented as "e.g.
  `xgboost.XGBClassifier`" — a plain class path) is redundant with the driver-section restatement, which is
  the mechanically appropriate home for dependency uncertainty — but harmless, not lint-checked, and
  arguably belt-and-suspenders rather than a defect.

- **`sma` dual-emit (`forecast-series` floor role + `series` smoother role).** RULING: approve the dual
  emit itself — both port types are legal, the roles are genuinely distinct (a flat repeated mean vs. the
  full rolling-mean series), and `wrapperNeeds` correctly describes a dual-role wrapper (`forecast(horizon)`
  and `transform() -> smoothed series`) to back it up. Flagged, not resolved: `canBeSeeds` is `[]`, even
  though the sheet's own prose calls the `series` emit "the composition role that distinguishes sma from
  seasonal_naive" and that emit's `portType` (`series`) exactly matches what every other family member's
  `consumes[]` declares as its required input — i.e., sma's smoothed output is structurally exactly the
  shape needed to seed e.g. an `ets`/`theta` `consumes.series` slot, which is what a `canBeSeeds` entry is
  for. Not promoted to a confirmed error because `canBeSeeds` is `[]` uniformly across **all seven** sheets
  in this family (composite-template slots for forecasting apparently don't exist yet anywhere in the
  catalog), so singling out sma as "wrong" isn't clearly justified versus "the whole family hasn't
  addressed this yet." Worth a note for whoever defines the first forecasting composite template.

- **`seasonal_naive` as the family's only `monotoneTransformInvariant: true` member.** RULING: confirmed
  true, verified by checking every sibling directly rather than taking the claim on faith: arima, ets,
  prophet, theta, croston, and sma all carry `monotoneTransformInvariant: false` with mechanism-derived
  `why`s that hold up (differencing/link-function structure, zero-partition destruction, Jensen's
  inequality on the mean, respectively). `seasonal_naive`'s own `why` — "copying commutes with ANY
  pointwise transform ... the family's only transform-invariant member" — is in fact an understatement of a
  stronger true property (invariance to *any* function, not just monotone ones), but that's a bonus, not an
  error, and the flag's own name is scoped to monotone transforms so `true` is the exactly correct value.
  `placementClaims.transform: "irrelevant"` for `seasonal_naive` is internally consistent with this flag,
  same for `sma`'s `"beneficial"` given its `false`.

- **`dataSizeTolerance` value `"minimal"` (sma only).** Not a sheet defect — free-text values are still
  pre-U2 — but worth recording as fresh evidence for the already-open T-2 vocabulary-convergence item: 6 of
  7 sheets in this family (arima/ets/prophet/theta/croston/seasonal_naive) already use `"needs-history"`,
  which is literally one of T-2's five proposed canonical values, so the family is nearly pre-aligned;
  `sma`'s `"minimal"` is the one outlier that would need mapping (probably to T-2's proposed `"tiny-ok"`).

## Reviewer errors

1. I expected **explicit, per-sheet language mandating time-ordered validation** ("never shuffled k-fold")
   to appear as a stated gate in every sheet, and initially read the fact that only `prophet` and
   `seasonal_naive` say "time-ordered holdout" in prose (arima/ets/theta/croston/sma's
   `mase_vs_seasonal_naive.why` describe the metric without that phrase) as a possible documentation gap.
   Checking `PLAN.md` corrected this: time-ordered validation for this family is a **framework-level
   invariant**, not a per-sheet one — `carveLockedHoldout` "gains a time-ordered mode" specifically for T5
   (forecasting), applied uniformly regardless of what any individual sheet's prose says, and `PLAN.md`
   elsewhere states flatly that a "random-split validation" path is "explicitly refused" for this family in
   code. `sheet-template.md` also has no `validationStrategy` slot at all, and the producer brief in
   `fanout-plan.md` never asks for one. Restating this per-sheet would be redundant boilerplate the
   framework already guarantees structurally, not a missing gate — I over-imported generic time-series-ML
   hygiene into a template whose actual architecture handles it one layer up.

2. I expected every `learns:true` member to carry a `coefficients`-shaped emit exposing its fitted
   parameters, and read `theta`'s single `forecast-series`-only emit (no `coefficients` entry, despite
   "the fitted alpha and drift are retrievable") as a candidate omission. It is deliberate and correct: the
   template's `paramsAsOutput` enum only offers `coefficients+SE`, and theta's fitted parameters genuinely
   carry no standard errors — emitting `coefficients+SE` would overclaim precision that doesn't exist, so
   the sheet omits the emit rather than misrepresent it. `decisions.md`'s own queue ("paramsAsOutput enum
   needs plain `coefficients` (no SE) — RECURRING ... theta" — flagged HIGH priority for U2) already names
   theta as a source of exactly this gap, confirming the omission is a known, already-tracked vocabulary
   limitation rather than something theta's sheet got wrong.
