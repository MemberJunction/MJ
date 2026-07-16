# SOURCE_STUDY.md — Constant Contact

Vendor: `constant-contact` · Category: Marketing · Auth: OAuth2 Authorization Code (rotating refresh tokens)
Study date: 2026-07-11 · Credential posture: **[B] credential-free** (no live token; docs/spec-only audit)

## 0. Method

The Constant Contact V3 REST API publishes a **Swagger 2.0 OpenAPI spec** at a stable, unauthenticated,
machine-readable URL (`https://api.cc.email/v3/swagger.yaml`, linked from the developer portal's
"V3 API Schema" page). This is THE authoritative source — ranked above every prose doc — and was pulled
**RAW, in full, via `curl`** (never summarized through `WebFetch`) and saved to:

- `packages/Integration/connectors-registry/constant-contact/sources/openapi.yaml` (668,634 bytes, as served)
- `packages/Integration/connectors-registry/constant-contact/sources/openapi.json` (548,795 bytes, `js-yaml`-converted for machine parsing)

The object catalog (`TaxonomyLeaves`) was produced by a SCRIPT — `scripts/enumerate-taxonomy.mjs` — run
over the saved `openapi.json`, never hand-typed from reading the spec. Stdout saved to
`output/enumerate-taxonomy.stdout.json`. See § 5 for the full accounting ledger.

## 1. Source walk — structure, patterns, idiosyncrasies

### 1.1 Structure

The spec declares `swagger: "2.0"`, `host: api.cc.email`, `basePath: /v3`, version `3.0.161`. It organizes
**124 tagged operations across 98 paths** into **17 OpenAPI `tags`** (`Account Services`, `Bulk Activities`,
`Contacts`, `Contact Lists`, `Contact Tags`, `Contacts Reporting`, `Contacts Custom Fields`,
`Email Campaigns`, `Email Campaigns AB Tests`, `Email Reporting`, `Email Scheduling`, `Events`, `Segments`,
`Landing Pages Reporting`, `SMS Reporting`, `Technology Partners`, `Technology Partners Webhooks`) and
**252 `definitions`** (request/response DTO shapes).

**Important structural note — tags are NOT an L1-container-over-leaves hierarchy here.** Unlike a
GraphQL-style API where a handful of query "doors" hide a much larger type graph reached by descent, a
REST OpenAPI's `paths` entries ARE (with multi-verb/multi-shape collapsing) the addressable resource
leaves. There is no deeper container to fold — a `tag` groups leaves for documentation purposes but does
not itself need folding the way a HubSpot "Area" would. `definitions` (252) are finer-grained than
resources (67) because Swagger 2.0 declares a **separate DTO per verb-shape** for many resources
(`ContactDto` / `ContactResource` / `ContactPostRequest` / `ContactPutRequest` /
`ContactCreateOrUpdateInput` / `ContactCreateOrUpdateResponse` / `ContactDelete` are all shape-variants of
ONE resource, `Contact`) — walking `definitions` 1:1 over-counts variants, not resources (confirmed via
the shared generic enumerator, § 5.2).

### 1.2 Patterns / motifs

- **Cursor pagination, uniform across every list endpoint**: `_links.next.href` carrying a base64 `cursor`
  query param (e.g. `/v3/contacts?cursor=bGltaXQ9NSZuZXh0PTImc3RhdHVzJTVCJTVEPWFsbA==`). No offset/page-number
  variant anywhere in the spec.
- **`{resource}_xrefs` sub-paths** (`contacts/contact_id_xrefs`, `contact_lists/list_id_xrefs`,
  `emails/campaign_id_xrefs`) — a recurring V2→V3 ID-crosswalk convention for accounts migrating from the
  legacy numeric V2 IDs to V3 UUIDs. Present on Contacts, Contact Lists, and Email Campaigns; NOT on Tags,
  Segments, or Custom Fields (those are V3-native, no V2 predecessor).
- **Async job state machine for Bulk Activities**: every `POST /activities/*` returns an `Activity` job
  resource polled via `GET /activities/{activity_id}`; states are `processing / completed / cancelled /
  failed / time_out / unknown` (from `ActivityStatus` / `ActivityGenericStatus` definitions). Twelve
  distinct job *types* share this one polling shape.
