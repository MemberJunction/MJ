# Independent Review — `recommendation` (implicit_als) + `pattern-mining` (association_rules, lda)

Reviewer model: different from producer (per review protocol). Process followed: (1) expected inventory
written from domain knowledge before reading any sheet; (2) read `sheet-template.md` +
`sheets/recommendation/implicit_als.sheet.json` + `sheets/pattern-mining/{association_rules,lda}.sheet.json`;
(3) cross-checked against the 3 gold sheets' family (`survival/cox_ph`) and 7 additional sibling sheets
(`clustering/kmeans`, `clustering/hierarchical`, `dim-reduction/pca`, `sequence-state/markov_chain`,
`clv-btyd/bg_nbd`, `clv-btyd/gamma_gamma`, `clv-btyd/pareto_nbd`) plus a full-corpus grep of `axes.parametric`,
`axes.dataShape`, and `portType` usage across all ~55 sheets to establish precedent before ruling.

## Pre-reading expected inventory (recorded before opening any sheet)

- **implicit ALS**: interaction-matrix input; factorizes into user/item latent-factor ("embedding") matrices
  under Hu-Koren-Volinsky confidence weighting (`c_ui = 1 + alpha*r_ui`); cold-start (zero-interaction
  entity) is THE defining edge case; serving is `recommend(user) -> top-N ranked (item, score)`, not a
  per-row scalar predict.
- **association rules**: apriori/FP-Growth over transaction baskets (not a general event log — baskets are
  itemsets keyed by a transaction id, order-free); emits a rules artifact scored by support/confidence/lift;
  no per-row predict exists — a defining "no-scoring wrapper" need.
- **LDA**: doc-term (bag-of-words count) matrix input; emits TWO genuinely distinct artifacts — a per-document
  topic-mixture (theta, N×K, sums to 1) and a per-topic word distribution (phi/components_, K×vocab) — these
  are not interchangeable; evaluated via perplexity + coherence.

All three held up on the core mechanics with no surprises (see Reviewer self-notes). The findings below are
about **port-type / taxonomy-consistency structure**, not domain-fact errors — the substantive ML content in
all three sheets (hyperparameter defaults, library API shapes, edge cases) checked out accurately against
`implicit`, `mlxtend`, and `sklearn.decomposition.LatentDirichletAllocation`.

---

## 1. Confirmed errors / issues

### 1a. [MOST IMPORTANT] `implicit_als.axes.parametric = "Semi"` is unsupported and inconsistent with the study's own precedent

