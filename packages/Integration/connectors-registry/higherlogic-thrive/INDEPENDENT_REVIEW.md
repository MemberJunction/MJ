# Independent Review — Higher Logic Thrive Community connector emission (amendment round 13)

## Charter reminder (verbatim per v2 charter)

**This review CANNOT certify — and does not certify — any model-vs-world claim**: that paths are
LIVE-correct, that pagination params actually advance against a real tenant, that declared PKs are
populated in real records, that the watermark param is accepted by the live API, or that the write
surface really exists end-to-end. This is a **LINT green** (same-source re-read of the docs the producer
extracted from), not a verification of runtime behavior. That is the Reality Probe stage's (S7) job.

This round ran in **SLIM MODE**: the full 116-model HelpPage catalog was NOT re-parsed into context.
Completeness was reconciled mechanically via a small Node script comparing the emitted IO names against
`sources/catalog-classification.json`'s script-asserted `taxonomyLeaves` array (34 leaves), plus targeted
spot-fetches of ~5 individual `sources/ops/*.html` pages to adjudicate specific suspected gaps.

## Method

1. Read `SOURCE_STUDY.md` in full and built an independent expected-inventory scratch file
   (`/tmp/.../hlt_reviewer_expected.txt`) BEFORE opening the emission or any report.
2. Ran a count-reconcile script over the metadata file
   (`metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json`) vs
   `sources/catalog-classification.json`'s `taxonomyLeaves` — IO-name diff, zero-field-IO scan, per-IO
   field counts.
3. Ran targeted scripts for: capability↔method bijection (Create/Update/Delete path+method pairs,
   incremental-watermark presence), FK-target resolution (every `RelatedIntegrationObjectID` `@lookup`
   target checked against the emitted IO name set), pagination-type distribution, PK-presence per IO,
   `OutOfScopeObjectFamilies` contents, `EvidenceStrength` discipline in `PROVENANCE.json`, and a scan
   for RPC-action names (Follow/Recommend/RSVP/Approve/Vote) accidentally emitted as IOs.
4. Spot-fetched (independently, not via the producer's script) 5 raw vendor doc pages under `sources/ops/`
   to adjudicate three suspected gaps that surfaced from the mechanical checks: `SaveEventType.html`,
   `AddIdeaCategories.html`, `UpdateIdeaStatus.html`, `GetVoters_ideationKey.html`,
   `Delete_externalActivityKey_legacyActivityKey.html`.
5. Opened `EXTRACTION_REPORT_MATRIX.csv`/`.rich.csv` only after the above independent pass (there is no
   `EXTRACTION_REPORT.md` narrative in this run — see structural observation below).

## 1. Confirmed gaps

**None.** The emission is complete to this round's adversarial scrutiny, across all four charter lenses:

- **Enumeration coverage**: emitted IO count = 35 = the 34 script-asserted `taxonomyLeaves` PLUS
  `RegistrantClasses` (a leaf the machine ledger dropped because its own ResourceModel was swallowed by
  the vendor's `HttpResponseMessage` doc-generation bug — `SOURCE_STUDY.md`'s narrative table kept it in
  scope and the emission honors that, with the gap honestly noted rather than the object being silently
  dropped). Zero missing leaves, zero unexplained extras, zero zero-field IOs.
- **Bijection coherence**: 0 violations across all 35 IOs for Create/Update/Delete path+method pairing,
  wrapped-BodyKey requirement, and `SupportsIncrementalSync`→`IncrementalWatermarkField` presence. All 46
  `RelatedIntegrationObjectID` `@lookup` targets resolve to an IO name emitted in this same run (no
  singular/plural mismatches found).
- **Capability honesty vs. the source study**: every write-capable object identified in
  `SOURCE_STUDY.md`'s CRUD table is emitted `SupportsWrite=true` with correctly scoped
  Create/Update/Delete flags (including the narrower cases — `DemographicTypes`/`DemographicChoices`
  create-only, `DocumentAttachments` create+delete no update, `Volunteers` create+delete no update).
  `ExternalActivity`'s documented idiosyncrasy (Update's ID travels in the BODY, not a path segment) is
  correctly captured as `UpdateIDLocation: "body"`. No RPC-shaped operation (Follow/Recommend/RSVP/
  Approve/Vote) was found modeled as its own IO.
- **Naming/plurality/evidence-tier discipline**: 0 `PROVENANCE.json` entries with `EvidenceStrength:
  'InferredFromContext'` on a hard-constraint `TargetField` (239 entries scanned). Genuinely undocumented
  fields (`EventTypes` pre-recovery, `RegistrantClasses`, `IdeaVoters`) are left PK-deferred/honestly
  noted rather than fabricated. No Higher Logic Vanilla / Thrive Marketing object bleed found (product
  boundary held — the only hits for those strings in the metadata file are disambiguating prose, not
  emitted objects).

## 2. Judgment calls

