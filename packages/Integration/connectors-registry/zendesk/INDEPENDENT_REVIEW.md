# Independent Review — Zendesk connector metadata emission (Amendment round 4 re-review)

> **Charter note (verbatim, per v2 IndependentReviewer contract):** This review is a same-source
> LINT pass over the ioiof-extractor's output. It certifies enumeration coverage, bijection
> coherence, capability honesty vs. the brand study, and naming/evidence discipline against the
> same credential-free docs the producer used. It does **NOT** and **CANNOT** certify that paths
> are LIVE-correct, that pagination params actually advance, that declared PKs are populated in
> real records, that the watermark param is accepted, or that the write surface really exists.
> Those are the Reality Probe (S7) / T8 live-testing stage's job, downstream of this review. A
> green here is a LINT green, not a verification green.

**Mode**: slim — mechanical count-reconcile node scripts run over the metadata file + the two
already-fetched OAS sources (never parsed the full 47k/8k-line SDL text into context); a targeted
~15-object / ~200-field sample read directly from the metadata file; 2 fresh independent re-fetches
(`node -e` snippets reading `sources/*.json` directly) for the objects most in doubt this round.

**Read order observed**: `SOURCE_STUDY.md` → emission
(`metadata/integrations/zendesk/.zendesk.integration.json`) → prior round's own review content
(read only after the fresh expected-inventory scratch file below was written, per the
"don't let the producer's/prior reviewer's framing shape the inventory" rule) → no separate
`EXTRACTION_REPORT.md` exists in this registry variant; `SOURCE_STUDY.md` fills that role, as
noted by round 3.

**Expected inventory scratch file** (written from `SOURCE_STUDY.md` before opening the emission or
any prior review content):
`/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/d2f95e02-231a-4c88-8553-af0102520379/scratchpad/zendesk_reviewer_expected_r4.txt`

---

## 0. Regression check — round 3's 2 Confirmed Gaps (Blocking), re-verified fixed

| Gap (round 3) | Fix required | Current state (script-verified, fresh this round) | Status |
|---|---|---|---|
| Gap 1 — root `Integration.CredentialTypeID` / `ImportPath` missing | Set `CredentialTypeID = @lookup:MJ: Credential Types.Name=Basic Auth`, `ImportPath = @memberjunction/connector-zendesk` | Both present in `root.fields`; `Description` also now set. `PROVENANCE.json` carries one `ExplicitStatement`/Tier-1 entry per field (`integration.CredentialTypeID`, `integration.ImportPath`, `integration.Description`) — re-grepped, non-zero this round (was zero-hit in round 3). | **FIXED** |
| Gap 2 — `help_center_categories`/`article_comments`/`post_comments.PaginationType` asserted `Cursor` with zero/contradicting evidence | `Cursor`→`None`, `SupportsPagination` true→false, `DefaultPageSize` 100→null, for all 3 | All 3 objects now `{PaginationType:"None", SupportsPagination:false, DefaultPageSize:null}` — **independently re-confirmed this round** by re-fetching `sources/helpcenter-oas.json` myself: `GET /api/v2/help_center/categories` has `parameters:[sort_by,sort_order]` only (no page/cursor), `CategoriesResponse` has only a bare `categories` array property; same shape for the two comments endpoints (`parameters:[]`, bare-array response). All three true siblings (`/help_center/sections`, `/help_center/articles`) have the identical shape and are correctly `None`. Fix matches the source exactly. `CODE_EVIDENCE.json` carries a `ScriptPath: scripts/amend-round4.mjs` entry per object. | **FIXED** |

Both round-3 blocking gaps are correctly and completely applied. Regression check: `amend-round4.mjs`
touches ONLY the 3 flagged objects (confirmed by reading the script — it errors out via
`console.error`+`process.exit(1)` if any of the 3 named IOs is missing, and only ever mutates rows
keyed by the `FLAGGED` array); the `CredentialTypeID`/`ImportPath`/`Description` fix was applied via
a separate path (not in `amend-round4.mjs` — likely direct `mj-metadata` MCP calls per convention).
No double-write or conflicting state observed: I independently re-ran the full 99-IO / 1181-IOF
bijection sweep (below) and every count matches round 3's reported numbers exactly, so the two
fixes landed cleanly with no side effects on the other 96 objects.

---

## 1. Confirmed gaps

### Gap 1 (NEW, Advisory) — 3 Skill-Based-Routing objects have a real, OAS-confirmed incremental-export capability that `SOURCE_STUDY.md` itself documents, but the emission (both the IO flags and the root `Configuration.IncrementalSyncCapability` block) omits it