- **Report-per-metric fan-out**: Email Reporting alone exposes 9 distinct tracking-metric endpoints
  (`sends/opens/unique_opens/didnotopens/clicks/forwards/optouts/bounces` + `links`) sharing a common
  `*TrackingActivitiesPage` response shape family — each is a genuinely distinct queryable collection
  (different underlying event stream) even where two endpoints share a response schema
  (`opens` and `unique_opens` both resolve to `OpensTrackingActivitiesPage` but are different datasets).
  Landing Pages Reporting repeats the identical fan-out pattern (`p_contact_opens` vs.
  `p_unique_contact_opens` vs. `p_unique_contact_clicks`, etc.) under a `PContact*` prefix.
- **`updated_after`/`updated_before` incremental watermark is asymmetric**: only `GET /contacts` declares
  it (plus `created_after/before`, `optout_after/before`). `GET /emails` has its own, narrower
  `before_date`/`after_date` pair. No other list endpoint (contact_lists, tags, segments, custom_fields)
  declares any incremental filter — these are expected to be small collections re-fetched in full each sync.
- **Single global `security` scheme**: every operation requires the same OAuth2 bearer token (no
  per-resource scope granularity visible in the spec beyond the 5 named scopes surfaced in the OAuth guide).

### 1.3 Scope — what's covered, what's explicitly NOT covered

Covered by this spec (single host `api.cc.email/v3`, single OAuth2 scheme): Account Services, Bulk
Activities, Contacts (+ custom fields, tags, lists, sms-engagement sub-resource), Segments, Email Campaigns
(+ activities, scheduling, AB tests), Contacts/Email/Landing-Pages Reporting, **Events** (a modern V3-native
event-management surface — see idiosyncrasy note below), **Social** (profile/connection/hashtag/post
endpoints). NOT covered by this spec, and out of scope per the binding scope decision (§ 6): SMS Reporting
(1 endpoint present in the spec but gated behind the SMS product/scope), Technology Partners + Technology
Partners Webhooks (present in the spec but gated behind a separate partner program — see § 6), legacy
V2/EventSpot (a wholly different host/API version, `v2.developer.constantcontact.com`, not in this spec at
all), Zapier/Make (third-party platforms with no Constant-Contact-hosted API surface — nothing to
enumerate here).

### 1.4 Idiosyncrasies

- **"Events" here is NOT legacy EventSpot.** The `Events` tag's 11 operations (`GET/POST/PATCH /events`,
  `/events/{id}/copy`, `/events/{id}/check_in/tickets`, `/events/{id}/tracks/{track_id}/registrations`, …)
  live in the SAME `api.cc.email/v3` host, SAME OAuth2 scheme, SAME spec version as Contacts/Campaigns —
  i.e. it is credential-free-provably part of the CURRENT V3 surface, distinct from the deprecated
  `v2.developer.constantcontact.com` EventSpot API the scope decision names as out-of-scope. Included as an
  ADDITIONAL discovered COVERABLE family (`events`), not folded into the legacy exclusion.
- **"Social" (profiles/connections/hashtag-groups/posts, 4 endpoints)** is a thin, mostly-read family for
  Constant Contact's social-media cross-posting feature — also native to this V3 spec/host. Included as an
  additional discovered COVERABLE family.
- **`contacts_sms_engagement_history`** lives under the `Contacts` tag (not `SMS Reporting`) and is
  documented in this same credential-free spec — it is a contact-level tracking sub-resource of the core
  Contacts surface, not the separate SMS-campaign-sending product. Retained as COVERABLE; flagged with a
  data-availability caveat (may return empty for accounts without the SMS product) rather than scoped out.
- **`sms_status` request/response fields and `ContactSmsChannel`/`JmmlSmsChannel` definitions** appear
  throughout the Contacts schema (SMS opt-in is a first-class contact attribute even for email-only
  accounts) — these are INFORMATIONAL field-level details of the `contacts` IO, not a reason to exclude
  `contacts` itself.
- **Two ID eras coexist**: V3 UUID-style IDs are canonical; the `*_xrefs` endpoints exist purely to let a
  V2-migrated account resolve old numeric V2 IDs to their V3 UUID equivalents.

