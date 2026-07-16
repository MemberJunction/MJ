# INDEPENDENT_REVIEW.md — Impexium (re:Members AMS) extraction (Phase 2c, amendment round 7)

**Reviewer**: IndependentReviewer, a different model surface (Sonnet 5) than the producer/coordinator.

**Scope discipline (v2 charter)**: This review is a **same-source read**, not a live-system verification. I
certify enumeration coverage, bijection coherence, capability honesty vs. the documented API surface, and
naming/plurality/evidence-tier discipline. I **CANNOT** and do **NOT** certify that any path is LIVE-correct,
that pagination params actually advance, that declared PKs are populated in real records, that the watermark
param is accepted, or that the write surface really exists against a live host. This connector's ceiling is
`format-verified-no-creds`. A green here is a LINT green, not a verification.

**This is round 7's review**, checking the state after `amend-round6.mjs` (which applied round 6's four
`FixInstructions`: `integration.Description`, `integration.ImportPath`, `integration.CredentialTypeID`, and
`iof.RelationshipTypes.name.IsPrimaryKey`). No separate `EXTRACTION_REPORT.md` exists for this connector (none
exists for any vendor in this registry as of this pass — the v2 pipeline's report-equivalent artifacts are
`EXTRACTION_REPORT_MATRIX.csv` + `contract.json` + `DUAL_DERIVATION.json`, consistent across hubspot/zendesk/
impexium). This is not a Phase-2c structural failure; it is the current pipeline convention.

**SLIM MODE method used this pass**:
1. Independent expected-inventory scratch file written from `SOURCE_STUDY.md` alone
   (`/private/tmp/.../impexium_reviewer_expected.txt`) — confirmed already present from an earlier pass in this
   session and re-verified it matches a fresh independent read of `SOURCE_STUDY.md` before opening the emission.
2. A node count-reconcile script over the metadata file only (46 IOs / 433 IOFs, zero-field scan — **0 zero-field
   IOs**, forward + inverse capability↔column bijection across all 4 CRUD verbs — **0 violations** — and
   incremental-watermark bijection — **0 violations**, all 4 `SupportsIncrementalSync=true` IOs have a matching
   `IncrementalWatermarkField`).
3. Verified round 6's four `FixInstructions` were mechanically applied and correct: `integration.Description`,
   `integration.ImportPath`, and `integration.CredentialTypeID` are now populated (`CredentialTypeID` resolved to
   an actual `@lookup` value, going beyond the round-6 `requiresEscalation` deadlock — a human/producer decision
   was made and is transparently documented in `Configuration.AuthModel` as "UNVERIFIED-at-plan-time"); and
   `RelationshipTypes.name.IsPrimaryKey` is now `true`.
4. Independently re-derived and verified three real scalar FKs found in the emission
   (`Organizations.parentCompanyId→Organizations.id`, `Committees.parentCommitteeId→Committees.id`,
   `EventRegistrations.individualId→Individuals.id`) against the raw swagger's named `definitions` directly
   (`python3` property-key scans of `OrganizationData`, `CommitteeData`, `RegistrationData`) — all three are real
   scalar fields in the cited definitions, not access-path guesses, and all three FK targets resolve to a sibling
   IO emitted in this same run with exact name matches.
5. A systematic sibling-PK-name-match scan across all 46 IOs' `String`-typed non-FK fields for missed FK
   candidates (see Gap 16 below) plus manual verification of every `*Id`/`*Code`-suffixed field not already
   flagged as FK.
6. Re-investigated every item in this run's own `contract.json` `gapsRemaining` (a residual dual-derivation
   tool report carried in the run artifacts) against the raw swagger directly — see Reviewer Errors RE1–RE3
   below; none of the three flagged categories held up as real gaps upon independent verification.
7. A scope-contamination re-grep (`shipment|container|certificate.of.origin|impexdocs|export.declaration|
   customs.broker`) — the only hits are inside `Configuration.OutOfScopeObjectFamilies` reasoning text
   (correctly documenting `apidocs.impexdocs.com` as excluded, never as an emitted object) — **clean**.
