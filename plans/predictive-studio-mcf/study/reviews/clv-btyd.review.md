# Independent Review — `clv-btyd` family (bg_nbd, pareto_nbd, gamma_gamma)

Reviewer built an expected inventory from the BG/NBD (Fader-Hardie 2005), Pareto/NBD
(Schmittlein-Morrison-Colombo 1987 / Fader-Hardie-Lee), and Gamma-Gamma (Fader-Hardie 2013)
literature and the `lifetimes` Python package's documented API first (RFM-summary contract,
fitted-parameter meanings, P(alive) mechanics, the frequency>0 filter for monetary fitting, the
event-log→RFM featurizer as a required separate transformation), then opened `sheet-template.md`,
`study/decisions.md`'s existing clv-btyd entries, and the three sheets to compare. No sheet content
was consulted before the inventory was written. I additionally cross-checked usage against the
other 55 sheets in the corpus (`grep` over `portType`, `secondaryTasks`, `taskNote`) to establish
which of this family's conventions are novel vs. already-shared practice.

## Confirmed errors

**None found.** I could not identify a place where a sheet's claim is contradicted by the
mechanism or the `lifetimes` API. This family's sheets show a level of mechanism-level care that
held up under scrutiny on every check I ran, including several details that are easy to get wrong:

- **bg_nbd's `edgeCases[0]`**: "P(alive) ≡ 1 by construction" at frequency=0 is exactly right — the
  published conditional-probability-alive formula is piecewise, with the second (dropout) term
  gated by an indicator on `x>0`, collapsing to 1 identically at `x=0`. This is a well-known BG/NBD
  quirk (often cited as the reason practitioners reach for Pareto/NBD instead), and the sheet gets
  the *asymmetry* right too: pareto_nbd's sibling note ("< 1 for zero-repeat customers, because
  dropout can occur at any instant") is the correct contrast, since continuous-time dropout means
  even a never-repeating customer carries some death evidence.
- **gamma_gamma's population-mean formula** `E[spend] = p·v/(q−1)`, its `q>1` existence
  requirement, and the `q_constraint` fit-time flag are all correctly named and correctly tied to
  the right failure mode (`fitted q ≤ 1` → "bank-entry" → "refit with q_constraint=True").
- **gamma_gamma's frequency>0-only fit requirement** and the "consumes only REPEAT customers"
  framing match `lifetimes`' documented `GammaGammaFitter` constraint precisely, and the sheet
  correctly reject-inputs `frequency = 0` rows rather than trying to impute/gate them.
- Method names (`conditional_probability_alive`, `conditional_expected_number_of_purchases_up_to_time`,
  `conditional_expected_average_profit`, `customer_lifetime_value`,
  `summary_data_from_transaction_data`) and the RFM column names (`frequency`, `recency`, `T`,
  `monetary_value`) all match the real `lifetimes` API surface.
- **The `customer_lifetime_value(transaction_prediction_model, ...)` duck-typed interchangeability**
  between `BetaGeoFitter` and `ParetoNBDFitter` (both sheets claim this) is correct — both fitters
  expose the same `conditional_expected_number_of_purchases_up_to_time` signature `customer_lifetime_value` calls.

**Most important**: the absence of a confirmed error is itself the notable finding here. This is
the hardest family reviewed so far (three genuinely coupled, jointly-fit probabilistic models with
non-obvious edge-case asymmetries), and the producer visibly worked from the actual mechanism
rather than surface API skimming — e.g., getting the bg_nbd/pareto_nbd `x=0` asymmetry right is the
kind of detail that's trivial to flatten into "P(alive) is high for loyal customers" hand-waving,
and it wasn't.

## Judgment calls

### Ruling on the four flagged deep uncertainties

**1. `taskProposal:clv` — is CLV a distinct task, or regression+survival composed?**

Ruling: **legitimately a distinct task candidate for bg_nbd/pareto_nbd — but the family's own
framing overstates how strained gamma_gamma's fit is, and understates a cleaner alternative
framing (task-of-the-composition, not task-of-the-model).**

