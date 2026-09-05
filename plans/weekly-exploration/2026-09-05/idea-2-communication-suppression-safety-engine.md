# Idea 2: Communication Suppression & Sensitive-Context Safety Engine

**Week of 2026-09-05 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

There is a specific, dreaded moment every membership and donor-relations team eventually lives
through: a renewal notice, an event invitation, or — worse — a "we miss you, come back!" campaign
arrives addressed to someone who has died, mailed straight to a grieving family member who now has
to call the office to say so, again. Or a donor who explicitly asked to be left alone gets another
solicitation because their opt-out lived in a spreadsheet nobody checked before the send. Or an
organization keeps emailing a former employee's personal inbox for eighteen months after they left,
because nobody wired "no longer affiliated" into the send path. None of these are edge cases — they
are the single most-cited, most human kind of CRM failure in the sector: "sending a donor three
identical mailers, using the wrong salutation, or reaching out to someone who asked to be removed
from communications are all data problems that chip away at donor trust," and it's serious enough
that the direct-marketing industry maintains a **national Deceased Do-Not-Contact List** just to
catch what individual organizations miss. Every one of these failures costs real money (postage and
staff time on outreach that should never have gone out), real trust, and sometimes real grief for a
family that has to relive a loss because software didn't know to stop.

The recurring root cause the research names directly: **"communication preferences are a common
failure point in nonprofit CRM data quality... when preferences are stored across spreadsheets,
disconnected tools, or inconsistent fields, organizations risk sending the wrong messages."** MJ
already has one place every kind of send passes through — human-initiated, Action-triggered, and
AI-agent-initiated alike. That's exactly the leverage point where "an organization can never
accidentally mail a suppressed constituent, no matter which of the three paths triggered the send"
becomes a framework guarantee instead of a hope that every integration remembered to check a flag.

## What already exists (and why this doesn't duplicate it)

- **`SendToAudience`** (`@memberjunction/communication-engine`, invoked by both the New
  Communication UI and the `Send To Audience` Action used by workflows/agents) is **already the
  one real choke point** every bulk send passes through, and it already has a `SkippedRecords`
  concept (`{RecordID, Reason, Message}`) surfaced in its output today. This proposal does not
  invent a new send pathway or a new skip-reporting shape — it adds one more source of skips
  (suppression) into a mechanism that already exists and already reports skips this exact way.