Across the full ~55-model corpus, `"parametric": "Semi"` is used **exactly three times**: `gam`, `cox_ph`,
and `implicit_als`. `gam` and `cox_ph` are genuine semiparametric models in the classical statistical sense —
a finite-dimensional **parametric** component coexisting with an infinite-dimensional **nonparametric**
component in the SAME model (Cox PH: linear coefficients + nonparametric baseline hazard via the Breslow
estimator; GAM: parametric linear terms + nonparametric smooth splines). `implicit_als` has no such split —
its own `invariances` block explicitly declares `distributionalAssumption: false` ("no likelihood or error
distribution is assumed"), so there is no nonparametric density/hazard/spline component anywhere in ALS to
pair with a parametric part.

Structurally, ALS (bilinear low-rank factorization, fixed-K functional form, but total parameter count
scaling with #users + #items) is far closer to the study's OTHER factor/matrix models, **all of which are
labeled `"Yes"`** despite having fitted-matrix sizes that also scale with entity/state cardinality:
`kmeans` (k×p centroids), `pca` (k×features loadings), `markov_chain` (K×K transition matrix), and even
ALS's own EventLog-shaped cousins `bg_nbd` / `gamma_gamma` / `pareto_nbd` (CLV/BTYD). None of these are
"Semi" despite the same "matrix size grows with cardinality" property ALS has.

**Recommendation**: correct `implicit_als.axes.parametric` to `"Yes"` (matching `kmeans`/`pca`/`markov_chain`
precedent), or — if "Semi" is intended to capture something other than the classical semiparametric
definition the gold sheet (`cox_ph`) establishes — document that alternate definition, since as written it
reads as a miscategorization a reader would reasonably correct to match the other three matrix-factor sheets.

### 1b. The `event-log`/`transactions` field conflation `association_rules` flags is systemic, not local — it recurs unflagged in 3 sibling sheets

`association_rules.consumes[0]` sets `portType: "event-log"` and `dataShape: "transactions"` on the **same**
entry — naming the port after the raw, ordered, timestamped source while describing the actually-consumed
shape as the post-collapse aggregate. A full-corpus check shows **`clv-btyd/bg_nbd`, `clv-btyd/gamma_gamma`,
and `clv-btyd/pareto_nbd` all use the identical `(portType: "event-log", dataShape: "transactions")`
combination** on their own `consumes[0]`, with no portTypeProposal filed by any of the three. This is not a
coincidence: BG/NBD, Gamma-Gamma, and Pareto/NBD all internally aggregate a raw per-customer transaction log
into (frequency, recency, T, monetary) summary statistics before fitting — the exact same "lossy
groupby-collapse before the algorithm ever sees the data" pattern `association_rules` describes for its
TransactionEncoder step.

**Recommendation**: this is a study-wide U2 question, not a pattern-mining-local one. Once ruled, the three
CLV/BTYD sheets should be revisited to either file the same proposal or explicitly note why they're exempt
(outside my assigned scope to edit, flagging for producer/coordinator attention).

### 1c. `implicit_als` reuses `portType: "embedding"` at two granularities without flagging it — the exact hazard `lda` caught for `topic-mixture`

A full-corpus scan for sheets that emit the **same** `portType` at two different `granularity` values within
one sheet returns exactly two hits: `pattern-mining/lda` (`topic-mixture`: per-row + per-model) and
`recommendation/implicit_als` (`embedding`: per-row user factors + per-model item/`latent-factors`). `lda`'s
author recognized the danger and filed a portTypeProposal (`topic-word-dists`); `implicit_als`'s author did
not apply the same scrutiny to its own dual "embedding" emission.

This matters concretely, not just stylistically: `sheet-template.md` §9 shows `consumes[]` entries carry only
`portType, dataShape, dtypes, targetSpec, required` — **no `granularity` field**. A downstream consumer
declaring `portType: "embedding"` has no way to express "I want the per-row user embedding, not the
per-model item-factor matrix" — the wiring/type-check can only match on `portType`. `paramsAsOutput` (which
DOES differ between ALS's two embeddings: `none` vs `latent-factors`) is likewise absent from `consumes[]`,
so it can't serve as an implicit disambiguator either — this is exactly why `lda`'s explicit-new-portType fix
is the only sound resolution under the current schema, not merely a nice-to-have.

**Recommendation**: `implicit_als` should file its own portTypeProposal for the per-model item-factor
emission (e.g. `item-factors` or promote `latent-factors` from a `paramsAsOutput` value to a first-class
portType), mirroring `lda`'s resolution, rather than relying on granularity as an implicit disambiguator.

---

## 2. Judgment calls / port-type rulings (the U2 questions asked)

- **`ranked-list` (implicit_als) — verdict: DISTINCT from `score`. Adopt as proposed.**
  `recommend()` returns a variable-length, per-user ORDERED list of `(item-id, score)` pairs — a different
  arity than `score` (per-row scalar; used 31× elsewhere in the corpus, always scalar). Collapsing to a
  rank-1 `score` is lossy and defeats the purpose of a recommendation list; `score -> ranked-list` is
  impossible without the candidate set (no legal reverse adapter). No existing portType already covers this
  shape. Adopt `ranked-list` as a new first-class port type.

- **`transactions` vs `event-log` (association_rules) — verdict: ADAPTER-RELATED, not SAME.**
  `event-log` = individually timestamped, ORDERED per-entity events; `transactions` = itemsets grouped by
  basket-id, order/time dropped. This is the same distinction separating "market basket analysis" from
  "sequential pattern mining" in the data-mining literature (two distinct problems, historically two separate
  Agrawal & Srikant papers) — sequence-mining components structurally need what the basket groupby-collapse
  throws away, so SAME would be actively wrong: it would let a sequence-mining consumer be silently fed
  order-free baskets with no time axis. Confirmed further by §1b's cross-family recurrence — the same lossy
  collapse pattern (raw log → per-entity/per-basket aggregate before fit) appears identically in 3 CLV/BTYD
  sheets. Promote `transactions` to a first-class portType with a documented lossy adapter
  `event-log -> transactions` (groupby-collapse); apply the same fix to `bg_nbd`/`gamma_gamma`/`pareto_nbd`.

- **`topic-word-dists` vs `topic-mixture` (lda) — verdict: DISTINCT. Adopt as proposed.**
  Confirmed by the missing-`granularity`-on-`consumes[]` argument in §1c: without a distinct name, a consumer
  declaring `portType: "topic-mixture"` (e.g. a downstream classifier wanting per-doc N×K features) could be
  legally wired to the per-model K×vocab topic-word matrix instead — an outright dimensional/semantic
  mismatch, exactly the "illegal wiring look legal" risk the sheet's own note warns about. "Granularity
  disambiguates" is NOT a safe fallback given the current template shape — DISTINCT, not "SAME with
  granularity as differentiator," is the only sound resolution unless the template itself is amended to
  carry `granularity` (and/or `paramsAsOutput`) through to `consumes[]`, which would be a separate, broader
  fix affecting all 55 sheets. Adopt `topic-word-dists`; also apply the identical fix to `implicit_als`'s
  `embedding` overload (§1c).

- **Fit-only / no-scoring predict mode (association_rules) — verdict: genuinely required, not over-engineering.**
  A corpus-wide grep confirms `association_rules` is the ONLY component whose `wrapperNeeds` states a
  per-row predict surface plainly does not exist. Even the structurally closest analog — `hierarchical`
  clustering, whose "real fitted knowledge" (the merge tree) also has no clean per-row echo — still supports
  a real predict path (nearest-fitted-cluster assignment for new rows), because its author engineered one.
  `association_rules` has no such fallback: Apriori/FP-Growth's entire output IS the rules table; there is no
  per-row score to compute for a new row without inventing an undefined rule-matching semantic. The
  driver/sidecar contract (Doc 3) genuinely needs a first-class "fit-only" component mode (predict endpoint
  returns the per-model artifact or is disabled/404s), not a fabricated synthetic score. Raise to whoever
  owns Doc 3 as a required contract branch, not a sheet-local footnote.

---

## 3. Reviewer self-notes (calibration)

- My pre-reading expected inventory was directionally correct on all three models' core mechanics (see
  top) — nothing about the fundamental math surprised me. All findings below are about port-type/taxonomy
  consistency, not domain-fact correctness.
- I did **not** anticipate the `parametric: Semi` issue (§1a) from first-principles domain knowledge alone;
  it only surfaced from corpus-wide comparison against the gold sheet (`cox_ph`) and sibling matrix/factor
  models (`kmeans`, `pca`, `markov_chain`, the `bg_nbd` family). This class of bug (a rare axis value, n=1
  before this sheet, n=3 in the whole study) is only catchable by cross-sheet comparison — worth an automated
  lint flagging any axis value used ≤3 times in the corpus for manual precedent-check.
- I initially suspected `association_rules.axes.dataShape = "EventLog"` might itself be a defect (its true
  consumed shape is transactions, not raw event-log), but after confirming it matches its 3 CLV/BTYD
  siblings exactly, downgraded this to supporting evidence for the ADAPTER-RELATED verdict rather than a
  standalone error — the coarse 5-value `axes.dataShape` enum (Tabular|Sequence|EventLog|InteractionMatrix|Any)
  appears deliberately coarse by design, with fine distinctions intended to live in `consumes[].dataShape`.
- No inaccuracies found in the technical/domain content of any of the three sheets — hyperparameter defaults
  (`implicit.als.AlternatingLeastSquares`: factors=100/regularization=0.01/alpha=1.0/iterations=15; mlxtend
  `association_rules()`: metric="confidence"/min_threshold=0.8; `sklearn.decomposition.LatentDirichletAllocation`:
  n_components=10/learning_method="batch"/learning_decay=0.7/max_iter=10) all check out, including
  sophisticated correct details (sklearn LDA silently accepting non-integer floats while rejecting negatives;
  mlxtend's impractically-high library-default `min_support`; the LDA/LinearDiscriminantAnalysis acronym
  collision guard in `lda`'s `wrapperNeeds`). High-quality authorship on substantive ML content throughout.

---

## Counts

- Sheets reviewed: 3 (`implicit_als`, `association_rules`, `lda`)
- Sheets cross-referenced for precedent: 8 (`cox_ph`, `kmeans`, `hierarchical`, `pca`, `markov_chain`,
  `bg_nbd`, `gamma_gamma`, `pareto_nbd`) + full-corpus grep across all ~55 sheets
- Confirmed errors/issues: 3 (§1a parametric misclassification, §1b cross-family event-log/transactions
  conflation, §1c unflagged embedding portType overload)
- Port-type rulings requested: 4/4 answered (ranked-list: DISTINCT/adopt; transactions vs event-log:
  ADAPTER-RELATED; topic-word-dists vs topic-mixture: DISTINCT/adopt; fit-only predict: required)
- Reviewer self-corrections: 0 (no findings retracted); 3 calibration notes recorded above
