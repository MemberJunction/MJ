# Independent Review — Eventbrite Connector Extraction (Amendment round re-verification, pass 4)

> **Charter note (verbatim, per the v2 IndependentReviewer contract):** This review is a **same-source
> reader's LINT green**, not a Reality Probe. I re-read the same credential-free, Tier-1 source
> (`SOURCE_STUDY.md` + the raw `eventbrite-v3-api-blueprint.apib`) the producer extracted from, and
> checked the emission for (1) enumeration coverage against the SCRIPT-enumerated catalog, (2) bijection
> coherence (capability flags <-> per-operation columns <-> watermark fields <-> FK graph), (3) capability
> honesty vs. the source's documented write surface, and (4) naming/plurality/evidence-tier discipline.
> **I CANNOT and do NOT certify** that any of these paths are LIVE-correct, that pagination actually
> advances, that declared PKs are populated in real records, that the watermark param is accepted by the
> live API, or that the write surface really exists end-to-end. Those are the Reality Probe stage's
> (S7 / T8 live) job, which runs after this review. My green (where given) is a LINT green on the
> metadata-vs-docs bijection — never proof the connector works against Eventbrite's live API.

**Model observed**: `sonnet` (self-reported runtime; this session's context shows no producer-decision
recall beyond what is documented on-disk — consistent with a distinct-model review seat).

## Scope of this pass (slim mode, per task instructions)

Built my independent expected inventory from `SOURCE_STUDY.md` alone, BEFORE opening the emission or
any prior review artifact, written to
`/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/5538b61b-132d-4626-991d-f5f9d59ce21e/scratchpad/eventbrite_reviewer_expected.txt`.
Then ran node count-reconcile scripts directly against
`metadata/integrations/eventbrite/.eventbrite.integration.json` (33 IOs, 346 total IOF rows, zero
zero-field IOs — confirmed mechanically, never parsed the full source into context). Ran a full
mechanical sweep: capability-flag/per-operation-column bijection across all 33 IOs, pagination-type
consistency, incremental-sync/watermark-field presence, and an exhaustive FK-target-resolution sweep
across all 25 `IsForeignKey=true` fields (small enough to check exhaustively, not sampled). Spot-read
~20 fields directly from the metadata file across Event, Attendee, Order, Ticket Class, Venue, Discount,
Webhook, Question, Event Schedule, Balance, Event Description, Media, Media Upload, Organization Member,
cross-checked each against 10 independently-chosen `grep`/`Read` targets in the raw `.apib`
(lines 955–1000 Balance, 2542–2610 Media group, 3085–3170 Canned Question singular/plural quirk,
4492–4520 Attendee object, 4841–4877 Image/Order, 4909–4922 Organizer, 4937–4960 Schedule, 1120–1150
Discount/Ticket Group FK, 2920–2930 Organization vs Organizer warning, 6035–6060 Media Upload types).
Also read the on-disk `INDEPENDENT_REVIEW.md` (this file, prior pass 3 content) AFTER forming my own
independent inventory and findings, per the read-order discipline, and independently re-verified its
prior claims against the current metadata rather than trusting its "resolved" annotations blindly —
this surfaced one genuine **reviewer self-correction** (§3 below), documented honestly.

## 1. Confirmed Gaps

**None.** After a full independent re-derivation of the expected inventory from `SOURCE_STUDY.md` and
the raw `.apib`, plus an exhaustive bijection sweep, capability-honesty check, pagination-honesty check,
and PK/FK correctness check against the CURRENT metadata file, I found zero new blocking or advisory
defects. Specifically:

- **The 3 amendments this round's task brief describes as applied were independently re-verified,
  field-for-field, against the raw source — not merely trusted from the task prompt:**
  - `Media Upload`: `SupportsWrite: true`, `CreateAPIPath: /media/upload/`, `CreateMethod: POST`,
    `CreateBodyShape: flat`, `CreateIDLocation: body`, fields `upload_token` (required) + `crop_mask`
    (optional) — confirmed against `.apib` lines 2567–2589 (`### Upload a Media File [POST
    /media/upload/]`) and 6044–6046 (`### Media Upload Post (object)`). Correct.
  - `Balance`: fabricated `id` PK is absent; the 6 real fields (`currency`, `event_id`→`Event` FK,
    `latest_order_id`→`Order` FK, `latest_timestamp`, `organization_id`→`Organization` FK, `value`) are
    present, `StableOrderingKey: event_id`, no `IsPrimaryKey=true` field — confirmed verbatim against
    `.apib` lines 957–990 (`### Remaining Balance [GET
    /balance/<public_organization_id>/events/<public_event_id>/]`, response wrapped under a `balance`
    key with exactly these 6 fields). Correct.
  - `Event Description`: fabricated `id` is absent; the real `description` field is present, keyless,
    `StableOrderingKey: description` — matches `SOURCE_STUDY.md`'s documented gap #28 (no MSON type,
    raw-HTML retrieve-only). Correct.
