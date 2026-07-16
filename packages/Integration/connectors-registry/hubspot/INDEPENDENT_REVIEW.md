# INDEPENDENT REVIEW — HubSpot Connector Extraction (Adversarial Review, this cycle)

**Reviewer model**: claude-sonnet-5 (Sonnet 5) — different model surface from the producer/coordinator per the v2 charter.
**Review type**: Phase 2c content review of the REDO emission (`metadata/integrations/hubspot/.hubspot.integration.json`), SLIM MODE.
**Mode**: SLIM — full OpenAPI specs were NOT bulk-loaded into context. Verification used (1) a node count-reconcile script run fresh against the current emission, (2) targeted `node`/`grep` reads of a small number of cached spec files under `sources/specs/` to independently confirm/refute specific claims, (3) a full read of `SOURCE_STUDY.md` (read first, before the emission or any report, per the strict read-order discipline), and (4) reads of `DEPRECATION_RECORD.md`, `contract.json`, `CODE_EVIDENCE.json`, `PROVENANCE.json`.
**Date**: 2026-07-02 (session date at time of review)

---

## CERTIFICATION BOUNDARY (READ FIRST, VERBATIM PER CHARTER)

This review is a **LINT GREEN**, not a runtime verification. I CANNOT certify that HubSpot API paths are
LIVE-correct, that pagination params actually advance, that declared PKs are populated in real records, that
the watermark param is accepted, or that the write surface really exists. Those are the Reality Probe stage's
(S7) job, which runs after this review. My green (where given) is a same-source-documentation-consistency
green — enumeration coverage, bijection coherence, capability honesty, and naming/evidence discipline — never
a verification that the connector works against the real HubSpot API.

---

## Method note

I built my expected inventory (`/private/tmp/.../scratchpad/hubspot_reviewer_expected.txt`) from `SOURCE_STUDY.md`
alone, before opening the emission. I then ran a node count-reconcile script fresh against the current
`metadata/integrations/hubspot/.hubspot.integration.json` (165 IOs emitted, top-level `Integration.Name: hubspot`,
1 top-level record), cross-checked every apparent discrepancy against real source artifacts (downloaded OpenAPI
specs in `sources/specs/`, the API catalog `sources/api-catalog-new.json`, PROVENANCE.json, CODE_EVIDENCE.json),
and only then opened `DEPRECATION_RECORD.md` and the run's `contract.json`/dual-derive artifacts.

---

## 1. Confirmed Gaps

### Gap A — `goals` IO (objectTypeId `0-136`) has NO source evidence anywhere — BLOCKING

**What the gap is:** The emission contains an **Active** IO named `goals` (`APIPath: /crm/objects/2026-03/0-136`,
6 fields, `IsPrimaryKey: id`). I independently searched every artifact that could justify it:
- `SOURCE_STUDY.md`: zero mentions of `goals` or `0-136` anywhere in the 445-line REDO source study (verified via `grep -in "0-136\|partner_client\|partner_service\|\"goals\""` against the file — zero hits for goals/0-136).
- `sources/api-catalog-new.json`: I independently parsed the 102-entry catalog with node and found only **one** "goal"-matching entry: `{"name":"Goal Targets","group":"CRM", ...}` — there is no separate "Goals" API. (My first grep hit a false "Goals Guide" string, but that was a `relatedDocumentation` link title on the Goal Targets entry, not a distinct API — confirmed by structured parse.)
- `sources/specs/`: no `crm__goals.json` or any spec file referencing `0-136` (`grep -rl "0-136" sources/specs/` → zero hits).
- `PROVENANCE.json`: zero entries with `TargetField` containing `goals` (excluding `goal_targets`, which is a legitimately separate, well-sourced object).
- `CODE_EVIDENCE.json`: 3 entries cite `io.goals`, but all three are `ScriptPath: scripts/amend-round2.mjs`, `StructuredOutput: {"added":["goals"]}` — i.e., the script's own log that it added the object, not a citation of a vendor source. This is not evidence; it's a self-referential audit trail.
- `Integration.Configuration.skippedObjects`: this block explicitly documents 8 other borderline/legacy objects with individual `reason`/`evidence`/`supersededBy` fields (see Gap B resolution below) — `goals` is conspicuously **not** one of them, meaning it was neither properly sourced nor honestly logged as a gap.