`SOURCE_STUDY.md` §1.1(d) explicitly lists the incremental-export family as covering `tickets, users,
organizations, ticket_events, ticket_metric_events, custom_objects/{key}/cursor, routing/attributes,
routing/attribute_values, routing/instance_values` — and §5 repeats: "`routing_attributes`/
`routing_attribute_values`/`routing_instance_values`" under "Applies to:". I independently re-fetched
`sources/ticketing-oas.json` and confirmed all three endpoints are real:

- `GET /api/v2/incremental/routing/attributes`, `GET /api/v2/incremental/routing/attribute_values`,
  `GET /api/v2/incremental/routing/instance_values` all exist, all resolve to the same
  `IncrementalSkillBasedRouting` response schema (`attribute_values[]`, `attributes[]`,
  `instance_values[]`, `count`, `end_time`, `next_page`) — a genuine time-based watermark shape
  (`end_time`, unix epoch of the last record, "feed as the NEXT request's `start_time`" — the exact
  `timeBasedLegacy` mechanism already documented elsewhere in this same metadata file's
  `Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy`).
- The operation's structured `parameters` array is empty, but the `description` prose explicitly
  documents an optional `cursor` parameter ("a non-human-readable argument you can use to move
  forward or backward in time... only available in API responses") — a real, Tier-1
  (`OpenAPISpec`/prose-in-description) signal, not a guess.

Yet:
- The emitted `routing_attributes`, `routing_attribute_values`, `routing_instance_values` IOs all
  have `SupportsIncrementalSync: false` / `IncrementalWatermarkField: undefined`.
- The root `Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy.endpoints` list
  (which DOES enumerate `ticket_events`/`ticket_metric_events`/`organizations` — the sibling
  time-based-legacy family) omits all three routing incremental paths entirely, even though
  `SOURCE_STUDY.md`'s own prose lists them in the same family in the same paragraph.

This is a genuine, source-evidenced miss between the producer's own `SOURCE_STUDY.md` claim (backed
independently by the OAS) and both (a) the `Configuration` documentation block and (b) the per-IO
capability flags for the same three objects.

**Why Advisory, not Blocking**: (1) this is a sync-EFFICIENCY capability, not a write-capability or
enumeration-coverage defect — all three objects ARE emitted and ARE fully syncable via a plain,
already-correct full pull (`PaginationType: None`); nothing is silently dropped or misrepresented as
unsupported-when-supported in the write-capability sense the GZ #30 rule targets. (2) The three
incremental endpoints share ONE combined response schema regardless of which of the three URLs is
called (`attributes`+`attribute_values`+`instance_values` all returned together from any of the
three), which is a genuinely non-trivial connector-implementation shape (one fetch feeding three IOs)
that a later connector-authoring pass, not a metadata-extraction pass, should resolve — deferring it
is a defensible call, not silently dropping documented data. (3) Skill-based-routing config objects
are low-cardinality account configuration, not high-volume ticket-scale data, so the operational cost
of missing this optimization is low. Flagging it so it isn't lost, not blocking the build on it.

**Severity: Advisory.**

---

## 2. Judgment calls

### Call 1 (carried forward, unaffected this round) — soft-FK back-edge demotion to break the dense forward-reference cycle

Unchanged from rounds 2/3: 33 fields carry `Configuration.FKForm: "soft"` + `FKDemotedReason` citing
the dense-forward-ref-graph guidance in `metadata-file-conventions.md`. I would reach for the same
tool given the same cyclic FK graph (tickets↔ticket_forms, tickets↔brands, etc.). Whether the
not-yet-written connector code re-derives these soft targets at runtime is a later-phase concern.
Both source-grounded; not a gap.

### Call 2 (carried forward, unchanged) — `ticket_fields.sub_type_id` soft-FK to `tickets` remains a plausible-but-unescalated false positive