- **The 5 required Integration-row identity slots** (`Name`, `Description`, `ClassName`, `ImportPath`,
  `CredentialTypeID`) are all populated and non-null. `CredentialTypeID` resolves via
  `@lookup:MJ: Credential Types.Name=API Key` to a baseline-seeded credential type (verified present in
  `metadata/credential-types/.credential-types.json`).
- **Independently re-verified my own prior review round's (pass 3) blocking finding
  (`Event.organizer_id` mis-attributed FK to `Organization`) is now correctly fixed**: `IsForeignKey:
  false`, no `RelatedIntegrationObjectID`, no `Configuration.ReferencedType` — the FK was cleared, not
  repointed to a still-uncovered `Organizer` IO, matching that round's FixInstruction exactly. Re-checked
  the underlying source claim myself (did not just trust the prior review's citation): `.apib` line 2925
  explicitly states *"The `organization_id` is NOT equal to an `organizer_id`"*, and `### Organizer
  (object)` (lines 4909–4920) is a genuinely distinct MSON type with no top-level CRUD endpoint of its
  own. Confirmed correct fix.
- **Full independent FK-resolution sweep**: all 25 `IsForeignKey=true` fields resolve to an emitted
  sibling IO name, all use the correct `@parent:IntegrationID` qualifier (never `@parent:ID`), zero
  singular/plural mismatches, zero access-path-as-FK contamination (every FK field name ends in `_id`
  or is the bare `id`; no container-folded/nested type — `Cost Component`, `Attendee Barcode`, `Structured
  Content` submodules, etc. — appears as a standalone IO or FK target).
- **Capability honesty (GZ #30 axis)**: 18 of 33 IOs carry a real, source-documented write surface
  (`Event`, `Ticket Class`, `Ticket Group`, `Venue`, `Discount`, `Inventory Tier`, `Event Team`, `Canned
  Question`, `Question`, `Seat Map`, `Webhook`, `Structured Content Page`, `Text Overrides`, `Ticket Buyer
  Settings`, `Display Settings`, `Event Capacity Tier`, `Event Schedule`, `Media Upload`) — every
  `SupportsWrite=true` IO has a populated Create/Update/Delete path+method pair for at least one
  operation, and every populated per-operation path co-groups correctly with its Method (and
  BodyShape/BodyKey/IDLocation where applicable). Not a pull-only emission for a write-capable vendor.
  `Configuration.WriteCapability` at the root gives a coherent vendor-wide summary consistent with the
  per-IO detail.
- **Pagination honesty (GZ dead-pagination axis)**: `PaginationType: Cursor` with the full continuation
  mechanics captured verbatim in `Configuration.PaginationDefaults` (`envelopeKey: "pagination"`,
  `continuationParam: "continuation"`, `hasMoreField: "pagination.has_more_items"`,
  `advanceProtocol`), matching the source's worked pagination example (`.apib` lines 161–178) I
  independently re-fetched. Endpoints with no documented pagination block (`Format`, `Discount`, `Ticket
  Group`, `Seat Map`) correctly carry `SupportsPagination: false` rather than a fabricated cursor claim.
  Zero `SupportsPagination`/`PaginationType` mismatches across all 33 IOs.
- **Scope / enumeration completeness**: `Configuration.OutOfScopeObjectFamilies` correctly records
  Campaigns / Contact Lists / Collections with evidenced reasons matching `SOURCE_STUDY.md` gap #1. 33
  IOs emitted (31 from `SOURCE_STUDY.md`'s own ledger table + `Media` + `Media Upload` — both real,
  independently-addressable resources under `# Group Media`, `.apib` line 2542, that I independently
  discovered are absent from `SOURCE_STUDY.md`'s own 31-row summary table before ever seeing the
  emission; the producer caught and emitted both correctly, closing a gap in the study document's own
  table, not a gap in the emission). Zero zero-field IOs across 346 total IOF rows.
- **PK provable-only discipline**: 6 IOs correctly carry no `IsPrimaryKey=true` field (`Fee Rate`,
  `Balance`, `Event Description`, `Sales Report`, `Attendee Report`, `Media Upload`) — independently
  verified against the raw source that each genuinely lacks a vendor-documented `id`/PK field (`Fee
  Rate` and `Sales Report`/`Report Response Sales` have no `id` in their MSON definitions at all; the
  other 4 are the already-discussed honest-gap cases). `Organization Member`'s single `id` field is
  honestly annotated in its own `Description` as "not documented in Tier-1 source, discovered at
  runtime" and marked via the vendor-wide `universalPK` convention rather than false Tier-1 confidence —
  consistent with `DiscoveryIsAuthoritative: false` at the root.

If this section is empty, the producer's emission is complete to my adversarial scrutiny. **It is
empty.**

## 2. Judgment Calls

### 2.1 `CredentialTypeID` = `API Key` vs. `SOURCE_STUDY.md`'s stated candidate of "OAuth2 Bearer Token"

**What the producer chose**: `CredentialTypeID` resolves to the baseline-seeded `API Key` credential
type.

**What I would have checked (and confirmed defensible)**: `SOURCE_STUDY.md`'s own Authentication section
names "OAuth2 Bearer Token" as the conceptual candidate, and `Configuration.AuthFlow` is recorded as
`oauth2-authcode`. I checked `metadata/credential-types/.credential-types.json` myself: no
"OAuth2 Bearer Token" type exists in the baseline-seeded set; the closest fits are `API Key` (generic
static-secret auth) or `OAuth2 Client Credentials` (a different grant — server-to-server, not
authorization-code). Since Eventbrite's actual mechanism is a static, pre-minted "Private Token"
functioning as a long-lived Bearer credential (per the source's own description — no refresh flow,
issued out-of-band from the API Keys page), `API Key` is arguably the more accurate fit of the two
available baseline types, not `OAuth2 Client Credentials` (which would misrepresent the grant type).

**Why neither is wrong**: both are source-grounded readings of a constrained credential-type baseline
that has no exact `OAuth2 Bearer Token` / `OAuth2 Authorization Code` option. This is a metadata-baseline
limitation, not an extraction defect — flagged for future baseline-credential-type expansion, not a gap
in this connector's emission.

### 2.2 `Media` / `Media Upload` — two IOs derived from one shared `/media/upload/` URL, split by HTTP method and response type

**What the producer chose**: `Media` (`GET /media/{media_id}/`, fields `id`+`url` from the `Image` MSON
type) and `Media Upload` (`APIPath /media/upload/`, fields merging the GET-side `Media Upload` type's
`type` field with the POST-side `Media Upload Post` type's `upload_token`+`crop_mask` fields) as two
separate IOs — both correctly absent from `SOURCE_STUDY.md`'s own 31-leaf summary table (a gap in that
document, independently confirmed by me before ever opening the emission).

**What I would have chosen**: the same split. `# Group Media` (`.apib` line 2542) is a genuine,
independently-documented resource group with its own `## Media Object` intro section, and the
GET-vs-POST field split accurately reflects two distinct MSON types documented at the same URL. I would
not have merged the GET-side `type` field and POST-side `upload_token`/`crop_mask` fields into a single
IO without at least a disambiguating note — but the emission's own `Description` field on the IO already
does this ("Retrieved via GET /media/upload/ (Media Upload MSON type)") and each field's `IsRequired`
flag is set correctly per its originating operation.

**Why neither is wrong**: both readings are source-grounded; the vendor genuinely conflates the
retrieve-upload-status and initiate-upload operations under the same URL path. A reasonable connector
author could model this as a single IO (current choice) or as two IOs split further by direction; this
is a defensible interpretive choice, not a fabrication or an omission.

## 3. Reviewer Errors

### 3.1 Initially (mis-)flagged `IncrementalWatermarkField = changed_since` on `Attendee`/`Order` as a defect — reversed after checking actual framework consumption

Before reading either the task-brief context or the on-disk prior review, my fresh, independent
first-pass reading of the raw source (`.apib` line 4494: `+ changed: ... (datetime) - When the attendee
was last changed` vs. lines 925/946: `+ changed_since (datetime, optional) - Filter Attendees changed on
or after...`) led me to conclude `IncrementalWatermarkField` should hold `changed` (the record's own
field name), not `changed_since` (the query-string filter-parameter name) — reasoning that
`connector-code-conventions.md`'s phrase "the vendor-side cursor/timestamp field" sounded like a
record-field reference.

I then independently verified this against the actual framework consumption pattern (NOT by trusting
the on-disk prior review's own resolution, which had already reached the same conclusion I reached
below) — `grep`-swept every connector under `packages/Integration/connectors/src/` that uses
`IncrementalWatermarkField`. The pattern is unambiguous and consistent across 10+ connectors
(`IMISConnector.AppendDefaultQueryParams`, `GrowthZoneConnector`, `HivebriteConnector`,
`WildApricotConnector.FetchChanges`, `CventConnector`, `OpenWaterConnector`): the slot is emitted as a
**literal outgoing HTTP query-string parameter name** (`${encodeURIComponent(watermarkField)}=...`), not
read from the response body. `NoviConnector.ExtractLatestWatermark` makes the distinction explicit: its
`_watermarkField` parameter is deliberately unused (underscore-prefixed) and the method instead probes a
separate hardcoded list of candidate RESPONSE field names — confirming the framework's own convention
already anticipates and handles request-param-name ≠ response-field-name as a normal case, resolved
per-connector at fetch time, not baked into the single `IncrementalWatermarkField` metadata slot.

**Conclusion**: `changed_since` is correct. My first-pass reading was wrong; documented here honestly
per the charter's instruction that a review with zero reviewer-errors might be one that didn't actually
challenge the producer. This was a genuine near-miss false-positive I caught myself before finalizing,
not a defect I'm walking back under pressure — the metadata is correct as emitted.

## 4. Bijection Check (against `phase0-slots.json`)

- **Integration-row required slots** (`Name`, `Description`, `ClassName`, `ImportPath`,
  `CredentialTypeID`): 5/5 populated, non-null, `CredentialTypeID` lookup resolves. 0 violations.
- **`IntegrationObject.SupportsWrite`/`SupportsPagination`/`SupportsIncrementalSync`/`Status`/`Name`**
  (all `nullable: false`): 0 violations across 33 IOs.
- **Correct bijection contract**: confirmed via `phase0-slots.json` that `SupportsCreate`/
  `SupportsUpdate`/`SupportsDelete` booleans are NOT bijection slots (unmigrated framework-ideal
  columns per `connector-code-conventions.md`, silently dropped by `mj sync push`); the enforced
  contract is `SupportsWrite` (aggregate) + nullable per-operation path/method/bodyshape/bodykey/
  idlocation columns, co-grouped. 0 violations across all 33 IOs against this correct contract.
- **`SupportsIncrementalSync=true` ⇒ non-null `IncrementalWatermarkField`**: both qualifying IOs
  (`Attendee`, `Order`) carry `changed_since`, independently confirmed correct (see §3.1) against 4
  documented `changed_since` query-param declarations (`.apib` lines 925, 946, 2804, 2829, 2855).
- **`IsForeignKey=true` ⇔ resolving `RelatedIntegrationObjectID`, correct `@parent:IntegrationID`
  qualifier, no singular/plural mismatch, no access-path contamination**: 0 violations across all 25 FK
  fields, exhaustively checked (not sampled).
- **`IntegrationObjectField.IsPrimaryKey`/`IsUniqueKey`/`IsRequired`/`IsReadOnly`/`Status`/`Name`/`Type`**
  (all `nullable: false`): 0 violations across all 346 IOF rows.
- **Capability honesty (GZ #30 class)**: not pull-only; 18/33 IOs carry a real, source-documented write
  surface. No defect.
- **Pagination honesty (GZ dead-pagination class)**: `Cursor` type with full continuation-token
  mechanics captured; honest `SupportsPagination: false` where the source shows no pagination block. No
  defect.
- **PK provable-only discipline**: 6 legitimately keyless IOs, each independently re-verified against
  the raw source as genuinely lacking a vendor-documented PK field; no fabricated `id`. No defect.

## 5. Process note — `EXTRACTION_REPORT.md` narrative artifact absent (Advisory, non-blocking)

`connectors-registry/eventbrite/` contains `EXTRACTION_REPORT_MATRIX.csv` and `.rich.csv` (the source
-check matrices) but no `EXTRACTION_REPORT.md` narrative document. The substantive coverage story this
file would summarize is fully present and independently verifiable across `SOURCE_STUDY.md` (the
223→31-leaf ledger + gap log), `CODE_EVIDENCE.json`/`PROVENANCE.json` (107 evidence entries, individually
traceable), and the two CSV matrices — so this did not block my ability to form or verify an independent
inventory, and does not affect metadata correctness. Flagged as **Advisory** (process/deliverable
completeness), not escalated as the charter's "EXTRACTION_REPORT missing entirely" structural-failure
case, because the substantive artifacts it would summarize already exist and were independently
cross-checked in this pass. Recommend the pipeline emit the narrative `.md` on a future run for
completeness, but this does not gate the current metadata.

## Stats

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 1,
  "IndependentSourcesFetched": 2,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/eventbrite/INDEPENDENT_REVIEW.md",
  "FixInstructions": []
}
```
