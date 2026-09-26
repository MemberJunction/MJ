# Idea 3: Outbound AI Content Assurance Gate

**Week of 2026-09-26 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

An AI agent drafts a fundraising appeal. It's a good draft — warm, on-message, ready to go — except
that one paragraph confidently states the gift is "100% tax-deductible," which isn't true for this
particular campaign, or the merge-field logic that pulled in "recent activity" accidentally surfaced a
line from a different constituent's case notes because two records shared a near-identical name. Under
a hand-typed email, one staffer catches this before hitting send, or doesn't, and either way the blast
radius is one email. Under an AI-agent-triggered bulk send through MJ's `SendToAudience`, the same
mistake reaches every recipient in the audience — thousands of donors or members — in the same second,
before anyone has a chance to notice. This is not a hypothetical risk profile invented for this
proposal: **92% of nonprofits already report using AI tools**, but **76% report having no AI
governance policy** at all, and the sector's own legal guidance is explicit that "every piece of
AI-assisted content that will reach a donor, funder, beneficiary, or the public should pass through a
human reviewer who checks facts, tone, and appropriateness before it goes out" — precisely the step a
bulk, agent-triggered send has no structural place for today.

MJ already built the right instinct for exactly this shape of risk once this year: `compose:email`
(**#4568**, open) deliberately renders an agent-authored email as a draft the *user* must open in
their own mail client and hit send themselves — "nothing in this path sends mail" is the design's own
stated guarantee, and it goes further to show the recipient address next to the button specifically so
a user can catch a manipulated destination before their mailbox is even populated. That is the correct
instinct, applied to exactly one path: a single agent-drafted email a human reviews one at a time.
`SendToAudience` — the bulk-fan-out path every mass communication and every agent-triggered campaign
goes through — has no equivalent moment of pause. It sends to a filtered list, with a fully-built
skip-reporting mechanism for *who* gets skipped, but no comparable mechanism at all for *what* is about
to go out to everyone who isn't skipped.

## What already exists (and why this doesn't duplicate it — it closes the one gap none of it covers)

- **`SendToAudience`** (`packages/Communication/engine/src/SendToAudience.ts`) is the single choke
  point this proposal hooks, exactly as the Communication Suppression Safety Engine (2026-09-05, idea
  2) already established it as. That proposal governs **who** receives a send (deceased, opted-out,
  suppressed, litigation hold) — a recipient-eligibility question, already reusing `SkippedRecords`.
  This proposal governs a completely orthogonal question: **is the content itself safe to send at
  all**, regardless of who's on the list. Neither depends on the other shipping; both compose onto the
  same result shape (`SendToAudienceResult`/`Skipped`-style reporting), because that's the established
  convention for anything hooking this path, not a new pattern per proposal.
- **`compose:email`** (**#4568**, open) solves human-in-the-loop review for a *single*, user-opened,
  never-auto-sent email. This proposal is explicitly for the paths that skip that human moment by
  design — bulk sends and any agent-triggered campaign dispatched straight through `SendToAudience`
  without a person in the loop per-message. Same philosophy (a human should see what's about to
  happen before it's irreversible), applied where the existing mechanism structurally can't reach.
- **AI Confidence & Explainability Disclosure Layer** (2026-09-19, idea 3, approved, now in progress)
  is a shared UI convention (`AIConfidenceBadge`/`AIExplanationPanel`) for a staff member calibrating
  trust in an AI *suggestion* — Duplicate Detection matches, autotagging labels, Predictive Studio
  scores. This proposal reuses that same visual language for its own pre-send panel (see UI) rather
  than inventing a fourth confidence-badge design, but it solves a different problem: disclosure is
  about communicating uncertainty in a suggestion a person then acts on; this gate is about **stopping
  or flagging genuinely harmful content** (leaked context, false claims) before it becomes irreversible
  at scale. A suggestion can be low-confidence and harmless; a bulk send can be high-confidence and
  still leak another constituent's private data into someone else's inbox.
- **Universal Approval Gates** (2026-08-14, idea 1, merged as a plan in PR #4009, not yet implemented)
  is the existing *designed* mechanism this proposal's `Gated` mode routes to (see architecture) —
  this proposal does not invent a second approval-routing mechanism; it becomes one more thing that
  mechanism, once built, can gate.
- **`packages/MetadataSync/demo/ai-prompts/content-moderation.prompt.md`** exists in the repo today as
  a demo prompt template — it is not wired to any send pathway, any Action, or any real check. This
  proposal is, among other things, the first time that category of check would actually run against
  real outbound content rather than exist as unused example data.

## Proposed architecture

- **`BaseContentAssuranceProvider`** (new package `packages/ContentAssurance`, `@RegisterClass`-
  registered per check, the same extensibility pattern as `BaseVectorProvider`/Communication
  providers) — pluggable, independently-enabled checks:
  - **PII/context-leakage scan** (pattern-based, not LLM-graded — zero false-positive-fatigue risk):
    does the rendered body contain data that structurally shouldn't be there for *this* recipient (a
    different record's identifier, an internal-only field marked sensitive that leaked through a
    template-merge bug).
  - **Factual-claim flag** (lightweight classifier, advisory only, never auto-blocking): flags
    absolute legal/financial/medical language ("tax-deductible," "guaranteed," "will cure") for human
    review — flags, never blocks, because false positives on legitimate copy are likely and a
    blocking false positive is its own trust problem.
  - **Brand-voice/tone check** (LLM-graded against an org-configured rubric, opt-in).
  - A **profanity/hate-speech baseline**, finally giving the repo's existing (currently inert) content-
    moderation prompt something real to run against.
- **Hook point**: `SendToAudience` gains an optional `ContentAssurance` pass, run **once against the
  rendered template** before fan-out — not once per recipient, for cost control — producing a
  `ContentAssuranceResult` per check (`Pass`/`Flagged`/`Blocked`) attached to the same result object
  `Skipped` already extends today.
- **Policy modes**, configured per Communication/Template, additive and off by default:
  - `Off` — today's exact behavior, zero change.
  - `Advisory` — checks run, flags are shown to the sender, sender can proceed anyway (with the flag
    now on the audit record — see below).
  - `Gated` — a flagged send routes to **Universal Approval Gates** (#4009) for a human approver,
    reusing that mechanism rather than building a second approval flow.
- **`MJ: Content Assurance Runs`** (new entity) — every check's outcome, tied to the Communication/
  Message record, for after-the-fact audit: what did the gate see, and what did the sender decide,
  for the one bulk send that turned out to be a problem anyway.
- Explicitly scoped to **AI-assisted content only** where practical — detectable via the same
  generation-provenance metadata Conversations/Artifacts already carry — so a purely human-typed
  newsletter never pays the cost or the false-positive risk of a check aimed at a different failure
  mode.

### UI

A pre-send **Content Assurance** panel in the New Communication / Send-to-Audience flow: check-by-
check status using the same badge visual language as the (in-progress) `AIConfidenceBadge` component,
shown before the send button is enabled in `Gated` mode or alongside it in `Advisory` mode; plus a
small admin dashboard for reviewing flagged/blocked sends over time. See mockup.

### Why this belongs in core, not an app

`SendToAudience` is core-framework plumbing every communication-sending app built on MJ already goes
through, in any domain — donor appeals, member renewals, customer notifications. The specific
rubric an org configures for brand voice is deployment-specific; the mechanism (a pluggable pre-send
content check wired to the one existing choke point, with additive off-by-default policy modes) is
universal, exactly like the Suppression Engine it sits beside.

## Phased rollout

1. **Phase 1** — PII/context-leakage scan only, wired into `SendToAudience` in `Advisory` mode.
   Highest severity, cheapest to build, zero judgment-call false-positive risk since it's pattern-
   based rather than LLM-graded.
2. **Phase 2** — Factual-claim flagging and brand-voice/tone checks (LLM-graded, opt-in per org);
   `Content Assurance Runs` audit entity and dashboard.
3. **Phase 3** — `Gated` mode wired to Universal Approval Gates once #4009 is implemented.

## Open questions

- **Cost of an LLM-graded check on every bulk send.** Mitigated by running once per rendered
  template rather than per recipient, and by scoping LLM-graded checks to AI-*assisted* content only
  — a human-authored send skips the expensive checks entirely.
- **Should `Gated` become the default once Approval Gates ships?** Leaning toward staying opt-in,
  consistent with every other gate this framework has proposed being additive rather than a forced
  behavior change — an organization opts a specific Communication/Template into it deliberately.
- **False-positive fatigue on the factual-claim flag.** Advisory-only for this check specifically,
  indefinitely, unless an org's own usage data shows otherwise — this is the one check least suited to
  ever auto-block.

## Mockup

See [`mockups/content-assurance-gate.html`](./mockups/content-assurance-gate.html) — the pre-send
Content Assurance panel on a bulk Send-to-Audience flow, showing a flagged PII-leakage check, an
advisory factual-claim flag, and the audit-history view. Screenshot:
[`screenshots/idea-3-content-assurance-gate.png`](./screenshots/idea-3-content-assurance-gate.png).

## Sources

- [ASU Lodestar Center: Responsible AI — Security & Privacy Tips for Nonprofits (2026)](https://lodestar.asu.edu/blog/2026/04/responsible-ai-security-and-privacy-tips-nonprofits) —
  2026 nonprofit AI-adoption-vs-governance-gap framing.
- [American Bar Association: Top Ten AI Usage Policy Considerations for Nonprofits (2026)](https://www.americanbar.org/groups/business_law/resources/business-law-today/2026-june/top-ten-ai-usage-policy-considerations-nonprofits/) —
  the explicit human-review-before-external-send guidance this proposal is grounded in.
- [eMarketer: FAQ on brand safety — how AI content and creator marketing are reshaping risk in 2026](https://www.emarketer.com/content/faq-on-brand-safety--how-ai-content-creator-marketing-reshaping-risk-2026) —
  2026 industry framing of AI-content brand-safety risk.
- MemberJunction repo PR **#4568** (`compose:email`) — read in full; the human-in-the-loop design
  principle and its explicit "nothing in this path sends mail" scope boundary this proposal extends
  to the paths that boundary doesn't cover.
- Internal analysis (this exploration, 2026-09-26): direct reading of
  `packages/Communication/engine/src/SendToAudience.ts` and
  `packages/MetadataSync/demo/ai-prompts/content-moderation.prompt.md`.