8. Sample field-shape spot check across 8 IOs (`Organizations`, `Awards`, `Exams`, `Individuals`, `Committees`,
   `CommitteeMembers`, `CommitteeNominees`, `CustomFieldValues`) plus a pagination-literal-preservation scan
   across all `PaginationType=PageNumber` IOs (**0 missing page-segment literals** — no GZ-style dead-pagination
   defect) and a `Memberships`-specific check confirming its `PaginationType=None` is **correct**, not a miss
   (the swagger's `Get-Individual-{Active,Inactive}-Memberships` paths genuinely carry no page-number segment,
   unlike the other 45 IOs — independently confirmed via `full-operation-list.txt`).

---

## 1. Confirmed gaps

### Gap 16 (Advisory) — `Orders.customerId` not marked as a foreign key to `Individuals`, inconsistent with the sibling `EventRegistrations.individualId` precedent in the same emission

**What the gap is**: `PayableOrderData` (the schema backing the `Orders` IO) declares a real scalar field
`customerId` (`{"type": "string", "description": "Customer Id.", "title": "Customer Id"}` — independently
confirmed via a direct `python3` scan of `sources/apiDefinition.swagger.json` `definitions.PayableOrderData
.properties`). `Orders`' only documented access path is nested exclusively under
`GET /api/v1/Individuals/{ID}/Orders/Open/{Page Number}` (no `/Organizations/.../Orders` door exists anywhere in
the 116-path surface, confirmed by grep). The `Individuals` IO exists in this same run with `IsPrimaryKey=true`
on its `id` field. Yet `Orders.customerId` is emitted with `IsPrimaryKey:false`, `RelatedIntegrationObjectID:null`
— no FK link.

This is a genuine inconsistency, not a fabrication risk: the **exact same pattern** (`RegistrationData
.individualId`, a scalar `Individual ID` field on a record nested exclusively under
`/Individuals/{ID}/Registrations/...`) **was correctly caught and linked** as
`EventRegistrations.individualId → Individuals.id` elsewhere in this same emission. `Orders.customerId` is the
same shape of evidence and was missed.

**Source citation**: `sources/apiDefinition.swagger.json` `definitions.PayableOrderData.properties.customerId`;
`sources/full-operation-list.txt` line for `Get-Open-Orders-for-an-Individual` (single, Individual-only door).

**What the emission currently has**: `Orders.customerId` — `Type: String`, `IsPrimaryKey: false`,
`RelatedIntegrationObjectID: null`.

**Severity**: Advisory — the connector remains functionally correct without this FK (the parent linkage is
already available via the `{ID}` path-segment template and `Configuration.accessPaths`), but the emission is
inconsistent with its own applied precedent, and a future FK-graph consumer (e.g. an ERD generator) would
silently miss this real relationship. Not blocking because no downstream mechanism depends on this specific FK
existing (unlike the Phase-0 bijection-required columns).

---

## 2. Judgment calls

### JC1 — Promoting 9 sub-resource write actions to independent IOs beyond `SOURCE_STUDY.md`'s original 37-leaf ledger

