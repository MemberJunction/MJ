# Independent Review — Wild Apricot Connector (Amendment Round 2)

**Reviewer model:** Claude Sonnet 5 (claude-sonnet-5)
**Review date:** 2026-07-01
**Emission file:** `metadata/integrations/wildapricot/.wildapricot.integration.json`
**Source spec:** `packages/Integration/connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json` (re-parsed independently via standalone Node/Python one-off scripts against the local cached copy — never loaded into context wholesale)
**Prior review:** `INDEPENDENT_REVIEW.md` Round 1 (sonnet-5) found GAP-3 (Blocking — 16 unresolved documented FK fields across the 11 first-class financial/event objects) and GAP-4 (Advisory — `json`-typed `LinkedResource` fields on `EventRegistration`). Both re-verified in this round (see Reviewer Errors / Verified Fixes below). Round 0 (sonnet-4-6) found GAP-1/GAP-2, confirmed fixed in Round 1 and re-confirmed intact here.

---

## CERTIFICATION BOUNDARY (read first, verbatim per charter)

This review is a **LINT green only**. It certifies:
- Enumeration coverage vs the SCRIPT-enumerated catalog (TaxonomyLeaves / SOURCE_STUDY's 26 COVERABLE taxonomy)
- Bijection coherence — capability flags ↔ per-operation columns ↔ watermark fields ↔ FK lookups
- Capability honesty vs the source study (write surface, OAuth vs Basic auth)
- Naming/plurality/evidence-tier discipline

This review **CANNOT certify**: that `APIPath` values are LIVE-correct, that pagination params (`$skip`/`$top`) actually advance against a real server, that declared PKs are populated in real records, that the watermark param (`ProfileLastUpdated`) is accepted by the live API, or that the write surface really exists. Those are the **Reality Probe stage's (S7)** job, which runs after this review. This green is a LINT green, never a verification green.

---

## Methodology note (slim mode)

Per instructions, I did not parse the full OpenAPI spec/docs into context. I built my expected inventory from `SOURCE_STUDY.md` + `SOURCES.json` alone, written to `/tmp/.../wildapricot_reviewer_expected.txt` BEFORE opening the emission, then ran small standalone Node/Python scripts to: (1) reconcile object/field/zero-field counts between the emission and the cached spec, (2) targeted `JSON.parse`/dict-key reads of specific schema definitions (`SentEmailRecipient`) and path lists to confirm structural claims, (3) full-file scans of the emission (not the source) for bijection invariants (FK target resolution, `@parent:IntegrationID` qualifier, capability↔column lockstep, watermark presence, PK-naming-convention consistency) — these are counts/booleans over the emission JSON, not prose reads of vendor docs.

**Count-reconcile results:**
- Emission: 62 IOs, 548 IOFs, **0 zero-field IOs**.
- `CODE_EVIDENCE.json`'s cumulative `extract-io-iof.ts` runs report `IOCreated:62`, last full-extraction `IOFCreated:527`; the +21 delta to the file's actual 548 reconciles exactly against `amend-round1.ts`'s EmailLog field-set replacement (2→23 fields, net +21) — confirmed by inspecting that script directly. No unaccounted discrepancy.
- `62 emitted + 90 skipped = 152` matches `FloorUniverse:152` = SOURCE_STUDY's own `EnumerationStdoutCount` (line 273) exactly. Full accounting closes; no unaccounted gap between the enumerator's stdout and the emission.
- All 26 expected COVERABLE IO names (built independently from SOURCE_STUDY's taxonomy table, before opening the emission) are present in the emission by exact name match.
- All 19 `priorBakedObjectNames` map 1:1 onto the new catalog under their doc-justified singular/schema-name renames — verified by walking each mapped pair and confirming both presence AND a non-trivial field count (not just a name match).

---

## 1. Confirmed Gaps

### GAP-3 / GAP-4 (Round 1, Blocking/Advisory) — RESOLVED, independently re-verified

I did not take the producer's `CODE_EVIDENCE.json` amendment-round entry at face value. I re-derived all 18 of Round 1's FixInstructions independently against the current emission:

| IO.Field | `RelatedIntegrationObjectID` | `Configuration.ReferencedType` | Qualifier correct (`@parent:IntegrationID`, not `@parent:ID`) |
|---|---|---|---|
| Donation.Contact | set → Contact | Contact | yes |
| Donation.Payment | set → Payment | Payment | yes |
| Invoice.Contact | set → Contact | Contact | yes |
| Invoice.EventRegistration | set → EventRegistration | EventRegistration | yes |
| Payment.Contact | set → Contact | Contact | yes |
| Payment.Tender | set → Tender | Tender | yes |
| Refund.Contact | set → Contact | Contact | yes |
| Refund.Tender | set → Tender | Tender | yes |
| PaymentAllocation.Invoice | set → Invoice | Invoice | yes |
| PaymentAllocation.Payment | set → Payment | Payment | yes |
| EventRegistration.Event | set → Event | Event | yes |
| EventRegistration.Contact | set → Contact | Contact | yes |
| AuditLogItem.Contact | set → Contact | Contact | yes |
| CeuRecord.Contact | set → Contact | Contact | yes |
| Bundle.MembershipLevel | set → MembershipLevel | MembershipLevel | yes |
| Contact.MembershipLevel | set → MembershipLevel | MembershipLevel | yes |
| Order.contactId | set → Contact | Contact | yes |
| Order.invoiceId | set → Invoice | Invoice | yes |

All 18/18 applied correctly. All 18 FK target names resolve (case-sensitive) to a sibling IO present in this same emission — confirmed via a full-file scan of all 59 `@lookup:`-form `RelatedIntegrationObjectID` values in the emission (not just the 18 newly-fixed ones), with zero unresolved targets. All 59 use the correct `@parent:IntegrationID` qualifier (zero instances of the `@parent:ID` defect class documented in `metadata-file-conventions.md`). The round-0 Feature/EmailLog fixes remain intact and uncorrupted by this round's amendment script (`Feature.APIPath` still `null`/`PaginationType:"None"`; `EmailLog` still carries its 23-field `EmailLogRecord` set with `Id` PK).

**Verdict: both closed.** No re-opening required.

---

### GAP-5 (Advisory) — The 18 Round-2 FK fixes lack individually-granular `PROVENANCE.json` entries; only a single aggregate `CODE_EVIDENCE.json` entry covers all 18

**What:** `connector-provenance-conventions.md` requires each hard-constraint field claim to be cited individually, with a narrow grouping exception only "when multiple columns share an evidence excerpt" (e.g., one OpenAPI operation co-declaring path+method+body-shape in one place). The original extraction pass respected this discipline: **205 distinct `RelatedIntegrationObjectID` entries exist in `PROVENANCE.json`**, one per field, each with its own excerpt (verified by grepping the full 680-entry provenance file for `RelatedIntegrationObjectID` targets). But the 18 fields fixed by `amend-round2.ts` have **zero** matching `PROVENANCE.json` entries — I checked all 18 target-field strings individually against the 205 `RelatedIntegrationObjectID`-bearing entries and found none. Instead, all 18 are covered by a **single** `CODE_EVIDENCE.json` entry whose `TargetField` is one comma-separated prose string listing all 18 targets, even though each of the 18 fixes in `amend-round2.ts`'s own `FIXES` array carries a **distinct** `evidence` string (e.g. `"Donation.properties.Contact ($ref LinkedResource)"` vs `"PaymentAllocation.properties.Invoice (LinkedResource)"` — different schema, different property, different excerpt per fix). This doesn't fit the "shared excerpt" grouping exception; it's 18 genuinely distinct claims collapsed into one entry.

**What the producer's report says about it:** The `CODE_EVIDENCE.json` entry for `amend-round2.ts` is present and does state `amendmentApplied: 18` with the source script + spec file named — so the *fact* that 18 fixes were applied, and generally from where, is recorded. But it does not give `verify-claim`/`adversarial-verify` (or a future reviewer) the ability to isolate and re-check any ONE of the 18 claims independently — re-running the cited evidence re-verifies "18 fixes happened," not "the `Refund.Tender → Tender` claim specifically traces to `Refund.allOf[1].properties.Tender`."

**Severity: Advisory** (downstream-can-handle). The underlying claims ARE traceable — `amend-round2.ts` is committed, human-readable, and its own `FIXES` array carries the per-fix `evidence` string that `PROVENANCE.json` is missing — so this is a format/granularity gap in the evidence trail, not a missing or fabricated claim. I am not marking this Blocking because (a) the FK claims themselves are all independently re-verified correct against the spec by me in this round, (b) the mechanical fix is trivial and low-risk (backfill 18 `PROVENANCE.json` entries from the already-existing `FIXES` array's `evidence` strings — no new source research needed), and (c) it does not affect runtime correctness, only audit-trail granularity for a future re-verification pass.

---

## 2. Judgment Calls

### JC-8 — Re-affirming Round 1's JC-5/JC-6/JC-7 (NESTED_DETAIL IOs, root-level pagination config, AttachmentData write-scope)

I independently re-derived these three from SOURCE_STUDY before reading Round 1's writeup and reached the same conclusions Round 1 did: (1) emitting 36 NESTED_DETAIL sub-objects as full IOs (beyond the 26 COVERABLE) is a legitimate producer design choice, not a gap — it's what makes the FK-fix mechanism in GAP-3 cheap, since the same `RelatedIntegrationObjectID`+`Configuration.ReferencedType` pattern the fix uses is already proven correct on 41 nested-IO-to-parent back-references; (2) declaring `$skip`/`$top` pagination param names once at `Integration.Configuration.PaginationDefaults` rather than repeating them per-IO is a defensible DRY choice given the vendor's pagination scheme is genuinely global, not per-resource — and I confirmed independently the `$`-prefix is correct (`skipParam:"$skip"`, `topParam:"$top"`), which is the specific failure mode ("skip vs $skip") this review's charter calls out; (3) `AttachmentData.SupportsWrite=false` despite SOURCE_STUDY's "R+Create" label is defensible because the underlying endpoint is a narrow multipart file-upload (`POST /attachments/Upload`), structurally distinct from the generic flat/wrapped JSON create model, and the connector's root-level `WriteCapability` block already gives an honest account of the 11 first-class objects that DO have full Create/Update/Delete wiring — so this is not a GrowthZone-#30-class silent-pull-only-connector-for-a-bidirectional-vendor problem. Not gaps.

### JC-9 — `IsForeignKey` left `undefined` on all 59 `RelatedIntegrationObjectID`-bearing fields, including the 18 new ones

**Producer chose:** Set `RelatedIntegrationObjectID` + `Configuration.ReferencedType` on every resolved FK field, but never set the boolean `IsForeignKey` flag (it is `undefined` on literally all 59 FK-lookup fields in the file, not just the 18 newly fixed — this is a pre-existing, universally-applied pattern from the original extraction, not something Round 2 introduced or regressed).

**What I would have checked:** Given the connector code conventions explicitly discuss `IsForeignKey` as a hard-constraint-adjacent flag for FK detection, I checked `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` to see whether this is a required bijection slot.

**Why neither is wrong:** `phase0-slots.json` declares no `IntegrationObjectField.IsForeignKey` slot at all — only `RelatedIntegrationObjectID` and `RelatedIntegrationObjectFieldName`, both explicitly `nullable: true`. Since the floor-check's bijection table doesn't require `IsForeignKey`, and `RelatedIntegrationObjectID` + `Configuration.ReferencedType` together already carry the full FK-resolution signal a downstream consumer (association-table generation, sync ordering) needs, leaving `IsForeignKey` unset is consistent with the rest of this same emission and not a regression specific to this round. This is a candidate for a future framework-level consistency pass (should `IsForeignKey=true` be derived automatically whenever `RelatedIntegrationObjectID` is a resolved `@lookup:`?), but it's a pattern that spans the entire file uniformly, not something Round 2 introduced or should be blamed for fixing unilaterally.

---

## 3. Reviewer Errors

### RE-6 — Expected Round 2's amendment to possibly be partial or to have clobbered Round 0/1's earlier fixes; both are fully intact and Round 2 is complete

Per the charter's default-suspicion framing, I approached this round expecting to find at least one of the 18 FixInstructions dropped, mis-targeted, or applied with the wrong qualifier syntax (`@parent:ID` instead of `@parent:IntegrationID` — a documented real-world defect class in this codebase). I also suspected the surgical `amend-round2.ts` rewrite might have silently clobbered Round 0's `Feature`/`EmailLog` fixes given it does a full-file atomic rewrite. On independent verification: all 18/18 fixes applied correctly with the correct qualifier, all FK targets resolve, and both Round 0 fixes remain fully intact. This was a reviewer error in my initial adversarial posture — I found the amendment complete and precise, matching the FixInstructions from Round 1 essentially verbatim (down to the specific evidence excerpts cited in `amend-round2.ts`'s own `FIXES` array). No further action needed on GAP-3/GAP-4.

### RE-7 — Suspected `SentEmailRecipient`'s missing PK might be a missed-signal gap (per the PK/FK missed-gap probe); found it is a genuine source characteristic

Per the reviewer charter's mandatory PK/FK missed-gap probe, I flagged `SentEmailRecipient` (a first-class COVERABLE taxonomy #23 with its own `/SentEmailRecipients` endpoint) as suspicious for having zero `IsPrimaryKey=true` fields. I independently re-fetched the `SentEmailRecipient` schema definition from the cached OpenAPI spec (targeted Python dict-key read, not a full-file parse) and confirmed the vendor's own schema genuinely has no `Id` field — it is keyed by `ContactId` + implicit parent context, with no standalone identifier. This is correctly deferred rather than fabricated (the synthetic-PK/content-hash-identity fallback path per the connector code conventions is the correct downstream behavior for a genuinely PK-less record), not a missed signal. I document this rather than silently dropping my initial suspicion.

---

## Bijection check against `phase0-slots.json`

Full-file scans (not spot-samples) across all 62 IOs / 548 IOFs in this round:

- **`IntegrationObjectField.RelatedIntegrationObjectID`** — 59 `@lookup:`-form values found; **0 unresolved targets** (every target name resolves case-sensitively to a sibling IO present in this same emission); **0 instances** of the `@parent:ID` qualifier defect (all 59 correctly use `@parent:IntegrationID`).
- **Capability ↔ per-operation column lockstep** — scanned all 62 IOs for `SupportsCreate/Update/Delete=true` without a matching `*APIPath`/`*Method`, and `SupportsIncrementalSync=true` without `IncrementalWatermarkField`, and `*BodyShape="wrapped"` without `*BodyKey`. **0 violations found** across the full IO set (not a sample).
- **PK-naming-convention consistency** — scanned all 62 IOs for an `Id`-named field; **100% (23/23)** of IOs that have an `Id` field mark it `IsPrimaryKey=true`. No partial/inconsistent application.
- Capability-honesty spot checks: `Donation.SupportsDelete=undefined` (correct — source study confirms no DELETE); `Order.SupportsCreate/Update/Delete=undefined, SupportsWrite=false` (correct — R-only + RPC-only status update); `EmailDraft.SupportsDelete=true` with `Create/Update=undefined` (correct — R+D per taxonomy); all 8 other R-only taxonomies (Bundle, MembershipGroup, MembershipLevel, SavedSearch, PaymentAllocation, AuditLogItem, Feature, SentEmailRecipient, AttachmentData) confirmed `SupportsWrite=false`.
- **OAuth capability honesty** — `Integration.CredentialTypeID` = `OAuth2 Client Credentials`; `wildapricot-api.schema.json` fields are `ApiKey` (secret) + `AccountId` + `ApiVersion` — no `Username`/`Password` Basic-auth columns anywhere in the credential shape. The root `Configuration.AuthFlow="oauth2-cc"` note correctly describes the API-key-as-Basic-auth-username pattern as an internal detail of the OAuth2 client-credentials TOKEN exchange (not exposed as a separate Basic-auth credential type) — matches the source study's explicit OAuth2 framing.
- **Pagination honesty** — `Configuration.PaginationDefaults.skipParam="$skip"`, `topParam="$top"` — correctly `$`-prefixed, matching the Nov-2025 pagination mandate documented in SOURCE_STUDY. No bare `skip`/`top` (non-`$`) found anywhere in the file.
- **Async Contacts** — `Contact.IncrementalWatermarkField="ProfileLastUpdated"` set correctly; `$async` polling behavior documented at `Integration.Configuration.IncrementalSyncCapability.contactsStrategy` (root-level, consistent with the same DRY pattern as pagination defaults — not silently dropped).

**BijectionViolationsFound: 0.**

---

## Regression diff vs `priorBakedObjectNames`

All 19 entries independently re-verified present with non-trivial field counts under their doc-justified renames:

| Prior baked | New emission name | Fields | Verified |
|---|---|---|---|
| Contacts | Contact | 14 | present |
| MembershipLevels | MembershipLevel | 9 | present |
| MemberGroups | MembershipGroup | 5 | present |
| Events | Event | 20 | present |
| EventRegistrations | EventRegistration | 22 | present |
| EventRegistrationTypes | EventRegistrationType | 22 | present |
| Invoices | Invoice | 18 | present |
| Payments | Payment | 18 | present |
| Refunds | Refund | 13 | present |
| Donations | Donation | 14 | present |
| Tenders | Tender | 5 | present |
| ContactFields | ContactFieldDescription | 22 | present |
| DonationFields | EntityFieldDescription | 9 | present |
| Bundles | Bundle | 8 | present |
| SentEmails | EmailLog | 23 | present |
| EmailDrafts | EmailDraft | 16 | present |
| AuditLogItems | AuditLogItem | 15 | present |
| SavedSearches | SavedSearch | 4 | present |
| StoreProducts | Product | 18 | present |

No object or column dropped without a doc-justified reason. Every rename tracks the OpenAPI component schema's own PascalCase singular naming convention. Plus 7 net-new first-class objects vs the prior baked set (Account, PaymentAllocation, Order, SentEmailRecipient, AttachmentData, Feature, CeuRecord) — all 7 independently confirmed present with their expected read/write capability profile per SOURCE_STUDY.

**RegressionDiffConfirmed: true.**

---

## FixInstructions

Only one new item this round — a mechanical evidence-granularity backfill, not a metadata-value fix (the metadata values are already correct):

```json
{"slot": "provenance.Donation.Contact.RelatedIntegrationObjectID", "operation": "set", "before": "(no PROVENANCE.json entry)", "after": "individual PROVENANCE.json entry with TargetField='iof.Donation.Contact.RelatedIntegrationObjectID', SourceCategory='OpenAPISpec', EvidenceStrength='ExplicitStatement', Excerpt derived from amend-round2.ts FIXES[0].evidence", "evidence": "packages/Integration/connectors-registry/wildapricot/scripts/amend-round2.ts FIXES array (already contains the per-fix evidence string)", "rationale": "Round-2 amendment applied 18 distinct FK fixes via a single aggregate CODE_EVIDENCE entry; connector-provenance-conventions.md requires per-field citation except when columns share one excerpt, which these 18 do not (each has a distinct schema/property source)."}
```

```json
{"slot": "provenance.<remaining 17 amend-round2.ts FIXES entries>.RelatedIntegrationObjectID", "operation": "set", "before": "(no PROVENANCE.json entry)", "after": "one individual PROVENANCE.json entry per FIXES[] array element, reusing that element's own `evidence` string as the Excerpt/UsedFor basis", "evidence": "packages/Integration/connectors-registry/wildapricot/scripts/amend-round2.ts FIXES array (lines 50-67)", "rationale": "Same as above — mechanical backfill from data the producer already has in the committed script; no new source research required. Can be applied by a small script that reads FIXES[] and emits one PROVENANCE.json entry per element."}
```

This is Advisory, not Blocking, so it does not gate re-dispatch — recorded so it can be picked up in the next convenient amendment pass or the same S7 Reality Probe stage's write-back.

---

## Stats Block

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 3,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/wildapricot/INDEPENDENT_REVIEW.md",
  "RegressionDiffConfirmed": true,
  "FixInstructions": [
    {"slot": "provenance.Donation.Contact.RelatedIntegrationObjectID", "operation": "set", "before": "(no PROVENANCE.json entry)", "after": "individual PROVENANCE.json entry citing amend-round2.ts FIXES[0].evidence", "evidence": "packages/Integration/connectors-registry/wildapricot/scripts/amend-round2.ts", "rationale": "Per-field provenance granularity backfill (Advisory, non-blocking)"},
    {"slot": "provenance.<remaining 17 amend-round2.ts FIXES entries>.RelatedIntegrationObjectID", "operation": "set", "before": "(no PROVENANCE.json entry)", "after": "one PROVENANCE.json entry per FIXES[] element reusing its evidence string", "evidence": "packages/Integration/connectors-registry/wildapricot/scripts/amend-round2.ts", "rationale": "Same mechanical backfill, remaining 17 of 18 (Advisory, non-blocking)"}
  ]
}
```