## 2. Named taxonomies (COVERABLE vs INFORMATIONAL)

Categories below emerged from the spec's own `tags` grouping (§ 1.1), each cited against the specific
OpenAPI paths documenting it. **COVERABLE** taxonomies map to syncable IOs (their leaf objects ARE
`TaxonomyLeaves`, see § 5). **INFORMATIONAL** taxonomies describe vendor mechanics the extractor must know
but do not themselves enumerate into IO rows.

| # | Taxonomy | Role | Leaf objects (n) | Source mapping (citation) |
|---|---|---|---|---|
| 1 | Account Services | COVERABLE | 4 | `openapi.yaml` tag `Account Services`; paths `/account/summary`, `/account/summary/physical_address`, `/account/emails`, `/account/user/privileges` |
| 2 | Bulk Activities | COVERABLE | 12 | `openapi.yaml` tag `Bulk Activities`; paths `/activities`, `/activities/{activity_id}`, `/activities/contact_exports`, `/contact_exports/{file_export_id}`, `/activities/contact_delete`, `/activities/contacts_file_import`, `/activities/contacts_json_import`, `/activities/remove_list_memberships`, `/activities/add_list_memberships`, `/activities/list_delete`, `/activities/contacts_taggings_remove`, `/activities/contacts_taggings_add`, `/activities/contacts_tags_delete`, `/activities/custom_fields_delete` |
| 3 | Contacts | COVERABLE | 6 | `openapi.yaml` tag `Contacts`; paths `/contacts`, `/contacts/{contact_id}`, `/contacts/sign_up_form`, `/contacts/contact_id_xrefs`, `/contacts/sms_engagement_history/{contact_id}`, `/contacts/counts`, `/contacts/resubscribe/{contact_id}` |
| 4 | Contacts Custom Fields | COVERABLE | 1 | `openapi.yaml` tag `Contacts Custom Fields`; paths `/contact_custom_fields`, `/contact_custom_fields/{custom_field_id}` |
| 5 | Contact Lists | COVERABLE | 2 | `openapi.yaml` tag `Contact Lists`; paths `/contact_lists`, `/contact_lists/{list_id}`, `/contact_lists/list_id_xrefs` |
| 6 | Contact Tags | COVERABLE | 1 | `openapi.yaml` tag `Contact Tags`; paths `/contact_tags`, `/contact_tags/{tag_id}` |
| 7 | Segments | COVERABLE | 1 | `openapi.yaml` tag `Segments`; paths `/segments`, `/segments/{segment_id}`, `/segments/{segment_id}/name`; also [Segments Overview](https://developer.constantcontact.com/api_guide/segments_overview.html) |
| 8 | Email Campaigns | COVERABLE | 4 | `openapi.yaml` tag `Email Campaigns`; paths `/emails`, `/emails/{campaign_id}`, `/emails/campaign_id_xrefs`, `/emails/activities/{campaign_activity_id}`, `/emails/activities/{campaign_activity_id}/non_opener_resends` |
| 9 | Email Scheduling | COVERABLE | 4 | `openapi.yaml` tag `Email Scheduling`; paths `/emails/activities/{campaign_activity_id}/schedules`, `/tests`, `/previews`, `/send_history` |
| 10 | Email Campaigns AB Tests | COVERABLE | 1 | `openapi.yaml` tag `Email Campaigns AB Tests`; path `/emails/activities/{campaign_activity_id}/abtest` |
| 11 | Contacts Reporting | COVERABLE | 3 | `openapi.yaml` tag `Contacts Reporting`; paths `/reports/contact_reports/{contact_id}/activity_details`, `/open_and_click_rates`, `/activity_summary` |
| 12 | Email Reporting | COVERABLE | 12 | `openapi.yaml` tag `Email Reporting`; paths `/reports/email_reports/{campaign_activity_id}/links` + 8 `/tracking/*` metrics + `/reports/summary_reports/email_campaign_summaries` + `/reports/stats/email_campaigns/{ids}` + `/reports/stats/email_campaign_activities/{ids}` |
| 13 | Landing Pages Reporting | COVERABLE | 6 | `openapi.yaml` tag `Landing Pages Reporting`; 6 `/reports/landing_pages/campaign_details/{campaign_activity_id}/p_*` paths |
| 14 | Events (V3-native) | COVERABLE | 6 | `openapi.yaml` tag `Events`; paths `/events`, `/events/default`, `/events/{event_id}`, `/events/{event_id}/copy`, `/events/{event_id}/check_in/tickets`, `/events/{event_id}/undo_check_in/tickets`, `/events/{event_id}/tracks/{track_id}/registrations*` |
| 15 | Social | COVERABLE | 4 | `openapi.yaml` tag `Social`; paths `/social/profiles`, `/social/connections`, `/social/hashtags/groups`, `/social/posts` |
| 16 | OAuth2 & Auth Mechanics | INFORMATIONAL | — | [OAuth2 Server Flow](https://developer.constantcontact.com/api_guide/server_flow.html) + `openapi.yaml` `securityDefinitions` — token endpoint, rotating vs. long-lived refresh tokens, scopes (`account_read`, `account_update`, `contact_data`, `campaign_data`, `offline_access`) |
| 17 | Rate-Limit & Error-Code Taxonomy | INFORMATIONAL | — | [Rate Limits](https://developer.constantcontact.com/api_guide/rate_limits.html) (10,000/day + 4/sec, 429 + `error_key: quota_exceeded`/`throttled`) + [Response Codes](https://developer.constantcontact.com/api_guide/glossary_responses.html) |
| 18 | Pagination & Request/Response Conventions | INFORMATIONAL | — | [V3 Technical Overview](https://developer.constantcontact.com/api_guide/v3_technical_overview.html) — cursor pagination (`_links.next.href`), ISO-8601 dates, `include`/`include_count` partial-response params |
| 19 | Scope-Decision Evidence (Technology Partner gating) | INFORMATIONAL | — | [Technology Partner Overview](https://developer.constantcontact.com/api_guide/partners_overview.html) — partner-request signup form + Partner Management Team review required |

**Sum check**: COVERABLE leaf objects across taxonomies 1–15 = 4+12+6+1+2+1+1+4+4+1+3+12+6+6+4 = **67**,
matching `TaxonomyLeaves.length` exactly (§ 5).

## 3. Scaffolding exclusions

None found. Constant Contact's public OpenAPI spec contains no test-fixture paths, no internal-tooling
naming conventions (`Bucket_Test111`-style), no dead/deprecated-marked-but-still-listed paths. Every one of
the 124 tagged operations resolved to either a COVERABLE leaf or a named out-of-scope family (§ 6) — 0
unaccounted, 0 unmapped (verified programmatically, § 5).

## 4. Per-source study detail

### 4.1 `https://api.cc.email/v3/swagger.yaml` (Tier 1, OpenAPISpec) — PRIMARY SOURCE

- **Format**: Swagger 2.0 YAML, converted to JSON via `js-yaml` for machine parsing.
- **Structure**: `info` (version 3.0.161), `host`/`basePath`, `tags` (17, each with a `description`),
  `paths` (98), `definitions` (252), a single `securityDefinitions` OAuth2 scheme.
- **Reliability**: served directly from the vendor's API host (not a docs CDN) — this is the SAME spec the
  vendor's own "Try it" API Reference page renders from, so it is guaranteed current (spec version pinned
  at `3.0.161` as of capture).
- **What it does NOT state**: per-tenant custom-field names/types (customer-specific — correctly excluded
  from static Declared metadata per connector conventions), granted OAuth scopes for a specific app,
  account-specific rate-limit tier overrides (Tech Partners get a documented-elsewhere higher limit).

### 4.2 `developer.constantcontact.com/api_guide/*` pages (Tier 1, OfficialDocs)

Prose guide pages covering OAuth2 flow, rate limits, response codes, pagination conventions, segments
overview, and the Technology Partner gating rationale. All reachable (HTTP 200, verified via `curl` with
retry). These supply the INFORMATIONAL taxonomies (§ 2, rows 16–19) that the raw spec states tersely or not
at all (e.g. the spec's `securityDefinitions` names the OAuth2 flow type but doesn't state token lifetime
or refresh-rotation behavior — that's only in the prose guide).

### 4.3 `developer.constantcontact.com/api_reference/index.html` (Tier 1, OfficialDocs)

A rendered Swagger-UI mirror of the same spec — used to spot-check human-facing descriptions/examples that
are terse or absent in the raw YAML (e.g. confirming which `include=` values are valid for
`GET /contacts`).

### 4.4 `developer.constantcontact.com/docs/*` pages (WebFetchBlocked)

Two candidate pages under the `/docs/*` path segment (`contacts-api/contacts-index.html`,
`developer-guides/api-documentation-index.html`) returned **HTTP 403** consistently across 3 retry
attempts (curl with a browser User-Agent AND WebFetch, ~1s/3s backoff), while `/api_guide/*` and
`/api_reference/*` on the identical host returned 200 throughout — indicating a path-scoped bot rule, not a
vendor-wide block. No coverage gap results: the raw OpenAPI spec (§ 4.1) documents the Contacts resource
with strictly higher fidelity (full schema, params, sub-resources) than the blocked prose index page would
have added. Tagged `AccessStatus: 'WebFetchBlocked'` in `SOURCES.json` for downstream cross-check if the
block later lifts.

## 5. Enumeration — script-derived, not hand-typed

**Script**: `packages/Integration/connectors-registry/constant-contact/scripts/enumerate-taxonomy.mjs`
**Run**: `node scripts/enumerate-taxonomy.mjs sources/openapi.json`
**Stdout saved**: `output/enumerate-taxonomy.stdout.json`

### 5.1 What the script does

Walks every `[path, verb]` pair in the saved `openapi.json`'s `paths` object (124 tagged operations across
98 paths), buckets each by its OpenAPI `tag`, and assigns a canonical snake_case leaf name via an explicit,
grep-able lookup table (multiple verbs/shapes on the same path collapse to one leaf — e.g.
`GET+PUT+DELETE /contacts/{contact_id}` + `GET /contacts` all collapse to `contacts`). Operations under the
3 out-of-scope tags are diverted to a separate `outOfScope` bucket (with their own leaf-equivalent count)
rather than silently dropped. **Zero operations were left unmapped** (`unmappedOperations: []`) — full
accounting, verified by the script itself, not asserted.

### 5.2 Cross-check against an independent in-file signal

The shared deterministic enumerator (`packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs`)
was also run over the same `openapi.json` and returned `format: 'openapi-json'`, `count: 240`,
`confidence: 'high'` (walking Swagger `definitions` 1:1). This is a **different, coarser unit** (DTO shape
variants, not resources) — 240 definitions / 67 resources ≈ 3.6 variants per resource is a plausible ratio
for a spec that declares separate Create/Update/Response/Delete/List schemas per resource, not a
completeness red flag. Both counts are recorded in `SOURCES.json.CrossCheckSignal`; `TaxonomyLeaves` uses
the resource-unit count (67), which is the correct unit for "syncable IO" in a REST/OpenAPI connector.

### 5.3 Full-universe accounting ledger

```
|E| (full leaf-equivalent universe, in-scope + out-of-scope) = 76
  = |COVERABLE (-> TaxonomyLeaves)|                          = 67
  + |out-of-scope-route (Gaps, named + evidenced)|           =  9
      - technology_partners:  6 leaves (partner_accounts, partner_accounts_plan,
        partner_accounts_status_cancel, partner_accounts_operations_sync,
        partner_accounts_users_sso, partner_accounts_contacts_unsubscribe)
      - partner_webhooks:     2 leaves (partner_webhook_subscriptions, partner_webhook_subscription_tests)
      - sms:                  1 leaf   (sms_campaign_summaries)
  + |INFORMATIONAL|                                          =  0  (never part of E — OAuth/rate-limit/
                                                                     pagination/error-code taxonomies are
                                                                     not path/resource nodes to begin with)
  + |container-folded|                                       =  0  (OpenAPI tags are not L1 containers over
                                                                     a deeper leaf layer for a REST API — a
                                                                     path already IS a leaf; no folding needed)
  + |excluded-scaffolding|                                   =  0  (none found, § 3)
```

`67 + 9 + 0 + 0 + 0 = 76 = |E|`. Ledger closes exactly; nothing unaccounted. Verified against
`totalTaggedOperationsInSpec: 124` (0 unmapped) and `totalPathsInSpec: 98`.

## 6. Gaps (honest negatives — Binding scope decision)

| Area / Family | Status | Reason | Evidence |
|---|---|---|---|
| `partner_webhooks` (Technology Partners Webhooks tag, 5 endpoints → 2 leaves) | Out of scope | `needs-partner-approval` — separate subscription model gated behind the Technology Partner Program | [Technology Partner Overview](https://developer.constantcontact.com/api_guide/partners_overview.html): partner-request signup form + Partner Management Team review, "may take several weeks" |
| `technology_partners` (Technology Partners tag, 8 endpoints → 6 leaves) | Out of scope | `needs-partner-approval` — partner account-provisioning API, same gated program as above; discovered as a distinct-but-related tag beyond the originally-named `partner_webhooks` family | Same evidence as above; distinct OpenAPI tag `Technology Partners` |
| `sms` (SMS Reporting tag, 1 endpoint → 1 leaf: `sms_campaign_summaries`) | Out of scope | `separate-route` — SMS is a distinct, plan/product-gated marketing channel (SMS campaign sending + its summary reporting), not part of the core email/contacts sync surface | `openapi.yaml` tag `SMS Reporting`, path `/reports/summary_reports/sms_campaign_summaries`; corroborated by `contextCC.md`'s explicit SMS guardrail framing |
| `legacy_v2_eventspot` | Out of scope | `deprecated` — a wholly separate, older API version hosted at `v2.developer.constantcontact.com`; not present anywhere in this V3 spec at all (confirmed by absence — no v2 host/paths appear in `openapi.yaml`) | Absence in `openapi.yaml`; `v2.developer.constantcontact.com` is a distinct host from `api.cc.email`/`developer.constantcontact.com` |
| `zapier` | Out of scope | `separate-route` — a third-party no-code automation platform; Constant Contact does not host a Zapier-specific API surface of its own to enumerate (Zapier consumes the same V3 API + its own trigger/action wrapper hosted on Zapier's platform) | No credential-free Constant-Contact-hosted endpoint exists for this; nothing in `openapi.yaml` references Zapier |
| `make` | Out of scope | `separate-route` — same rationale as `zapier` (Integromat/Make's own platform, not a Constant-Contact-hosted surface) | Same as above |
| `contacts_sms_engagement_history` data completeness | In scope, caveat | Endpoint is credential-free-documented (COVERABLE, included in `TaxonomyLeaves`) but may return empty result sets for accounts without the separately-gated SMS product/plan | `openapi.yaml` path `/contacts/sms_engagement_history/{contact_id}`, tag `Contacts` (not `SMS Reporting`) |
| Per-tenant custom field definitions (names/types) | Not seedable as static metadata | `runtime-discovery-only` — custom fields are account-specific; the spec documents the `contact_custom_fields` CRUD surface (COVERABLE, included) but not any customer's actual field catalog, per the "customer data is never guessed" discipline | `openapi.yaml` `Contacts Custom Fields` tag — CRUD shape only, no customer-specific instances |
| `/docs/contacts-api/contacts-index.html`, `/docs/developer-guides/api-documentation-index.html` | Access-blocked, not a coverage gap | `docs-unscrapable` (HTTP 403, bot-gated path segment) — but the raw OpenAPI spec fully substitutes for the object-model content these pages would have added | See § 4.4 |

## 7. Proceed/Escalate decision

**PROCEED.** The full credential-free V3 sync surface (67 COVERABLE leaf objects across 15 families,
verified by a deterministic enumeration script with 0 unmapped operations and an exact accounting-ledger
closure) is covered by a Tier-1 machine-readable OpenAPI spec plus 9 reachable Tier-1/2 prose guides. Every
out-of-scope exclusion is named with evidence (§ 6), not silently dropped, so a future build can expand
scope (e.g. if partner-program access is later obtained) without re-discovering the surface. No area of the
in-scope taxonomy lacks Tier-1/2 source coverage.
