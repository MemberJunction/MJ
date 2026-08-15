# Idea 2: Communication Delivery Truth & Suppression Layer

**Week of 2026-08-15 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Two numbers from this year's association research should worry anyone building software for the sector: 49.5% of association professionals name "communicating member benefits" a top challenge (2026 Association Benchmarking Report), and first-year membership renewal has fallen to 72% against an overall renewal rate of 82% (2026 Membership Marketing Benchmarking Report) — a retention problem concentrated exactly where onboarding and engagement communication is weakest. Underneath both numbers sits the same quiet failure: most small nonprofits and associations have no reliable way to know whether the renewal reminder, the donor thank-you, or the volunteer shift alert actually reached anyone. A send that silently bounced looks identical, in most systems, to a send that landed in an inbox and was read. Staff conclude "engagement is declining" when the truer story might be "our list has 400 dead addresses nobody ever pruned."

There's a second, sharper failure hiding in the same gap: unsubscribe and suppression handling isn't a nice-to-have, it's a legal requirement (CAN-SPAM, CASL, GDPR-adjacent consent rules), and for an org with, per this year's research, 1–2 people running all of IT, honoring it correctly and consistently by hand is exactly the kind of "glue work" that eats the bandwidth those organizations report as their binding constraint. A platform that makes delivery truth and suppression a generic, automatic property of every communication — not something each app rebuilds — directly returns staff capacity to the mission instead of to compliance bookkeeping.

## What already exists (and why this doesn't duplicate it)

Verified directly against `packages/Communication`, not assumed:

- **`MJ: Communication Runs`** (`MJCommunicationRunEntity`) and **`MJ: Communication Logs`** (`MJCommunicationLogEntity`) already model a batch send and its individual messages, but `Status` is a coarse four-value enum (Pending / In-Progress / Complete / Failed) with no delivered/opened/clicked/bounced/complained sub-status.
- **`BaseCommunicationProvider.SendSingleMessage()`** already returns a structured `MessageResult` (`Run`, `Message`, `Success`, `Error`, `DryRun`) — but `Success` only means "the provider accepted the dispatch," not "the message was delivered."
- **Inbound webhook parsing already exists** (`WebhookNotificationInput`, `ParseNotificationResult`, with signature verification for SendGrid Inbound Parse, Twilio, and MS Graph) — this proposal's delivery-event ingestion is a sibling of that proven pattern, applied to outbound delivery events instead of inbound replies, not a new architecture.
- **`SendToAudience.ts`** already has a real, if narrow, pre-send skip mechanism: `AudienceSkipReason` currently covers `MISSING_RECIPIENT_FIELD` and `INVALID_RECIPIENT_FIELD`. Notably, the code comment there (`SendToAudience.ts:9-11`) explicitly states that anything more granular "belongs in the underlying provider's bounce/return-path handling" — this is a named, acknowledged gap in the codebase today, not a guess on this proposal's part. This idea proposes closing exactly that named gap, by extending the same skip-reason mechanism rather than inventing a parallel one.
- This is explicitly **not** the Consent & Data Rights Ledger proposed last week (`plans/weekly-exploration/2026-08-08/idea-3-consent-data-rights-ledger.md`, PR #3630) — that idea tracks lawful basis and data-subject rights requests (access/erasure/portability) against *any* entity's records generically. This idea is narrower and communication-specific: did a message get delivered, and is a given address currently suppressed from receiving further sends. The two are complementary — a suppression entry could optionally cite a Data Rights Ledger consent withdrawal as its source if both ship — but neither requires the other.

## Proposed architecture

### New entities

| Entity | Purpose |
|---|---|
| `MJ: Communication Delivery Events` | Attached to `CommunicationLogID`: `EventType` (Sent / Delivered / Opened / Clicked / Bounced-Soft / Bounced-Hard / Complained / Unsubscribed / Failed), `EventAt`, `ProviderEventID` (for idempotent webhook replay), `RawPayload` (JSON, kept for audit/debugging) |
| `MJ: Communication Suppressions` | Generic, address- or Contact-record-scoped: `SuppressionType` (Unsubscribed / HardBounce / SpamComplaint / ManualDoNotContact / LegalHold), `Scope` (Global / Per-CommunicationType / Per-Provider), `SuppressedAt`, `Source`, `ExpiresAt` (nullable — e.g. a temporary snooze rather than a permanent opt-out), `ReactivatedAt` |

### Engine

- Extend **`BaseCommunicationProvider`** with an optional `ParseDeliveryWebhook()` hook, mirroring the existing, already-proven inbound-parse pattern — providers that support delivery webhooks (starting with SendGrid and Twilio, since inbound-parse is already wired up for both) normalize provider-specific events into `MJ: Communication Delivery Events`.
- **`SuppressionEngine`** (new, `packages/Communication/engine`, alongside the existing `SendToAudience.ts`) does two things: (1) auto-creates a `MJ: Communication Suppressions` row when a hard-bounce, spam-complaint, or unsubscribe event arrives; (2) is consulted by `SendToAudience.ts` as a new `SUPPRESSED` value on the existing `AudienceSkipReason` type — extending the exact mechanism that already exists, not adding a second gate elsewhere.

### UI

- **Deliverability dashboard** — sent/delivered/bounced/complained rates per `CommunicationRun`, trended over time, so "why is engagement declining" gets an actual answer (list decay vs. content problem vs. genuine disengagement) instead of a guess.
- A **"Do Not Contact"** tab, embeddable on any Contact-like entity's form via the same dynamic-tab mechanism used by prior weeks' relationship-graph and decision-timeline proposals — shows suppression history plus a manual override with a required reason (for compliance audit trail).
- A generated **unsubscribe link** in outbound templates wired to a minimal public unsubscribe endpoint that writes a `Suppression` row directly — every app inherits a working, legally-adequate unsubscribe flow without hand-building one.

### Why this belongs in core, not an app

Every app on MJ that sends anything — renewal reminders, donor asks, event invites, volunteer shift alerts, grant status updates — needs the same two things: proof of what actually happened after "send," and correct, automatic suppression handling. Only the specific communication types and message copy are domain-specific; the delivery-truth and suppression mechanics are identical regardless of what the message says or who it's from.

## Phased rollout

1. **Phase 1** — `MJ: Communication Suppressions` entity + `SUPPRESSED` skip reason wired into `SendToAudience.ts` + the Do-Not-Contact tab with manual override. Immediate compliance-risk reduction, no provider integration required.
2. **Phase 2** — `MJ: Communication Delivery Events` + `ParseDeliveryWebhook()` provider hook + auto-suppression on hard-bounce/complaint, starting with SendGrid and Twilio.
3. **Phase 3** — Deliverability dashboard with trend analytics + generated unsubscribe-link/landing-endpoint flow.

## Open questions

- Should suppression be enforced only at the `SendToAudience()` orchestration layer, or also inside `SendSingleMessage()` at the provider layer for defense in depth? Leaning: orchestration layer is the primary, mandatory gate (avoids reimplementing per provider); a provider-layer check is a cheap Phase 2 addition, not a blocker.
- Multi-channel suppression scoping needs a sane default — an email unsubscribe shouldn't necessarily silence SMS. Leaning: default `Scope` to `Per-CommunicationType` unless the triggering event itself indicates a global objection (e.g., a spam complaint defaults to `Global`).

## Mockup

See [`mockups/communication-delivery-truth.html`](./mockups/communication-delivery-truth.html) — a Deliverability dashboard alongside a Contact's "Do Not Contact" tab. Screenshot: [`screenshots/idea-2-communication-delivery-truth.png`](./screenshots/idea-2-communication-delivery-truth.png).
