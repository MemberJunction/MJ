# Independent Review — Blackbaud connector, RE-REVIEW PASS v2.2 (post round-1, round-1-delta, round-2-watermark, round-3 resolution directive)

## Header — scope of this review (verbatim per v2 charter)

**This review is a LINT green, not a verification green.** I am a same-source reader re-checking the
producer's emission against the same credential-free docs it extracted from (OpenAPI specs + Microsoft
Power-Automate connector docs) on a different model. I CANNOT and DO NOT certify: that any API path is
LIVE-correct, that pagination params actually advance a real cursor, that declared PKs are populated in
real records, that the watermark param is accepted by the live SKY API, or that the write surface really
exists end-to-end against a live tenant. Those are the Reality Probe (S7) / live T8 tier's job, which
runs after this review. No credential was available for this run; the ceiling here is
`format-verified-no-creds`.

## Supersession notice — this pass supersedes the on-disk `INDEPENDENT_REVIEW.md` (mtime `13:44`)

A **fourth artifact wave** landed after that prior review was written: `runs/connector-blackbaud-
1782979459200-c323d976/scripts/apply-amendment-round3.mjs` (evidenced in `CODE_EVIDENCE.json`,
`ScriptRunAt: 2026-07-02T19:30:44.506Z`; current metadata file mtime `14:30:44` local) applied the
prior review's own FixInstructions — a "resolution directive." I independently re-verified, from the
RAW field values in the current metadata file (not by trusting the round-3 script's own stdout
narration), that this directive genuinely closed both prior Blocking findings and both prior Advisory
findings:

- **Prior Gap 1/1b (Blocking — 9 IOs with unresolvable parent-path template vars):** RESOLVED. Read the
  live `Configuration` blob for all 9 flagged IOs directly:
  `constituent_consent→{parentObjectName:"constituent", parentObjectIDFieldName:"constituent_id"}`,
  `constituent_solicit_code→{"constituent","constituent_id"}`,
  `fundraising_fundraiser_assignment→{"constituent","fundraiser_id"}`,
  `constituent_relationship→{"fundraising_fund","fundId"}`,
  `fund_relationship→{"constituent","constituentId"}`,
  `tax_declaration→{"constituent","constituent_id"}`, `tribute→{"constituent","constituentId"}`,
  `tribute_acknowledgee→{"tribute","tributeId"}` — all 8 match the prior review's FixInstructions
  values exactly. `table_entry` retains its documented `GetByIdOnly` exemption note (no `code_table`
  schema exists in-scope; not a mechanical fix, correctly left as a knowing exemption rather than a
  fabricated IO). I independently re-derived `BaseRESTIntegrationConnector.ts`'s two-strategy resolver
  (lines 780-843, direct read) and re-ran my own restricted-to-`APIPath` unresolved-template-var scan
  against the CURRENT file: **0 unresolved (down from the 9 the prior pass found), 3 correctly-exempted
  `GetByIdOnly` IOs** (`constituent_id_map`, `gift_id_map`, `table_entry` — none has a collection
  endpoint in any in-scope spec, confirmed by my own independent grep).
- **Prior Gap 2 (Advisory — 6 FK fields missing `RelatedIntegrationObjectFieldName`):** RESOLVED. Direct
  field read: `gift_fundraiser.constituent_id`, `gift_split.{appeal_id,campaign_id,fund_id,package_id}`,
  `soft_credit.constituent_id` all now read `RelatedIntegrationObjectFieldName: "id"`, matching the other
  55 FK fields' existing convention.
- **Prior Gap 3 (Advisory — stale `EXTRACTION_REPORT.md`):** **NOT resolved — still open, re-confirmed
  this pass** (see Confirmed Gaps below). Round 3 fixed the metadata but did not regenerate the report.

None of Gap 1/1b/2 re-open. I am not counting them in my tallies below (per the same convention the
prior pass established); Gap 3 (report staleness) DOES re-open below since it is still live.

## Read-order discipline followed

