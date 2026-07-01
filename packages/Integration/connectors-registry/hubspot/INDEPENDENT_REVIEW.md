# INDEPENDENT REVIEW — HubSpot Connector Extraction (Amendment Round 0, this cycle)

**Reviewer model**: claude-sonnet-5 (Sonnet 5) — different model surface from the producer/coordinator per the v2 charter.
**Review type**: Phase 2c content review of the REDO emission (`metadata/integrations/hubspot/.hubspot.integration.json`), same-source read + count-reconcile + regression-diff + bijection + DeployPreflight cross-check.
**Mode**: SLIM — full OpenAPI specs were NOT bulk-loaded into context; verification used a node count-reconcile script against the emission, targeted greps against a small number of cached spec files, and reads of SOURCE_STUDY.md / DEPRECATION_RECORD.md / CODE_EVIDENCE.json.
**Date**: 2026-07-01

---

## CERTIFICATION BOUNDARY (READ FIRST, VERBATIM PER CHARTER)

This review is a **LINT GREEN**, not a runtime verification. I CANNOT certify that HubSpot API paths are
LIVE-correct, that pagination params actually advance, that declared PKs are populated in real records, that
the watermark param is accepted, or that the write surface really exists. Those are the Reality Probe stage's
(S7) job, which runs after this review. My green (where given) is a same-source-documentation-consistency
green, never a verification that the connector works against the real HubSpot API.

---

## Context — this is a continuation review, not a first look

A prior `INDEPENDENT_REVIEW.md` ("Amendment Round 2", dated 2026-07-01 10:44) already exists in this
directory and found 3 Blocking + 1 Advisory confirmed gaps against an earlier state of the emission. The
metadata file (`mtime` 11:28) and `EXTRACTION_EMISSION.json` (`mtime` 11:23) postdate that review, meaning the
producer amended after it. My job this round is to (a) independently re-verify whether those specific fixes
landed, and (b) run the full adversarial probe fresh rather than rubber-stamping the prior review's green
items. I did not read the prior review until after building my own expected inventory and running my own
count-reconcile script, per the strict read-order discipline.

## Expected inventory (written BEFORE opening the prior review or any report)

Written to `/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/6c070485-1f10-4cdc-bb9f-f615f9add9fe/scratchpad/hubspot_reviewer_expected.txt` after reading `SOURCE_STUDY.md` only. Key predictions: 161 COVERABLE IOs (33 CRM std + 63 association pairs + 6 pipelines/stages + 3 lists + 2 owners/teams + 1 custom-object-schema + 2 hubdb + 12 marketing + 5 automation + 2 custom events + 2 files + 1 timeline + 7 conversations + 2 forecasts + 1 calling + 2 comm-prefs + 8 CMS content + 6 account/settings + 2 SCIM + 1 data-ingestion); all 27 REDO_REQUIRED_OBJECTS either emitted or gapped-with-reason (25 covered / 2 vendor-confirmed-absent); `timeline_event_types` explicitly ABSENT from static Declared metadata (Gap 6 says runtime-discovery-only); substantial write-capability given HubSpot's well-documented CRUD API.

---

## Count-reconcile script output (compact)

Ran a node script over the emission's top-level array structure:

```
Top-level integration records: 1
IO count (relatedEntities): 165  (expected 161; delta +4)
Total IOF count: 1288
Duplicate IO names: 0
IOs with ZERO fields: 0
IOs with SupportsWrite=true: 113 (SupportsCreate:111 / SupportsUpdate:45 / SupportsDelete:107)
IOs SupportsWrite=true but ALL of Create/Update/Delete missing: 0
IOs SupportsIncrementalSync=true but no IncrementalWatermarkField: 0
IOFs with IsForeignKey key present (non-deployed column): 120 -- all 120 carry mitigating RelatedIntegrationObjectID
IOs with IsMutable key present (non-deployed column): 25
IOs with ParentObjectName key present (non-deployed column): 4
IOs with ParentObjectIDFieldName key present (non-deployed column): 4
IOs with ZERO IsPrimaryKey=true fields: 1 (timeline_event_types)
FK targets unresolved (name doesn't match a sibling IO in this emission): 0
FK lookups using the wrong @parent:ID qualifier (should be @parent:IntegrationID): 0
```