Description reads like a small enum/flag ("For system ticket fields of type 'priority' and
'status'... A 'priority' sub type of 1 removes the 'Low' and 'Urgent' options...", `Type: int`), not
obviously a reference to a `tickets` record. Not re-escalating for the same reason three prior rounds
haven't: the description doesn't unambiguously rule out a real relationship.

### Call 3 (carried forward) — `ticket_events` counted in the 99 but never itemized as its own row in any `SOURCE_STUDY.md §4` table

Still true this round (unchanged doc, unchanged emission): the document's own §4 table rows sum to
98 by direct count, `ticket_events` is real and correctly emitted as the 99th, but only named in
prose (§1.1/§5), never given its own §4 table row. A `SOURCE_STUDY.md` bookkeeping cosmetic, not an
extraction defect — I'd fix the doc, not the emission.

### Call 4 (NEW) — `macro_categories` modeled as a single scalar field (`category`, marked PK) rather than a richer object

Independently re-fetched `sources/ticketing-oas.json`: `GET /api/v2/macros/categories`'s response
schema (`MacroCategoriesResponse`) is genuinely `{ categories: string[] }` — an array of bare
strings, not objects with an `id`/`name` pair. The producer's one-field `category` (marked
`IsPrimaryKey=true`, using the string value itself as identity) is a defensible, source-faithful
representation of an unusually-shaped endpoint (most Zendesk list endpoints return arrays of
objects; this one is a genuine outlier). I'd model it the same way. Not a gap — flagging because it
looked suspicious (fieldCount=1) before I checked the source.

---

## 3. Reviewer errors

### RE-1 — Suspected a Type-mismatch defect on `custom_objects.created_by_user_id`/`updated_by_user_id` (typed `string`, FK to `users` whose PK is `int`); source-checking cleared it

On first read, a scalar FK field typed `string` pointing at an `int`-PK'd target looked like a
plausible type-coercion bug. Re-fetching `sources/ticketing-oas.json`'s `CustomObject` schema showed
`created_by_user_id`/`updated_by_user_id` are BOTH explicitly declared `"type": "string"` in the
vendor's own OAS (despite the description reading "Id of a user...") — the emission's `Type: string`
is a faithful transcription of the source's own (admittedly odd) declared type, not a producer error.
Per the governing "read from the source's model, never guess from a template" rule, the correct
behavior is exactly what was emitted: reflect what the OAS says, not what the field name implies it
"should" be. Retracted before inclusion in §1.

### RE-2 — Suspected `article_comments`/`help_center` objects' `created_at`/`updated_at` typed `string` instead of `datetime` was an inconsistency with `tickets`/`organizations`; source-checking cleared it

Re-fetching both OAS files: `TicketObject.created_at` carries `"format": "date-time"` in
`ticketing-oas.json` (→ correctly mapped `datetime`), while `CommentObject.created_at` in
`helpcenter-oas.json` carries no `format` hint at all (→ correctly mapped `string`). The
Ticketing and Help Center OAS files are simply typed with different precision by the vendor itself
— the emission correctly reflects each file's own declared type per-object rather than applying a
uniform assumption. Not a defect. Retracted before inclusion in §1.

---

## Bijection check (`phase0-slots.json`) — this round, re-verified from scratch via fresh node scripts

- `SupportsCreate=true` ⇒ non-null `CreateAPIPath` + `CreateMethod`: **0 violations** (63/99 IOs).
- `SupportsUpdate=true` ⇒ non-null `UpdateAPIPath` + `UpdateMethod`: **0 violations** (52/99 IOs).
- `SupportsDelete=true` ⇒ non-null `DeleteAPIPath` + `DeleteMethod`: **0 violations** (63/99 IOs);
  `DeleteMethod` domain checked — 100% `DELETE` (no soft-delete-via-POST observed in-spec, matching
  `SOURCE_STUDY.md` §5).
- `CreateBodyShape`/`UpdateBodyShape` domain: **100% `wrapped`**, all with a non-null `BodyKey` — 0
  violations. `Create/Update/DeleteIDLocation` domain: **only `{body, path}`** observed, both valid
  members of `{body, header, n/a, path}` — 0 violations.
- `SupportsIncrementalSync=true` ⇒ non-null `IncrementalWatermarkField` naming a field present on
  the object's own field list: **0 violations** across the 6 flagged IOs (`custom_object_records`→
  `updated_at`, `organizations`→`updated_at`, `ticket_events`→`time`, `ticket_metric_events`→`time`,
  `tickets`→`updated_at`, `users`→`updated_at`). (See §1 Gap 1 for 3 additional objects that arguably
  *should* be flagged but are honestly `false` rather than falsely `true` — the bijection direction
  this check enforces is not violated.)
- Zero-field IOs: **0 of 99** (re-confirmed via fresh script). Enumeration coverage: emitted IO set
  (99) == `output/zendesk-taxonomy-leaves-final.json` (99 leaves) — **zero diff, both directions**
  (nothing in leaves-not-emitted, nothing emitted-not-in-leaves). All 16 informational/folded/
  excluded-artifact names (`reason`, `session`, `satisfaction_rating`, `ticket_metric`, `columns`,
  `followup_source_ids`, `fulfilled_ticket_ids`, `expected_cnames`, `results`, `actions`,
  `requirements`, `job_statuses`, `clients`, `global_clients`, `tokens`, `locales`) — **0 leaked in**
  as IOs.