**Where it likely came from:** `runs/connector-hubspot-1782844385831-2bfb45ce/output/DEPRECATION_RECORD.md` (the regression baseline) documents that the **deprecated** connector's `STANDARD_OBJECTS` map contained `goals → 0-136` with "No static fields in prior connector; fields discovered live via Properties API," and instructs (breaking-change item #2) that the new connector "must emit a `goals` IO... sourced from the credential-free HubSpot CRM API docs for this object type, or via runtime `DiscoverFields` if not credential-free-provable." The producer appears to have carried this forward from the deprecated connector's code (a regression-preservation motive) without ever finding actual credential-free source evidence for it in this REDO's own audited sources — and the REDO's own SOURCE_STUDY, which explicitly re-derived the entire object universe from scratch, never surfaced it. This is very likely the SAME failure mode the `connector-code-conventions.md` "GOVERNING PRINCIPLE" section warns against: carrying forward a template value (from the deprecated connector) rather than reading it from THIS pass's own audited source.

**Severity:** Blocking. This is a hard provable-only / provenance violation (`connector-provenance-conventions.md`: "Don't fabricate... every hard constraint... must trace back to" PROVENANCE or CODE_EVIDENCE citing a real source). `APIPath`, `Name`, and `Status` are all hard-constraint IO fields requiring evidence; none exists for this object's real existence as `0-136`.

**FixInstruction:**
```json
{
  "slot": "io.goals.Status",
  "operation": "downgrade-capability",
  "before": "Active",
  "after": "Disabled (or delete the row entirely if no evidence surfaces)",
  "evidence": "sources/api-catalog-new.json (only 'Goal Targets' CRM API exists; no distinct 'Goals' API); sources/specs/ (no crm__goals.json, no 0-136 reference anywhere)",
  "rationale": "goals (0-136) has zero credential-free source evidence in this REDO's own audited sources — SOURCE_STUDY.md never mentions it, no spec file backs it, CODE_EVIDENCE only cites the extractor script's own action log. Either find real Tier-1/2 evidence for this object (a HubSpot docs page or catalog entry for objectTypeId 0-136 distinct from Goal Targets) or move it to Integration.Configuration.skippedObjects with an honest reason, matching the pattern already used for 8 other borderline objects in this same emission."
}
```

---

### Gap B — Integration-level `ImportPath` is entirely missing — BLOCKING

**What the gap is:** `Integration.fields.ImportPath` is absent (not null — the key does not exist) from the root
Integration record in `metadata/integrations/hubspot/.hubspot.integration.json`. I confirmed this via direct
node inspection of the parsed root `fields` object.

**Source citation:** `runs/connector-hubspot-1782844385831-2bfb45ce/output/DEPRECATION_RECORD.md`, breaking-change
item #8 ("Import path change: `ImportPath` on the Integration row changes from `@memberjunction/connectors` to
`@memberjunction/connector-hubspot`. Existing `CompanyIntegration` rows are unaffected; only the `MJ: Integrations`
metadata row is updated."). `connector-code-conventions.md` also documents `ImportPath` as one of the three-way
invariant fields (`ClassName` == `ImportPath` == `package.json` name in the shipped Open App). PROVENANCE.json has
zero entries citing `TargetField: "integration.ImportPath"`.

**What the producer's report says about it:** Nothing — it's simply absent from the emission, and no
`skippedObjects`-style entry or provenance note explains the omission. This is a required breaking-change item
from the connector's own regression baseline that was never addressed.