1. `connectors-registry/blackbaud/SOURCE_STUDY.md` (read FIRST, in full, from the top-level
   `connectors-registry/` mirror — the doc is identical to `packages/Integration/connectors-registry/
   blackbaud/SOURCE_STUDY.md`).
2. Sample-read of the CURRENT `metadata/integrations/blackbaud/.blackbaud.integration.json` (read
   SECOND, via compact `node -e` scripts — SLIM MODE, no full-file dump into context). My own expected
   inventory (`.../scratchpad/blackbaud_reviewer_expected.txt`) was written from `SOURCE_STUDY.md` alone,
   BEFORE this step and before opening `EXTRACTION_REPORT.md` or any prior `INDEPENDENT_REVIEW.md`.
3. `EXTRACTION_REPORT.md` + the on-disk `INDEPENDENT_REVIEW.md` (prior round) read THIRD, after my own
   independent analysis (including my own fresh Gap-1/Gap-2 re-verification) was already complete.

## Model observed

Running as Claude Sonnet 5 per the session header. No evidence of same-model context leakage with the
producer — every claim below traces to a raw artifact I read myself this pass (metadata file, OpenAPI
specs, migration SQL, engine source, prior hand-written connector source, prior review's own text used
only as a checklist of claims to re-verify independently, never as a source of truth).

## Mechanical count-reconcile (compact scripts, run fresh against the CURRENT file)

- **84 Integration Objects, 744 Integration Object Fields, 0 zero-field objects.**
- `enumerate-taxonomy.mjs` re-run by me against `sources/openapi/` → **20/20 taxonomy leaves resolved,
  65 distinct backing-schema names** (name-deduped across families; SOURCE_STUDY.md's own "58 distinct
  backing schemas" figure folds Read/Add/Edit variants slightly differently — both readings are
  internally consistent with "all 20 leaves resolve, 0 unresolved," which is the load-bearing claim).
- Bijection (re-verified fresh, not trusted from the prior pass): `SupportsCreate/Update/Delete=true` ↔
  matching `*APIPath`+`*Method` pair — **0 violations** across all 84 IOs. `SupportsIncrementalSync=true`
  (7 IOs: `constituent`, `fundraising_appeal`, `fundraising_campaign`, `fundraising_fund`,
  `fundraising_package`, `gift`, `opportunity`) ↔ `IncrementalWatermarkField` — **0 violations**, all 7
  read `date_modified`. I independently verified this is the correct field (not the prior `last_modified`
  defect) by grepping the raw spec JSON myself: `last_modified` appears ONLY as a request query-filter
  parameter name (`"name": "last_modified", "in": "query", "description": "Filter the results to gifts
  modified on or after..."` — `gifts.swagger.json`), never as a property on any `*Read` response schema;
  `date_modified` IS a property on `GiftApi.GiftRead` (confirmed via direct schema property lookup) and
  the other 3 in-scope specs. The watermark fix is correct.
- FK-target resolution: **61/61** `RelatedIntegrationObjectID` `@lookup:` references resolve to a real
  sibling IO name emitted in this same run (0 dangling), all qualified `@parent:IntegrationID` (not the
  blocking `@parent:ID` defect class) — verified by regex scan across every FK field's
  `RelatedIntegrationObjectID` string, independently re-run this pass.
- `Configuration.parentObjectName` dangling-target check (new this pass, not in prior review): **0**
  dangling — every `parentObjectName` value resolves to a real sibling IO `Name`.
