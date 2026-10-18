# Idea 3: AI Confidence & Explainability Disclosure Layer

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

> **Status (Implemented in PR #4612):** Shared `AIConfidenceSignal` contract and pure adapters (`FromDuplicateVerdict`, `FromContentItemTag`, `FromTrustVerdict`) in `@memberjunction/ai-core-plus`, plus standalone `<mj-ai-confidence-badge>` and `<mj-ai-explanation-panel>` L1 components in `@memberjunction/ng-ui-components`, are implemented and tested. The `ConsequentialDecisionDisclosure` statutory legal-boilerplate wrapper and lossy float conversion of `TrustGrade` were stripped out.

## The problem, framed for the world, not the codebase

Three MemberJunction subsystems independently surfaced AI confidence and rationale using incompatible
shapes:
- **Duplicate Detection** (`packages/AI/Vectors/Dupe`): `LLMRecommendation`, `LLMConfidence` (`0–1`
  or `0–100`), and `LLMReasoning`.
- **Content Autotagging**: `MJContentItemTag.Weight` (`0–1`) and `.Reasoning`.
- **Predictive Studio**: coarse model-quality `TrustGrade` (`Excellent | Good | Fair | Poor`),
  `headline`, `explanation`, and `factors`.

Without a shared signal contract and reusable L1 UI components, every surface had to hand-roll its
own confidence badge and reasoning tooltip/panel.

## Implemented Architecture (PR #4612)

### 1. `AIConfidenceSignal` & Pure Adapters (`@memberjunction/ai-core-plus`)

- Added [`ai-confidence.ts`](../../../packages/AI/CorePlus/src/ai-confidence.ts) exporting:
  - `AIConfidenceBand`: `'high' | 'medium' | 'low' | 'unknown'`
  - `AIConfidenceScale`: `'probability' | 'grade' | 'ordinal'`
  - `AIConfidenceFactor`: `{ label, detail, impact?: 'positive' | 'negative' | 'neutral' }`
  - `AIConfidenceSignal`: unified signal carrying `band`, `scale`, optional normalized `score`
    (`0–1` only for numeric probability scales), `rawLabel` (preserving coarse grades like `'Good'`
    or `'Fair'` without fabricating false float precision), `recommendation`, `headline`,
    `reasoning`, `factors`, `sourceRunID`, and `sourceType`.
  - Pure adapters:
    - `FromDuplicateVerdict(verdict, thresholds?)`
    - `FromContentItemTag(tag, thresholds?)`
    - `FromTrustVerdict(trust)`
    - `NormalizeProbabilityScore(rawScore)` & `DeriveConfidenceBand(score, thresholds?)`

### 2. `<mj-ai-confidence-badge>` and `<mj-ai-explanation-panel>` (`@memberjunction/ng-ui-components`)

- Added [`ai-confidence.component.ts`](../../../packages/Angular/Generic/ui-components/src/lib/ai-confidence/ai-confidence.component.ts):
  - **`MJAIConfidenceBadgeComponent` (`<mj-ai-confidence-badge>`)**: compact L1 pill pairing a
    plain-language confidence band (`High confidence`, `Moderate confidence`,
    `Low confidence — review recommended`, `Confidence unavailable`) with either a formatted
    percentage (for `'probability'` scale) or the preserved `rawLabel` (for `'grade'`/`'ordinal'`
    scales), plus an optional interactive disclosure chevron (`[Interactive]="true"`).
  - **`MJAIExplanationPanelComponent` (`<mj-ai-explanation-panel>`)**: accessible disclosure region
    rendering the embedded confidence badge, recommendation pill, plain-language `reasoning`,
    contributing `factors`, and optional trace link (`(TraceClicked)` emitting `sourceRunID`).
  - Fully token-driven (`--mj-*` CSS custom properties), `OnPush` change detection, modern Angular
    `@if`/`@for` control flow, and WCAG-compliant ARIA attributes.

## Stripped-Out / Descoped Items (and Why)

1. **`ConsequentialDecisionDisclosure` Statutory Legal Wrapper (Stripped Out):**
   Baking jurisdiction-specific statutory disclosure boilerplate (e.g., Colorado AI Act pre-decision
   notices) into a reusable L1 UI component library conflates legal policy with UI primitives.
   Deployments that require statutory notices should configure them at the workflow or application
   layer rather than inside `@memberjunction/ng-ui-components`.
2. **Lossy Float Normalization of `TrustGrade` (Stripped Out):**
   Converting coarse model-quality grades (`Fair`, `Good`) into synthetic float percentages (e.g.
   `0.65`) misleads users with fabricated precision. `FromTrustVerdict` keeps `scale: 'grade'`,
   preserves `rawLabel: trust.grade`, maps directly to `AIConfidenceBand`, and leaves `score`
   `undefined`.

## Mockup

See [`mockups/ai-confidence-disclosure.html`](./mockups/ai-confidence-disclosure.html) and
[`screenshots/idea-3-ai-confidence-disclosure.png`](./screenshots/idea-3-ai-confidence-disclosure.png).

## Sources

- `packages/AI/CorePlus/src/ai-confidence.ts`
- `packages/Angular/Generic/ui-components/src/lib/ai-confidence/ai-confidence.component.ts`