`SOURCE_STUDY.md` §3 classified `EmailData`/`PhoneDataSet`/`AddressSaveData`/`SaveCategoryBasicData`/
`CustomFieldData` as **INFORMATIONAL** ("no independent GET-list endpoint... exist only as add/update
sub-actions... already embedded as nested fields on `IndividualData`/`OrganizationData`"), and never mentions
`Links` or the `Attended` action at all (both have `resp=null` in `full-operation-list.txt` — no named response
schema, so they fall outside the 73-definition ledger entirely). The current emission (46 IOs) instead promotes
`Addresses`, `Emails`, `Phones`, `Notifications`, `Categories`, `Links`, `CustomFieldValues`, `SessionRegistrations`,
and `EventAttendance` to independent write-capable IOs (documented as "new in round 5" in
`Configuration.WriteCapableSubResourceReconciliation`).

**Producer's reasoning**: these are real, independently write-capable sub-resources with their own request-body
shape, exactly analogous to `Activities`/`Notes` — which `SOURCE_STUDY.md` itself already treats as legitimate
independent (write-only, no-list) leaves. Treating `Addresses`/`Emails`/`Phones`/etc. differently from
`Activities`/`Notes` would be an arbitrary distinction given both categories share the identical shape (write-only
sub-action against a parent, no independent GET-list).

**My independent verification**: I confirmed via direct swagger inspection that every one of these 9 promoted
objects corresponds to a real, documented endpoint (`POST/DELETE .../Links`, `PUT .../Events/Registrants/
{recordNumber}/Attended`, `POST/PUT .../Emails`, `POST/PUT .../Phones`, `POST .../Addresses`, `POST .../
Notifications`, `POST/DELETE .../Categories`, `POST .../Sessions/Register/{CustomerID}`) — none of these is a
fabrication or wrong-vendor contamination.

**Why neither is wrong**: `SOURCE_STUDY.md`'s original call (fold into parent's nested field) and the extractor's
later call (promote to independent write-capable IOs) are **both** defensible, source-grounded positions once
`Activities`/`Notes` are already accepted as the template precedent. This is genuinely a scope-generosity
judgment call, not a gap — the promoted IOs are real, correctly-typed, and don't duplicate coverage.

### JC2 — `Committees`/`CommitteeNominees` primary key: `id` vs `code`

The run's own dual-derivation tool flagged this as worth a human check (nested child paths under Committees
address it by `{Code}`, never a bare `{id}`, and there is no `GET /Committees/{id}` endpoint). I independently
inspected `definitions.CommitteeData` directly: **`id` carries `"format": "uuid"`**, while `code` is a plain,
unformatted string. A UUID-formatted `id` alongside a separate human-facing `code` used for URL-friendly
addressing is a common and well-understood pattern (surrogate PK + natural/business key used in routes) — this is
meaningful additional evidence in the producer's favor that I did not have before independently checking the
schema's `format` annotation. **Why neither is wrong**: the tool's concern (all navigation uses `{Code}`) is a
real, correctly-observed pattern; the producer's choice (`id`, format:uuid) is the more conventional and
consistent PK choice given the sibling-object `id` fields elsewhere in this vendor's schema also carry
`format:uuid` where present. Reasonable reviewers could flag this for a live-probe confirmation, but it is not a
blocking gap on the evidence available.

---

## 3. Reviewer errors

### RE1 — The "14 record types not emitted" dual-derivation flag was a false alarm on every item checked