**Severity:** Blocking (this is a required field for the connector to register correctly under its new package
path; per `connector-code-conventions.md` it's part of the four-way invariant the `OpenAppPublish` step gates on).

**FixInstruction:**
```json
{
  "slot": "integration.ImportPath",
  "operation": "set",
  "before": null,
  "after": "@memberjunction/connector-hubspot",
  "evidence": "runs/connector-hubspot-1782844385831-2bfb45ce/output/DEPRECATION_RECORD.md breaking-change item #8",
  "rationale": "Required field for the per-vendor registry package registration; explicitly mandated by this connector's own regression baseline and never populated."
}
```

---

### Gap C — Six real, downloaded API-surface spec files are entirely absent from SOURCE_STUDY's taxonomy AND from the emission — ADVISORY (not independently confirmed as syncable in all cases; downgraded from Blocking, see reasoning)

**What the gap is:** I independently confirmed (via `ls sources/specs/ | grep -i "webhook\|aeo\|site_search\|user_provisioning\|content_audit"`) that the following spec files exist in the connector's own downloaded source set but are **never mentioned anywhere in SOURCE_STUDY.md** (verified via grep, zero hits) and are **not present in the 165-IO emission**, nor are they in the `Configuration.skippedObjects` justification block:

- `webhooks__webhooks.json` — "Webhooks Webhooks", 27 paths, including `/webhooks-journal/journal-local/2026-03/batch/read`, `/earliest`, `/latest/{count}` — a genuine, listable webhook-delivery event journal (replay capability), independently confirmed to have real GET list/batch endpoints, not just an action.
- `webhooks_journal__webhooks_journal.json` — "Webhooks Journal Webhooks Journal", 23 overlapping paths — likely the same surface under two catalog names (possible legitimate de-dup, not necessarily two separate gaps), but neither is covered.
- `marketing__aeo.json` — "Marketing Aeo" (Answer Engine Optimization), 6 paths across 3 distinct sub-resources: `prompts`, `prompts/{promptId}/runs` (prompt-runs), `recommendations` — all appear to be genuine listable record collections (not action-only), independently confirmed via path inspection.
- `settings__user_provisioning.json`'s `/settings/users/2026-03/teams` path — SOURCE_STUDY cites this exact spec file as the source for taxonomy #18 (`portal_users`, `user_roles`) but never separately enumerates its `/teams` path, which appears to be a Settings-scoped Teams administration resource distinct from the already-emitted CRM `teams` (taxonomy #5, sourced from `crm_owners.json`/`/crm/owners/`).
- `cms__site_search.json` and `cms__cms_content_audit.json` — the emission's own `Configuration.skippedObjects` block DOES address `site_search` with a specific, source-grounded reason (query/search endpoint, not a record collection — I independently agree with this reasoning after inspecting the spec's 2 paths). `cms_content_audit` is not addressed anywhere but is plausibly analogous to the already-INFORMATIONAL `audit_logs` taxonomy (I3) — same reasoning likely applies, just never stated.

**What the producer's report says about it:** SOURCE_STUDY.md's own "Enumerated universe from machine-readable
specs" section states 701 raw schema types across "64 spec files" downloaded, but I count **102 files** actually
present in `sources/specs/` (independently verified via `ls | wc -l`) — so SOURCE_STUDY undercounts its own
downloaded source set by 38 files, and the taxonomy pass appears to have been built from a subset of the
downloaded specs, not the full set. `webhooks`, `webhooks_journal`, `marketing_aeo`, and the `user_provisioning`
`/teams` sub-path all fall into that undercounted remainder.

**Severity:** Advisory, not Blocking, for this review round. Reasoning: (1) `site_search` and (plausibly)
`cms_content_audit` are legitimately non-syncable/informational once inspected, matching the producer's own
established reasoning pattern elsewhere in `skippedObjects`; (2) `webhooks`/`webhooks_journal`/`marketing_aeo`/
`teams` are plausible real gaps but I have not confirmed via full spec-body inspection (schema definitions,
required fields) that they clear the bar for a first-class syncable IO versus e.g. an app-level configuration
resource — SLIM mode did not warrant pulling full spec bodies into context for all 6 files. I flag this as a
concrete, source-cited, named gap for the producer to resolve (either emit them or log them in
`skippedObjects` with the same evidentiary discipline already used for the other 8 borderline objects) rather
than blocking this round outright, since the magnitude (at most ~5 additional objects out of 161+) does not
rise to the GrowthZone-class "16-of-38" under-enumeration this review process exists to catch, and the producer
has already demonstrated the correct pattern for handling exactly this class of finding.

**FixInstruction:**
```json
{
  "slot": "io.webhooks_journal (new)",
  "operation": null,
  "before": "absent",
  "after": "emit as Active IO, or add to Configuration.skippedObjects with reason",
  "evidence": "sources/specs/webhooks__webhooks.json and sources/specs/webhooks_journal__webhooks_journal.json — both confirmed present with real GET list/batch paths (/webhooks-journal/journal-local/2026-03/batch/read etc.), zero mention in SOURCE_STUDY.md or Configuration.skippedObjects",
  "rationale": "Two real spec files representing a webhook-delivery-journal API surface were downloaded but never taxonomized or logged as skipped. Also applies to marketing__aeo.json (prompts/prompt-runs/recommendations, 3 objects) and the /teams path in settings__user_provisioning.json.",
  "requiresEscalation": true
}
```

