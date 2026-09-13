# Idea 3: Consent & Data Rights Primitive (Jurisdiction-Aware Privacy Layer)

**Week of 2026-08-14 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

"Nonprofits are exempt from privacy law" is folk wisdom, and as of March 2026 it's simply wrong in
a growing number of places. Twenty U.S. states now have comprehensive consumer privacy laws, and
while most follow Virginia's model of exempting registered 501(c)(3)s, **Colorado, Delaware,
Maryland, Minnesota, New Jersey, and Oregon offer little to no nonprofit exemption** — meaning a
membership association or donor program headquartered in (or simply serving members in) one of
those states has real consent, access, and deletion obligations toward its members' and donors'
personal data, the same as a for-profit company. Layer on 41 states plus DC requiring charitable
solicitation registration with its own disclosure obligations, and a small org's two-person staff
is expected to track a patchwork of jurisdiction-specific rules with no legal department and no
dedicated tooling. CCS Fundraising's 2026 Philanthropy Pulse found data/CRM issues cited as a top
challenge by a third of nonprofits — more than double the prior year — and fragmented, ungoverned
personal data is a direct driver of that number. Consent-management platforms in the commercial
world (OneTrust, Usercentrics, Didomi) have converged on treating consent as **jurisdiction-aware
policy, not a single global toggle** — the same record can require opt-in in one state and permit
opt-out in another. MJ has no equivalent primitive at all today: no way to record what a person
consented to, revoke it, honor a deletion request, or even know which of an org's records touch
regulated personal data.

## What already exists (and why this doesn't duplicate it)

- **`@memberjunction/notifications`** (`packages/Communication/notifications/src/NotificationEngine.ts`)
  already has a clean per-channel opt-out/preference resolution flow (force → opt-out → per-channel
  preference → type default). This proposal does **not** rebuild that — it adds a *legal-basis*
  layer underneath it. Today's preference system answers "does this person want this email";
  this proposal answers "are we *permitted* to hold and use this person's data at all, and did
  they consent to the specific purpose" — a distinct, narrower, and higher-stakes question that
  the preference center should ultimately read from, not duplicate.
- **Row-Level Security / Unified Permissions** (in flight) governs *who inside the org* can see a
  record. Consent governs *what the org itself is allowed to do* with a data subject's
  information regardless of internal access — an orthogonal axis, the same way GDPR's "lawful
  basis for processing" is a different question from "which employee has view access."
- **Decision Provenance** (proposed 2026-08-07, unshipped) is generic append-only rationale
  capture; this proposal is a purpose-built, structured entity pair because consent has real
  legal shape (a specific purpose, a specific expiry, a specific jurisdiction) that free-text
  rationale doesn't capture reliably enough to produce an audit-ready report from.