**Association-pair count matches exactly** (63 emitted, 63 expected). **Non-association count is 102 vs
98 expected** (SOURCE_STUDY's own 20-taxonomy accounting) — the +4 delta traces to `timeline_event_types`,
`partner_clients`, `partner_services`, `goals`, none of which appear anywhere in SOURCE_STUDY's taxonomy
list. `partner_clients`/`partner_services`/`goals` are evidenced (CODE_EVIDENCE entries citing real
downloaded specs / the DEPRECATION_RECORD's own §B) — legitimate additions beyond the source-study's
taxonomy, consistent with the "more reachable objects, bias toward completeness" rule. `timeline_event_types`
is the one that is NOT evidenced as a legitimate addition — see CG-1 below.

All 27 REDO_REQUIRED_OBJECTS accounted for: 25 present, 2 (`ad_accounts`/`ad_campaigns`) correctly absent
with a documented vendor-confirmed-absent Gap.

---

## 1. Confirmed Gaps

### CG-1 (Blocking, CARRIED FORWARD, NOT FIXED): `timeline_event_types` is still mapped to the wrong OpenAPI schema and endpoint

**What the gap is**: The prior round's review (this file's own predecessor, "Amendment Round 2", CG-3) found
that the emitted `timeline_event_types` IO is mapped to `TimelineEventIFrame` — a **nested display sub-object**
referenced from `AppEventOccurrence.timelineIFrame` — via the endpoint
`/integrators/timeline/2026-03/types/projects`, which is actually an event-symbol-resolution endpoint
(`ExternalAppEventResolutionRequest`/`AppEventResolutionResponse`), not a type-definition list/CRUD endpoint.
I independently re-read `sources/specs/crm__timeline.json` this round and confirmed the spec still has the
same 3 paths (`/events`, `/events/batch`, `/types/projects`) with no schema for a top-level "timeline event
type definition" resource.

I then re-read the CURRENT emission state directly (not from the prior review's prose) and confirmed **this
was never fixed**: `timeline_event_types.APIPath` is still `/integrators/timeline/2026-03/types/projects`,
`Status` is still `Active`, `Configuration.primaryRecordSchema` is still `TimelineEventIFrame`, and the field
set is still exactly `headerLabel`, `height`, `linkLabel`, `url`, `width` — byte-identical to what the prior
review flagged. No `skipReason`, no rename, no reclassification to runtime-discovery-only. I also confirmed
the CODE_EVIDENCE entries for `io.timeline_event_types` are timestamped `2026-06-30T20:19:59Z` /
`2026-06-30T20:20:28Z` / `2026-06-30T20:22:57Z` — all from the ORIGINAL pre-REDO pass, before the REDO
SOURCE_STUDY was even written (2026-07-01). None were re-run during the amendment that produced this round's
metadata file.

This is doubly significant because SOURCE_STUDY.md's own REDO-pass Taxonomy #12 correction (lines 250-253)
**explicitly disavows this exact mapping**: *"The prior pass's `timeline_event_types` entry was derived from
misreading `TimelineEventIFrame` (a sub-object of an event occurrence) as if it were the type-definition
resource... Conclusion: `timeline_event_types` is classified runtime-discovery-only."* The SOURCE_STUDY the
producer itself wrote during this REDO says this object should not be statically Declared at all — yet the
metadata file still emits it as a confident, `Active`, Tier-1-evidenced static IO. The count-reconcile script's
"zero-PK IO" finding (`timeline_event_types` is the ONLY IO in the entire 165-IO emission with zero
`IsPrimaryKey=true` fields) is the direct symptom: the IO doesn't correspond to a real top-level resource, so
it has no PK to declare.

**Source citation**: `packages/Integration/connectors-registry/hubspot/sources/specs/crm__timeline.json`
(`components.schemas.TimelineEventIFrame`, `AppEventOccurrence`, `ExternalAppEventResolutionRequest`,
`AppEventResolutionResponse`; `paths./integrators/timeline/2026-03/types/projects`) — re-read independently
this round, not taken on the prior review's word. `SOURCE_STUDY.md` lines 250-253 (Taxonomy #12 REDO
correction, written by the producer itself). `metadata/integrations/hubspot/.hubspot.integration.json` (the
current `timeline_event_types` IO record, read directly). `CODE_EVIDENCE.json` lines ~1931-1943 / ~3942-3954 /
~5953-5965 (all three entries pre-REDO timestamped).

**What the producer's artifacts say**: The emission presents `timeline_event_types` with the same
`Status: Active` / Tier-1-CODE_EVIDENCE confidence as every correctly-sourced IO, contradicting the producer's
own SOURCE_STUDY conclusion on the same object written in the same pass.

**Severity**: **Blocking.** Structural/mapping defect — the IO as emitted does not correspond to a syncable
HubSpot resource at all, and the producer's own current-pass source study says so.

### CG-2 (Blocking, NEW — not raised by the prior review): `business_units.APIPath` does not match the only documented endpoint

**What the gap is**: SOURCE_STUDY.md's own Taxonomy #18 entry for `business_units` (line 310) states: *"a
user-scoped lookup is the only documented read path; no unscoped list endpoint is in this spec"* — citing
`/business-units/public/2026-03/business-units/user/{userId}`. I independently opened the cached spec file
`sources/specs/business_units__business_units.json` and confirmed it contains **exactly one path**:
`/business-units/public/2026-03/business-units/user/{userId}`.

The emitted IO's `APIPath` is `/business-units/public/2026-03/business-units` — the `/user/{userId}` segment
is missing entirely. This is not a documented alternate endpoint; it is a truncated path that does not exist
in the cited source and would 404 against the real HubSpot API. This is exactly the class of defect the
`connector-code-conventions.md` "READ from the source's model, never GUESS" rule exists to prevent — the
correct parametric path was correctly documented in prose by the same producer's SOURCE_STUDY, but the
emission's `APIPath` field silently drops the required path segment.

**Source citation**: `packages/Integration/connectors-registry/hubspot/sources/specs/business_units__business_units.json`
(`paths` key — the single path present, re-read directly, not from prose). `SOURCE_STUDY.md` line 310 (the
producer's own prose documentation of the correct path). `metadata/integrations/hubspot/.hubspot.integration.json`
(`business_units` IO's `APIPath` field, read directly).

**What the producer's artifacts say**: Nothing flags this — `business_units` carries the same
Tier-1-confidence CODE_EVIDENCE presentation as every other IO, with no note that the path is templated/
user-scoped or that it differs from SOURCE_STUDY's own documented path.

**Severity**: **Blocking.** A connector calling this path against the live API cannot succeed — this is a
directly falsifiable, mechanically-checkable defect (compare emitted `APIPath` string against the one path
in the cited spec file), not a judgment call.

### CG-3 (Blocking, CARRIED FORWARD, NOT ADDRESSED): 8 objects flagged as "ambiguous, needs explicit disposition" by the prior review remain completely unaddressed — no emission, no skipReason, no SOURCE_STUDY mention

**What the gap is**: The prior review's CG-1 explicitly named 8 objects from the prior connector baseline
(`DEPRECATION_RECORD.md` §C) needing "an explicit disposition note... nothing in the metadata documents that
decision": `email_campaigns_legacy`, `url_mappings`, `site_search`, `source_code`, `visitor_identification`,
plus (from my own independent re-derivation of the DEPRECATION_RECORD diff this round) `timeline_event_templates`,
`behavioral_events`, and `subscription_definitions`.

I independently re-derived the full regression-diff this round (not trusting the prior review's list) by
mapping every one of DEPRECATION_RECORD's 130 prior-baseline objects against the current 165-IO emission,
resolving every plausible rename (`deal_pipelines`→`pipelines_deals`, `event_definitions`→`custom_event_definitions`,
`transcriptions`→`call_transcriptions`, etc.) and every legitimate scope reclassification (imports/exports/
account_info/audit_logs → SOURCE_STUDY's own INFORMATIONAL taxonomy). All 8 objects above remain **genuinely
absent** — confirmed via direct string search: none of the 8 names appear anywhere in the metadata JSON
(as an IO name, in a `Configuration` note, or as a `skipReason`), and none appear anywhere in the 444-line
SOURCE_STUDY.md REDO document either. The REDO pass's own rationale (SOURCE_STUDY line 11) claims "0 silently
dropped" for the 27 REDO_REQUIRED_OBJECTS specifically, but these 8 were never part of that 27-item list — they
are a DIFFERENT set (prior-connector-only objects the source study never re-examined), and the REDO pass's
"0 silently dropped" claim does not cover them.

Some of these are plausibly legitimately out-of-scope (`site_search`, `source_code` look like action-endpoints
rather than syncable record sets — the CMS site-search-query and get-published-source-code operations).
Others are not obviously so: `email_campaigns_legacy` (the pre-v3 Email Campaigns API — HubSpot still returns
data from it for some older campaigns not migrated to the new `campaigns` object), `visitor_identification`
(Conversations visitor identification tokens — a real, distinct capability from anything in the emitted
Conversations taxonomy), and `subscription_definitions` (which may or may not be the same resource as the
emitted `subscription_types` — the DEPRECATION_RECORD lists it as a distinct path
`/communication-preferences/v4/definitions`, but the emission's `subscription_types` IO's `APIPath` was not
independently checked this round against that exact path — flagged for the producer to verify on remediation).

**Source citation**: `packages/Integration/connectors-registry/hubspot/runs/connector-hubspot-1782844385831-2bfb45ce/output/DEPRECATION_RECORD.md`
§C (lines 228-288, the 40 `NON_CRM_OBJECTS` entries) — independently re-diffed against the full 165-name list
read directly from `metadata/integrations/hubspot/.hubspot.integration.json`. Absence from SOURCE_STUDY
confirmed via direct grep (0 matches for all 8 terms).

**What the producer's artifacts say**: Nothing, still. This is the same underlying finding the prior review
raised in its own CG-1 (the "8 ambiguous cases" sentence), which the amendment between rounds did not address
even though it fixed the other 24 objects + 3 association pairs from that same CG-1 finding. The producer's
"REDO" narrative in SOURCE_STUDY only covers the 27-item REDO_REQUIRED_OBJECTS list; these 8 objects were
never re-examined by either the SOURCE_STUDY REDO pass or the metadata amendment.

**Severity**: **Blocking.** The DEPRECATION_RECORD's own regression-diff gate instructions (which this task's
review criteria explicitly invoke) state: *"Flag as a blocking gap any object or field present in the prior
baseline that is absent from the new emission WITHOUT a documented skipReason."* No skipReason exists for any
of the 8. At minimum this requires either (a) extraction as new Declared IOs, or (b) an explicit, evidenced
`skipReason` per object (e.g., "action-endpoint, not a record set" for `site_search`/`source_code`).

### CG-4 (Advisory): Regression-diff formally CANNOT be marked fully confirmed — `RegressionDiffConfirmed: false`

Per CG-3 above, 8 objects from the prior baseline remain unaccounted-for. Per the task's own regression-diff
instruction ("confirm EVERY object/column present in the prior but ABSENT here is an INTENTIONAL breaking
change... an unexplained removal is a Blocking gap"), I cannot set `RegressionDiffConfirmed: true`. The 24
objects + 3 association pairs the prior review flagged in its own CG-1/CG-2 ARE now fixed (verified
independently this round, not merely trusting the prior review — see the "Fixes verified" section below), so
this is a narrower, more specific residual than the prior round's finding, not a full regression.

**Severity**: Advisory on its own (it's a bookkeeping/reporting-state flag, not new lost capability beyond
CG-3's 8 objects, which is already counted as Blocking there). Recorded separately so the stats block's
`RegressionDiffConfirmed: false` is traceable to a specific, itemized cause rather than a vague "not sure."

---

## Fixes verified from the prior round (independently re-confirmed, not merely trusted)

- **CG-1 (prior, 24 objects + `CredentialTypeID`)**: All 24 objects (`transactional_smtp_tokens`,
  `custom_coded_actions`, `api_usage`, `portal_users`, `user_roles`, `business_units`, `currencies`,
  `conversation_inboxes`, `conversation_inbox_channels`, `conversation_custom_channels`, `forms`,
  `form_submissions`, `single_send_v4`, `ad_campaigns`→correctly gapped, `ad_accounts`→correctly gapped,
  `blog_settings`, `media_bridge`, `workflows`, `tax_rates`, `scim_users`, `scim_groups`,
  `conversation_channels`, `meeting_scheduler`, `datasource_ingestion`) are now present in the emission —
  confirmed by direct name lookup against the 165-IO list. `Integration.CredentialTypeID` is now set to
  `@lookup:MJ: Credential Types.Name=HubSpot API` — confirmed by direct read of the root `fields` object,
  matching the prior review's FixInstruction exactly.
- **CG-2 (prior, 3 association pairs)**: `associations_quotes_contacts`, `associations_quotes_line_items`,
  `associations_tickets_feedback_submissions` are now present, modeled with the same 3-field
  (`fromObjectId`/`toObjectId`/`associationTypes`) shape as every other association IO — confirmed
  structurally consistent by direct sampling.
- **JC-3 mitigation (`IsForeignKey` non-column)**: still holds — all 120 `IsForeignKey`-bearing IOF rows
  independently re-confirmed to carry a correctly-qualified `RelatedIntegrationObjectID` `@lookup:` (using
  `@parent:IntegrationID`, not the mis-qualified `@parent:ID` anti-pattern). 0 unresolved FK targets across
  the entire emission.

---

## 2. Judgment Calls

### JC-1: `currencies` folds 3 documented sub-paths into 1 IO

**What the producer chose**: Emit a single `currencies` IO with `APIPath` pointing at
`/settings/currencies/2026-03/exchange-rates`, even though SOURCE_STUDY's own prose (line 311) names three
distinct paths under the Multicurrency resource (`/codes`, `/exchange-rates`, `/company-currency`).

**What I would have chosen**: Same, or would have accepted either — folding closely-related sub-resources of
one conceptual "Currency configuration" object into a single syncable IO is a defensible taxonomy-authoring
choice, distinct from `business_units` (CG-2) where the chosen path is not merely "one of several plausible
choices" but a segment-truncated path that matches NONE of the source's documented paths.

**Why neither is wrong**: The single-IO choice for a tightly-coupled settings resource with 3 sub-endpoints is
a reasonable granularity call, as long as the chosen path is itself one of the real documented endpoints
(which `/exchange-rates` is, per SOURCE_STUDY's own citation) — this is exactly what distinguishes it from
CG-2's genuine defect.

### JC-2: `form_submissions`'s parent-hierarchy note uses `Configuration.parentObject` (singular key) instead of the `parentObjectName`/`parentObjectIDFieldName` pair used elsewhere

**What the producer chose**: For `form_submissions`, encode the forms→submissions relationship as
`Configuration.parentObject: "forms"` (no matching `parentObjectIDFieldName` key), while `hubdb_rows`,
`list_memberships`, and `pipeline_stages_deals` all use the consistent `parentObjectName`+`parentObjectIDFieldName`
key pair.

**What I would have chosen**: Standardize on one key-naming convention (`parentObjectName`/`parentObjectIDFieldName`)
across every parent-child `Configuration` entry, since `ParentObjectName`/`ParentObjectIDFieldName` are the
actual (non-deployed, but semantically canonical) column names per `phase0-slots.json`.

**Why neither is wrong**: Both forms are informal `Configuration` JSON conventions, not a schema-enforced
shape — the framework doesn't validate key names inside the JSON blob, and the semantic information
(which object is the parent) is present either way. This is a hygiene/consistency preference, not a
correctness defect, since nothing currently reads this key programmatically at runtime (it's documentation
for the connector author, same class of concern as the `IsForeignKey` JC-3 finding from the prior round).

---

## 3. Reviewer Errors

### RE-1: Initial suspicion that `partner_clients`/`partner_services`/`goals` were the same class of defect as `timeline_event_types`

Having found `timeline_event_types` still broken (CG-1), I initially suspected the other 3 "extra beyond
SOURCE_STUDY's taxonomy" objects (`partner_clients`, `partner_services`, `goals`) might share the same defect
pattern (schema/endpoint mismatch). On inspection, all 3 have real per-IO CODE_EVIDENCE entries citing
downloaded specs (`crm__partner_clients.json`, `crm__partner_services.json`) or the DEPRECATION_RECORD's own
independently-verified §B distinction for `goals`, and their emitted `APIPath`s (`/crm/objects/2026-03/partner_clients`,
`/crm/objects/2026-03/partner_services`, `/crm/objects/2026-03/0-136`) follow the exact same well-established
`SimplePublicObject` pattern as every other standard CRM object, with plausible field sets (`id`/`properties`/
`createdAt`/`updatedAt`/`archived`). This suspicion did not hold up — these 3 are legitimate, evidenced
additions, not defects. (This mirrors the prior round's own RE-1 finding on the same 3 objects — re-confirmed
independently rather than assumed carried-forward.)

### RE-2: Initial assumption that the +4 IO-count delta (165 vs 161 expected) was itself a red flag

Given the "n/n object/field under-count... is a Confirmed Gap" framing in the task instructions, I initially
treated the raw delta (165 emitted vs 161 SOURCE_STUDY-enumerated) as suspicious on its own. On breaking it
down, the delta resolves cleanly: 63/63 association pairs match exactly, and the +4 in the non-association set
are the 3 evidenced CRM additions (RE-1) plus the 1 genuinely defective `timeline_event_types` (CG-1). The
raw count being ABOVE the source-study figure is not itself the problem — bias-toward-completeness additions
are explicitly sanctioned by the framework's own rules; only the single defective member (CG-1) is a real
gap, and it happens to also be a re-emission of a first-pass mistake rather than a new REDO-pass finding.

---

## Bijection check against `phase0-slots.json`

Independent node-script sweep of all 165 emitted IOs (1,288 total IOFs):

- `SupportsCreate=true` ⟺ non-null `CreateAPIPath`+`CreateMethod`: **0 violations**.
- `SupportsUpdate=true` ⟺ non-null `UpdateAPIPath`+`UpdateMethod`: **0 violations**.
- `SupportsDelete=true` ⟺ non-null `DeleteAPIPath`+`DeleteMethod`: **0 violations**.
- `SupportsIncrementalSync=true` ⟺ non-null `IncrementalWatermarkField`: **0 violations**.
- FK target name resolution (`RelatedIntegrationObjectID` `@lookup:` targets resolve to a sibling IO Name in
  the same emission): **0 unresolved targets** across all 63 association IOs' 120 FK-bearing fields plus
  scattered non-association FK fields (e.g. `form_submissions`→`forms`).
- `@parent:ID` vs `@parent:IntegrationID` FK-lookup qualifier: **0 violations** (all use the correct qualifier).
- Zero-field IOs: **0**.
- Zero-PK IOs: **1** (`timeline_event_types` — see CG-1; a content/mapping defect, not a bijection-table
  violation per se, since the IO declares no FK/write capability requiring a PK).
- Duplicate IO names: **0**.

No mechanical bijection-table violations found. The two Blocking gaps found this round (CG-1, CG-2) and the
carried-forward CG-3 are all content/mapping defects a mechanical bijection check cannot catch — exactly the
class of defect same-source adversarial reading exists to find.

---

## Capability honesty vs. brand-study cross-check

`Configuration.WriteCapability.supported: true` with documented create/update/delete/upsert/batchCreate/
batchUpdate. Emission has 111 IOs with `SupportsCreate=true`, 45 with `SupportsUpdate=true`, 107 with
`SupportsDelete=true`, 113 with `SupportsWrite=true` overall (out of 165 total IOs). This is NOT the
GrowthZone-class defect (a bidirectional/write-capable vendor shipped as pull-only) — the emission correctly
reflects HubSpot's real, extensively-documented write capability with a substantial write-capable IO set. No
confirmed gap on this dimension.

---

## DeployPreflight findings — independently re-confirmed (not merely trusted)

1. **`IsForeignKey` non-column, 120 occurrences** — CONFIRMED exact count via node script. All 120 rows carry
   a correctly-qualified mitigating `RelatedIntegrationObjectID`. Treated as hygiene (JC-3 class), not
   blocking — the real, persisted FK signal survives; only the dead, non-deployed `IsForeignKey` key is inert.
2. **`IsMutable` non-column, 25 occurrences** — CONFIRMED exact count. All 25 are on write-related non-CRM IOs
   (`workflows`, `custom_coded_actions`, `forms`, `single_send_v4`, `transactional_smtp_tokens`, and 20 more).
   This is a `mj sync push`-silent-drop of an "ideal but unmigrated" field with no persisted equivalent
   (unlike `IsForeignKey`, there's no `Configuration`-embedded fallback observed for `IsMutable` specifically)
   — a genuine, if low-severity, information loss on push. Not escalated to Blocking on its own since it does
   not corrupt or misrepresent any PERSISTED field; it simply loses a documentation-only signal that
   `SupportsWrite`/`SupportsCreate`/`SupportsUpdate`/`SupportsDelete` (which ARE deployed columns) already
   capture at a coarser grain.
3. **`ParentObjectName`/`ParentObjectIDFieldName` non-column, 4 occurrences each** — CONFIRMED exact count
   (`form_submissions`, `associations_quotes_contacts`, `associations_quotes_line_items`,
   `associations_tickets_feedback_submissions`). CONFIRMED all 4 also carry the equivalent information inside
   the deployed `Configuration` JSON column (`parentObject`/`fromObjectType` keys), so the semantic content is
   NOT actually lost on push despite the top-level fields being dropped — see JC-2 for the key-naming
   inconsistency noted there. Not blocking.

---

## Stats Block

```json
{
  "ConfirmedGapsBlocking": 3,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 2,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 5,
  "BijectionViolationsFound": 0,
  "ModelObserved": "claude-sonnet-5",
  "RegressionDiffConfirmed": false,
  "ReviewFile": "packages/Integration/connectors-registry/hubspot/INDEPENDENT_REVIEW.md",
  "FixInstructions": [
    {
      "slot": "io.timeline_event_types",
      "operation": null,
      "before": {
        "APIPath": "/integrators/timeline/2026-03/types/projects",
        "Status": "Active",
        "Configuration": { "primaryRecordSchema": "TimelineEventIFrame", "spec": "sources/specs/crm__timeline.json" },
        "fields": ["headerLabel", "height", "linkLabel", "url", "width"]
      },
      "after": "Per the producer's OWN SOURCE_STUDY.md Taxonomy #12 correction (lines 250-253, written in this same REDO pass): reclassify as runtime-discovery-only with skipReason 'no credential-free type-definition list endpoint; current mechanism is a deploy-time project *-hsmeta.json config file, not a queryable REST resource; legacy REST surface /integrations/v1/{appId}/timeline/event-types exists but is auth-gated for any read.' Remove the static IO (or mark Status accordingly) rather than leaving the TimelineEventIFrame-mapped placeholder as an Active, confidently-sourced IO.",
      "evidence": "packages/Integration/connectors-registry/hubspot/sources/specs/crm__timeline.json (components.schemas.TimelineEventIFrame, AppEventOccurrence, ExternalAppEventResolutionRequest/AppEventResolutionResponse; paths./integrators/timeline/2026-03/types/projects); packages/Integration/connectors-registry/hubspot/SOURCE_STUDY.md lines 250-253 (Gap 6 + Taxonomy #12 REDO correction)",
      "rationale": "The producer's own current-pass source study already concluded this object cannot be statically Declared; the metadata emission was never updated to match that conclusion. This is a direct self-contradiction within the producer's own artifacts from the same pass, not a new source-reading dispute.",
      "requiresEscalation": false
    },
    {
      "slot": "io.business_units.APIPath",
      "operation": "set",
      "before": "/business-units/public/2026-03/business-units",
      "after": "/business-units/public/2026-03/business-units/user/{userId}",
      "evidence": "packages/Integration/connectors-registry/hubspot/sources/specs/business_units__business_units.json (the single `paths` entry) + SOURCE_STUDY.md line 310 (producer's own prose citing this exact path as the only documented read path)",
      "rationale": "The emitted path is missing the required /user/{userId} segment present in the cited spec's only path; the current APIPath does not exist in the source and would 404 live. This is a mechanical, directly-falsifiable string mismatch against the cited evidence file, not a judgment call.",
      "requiresEscalation": false
    },
    {
      "slot": "io.*",
      "operation": null,
      "before": "8 prior-connector objects still absent with no skipReason: email_campaigns_legacy, url_mappings, site_search, source_code, visitor_identification, timeline_event_templates, behavioral_events, subscription_definitions",
      "after": "For each: either (a) extract as a new Declared IO from its documented API surface, or (b) add an explicit, evidenced skipReason in the metadata/CODE_EVIDENCE citing why it is out of scope (e.g. 'action-endpoint, not a record set' for site_search/source_code; 'superseded by campaigns object, legacy-only' for email_campaigns_legacy if that is the correct call; verify whether subscription_definitions is the same resource as the already-emitted subscription_types before deciding to gap or merge).",
      "evidence": "packages/Integration/connectors-registry/hubspot/runs/connector-hubspot-1782844385831-2bfb45ce/output/DEPRECATION_RECORD.md section C (lines 228-288); independently re-confirmed absent from both the current metadata JSON (0 string matches for all 8 names) and SOURCE_STUDY.md (0 matches)",
      "rationale": "DEPRECATION_RECORD's own regression-diff gate instructions require every prior-baseline object to either appear in the new emission or carry a documented skipReason. These 8 were flagged by the prior review round and remain untouched by this round's amendment, which fixed the other 24 objects + 3 association pairs from the same original finding but not these. Escalation flagged because some of these require re-walking sources / making a scope call (site_search, source_code plausibly out-of-scope as action-endpoints) rather than a mechanical field edit — the producer should triage each individually rather than apply one blanket fix.",
      "requiresEscalation": true
    }
  ]
}
```