- IOs with zero `IsPrimaryKey=true` fields: **1** (`compliance_deletion_statuses`) — re-confirmed
  honest via fresh field dump: `account_subdomain, action, application, created_at, executer_id,
  user_id` — none unique/identifying. Correct to leave unset.
- FK target existence + qualifier correctness: **83 hard `@lookup` FKs, 0 unresolvable target
  names, 0 mis-qualified lookups** (100% use `&IntegrationID=@parent:IntegrationID`, never the wrong
  `@parent:ID`) + **33 soft-FK markers** = **116 total FK-bearing fields**, matching round 3 exactly
  — confirms the round-4 pagination-only amendment didn't perturb the FK graph.
- `PaginationType` enum-domain: **0 violations** — only `{None: 64, Cursor: 30, Offset: 5}` observed,
  all valid members of `{None, Cursor, Offset}`.
- Capability honesty (GZ #30 class): `SupportsWrite`-equivalent (`SupportsCreate`) true on 63/99 IOs
  with full per-operation paths+methods+body-shape+ID-location; `Configuration.WriteCapability`
  present and accurate (`supported:true`, batch `_many` surface documented). Not a
  pull-only-for-a-write-capable-vendor defect — the round-3 blocking gap (missing
  `CredentialTypeID`/`ImportPath`, which would have made this moot by blocking provisioning
  entirely) is now fixed, so "capability-honest at the IO level" now also means "deployable" at the
  Integration level.

## Stats

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 1,
  "JudgmentCalls": 4,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 2,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/zendesk/INDEPENDENT_REVIEW.md",
  "FixInstructions": [
    {
      "slot": "io.routing_attributes.SupportsIncrementalSync",
      "operation": "set",
      "before": false,
      "after": true,
      "evidence": "sources/ticketing-oas.json: GET /api/v2/incremental/routing/attributes exists, returns IncrementalSkillBasedRouting schema with end_time (unix epoch) + next_page + optional cursor param (prose-documented in operation description); SOURCE_STUDY.md §1.1(d)/§5 already lists routing/attributes under the incremental-export family",
      "rationale": "Documented incremental capability (both by independent OAS re-fetch and by the producer's own SOURCE_STUDY.md) omitted from the IO flag and from Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy.endpoints. Advisory, not blocking: requires a connector-implementation decision for a shared multi-object response schema, not a mechanical metadata edit alone -- recommend routing to the connector-authoring phase with this evidence rather than a pure metadata patch.",
      "requiresEscalation": true
    },
    {
      "slot": "io.routing_attribute_values.SupportsIncrementalSync",
      "operation": "set",
      "before": false,
      "after": true,
      "evidence": "sources/ticketing-oas.json: GET /api/v2/incremental/routing/attribute_values (same IncrementalSkillBasedRouting schema)",
      "rationale": "Same defect class as routing_attributes",
      "requiresEscalation": true
    },
    {
      "slot": "io.routing_instance_values.SupportsIncrementalSync",
      "operation": "set",
      "before": false,
      "after": true,
      "evidence": "sources/ticketing-oas.json: GET /api/v2/incremental/routing/instance_values (same IncrementalSkillBasedRouting schema)",
      "rationale": "Same defect class as routing_attributes",
      "requiresEscalation": true
    },
    {
      "slot": "integration.Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy.endpoints",
      "operation": "set",
      "before": ["/api/v2/incremental/tickets","/api/v2/incremental/users","/api/v2/incremental/organizations","/api/v2/incremental/ticket_events","/api/v2/incremental/ticket_metric_events"],
      "after": ["/api/v2/incremental/tickets","/api/v2/incremental/users","/api/v2/incremental/organizations","/api/v2/incremental/ticket_events","/api/v2/incremental/ticket_metric_events","/api/v2/incremental/routing/attributes","/api/v2/incremental/routing/attribute_values","/api/v2/incremental/routing/instance_values"],
      "evidence": "sources/ticketing-oas.json (3 additional incremental/routing/* GET endpoints, same IncrementalSkillBasedRouting response schema, end_time watermark)",
      "rationale": "Bring the root Configuration documentation block into agreement with SOURCE_STUDY.md's own §1.1(d)/§5 claims and the actual OAS.",
      "requiresEscalation": false
    }
  ]
}
```