---

## 2. Judgment Calls

### JC-1 — `contacts` (and all CRM standard objects) use an opaque `properties` JSON envelope rather than per-property static fields; `email` is not a discrete `IsUniqueKey` field

**What the producer chose:** Every CRM standard object (`contacts`, `deals`, `tickets`, etc.) is modeled with a
fixed 5-7 field envelope shape: `id` (PK), `properties` (type `json`, opaque blob), `createdAt`, `updatedAt`,
`archived` — matching the HubSpot `SimplePublicObject` OpenAPI schema exactly (I independently confirmed this
shape is the correct, literal OpenAPI schema for these objects). `DEPRECATION_RECORD.md` breaking-change item
#11 explicitly requires `email` be emitted as `IsUniqueKey=true` on `contacts` to preserve the deprecated
connector's `UpsertKey: 'email'` behavior. Under the chosen envelope model, `email` does not exist as a
discrete top-level field — it would only appear inside the opaque `properties` JSON blob — so this specific
requirement is not literally satisfied, and there's no `skippedObjects`-style note explaining the divergence.

**What I would have chosen:** I would have either (a) added a `Configuration`-level note on `contacts`
documenting that `email` upsert-by-key must be handled via the `properties.email` path at runtime rather than
a static IOF, explicitly acknowledging the DEPRECATION_RECORD requirement and explaining why it isn't literally
satisfiable under the envelope model, or (b) emitted a non-required informational IOF for `email` scoped
inside the properties bag with a note that it's not a top-level column.

**Why neither is wrong:** The envelope model is the textually correct representation of what the OpenAPI spec
actually declares (I confirmed `SimplePublicObject`'s schema has no top-level `email` — it's a `properties`
map with vendor-defined keys, so declaring a static `email` IOF at the top level would itself be a fabrication
against the spec). The producer's choice not to fabricate a non-existent top-level field is the source-honest
choice; my alternative (documenting the divergence explicitly) is a completeness/traceability preference, not
a correctness disagreement. I did not escalate this as a Confirmed Gap because the underlying modeling decision
is correct and source-grounded — only the DEPRECATION_RECORD cross-reference is incomplete.

### JC-2 — `IsForeignKey` set inconsistently across otherwise-identical association pairs

**What the producer chose:** Original/pre-REDO association pairs (e.g. `associations_contacts_companies`,
`associations_deals_line_items`) carry `IsForeignKey: true` on their `fromObjectId`/`toObjectId` fields, while
the 3 REDO-added pairs (`associations_quotes_contacts`, `associations_quotes_line_items`,
`associations_tickets_feedback_submissions`) carry `IsForeignKey: undefined` on the same fields — despite both
having identical, correctly-resolving `RelatedIntegrationObjectID` `@lookup` references.

**What I would have chosen:** I would have set `IsForeignKey: true` uniformly across all 63 association pairs
for internal consistency, since `IsForeignKey` and `RelatedIntegrationObjectID` are semantically paired.

**Why neither is wrong:** Per `migrations/v5/V202606180940__v5.42.x__Integration_Connector_Enhancements.sql`
(independently confirmed via direct grep), `IsForeignKey` is explicitly a **transient, non-persisted discovery
signal** — it is never written to the deployed `IntegrationObjectField` table at all (unlike
`RelatedIntegrationObjectID`, which IS the real, persisted FK pointer). Because the field is dropped silently
on `mj sync push` regardless of its value, this inconsistency has **zero deployment or runtime effect** — it's
purely a metadata-file authoring inconsistency in a field that never survives to the database. I did not
escalate this to Confirmed Gaps because it cannot cause any observable defect; I flag it here only as a minor
authoring-hygiene note the producer may want to clean up in the same pass that strips `IsForeignKey` per
Gap-class D below (the operator's DeployPreflight finding).

---

## 3. Reviewer Errors

### RE-1 — I initially suspected 21 objects were silently dropped from the DEPRECATION_RECORD baseline (regression); 16 of 21 were resolved by renames or documented `skippedObjects` entries I hadn't yet found

Building my expected inventory purely from `SOURCE_STUDY.md`, I cross-referenced the emission against
`DEPRECATION_RECORD.md`'s 130-object baseline programmatically and got 21 apparent misses. On investigation:
- 8 were naming-convention translations I hadn't accounted for (`deal_pipelines`→`pipelines_deals`,
  `transcriptions`→`call_transcriptions`, `event_definitions`→`custom_event_definitions`, etc.) — present under
  a renamed but equivalent IO.
