# INDEPENDENT_REVIEW.md — Constant Contact (amendment round 1)

> **v2 charter reminder (verbatim header, per mandate):** This review is a **LINT green**, not a **LIVE
> green**. I re-read the same credential-free docs/spec the producer extracted from, on a different model
> surface, and checked enumeration coverage, bijection coherence, capability honesty, and naming/evidence
> discipline. I **CANNOT and do NOT certify**: that any emitted path is LIVE-correct against the real API,
> that pagination params actually advance a real cursor, that the declared PKs are populated in real
> records, that the watermark param is accepted by the server, or that the write surface genuinely round
> -trips. Those are the Reality Probe (S7) / live-E2E tiers' job, which run after this review.

**Model observed**: Claude Sonnet 5 (this review). No shared-recall artifacts with the producer/coordinator
were observed in this session; proceeding per charter.

**Scope note (per task instructions, SLIM MODE):** I did not re-read `sources/openapi.json`/`openapi.yaml`
in full. All spec cross-checks were performed via a handful of targeted, small `node -e` queries against
the cached `sources/openapi.json` (already fetched, unauthenticated, Tier-1) — a different code path from
the producer's `extract-io-iof.mjs`/`dual-derive-script.mjs`, run independently by me. This is round 1: it
re-verifies whether round 0's Confirmed Gaps were actually remediated, and separately probes for anything
round 0 missed.

---

## 0. Count-reconcile (independent script over the current emission)

```
IO count emitted:                67   (expected 67 from output/enumerate-taxonomy.stdout.json — EXACT MATCH)
missing from emission:            []
extra in emission:                []
Total IOF emitted:               543  (was 542 in round 0 -- +1 from the file_export_id PK fix, see §3)
IOs with zero fields:              0
IOs with zero IsPrimaryKey=true:  46  (was 47 in round 0 -- activities_contacts_export's PK fix landed)
IsForeignKey=true count across ALL 543 IOF rows: 0   -- STILL ZERO (see §1.1 -- new finding this round)
Fields with RelatedIntegrationObjectID set:       47  -- up from 0 in round 0 (round-0 FK fix WAS applied)
SupportsIncrementalSync=true count: 2 (contacts, emails) -- unchanged, correctly narrowed
Write-capable IOs (Create/Update/Delete true): 34 -- capability-honesty check still passes at aggregate level
Bijection floor-check (capability flag <-> per-op columns): 0 violations (Create/Update/Delete/Incremental
  all have their required companion columns non-null wherever the flag is true)
PaginationType breakdown: None=27, Cursor=39, PageNumber=1
```

**Enumeration coverage: PASS, unchanged.** 67-of-67 exact match, including exact per-family sub-counts
against `output/enumerate-taxonomy.stdout.json`. No under-enumeration anywhere.

---

## 1. Confirmed Gaps (Blocking)

### 1.1 [NEW, this round] `RelatedIntegrationObjectID` is now correctly populated on 47 fields — but `IsForeignKey` was never flipped to `true` on any of them (the FK flag itself is entirely absent from the JSON, not merely `false`)