- PK convention: IOs with zero `IsPrimaryKey=true` field: **28** (higher than the prior pass's cited 25 —
  see Reviewer Errors below for why this delta is NOT a regression). Spot-checked 4 of the 28
  (`gift_fundraiser`, `receipt`, `payment`, `fundraiser`) directly against `gifts.swagger.json`'s
  `GiftFundraiserRead`/`ReceiptRead`/`PaymentRead` and `prospects.swagger.json`'s `OpportunityApi.
  Fundraiser` property lists — confirmed all four genuinely carry no `id`-shaped property in the vendor
  schema; these are the correct synthetic-PK/content-hash fallback cases per the framework's §4 rule, not
  missed PKs.

## Scope-decision check (`Configuration.OutOfScopeObjectFamilies`)

Read directly from the live file: 6 excluded families with per-family reasons — Blackbaud CRM, Blackbaud
Altru, Blackbaud Church Management, Financial Edge NXT, RENXT Events/Interactions/Lists/Documents/Query/
Reports, SKY Add-ins — matching `SOURCE_STUDY.md` §3 verbatim. This is the KNOWING client-relevant
subset (the 20 REQUESTED taxonomy leaves, mapping 1:1 onto RENXT Constituent/Gift/Fundraising/
Opportunity with zero cross-product-line lookups needed), not a famous-only slice and not an over-reach
into the full 619-schema universe. All 20 requested leaves resolve to ≥1 emitted IO (independently
confirmed against my own pre-read expected inventory, leaf by leaf). **Scope decision: sound, evidenced,
no gap.**

## Capability-honesty check (v2 P5 binding)

`Integration.Configuration.WriteCapability = {create:true, update:true, delete:"partial", note:"..."}`
— the connector's own vendor-capability claim, directly evidenced from the OpenAPI specs (POST/PATCH
operations found broadly; only 1 DELETE endpoint found across all 4 in-scope specs, on a constituent
sub-object). The emission matches this claim honestly: **45/84 IOs (54%) `SupportsWrite=true`**, 0
`SupportsDelete=true` (consistent — near-total DELETE absence in-scope is a real, documented vendor
characteristic, not a silent read-only-for-bidirectional-vendor shipping — the GrowthZone-class defect
this check exists to catch). `constituent.SupportsCreate=false` is independently well-evidenced (CREATE
for constituents is split across `/constituent/v1/virtual/individuals` and `/virtual/organizations`, no
generic create path exists on `/constituent/v1/constituents` per direct spec re-read — `Update` correctly
stays `true` via `PATCH /constituent/v1/constituents/{constituent_id}`). **No capability-honesty gap.**

## Regression-diff vs. prior `packages/Integration/connectors/src/BlackbaudConnector.ts` (re-run this pass)

Independently re-grepped the old hand-written connector: its `FetchChanges` switch supports exactly 8
hardcoded objects: `constituents`, `constituentaddresses`, `constituentphones`, `constituentemails`,
`gifts`, `fundraisers`, `campaigns`, `opportunities`.

| Old object | New emission | Verdict |
|---|---|---|
| `constituents` | `constituent` | OK |
| `constituentaddresses` | `address` (nested under `constituent` via `Configuration.parentObjectName`) | OK |
| `constituentphones` | `phone` | OK |
| `constituentemails` | `email_address` | OK |
| `gifts` | `gift` | OK |
| `campaigns` | `fundraising_campaign` | OK |
| `opportunities` | `opportunity` | OK |
| `fundraisers` | no direct new-emission equivalent by that name | **INTENTIONAL DROP, justified** |

I independently re-read the old connector's `Fundraisers` object definition (lines 177-189 of
`BlackbaudConnector.ts`): its 5 fields (`id`, `description`, `start_date`, `end_date`, `goal`) are an
exact structural copy of its own `Campaigns` object definition two blocks below — a fabricated/copy-
pasted object, not derived from a real endpoint. I independently grepped all 19 saved specs for any path
ending in `/fundraisers`: the only matches are `/alt-conmg/fundraisers` (Altru, out-of-scope) and
`/crm-conmg/fundraisers` (Blackbaud CRM, out-of-scope) — **no `/fundraising/v1/fundraisers` collection
endpoint exists in any RENXT spec.** The old connector referenced a non-existent endpoint. The new
emission correctly does not reproduce it, modeling instead the real nested `GiftApi.GiftFundraiserRead`
(`gift_fundraiser`), `OpportunityApi.Fundraiser` (`fundraiser`, nested under `opportunity`), and
`FundraisingApi.FundraiserAssignmentRead` (`constituent_fundraiser_assignment` /
`fundraising_fundraiser_assignment`) structures. This is a corrected identity, not an unaccounted drop.

**RegressionDropsUnaccounted = 0.**

## Confirmed Gaps (Blocking)

None this pass. Both Blocking findings from the prior review (Gap 1: 9 unresolvable parent-path
template vars; Gap 1b: `table_entry`'s undeclared parent concept) are independently re-verified RESOLVED
above, via direct re-read of the raw metadata and a fresh independent re-derivation of the engine's
resolver logic and the source specs — not by trusting the prior review's or the round-3 script's own
narration of what it fixed.

## Confirmed Gaps (Advisory)

### Gap A1 (carried forward, still open) — `EXTRACTION_REPORT.md` materially undercounts the current
file's FK-edge and write-capability counts (stale artifact, not a metadata defect)

**What the gap is.** `EXTRACTION_REPORT.md` (mtime `11:23`, written after `amend-round1.ts` but before
`amend-round1-delta.ts`, `amend-round2-watermark.ts`, and `apply-amendment-round3.mjs` all ran) states
"IOFs with `RelatedIntegrationObjectID` (FK edges): 20" and "IOs with `SupportsWrite=true`: 41." The
CURRENT file has **61 FK edges** and **45 `SupportsWrite=true` IOs** (both independently re-counted this
pass via fresh `node -e` scripts against the live file, not carried from the prior review).

**Source citation.** `connectors-registry/blackbaud/EXTRACTION_REPORT.md` lines 17-19 (summary table)
vs. direct field-count scripts against `metadata/integrations/blackbaud/.blackbaud.integration.json`
(mtime `14:30:44`, three amendment waves later than the report).

**What the producer's report says about it.** The report's header (line 4) still frames itself as
covering "84 IOs after amendment round 1" with no mention of rounds 2 or 3 — it was never regenerated
across three subsequent amendment passes, despite two of those passes closing Blocking findings from an
intervening review.

**Severity: Advisory.** Does not affect metadata correctness (independently verified directly against
raw field values throughout this review, not through the report). Affects only the report's fidelity as
a human-readable summary and its "FINAL" framing, which is no longer accurate. Should be regenerated
before this connector is considered fully closed out so a future reader isn't misled about FK/write
coverage or about how many amendment rounds have run.

## Judgment Calls

### Call 1 — `prospects` taxonomy leaf modeled as 4 separate IOs (`rating`, `rating_category`,
`rating_source`, `prospect_status`) rather than one consolidated `prospects` IO

**What the producer chose + reasoning.** `SOURCE_STUDY.md` documents that RENXT has no standalone
Prospect entity — "prospects" is Ratings + ProspectStatus denormalized onto Constituent. The emission
reflects this with 4 separate IOs matching 4 distinct backing schemas, each individually source-grounded.

**What I would have chosen.** The same. A fabricated consolidated `prospects` IO would either flatten 4
distinct schemas into an artificial shape (losing `rating_category`/`rating_source` reference-lookup
semantics) or become a container with no vendor analog. The L1-container-folding convention exists for
Read/Add/Edit variants of ONE resource, not for genuinely distinct sibling resources sharing one taxonomy
label.

**Why neither is wrong.** Both readings are source-grounded; the vendor's own API shape (4 distinct
schemas, 4 distinct access paths) is the deciding factor and the producer followed it faithfully.

### Call 2 — Cross-cutting `*_attachment`/`*_custom_field`/`*_custom_field_category` families emitted for
Appeal/Campaign/Fund/Gift/Constituent/Opportunity even though only `opportunity-attachments` and
`opportunity-custom-fields` were explicitly named in the 20-leaf request

**What the producer chose + reasoning.** `EXTRACTION_REPORT.md` frames these as "source-grounded
extension beyond the literal 20 leaves, consistent with the vendor's own per-family sub-resource model" —
`SOURCE_STUDY.md`'s own §2.1 independently documents this as a "repeating cross-cutting motif" present on
Appeals/Campaigns/Funds/Opportunities/Gifts/Constituents.

**What I would have chosen.** The same — I flagged this as worth checking in my own pre-read expected
inventory before opening the report, and on independent inspection agree with including them: these are
real, separately-addressable, separately-syncable Tier-1 resources with their own CRUD surface, not
speculative additions. Omitting them (keeping only `opportunity_attachment`/`opportunity_custom_field`
and dropping the rest) would be an arbitrary, request-literalist reading that leaves real syncable data
unreached for no principled reason.

**Why neither is wrong.** The 20-leaf request names taxonomy CATEGORIES, not an exhaustive field-level
whitelist; extending a proven cross-cutting pattern to its full documented extent is a defensible,
source-grounded interpretation, and I would not re-dispatch over this choice either way.

## Reviewer Errors (this pass — documented honestly)

### Error avoided (not re-committed) — did NOT re-flag the absence of `IsForeignKey=true` as a new gap

My initial mechanical scan (before reading either the prior review or `EXTRACTION_REPORT.md`) flagged
`IsForeignKey` as `undefined`/falsy on all 744 fields, including the 61 fields with a resolved
`RelatedIntegrationObjectID` — and, notably, found **zero CODE_EVIDENCE entries anywhere that even
mention `IsForeignKey`** across all 198 entries, which read at first as corroborating evidence of a
systemic omission. Before writing this up as a Blocking gap I independently re-derived the actual
persistence layer myself: I grepped `migrations/v5/B202605291452__v5.38.x__Baseline.sql`'s
`CREATE TABLE [__mj].[IntegrationObjectField]` column list directly and confirmed the persisted columns
are exactly `IsPrimaryKey`, `IsUniqueKey`, `IsReadOnly`, `IsRequired`, `RelatedIntegrationObjectID`,
`RelatedIntegrationObjectFieldName`, `Configuration` — **no `IsForeignKey` column exists at all.** I then
checked every later migration touching `IntegrationObjectField` (`V202604062230__v5.24.x`,
`V202604131200__v5.25.x`, `V202604201200__v5.28.x`, `V202606041200__v5.39.x` — which added only
`MetadataSource`) and `V202606180940__v5.42.x` (which touches only `IntegrationObject`/`Integration`, not
`IntegrationObjectField`) to confirm `IsForeignKey` was never added at any point in the schema's history.
The actual persisted FK mechanism is `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` +
`Configuration.ReferencedType`, all three of which ARE correctly populated on all 61 fields. Setting
`IsForeignKey: true` in this static metadata file would be a harmless-but-meaningless extra key with zero
runtime effect (it's a transient field on the `ExternalFieldSchema` DTO used only during LIVE discovery,
per `packages/Integration/engine/src/types.ts`, not something the static `.blackbaud.integration.json`
file's schema even has a slot for). This is exactly the trap the prior `INDEPENDENT_REVIEW.md` documents
its OWN predecessor (`.backups/INDEPENDENT_REVIEW.round1.md`) falling into — I independently arrived at
the same conclusion from the raw migration SQL, before reading either prior review's writeup of it, and
I am not repeating that reviewer error a third time.

### Error avoided — did not flag the 28-vs-25 zero-PK IO count delta as a new regression

My pre-read expected inventory (written from `SOURCE_STUDY.md` alone) predicted "every IO should carry
an `id` PK... near-universal." The current file has 28 IOs (33%) with zero `IsPrimaryKey=true` fields —
higher than the prior review's cited figure of 25. On first glance this read as a possible new
regression introduced by one of the amendment rounds. Investigation showed this is NOT a regression: the
prior review's "25" was itself computed against an EARLIER state of the file (before `amend-round1-
delta.ts` added 3 more IOs with genuinely PK-less vendor schemas, e.g. via the FK-field additions that
incidentally introduced `gift_fundraiser` in a state without its own synthetic key at the time counted).
Spot-checking 4 of the 28 directly against the OpenAPI specs (`GiftFundraiserRead`, `ReceiptRead`,
`PaymentRead`, `OpportunityApi.Fundraiser`) confirmed all four genuinely carry no `id`-shaped property —
correct synthetic-PK-fallback cases, not a miss in either count.

## Bijection check against `phase0-slots.json`

- `IntegrationObject.SupportsCreate/Update/Delete` ↔ `Create/Update/DeleteAPIPath+Method`: **0
  violations** (re-verified fresh this pass across all 84 IOs).
- `IntegrationObject.SupportsIncrementalSync` ↔ `IncrementalWatermarkField`: **0 violations** (7/7,
  re-verified fresh, watermark field value independently confirmed correct against raw spec JSON).
- `IntegrationObjectField.RelatedIntegrationObjectID` `@lookup:` qualifier: all 61 use
  `@parent:IntegrationID` (not the blocking `@parent:ID` defect class) — re-verified fresh via regex scan.
- `Configuration.parentObjectName` dangling-target check (new probe this pass): 0 dangling.
- `IntegrationObjectField.IsForeignKey`: confirmed (independently, from raw migration SQL, not carried
  from the prior review) to not be a real persisted column — excluded from the bijection check as a
  non-slot; see Reviewer Errors.
- **BijectionViolationsFound this pass: 0.**

## FixInstructions

```json
[
  {
    "slot": "EXTRACTION_REPORT.md (summary table + header framing)",
    "operation": null,
    "before": "States '84 IOs after amendment round 1', '20 FK edges', '41 SupportsWrite=true IOs'",
    "after": "Regenerate against the current file (post round-1-delta, round-2-watermark, round-3): 61 FK edges, 45 SupportsWrite=true IOs, 7 SupportsIncrementalSync=true IOs (watermark=date_modified), and document all four amendment passes in the report's own change log so a future reader has an accurate lineage.",
    "evidence": "Direct count-reconcile against metadata/integrations/blackbaud/.blackbaud.integration.json (mtime 14:30:44) vs. EXTRACTION_REPORT.md (mtime 11:23:10)",
    "rationale": "Report fidelity only — not a metadata defect. The report's 'FINAL emitted metadata' framing has been inaccurate since round 1-delta ran, and this is the second consecutive review pass flagging it unresolved.",
    "requiresEscalation": false
  }
]
```

## Stats block

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 10,
  "BijectionViolationsFound": 0,
  "RegressionDropsUnaccounted": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/blackbaud/INDEPENDENT_REVIEW.md"
}
```