1. **`Ideas.UpdateIdeaStatus` not modeled as `SupportsUpdate`.**
   - *Producer's implicit choice*: `Ideas` emits `SupportsCreate=true`, `SupportsUpdate=false`,
     `SupportsDelete=false`, even though `POST Ideation/UpdateIdeaStatus` exists and does partially
     update an Idea record (it accepts exactly `IdeationKey` + `IdeationStatusKey` — confirmed by
     independently fetching `sources/ops/POST-api-v2.0-Ideation-UpdateIdeaStatus.html`).
   - *What I would have chosen*: I initially expected `SupportsUpdate=true` per the source study's own
     CRUD table (`Ideas | POST Ideation/Post | POST Ideation/UpdateIdeaStatus | n/a`).
   - *Why neither is wrong*: `UpdateIdeaStatus` is a narrow, 2-field status-transition endpoint, not a
     general full-record update. Wiring it into the generic `UpdateBodyShape:'flat'` path (which the
     bijection convention assumes carries the writable field superset) would misrepresent the endpoint's
     real narrow contract. Leaving it unmodeled is a defensible, source-grounded conservative choice;
     modeling it as a generic Update is also defensible since the source study explicitly lists it as
     the object's Update path. Both readings are source-grounded — a judgment call, not a gap.

2. **`IdeaVoters` emitted as a keyless summary IO (3 fields, 0 PK) rather than folded into `Ideas` as an
   informational nested field.**
   - *Producer's choice*: kept `IdeaVoters` as its own IO (matching `SOURCE_STUDY.md`'s COVERABLE table,
     which itself already made this call), with fields `IdeationKey`/`Upvoters`/`Downvoters` and no PK.
   - *Independent verification*: fetched `sources/ops/GET-api-v2.0-Ideation-GetVoters_ideationKey.html`
     directly — the real vendor response is *"Two arrays of display names of the up- and down-voters"*,
     i.e. plain strings with no key field at all, one summary object per idea, not per-voter identity
     rows.
   - *What I would have chosen*: given the vendor payload has no per-row identity, I'd lean toward
     folding this into `Ideas.Voters` as an INFORMATIONAL nested field rather than a top-level record
     stream with a permanently-null PK.
   - *Why neither is wrong*: `SOURCE_STUDY.md` already scoped this as a COVERABLE leaf (own dedicated GET
     endpoint, own ResourceModel — the stated bar for COVERABLE), and the producer preserved that call
     honestly (no PK fabricated to paper over the mismatch). Both "own IO, honestly keyless" and "fold
     into parent as informational" are legitimate readings of a genuinely edge-case vendor shape.

## 3. Reviewer errors

1. **Suspected fabrication on `EventTypes`'s 29 emitted fields — NOT a gap.** `SOURCE_STUDY.md` §Gaps#2
   states *"`EventTypes` and `RegistrantClasses` have NO documented fields at all"* (referring to the
   broken `GetEventTypes`/`GetEventType` GET-response docs). The emission nonetheless carries 29
   plausible, real-looking fields (`EventTypeName`, `AllowMultipleRegistrations`, `AcceptPayment`, etc.)
   on `EventTypes`. I initially flagged this as a likely fabrication. Independently fetching
   `sources/ops/POST-api-v2.0-Events-SaveEventType.html` (the write operation's Body Parameters section
   + its sample JSON) confirmed all 29 fields are real, Tier-2 `ExplicitStatement`-grade evidence from a
   *different* section of the vendor docs than the one the source study's gap note was about — a
   legitimate alternate-source recovery the source study itself didn't anticipate, not a fabrication.
   `PROVENANCE.json` correctly cites this distinct URL + excerpt for `io.EventTypes.SupportsWrite` /
   the field set. My initial suspicion did not hold up.

2. **Suspected capability-honesty gap on `IdeaCategories` (expected `SupportsCreate=true`) — NOT a gap.**
   `SOURCE_STUDY.md`'s CRUD table lists `IdeaCategories | POST Ideation/AddIdeaCategories`, which read
   like a create endpoint. The emission leaves `IdeaCategories` fully read-only
   (`SupportsWrite=false`). Independently fetching
   `sources/ops/POST-api-v2.0-Ideation-AddIdeaCategories.html` showed the operation's real body model is
   `SetIdeaCategoriesRequest { IdeationKey, IdeationCategoryKeys }` — i.e. it *assigns existing category
   keys to an idea*, it does not create new `IdeaCategory` records. This is an association/RPC-shaped
   action, correctly excluded from generic record-CRUD per the anti-RPC-as-object rule the producer
   is held to. My initial suspicion (drawn from the source study's own table wording) did not hold up
   against the underlying vendor doc page.

## Structural observation (not a gap, noted for the record)

There is no `EXTRACTION_REPORT.md` narrative file in this run directory — only
`runs/.../output/EXTRACTION_REPORT_MATRIX.csv` (+ `.rich.csv`). Per the read-order discipline I opened
this LAST, after independently forming my own inventory, and it did not change any finding above; the CSV
matrix's per-IO source-check columns are consistent with what I independently reconstructed (all 35 rows
present, `PKVerdict`/`FKVerdict` columns align with the deferred-vs-emitted PK calls checked above). Since
this is a structural/format observation rather than a coverage or bijection defect, and the mechanical
matrix substitutes for the narrative report's content, I am not escalating it as a Phase 2c structural
failure — but future rounds should confirm whether a narrative `EXTRACTION_REPORT.md` is expected to exist
alongside the matrix per the standard contract.

## Stats

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 0,
  "JudgmentCalls": 2,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 7,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/higherlogic-thrive/INDEPENDENT_REVIEW.md",
  "FixInstructions": []
}
```