- **Record Changes / Version History** already gives full field-level audit trail — a Data
  Subject Access Request (DSAR) fulfillment can reuse Version History directly for "show everything
  that ever changed about this person" rather than this proposal inventing a parallel history
  mechanism.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Consent Purposes` | Declares a purpose an org may seek consent for: Name (e.g. "Email Marketing", "Data Sharing with Chapter Affiliates", "Photo/Video Use"), Description, DefaultLawfulBasis (`Consent`/`LegitimateInterest`/`Contract`/`LegalObligation`), IsSensitive (bool — flags special-category data needing stricter handling) |
| `MJ: Jurisdiction Policies` | Per-jurisdiction (US state, or country for non-US orgs) default rule for a given `ConsentPurposeID`: RequiresOptIn (bool — Colorado/Delaware-style "opt-in required" vs. Virginia-style "opt-out sufficient"), RetentionMaxDays (nullable), DSARResponseDeadlineDays. Seeded with a starter set covering the six non-exempt states plus a sane national default; orgs extend it, MJ doesn't try to be a law firm. |
| `MJ: Consent Records` | Attached to any record via CompositeKey (EntityID/RecordID — same generic attachment pattern Record Changes and last week's Decision Records use): ConsentPurposeID, Status (`Granted`/`Withdrawn`/`Expired`/`NeverGranted`), GrantedAt/WithdrawnAt, JurisdictionAtCapture (snapshotted, not re-derived later, since a person's applicable law is determined at the time consent was captured), Source (`Form`/`Import`/`Verbal-LoggedByStaff`/`API`), EvidenceRef (nullable — link to the specific form submission/email/file that is the proof) |
| `MJ: Data Subject Requests` | A DSAR case: EntityID/RecordID (who), RequestType (`Access`/`Deletion`/`Correction`/`PortabilityExport`), Status (`Received`/`InProgress`/`Fulfilled`/`Denied`), DueDate (computed from `Jurisdiction Policies.DSARResponseDeadlineDays`), FulfilledByUserID, ResponseArtifactID (nullable FK to a generated Artifact — the actual export/report handed to the requester) |

### `ConsentEngine` (new package `packages/Core/Consent`, `BaseEngine` pattern)

- `HasConsent(entityID, recordID, purposeID)` — the single call site any Action, Communication
  send, or Integration export checks before using personal data for a given purpose. Returns the
  effective answer by combining the record's `Consent Records` with the applicable
  `Jurisdiction Policies` default (e.g., if no explicit consent was ever captured but the
  applicable jurisdiction doesn't require opt-in for that purpose, the answer is still "permitted").
- `RegisterPersonalDataField(entityID, fieldName, sensitivityLevel)` — a lightweight, opt-in
  metadata registration (an app builder marks which fields on which entities are personal data,
  the same deliberate, explicit style CodeGen already uses for field-level metadata) so
  `FulfillDSAR()` knows what to collect without scanning every column of every entity as personal
  data by default.
- `FulfillDSAR(requestID)` — for `Access`/`Portability`: pulls every registered personal-data field
  across every entity where the subject has a record (reusing `RelationshipGraphEngine`'s
  traversal from last week's idea 1 if present, or direct FK lookups otherwise — this idea does
  not require idea 1 to ship), formats as an Artifact. For `Deletion`: soft-deletes/redacts
  registered fields per each entity's configured `DeleteBehavior` (reusing the existing delete
  pipeline, not inventing a second one) and logs the action to Version History like any other
  change.

### UI (Angular, L1/L2 per the UI layering guide)

- **Consent & Privacy Center** (Explorer dashboard, admin-facing) — a DSAR case queue with due-date
  countdowns pulled from `Jurisdiction Policies`, a per-record consent status panel embeddable as
  a form tab on any entity (Contact, Donor, Member — an app builder's choice, same dynamic-tab
  mechanism idea 1 and idea 2 from last week used), and a "personal data field map" configuration
  screen where an admin marks which fields count.
- **`ng-consent-widget`** — a small, embeddable, *end-user-facing* self-service panel (not just an
  admin tool) that a member/donor portal can drop in so a person can see what they've consented to
  and request access/deletion themselves — because the deadline-driven, staff-mediated DSAR queue
  above is the fallback path, not the only path; self-service is what actually reduces staff
  burden.

### Why this belongs in core, not an app

Consent and data-subject rights are not association- or nonprofit-specific — every SaaS company,
healthcare network, or university built on MJ that touches personal data faces the identical
mechanism (capture consent against a purpose, know the applicable jurisdiction's default rule,
fulfill access/deletion requests within a deadline). Only the specific purposes an org defines and
which entities/fields it marks as personal data are domain configuration; the engine, entities, and
UI are entirely generic, and the seeded `Jurisdiction Policies` starter set is explicitly framed as
a configurable starting point, not legal advice baked into the product.

## Phased rollout

1. **Phase 1** — `Consent Purposes` + `Consent Records` entities, `ConsentEngine.HasConsent()`/
   `RegisterPersonalDataField()`, consent status panel embeddable on any entity form. No DSAR
   automation yet — valuable on its own as a structured "what did we ask, what did they say" record
   replacing scattered spreadsheets.
2. **Phase 2** — `Jurisdiction Policies` (seeded starter set) + `Data Subject Requests` entity +
   Consent & Privacy Center dashboard with the DSAR case queue and due-date tracking.
3. **Phase 3** — `FulfillDSAR()` automation (Access/Portability export as an Artifact; Deletion via
   the existing per-entity delete pipeline) and the end-user-facing `ng-consent-widget` for
   self-service portals.

## Open questions

- The seeded `Jurisdiction Policies` starter data is a genuine "don't accidentally become the
  source of legal truth" risk — needs a prominent, permanent "this is a configurable starting
  point, not legal advice; consult counsel" disclosure in the admin UI, not just the docs.
  Flagged as a hard requirement for Phase 2, not an afterthought.
- `RegisterPersonalDataField` is opt-in by design (an app builder must mark fields), which means
  an org that never configures it gets zero protection — should CodeGen at least *suggest*
  candidate personal-data fields (by column name heuristics, e.g. `Email`, `SSN`, `DateOfBirth`)
  during Phase 1 so the feature doesn't depend entirely on someone remembering to opt in? Leaning
  yes, deferred to Phase 1 detailed design.

## Mockup

See [`mockups/consent-and-privacy-center.html`](./mockups/consent-and-privacy-center.html) — the
admin-facing Consent & Privacy Center (DSAR queue + consent panel) alongside the end-user-facing
self-service consent widget as it would appear in a member portal. Screenshot:
[`screenshots/idea-3-consent-and-privacy-center.png`](./screenshots/idea-3-consent-and-privacy-center.png).
