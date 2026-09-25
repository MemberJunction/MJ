# Idea 3: AI Confidence & Explainability Disclosure Layer

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

> **Status (2026-09-25): In progress** — implementation work has begun. Tracking in a follow-up PR.

## The problem, framed for the world, not the codebase

A membership coordinator opens a duplicate-record review queue and sees "Merge these two
records — 87% confidence." A donor-relations volunteer sees a predictive lapse score of "Fair." A
program officer reads an AI-drafted grant summary with no signal at all about how sure the model
was of any claim in it. Three different numbers, three different scales, three different places to
look — and in every case, the person making the actual call (merge or don't, call the donor or
don't, send the summary as-is or fact-check it first) is a non-technical staff member who has to
guess what "confidence" even means here, because nothing in the platform explains it consistently.
That guessing is not a UX nitpick; it's exactly the mechanism by which AI systems get either
rubber-stamped ("the computer said 87%, must be right") or ignored entirely ("I don't trust any of
these numbers, I'll just redo it by hand") — both failure modes erode the actual value AI was
supposed to add, and both are more costly for a two-person nonprofit staff than for an
enterprise with a data science team to interpret results for them.

This is also no longer just a UX preference — it is becoming a compliance floor. The **Colorado AI
Act**, effective February 2026, requires deployers of high-risk automated decision systems to give
people a clear, plain-language statement *before* the AI makes or substantially influences a
consequential decision about them — the purpose of the system, the nature of the decision, and how
to reach the deployer. Connecticut's 2026 session went further, instituting transparency
obligations that flow from developer to deployer. An MJ-based predictive-lapse score that decides
who gets a renewal call, or a dedup engine that silently merges two donor records, is exactly the
shape of "AI substantially influencing a decision about a person" these laws describe — and today
MJ has no consistent way to disclose *anything* about how that decision was reached, let alone in
plain language.

## What already exists (and why this doesn't duplicate it — it generalizes three things that
already work in isolation)

This week's codebase research found the pattern MJ needs already exists — three times, in
isolation, none of them shared:

- **Duplicate detection** (`packages/AI/Vectors/Dupe`) has the most mature version of this pattern
  already built: `MJDuplicateRunDetailMatch` carries `LLMRecommendation`, `LLMConfidence` (0–1),
  and `LLMReasoning` (free text), populated through a genuinely generic reasoning-seam contract
  (`DuplicateReasoningCandidateVerdict { Recommendation, Confidence, Reasoning }` in
  `packages/AI/Vectors/Dupe/src/reasoning/DuplicateReasoningTypes.ts`). This is the best existing
  shape to generalize *from* — this proposal is explicitly not a rewrite of it.
- **ContentAutotagging** independently reinvented the same idea with different names:
  `MJContentItemTag.Weight` (a confidence proxy) and `.Reasoning` (free text), with its own
  hardcoded thresholds (`HIGH_CONFIDENCE_THRESHOLD = 0.9`) scattered across its own Angular
  components.
- **Predictive Studio** independently built a third version — a `TrustGrade`
  (`Poor`/`Fair`/`Good`/`Excellent`) banded from AUC/R², with its own `GRADE_EXPLANATION`,
  `trustDots()`, and trust badge/banner UI (`packages/AI/PredictiveStudio/Core/src/trust.ts`,
  consumed in `ps-predictions-resource.component.ts`). This is *model-quality-level* trust, not a
  per-prediction score — a fourth axis the same problem keeps needing.
- **No shared component, base type, or design pattern unifies any of this.** A repo-wide search for
  `isAIGenerated`/`AIGenerated` across `packages/Angular` and `packages/AI` returns nothing; every
  "explain" tooltip is page-specific (Views' `SmartFilterExplanation`, Action Filters'
  `CodeExplanation`, Predictive Studio's own `.ps-trust-explain`) with no shared component behind
  any of them.
- **The gap is already named, just never designed.** `plans/predictive-studio.md:644` carries an
  open, unresolved question — *"how much per-prediction explainability to expose"* — that has sat
  unanswered. This proposal is the answer to that question, generalized past Predictive Studio to
  every AI-touched surface in the platform.
- **Not the same thing as Decision Provenance & Handoff Briefs** (`plans/weekly-exploration/2026-08-07/idea-2-*`):
  that proposal captures a *human's* rationale for a judgment call, authored after the fact, for
  the next person who inherits the record. This proposal surfaces the *AI's* stated confidence and
  reasoning for a specific output, at the moment a user is deciding whether to accept it — the two
  can compose (a Decision Record can cite the AI confidence that informed it) but neither needs the
  other to ship.
- **Not the same thing as Agent Behavioral Drift Detection** (`plans/weekly-exploration/2026-09-12/idea-3-*`):
  that proposal detects when an agent's *aggregate* behavior changes over weeks/months against a
  regression suite. This proposal is about a *single output's* confidence, disclosed in real time to
  the end user consuming it — a per-decision transparency question, not a fleet-health question.

## Proposed architecture

### A shared type, not a shared table

`AIConfidenceSignal` — a TypeScript interface (`packages/AI/Core` or wherever the reasoning-seam
types already live), not a new database entity: `{ confidence: number /* 0-1, normalized */,
recommendation?: string, reasoning: string, sourceRunID: string /* AIPromptRunID or AIAgentRunID */,
scale: 'probability' | 'grade' | 'ordinal', rawScale?: string /* e.g. the original 'Fair'/'Good' grade,
preserved rather than lossily converted */ }`. Dedup's `DuplicateReasoningCandidateVerdict`,
ContentAutotagging's `Weight`/`Reasoning` pair, and Predictive Studio's `TrustGrade` each map onto
this shape with a thin adapter — no existing field is renamed or migrated, each surface's existing
entity columns become the *source* the shared type is populated from, so this ships without a
breaking change to any of the three existing subsystems.

### `AIConfidenceBadge` and `AIExplanationPanel` — shared Angular components (L1, per the UI
layering guide)

Two small, reusable components any surface can drop in: a compact badge showing a normalized
confidence indicator (never a bare unexplained percentage — always paired with a plain-language
band: "High confidence," "Uncertain — review recommended," etc., addressing the Colorado-Act-style
"plain language" bar directly) and an expandable panel showing the underlying `reasoning` text plus
a link back to the source `AIPromptRun`/`AIAgentRun` for anyone who wants the full trace. Dedup's
review queue, ContentAutotagging's tag review, and Predictive Studio's prediction resource each
replace their bespoke inline badge/tooltip markup with these two components — visually consistent
for the first time, and any *future* AI-touched surface (an AI-drafted email, an agent's suggested
action) gets the same disclosure for free by adopting the same two components, rather than
reinventing a fourth bespoke pattern.

### `ConsequentialDecisionDisclosure` — the compliance-facing layer

A thin, optional wrapper around `AIConfidenceBadge` that a deployment can enable per AI-touched
workflow it judges "consequential" under an applicable law (Colorado's Act, or a future analog): it
adds the plain-language "this suggestion was generated by AI, here's what it's based on, here's how
to reach us" statement the statute describes, sourced from configuration rather than hardcoded
legal text (jurisdictions and their exact required language will keep changing; MJ ships the
mechanism and a sensible default, not legal advice). This is deliberately a thin, separate layer on
top of the confidence signal, not baked into every AI surface by default — most AI-touched
interactions in an MJ app (an internal dedup review, say) are not "consequential decisions about a
person" in the statutory sense, and forcing statutory disclosure language onto every one of them
would be noise, not compliance.

## Phased rollout

1. **Phase 1** — define `AIConfidenceSignal` and build `AIConfidenceBadge` /
   `AIExplanationPanel`; adopt them in Duplicate Detection first, since its existing
   `DuplicateReasoningCandidateVerdict` contract is already the closest fit and needs no field
   changes, only a UI swap.
2. **Phase 2** — adopt the same components in ContentAutotagging and Predictive Studio, each via a
   thin adapter mapping their existing fields (`Weight`/`Reasoning`, `TrustGrade`) onto
   `AIConfidenceSignal` — closing `plans/predictive-studio.md:644`'s open question in the process.
3. **Phase 3** — `ConsequentialDecisionDisclosure` wrapper and per-workflow configuration for
   deployments that need statutory-style disclosure language on specific AI-touched decisions.

## Open questions

- **Normalizing a banded grade to a 0–1 confidence number is lossy.** Predictive Studio's
  `TrustGrade` is deliberately coarse (it's model-quality banding, not a precise probability) —
  the shared type's `rawScale` field exists so the original banded value is never discarded in favor
  of a fabricated precision the underlying model doesn't actually have, but the badge UI needs to
  render both a grade and a probability gracefully without implying false precision either way.
- **Where does "consequential" get decided?** Phase 3's per-workflow opt-in needs an owner —
  likely the deployment's admin, informed but not dictated to by MJ, since only the deploying
  organization knows which decisions in their specific context are legally "consequential."
- **Retrofitting existing bespoke UI.** Three components have hand-built badge/tooltip markup
  today; migrating them to the shared components is a UI change to production surfaces, not just an
  additive one — needs the same Playwright-verified, piece-by-piece approach the `design-ux`
  workflow already uses for UI work in this codebase.

## Mockup

See [`mockups/ai-confidence-disclosure.html`](./mockups/ai-confidence-disclosure.html) — three
existing surfaces (duplicate review, tag review, a predictive score) shown side-by-side in their
current bespoke-badge form versus the unified `AIConfidenceBadge`/`AIExplanationPanel` treatment,
plus the `ConsequentialDecisionDisclosure` statutory-style banner. Screenshot:
[`screenshots/idea-3-ai-confidence-disclosure.png`](./screenshots/idea-3-ai-confidence-disclosure.png).

## Sources

- Subagent codebase research (this exploration, 2026-09-19): direct reading of
  `packages/AI/Vectors/Dupe/src/reasoning/DuplicateReasoningTypes.ts` and
  `DuplicateReasoningProvider.ts`, `MJDuplicateRunDetailMatch`/`MJContentItemTag` generated entity
  fields in `packages/MJCoreEntities/src/generated/entities/__mj.ts`,
  `packages/AI/PredictiveStudio/Core/src/trust.ts`, and confirmation via repo-wide search that no
  shared `AIGenerated`/confidence component exists in `packages/Angular` or `packages/AI` today;
  also confirmed `plans/predictive-studio.md:644` carries the exact open question this proposal
  answers.
- ["2026 State AI Laws: Legislative Wrap-Up"](https://www.ebglaw.com/insights/publications/ai-legislation-2026-legislative-wrap-up)
  and ["U.S. AI Law - 2026 Midyear State Update"](https://www.privacyworld.blog/2026/09/u-s-ai-law-2026-midyear-state-update/) —
  the Colorado AI Act's February 2026 effective date and its plain-language pre-decision disclosure
  requirement for consequential automated decisions, and Connecticut's 2026 developer-to-deployer
  transparency obligations.
