# Idea 1: Search & Retrieval Relevance Confidence Standard

**Week of 2026-09-26 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Picture a membership-desk staffer who gets a phone call: "I renewed last month, why does the portal
say I'm not a member?" She searches the CRM for the caller's email address. Nothing comes back. She
concludes the renewal never actually processed, apologizes, and creates a fresh record so she can get
the caller taken care of right now. Three weeks later, someone in data hygiene finds two records for
the same donor, one of them missing six months of giving history, and spends an afternoon merging
them back together. The renewal had processed. The search just didn't show it to her — not because
the record wasn't there, but because the relevance *score* for an exact match on that record happened
to fall under whatever floor the search UI was using that day, for reasons that have nothing to do
with how good the match actually was.

This is not a hypothetical. It is the exact, filed, currently-open bug this idea is grounded in
(**#4681**, filed 2026-09-22): an *exact* match on a donor's email address can score **lower** than a
loose partial match on a different record, purely because of how many fields the entity happens to
declare as searchable — and separately, full-text and entity search return scores on entirely
different numeric scales that a single "MinScore" threshold cannot meaningfully straddle. The 2026
literature on enterprise RAG makes the same point from the other direction: retrieval, not
generation, is now recognized as "the hardest part" of making AI answers trustworthy, because "an
answer can be completely grounded in retrieved context and still be irrelevant if the retrieval
pulled related-but-not-matching documents" — and a threshold that means something on one corpus and
nothing on another is precisely how that happens silently. Every search box in MJ — the omnibar, the
results page, and (per the in-flight Search Scopes & RAG+ plan) every agent's retrieval context — sits
downstream of the same scoring code. A staff member and an AI agent are both, today, trusting a number
that is not comparable to itself across the two entities they might search next.

## What already exists (and why this doesn't duplicate it — it fixes the primitive under all of it)

- **`EntitySearchProvider.ts`** (`packages/SearchEngine/src/generic/EntitySearchProvider.ts:353-355`)
  scores an entity match as `0.15 + (fieldRatio * 0.45) + (nameBoost ? 0.35 : 0)`, where `fieldRatio`
  divides matched fields by *how many searchable fields the entity declares* — so identical match
  quality scores differently per entity, and an exact non-name-field match can land under a `0.30`
  floor on any entity with four or more searchable fields.
- **`providerBase.ts:1442`** scores full-text hits by rank alone (`1.0 / (j + 1)`), a different scale
  entirely from the entity provider's 0–0.95 band.
- **`SearchFusion.normalizeScores`** (`SearchFusion.ts:270`) — a function that already exists to
  reconcile these scales — **has zero call sites in the package**. It was written and never wired in.
- **`search-results-resource.component.ts`**'s `MinScorePercent` is a real, user-facing relevance
  slider (persisted to the URL, with its own reset-to-30 default) — this proposal does not touch that
  control's UX or its default; it makes the number the slider filters on finally mean the same thing
  twice.
- **Search Scopes & RAG+ Agent Integration** (`plans/search-scopes-rag-plus.md`, in flight) builds
  agent-facing retrieval on top of exactly this scoring code via `Provider.SearchEntity`/RRF fusion.
  This proposal is a prerequisite that plan implicitly needs but doesn't itself address — an agent
  filtering retrieved context by score inherits the same incomparability problem, silently, unless the
  underlying score is fixed first.
- **AI Confidence & Explainability Disclosure Layer** (2026-09-19, idea 3, now approved and in
  progress) is a **different subsystem**: a shared `AIConfidenceSignal` UI convention for
  Duplicate Detection / ContentAutotagging / Predictive Studio *suggestions*, so a staff member can
  calibrate trust in an AI recommendation before acting on it. This proposal is about the *search
  engine's own internal scoring arithmetic* being self-consistent — not about explaining AI output to
  a user. The two are complementary (this proposal's calibrated confidence band is a natural additional
  input to that badge component once both exist — see UI section — not a dependency in either
  direction) and neither duplicates the other.
- **Data Health & Trust Layer** (2026-08-29, idea 1, unshipped) scores *record correctness*
  (completeness/freshness/consistency). This proposal scores *match quality* for a specific query. An
  orthogonal axis, exactly as that doc already noted for Engagement Score vs. Data Health Score.

## Proposed architecture

- **Phase 1 — fix the arithmetic, ship the bug fix as the load-bearing first step.** Per #4681's own
  suggested shape: score an exact-predicate match (available today via `UserSearchPredicateAPI`) high
  enough to clear any reasonable floor independent of `totalSearchableFields`, and decide
  `normalizeScores`'s fate — either wire it into the single fusion path both providers already feed, or
  delete it and replace it with a principled per-provider calibration (below). This alone closes the
  filed bug; everything past this point is the "creative" extension that turns a bug fix into a
  standing framework guarantee so the same class of bug can't recur in the next provider someone adds.
- **`RelevanceCalibrator`** (new shared utility in `@memberjunction/search-engine`) — converts each
  provider's raw score into a calibrated **0–100 Match Confidence**, using a documented, provider-
  registered calibration function rather than a single global formula (a vector cosine-similarity
  score and a full-text rank are not the same kind of number and forcing one formula over both would
  just relocate the bug). Every `BaseSearchProvider` implementation registers its own
  `CalibrateScore(rawScore) => MatchConfidence`; `SearchFusion` blends on the calibrated value, never
  the raw one, so RRF fusion (used by both the omnibar and Search Scopes RAG+) is finally comparing
  like with like.
- **`SearchQualityAuditor`** — a scheduled job (via the existing `ScheduledJobEngine`, no new
  scheduling mechanism) that samples recent searches per entity/provider, recomputes what the exact-
  match and calibrated scores *should* be, and flags any entity whose current configuration would still
  hide an exact match under the active default floor — turning "we believe the fix covers every
  entity" into something checked continuously as new entities and providers are added, the same
  "measurable, not just believed" posture the Tenant Isolation Auditor (2026-09-12) established for a
  different guarantee.
- **Match Confidence label** surfaced anywhere a raw score is shown today — High/Medium/Low bands
  backed by the calibrated number, not the raw one, so a user or reviewing developer never has to
  reason about `0.24` vs. `0.30` again.

### UI

A **Search Quality** admin dashboard (Angular, L2, `scaffold-mj-dashboard` pattern): per-entity score
distribution histograms with the exact-match floor overlaid, a live list of entities the
`SearchQualityAuditor` currently flags, and a "replay this query" panel showing raw vs. calibrated
score side-by-side for any historical search — the same query, so an admin can *see* the fix work
rather than take it on faith. See mockup.

### Why this belongs in core, not an app

Every application built on MJ inherits `Provider.SearchEntity`/`RunView` search and, per the in-flight
Search Scopes plan, will increasingly hand raw search results to agents as retrieval context. The
scoring arithmetic underneath both surfaces is core-framework plumbing exactly like `RunView` itself —
fixing it once fixes it for every entity in every app, forever; fixing it per-app would mean every
domain reinvents the same calibration.

## Phased rollout

1. **Phase 1** — the #4681 bug fix itself (exact-match bypass; decide `normalizeScores`'s fate) —
   smallest change, immediate real-world impact, no new entities or UI required.
2. **Phase 2** — `RelevanceCalibrator` + per-provider calibration registration, replacing the ad hoc
   fix with the general mechanism; `SearchQualityAuditor` scheduled job.
3. **Phase 3** — Match Confidence label in the omnibar/results UI and the Search Quality dashboard;
   calibrated-score wiring into Search Scopes RAG+ retrieval filtering once that plan is built.

## Open questions

- **Per-tenant or per-deployment calibration baselines?** A calibration tuned against one
  organization's data distribution may not transfer to another's. Leaning toward calibration
  functions that are *formula-based* (the exact-match/field-ratio fix) rather than *learned from
  telemetry* for Phase 1–2, deferring any click-through-trained calibration to a clearly-labeled,
  opt-in Phase 4 given the privacy questions live telemetry-based tuning would raise.
- **Does fixing the default floor change behavior users have silently adapted to?** Some users may
  have learned to lower the slider manually to compensate for exactly this bug. Phase 1 should ship
  with a changelog note explaining the floor now means something different, not just fix it silently.

## Mockup

See [`mockups/search-quality-dashboard.html`](./mockups/search-quality-dashboard.html) — the Search
Quality dashboard showing per-entity score distributions, the flagged-entity list, and a raw-vs-
calibrated replay panel. Screenshot:
[`screenshots/idea-1-search-quality-dashboard.png`](./screenshots/idea-1-search-quality-dashboard.png).

## Sources

- MemberJunction repo issue **#4681** ("Search relevance scores are not comparable across entities or
  providers...") — filed 2026-09-22, open, with a detailed code-level root cause and suggested fix
  shape; the primary grounding for this idea.
- Internal analysis (this exploration, 2026-09-26): direct reading of
  `packages/SearchEngine/src/generic/EntitySearchProvider.ts`,
  `packages/MJCore/src/generic/providerBase.ts`, `packages/SearchEngine/src/generic/SearchFusion.ts`,
  and `search-results-resource.component.ts`.
- [PremAI: RAG Evaluation — Metrics, Frameworks & Testing (2026)](https://www.premai.io/blog/rag-evaluation-metrics-frameworks-testing-2026/) —
  on faithfulness/context-precision disagreeing in practice and retrieval (not generation) being the
  hard part of enterprise RAG in 2026.
- [Explore Agentic: Enterprise RAG — retrieval is still the hardest part](https://www.exploreagentic.ai/enterprise-rag/) —
  2026 industry framing that a fully-grounded answer can still be irrelevant when retrieval ranking is
  wrong, the same failure mode a non-comparable relevance score produces.