I initially treated this run's own `contract.json` `gapsRemaining` entry — "14 record type(s) the source exposes
were NOT emitted: `BaseNoteData`, `CommitteeMemberCreateData`, `CommitteeMemberUpdateData`,
`CommitteeNomineeSaveData`, `ContactData`, `CustomFieldValueData`, `ExamScoreData`,
`IndividualLookupBasicData`, `OrganizationLookupBasicData`, `PhoneSaveData`, `RegistrationData`,
`RequestUpdateData`, `TaskSaveData`, `UpdateAwardNominationData`" — as a plausible real gap worth investigating
first. On independent verification against `SOURCE_STUDY.md` §3/§4 and the emission itself, **every one** of
these resolves cleanly: 8 are write-shape variants (`*SaveData`/`*CreateData`/`*UpdateData`) that
`connector-code-conventions.md` explicitly requires to be container-folded into their base object's leaf, and
which ARE correctly folded (`CommitteeMemberCreateData`/`UpdateData`→`CommitteeMembers`,
`CommitteeNomineeSaveData`→`CommitteeNominees`, `RequestUpdateData`→`CustomerRequests`, `TaskSaveData`→`Tasks`,
`UpdateAwardNominationData`→`AwardNominations`, `PhoneSaveData`→`Phones`, `ExamScoreData`→`ExamScores`,
`BaseNoteData`→`Notes`); 3 are cross-type search/lookup result projections (`ContactData`,
`IndividualLookupBasicData`, `OrganizationLookupBasicData`) that `SOURCE_STUDY.md` §3/§6 explicitly classifies
INFORMATIONAL (not independent syncable identities); `CustomFieldValueData` is subsumed by the promoted
`CustomFieldValues` IO (JC1); and `RegistrationData` is one of the two schemas folded into the two-door
`EventRegistrations` leaf (§3's "container-fold" finding), which does exist and carries 31 fields. This is a
tool limitation (the dual-derivation script appears to re-derive on a strict 1:1 named-definition↔IO basis and
doesn't model container-folding, two-door folds, or write-shape-variant folding), not a connector defect. I flag
this for the framework team as tool feedback, not as a gap against this connector.

### RE2 — The "2 fabricated objects: `Links`, `EventAttendance`" dual-derivation flag was also a false alarm

Same `contract.json` artifact flagged `Links` and `EventAttendance` as "NOT re-derivable from the source." I
independently confirmed both correspond to real, documented endpoints: `POST/DELETE /api/v1/Individuals/{ID or
Record Number}/Links` (request/response body directly inspected via `python3` — a real `{type, url}` object
schema) and `PUT /api/v1/Events/Registrants/{recordNumber}/Attended` (real array-of-`{eventOrSessionCode}`
request body). Both have `resp=null` in `full-operation-list.txt` — i.e., no *named* response schema — which is
almost certainly why the dual-derivation tool's named-definition-based re-derivation heuristic cannot find them
and flags them as "fabricated." Neither is a wrong-vendor contamination or an invented object; both are real,
provable, write-only sub-resources exactly analogous to the already-accepted `Activities`/`Notes` leaves.

### RE3 — Suspected the zero-PK count (11 of 46 IOs) might hide a missed-PK gap; independent per-object swagger check found none

Before checking, I flagged the 11 zero-PK IOs (`Purchases`, `AbandonedCheckouts`, `EducationCredits`,
`Exhibitors`, `Activities`, `Notes`, `Relationships`, `Links`, `Notifications`, `SessionRegistrations`,
`EventAttendance`) as requiring individual verification per the PK/FK missed-gap probe. I checked all 11 field
lists directly against their backing swagger schemas (`PurchasedItemData`, `AbandonedCheckoutData`,
`EducationCreditData`, `ExhibitorData`, `ActivityData`, `NoteData`, `RelationshipData`, the inline `Links`/
`Attended`/`Notifications`/`SessionRegistrationData` request shapes) — **none of them has an `id`/`recordNumber`/
similar identifier field anywhere in its schema** (most are write-only actions or line-item-style records with no
independent identity documented anywhere in the 843KB spec). The zero-PK emission is correct, provable-only
behavior, not a missed extraction.

---

## Stats

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 3,
  "IndependentSourcesFetched": 6,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/impexium/INDEPENDENT_REVIEW.md",
  "FixInstructions": [
    {
      "slot": "iof.Orders.customerId.RelatedIntegrationObjectID",
      "operation": "set",
      "before": null,
      "after": "@lookup:MJ: Integration Objects.Name=Individuals&IntegrationID=@parent:IntegrationID",
      "evidence": "packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json definitions.PayableOrderData.properties.customerId (real scalar 'Customer Id' field); Orders' sole documented access door is /api/v1/Individuals/{ID}/Orders/Open/{Page Number} (no Organizations door exists).",
      "rationale": "Same evidentiary shape as the already-linked EventRegistrations.individualId -> Individuals.id FK in this same emission; leaving Orders.customerId unlinked is an inconsistent application of the producer's own precedent, not a deliberate scope decision."
    },
    {
      "slot": "iof.Orders.customerId.RelatedIntegrationObjectFieldName",
      "operation": "set",
      "before": null,
      "after": "id",
      "evidence": "Same as above.",
      "rationale": "Companion field required alongside RelatedIntegrationObjectID per the FK bijection convention."
    }
  ]
}
```
