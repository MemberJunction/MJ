# Zendesk — Source Study

Audited: 2026-07-03. See `SOURCES.json` for the ranked source list this study documents.

## 0. Executive summary

Zendesk publishes a **real, generator-grade OpenAPI 3.0 contract** for its two primary in-scope
products — **Support/Ticketing** (`ticketing-oas.yaml`, 1.65 MB / 47,152 lines / 427 paths / 556
component schemas) and **Help Center/Guide** (`helpcenter-oas.yaml`, 278 KB / 8,456 lines / 116
paths / 69 component schemas). Both were downloaded IN FULL, in code, via the vendor's own
"Download OpenAPI file" links and are saved verbatim under `sources/`. These specs are the source
the vendor's own hosted API reference is generated from — the highest-authority credential-free
artifact available, ranked Tier 1 / `OpenAPISpec` above every prose page.

A deterministic enumeration script (`scripts/enumerate-zendesk-catalog.mjs`) walks both specs'
`paths` for every GET list endpoint, resolves the top-level array property in its 200 response (the
vendor's own `ResponseDataKey`), and treats the array's item schema as one coverable record type. A
second pass recovered **3 objects silently merged by a same-name cross-file collision** (see
§2 Ledger) and **2 objects real in the vendor's product but absent from the downloaded OAS**
(Business Hours Schedules + Holidays — an OAS-generator coverage gap, confirmed via prose docs).

**Final `TaxonomyLeaves` = 99 COVERABLE objects.** Every hard claim below (APIPath, ResponseDataKey,
PaginationType, numeric `id` PK, scalar FK fields, write-endpoint shape) is read directly from the
saved OAS JSON/YAML in code — nothing here is guessed or carried over from vendor familiarity.

## 1. Sources studied (full detail)

### 1.1 `sources/ticketing-oas.yaml` / `.json` — Zendesk Support (Ticketing) API OpenAPI spec — **Tier 1, primary**

- **Origin**: `https://developer.zendesk.com/zendesk/oas.yaml`, linked as "Download OpenAPI file" from
  the Ticketing API introduction page (`https://developer.zendesk.com/api-reference/ticketing/introduction/`).
  This IS the generator source for `https://developer.zendesk.com/api-reference/ticketing/*` — editing
  this file is how Zendesk itself publishes the hosted reference, per the "OpenAPI specification" guide
  page pattern used across Zendesk's docs platform.
- **Format**: OpenAPI 3.0.3. 427 `paths`, 556 `components.schemas`, 95 tags.
- **Structure**: one `tag` per functional area (Tickets, Users, Organizations, Groups, Macros,
  Triggers, Automations, Views, Custom Objects, Custom Roles, SLA Policies, IT Asset Management,
  Task Lists, Approval Requests, OAuth Clients/Tokens, Audit Logs, ...). Each tag's operations are
  documented individually (list/show/create/update/delete + specialized actions like `/merge`,
  `/mark_as_spam`, `/redact`). Every request/response schema is a named `components.schemas` entry;
  list endpoints wrap their array under a plural key matching the resource name
  (`{"tickets": [...], "meta": {...}, "links": {...}}` for cursor-paginated endpoints;
  `{"tickets": [...], "next_page": "...", "count": N}` for legacy offset).
- **Motifs**: (a) singular-wrapped body for single-record create/update (`{"ticket": {...}}`,
  `{"user": {...}}`) — confirmed via `TicketCreateRequest`/`TicketResponse` schema inspection: POST
  body is `{ticket: TicketObject}`, 201 response is `{ticket: TicketObject}` (id in
  `body.ticket.id`); (b) `_many` batch endpoints (`create_many`, `update_many`, `destroy_many`,
  `show_many`) alongside every core resource's single-record CRUD — a real, spec-declared bulk-write
  surface; (c) a **Dual Pagination** convention: a single deepObject query parameter named `page`
  (component `DualPaginationPage`) accepts EITHER `?page=N` (legacy integer offset) OR
  `?page[after]=<cursor>&page[size]=<n>` (JSON:API-style cursor) — mutually exclusive per request;
  newer endpoints use a cursor-ONLY variant (`CursorPaginationPage`, no offset fallback); (d) a
  parallel **Incremental Export** family under `/api/v2/incremental/*` (`tickets`, `users`,
  `organizations`, `ticket_events`, `ticket_metric_events`, `custom_objects/{key}/cursor`,
  `routing/attributes`, `routing/attribute_values`, `routing/instance_values`) seeded by a Unix-epoch
  `start_time` query param and continued via an opaque `cursor` param — this is the true
  bulk-sync/watermark mechanism, DISTINCT from list-endpoint cursor pagination.
- **Scope — explicitly covered**: Tickets + full lifecycle (comments, audits, metrics, forms,
  fields, statuses, skips, content pins, suspended, deleted), Users + identities + sessions +
  compliance status, Organizations + memberships + fields + subscriptions, Groups + memberships,
  Skill-Based Routing (attributes/instance values), Omnichannel Routing Queues, Business Rules
  (Macros/Triggers/Automations/Views), SLA Policies (account + per-group), Custom Roles, Custom
  Ticket Statuses, Custom Objects (+ fields/records/attachments/permissions), Tags, Brands (+
  brand-agent assignment), Dynamic Content, Targets (+ failure log), Satisfaction Ratings/Reasons,
  Sharing Agreements, Support Addresses, Email Notifications, Audit Logs, Deletion Schedules
  (GDPR), Bookmarks, Saved Searches, Resource Collections, OAuth Clients/Tokens (admin), Remote
  Authentications (SSO config), Task Lists + Templates, Approval Requests, IT Asset Management
  (assets/types/fields/locations/statuses), Activity Stream, Locales, Job Statuses, X/Twitter
  channel config, Workspaces, Search.
- **Scope — explicitly NOT covered (confirmed by absence + cross-checked against product docs)**:
  Chat, Talk (Voice), Sell (Sales CRM), Explore (Analytics/BI), Sunshine Conversations/Messaging, AI
  Agents/Answer Bot, Web Widget/Mobile SDK embeddables, Webhooks/Apps Framework/Integration Services
  (extension mechanisms, not sync data). See §6 Out-of-scope.
- **Idiosyncrasy / OAS-generator gap (important)**: **Business Hours Schedules** (`/api/v2/business_hours/schedules`
  + `/holidays` + `/intervals`) is a real, fully-CRUD, currently-documented Zendesk endpoint family —
  confirmed via `https://developer.zendesk.com/api-reference/ticketing/ticket-management/schedules/`
  — but it does **NOT appear anywhere in the downloaded OAS** (`grep -i "business_hours"` against
  the full 47,152-line file returns zero matches outside the unrelated `deletion_schedule` term).
  This is a genuine gap in Zendesk's OAS-generator migration, not a scope decision on our part.
  Captured via the prose doc page instead (Tier 1 `OfficialDocs`), flagged explicitly in §2.

### 1.2 `sources/helpcenter-oas.yaml` / `.json` — Zendesk Help Center (Guide) API OpenAPI spec — **Tier 1, primary**

- **Origin**: `https://developer.zendesk.com/help_center/oas.yaml`, linked from
  `https://developer.zendesk.com/api-reference/help_center/help-center-api/introduction/`.
- **Format**: OpenAPI 3.0.2. 116 `paths`, 69 `components.schemas`, 18 tags.
- **Structure**: mirrors the Ticketing spec's conventions (wrapped bodies, tag-per-resource). Two
  parallel URL families for the same content resources: a **locale-scoped** family
  (`/api/v2/help_center/{locale}/articles`, `.../categories`, `.../sections`) for the classic
  multi-locale content model, and a **locale-less canonical** family
  (`/api/v2/help_center/articles`, `/api/v2/help_center/categories`) that operates on the
  account's default/source locale — both real, both kept (canonical family used as each object's
  primary `APIPath`; the locale-scoped family recorded as an access-path variant).