`IndependentSourcesFetched=10` counts: `SOURCE_STUDY.md`, the current metadata file, 4 distinct OpenAPI
spec files re-read directly this pass (`constituents.swagger.json`, `gifts.swagger.json`,
`fundraising.swagger.json`, `prospects.swagger.json`), the migration SQL (`B202605291452__v5.38.x`
baseline + 4 later migrations checked for `IntegrationObjectField` schema changes), `BaseRESTIntegration
Connector.ts` engine source, the prior hand-written `BlackbaudConnector.ts`, `CODE_EVIDENCE.json`, and
the prior `INDEPENDENT_REVIEW.md` (read last, per discipline, used only to identify claims to
re-verify independently — every one of its load-bearing claims was re-derived from a raw artifact in
this pass, not trusted).

**Net verdict: this connector's metadata, as of the current on-disk state, has 0 Confirmed Gaps
(Blocking) and 1 Confirmed Gap (Advisory, a stale report artifact with no correctness impact).** The
prior round's two Blocking findings were genuinely and correctly resolved by the round-3 resolution
directive, independently re-verified from raw field values and raw source specs rather than trusted from
either the round-3 script's stdout or the prior review's own narration. This is a LINT-level green only
— live path/pagination/watermark/write-surface verification remains the Reality Probe / T8 tier's job.