- For bg_nbd/pareto_nbd, "regression+survival composed" doesn't actually describe what's
  happening: there is no post-hoc pipeline where a survival component's output feeds a regression
  component. Both are jointly identified from ONE coupled likelihood over the same sufficient
  statistic (frequency, recency, T) — the purchase-rate heterogeneity and dropout heterogeneity
  parameters are fit simultaneously, not sequentially. That's a real mechanism difference from
  every existing task in the 10-value union, not just a labeling gap. It's compounded by a genuine
  contract mismatch: survival's `consumes[].targetSpec` is `duration+event` (an explicit censoring
  label); BTYD's is `none` (there is no separate label — the event log itself is what's modeled).
  A framework router dispatching on `targetSpec` cannot treat these as interchangeable "survival"
  inputs. I concur `clv`/`latent-attrition` deserves the U3 agenda slot, and `regression` (primary)
  + `survival` (secondary) is the correct interim least-wrong choice — it doesn't misrepresent the
  actual data contract the way forcing either single label would.
- For gamma_gamma, I'd push back on lumping it in with the same urgency. It has **no** attrition/
  dropout mechanism at all (the sheet's own `secondaryTasks: []` + "needs no survival secondary"
  concedes this). It's a hierarchical/empirical-Bayes shrinkage regression over one observed
  variable — taxonomically comfortable company for `regression` in this same catalog (ridge, GAM,
  poisson, tweedie are all parametric/distributional "regression" family members here too). If U3
  adopts a `clv`/`latent-attrition` task, I'd recommend scoping it to the two models that actually
  have the latent-attrition mechanic (bg_nbd, pareto_nbd) and leaving gamma_gamma as `regression`
  — not migrating all three symmetrically as `decisions.md`'s current entry implies.
- A second framing worth adding to the U3 agenda: is "CLV" actually a property of the **composed
  pipeline** (the `clv-composite` template + `customer_lifetime_value` call) rather than something
  that belongs on any individual model's `axes.task`? None of the three sheets, alone, "does CLV" —
  gamma_gamma's solo output is monetary regression; bg_nbd/pareto_nbd's solo output is
  survival-flavored purchase-count regression; "CLV" only exists once they're composed. This
  mirrors the already-resolved T-5 precedent in `decisions.md` ("the leaderboard floor is an
  orchestration/strategist concern, not a composition slot — no template change"). If that reading
  wins, no new `axes.task` value is needed at all — `clv` would live as a property/label of the
  `clv-composite` template, not the component sheets.

**2. `rfm-summary` port — agree, adopt it, and I'd shape it as a specialized `features:tabular`.**

This is a real, load-bearing shared contract: bg_nbd and pareto_nbd need exactly
(frequency, recency, T); gamma_gamma needs (frequency, monetary_value), a genuine subset/variant.
Today it's representable only as `event-log` + an unstated adapter, which under-documents the
actual input every fitter reads. It's also not a novel problem in this study — `decisions.md`
already logs a structurally identical gap from `km` (survival): "no ALL_PORT_TYPES member carries a
bare (duration,event) pair... km fallback documents features:tabular." I'd resolve `rfm-summary`
the same way rather than minting a wholly separate port-type root: a *named, fixed-column*
specialization of `features:tabular` (columns: frequency, recency, T, optional monetary_value),
which is exactly what bg_nbd's own note already proposes ("specialized features:tabular"). This
keeps the port vocabulary from growing a new top-level type for every small labeled tuple a family
happens to need.

**3. Model-reference `dataShape` gap — confirmed real; I'd resolve it by making `dataShape`
optional, not by adding an `n/a` enum value.**

`gamma_gamma.consumes[1].dataShape: "n/a"` is not a member of the template's 5-value
`consumes[].dataShape` enum (row-matrix|series|event-sequence|transactions|interactions), and the
sheet is honest about that ("template enum has no fitting value"). I agree this is a genuine
template gap — a `trained-model` reference carries no row/column shape by definition, so forcing a
value onto it is a category error, not a missing enum member. Between the two fixes the sheet
implicitly suggests, I'd prefer making `dataShape` **optional/nullable specifically when
`portType: "trained-model"`** over adding a sanctioned `"n/a"` pseudo-shape value — an omittable
field is self-documenting ("this port has no shape"), whereas an `"n/a"` string in an enum invites
being reused sloppily elsewhere (e.g. on a genuinely-unspecified shape that isn't actually a model
reference).

**4. `trained-model` implicit-vs-declared — confirmed novel; I'd default to explicit, not implicit.**

I grepped `portType` across the full 58-sheet corpus: `trained-model` appears **only** in these
three clv-btyd sheets (bg_nbd/pareto_nbd emit it, gamma_gamma consumes it). No other trainable
family — and there are 56+ other trainable-model sheets — declares it, so there's no established
precedent to check consistency against; this is genuinely the first family that needed it, not a
convention clv-btyd deviated from. I'd rule for **explicit, opt-in declaration per sheet** (as done
here) over "every trainable fitter implicitly emits trained-model": implicit-for-all would silently
grow every trainable sheet's `emits[]` and invite spurious composition edges with no real consumer
(nothing stops a `clv-composite`-style template from claiming a fitted `DummyClassifier` as a valid
`trained-model` filler under implicit-for-all). Explicit declaration keeps lint rule 2
(`canBeSeeds[].portType ⊆ emits ∪ consumes`) meaningful and keeps `canBeSeeds` edges intentional.