- **Motifs**: Articles/Sections/Categories form a 3-level content hierarchy (Category → Section →
  Article), each individually paginated and independently writable; a parallel **Community** module
  (Posts/Topics/Post-Comments/Votes) with its own comment+vote sub-resources; **Translations** as a
  per-locale child of Articles/Sections/Categories; **Content Subscriptions** (article/section
  follow) vs. **User Subscriptions** (a user's own subscription list) as genuinely distinct
  resources despite similar naming.
- **Scope — explicitly covered**: Articles + attachments + labels + translations + comments, Article
  Categories + Sections, Community Posts + Topics + Comments + Votes, User Segments, Content/User
  Subscriptions, Service Catalog Items, Help Center Search/Deflection (informational — see §3),
  Help Center Sessions.
- **Scope — explicitly NOT covered**: Anything ticketing-side (tickets/users-as-agents/groups) —
  Help Center's `users` concept (end-users browsing the portal) is a VIEW over the same underlying
  Support `users` object, not a separate user model; no separate Help Center "user" IO is emitted.

### 1.3 Zendesk Public API Postman workspace — **Tier 2, corroborating (not fully retrievable credential-free)**

- **Origin**: `postman.com/zendesk-redback/zendesk-public-api` — Zendesk's own maintained public
  workspace, linked via "Run in Postman" buttons throughout the API reference. Explicitly documented
  to cover "all Zendesk APIs except Sell and Sunshine Conversations."
  ([Exploring Zendesk APIs with Postman](https://developer.zendesk.com/documentation/api-basics/getting-started/exploring-zendesk-apis-with-postman/))
- **Access**: the Collection Web View HTML (`god.gw.postman.com/run-collection/...`) returns 200 and
  is browsable; the raw collection JSON export requires a Postman API key
  (`api.getpostman.com/collections/{id}` → `401 AuthenticationError: Invalid API Key`), which is a
  credential-gated path out of scope for this audit. Retained as a Tier-2 corroborating reference,
  superseded in authority by the OpenAPI spec (same generator source, fully retrieved).

### 1.4 Prose documentation pages — **Tier 1, supplementary (mechanics + the one OAS gap)**

Used narrowly, only where the OAS itself doesn't state the mechanic explicitly or (in the Schedules
case) doesn't cover the endpoint at all:
- Pagination (cursor mechanics — `page[after]`/`page[before]`/`page[size]` + `meta.after_cursor`/
  `before_cursor` + `links.next`/`previous`): confirms and cross-references the in-spec parameter
  prose (both agree).
- Incremental Export (start_time seed + cursor continuation, 60-second minimum lookback, `[DELETED]`
  tombstone value convention): confirms and cross-references in-spec descriptions (both agree).
- Rate Limits (per-endpoint overrides like Audit Log CSV export = 1/min, Search = 5/min beyond page
  100, job-queue limits): cross-references the in-spec per-endpoint "Rate Limit" prose blocks found
  throughout the OAS (both agree — the OAS embeds the same rate-limit prose per operation).
- **Schedules** (`/api-reference/ticketing/ticket-management/schedules/`): the ONLY case where prose
  docs are the sole source for a COVERABLE object, because the OAS omits this endpoint family
  entirely (§1.1 gap).

## 2. Enumeration methodology + full accounting ledger (mechanical, not recited)

### 2.1 Mechanical anchor — shared floor enumerator (`enumerate-catalog.mjs`)

```
node packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs \
  packages/Integration/connectors-registry/zendesk/sources/ticketing-oas.json \
  packages/Integration/connectors-registry/zendesk/sources/helpcenter-oas.json
```
`EnumerationStdoutCount = 622` (format `openapi-json`, confidence `high`; per-source: ticketing=553,
help-center=69). This is every `components.schemas` entry shaped as an object across both files —
the raw schema-count anchor. A second, independent full scan (part of the vendor-specific script
below) counted the union of schema names slightly differently (enum-schema handling) and got **625**
— the two independent counts agree to within 0.5% (3 schemas), confirming neither enumeration is
silently dropping a meaningful chunk of the schema universe.

### 2.2 Schema-level ledger (why 622/625 ≠ the coverable-object count)

For a REST/OpenAPI vendor, a raw `components.schemas` count over-states the resource universe: most
schemas are **shapes OF** a resource (its create-request body, its response envelope, an error
shape), not independent syncable tables. `scripts/enumerate-zendesk-catalog.mjs` (written for this
audit) walks every GET list endpoint, resolves its 200 response's top-level array property (the
vendor's own `ResponseDataKey`), and classifies every schema in the file by role:

```
node packages/Integration/connectors-registry/zendesk/scripts/enumerate-zendesk-catalog.mjs \
  packages/Integration/connectors-registry/zendesk/sources/ticketing-oas.json \
  packages/Integration/connectors-registry/zendesk/sources/helpcenter-oas.json
```

| Bucket | Count | What it is |
|---|---|---|
| **totalSchemas** | 625 | every `components.schemas` entry, both files, union |
| consumedAsLeafItemType | 101 | schemas that ARE a list endpoint's array-item type (a real resource) |
| requestWrapper | 66 | `*Request` / `*CreateMany` / `*UpdateMany` body-shape schemas (not independent) |
| responseWrapper | 273 | `*Response` / envelope schemas (not independent) |
| paramOrErrorOrMisc | 185 | query-param objects, error shapes, shared sub-object fragments |

`625 = 101 + 66 + 273 + 185` — every schema accounted for, none silently dropped.

### 2.3 Resource-grain ledger (raw list-endpoint leaves → `TaxonomyLeaves`)

The raw list-endpoint walk yielded **110** distinct `ResponseDataKey`-derived leaves. Two corrections
were required before this was trustworthy:

1. **Cross-file name collision (silent-merge defect, caught and fixed)** — the naive walk keys
   leaves by `ResponseDataKey` across BOTH files; 4 keys exist in both specs
   (`categories`, `comments`, `locales`, `results`). Two of these hid a **genuinely distinct,
   CRUD-capable object silently merged away**:
   - `categories` → Macro Categories (`/api/v2/macros/categories`, Ticketing OAS) SILENTLY WON over
     Help Center Categories (`/api/v2/help_center/categories`, Help Center OAS — POST/PUT/DELETE-capable,
     a real 3-level content hierarchy root). **Recovered as `help_center_categories` (distinct from
     `macro_categories`).**
   - `comments` → Ticket/Request Comments (Ticketing OAS) SILENTLY WON over Help Center Article
     Comments (`/api/v2/help_center/articles/{article_id}/comments`, CRUD-capable) AND Community Post
     Comments (`/api/v2/community/posts/{post_id}/comments`, CRUD-capable). **Recovered as
     `article_comments` and `post_comments`** (both distinct schemas from ticket comments — verified
     via each endpoint's own path + tag: "Article Comments" / "Post Comments" vs. "Ticket Comments").
   - `locales` and `results` collided too, but both sides in both cases are INFORMATIONAL/excluded
     (§2.4) regardless of which side "won" — no coverable object was lost.
   - **+3 recovered objects.**
2. **OAS-generator gap (Business Hours Schedules)** — real, documented, fully-CRUD, but absent from
   the downloaded OAS (§1.1). **+2 objects** (`schedules`, `schedule_holidays`) added from Tier-1
   prose docs, each with a citation in `SOURCES.json`/`PROVENANCE` rather than OAS `CODE_EVIDENCE`.

**R (total raw resource candidates) = 110 + 3 + 2 = 115.**

From R, four categories of REMOVAL, each named with evidence (the full mechanical accounting the
audit is required to close):

| Bucket | Count | Members (evidence) |
|---|---|---|
| **container-folded** | 4 | `reason`→`satisfaction_reasons` (single-record GET variant of the same list, `/api/v2/satisfaction_reasons/{id}` vs `/api/v2/satisfaction_reasons`); `session`→`sessions` (`/api/v2/users/me/session` singular vs `/api/v2/sessions` canonical); `satisfaction_rating`→`satisfaction_ratings` (same pattern); `ticket_metric`→`ticket_metrics` (same pattern). Each fold is a single-record access-path of an already-counted object, not a new resource. |
| **excluded-heuristic-artifact** | 5 | `columns` (an embedded array FIELD inside the single-record `GET /api/v2/views/{id}` response, not an independent list endpoint — the heuristic matched the first array property in a non-list schema); `followup_source_ids` (computed relationship IDs returned by `GET /tickets/{id}/related`, part of the Ticket object, not a stored resource); `fulfilled_ticket_ids` (ephemeral diagnostic output of `GET /routing/requirements/fulfilled`); `expected_cnames` (ephemeral DNS-check diagnostic output of `GET /brands/check_host_mapping`); `results` (ephemeral AI-deflection search-suggestion output of `GET /help_center/deflection/suggestions`, not stored data). None of these have their own identity/PK — they are computed/diagnostic response shapes, not syncable tables. |
| **INFORMATIONAL** | 7 | `actions` (macro/trigger/automation action-TYPE vocabulary, not per-tenant data); `requirements` (password-policy config, singleton-shaped); `job_statuses` (async job-polling, operational/ephemeral); `clients`, `global_clients`, `tokens` (OAuth Client/Token admin management — API-access administration, not customer-service business data); `locales` (reference vocabulary of available translation locales). See §3 for the full informational-taxonomy treatment — these ARE documented (extractor should consume their vocabulary/mechanics) but do NOT map to syncable IO rows. |
| **COVERABLE** (→ `TaxonomyLeaves`) | **99** | see §4 full table |

**Ledger closes: 115 = 99 (coverable) + 4 (folded) + 5 (excluded-artifact) + 7 (informational).**

## 3. INFORMATIONAL taxonomies (mechanics/vocabulary — extractor consumes, does not enumerate as IO)

| Taxonomy | Definition | Members | Source-mapping |
|---|---|---|---|
| **Pagination Mechanics (Dual/Cursor)** | The `page`-deepObject dual offset/cursor convention (`DualPaginationPage`) + cursor-only variant (`CursorPaginationPage`) + response `meta.after_cursor`/`before_cursor` + `links.next`/`previous`. Governs `PaginationType` for every list IO. | n/a (mechanism, not an object) | `ticketing-oas.yaml` lines 605, 1553, 3148-3160 (grep-verified); [Cursor pagination guide](https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/) |
| **Incremental Export Mechanics** | `start_time` (unix epoch, ≥60s in the past) seed + opaque `cursor` continuation param, distinct from list-cursor pagination. Governs `IncrementalWatermarkField` for tickets/users/organizations/ticket_events/ticket_metric_events/custom_object_records/routing attributes. | n/a (mechanism) | `ticketing-oas.yaml` lines 6552-6630, 6970, 7045-7110; [Incremental Export guide](https://developer.zendesk.com/documentation/ticketing/managing-tickets/using-the-incremental-export-api/) |
| **Rate-Limit Categories** | Per-endpoint overrides (e.g., Audit Log CSV Export = 1 req/min; Search beyond page 100 = 5 req/min) layered on the account-wide tier. | n/a (mechanism) | `ticketing-oas.yaml` lines 900-913, 4574-4578; [Rate Limits](https://developer.zendesk.com/api-reference/introduction/rate-limits/) |
| **Write-Body Envelope Convention** | Singular-key wrap for single-record write bodies (`{"ticket": {...}}`), matching plural-key wrap for list responses (`{"tickets": [...]}`). Governs `CreateBodyShape=wrapped` + `CreateBodyKey=<singular>` for every writable IO. | n/a (mechanism) | Verified directly: `TicketCreateRequest`/`TicketResponse` schemas in `ticketing-oas.json` |
| **OAuth Client/Token Administration** | API client registration + token issuance/administration — governs how the connector itself authenticates, not customer-service data. | `clients` (OAuth Clients), `global_clients`, `tokens` (OAuth Tokens) | `ticketing-oas.yaml` tags "OAuth Clients", "Global Clients", "OAuth Tokens" |
| **Action-Type Vocabulary** | The fixed vocabulary of possible Macro/Trigger/Automation action verbs (e.g. `set_status`, `add_tags`) — informs how to interpret a Macro/Trigger/Automation's `actions` field, not a record set itself. | `actions` (`/api/v2/macros/actions`) | `ticketing-oas.yaml` tag "Macros", path `/api/v2/macros/actions` |
| **Account Security/Password Policy** | Password complexity requirements — account-level config, not a record. | `requirements` (`/api/v2/users/{id}/password/requirements`) | `ticketing-oas.yaml` tag "User Passwords" |
| **Async Job Polling** | Ephemeral job-status polling for long-running bulk operations (`_many` endpoints return a `job_status` to poll). | `job_statuses` | `ticketing-oas.yaml` tag "Job Statuses" |
| **Locale Vocabulary** | The list of translation locales Zendesk supports account-wide — reference data, not per-tenant business data. | `locales` | `ticketing-oas.yaml` tag "Locales" |

## 4. COVERABLE taxonomies + full per-object table (→ `TaxonomyLeaves`, 99 objects)

Named taxonomies emerged directly from the OAS's own `tags` groupings (95 Ticketing tags + 18 Help
Center tags), consolidated where multiple tags clearly form one functional area (e.g. "SLA Policies"
+ "Group SLA Policies" → one taxonomy). Every taxonomy cites the specific OAS tag(s) / doc page it
came from. Columns: **APIPath** = canonical (shortest, non-incremental, non-autocomplete) list
endpoint; **ResponseDataKey** = the vendor's own wrapper key; **PaginationType** = read directly from
the operation's parameter refs (`DualPaginationPage` / `CursorPaginationPage` / `IncrementalCursor` /
plain `page`+`per_page`); **CRUD** = C/U/D flags read directly from the presence of POST on the
collection path and PUT|PATCH/DELETE on the single-record path; **Parent** = access-path parent when
nested.

### 4.1 Tickets & Ticket Lifecycle
*Tags: Tickets, Suspended Tickets, Ticket Skips, Ticket Content Pins* — [Tickets](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| tickets | `/api/v2/tickets` | tickets | Cursor+Offset(dual) | CUD | |
| deleted_tickets | `/api/v2/deleted_tickets` | deleted_tickets | Cursor+Offset(dual) | --D | |
| suspended_tickets | `/api/v2/suspended_tickets` | suspended_tickets | Cursor+Offset(dual) | --D | |
| ticket_content_pins | `/api/v2/ticket_content_pins` | ticket_content_pins | None/Unpaged | C-D | |
| skips | `/api/v2/skips` | skips | None/Unpaged | C-- | |

**Real numeric PK + scalar FKs confirmed directly from `TicketObject` schema** (not deferred/guessed):
`id: integer(int64) readOnly` (PK); `requester_id`, `submitter_id`, `assignee_id`, `organization_id`,
`group_id`, `brand_id`, `forum_topic_id`, `problem_id`, `ticket_form_id` — all `integer(int64),
nullable` scalar FKs.

### 4.2 Ticket Comments & Conversation Log
*Tags: Ticket Comments (nested), Conversation Log* — [Ticket Comments](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| ticket_comments | `/api/v2/tickets/{ticket_id}/comments` | comments | None/Unpaged | --- | tickets |
| events | `/api/v2/tickets/{ticket_id}/conversation_log` | events | Cursor | --- | tickets |

`ticket_comments` is also reachable via `/api/v2/requests/{request_id}/comments` (end-user-facing
Requests API view of the same underlying comment records) — one object, two access-paths.

### 4.3 Ticket Audits
*Tag: Ticket Audits* — [Ticket Audits](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| audits | `/api/v2/ticket_audits` | audits | None/Unpaged | --- | |

### 4.4 Ticket Metrics
*Tags: Ticket Metrics, Ticket Metric Events* — [Ticket Metrics](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metrics/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| ticket_metrics | `/api/v2/ticket_metrics` | ticket_metrics | Cursor | --- | |
| ticket_metric_events | `/api/v2/incremental/ticket_metric_events` | ticket_metric_events | None/Unpaged (incremental-only) | --- | |

### 4.5 Ticket Fields & Forms
*Tags: Ticket Fields, Ticket Forms, Ticket Form Statuses* — [Ticket Fields](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_fields/), [Ticket Forms](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_forms/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| ticket_fields | `/api/v2/ticket_fields` | ticket_fields | Cursor | CUD | |
| custom_field_options | `/api/v2/ticket_fields/{ticket_field_id}/options` | custom_field_options | None/Unpaged | C-D | ticket_fields |
| ticket_forms | `/api/v2/ticket_forms` | ticket_forms | Cursor+Offset(dual) | CUD | |
| ticket_form_statuses | `/api/v2/ticket_form_statuses` | ticket_form_statuses | None/Unpaged | --- | |

### 4.6 Custom Ticket Statuses
*Tag: Custom Ticket Statuses*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| custom_statuses | `/api/v2/custom_statuses` | custom_statuses | None/Unpaged | CUD | |

### 4.7 Requests (End-User Facing)
*Tag: Requests* — [Requests](https://developer.zendesk.com/api-reference/ticketing/requests/requests/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| requests | `/api/v2/requests` | requests | Cursor+Offset(dual) | CU- | |

### 4.8 Users & Identities
*Tags: Users, User Identities* — [Users](https://developer.zendesk.com/api-reference/ticketing/users/users/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| users | `/api/v2/users` | users | Cursor+Offset(dual) | CUD | |
| deleted_users | `/api/v2/deleted_users` | deleted_users | Cursor+Offset(dual) | --D | |
| user_identities | `/api/v2/end_users/{user_id}/identities` | identities | None/Unpaged | C-D | users |
| compliance_deletion_statuses | `/api/v2/users/{user_id}/compliance_deletion_statuses` | compliance_deletion_statuses | None/Unpaged | --- | users |

**Real numeric PK + FKs confirmed** on `UserObject`: `id: integer(int64)` PK; `organization_id`,
`default_group_id`, `custom_role_id` — scalar FKs.

### 4.9 User Fields / Sessions / Passwords (informational split — see §3 for `requirements`)
*Tags: User Fields, Sessions*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| user_fields | `/api/v2/user_fields` | user_fields | Cursor | CUD | |
| sessions | `/api/v2/sessions` | sessions | Cursor | --- | |

### 4.10 Organizations
*Tags: Organizations, Organization Fields, Organization Memberships, Organization Subscriptions* — [Organizations](https://developer.zendesk.com/api-reference/ticketing/organizations/organizations/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| organizations | `/api/v2/organizations` | organizations | Cursor+Offset(dual) | CUD | |
| organization_merges | `/api/v2/organizations/{organization_id}/merges` | organization_merges | None/Unpaged | --- | organizations |
| organization_fields | `/api/v2/organization_fields` | organization_fields | Cursor | CUD | |
| organization_memberships | `/api/v2/organization_memberships` | organization_memberships | Cursor+Offset(dual) | C-D | |
| organization_subscriptions | `/api/v2/organization_subscriptions` | organization_subscriptions | None/Unpaged | C-D | |

`OrganizationObject.id: integer(int64)` PK, confirmed directly.

### 4.11 Groups & Routing
*Tags: Groups, Group Memberships, Group SLA Policies, Skill Based Routing, Omnichannel Routing Queues*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| groups | `/api/v2/groups` | groups | Cursor+Offset(dual) | CUD | |
| group_memberships | `/api/v2/group_memberships` | group_memberships | Cursor+Offset(dual) | C-D | |
| group_sla_policies | `/api/v2/group_slas/policies` | group_sla_policies | None/Unpaged | CUD | |
| routing_attributes | `/api/v2/routing/attributes` | attributes | None/Unpaged | CUD | |
| routing_attribute_values | `/api/v2/routing/agents/{user_id}/instance_values` | attribute_values | None/Unpaged | C-- | users |
| routing_instance_values | `/api/v2/routing/agents/instance_values` | instance_values | None/Unpaged | --- | |
| omnichannel_routing_queues | `/api/v2/queues` | queues | None/Unpaged | CUD | |

### 4.12 Business Rules — Macros / Triggers / Automations / Views
*Tags: Macros, Triggers, Object Triggers, Trigger Categories, Automations, Views* — [Triggers](https://developer.zendesk.com/api-reference/ticketing/business-rules/triggers/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| macros | `/api/v2/macros` | macros | Cursor+Offset(dual) | CUD | |
| macro_attachments | `/api/v2/macros/{macro_id}/attachments` | macro_attachments | None/Unpaged | C-- | macros |
| macro_categories | `/api/v2/macros/categories` | categories | None/Unpaged | --- | |
| triggers | `/api/v2/triggers` | triggers | Cursor+Offset(dual) | CUD | |
| trigger_categories | `/api/v2/trigger_categories` | trigger_categories | Offset | CUD | |
| trigger_revisions | `/api/v2/triggers/{trigger_id}/revisions` | trigger_revisions | None/Unpaged | --- | triggers |
| automations | `/api/v2/automations` | automations | Cursor+Offset(dual) | CUD | |
| views | `/api/v2/views` | views | Cursor+Offset(dual) | CUD | |
| view_counts | `/api/v2/views/count_many` | view_counts | None/Unpaged | --- | views |

### 4.13 SLA Policies
*Tag: SLA Policies*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| sla_policies | `/api/v2/slas/policies` | sla_policies | None/Unpaged | CUD | |

### 4.14 Custom Roles & Permissions
*Tag: Custom Roles*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| custom_roles | `/api/v2/custom_roles` | custom_roles | None/Unpaged | CUD | |

### 4.15 Custom Objects
*Tags: Custom Objects, Custom Object Fields, Custom Object Records, Custom Object Record Attachments, Custom Object Permissions* — [Custom Objects](https://developer.zendesk.com/api-reference/custom-data/custom-objects/custom_objects/)

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| custom_objects | `/api/v2/custom_objects` | custom_objects | None/Unpaged | CUD | |
| custom_object_fields | `/api/v2/custom_objects/{custom_object_key}/fields` | custom_object_fields | None/Unpaged | CUD | custom_objects |
| custom_object_records | `/api/v2/custom_objects/{custom_object_key}/records` | custom_object_records | Cursor | CUD | custom_objects |
| custom_object_record_attachments | `/api/v2/custom_objects/{custom_object_key}/records/{record_id}/attachments` | custom_object_record_attachments | None/Unpaged | CUD | custom_objects |
| custom_object_access_rules | `/api/v2/custom_objects/{custom_object_key}/access_rules` | access_rules | None/Unpaged | CUD | custom_objects |
| custom_object_permission_policies | `/api/v2/custom_objects/{custom_object_key}/permission_policies` | policies | None/Unpaged | -U- | custom_objects |

Custom Objects ALSO have their own incremental-export cursor endpoint
(`/api/v2/incremental/custom_objects/{custom_object_key}/cursor`, start_time+cursor) —
`IncrementalWatermarkField` applies per custom-object-type.

### 4.16 Tags / Brands / Dynamic Content
*Tags: Tags, Brands, Brand Agents, Dynamic Content, Dynamic Content Item Variants*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| tags | `/api/v2/tags` | tags | Cursor+Offset(dual) | --- | |
| brands | `/api/v2/brands` | brands | Offset | CUD | |
| brand_agents | `/api/v2/brand_agents` | brand_agents | Cursor+Offset(dual) | --D | |
| dynamic_content_items | `/api/v2/dynamic_content/items` | items | Cursor+Offset(dual) | CUD | |
| dynamic_content_variants | `/api/v2/dynamic_content/items/{dynamic_content_item_id}/variants` | variants | Cursor+Offset(dual) | CUD | dynamic_content_items |

### 4.17 Targets, Notifications & Support Addresses
*Tags: Targets, Target Failures, Email Notifications, Support Addresses*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| targets | `/api/v2/targets` | targets | None/Unpaged | CUD | |
| target_failures | `/api/v2/target_failures` | target_failures | None/Unpaged | --- | |
| email_notifications | `/api/v2/email_notifications` | email_notifications | None/Unpaged | --- | |
| recipient_addresses | `/api/v2/recipient_addresses` | recipient_addresses | Cursor+Offset(dual) | CUD | |

### 4.18 Satisfaction
*Tags: Satisfaction Ratings, Satisfaction Reasons*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| satisfaction_ratings | `/api/v2/satisfaction_ratings` | satisfaction_ratings | Cursor+Offset(dual) | --- | |
| satisfaction_reasons | `/api/v2/satisfaction_reasons` | reasons | None/Unpaged | --- | |

### 4.19 Sharing, Compliance & Admin Utilities
*Tags: Sharing Agreements, Audit Logs, Deletion Schedules, Bookmarks, Saved Searches, Resource Collections, Remote Authentications*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| sharing_agreements | `/api/v2/sharing_agreements` | sharing_agreements | None/Unpaged | CUD | |
| audit_logs | `/api/v2/audit_logs` | audit_logs | Cursor | --- | |
| deletion_schedules | `/api/v2/deletion_schedules` | deletion_schedules | None/Unpaged | CUD | |
| bookmarks | `/api/v2/bookmarks` | bookmarks | None/Unpaged | C-D | |
| saved_searches | `/api/v2/saved_searches` | saved_searches | None/Unpaged | CUD | |
| resource_collections | `/api/v2/resource_collections` | resource_collections | Offset | CUD | |
| remote_authentications | `/api/v2/remote_authentications` | remote_authentications | None/Unpaged | --- | |

### 4.20 Task Lists & Approvals
*Tags: Task List Templates, Task Lists, Approval Requests*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| task_list_templates | `/api/v2/task_list_templates` | task_list_templates | None/Unpaged | CUD | |
| tasks | `/api/v2/task_list_templates/{task_list_template_id}/tasks` | tasks | None/Unpaged | --- | task_list_templates |
| task_lists | `/api/v2/tickets/{ticket_id}/task_lists` | task_lists | None/Unpaged | C-- | tickets |
| approval_requests | `/api/v2/approval_requests` | approval_requests | None/Unpaged | C-- | |

### 4.21 IT Asset Management (ITAM)
*Tags: ITAM Assets, ITAM Asset Types, ITAM Asset Fields, ITAM Asset Locations, ITAM Asset Statuses*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| assets | `/api/v2/it_asset_management/assets` | assets | None/Unpaged | CUD | |
| asset_types | `/api/v2/it_asset_management/asset_types` | asset_types | None/Unpaged | CUD | |
| itam_asset_fields | `/api/v2/it_asset_management/asset_types/{asset_type_id}/fields` | fields | None/Unpaged | CUD | asset_types |
| locations | `/api/v2/it_asset_management/locations` | locations | None/Unpaged | CUD | |
| itam_asset_statuses | `/api/v2/it_asset_management/statuses` | statuses | None/Unpaged | --- | |

### 4.22 Activity Stream / Workspaces / Channel Config
*Tags: Activity Stream, Workspaces, X Channel*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| activities | `/api/v2/activities` | activities | Cursor+Offset(dual) | --- | |
| workspaces | `/api/v2/workspaces` | workspaces | None/Unpaged | CUD | |
| monitored_twitter_handles | `/api/v2/channels/twitter/monitored_twitter_handles` | monitored_twitter_handles | None/Unpaged | --- | |

### 4.23 Business Hours Schedules & Holidays — *sourced from prose docs, NOT in the OAS (§1.1 gap)*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| schedules | `/api/v2/business_hours/schedules` | schedules | Offset (prose-documented) | CUD | |
| schedule_holidays | `/api/v2/business_hours/schedules/{schedule_id}/holidays` | holidays | Offset (prose-documented) | CUD | schedules |

### 4.24 Help Center — Content Hierarchy
*Tags: Categories, Sections, Articles, Article Attachments, Article Labels, Translations, Article Comments*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| help_center_categories | `/api/v2/help_center/categories` | categories | Unprobed (recovered leaf — likely Cursor+Offset per sibling endpoints) | CUD | |
| sections | `/api/v2/help_center/sections` | sections | None/Unpaged | -UD | help_center_categories |
| articles | `/api/v2/help_center/articles` | articles | None/Unpaged | -UD | help_center_categories/sections |
| article_attachments | `/api/v2/help_center/articles/{article_id}/attachments` | article_attachments | None/Unpaged | C-- | articles |
| article_labels | `/api/v2/help_center/articles/labels` | labels | None/Unpaged | --D | articles |
| translations | `/api/v2/help_center/articles/{article_id}/translations` | translations | None/Unpaged | CU- | articles |
| article_comments | `/api/v2/help_center/articles/{article_id}/comments` | comments | Unprobed (recovered leaf) | CUD | articles |

### 4.25 Help Center — Community
*Tags: Posts, Post Comments, Votes, Topics*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| community_posts | `/api/v2/community/posts` | posts | None/Unpaged | CUD | |
| community_topics | `/api/v2/community/topics` | topics | None/Unpaged | CUD | |
| post_comments | `/api/v2/community/posts/{post_id}/comments` | comments | Unprobed (recovered leaf) | CUD | community_posts |
| post_subscriptions | `/api/v2/community/posts/{post_id}/subscriptions` | subscriptions | None/Unpaged | C-D | community_posts |
| help_center_votes | `/api/v2/help_center/votes` | votes | None/Unpaged | --D | |

### 4.26 Help Center — Access Control & Subscriptions
*Tags: User Segments, User Subscriptions, Service Catalog Items, Help Center Sessions*

| Object | APIPath | ResponseDataKey | PaginationType | CRUD | Parent |
|---|---|---|---|---|---|
| user_segments | `/api/v2/help_center/user_segments` | user_segments | None/Unpaged | CUD | |
| user_subscriptions | `/api/v2/help_center/users/{user_id}/user_subscriptions` | user_subscriptions | None/Unpaged | --- | users |
| service_catalog_items | `/api/v2/help_center/service_catalog/items` | service_catalog_items | None/Unpaged | --- | |

**Full accounting: 5 (§4.1) + 2 (§4.2) + 1 (§4.3) + 2 (§4.4) + 4 (§4.5) + 1 (§4.6) + 1 (§4.7) + 4
(§4.8) + 2 (§4.9) + 5 (§4.10) + 7 (§4.11) + 9 (§4.12) + 1 (§4.13) + 1 (§4.14) + 6 (§4.15) + 5 (§4.16)
+ 4 (§4.17) + 2 (§4.18) + 7 (§4.19) + 4 (§4.20) + 5 (§4.21) + 3 (§4.22) + 2 (§4.23) + 7 (§4.24) + 5
(§4.25) + 3 (§4.26) = 99.** Matches `TaxonomyLeaves` exactly.

## 5. Write-endpoint / incremental-export detail (spot-checked, real, not guessed)

- **Create body shape**: wrapped, singular key = the object's singular name (`{"ticket": {...}}`,
  `{"user": {...}}`, `{"organization": {...}}`, `{"schedule": {...}}`) — verified directly against
  `TicketCreateRequest`/`TicketResponse` component schemas. `CreateIDLocation = body` (`<key>.id`).
- **Update**: `PUT /api/v2/{resource}/{id}` (Zendesk uses PUT, not PATCH, for partial updates on
  most resources — confirmed on `tickets`, `users`, `organizations`).
- **Delete**: `DELETE /api/v2/{resource}/{id}` — standard verb throughout; no soft-delete-via-POST
  pattern observed in-spec (deleted/suspended tickets are a separate READ-ONLY view, not the delete
  mechanism itself).
- **Batch**: `_many` suffix endpoints (`create_many`, `update_many`, `destroy_many`, `show_many`)
  exist for the highest-volume resources (tickets, users, organizations, organization_memberships,
  dynamic_content variants) — real spec-declared batch surface, feeds `SupportsBatchWrite`.
- **Incremental export** (distinct from list pagination): `start_time` (unix epoch, must be >60s in
  the past) seeds the FIRST page; every subsequent page uses the returned `cursor` value. Applies to:
  `tickets`, `users`, `organizations`, `ticket_events`, `ticket_metric_events`,
  `custom_object_records` (per custom-object-type), `routing_attributes`/`routing_attribute_values`/
  `routing_instance_values`. `IncrementalWatermarkField = start_time` (seed) / `cursor` (continuation).

## 6. Out-of-scope product families (`outOfScopeFamilies`)

| Family | Reason excluded |
|---|---|
| **Zendesk Chat / Live Chat** | Separate real-time chat product with its own API surface (`/api-reference/live-chat/`); not part of the Support/Guide ticketing+content data model in scope. |
| **Zendesk Talk (Voice)** | Separate voice/telephony product (`/api-reference/voice/talk-api/`); call records/IVR config, not ticketing data. |
| **Zendesk Sell (Sales CRM)** | Entirely separate CRM product (`/api-reference/sales-crm/`) with its own leads/deals/contacts data model — explicitly excluded even from Zendesk's own public Postman workspace. |
| **Zendesk Explore** | BI/analytics product layered on top of Support data — read-only reporting views, not a source-of-truth data model; no public write API. |
| **Sunshine Conversations (Messaging)** | Confirmed separate product with its OWN OpenAPI spec repo (`github.com/zendesk/sunshine-conversations-api-spec`) — real-time conversational messaging, structurally distinct from the ticketing/Guide model. Recorded in `SOURCES.json` for future connector scoping, not fetched in full. |
| **AI Agents / Answer Bot** | Conversational-AI product layer (`/api-reference/ai-agents/`); configuration/analytics for bot behavior, not core ticketing data. |
| **Embeddables (Web Widget, Mobile SDKs)** | Client-side embed configuration, not server-side syncable business data. |
| **Webhooks, Apps Framework, Integration Services, Amazon EventBridge** | Extension/notification mechanisms (push config), not data to sync. |
| **Custom Data API reference section** | Confirmed to duplicate the Ticketing OAS's own "Custom Objects"/"Custom Object Fields"/"Custom Object Records" tags (same objects, different landing page) — not a separate product, not double-counted. |
| **Status API** | System-status/incident page, informational only. |

## 7. Scope decision (`scopeDecision`)

**In scope**: every object reachable from the Support (Ticketing) API OpenAPI spec + the Help Center
(Guide) API OpenAPI spec + the one confirmed OAS-generator gap (Business Hours Schedules, sourced
from prose docs) = **99 COVERABLE objects**, spanning ticket lifecycle, users/orgs/groups, business
rules (macros/triggers/automations/views), custom objects, ITAM, task/approval workflows, community
Help Center content, and account/security administration objects with real business-data value
(custom roles, SLA policies, deletion schedules).

**Justification for the boundary**: the in-scope set is defined by the vendor's OWN two OpenAPI
specs (the machine-readable, generator-grade contract) plus ONE Tier-1 prose-sourced addition where
the OAS demonstrably lags the real product. Everything excluded (§6) is a **structurally separate
Zendesk product** with its own distinct API surface/data model (Chat, Talk, Sell, Explore, Sunshine
Conversations, AI Agents) — none of it is reachable from, or overlaps with, the Ticketing/Guide
object graph audited here. This is not a convenience cut; it is the natural boundary of "the Support
+ Help Center ticketing and knowledge-base product," which is what a Zendesk *support-desk*
connector is expected to sync.

**Thin-scope check**: 99 COVERABLE objects against a 622-625 raw-schema mechanical anchor is not a
"thin declared-vs-universe" gap — it is the EXPECTED translation ratio for an OpenAPI/REST vendor
(each resource has ~5-6 request/response/param schema variants: create-request, update-request,
response-envelope, list-response, error-shape). The independent schema-level ledger (§2.2) accounts
for all 625 schemas; the resource-level ledger (§2.3) accounts for all 115 raw candidates down to 99
coverable. No object was dropped without a named bucket + evidence.

## 8. Gaps (honest negatives)

| Area | Reason |
|---|---|
| **Business Hours Schedules OAS coverage** | Real, documented, fully-CRUD product feature, but absent from the vendor's own downloaded OpenAPI spec (confirmed via exhaustive grep). Captured from prose docs instead; downstream extraction should treat this object's schema as LOWER-confidence than OAS-sourced objects (no machine-checked property types) until Zendesk's OAS migration catches up or a live discovery call is used to firm up field types. |
| **Postman collection raw JSON** | The vendor's official Postman collection (corroborating Tier-2 source) could not be retrieved as raw JSON credential-free (Postman API requires a key). The OpenAPI spec supersedes it in authority and was fully retrieved, so this is a low-impact gap — noted for completeness, not blocking. |
| **Pagination type unprobed for 3 recovered objects** | `help_center_categories`, `article_comments`, `post_comments` were recovered from a cross-file collision fix (§2.3) after the main pagination-detection pass ran; their `PaginationType` was not re-probed against the OAS parameter refs in this pass (their sibling endpoints in the same file use Cursor+Offset dual pagination, so that is the reasonable expectation, but it is NOT yet confirmed the same mechanical way the other 96 objects were). Flagged as `Unprobed` in §4.24/§4.25 rather than asserted. |
| **Sunshine Conversations / Chat / Talk / Sell / Explore** | Out of scope by product boundary (§6) — not researched in depth beyond confirming they are separate surfaces. If a future connector needs cross-product sync (e.g. Messaging alongside Ticketing), a separate source audit against `sunshine-conversations-api-spec` is required. |
| **Live/credentialed verification** | This audit is entirely credential-free (OAS + prose docs). No live API calls were made against a real Zendesk subdomain. The `format-verified-no-creds` ceiling applies — downstream reality-probe / T8 live testing is required to confirm the declared paths/pagination/watermarks resolve correctly against a live account. |