**What the gap is.** Round 0 (§1.1 there) found zero FK marking anywhere and issued 45 `FixInstructions`,
each explicitly stating **"also set `iof.<IO>.<Field>.IsForeignKey=true`"** in its `rationale`. I
independently re-verified the current metadata file: the `RelatedIntegrationObjectID` **target-reference**
half of every one of those 45 fixes was applied correctly (I re-checked all 45 target names against the
sibling IO's actual emitted `Name` — 45/45 resolve correctly, no singular/plural mismatch). The producer
also went further and correctly resolved round 0's §2.2 judgment call by setting
`RelatedIntegrationObjectID` on `events_copy.event_id` → `events` and
`activities_contacts_export.activity_id` → `activities` (47 total). **But the `IsForeignKey` key is not
merely `false` on any of these 47 fields — it is absent from the JSON object entirely** (confirmed via raw
field dump, e.g. `contacts_xrefs.contact_id` has `RelatedIntegrationObjectID` and
`RelatedIntegrationObjectFieldName` populated but no `IsForeignKey` key at all).

**Why this matters mechanically, not just cosmetically.** `connector-code-conventions.md`'s FK rule states:
*"The base `IntrospectSchema` only emits a `Relationships` entry when BOTH `IsForeignKey` is true AND
`ForeignKeyTarget` is non-null; a half-set FK is silently dropped."* This is the mirror-image of that
half-set condition (target set, flag unset instead of flag set, target null) — same failure mode, same
silent-drop consequence: any runtime/framework code that gates FK-relationship recognition on
`IsForeignKey===true` (which the cited convention explicitly says is required) will treat all 47 of these
correctly-targeted relationships as **not FKs at all**, discarding the very fix round 0 asked for.

**Severity: Blocking.** Per the charter: "Bijection violations are always Confirmed Gaps (Blocking)." This
is a mechanical, one-line-per-field omission — the easiest possible class of fix — that nonetheless was
missed across all 47 instances in the amendment round.

**FixInstructions:** 47 entries, §4.1.

---

### 1.2 [CARRIED FORWARD, largely unresolved] `PaginationType` still fabricated as `Cursor` on 13 of the 15 IOs round 0 confirmed had zero pagination evidence

**What the gap is.** Round 0 (§1.2) named 15 specific IOs with `FixInstructions` (`account_emails`,
`account_user_privileges`, `contact_lists_xrefs`, `contacts_sms_engagement_history`, `contacts_xrefs`,
`email_campaign_activity_non_opener_resends`, `email_campaign_activity_schedules`,
`email_campaign_activity_send_history`, `email_reports_links`, `email_reports_stats_campaign_activities`,
`email_reports_stats_campaigns`, `emails_xrefs`, `social_connections`, `social_profiles` → all should become
`PaginationType: None`; `social_hashtag_groups` → should become `PageNumber`). I independently re-checked
all 15 against the current metadata:

| IO | Round-0 fix target | Current value | Status |
|---|---|---|---|
| `account_emails` | `None` | `None` | **Fixed** |
| `social_hashtag_groups` | `PageNumber` | `PageNumber` | **Fixed** |
| `account_user_privileges` | `None` | `Cursor` | **STILL WRONG** |
| `contact_lists_xrefs` | `None` | `Cursor` | **STILL WRONG** |
| `contacts_sms_engagement_history` | `None` | `Cursor` | **STILL WRONG** |
| `contacts_xrefs` | `None` | `Cursor` | **STILL WRONG** |
| `email_campaign_activity_non_opener_resends` | `None` | `Cursor` | **STILL WRONG** |
| `email_campaign_activity_schedules` | `None` | `Cursor` | **STILL WRONG** |
| `email_campaign_activity_send_history` | `None` | `Cursor` | **STILL WRONG** |
| `email_reports_links` | `None` | `Cursor` | **STILL WRONG** |
| `email_reports_stats_campaign_activities` | `None` | `Cursor` | **STILL WRONG** |
| `email_reports_stats_campaigns` | `None` | `Cursor` | **STILL WRONG** |
| `emails_xrefs` | `None` | `Cursor` | **STILL WRONG** |
| `social_connections` | `None` | `Cursor` | **STILL WRONG** |
| `social_profiles` | `None` | `Cursor` | **STILL WRONG** |

Only **2 of 15** were remediated; **13 remain exactly as round 0 flagged them.** I independently re-verified
a sample of these 13 directly against `sources/openapi.json` myself (not trusting round 0's citations as
still-current): `/account/user/privileges` has zero query parameters and its response schema
(`UserPrivilegesResource`) has zero properties (bare array) — no cursor mechanism of any kind;
`/reports/stats/email_campaigns/{ids}` and `/social/connections` and `/contact_lists/list_id_xrefs` likewise
have no `_links`/cursor wrapper in their response schemas. The finding is current, not stale.

**Aggravating finding — the producer's own self-check now reports a false "all clear" on this exact defect.**
`runs/connector-constant-contact-1783806258859-0be0453e/output/DUAL_DERIVATION.json` was regenerated
**after** the metadata was patched (file mtime 19:07, vs. the metadata file's 18:47 and the round-0 review's
own 17:03) — i.e. this is a fresh re-run of the producer's self-check tool over the *current, still-broken*
metadata. Its `divergenceHistogram.paginationMismatch` reads **`0`**, and every one of the 67 `perObject`
entries omits a `paginationMismatch` key entirely (as opposed to carrying an explicit `null`), which — cross
-referenced against the checked-in `dual-derive-script.mjs` in that same output folder — means the version
of the script that actually *produced* this JSON did not execute the pagination-comparison branch that
exists in the current `.mjs` source (or the comparison branch's own heuristic silently passes: I found the
script's own `paginationSignal` heuristic treats *any* endpoint with a `limit` query param as `'Cursor'`
regardless of the presence of a real cursor/`_links` mechanism, which would independently launder several of
these false-negatives even if the branch did run). Either way, **the tool that is supposed to catch this
regressed and now reports a false pass** on a defect it correctly caught in its earlier (round-0-era) run.
This is worth flagging on its own: an amendment round should not trust its own re-run self-check without an
independent cross-check, precisely because of this kind of silent tool regression.

**Severity: Blocking**, unchanged from round 0 — `PaginationType`/`SupportsPagination` are named
hard-constraint fields requiring `ExplicitStatement`/`ImpliedFromExample` evidence, and the current values
still fail that bar for 13 IOs.

**FixInstructions:** 13 entries, §4.2 (same fixes round 0 already specified — simply not yet applied to 13
of the 15).

---

### 1.3 [CARRIED FORWARD, escalation still pending] `activities_contacts_export` still models the wrong response schema; only the missing-PK half of round 0's fix was applied

**What the gap is.** Round 0 (§1.3) found two distinct problems on this IO: (a) the Tier-1-evidenced PK field
`file_export_id` was absent, and (b) the 10 emitted fields describe the **Activity job resource**
(`activity_id, state, started_at, completed_at, created_at, updated_at, percent_done, activity_errors,
status, _links`), not the actual response of this IO's own declared `APIPath`
(`/contact_exports/{file_export_id}`), which per `sources/openapi.json` `definitions.ActivityGetExport` is a
**bare CSV string** (`{"type": "string", "description": "CSV file containing exported contacts"}`), not a
JSON object at all.

I re-verified the current state: **(a) is fixed** — `file_export_id` is now present with
`IsPrimaryKey: true`, correctly citing the GetById path-parameter evidence. **(b) is unchanged** — the same
10 Activity-job fields are still present verbatim, still describing the wrong resource. Round 0 explicitly
flagged (b) with `requiresEscalation: true` rather than a mechanical fix, since a bare-string response needs
a design decision (e.g., model the IO as `file_export_id` + a `download_url`/raw-content field, or drop the
IO's implied "structured record" framing entirely) rather than a 1:1 field substitution — that escalation
was appropriate and remains open. I am **not** treating this as a new/regressed item; the mechanical half
was correctly applied and the design-decision half is exactly as unresolved as round 0 left it.

**Severity: Blocking** (per the charter's "Empty-PK alarm" — now resolved — combined with a
persisting wrong-schema modeling defect that a human/design decision must resolve; the field-set mismatch
alone, independent of the PK question, would still fail a differential schema check against the spec).

**FixInstruction:** carried forward from round 0, §4.3 (unchanged, `requiresEscalation: true`).

---

### 1.4 [NEW, this round] `IncrementalWatermarkField` is populated with the outbound query-FILTER-PARAMETER name, not the vendor record FIELD name it is documented to hold — on both of the connector's only two incremental-capable IOs

**What the gap is.** `contacts.IncrementalWatermarkField = "updated_after"` and
`emails.IncrementalWatermarkField = "after_date"`. Both of these are the **query parameter names** used to
filter the *next* request (confirmed against `sources/openapi.json`: `GET /contacts` declares
`updated_after`/`updated_before`/`created_after`/`created_before`/`optout_after`/`optout_before` as query
params; `GET /emails` declares `before_date`/`after_date`). Neither is a field that appears *on a Contact or
Email Campaign record itself*.

The authoritative definition of this column (`packages/MJCoreEntities/src/generated/entity_subclasses.ts`,
`IntegrationObjectField.IncrementalWatermarkField`) states: *"Vendor field name marking 'last changed' —
drives incremental sync filter when SupportsIncrementalSync=1. **The exact filter syntax (e.g.,
`$filter=Modified gt {value}` or `modified_since={value}`) lives in `Configuration.incrementalFilterFormat`**.
Provable-only: leave NULL if docs do not name a watermark field."* — i.e. this column is contractually the
**record field name**, and the **filter-param syntax is a *separate*, dedicated slot**
(`Configuration.incrementalFilterFormat`). I cross-checked this against a sibling connector already built
under the same framework (`metadata/integrations/hubspot/.hubspot.integration.json`): every HubSpot
incremental-capable IO sets `IncrementalWatermarkField` to the actual record property
(`hs_lastmodifieddate`), confirming this is the established, consistently-applied convention across
connectors, not an ambiguous or debatable reading.

Both `contacts` and `emails` **do** have the correct record field in their own emitted IOF list
(`updated_at`, present on both) — so the correct value is discoverable from the very same emission, it was
simply put in the wrong slot. Compounding this, `Configuration.incrementalFilterFormat` is **entirely
absent** on both IOs' `Configuration` objects (`contacts.Configuration = {"resourceTag":"Contacts",
"sourceItemSchema":"GET /contacts/{contact_id} 200"}` — no filter-format key at all) — so the actual
query-param name/format is not recorded *anywhere* once this is corrected, unless it is added alongside the
fix.

**Severity: Blocking.** `IncrementalWatermarkField` is a named hard-constraint field (its Tier-1 evidence
requirement is identical to any other hard-constraint IO column); the value currently populated fails to
match its own documented semantics on both of the only two IOs where this field is populated at all — a
100%-of-instances defect, not a one-off.

**FixInstructions:** 2 (+2 companion `Configuration` sets), §4.4.

---

## 2. Judgment calls

### 2.1 (carried forward from round 0, unaffected by this round's changes) `segments` Update mapped to the narrower `PATCH /segments/{segment_id}/name` (rename-only) instead of the fuller `PUT /segments/{segment_id}` (full update)
Unchanged from round 0's assessment — both endpoints are real and evidenced; reasonable extractors could
pick either. The separate `{segment_id}`-vs-`{id}` placeholder defect round 0 flagged alongside this
(§1.6 there) **is fixed** — I re-verified `segments.UpdateAPIPath` is now `/segments/{id}/name`.

### 2.2 (resolved this round, confirmed reasonable) `activity_id`/`event_id` self-identity ambiguity — the producer chose differently per-object, and both choices are defensible
Round 0 flagged `activity_id` on the 11 `activities_*` job IOs, and `event_id` on `events_copy`, as
genuinely ambiguous (self-identity vs. FK-to-sibling). I independently checked how the producer resolved
this in the amendment: the 10 job-status IOs' own `activity_id` (their own record identity) was left
un-referenced (no `RelatedIntegrationObjectID`) — consistent with "this record IS the Activity." But
`activities_contacts_export.activity_id` (a *different* resource whose record genuinely originates from, and
references, a separate Activity job) and `events_copy.event_id` (the copy operation's response IS a full
`EventDto` referencing the new/copied event) were both given `RelatedIntegrationObjectID` pointing at their
respective sibling list IOs. This is a self-consistent, defensible per-object resolution of the ambiguity
round 0 raised — not a new gap, and not the same treatment applied inconsistently.

### 2.3 (unchanged from round 0) Incremental watermark narrowed to 2 evidenced objects (`contacts`, `emails`) vs. prior code's unsourced 6-object blanket claim
Still correct per my own direct re-check of `/contact_lists`, `/segments`, `/activities` GET params (none
declare any date/watermark filter). This is a confirmed correction relative to `DEPRECATION_RECORD.md`'s
baseline, not a regression — see §3 (Regression diff) below. (Note this is orthogonal to §1.4's finding,
which is about *which slot* the watermark value landed in, not *which objects* got the flag.)

### 2.4 (unchanged from round 0) 46 IOs with zero `IsPrimaryKey=true` fields
Content-hash fallback for genuinely PK-less analytics/tracking rows remains the correct, framework-supported
behavior for all 46 (down from 47 after the `activities_contacts_export` fix landed). No new objection.

---

## 3. Regression diff (`DEPRECATION_RECORD.md` cross-check)

I independently re-verified a sample of the 10 named regression-risk items against the current metadata +
raw spec (not merely re-reading round 0's prior conclusion):

- **Item 3/4 (PK field names / Update-method-per-object heuristic)**: spot-checked all 8 prior objects'
  PK field names (`contact_id`, `list_id`, `custom_field_id`, `tag_id`, `campaign_id`,
  `campaign_activity_id`, `segment_id`, `activity_id`) — all 8 present with matching names and
  `IsPrimaryKey: true` in the current emission. Independently confirmed `contact_custom_fields`/
  `contact_tags` now correctly use `PUT` (verified directly against `sources/openapi.json`:
  `/contact_custom_fields/{custom_field_id}` and `/contact_tags/{tag_id}` both declare `get, put, delete` —
  no `patch` verb exists on either path at all) — this **corrects** the prior code's unsourced PATCH guess,
  exactly as `DEPRECATION_RECORD.md` §3 item 4 anticipated as a legitimate possible correction.
- **Item 5 (watermark model shape change)**: confirmed above (§2.3) — collapses to 2 docs-confirmed
  objects with dedicated fields, as required. (New finding this round, §1.4, is that the *value* in that
  field is wrong — a defect layered on top of an otherwise-correct shape change, not a reversion of it.)
- **Item 9 (net-new exclusions, not drops)**: confirmed — `partner_webhooks`/`technology_partners`/`sms`/
  `legacy_v2_eventspot`/`zapier`/`make` are correctly named out-of-scope with evidence in `SOURCE_STUDY.md`
  §6, and none were ever part of the prior 8-object baseline.
- **Item 10 (CRUD path declarative replacement)**: spot-checked the 8 prior literal paths
  (`/contacts`, `/contact_lists`, `/contact_custom_fields`, `/contact_tags`, `/emails`,
  `/emails/activities`, `/segments`, `/activities`) against the current per-IO `CreateAPIPath`/`APIPath` —
  all 8 present and equivalent (accounting for `email_campaign_activities`'s correctly-evidenced
  `/emails/activities/{campaign_activity_id}` refinement).

**`RegressionDiffConfirmed: true`.** All named regression-risk items resolve to confirmed, evidenced
corrections rather than unexplained regressions. This is unchanged from round 0's conclusion and I found no
reason to revise it — the new gaps found this round (§1.1, §1.4) are net-new-build defects, not reversions
of anything the prior code connector got right (the prior code had no FK marking and no
`IncrementalWatermarkField` column at all).

---

## 4. Reviewer errors (this round)

### 4.1 Suspected 30 field/IO `Description` values exceeding 255 characters would break `mj sync push` (the Salesforce/Dataverse-class over-long-description defect named in `connector-test-conventions.md`)
I found 30 `Description` values across `MJ: Integration Object` and `MJ: Integration Object Field` rows
exceeding 255 characters (e.g. `account_emails.roles` at 490 chars) and initially treated this as the same
deploy-blocking class of defect documented for Salesforce/Dataverse. I checked the actual deployed schema
before flagging it as a gap: `migrations/v5/B202605291452__v5.38.x__Baseline.sql` declares
**`[Description] NVARCHAR(MAX)`** for both `IntegrationObject` and `IntegrationObjectField` (not
`NVARCHAR(255)`) — there is no length constraint on this column in the current baseline this connector will
deploy against. The 255-char defect class is real for *other* columns (e.g. `Name` is `NVARCHAR(255)`,
correctly not implicated here) but does not apply to `Description` on this schema version. Not a gap;
recorded here as a self-caught false lead.

---

## 5. FixInstructions

### 5.1 `IsForeignKey` flag (§1.1) — 47 entries, one `set` per field

All entries share this shape:
```json
{
  "slot": "iof.<IO>.<Field>.IsForeignKey",
  "operation": "set",
  "before": null,
  "after": true,
  "evidence": "RelatedIntegrationObjectID is already correctly populated on this field (round-0 fix applied); connector-code-conventions.md FK rule requires both IsForeignKey=true AND a non-null target for the relationship to be recognized",
  "rationale": "half-set FK in the other direction from the path-LMS defect: target set, flag unset -- silently dropped by any consumer gating on IsForeignKey===true"
}
```

Fields (`IO.Field`): `contact_lists_xrefs.list_id`, `contact_reports_activity_details.contact_id`,
`contact_reports_activity_details.campaign_activity_id`, `contact_reports_activity_summary.campaign_activity_id`,
`contact_reports_open_and_click_rates.contact_id`, `contacts_sign_up_form.contact_id`, `contacts_xrefs.contact_id`,
`email_campaign_activities.campaign_id`, `email_campaign_activity_previews.campaign_activity_id`,
`email_reports_links.list_id`, `email_reports_summary.campaign_id`, `email_reports_tracking_bounces.contact_id`,
`email_reports_tracking_bounces.campaign_activity_id`, `email_reports_tracking_clicks.contact_id`,
`email_reports_tracking_clicks.campaign_activity_id`, `email_reports_tracking_didnotopens.contact_id`,
`email_reports_tracking_didnotopens.campaign_activity_id`, `email_reports_tracking_forwards.contact_id`,
`email_reports_tracking_forwards.campaign_activity_id`, `email_reports_tracking_opens.contact_id`,
`email_reports_tracking_opens.campaign_activity_id`, `email_reports_tracking_optouts.contact_id`,
`email_reports_tracking_optouts.campaign_activity_id`, `email_reports_tracking_sends.contact_id`,
`email_reports_tracking_sends.campaign_activity_id`, `email_reports_tracking_unique_opens.contact_id`,
`email_reports_tracking_unique_opens.campaign_activity_id`, `emails_xrefs.campaign_id`,
`emails_xrefs.campaign_activity_id`, `events.campaign_id`, `events_copy.event_id`, `events_copy.campaign_id`,
`events_registrations.contact_id`, `landing_pages_contact_opens.contact_id`,
`landing_pages_contact_opens.campaign_activity_id`, `landing_pages_unique_contact_adds.contact_id`,
`landing_pages_unique_contact_adds.campaign_activity_id`, `landing_pages_unique_contact_clicks.contact_id`,
`landing_pages_unique_contact_clicks.campaign_activity_id`, `landing_pages_unique_contact_opens.contact_id`,
`landing_pages_unique_contact_opens.campaign_activity_id`, `landing_pages_unique_contact_sms_optins.contact_id`,
`landing_pages_unique_contact_sms_optins.campaign_activity_id`, `landing_pages_unique_contact_updates.contact_id`,
`landing_pages_unique_contact_updates.campaign_activity_id`, `social_posts.campaign_id`,
`activities_contacts_export.activity_id` (47 total).

### 5.2 `PaginationType` (§1.2) — 13 entries (2 of the original 15 already fixed)

| IO | before | after |
|---|---|---|
| account_user_privileges | Cursor | None |
| contact_lists_xrefs | Cursor | None |
| contacts_sms_engagement_history | Cursor | None |
| contacts_xrefs | Cursor | None |
| email_campaign_activity_non_opener_resends | Cursor | None |
| email_campaign_activity_schedules | Cursor | None |
| email_campaign_activity_send_history | Cursor | None |
| email_reports_links | Cursor | None |
| email_reports_stats_campaign_activities | Cursor | None |
| email_reports_stats_campaigns | Cursor | None |
| emails_xrefs | Cursor | None |
| social_connections | Cursor | None |
| social_profiles | Cursor | None |

Each: also set `io.<Name>.SupportsPagination = false`.

```json
{
  "slot": "io.<Name>.PaginationType",
  "operation": "set",
  "before": "Cursor",
  "after": "None",
  "evidence": "sources/openapi.json -- response schema for this IO's primary GET has no _links/cursor wrapper and no cursor query param (re-verified independently against the raw spec this round, not merely re-asserted from round 0)",
  "rationale": "round-0 FixInstruction for this exact slot was not applied in the amendment round"
}
```

### 5.3 `activities_contacts_export` field-set (§1.3) — carried forward, unresolved

```json
{
  "slot": "io.activities_contacts_export.<fields>",
  "operation": null,
  "before": "10 fields copied from the Activity job schema (activity_id, state, started_at, ...) -- still present, unchanged since round 0",
  "after": null,
  "evidence": "sources/openapi.json definitions.ActivityGetExport (bare CSV string, not the Activity schema)",
  "rationale": "the emitted fields still do not describe the resource at this IO's own APIPath; needs a design decision, not a 1:1 field substitution",
  "requiresEscalation": true
}
```

### 5.4 `IncrementalWatermarkField` semantic fix (§1.4) — 2 entries + 2 companion `Configuration` sets

```json
[
  {
    "slot": "io.contacts.IncrementalWatermarkField",
    "operation": "set",
    "before": "updated_after",
    "after": "updated_at",
    "evidence": "metadata/integrations/constant-contact/.constant-contact.integration.json (contacts IOF list already contains 'updated_at'); packages/MJCoreEntities/src/generated/entity_subclasses.ts IncrementalWatermarkField description (\"vendor field name marking last changed\"); cross-checked against metadata/integrations/hubspot/.hubspot.integration.json (uses record field hs_lastmodifieddate, not a filter-param name)",
    "rationale": "updated_after is the outbound query-FILTER-PARAM name, not a record field; the column is documented to hold the latter"
  },
  {
    "slot": "io.contacts.Configuration",
    "operation": "set",
    "before": "{\"resourceTag\":\"Contacts\",\"sourceItemSchema\":\"GET /contacts/{contact_id} 200\"}",
    "after": "{\"resourceTag\":\"Contacts\",\"sourceItemSchema\":\"GET /contacts/{contact_id} 200\",\"incrementalFilterFormat\":\"updated_after={value}\"}",
    "evidence": "sources/openapi.json GET /contacts query param updated_after; entity_subclasses.ts IncrementalWatermarkField description names Configuration.incrementalFilterFormat as the correct home for filter syntax",
    "rationale": "without this, the actual outbound filter param name is lost entirely once IncrementalWatermarkField is corrected to the record-field name"
  },
  {
    "slot": "io.emails.IncrementalWatermarkField",
    "operation": "set",
    "before": "after_date",
    "after": "updated_at",
    "evidence": "metadata/integrations/constant-contact/.constant-contact.integration.json (emails IOF list already contains 'updated_at')",
    "rationale": "after_date is the outbound query-filter-param name (GET /emails), not a record field"
  },
  {
    "slot": "io.emails.Configuration",
    "operation": "set",
    "before": "{\"resourceTag\":\"Email Campaigns\",\"sourceItemSchema\":\"GET /emails/{campaign_id} 200\"}",
    "after": "{\"resourceTag\":\"Email Campaigns\",\"sourceItemSchema\":\"GET /emails/{campaign_id} 200\",\"incrementalFilterFormat\":\"after_date={value}\"}",
    "evidence": "sources/openapi.json GET /emails query param after_date",
    "rationale": "preserve the filter-param name once IncrementalWatermarkField is corrected"
  }
]
```

---

## Stats block

```json
{
  "ConfirmedGapsBlocking": 4,
  "ConfirmedGapsAdvisory": 0,
  "JudgmentCalls": 4,
  "ReviewerErrors": 1,
  "IndependentSourcesFetched": 1,
  "BijectionViolationsFound": 1,
  "ModelObserved": "sonnet",
  "ReviewFile": "connectors-registry/constant-contact/INDEPENDENT_REVIEW.md",
  "RegressionDiffConfirmed": true
}
```

Notes on stats:
- `ConfirmedGapsBlocking: 4` — §1.1 (IsForeignKey flag never set, 47 fields, NEW this round),
  §1.2 (PaginationType, 13 of round 0's 15 still wrong, CARRIED FORWARD/unresolved), §1.3
  (`activities_contacts_export` wrong schema, CARRIED FORWARD/unresolved, `requiresEscalation`), §1.4
  (`IncrementalWatermarkField` semantic misuse, both incremental IOs, NEW this round). Two of the four are
  genuinely new findings this round (§1.1, §1.4); two are round-0 items that were only partially remediated
  (§1.2 at 2/15, §1.3 at the mechanical-half-only).
- `BijectionViolationsFound: 1` — the systemic `RelatedIntegrationObjectID`-set-but-`IsForeignKey`-unset
  defect (§1.1), counted once as a single systemic defect type (consistent with round 0's methodology of
  counting the `segments` placeholder defect as 1 despite it being a single-instance case). The
  `PaginationType`/`IncrementalWatermarkField` findings are hard-constraint evidence violations, not
  bijection-slot (capability-flag ↔ column) violations in the strict Phase-0-slot sense, so not counted here
  (same convention round 0 used for its own §1.2/§1.5 findings).
- `IndependentSourcesFetched: 1` — the cached `sources/openapi.json` (unchanged Tier-1 vendor spec since
  round 0's capture), queried via my own small `node -e` scripts, a different code path from both the
  producer's extraction scripts and the producer's `dual-derive-script.mjs`. No new network fetch was made
  (the cached spec is the vendor's canonical, unauthenticated source and is unchanged).
- `ReviewerErrors: 1` — the over-255-char `Description` false lead (§4.1), ruled out by checking the actual
  deployed baseline schema (`NVARCHAR(MAX)`, not `NVARCHAR(255)`) before flagging it.
- `RegressionDiffConfirmed: true` — re-confirmed via independent spot-checks in §3; no regression relative
  to `DEPRECATION_RECORD.md`'s named baseline items. The new gaps this round are net-new-build defects
  (the prior code connector had neither FK marking nor an `IncrementalWatermarkField` column to regress
  from).
- `DeployPreflight violations`: `[]`, as supplied — `preflight/env-preflight.json` in the referenced run
  reports an environment-reachability preflight (DB/MJAPI unreachable in this sandbox), not a schema/DDL
  preflight; it does not bear on any of the findings above, which were verified directly against the
  metadata file and the deployed baseline migration SQL.
```