### Two additional judgment calls (not on the named list)

**A. bg_nbd/pareto_nbd assert `learningType: "Temporal"` without the open-call flag gamma_gamma's
`learningTypeNote` carries for `"Unsupervised"`, despite a similar underlying ambiguity — same
shape as the baseline review's precedent (classifier asserting an identical value to the flagged
regressor sheet without carrying the flag).** The fitter's literal input after the RFM adapter is a
static 3-tuple (or 2-tuple for gamma_gamma) — arguably as "tabular" in shape as a regression's X
row; the temporal character lives in the generative MECHANISM, not the consumed shape. That said, I
think "Temporal" is *better* supported here than gamma_gamma's "Unsupervised" call: T and recency
are literal likelihood arguments for bg_nbd/pareto_nbd (unlike gamma_gamma's likelihood, which has
no time term at all — a real, correctly-drawn distinction between the two BTYD process models and
their monetary sibling). Ruling: "Temporal" stands, not an error — but for consistency it should
probably carry the same "flagged as an open call" treatment gamma_gamma's `learningType` got, since
the same mechanism-vs-shape tension applies.

**B. The extra top-level keys (`taskNote`, `secondaryTasks`, `learningTypeNote`,
`portTypeProposal`) are pre-existing, already-logged template-level findings** (`decisions.md`
T-3, and `secondaryTasks` is already near-universal across 56/58 sheets) — not a clv-btyd-specific
deviation, so I'm not counting it as a finding here, just confirming it isn't new.

## Reviewer errors

- I did not execute `lifetimes` source or an installed package in this session. The piecewise
  `P(alive)|x=0 ≡ 1` formula, the `E[spend]=p·v/(q−1)` population-mean formula, the `q_constraint`
  fit-time flag, the exact method/function names, and the RFM column-naming convention were all
  reconstructed from training-time knowledge of the Fader-Hardie / Schmittlein-Morrison-Colombo
  literature and the `lifetimes` package docs, not re-verified against source or a live install in
  this session. Confidence is high (well-documented, frequently-cited specifics, several of which
  are unusual enough — e.g. the exact x=0 asymmetry — that misremembering them would be an
  obvious tell), but this is not execution-verified.
- I did not check the `lifetimes>=0.11.3` minimum-version pin (repeated identically across all
  three sheets) against PyPI/GitHub release history, nor did I verify `autograd` remains a current
  dependency of `lifetimes` rather than a since-removed one — the producer itself flags the
  library's maintenance-mode status and the `pymc-marketing` successor as an open dependency
  question, and I did not independently resolve it.
- I did not attempt to verify the `q_constraint` hyperparameter's exact default fit-method
  interaction (`fit_method="Nelder-Mead"` in `lifetimes`, not stated in the sheet's `hpMeta`) —
  not material to any finding above, flagging as unchecked rather than treating it as silently
  confirmed.