- 4 (`crm_imports`, `crm_exports`, `account_info`, `audit_logs`) are correctly reclassified as SOURCE_STUDY's own
  documented INFORMATIONAL taxonomies (I1/I3/I5) — not a regression, an intentional and pre-documented
  reclassification I should have cross-referenced against SOURCE_STUDY's INFORMATIONAL bucket before flagging.
- 2 (`ad_accounts`, `ad_campaigns`) are the explicitly documented vendor-confirmed-absent Gaps 7/8.
- 5 (`timeline_event_templates`, `email_campaigns_legacy`, `site_search`, `source_code`, `visitor_identification`)
  were, after I flagged them as unresolved, found to have individually-justified entries with real evidence
  citations in `Integration.Configuration.skippedObjects` — an artifact I had not yet opened when I formed the
  initial suspicion. Each carries a specific `reason`, `evidence` path, and (where applicable) `supersededBy`
  IO name, and my independent spot-check of the underlying spec files (`cms__site_search.json`'s 2 paths,
  `conversations__visitor_identification.json`'s single POST-only path) confirmed the producer's reasoning was
  correct in each case.

This was a genuine adversarial catch-then-resolve: my suspicion was well-founded from the DEPRECATION_RECORD
baseline alone, but the producer had already closed 16 of the 21 apparent gaps with documented, source-grounded
reasoning I simply hadn't read yet at the time I formed the suspicion. Only `goals` (Gap A) and the 4-5
never-addressed spec files (Gap C) survived as genuine, still-open findings.

### RE-2 — I suspected the `contract.json` "OBJECT-SET fabrication" list (15 objects allegedly "not re-derivable from the source") indicated real fabricated data

On inspection, `contract.json` is a stale/buggy tooling artifact from an earlier dual-derive run
(`extractedObjects: ["contacts"]` while simultaneously claiming `objectsExtracted: 165` — an internally
inconsistent state showing the tool only fully walked 1 object's fields in its final pass). I independently
verified real spec-file backing exists for a sample of the "fabricated" objects it flagged
(`crm__appointments.json`, `cms__hubdb.json` for `hubdb_rows`, `communication_preferences__subscriptions.json`
for `subscription_types`, `marketing__marketing_events.json` for `marketing_event_attendances`) — all four have
genuine, real spec files backing them, contradicting the tool's "fabrication" claim. I did not escalate these
as Confirmed Gaps; the `contract.json` dual-derive tool itself appears to have a coverage bug (matching against
an incomplete spec subset), not the metadata being genuinely fabricated.

---

## 4. Bijection check (`phase0-slots.json` slot table)

Ran fresh against the 165-IO emission via node script:
- **Write-capability bijection** (`SupportsCreate/Update/Delete=true` ⟹ non-null path+method columns): **0
  violations** across all 165 IOs (112 IOs with `SupportsWrite=true`, all fully wired).
- **Incremental-sync bijection** (`SupportsIncrementalSync=true` ⟹ non-null `IncrementalWatermarkField`): **0
  violations**.
- **FK `@lookup` resolution**: 132 `@lookup:MJ: Integration Objects.Name=...` references checked; **all 132
  resolve** to a real sibling IO name emitted in this same run (0 unresolved, 0 singular/plural mismatches).
- **`@parent:IntegrationID` qualifier discipline**: spot-checked association pairs + a broader sample; every
  `RelatedIntegrationObjectID` `@lookup` correctly qualifies with `&IntegrationID=@parent:IntegrationID` (never
  the bare/wrong `@parent:ID`).

No bijection violations found in the categories this reviewer charter defines as bijection coherence (item 2
of the four catchable classes). `BijectionViolationsFound: 0` in the stats block reflects this — the two
Confirmed Gaps above (A and B) are provenance/completeness violations, not bijection violations in the strict
Create/Update/Delete/Watermark/FK-target sense.

---

## 5. DeployPreflight violations (operator-supplied, independently re-verified against the metadata file AND against the actual migration history — not taken on faith)

All four violations supplied by the operator are **confirmed exactly as claimed**, independently re-derived:

| Field | Claimed occurrences | My independently-verified count | Confirmed absent from ALL of `migrations/v5/*.sql`? |
|---|---|---|---|
| `IsForeignKey` (IOF) | 120 | **120** (exact match) | Yes — confirmed via direct grep of `V202606180940__v5.42.x__Integration_Connector_Enhancements.sql` line 23, which explicitly states it is "intentionally NOT added" as a "transient discovery signal" |
| `IsMutable` (IO) | 25 | **25** (exact match, same 25 IO names) | Yes — zero hits across all of `migrations/v5/*.sql` |
| `ParentObjectName` (IO) | 4 | **4** (exact match: `form_submissions`, `associations_quotes_contacts`, `associations_quotes_line_items`, `associations_tickets_feedback_submissions`) | Yes — zero hits |
| `ParentObjectIDFieldName` (IO) | 4 | **4** (exact match, same 4 IOs) | Yes — zero hits |

These are real, confirmed schema violations that will cause `BaseEntity.SetLocal` to silently drop these
fields on `mj sync push` (per the CLAUDE.md rule on framework-ideal-but-unmigrated columns). I am treating
these as **already-confirmed by the operator and independently re-verified by me** — they are Blocking
regardless of extraction quality, since a clean `mj sync push` requires these keys be stripped from every
affected IO/IOF row before the metadata can deploy. I did not re-list them as a fifth/sixth/seventh "Confirmed
Gap" entry above since the operator's prompt already supplies them as pre-confirmed findings requiring
FixInstructions; I fold their FixInstructions into the block below for completeness.

The `enum-check-values`, `parent-fk-and-lookup-qualifier`, `lookup-target-exists`, and
`description-length-and-duplicate-names` "pass" claims were spot-checked and hold: `CredentialTypeID` lookup
resolves against `metadata/credential-types/.credential-types.json`'s "HubSpot API" row; every `IntegrationID`/
`IntegrationObjectID` uses `@parent:ID` correctly; every FK `@lookup` uses `@parent:IntegrationID` correctly
(never bare `@parent:ID`); no duplicate IO names (0 duplicates across 165 emitted names, confirmed by my
reconcile script); no duplicate IOF names spot-checked across the sampled IOs.

---

## Stats block inputs

- Confirmed Gaps (Blocking): **2** (Gap A: `goals` fabrication; Gap B: missing `ImportPath`) — plus the 4
  operator-pre-confirmed DeployPreflight schema violations (`IsForeignKey`×120, `IsMutable`×25,
  `ParentObjectName`×4, `ParentObjectIDFieldName`×4), which I independently re-verified exactly and fold in as
  Blocking since they block a clean `mj sync push`.
- Confirmed Gaps (Advisory): **1** (Gap C: 4-6 real, downloaded, undocumented spec-backed objects/sub-paths —
  `webhooks`, `webhooks_journal`, `marketing__aeo` ×3 sub-objects, `user_provisioning` `/teams`).
- Judgment Calls: **2** (JC-1 envelope-model vs DEPRECATION_RECORD's literal `email` IsUniqueKey requirement;
  JC-2 `IsForeignKey` inconsistency across association pairs — cosmetic, zero deploy effect).
- Reviewer Errors: **2** (RE-1: 16-of-21 apparent regression misses resolved by renames/documented skips;
  RE-2: `contract.json`'s "fabrication" list is a stale tooling artifact, not real fabrication).
- Independent sources fetched/inspected: SOURCE_STUDY.md (full read), `sources/api-catalog-new.json`
  (structured parse), 11 distinct files under `sources/specs/` (goal_targets, partner_clients, partner_services,
  webhooks, webhooks_journal, marketing_aeo, site_search, cms_content_audit, user_provisioning, appointments,
  hubdb — path/title-level inspection), `migrations/v5/V202606180940__v5.42.x__Integration_Connector_Enhancements.sql`
  + a full-history grep of `migrations/v5/*.sql` for 3 additional column names, `DEPRECATION_RECORD.md` (full
  read), `contract.json`, `CODE_EVIDENCE.json`, `PROVENANCE.json` (targeted queries), `metadata/credential-types/.credential-types.json`.
- Bijection violations found (strict Create/Update/Delete/Watermark/FK-target sense): **0**.