- **Consent & Data Rights Primitive** (2026-08-14 idea 3, open PR #4009, unmerged) is the
  *jurisdiction-aware legal consent* layer — did this person consent to this *category* of
  processing under this *jurisdiction's* law. This proposal is a different, narrower thing:
  **always-on, reason-coded suppression** that has nothing to do with jurisdiction or legal
  basis — a deceased record, a bounced address, a litigation hold, an ended employment, or a
  plain "please stop contacting me" all suppress a send regardless of what any privacy law
  requires. The two compose (a Data Subject Request from Idea 3 of that week could *create* a
  suppression row here) but neither depends on the other shipping.
- **`NotificationEngine`** (`packages/Communication/notifications`) already does unified
  in-app/email/SMS delivery with user preferences. This proposal's internal alerts (e.g., "a send
  attempt was blocked for a deceased-flagged record — review?") are delivered through this
  existing engine, not a second notification mechanism.
- **Universal Approval Gates** (2026-08-14 idea 1, open PR #4009) is *preventive, pre-action*
  human sign-off for risky actions someone configured a rule for in advance. Suppression here is
  deliberately **not** an approval gate: it doesn't pause for a human to decide — a suppressed
  record is simply never sent to, by default, full stop, the same way a bounced email address
  should never be retried forever. The two are complementary: an org could *also* configure an
  approval gate for "sends to more than 1,000 recipients," independent of suppression correctness.
- This is explicitly **not** a duplicate-detection or data-quality feature (2026-08-29 idea 1, Data
  Health & Trust Layer) — a suppressed record can otherwise be perfectly complete, current, and
  non-duplicate data. Suppression is a *communication-safety* signal, not a *data-correctness*
  signal, and the two engines read each other's findings as inputs, never re-implement one another.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Suppression Reasons` | A configurable reason catalog: `Name` (e.g. `Deceased`, `Bounced — Hard`, `Requested No Contact`, `Litigation Hold`, `Relationship Ended`), `Category` (`Permanent` / `Temporary` / `ReviewRequired`), `DefaultExpiresAfterDays` (nullable — permanent reasons never expire), `BlocksChannels` (JSON — e.g. suppress email but not postal, or all channels) |
| `MJ: Suppressions` | The actual suppression instance: `EntityID`/`RecordID` (CompositeKey-safe, same pattern as `RecordChange`), `SuppressionReasonID`, `Source` (`Manual` / `BounceWebhook` / `ExternalList` / `DataSubjectRequest`), `Note`, `CreatedByUserID` (nullable — a webhook-sourced row has none), `ExpiresAt` (nullable), `LiftedAt`/`LiftedByUserID`/`LiftReason` (nullable — a suppression is lifted, never deleted, so the audit trail survives) |
| `MJ: Suppression Overrides` | An explicit, reason-required exception to a still-active suppression for one specific send: `SuppressionID`, `RequestedByUserID`, `Justification`, `SendContextDescription`. Every override is itself a permanent audit row — there is no silent bypass. |

Two small tables plus a reason catalog. Every suppression is CompositeKey-based, so it attaches to
*any* entity — Contact, Donor, Member, Employee, Vendor — without per-entity schema changes, the
same generic-attachment pattern `RecordChange` and this week's sibling ideas all use.

### `SuppressionEngine` (new package, `packages/Communication/suppression`, `Base` + `Engine` split,
living alongside the other `packages/Communication/*` packages since this is a communication-safety
concern, not a generic data-quality one)

- `CheckSuppression(entityName, recordId, channel)` — the hot-path call: returns
  active/none/expired for the given record + channel, checked against cached `Suppressions` rows
  (`BaseEngine` caching, same pattern as every other frequently-read small table in MJ).
- **Integration point, chosen deliberately to be minimal**: `SendToAudience`'s existing recipient-
  resolution step calls `CheckSuppression` per candidate recipient *before* building the send list,
  and any active, non-overridden suppression becomes one more `SkippedRecords` entry with
  `Reason: "Suppressed — <SuppressionReason.Name>"` — reusing the exact shape that action already
  emits today rather than adding a parallel reporting surface. **Single-recipient sends
  (`Send Single Message` action) get the identical check** — one shared code path, not two.
- **AI agent tool calls that send a message** (any Action wrapping `SendToAudience`/`Send Single
  Message`) inherit the check automatically because they call the same underlying function — an
  agent cannot "route around" suppression by virtue of being an agent, which is the whole point:
  the guarantee holds regardless of which of the three initiating paths (human, Action/workflow,
  agent) triggered the send.
- **Bounce-driven suppression**: a new, small `Bounce Suppression` webhook handler (one per
  provider adapter already registered under `packages/Communication/providers/*`) writes a
  `Source: BounceWebhook` row on a hard bounce, so "stop mailing an address that doesn't exist" is
  automatic, not a manually-maintained list — closing the exact gap the research calls out
  ("spending real dollars on outreach that will not convert" on dead addresses).
- **External list ingestion** (the one extensibility hook, mirroring the `ExternalReference` rule
  type from the 2026-08-29 Data Health proposal and the pluggable-vendor-hook pattern from that
  same week's Localization proposal): a `Suppression Import` Action lets an org load a Deceased
  Do-Not-Contact-style external file or a paid NCOA/suppression vendor feed as `Source:
  ExternalList` rows — MJ ships the hook, not a hosted vendor relationship.
- **Explicit non-goal**: this does not decide *whether* a send is legally permitted (that's
  jurisdiction/consent territory, PR #4009's idea 3) and it does not detect duplicates or malformed
  data (that's the Data Health engine). It answers exactly one question, fast, for every send:
  *is there a standing reason this specific record should not receive this message right now?*

### UI (Angular, L1/L2 per the UI layering guide)

- **Constituent Safety badge** — a compact indicator on any record form (Contact, Donor, Member,
  whatever entity has suppressions), same embeddable-badge pattern as the Data Health chip from
  2026-08-29 — shows active suppressions plainly (e.g., "⚠ Deceased — do not contact") so staff
  never have to guess before manually reaching out either.
- **Send-time confirmation** — when a user-initiated send in the New Communication UI includes any
  suppressed recipients, a pre-send summary shows the count and reasons *before* sending (not
  buried in a post-send report), with an explicit, justification-required "Override N suppressed
  recipients" action that writes to `Suppression Overrides` — never a silent, unlogged bypass.
- **Suppression & Safety Center** (`packages/Angular/Explorer/dashboards`, `scaffold-mj-dashboard`
  pattern) — a reason-catalog admin view, a searchable suppression list with source/expiry, and an
  audit feed of every override ever granted (who, why, when) — the same "AI/automation proposes
  or blocks, a human's action is always logged" posture this whole exploration series has used
  since the first week.

### Why this belongs in core, not an app

A university's alumni office, a healthcare association's patient-facing communications, a trade
association's member outreach, and a religious denomination's congregant mailings all face the
identical failure mode: a send path that doesn't know a specific record has a standing reason not
to be contacted right now. The mechanism (a generic reason catalog, a CompositeKey-attached
suppression row, one shared check wired into the one real send choke point) is completely
domain-agnostic. Only *which reasons an org enables* and *which channels each reason blocks* are
per-deployment configuration — exactly the pattern the rest of this exploration series has used
for every other generic engine.

## Phased rollout

1. **Phase 1** — `Suppression Reasons` + `Suppressions` entities, `SuppressionEngine.
   CheckSuppression()`, wired into `SendToAudience` and `Send Single Message` with `SkippedRecords`
   reporting. Manual suppression entry only (no bounce/external automation yet) — already
   independently valuable, since even hand-entered "please stop contacting me" suppression closes
   the most human-costly failure mode first.
2. **Phase 2** — Bounce-webhook auto-suppression, the Constituent Safety badge, send-time
   confirmation UI with the override flow, `Suppression Overrides` audit trail.
3. **Phase 3** — `Suppression Import` action for external list/vendor feeds, the full Suppression &
   Safety Center dashboard, and — if PR #4009's Consent & Data Rights Primitive has landed by
   then — a read-only link so a fulfilled Data Subject deletion/opt-out request can auto-create a
   `Source: DataSubjectRequest` suppression row, without either engine depending on the other to
   ship first.

## Open questions

- Should a `Permanent` category reason (e.g., `Deceased`) be liftable at all, or only correctable
  (an org occasionally does confirm a "deceased" flag was a data-entry error on the wrong record)?
  Leaning toward "liftable, but the lift itself requires the same justification-required audit row
  as an override," so the permanent/temporary distinction governs default expiry behavior, not
  whether a human can ever correct a mistake.
- Should `BlocksChannels` support "no automated sends, but a manually-composed one-off message from
  a staff member who has a personal reason to reach out (e.g., a program officer following up on a
  hospice case) is allowed with confirmation"? Leaning yes — this is exactly what the send-time
  override flow already supports; flagged to confirm the UX communicates that distinction clearly
  rather than reading as a blanket "impossible to contact."

## Mockup

See [`mockups/suppression-safety-center.html`](./mockups/suppression-safety-center.html) — the
Suppression & Safety Center dashboard, the send-time confirmation panel showing a blocked
recipient with its reason, and the constituent safety badge as it would appear on a record form.
Screenshot: [`screenshots/idea-2-suppression-safety-center.png`](./screenshots/idea-2-suppression-safety-center.png).

## Sources

- [The NonProfit Times, "Don't Mail The Dead"](https://thenonprofittimes.com/npt_articles/dont-mail-the-dead/) —
  the deceased-mailing failure mode and the DMA's Deceased Do-Not-Contact List.
- [Neon One, "Donor Database Management: Your 2026 CRM Guide"](https://neonone.com/resources/blog/donor-database-management/) —
  "sending a donor three identical mailers... are all data problems that chip away at donor trust."
- [StratusLIVE, "Nonprofit Donor Data Security: The Complete Guide for 2026"](https://stratuslive.com/blog/nonprofit-donor-data-security-guide/) ·
  [DonorSnap, "Why Data Governance Should Be Part of Your Nonprofit CRM Plan"](https://donorsnap.com/blog/data-governance/) —
  communication preferences scattered across spreadsheets/disconnected tools as the recurring root
  cause.
