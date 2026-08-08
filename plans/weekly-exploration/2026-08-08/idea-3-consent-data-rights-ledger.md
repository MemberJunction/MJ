# Idea 3: Consent & Data Rights Ledger

**Week of 2026-08-08 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Every organization holding member, donor, patient, or constituent data now operates under a patchwork of privacy obligations that is genuinely hard to track manually, and the patchwork is the problem, not any single law. In the US, roughly six to eight of the ~20 enacted state privacy laws apply to nonprofits with no exemption at all — Colorado is explicit about it: an org processing 100,000+ residents' data, or 25,000+ where data-sale revenue is involved, must comply fully, full stop. Others (California, Connecticut) exempt tax-exempt organizations outright or partially. As of January 1, 2026, Oregon's privacy law dropped its requirement that regulators give notice-and-cure before enforcing — they can go straight to a civil investigative demand. Any organization with international donors or members is squarely inside GDPR's right-to-erasure obligations regardless of nonprofit status, and a 2026 EDPB-coordinated enforcement sweep found organizations across the EU still struggle to *execute* erasure requests even when they know they owe one — a technical gap, not just a policy one. And the cautionary tale that made this concrete for the sector: Blackbaud, a nonprofit CRM vendor, suffered a 2020 ransomware breach exposing donor data at over 13,000 organizations, and the resulting settlements — $49.5M across a multistate AG coalition, another $6.75M in California, plus a separate FTC action — landed years later, in 2025, still working through the system. A small association's two-person IT team cannot reasonably track "which law applies to this record, as of when, and can I prove what a specific person consented to" by spreadsheet. That's exactly the shape of problem a metadata-driven framework should solve once, generically, instead of every app rebuilding a bespoke and probably-incomplete version of it.

## What already exists (and why this is genuinely new territory)

A direct check of the codebase and `guides/UNIFIED_PERMISSIONS_GUIDE.md` confirms the distinction this idea depends on: **Unified Permissions answers "who can see or do this"** — three concerns (capability/authorization, row-level visibility, per-resource sharing) — and **none of the three is, or overlaps with, "do we have a lawful basis to hold or process this data, and for how long."** Those are different questions with different owners in a real organization (security/access vs. legal/compliance), and MJ currently has an answer to the first and none to the second.

A grep across the codebase for consent/privacy primitives turned up exactly two things, both false positives worth naming so it's clear what's *not* already covering this:
- **OAuth "consent"** (`packages/AI/MCPServer/src/auth/ConsentPage.ts`) — a scope-authorization screen for delegated API access. "Does this client get this API scope" is unrelated to "did this person agree to have their data processed for this purpose."
- **A `ConstituentConsent` catalog row** in the integration engine's seed data — MJ's integration connectors know how to *call* a third-party CRM's consent API if one is configured, the same way they know how to call any other endpoint. There is no native consent entity, no enforcement, nothing that exists independent of a specific external system being wired up.

Nothing else — no `DataSubject`, no retention policy, no erasure workflow — exists anywhere in code or `/plans`. This is genuinely greenfield, and worth building generically for the same reason last week's Idea 3 (accessibility) was: it's the one idea this week that isn't really optional once an org crosses a size or jurisdiction threshold, and building it once in the framework means every app inherits it instead of every app builder re-deriving GDPR Article 17 from scratch under deadline pressure.

