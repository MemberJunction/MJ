# Week of 2026-09-19

> **Status (2026-09-25):** All three ideas approved for implementation and now in progress — see individual idea docs for details.

Three framework-level improvement ideas, grounded directly in this week's open GitHub issues,
active PR backlog, and 2026 industry/regulatory research — continuing the recurring exploration
started in [`../README.md`](../README.md).

## Method this week

- Read all five prior weeks' idea docs (`2026-08-07` through `2026-09-12`) end to end before
  proposing anything, to avoid re-proposing Relationship Graphs, Decision Provenance, Accessibility,
  Approval Gates, Resource Governance, Consent & Data Rights, Data Health, Localization, Operation
  Safety Net, Federated Hierarchy Governance, Communication Suppression, Data Access Sentinel,
  Execution Trace Observability, Tenant Isolation, or Agent Drift Detection — all already proposed.
- Pulled the full open PR list (70+ open PRs on `next`) and the 50 most recently filed open issues
  directly from GitHub, and read three issues in full (#4539, #4580, #4602) that looked like they
  pointed at real, undocumented framework gaps rather than routine bug fixes.
- Verified each of the three ideas below against the existing codebase directly (not just the issue
  text) before writing it up, and against every prior week's proposals to state explicitly why it
  doesn't duplicate anything already proposed or in flight.
- Ran targeted web research for 2026 regulatory and industry-practice grounding (state AI
  transparency laws, PCI DSS 4.0 key-rotation expectations, multi-tenant "noisy neighbor"/bulkhead
  isolation patterns) rather than asserting real-world stakes without a source.

## This week's three ideas

1. **[Execution Blast-Radius Containment Layer](./idea-1-execution-blast-radius-containment.md)** —
   a single misconfigured AI agent can exhaust the Node heap and crash the entire shared MJAPI
   process for every user and every tenant on it (this happened on a dev instance this week, filed
   as **#4539**). Proposes a size-based payload guard the existing iteration/cost/token caps
   structurally cannot provide, sane non-null defaults, an explicit heap ceiling, and — as a scoped
   future phase — real execution isolation via worker threads. Distinct from the in-flight Resource
   Governance Engine (a $-budget/accounting question) and Tenant Isolation Guarantee (a data
   question) — this is a runtime blast-radius question neither one answers.

2. **[Encryption Key Lifecycle & Envelope Governance](./idea-2-encryption-key-lifecycle-governance.md)** —
   MJ's real, working field-level encryption engine has one structural gap: key rotation only finds
   *declared* encrypted fields, and the ciphertext envelope carries no key version, so a
   hand-encrypted value skipped by rotation becomes silently, permanently unreadable (**#4580**,
   filed this week). Proposes envelope versioning (backward compatible, fixes the unrecoverable
   case immediately), a registry so rotation can see out-of-band encrypted stores, and an honest
   coverage/health dashboard — grounded in PCI DSS 4.0's explicit key-rotation documentation
   expectations and the sector's own data on why small nonprofits are disproportionately targeted.

3. **[AI Confidence & Explainability Disclosure Layer](./idea-3-ai-confidence-disclosure-layer.md)** —
   three MJ subsystems (Duplicate Detection, ContentAutotagging, Predictive Studio) each
   independently invented their own confidence/rationale scale, with no shared component and no
   consistent way for a non-technical staff member to calibrate trust in an AI suggestion before
   acting on it — a gap `plans/predictive-studio.md:644` names as an open question but never
   answers. Proposes a shared `AIConfidenceSignal` type, two reusable Angular components
   (`AIConfidenceBadge`/`AIExplanationPanel`), and an optional statutory-disclosure wrapper —
   grounded in the Colorado AI Act's February 2026 consequential-decision disclosure requirement.

## Format

Each idea document follows the established structure: the problem framed for the world first, an
explicit "what already exists" section proving it against the actual codebase and against every
prior week so nothing is duplicated, a phased architecture, open questions, and a link to a full
HTML UX mockup with a rendered screenshot for anything that touches UX (all three do this week).