External research also confirms the *shape* a generic primitive should take, rather than inventing one from first principles: Salesforce's Data Cloud consent model keeps **Purpose** (why data is collected) and **Legal Basis** (which rule permits it) as separate, linked entities rather than one flattened field. OneTrust's consent architecture centers on an **immutable receipt per interaction** — purpose, timestamp, method, what the subject was shown — with withdrawal as a first-class, per-purpose action, never a single global toggle. And on erasure mechanics specifically, engineering practice has converged on **anonymize-in-place with a tombstone marker**, not hard cascade-delete: a naive soft-delete that still holds a name or email does not satisfy GDPR, and hard-deleting rows breaks referential integrity and audit history that the organization may separately be obligated to keep. None of Supabase, Directus, Strapi, or n8n — the low-code/data-platform peer set — bakes any of this in natively; it's uniformly treated as app-layer or handed off to a dedicated consent-management platform. That's the gap this proposal closes at the framework level.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Data Processing Purposes` | Name (e.g. "Membership Renewal Communications", "Donor Analytics", "Program Impact Reporting"), Description, DefaultLawfulBasis (Consent / LegitimateInterest / Contract / LegalObligation / VitalInterest / PublicTask), Category |
| `MJ: Consent Records` | Generic CompositeKey attachment (EntityID/RecordID — any entity, any record, same pattern as Record Changes) + PurposeID, Status (Granted/Withdrawn/Expired/Denied), Method (Web Form/Verbal/Imported/Paper), EvidenceRef (nullable, via the existing file-storage abstraction — the form or recording that proves it), GrantedAt, WithdrawnAt (nullable), ExpiresAt (nullable), JurisdictionHint (nullable), **SupersedesConsentID** (self-FK — an append-only chain of records, never a mutated status flag, mirroring both OneTrust's immutable-receipt pattern and MJ's own Record Changes convention) |
| `MJ: Data Rights Requests` | EntityID/RecordID (whose data), RequestType (Access/Erasure/Portability/Correction/RestrictProcessing), Status (Received/InProgress/Completed/Denied/PartiallyFulfilled), ReceivedAt, DueAt (computed from a configurable per-jurisdiction SLA — GDPR's is 30 days), CompletedAt, DenialReason (nullable), Notes |
| `EntityField.ErasureStrategy` (new nullable column on the existing `EntityField` metadata, alongside the existing `DecryptOnRead` PII hint) | Per-field, opt-in: `Anonymize` \| `Redact` \| `DeleteRow` \| `ExemptLegalHold`. Unset fields are untouched by an erasure run — this is additive, declarative metadata, not a behavior change for any field an app doesn't configure. |

### `DataRightsEngine` (new package, `packages/Core/DataRights`)

On an Erasure request: walks the target record's FK/relationship neighborhood (declared FKs today; would consume last week's proposed `RelationshipGraphEngine` if that ships, since a member's household and giving-circle connections are exactly the kind of neighborhood an erasure needs to reach), and for each field carrying an `ErasureStrategy`, executes it — overwrite-and-tombstone for `Anonymize`, blank-with-marker for `Redact`, row deletion only where explicitly configured, and a hard stop with a logged reason for `ExemptLegalHold`. Critically, **the erasure action is itself logged as a `RecordChange`** (reusing `VersionHistory`'s existing `Source` discriminator rather than inventing a second audit mechanism), so an org can prove not just that a subject consented or withdrew, but that a specific erasure request was fulfilled, when, and exactly what was changed — the "prove it" requirement the EDPB's 2026 findings show orgs actually struggle with operationally, not just legally.

### UI

- **Data Rights Center** dashboard (`packages/Angular/Explorer/dashboards`) — consent-by-purpose breakdown, a rights-requests queue with SLA countdown (so a 30-day GDPR clock is visible, not tracked in someone's email), and jurisdiction coverage at a glance.
- **Privacy tab**, embeddable on any entity form via the same dynamic-tab mechanism as last week's Decision Timeline and Relationship Graph proposals — consent history for this specific record, plus a "Process a Data Rights Request" action a staff member can trigger without knowing anything about the underlying entities.

### Why this belongs in core, not an app

The mechanism — attach a consent/purpose record to any entity, attach a rights-request workflow to any entity, execute erasure via declarative per-field strategy — is completely domain-agnostic. A healthcare network, a SaaS company running MJ as an internal data platform, and a university all need the identical machinery; only which entities and fields get `ErasureStrategy` tags, and which purposes exist, are app-specific configuration choices left to the builder — the same "define your metadata, MJ generates the mechanism" pattern the framework already uses everywhere else.

## Phased rollout

1. **Phase 1** — `Data Processing Purposes` + `Consent Records` entities, the CompositeKey attachment pattern, and the Privacy tab (pure capture, valuable standalone, no erasure logic yet).
2. **Phase 2** — `Data Rights Requests` entity, the `EntityField.ErasureStrategy` column, and the `DataRightsEngine`'s anonymize/redact path (erasure execution, without yet touching relationship-neighborhood traversal).
3. **Phase 3** — Data Rights Center dashboard with SLA tracking, jurisdiction-aware due-date computation, and relationship-neighborhood-aware erasure (consuming the Relationship Graph Engine if it has shipped by then).

## Open questions

- Should `JurisdictionHint` and the resulting SLA be inferred (from a record's address/locale fields) or always explicitly set by staff? Leaning explicit-with-a-suggested-default for Phase 1 — inference is exactly the kind of silent heuristic this week's Idea 1 argues needs a decision log if it's ever added.
- `ExemptLegalHold` needs a real backing concept (a litigation-hold or records-retention-schedule primitive) to be more than a free-text escape hatch — scoping that is a Phase 2 design question, not a Phase 1 blocker, since Phase 1 doesn't touch erasure at all.

## Mockup

See [`mockups/consent-data-rights-ledger.html`](./mockups/consent-data-rights-ledger.html) — the Data Rights Center dashboard, showing the consent-by-purpose breakdown and an in-progress erasure request against its SLA deadline. Screenshot: [`screenshots/idea-3-consent-data-rights-ledger.png`](./screenshots/idea-3-consent-data-rights-ledger.png).
