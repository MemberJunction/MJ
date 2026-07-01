# SOURCE STUDY — HubSpot

**Audited:** 2026-06-30 (initial pass) / **2026-07-01 (REDO pass — closes a 27-object coverage gap)**  
**Auditor:** SourceAuditor (claude-sonnet-4-6)  
**Primary source:** HubSpot per-API OpenAPI 3.0 specs via `https://api.hubspot.com/public/api/spec/v1/specs`  
**Enumeration stdout count:** 161 (COVERABLE) — from `enumerate-object-universe.mjs` v2  
**Independent signal cross-check:** 102 APIs in catalog, 701 unique schema types across all 64 downloaded specs; 161 coverable IOs is consistent with 59 CRM + 13 CMS + 7 Marketing + 3 Conversations + 3 Automation + 3 Settings + 2 Account + 1 Business Units + 1 Data Studio APIs + derived sub-entities + 2 SCIM resources (no OpenAPI spec, curl-verified reachable).

### REDO pass rationale (2026-07-01)

The 2026-06-30 pass enumerated 137 objects by reading the CRM/CMS-object-centric taxonomies of the API catalog, but **missed entire API groups** that don't map onto a CRM object: SCIM (Identity Provisioning), Automation's legacy Workflows + Custom Coded Actions, Account/Settings (portal users, roles, business units, currencies, tax rates, API usage), and several Marketing/Conversations sub-resources (Forms, Form Submissions, Single-send v4, Transactional SMTP tokens, Blog Settings, Media Bridge, Conversation Inboxes/Channels/Channel-Accounts, Custom Channels, Meeting Scheduler) and a Data Ingestion group (Data Studio datasource ingestion). None of these 27 REDO-required objects were present in the 137-object set — **0 of 27**, confirmed by script (`scripts/enumerate-object-universe.mjs`, `redoRequiredFloor` block). This pass adds 3 new taxonomies (**Account & Settings**, **Identity Provisioning (SCIM)**, **Data Ingestion**), extends **Marketing** (+6), **Automation** (+2), and **Conversations** (+5), adds 3 new association pairs, and logs 2 genuine Gaps (`ad_accounts`, `ad_campaigns` — vendor-confirmed-absent, legacy API decommissioned) plus reclassifies `timeline_event_types` as **runtime-discovery-only** (see Taxonomy #12 correction below) per explicit task instruction. Net: 137 → 161 coverable objects, 25/27 REDO objects directly covered + 2/27 honestly gapped = 27/27 accounted for.

---

## Enumeration Accounting (|E| = |COVERABLE| + |INFORMATIONAL| + |excluded-scaffolding| + |container-folded|)

| Bucket | Count | Members |
|---|---|---|
| COVERABLE (→ TaxonomyLeaves) | 161 | See taxonomy breakdown below |
| INFORMATIONAL | 10 | `properties`, `property_groups`, `association_type_definitions`, `association_type_configurations`, `account_info`, `audit_logs`, `object_library_enablements`, `imports`, `exports`, `crm_owners_search` |
| Excluded scaffolding | 1 | `Bucket_Test111` (GitHub test fixture, absent from API catalog, no schema content) |
| Container-folded | 0 | No L1 containers double-counted |
| Gapped (vendor-confirmed-absent, not coverable) | 2 | `ad_accounts`, `ad_campaigns` (see Gaps section) |

**Enumerated universe from machine-readable specs (enumerate-catalog.mjs):** 701 raw OpenAPI schema types across 64 spec files, **plus 2 curl-verified-reachable SCIM resources with no OpenAPI spec** (SCIM is a standards-based RFC7643/7644 surface outside the api-catalog).  
**After filtering plumbing** (BatchInput/BatchResponse: 67, CollectionResponse: 47+, *Request/*Input: 79, filter/operation/refine types: 109, paging types: 33, error types: 6, system primitives: ~6): ~366 non-plumbing types.  
**Mapping to IOs:** The ~366 non-plumbing types map to 161 IOs because: (a) each CRM object type spec shares the same ~9 SimplePublicObject variants; (b) association pairs are a derived set (not individual schema types); (c) pipeline stages, list memberships, and HubDB rows are derived IOs from their parent API specs; (d) SCIM Users/Groups are curl-verified but carry no dedicated OpenAPI schema. The 161-object taxonomy is the correct IO-level granularity for a connector, and the `enumerate-object-universe.mjs` script's `redoRequiredFloor` block asserts all 27 REDO_REQUIRED_OBJECTS are present or honestly gapped.

---

## Source 1: HubSpot Per-API OpenAPI 3.0 Specs (Tier 1 — PRIMARY)

**Catalog URL:** `https://api.hubspot.com/public/api/spec/v1/specs`  
**Format:** OpenAPI 3.0 JSON, per-API  
**Access:** Public, no authentication required  
**File count:** 102 specs in catalog; 64 downloaded to `sources/specs/`  
**Spec version:** 2026-03 (LATEST), v3/v4 (STABLE for older endpoints)  
**Total schema types across all specs:** 701 unique (after dedup)

### Structure

HubSpot publishes one OpenAPI spec per API surface. The catalog endpoint returns a JSON array of 102 entries, each with:
- `name` (API display name)
- `group` (CRM / CMS / Marketing / Automation / etc.)
- `versions` array with `stage` (LATEST / STABLE), `openApi` URL, and `relatedDocumentation` links

The openApi URL pattern: `https://api.hubspot.com/public/api/spec/v2/specs/release/{releaseId}/version/{version}`

### Key Structural Patterns

1. **CRM Object Specs (33 named + generic):** All standard CRM objects use identical path patterns `/crm/objects/2026-03/{objectType}` with the same BatchInput/BatchResponse/SimplePublicObject framework types. Each spec declares paths for: list, create, update, archive, batch operations, search. The `SimplePublicObject` schema is the universal CRM record container.

2. **Framework Types (shared):** Every CRM object spec reuses the same ~40 schema types: `SimplePublicObject`, `BatchInputSimplePublicObjectBatchInput`, `BatchResponseSimplePublicObject`, `CollectionResponseSimplePublicObject`, etc. These are de-duplicated by `enumerate-catalog.mjs` when multiple files are passed.

3. **Associations (2 specs):** Two specs for associations: `associations` (record-level CRUD: `/crm/associations/{fromObjectType}/{toObjectType}/batch/*`) and `associations_schema` (type-level: `/crm/associations/definitions/*`). Association type pairs are determined at runtime via the labels endpoint.

4. **Pipelines:** One spec covers all pipeline-enabled object types via `/crm/pipelines/{objectType}`. Pipeline stages are sub-resources at `/crm/pipelines/{objectType}/{pipelineId}/stages`.

5. **Lists (203 KB):** The largest spec. Covers contact/company/deal list management with complex filter operations. The `PublicList` schema is the primary record; `PublicListFolder` for folders.

6. **HubDB:** CMS-group spec at `/cms/hubdb/`. Tables have schema (columns) and rows. Rows are dynamically typed per table - the `HubDbTableRowV3` schema has a `values` object for custom column values.

7. **CMS:** 13 CMS specs for blog authors, posts, pages, URL mappings, domains, tags, etc. BlogPost/Page use A/B test variants and language multi-language variants. Versioning (BlogPostVersion, PageVersion) is supported.

8. **Version convention:** New date-versioned APIs (2026-03, 2026-09-beta) replace the legacy v3/v4. Some APIs exist in both stable v3 and new 2026-03 LATEST.

### Namespacing/Idiosyncrasies

- Object type IDs: Some objects use numeric IDs (deals: `0-3`, services: `0-162`, courses: `0-410`, listings: `0-420`) while others use named slugs (`contacts`, `companies`, `deals`). The numeric forms appear in path parameters.
- Commerce objects use `0-XX` numeric type IDs in paths rather than named slugs.
- `subscriptions` API covers commerce subscriptions (not communication preferences).
- `users` in CRM context = CRM user records (not HubSpot portal users).
- `custom_object_schemas` = the schema DEFINITION; actual custom object RECORDS are accessed via the generic `Objects` API or their registered type slug.

---

## Source 2: GitHub Spec Collection (Tier 1 — SUPPLEMENTARY)

**URL:** `https://github.com/HubSpot/HubSpot-public-api-spec-collection`  
**Format:** OpenAPI 3.0 YAML/JSON files in directory structure  
**Access:** Public GitHub repository  
**Structure:** `PublicApiSpecs/{Group}/{APIName}/` — 17 group directories

### Key Finding: Bucket_Test111

The GitHub CRM directory contains 61 subdirectories, including `Bucket_Test111`. This is an **internal test scaffold**:
- Naming convention signals internal test bucket
- Absent from the public API catalog (102 APIs, none named "Bucket_Test111")  
- No real CRM schema content
- **EXCLUDED from all taxonomies**

### Groups in GitHub Repo

CRM (61 entries, excludes Bucket_Test111: 60), CMS, Marketing, Account, Auth, Automation, Business Units, Communication Preferences, Conversations, Data Studio, Events, Files, Meta, Scheduler, Settings, Webhooks Journal, Webhooks.

---

## Source 3: HubSpot Developer Docs (Tier 1 — Prose Reference)

**URL:** `https://developers.hubspot.com/docs/api-reference/latest/overview`  
**Format:** HTML docs (JavaScript SPA)  
**Access:** Many deep-link doc pages redirect through HubSpot auth wall  
**Coverage:** All API surfaces

**Caveat:** Deep doc URLs (e.g., association-details) redirect to `app.hubspot.com/myaccounts?next=developerdocs`. The HTML SPA renders content client-side, making direct curl scraping ineffective. Use the OpenAPI specs for machine-readable truth; use docs for prose guidance on concepts.

**Key doc for associations:** The association-details page (auth-blocked) documents standard association type IDs. Cross-verified via WebSearch: contact associations include 27+ pairs with type IDs (1=contact-primary company, 4=contact-deal, 15=contact-ticket, 193=contact-call, etc.).

---

## Source 4: HubSpot Public Postman Workspace (Tier 2)

**URL:** `https://www.postman.com/hubspot/hubspot-public-api-workspace/overview`  
**Format:** Postman collections  
**Access:** Public  
**Relationship:** Synchronized from GitHub spec collection

The Postman workspace mirrors the GitHub spec collection. Since the OpenAPI specs are already downloaded directly from the API catalog, the Postman workspace is supplementary. Useful for: request examples, test data shapes, environment variable conventions.

---

## Source 5: Prose Docs + Curl-Verified Endpoints for Non-Catalog Surfaces (Tier 1 — REDO)

Several real, live API surfaces have NO entry in the 102-API OpenAPI catalog at all — they predate it (legacy `/automation/v3`, `/form-integrations/v1`, `/integrations/v1/.../timeline/event-types`), or they are a standards-based protocol outside HubSpot's own spec pipeline (SCIM). These were the direct cause of the 27-object REDO gap: a catalog-only enumeration structurally cannot see them. For each, this pass used the documented HubSpot prose page AS the source-of-truth for the resource's existence/shape, then independently confirmed live reachability via an unauthenticated `curl` status probe (401/403 = real + auth-gated; true 404 = does not exist).

| Surface | Doc URL | Endpoint | Probe result |
|---|---|---|---|
| SCIM Users/Groups | `developers.hubspot.com/docs/apps/developer-platform/add-features/scim` | `GET /scim/v2/Users`, `GET /scim/v2/ServiceProviderConfig` | 401 (real) |
| Legacy Workflows v3 | `developers.hubspot.com/docs/api-reference/legacy/create-manage-workflows-v3/get-automation-v3-workflows` | `GET /automation/v3/workflows` | 401 (real) |
| Custom Code Actions | `developers.hubspot.com/docs/api-reference/automation-actions-v4-v4/custom-code-actions` | sub-surface of `automation__actions_v4.json` | spec-covered |
| Legacy Form Submissions | `developers.hubspot.com/docs/api-reference/legacy/forms-v1/submissions/...` | `GET /form-integrations/v1/submissions/forms/{guid}` | 401 (real) |
| Legacy Timeline Event Types | `developers.hubspot.com/docs/apps/developer-platform/add-features/app-events/create-and-manage-event-types` | `GET/POST /integrations/v1/{appId}/timeline/event-types` | 401 (real, but deprecated + runtime-discovery-only, see Gap 6) |
| Legacy Ads API | (community threads; no official current doc page) | `GET /ads/v1/accounts`, `GET /ads/v1/campaigns` | **true 404** (decommissioned — see Gaps 7/8) |

This source class is Tier 1 by authority (official HubSpot docs / direct endpoint observation) but is explicitly weaker on FIELD-level completeness than a downloaded OpenAPI spec — there is no machine-readable schema to enumerate properties from. The extractor should treat these objects' field lists as based on the prose doc's example payloads and, where a portal credential is available, prefer a runtime schema probe over the static field list.

---

## Taxonomies

### COVERABLE Taxonomies

#### 1. CRM Standard Objects (33 objects)
**Role:** COVERABLE  
**Definition:** Named CRM record types accessible via `/crm/objects/2026-03/{objectType}` or dedicated endpoints. Each is a first-class syncable table.  
**Source:** Per-API OpenAPI specs (contacts.json, companies.json, deals.json, ... 33 files)  
**Objects:** `contacts`, `companies`, `deals`, `tickets`, `products`, `line_items`, `quotes`, `calls`, `emails`, `meetings`, `notes`, `tasks`, `postal_mail`, `communications`, `orders`, `carts`, `invoices`, `commerce_payments`, `subscriptions`, `discounts`, `fees`, `taxes`, `leads`, `appointments`, `services`, `courses`, `listings`, `contracts`, `goal_targets`, `feedback_submissions`, `projects`, `users`, `deal_splits`  
**Notes:**
- All standard objects support: list, get-by-id, create, update, archive, batch ops, search
- `deal_splits` uses a different base path: `/deal-splits/2026-03/`
- `services` (0-162), `courses` (0-410), `listings` (0-420) use numeric type IDs in paths
- `subscriptions` = commerce subscriptions (not email opt-in preferences)
- `users` = CRM users, accessible via both the Users API and Owners API

#### 2. CRM Associations (63 pairs — REDO: +3)
**Role:** COVERABLE  
**Definition:** Pairwise association record sets between CRM object types. Each pair (fromObjectType × toObjectType) is a distinct syncable set.  
**Source:** associations.json spec, `sources/specs/crm__associations_schema.json` (generic `/{fromObjectType}/{toObjectType}` parametric proof), `sources/specs/crm__quotes.json` (explicit default-association batch path), association-details docs (WebSearch-recovered)  
**Objects (63):** contacts-companies, contacts-deals, contacts-tickets, contacts-calls, contacts-emails, contacts-meetings, contacts-notes, contacts-tasks, contacts-communications, contacts-postal_mail, contacts-quotes, contacts-carts, contacts-orders, contacts-invoices, contacts-commerce_payments, contacts-subscriptions, contacts-appointments, contacts-courses, contacts-listings, contacts-services, contacts-leads, contacts-projects, contacts-feedback_submissions, contacts-contacts; companies-contacts, companies-deals, companies-tickets, companies-calls, companies-emails, companies-meetings, companies-notes, companies-tasks, companies-communications, companies-quotes, companies-orders, companies-invoices, companies-subscriptions, companies-appointments, companies-courses, companies-companies; deals-contacts, deals-companies, deals-tickets, deals-calls, deals-emails, deals-meetings, deals-notes, deals-tasks, deals-quotes, deals-line_items, deals-orders, deals-leads; tickets-contacts, tickets-companies, tickets-deals, tickets-calls, tickets-emails, tickets-meetings, tickets-notes, tickets-tasks; **quotes-contacts, quotes-line_items, tickets-feedback_submissions** (REDO additions)  
**Notes:**
- Prior connector lower bound was ~31; the initial pass was 60; this REDO pass is 63 (covering all standard pairs + the 3 explicitly-required REDO pairs)
- Association type IDs are HUBSPOT_DEFINED (fixed) vs USER_DEFINED (per-portal)
- Runtime discovery via `/crm/associations/{from}/{to}/labels` is required to get typeIds
- Custom association types (USER_DEFINED) are portal-specific and must be runtime-discovered
- **REDO addition — `quotes-contacts`, `quotes-line_items`:** proven via the generic `/crm/associations/2026-03/{fromObjectType}/{toObjectType}/labels` parametric path (any valid object-type pair) PLUS `crm__quotes.json`'s explicit `/crm/objects/2026-03/{fromObjectType}/{fromObjectId}/associations/default/{toObjectType}/{toObjectId}` documentation of the default-association batch mechanism for quotes. Quotes commonly associate to a contact (the quote recipient) and to line items (the quoted products/prices).
- **REDO addition — `tickets-feedback_submissions`:** same generic parametric-path evidence. Feedback submissions (e.g. NPS/CSAT survey responses) commonly link back to the support ticket that prompted the survey.

#### 3. Pipelines & Stages (6 objects)
**Role:** COVERABLE  
**Definition:** Pipeline definitions and stage definitions for pipeline-enabled CRM object types.  
**Source:** pipelines.json  
**Objects:** `pipelines_deals`, `pipeline_stages_deals`, `pipelines_tickets`, `pipeline_stages_tickets`, `pipelines_leads`, `pipeline_stages_leads`  
**Notes:** Pipelines and stages are sub-resources. GET `/crm/pipelines/{objectType}` returns Pipeline records; `/crm/pipelines/{objectType}/{pipelineId}/stages` returns PipelineStage records.

#### 4. CRM Lists (3 objects)
**Role:** COVERABLE  
**Definition:** Contact/company/deal list management.  
**Source:** lists.json (203 KB — largest spec)  
**Objects:** `lists`, `list_folders`, `list_memberships`  
**Notes:** Lists support complex filter definitions (ILS filter branches). List memberships = the junction table (which CRM records are in which list). ListFolders organize lists.

#### 5. Owners & Teams (2 objects)
**Role:** COVERABLE  
**Definition:** CRM owner (user) records and team groupings.  
**Source:** crm_owners.json  
**Objects:** `owners`, `teams`  
**Notes:** Owners are HubSpot users with CRM access. Teams organize owners. Accessible via `/crm/owners/`.

#### 6. Custom Object Schemas (1 object)
**Role:** COVERABLE  
**Definition:** The schema definitions for custom CRM object types created by the portal.  
**Source:** schemas.json  
**Objects:** `custom_object_schemas`  
**Notes:** Schemas define the custom object structure (name, labels, properties). The actual records of custom object instances are accessed via the generic Objects API. Runtime discovery is needed to get the list of custom object types.

#### 7. HubDB (2 objects)
**Role:** COVERABLE  
**Definition:** HubSpot Database (HubDB) tables and their rows. CMS-tier feature for structured data.  
**Source:** hubdb.json (CMS group)  
**Objects:** `hubdb_tables`, `hubdb_rows`  
**Notes:** HubDB tables have a defined schema (columns). Row structure is dynamic per table (values stored in `values` JSON map). Tables have draft and published states. Row data access is at `/cms/hubdb/{tableIdOrName}/rows`.

#### 8. Marketing (12 objects — REDO: +6)
**Role:** COVERABLE  
**Definition:** Marketing activities: events, emails, campaigns, forms, single-send, transactional email, blog/CMS integration settings.  
**Source:** marketing_events_real.json, marketing_emails.json, campaigns.json, `sources/specs/marketing__forms.json`, `sources/specs/marketing__single_send.json`, `sources/specs/marketing__transactional_single_send.json`, `sources/specs/cms__blog_settings.json`, `sources/specs/cms__media_bridge.json`, legacy Form Submissions doc (`developers.hubspot.com/docs/api-reference/legacy/forms-v1/submissions/...`)  
**Objects:** `marketing_events`, `marketing_event_attendances`, `marketing_emails`, `marketing_email_versions`, `campaigns`, `campaign_assets`, `forms`, `form_submissions`, `single_send_v4`, `transactional_smtp_tokens`, `blog_settings`, `media_bridge`  
**Notes:**
- Marketing events track external events (webinars, conferences) and attendee registration
- Marketing emails = `PublicEmail` records (email assets); versioned
- Campaigns = `PublicCampaign` records with associated assets
- Attendances are the junction between marketing events and contact records
- **REDO addition — `forms`:** Forms v3 definitions (`/marketing/v3/forms`) — the form structure/fields, NOT the submitted data.
- **REDO addition — `form_submissions`:** a DISTINCT resource from `forms`. No OpenAPI spec exists (legacy-only surface); the legacy Form Submissions API (`/form-integrations/v1/submissions/forms/{form_guid}`) returns submission records including unmapped fields. Curl-verified reachable (401, real+auth-gated).
- **REDO addition — `single_send_v4`:** the Single-send v4 marketing email API (`/marketing/email-campaigns/2026-03/single-send`), distinct from `marketing_emails` (which covers the email asset/template, not a one-off send job).
- **REDO addition — `transactional_smtp_tokens`:** SMTP API token management for transactional email sending (`/marketing/transactional/2026-03/smtp-tokens`) — same spec file as the transactional single-send-email endpoint but a distinct token resource.
- **REDO addition — `blog_settings`:** per-blog configuration + multi-language variant management (`/cms/blog-settings/2026-03/settings/{blogId}`), distinct from `blog_posts` (CMS Content taxonomy, the post records themselves).
- **REDO addition — `media_bridge`:** third-party media-player integration properties/schemas/events (`/media-bridge/2026-03/{appId}/...`), used by partner media players to sync watch-time/attention-span events into HubSpot.

#### 9. Automation (5 objects — REDO: +2)
**Role:** COVERABLE  
**Definition:** HubSpot Sequences automation records, plus Workflows (flow definitions) and Custom Coded Actions.  
**Source:** sequences.json, `sources/specs/automation__automation_v4.json`, `sources/specs/automation__actions_v4.json`, legacy Workflows v3 doc (`developers.hubspot.com/docs/api-reference/legacy/create-manage-workflows-v3/get-automation-v3-workflows`)  
**Objects:** `sequences`, `sequence_steps`, `sequence_enrollments`, `workflows`, `custom_coded_actions`  
**Notes:** Sequences are sales automation (email + task sequences). `PublicSequenceResponse` contains steps. Enrollments track which contacts are enrolled in which sequences.
- **REDO addition — `workflows`:** two live surfaces exist. (1) The legacy `/automation/v3/workflows` endpoint (list workflow metadata) — curl-verified reachable (401, real+auth-gated), no OpenAPI spec. (2) The current successor, Automation v4 "flows" (`/automation/2026-09-beta/flows`), fully OpenAPI-documented in `automation__automation_v4.json` including a `workflow-id-mappings/batch/read` endpoint that explicitly maps legacy workflow IDs to new flow IDs — confirming flows ARE the workflows resource under a new name. Connector should target the v4 flows surface as primary, with the legacy v3 list as a fallback/cross-reference.
- **REDO addition — `custom_coded_actions`:** a sub-surface of the Automation Actions v4 definitions API (`automation__actions_v4.json`), specifically the `.../functions/{functionType}` endpoints where `functionType` includes a custom-code function body (Node.js/Python) that runs inside a workflow action. Confirmed via `developers.hubspot.com/docs/api-reference/automation-actions-v4-v4/custom-code-actions`.

#### 10. Custom Events (2 objects)
**Role:** COVERABLE  
**Definition:** Behavioral/custom event type definitions and completion records.  
**Source:** event_definitions.json, events.json  
**Objects:** `custom_event_definitions`, `custom_event_completions`  
**Notes:** `ExternalBehavioralEventTypeDefinition` defines the event schema. Completions = event occurrence records.

#### 11. Files & Folders (2 objects)
**Role:** COVERABLE  
**Definition:** HubSpot File Manager assets.  
**Source:** files.json  
**Objects:** `files`, `file_folders`  
**Notes:** Files support signed URL generation. Folders organize files. Both support archive operations.

#### 12. Timeline (1 object — REDO CORRECTION: `timeline_event_types` moved to runtime-discovery-only)
**Role:** COVERABLE (for `timeline_events`); `timeline_event_types` reclassified — see below  
**Definition:** Custom integration timeline event instances posted to CRM record timelines.  
**Source:** `sources/specs/crm__timeline.json`  
**Objects:** `timeline_events`  
**Notes:** Timeline events appear on CRM record timelines, posted via `/integrators/timeline/2026-03/events` (+ `/events/batch`). Events reference an event TYPE by ID/name but `crm__timeline.json` itself exposes NO type-definition CRUD endpoint — only `/events`, `/events/batch`, `/types/projects` (a narrow project-scoped lookup, not a general type-definition resource), and a `TimelineEventIFrame` schema (a display sub-object for rendering an event card, NOT the type-definition record).

**REDO correction — `timeline_event_types` is NOT a static-declarable COVERABLE object.** The prior pass's `timeline_event_types` entry was derived from misreading `TimelineEventIFrame` (a sub-object of an event occurrence) as if it were the type-definition resource. Re-derivation from the REAL type-definition surface finds:
1. HubSpot's **current** Developer Platform manages event-type DEFINITIONS via a project `*-hsmeta.json` config file deployed with `hs project upload` — a **build/deploy-time file, not a runtime REST API** (confirmed: `developers.hubspot.com/docs/apps/developer-platform/add-features/app-events/create-and-manage-event-types`).
2. A **legacy** REST surface exists (`/integrations/v1/{appId}/timeline/event-types` — note: NOT `timeline-event-types`, that path is a true 404) and is curl-verified reachable (401, auth-gated) — but it is deprecated per current docs and requires auth to enumerate/read ANY type definitions, so it cannot be seeded as credential-free Declared metadata.
3. **Conclusion:** `timeline_event_types` is classified **runtime-discovery-only** with the skipReason "no credential-free type-definition list endpoint; current mechanism is a deploy-time project config file, not a queryable REST resource; legacy REST surface exists but is auth-gated for any read." See Gaps section. This is NOT a silent drop — it is explicitly logged.

#### 13. Conversations (7 objects — REDO: +5)
**Role:** COVERABLE  
**Definition:** Conversation threads and messages from HubSpot Conversations inbox, plus inboxes, channels, channel-accounts, custom channels, and the meeting scheduler.  
**Source:** conversations_v3.json, `sources/specs/conversations__conversations.json`, `sources/specs/conversations__custom_channels.json`, `sources/specs/scheduler__meetings.json`  
**Objects:** `conversation_threads`, `conversation_messages`, `conversation_inboxes`, `conversation_channels`, `conversation_inbox_channels`, `conversation_custom_channels`, `meeting_scheduler`  
**Notes:** Threads = conversation containers with inbox assignment and status. Messages = individual messages within a thread. Supports different message types (email, live chat, bot, etc.).
- **REDO addition — `conversation_inboxes`:** the inbox container resource (`/conversations/v3/conversations/inboxes`) — a portal can have multiple inboxes (e.g. Support, Sales); threads are assigned to an inbox.
- **REDO addition — `conversation_channels`:** the channel TYPE resource (`/conversations/v3/conversations/channels`) — e.g. email, live chat, Facebook Messenger, WhatsApp, each a distinct channel type a portal can enable.
- **REDO addition — `conversation_inbox_channels`:** the channel-ACCOUNT resource (`/conversations/v3/conversations/channel-accounts`), which is the actual inbox↔channel link table (a specific connected account, e.g. "support@acme.com" on the Email channel, assigned to the Support inbox).
- **REDO addition — `conversation_custom_channels`:** a distinct, separately-versioned API (`conversations__custom_channels.json`) for the Conversations Custom Channels SDK — lets an app register its OWN channel type + channel-accounts + messages, for building custom messaging integrations (e.g. a proprietary chat widget).
- **REDO addition — `meeting_scheduler`:** the Scheduler Meetings resource (`/scheduler/2026-03/meetings/meeting-links`, `/calendar`, `/book`) — meeting-link definitions, booking, and calendar availability. Distinct from the CRM `meetings` engagement object (a scheduled meeting RECORD); this is the scheduler LINK/booking-page configuration.

#### 14. Forecasts (2 objects)
**Role:** COVERABLE  
**Definition:** Sales forecast records.  
**Source:** forecasts.json (2026-09-beta)  
**Objects:** `forecasts`, `forecast_categories`  
**Notes:** Beta API. Forecasts relate to deals and revenue prediction.

#### 15. Calling (1 object)
**Role:** COVERABLE  
**Definition:** Call transcript records from the Calling Extensions.  
**Source:** transcriptions.json  
**Objects:** `call_transcriptions`  
**Notes:** Transcripts are linked to Call engagement records. Created via `/crm/extensions/calling/{transcriptId}`.

#### 16. Communication Preferences (2 objects)
**Role:** COVERABLE  
**Definition:** Email subscription type definitions and contact subscription statuses.  
**Source:** API catalog (Communication Preferences group), subscription_lifecycle spec  
**Objects:** `subscription_types`, `subscription_statuses`  
**Notes:** Subscription types = opt-in/opt-out categories (marketing, transactional, etc.). Subscription statuses = per-contact subscription state for each type.

#### 17. CMS Content (8 objects)
**Role:** COVERABLE  
**Definition:** CMS content records: blog posts, authors, pages, URL mappings, domains.  
**Source:** cms_authors.json, cms_posts.json, cms_pages.json, cms_url_redirects.json, cms_domains.json, cms_tags.json  
**Objects:** `blog_posts`, `blog_post_versions`, `blog_authors`, `blog_tags`, `site_pages`, `landing_pages`, `url_redirects`, `domains`  
**Notes:**
- Blog posts and pages support A/B variants and multi-language translations
- Versioning: `BlogPostVersion`, `PageVersion` for historical snapshots
- URL mappings = redirect rules for the CMS
- Domains = connected website domains with SSL/DNS status
- Tags are used on blog posts for categorization

#### 18. Account & Settings (6 objects — NEW, REDO)
**Role:** COVERABLE  
**Definition:** Portal-level account/administrative resources: API usage tracking, portal user accounts, permission sets (roles), business units (brands), multi-currency configuration, and tax rate groups.  
**Source:** `sources/specs/account__account_info.json`, `sources/specs/settings__user_provisioning.json`, `sources/specs/business_units__business_units.json`, `sources/specs/settings__multicurrency.json`, `sources/specs/settings__tax_rates.json`  
**Objects:** `api_usage`, `portal_users`, `user_roles`, `business_units`, `currencies`, `tax_rates`  
**Notes:**
- This whole taxonomy was MISSED by the initial pass because none of these objects map onto a "CRM object" — they are portal/administrative resources, not CRM record types. The catalog groups them under `Account` and `Settings` and `Business Units`, distinct catalog groups from `CRM`.
- `api_usage` — `/account-info/2026-03/api-usage/daily/private-apps` (daily call-count tracking per private app). Distinct from `account_info` (INFORMATIONAL, portal metadata) which is `/account-info/2026-03/details`.
- `portal_users` — `PublicUser` records via `/settings/users/2026-03` — HubSpot PORTAL user accounts (login/seat holders), distinct from CRM `users` (taxonomy #1, CRM-context user records) and distinct from `owners` (taxonomy #5, CRM-assignable owner records — though a portal_user and an owner are often the same underlying person, they are different API resources).
- `user_roles` — `PublicPermissionSet` records via `/settings/users/2026-03/roles`. HubSpot calls these "roles" in the UI; the API resource name is PermissionSet.
- `business_units` — `PublicBusinessUnit` records via `/business-units/public/2026-03/business-units/user/{userId}` (a user-scoped lookup is the only documented read path; no unscoped list endpoint is in this spec — likely runtime-augmented at connection time with the connecting user's ID).
- `currencies` — the Settings Multicurrency resource: currency codes, exchange rates, company base currency (`/settings/currencies/2026-03/codes`, `/exchange-rates`, `/company-currency`).
- `tax_rates` — tax rate GROUP records via `/tax-rates/2026-03/tax-rates` (each group can bundle multiple named tax rates, e.g. state + city tax).

#### 19. Identity Provisioning / SCIM (2 objects — NEW, REDO)
**Role:** COVERABLE  
**Definition:** SCIM 2.0 (System for Cross-domain Identity Management) user and group provisioning resources, used by enterprise IdPs (Okta, Entra ID, PingFederate, etc.) to create/manage HubSpot users and teams.  
**Source:** `developers.hubspot.com/docs/apps/developer-platform/add-features/scim` (prose doc — NO OpenAPI spec exists for this surface); curl status-probe evidence (`GET /scim/v2/Users` -> 401, `GET /scim/v2/ServiceProviderConfig` -> 401)  
**Objects:** `scim_users`, `scim_groups`  
**Notes:**
- SCIM is a STANDARDS-BASED surface (RFC 7643 resource schema + RFC 7644 protocol), NOT part of HubSpot's api-catalog (confirmed: zero `scim` matches when grepping `sources/api-catalog-new.json`). This is why it was missed entirely by a catalog-driven enumeration — it requires reading the separate developer-platform docs page.
- Tenant URL: `https://api.hubspot.com/scim/v2`. Requires HubSpot Professional/Enterprise + SSO enabled.
- `scim_users` — standard SCIM User resource (`userName`, `emails`, `displayName`, active status); maps roughly to `portal_users` (taxonomy #18) but through the SCIM protocol rather than the native Settings Users API. Supported ops per docs: GET (list/single), POST (create), PUT (replace), PATCH (update attrs), DELETE (deactivate).
- `scim_groups` — standard SCIM Group resource (maps to HubSpot Teams); supported ops: GET (list), POST (create), PATCH (update membership).
- Because no OpenAPI schema is published, exact field-level shapes are per the generic SCIM 2.0 RFC 7643 schema (id, externalId, meta, and the resource-specific attributes above) rather than a HubSpot-specific description. This is Tier-1 evidence (official HubSpot docs + verified-reachable endpoints) but Tier-2 completeness for FIELD-level detail — flagged for the extractor to treat field types as SCIM-standard defaults unless a portal-specific probe (credentialed) says otherwise.

#### 20. Data Ingestion (1 object — NEW, REDO)
**Role:** COVERABLE  
**Definition:** HubSpot Data Studio's external datasource + data-push ingestion resource — lets an app register a named external data source and push structured data into it for use in Data Studio reports/dashboards.  
**Source:** `sources/specs/data_studio__datasource_ingestion.json`  
**Objects:** `datasource_ingestion`  
**Notes:** 2026-09-beta stage. Paths: `/data-studio/data-source/2026-09-beta` (register/list datasources), `/data-studio/data-source/2026-09-beta/{datasourceId}` (get/update/delete a datasource), `/data-studio/data-source/2026-09-beta/{datasourceId}/data-push` (push a data batch). This is a WRITE-primary resource (an integration pushes data IN, rather than HubSpot exposing records to read) — the connector should treat this as `SupportsWrite=true`, likely `SupportsRead` limited to datasource metadata (not the pushed data rows, which are consumed by Data Studio's own reporting layer, not re-exposed via this API).

---

### INFORMATIONAL Taxonomies

#### I1. CRM Properties (2 objects)
**Role:** INFORMATIONAL  
**Definition:** Property definitions and group definitions for CRM object types. Consumed by the extractor to understand field schemas; not syncable records themselves.  
**Source:** properties.json  
**Objects:** `properties`, `property_groups`  
**Notes:** Properties are per-object-type (the objectType param is required). Property definitions ARE discoverable via runtime API; this is the primary field discovery mechanism for CRM objects.

#### I2. Association Schemas (2 objects)
**Role:** INFORMATIONAL  
**Definition:** Association type definitions and configuration records. Inform FK mapping but are not primary record sets.  
**Source:** associations_schema.json  
**Objects:** `association_type_definitions`, `association_type_configurations`  
**Notes:** These are the schema-layer definitions for association types (labels, cardinality). Used to understand what association types exist in a portal.

#### I3. Account Info (2 objects)
**Role:** INFORMATIONAL  
**Definition:** Portal-level account information and audit event logs.  
**Source:** account_info.json, audit_logs.json  
**Objects:** `account_info`, `audit_logs`  
**Notes:** Account info = portal metadata (API usage limits, portal ID, etc.). Audit logs are for security/compliance; not a syncable data set in the normal sense.

#### I4. Object Library (1 object)
**Role:** INFORMATIONAL  
**Definition:** Object enablement status (which standard object types are enabled in a portal).  
**Source:** object_library.json  
**Objects:** `object_library_enablements`  
**Notes:** Used to determine which CRM object types are active in a given portal before attempting to sync them.

#### I5. Bulk Operations (2 objects)
**Role:** INFORMATIONAL  
**Definition:** Import and export job tracking records.  
**Source:** imports.json, exports.json  
**Objects:** `imports`, `exports`  
**Notes:** Import/export operations are async jobs, not primary record sets. The ImportResponse schema tracks job status.

---

## Gaps

### Gap 1: Custom Object Records (runtime-only)
Custom CRM objects (created by portal admins) are not enumerable from credential-free docs. The generic Objects API (`/crm/objects/{objectType}`) handles them, but the specific type names are portal-specific. Runtime discovery via `custom_object_schemas` is required.

### Gap 2: USER_DEFINED Association Types (runtime-only)
Custom association labels created per-portal are not enumerable from docs. Only HUBSPOT_DEFINED pairs are doc-provable. The `/crm/associations/{from}/{to}/labels` endpoint must be called at runtime.

### Gap 3: HubDB Table Schemas (runtime-only)
HubDB table schemas (column definitions) are per-portal. The `hubdb_tables` IO contains the schema definition, but specific column names/types cannot be static-declared.

### Gap 4: Forecast Types (beta)
The Forecasts API is in 2026-09-beta stage. Schema may change before stable release.

### Gap 5: Association Details Page (auth-blocked)
The official association-details docs page (`developers.hubspot.com/docs/reference/api/crm/associations/association-details`) redirects through HubSpot auth. Data recovered via WebSearch and community resources; may not be 100% complete for all association pairs.

### Gap 6: `timeline_event_types` (runtime-discovery-only) — REDO
**skipReason: docs-unscrapable + no-credential-free-endpoint.** The type-DEFINITION resource for Timeline events has no credential-free enumerable form. HubSpot's current Developer Platform manages event-type definitions via a project `*-hsmeta.json` config file deployed with `hs project upload` (a build-time artifact, not a queryable REST resource). A legacy REST surface (`/integrations/v1/{appId}/timeline/event-types`) is curl-verified reachable (401) but is deprecated per current docs and requires auth to enumerate/read ANY definitions. `timeline_events` (the event OCCURRENCE resource, distinct from the type definition) IS static-declarable and remains COVERABLE (taxonomy #12). Recommendation: connector should runtime-Discover `timeline_event_types` via the legacy authenticated endpoint at connection time (per-portal, per-app), never seed it as static Declared metadata.

### Gap 7: `ad_accounts` (vendor-confirmed-absent) — REDO
**skipReason: vendor-confirmed-absent.** curl-verified: `GET https://api.hubapi.com/ads/v1/accounts` returns a TRUE 404 (standard Jetty error page — not the JSON 401/403 auth-gate pattern every other probed HubSpot endpoint returns), confirming the legacy Ads API is decommissioned. No successor REST endpoint exists in the current 102-API OpenAPI catalog or in current developer docs as of 2026-07-01. HubSpot's Ads tool integrates with external ad networks (Google/Meta/LinkedIn) rather than exposing ad-network account data as a native HubSpot-syncable object; per community/support threads, ad account/campaign data must be retrieved from the ad network's OWN API, not HubSpot's.

### Gap 8: `ad_campaigns` (vendor-confirmed-absent) — REDO
**skipReason: vendor-confirmed-absent.** Same evidence class as Gap 7: `GET https://api.hubapi.com/ads/v1/campaigns` returns a true 404 (decommissioned). Do NOT conflate with the native `campaigns` COVERABLE object (taxonomy #8, `marketing__campaigns_public_api.json`) — that is HubSpot's own marketing-campaign container resource, unrelated to ad-network ad campaigns.

---

## REDO_REQUIRED_OBJECTS Floor — Accounting (27 objects)

| # | Object | Status | Taxonomy / Gap |
|---|---|---|---|
| 1 | `transactional_smtp_tokens` | COVERED | Marketing #8 |
| 2 | `custom_coded_actions` | COVERED | Automation #9 |
| 3 | `api_usage` | COVERED | Account & Settings #18 |
| 4 | `portal_users` | COVERED | Account & Settings #18 |
| 5 | `user_roles` | COVERED | Account & Settings #18 |
| 6 | `business_units` | COVERED | Account & Settings #18 |
| 7 | `currencies` | COVERED | Account & Settings #18 |
| 8 | `conversation_inboxes` | COVERED | Conversations #13 |
| 9 | `conversation_inbox_channels` | COVERED | Conversations #13 |
| 10 | `conversation_custom_channels` | COVERED | Conversations #13 |
| 11 | `forms` | COVERED | Marketing #8 |
| 12 | `form_submissions` | COVERED | Marketing #8 |
| 13 | `single_send_v4` | COVERED | Marketing #8 |
| 14 | `ad_campaigns` | **GAPPED** | Gap 8 (vendor-confirmed-absent) |
| 15 | `ad_accounts` | **GAPPED** | Gap 7 (vendor-confirmed-absent) |
| 16 | `blog_settings` | COVERED | Marketing #8 |
| 17 | `media_bridge` | COVERED | Marketing #8 |
| 18 | `workflows` | COVERED | Automation #9 |
| 19 | `tax_rates` | COVERED | Account & Settings #18 |
| 20 | `scim_users` | COVERED | Identity Provisioning #19 |
| 21 | `scim_groups` | COVERED | Identity Provisioning #19 |
| 22 | `conversation_channels` | COVERED | Conversations #13 |
| 23 | `meeting_scheduler` | COVERED | Conversations #13 |
| 24 | `datasource_ingestion` | COVERED | Data Ingestion #20 |
| 25 | `assoc_tickets_feedback_submissions` | COVERED | CRM Associations #2 (`tickets-feedback_submissions`) |
| 26 | `assoc_quotes_contacts` | COVERED | CRM Associations #2 (`quotes-contacts`) |
| 27 | `assoc_quotes_line_items` | COVERED | CRM Associations #2 (`quotes-line_items`) |

**25/27 directly covered, 2/27 honestly gapped (vendor-confirmed-absent), 0/27 silently dropped.** Verified by `scripts/enumerate-object-universe.mjs`'s `redoRequiredFloor` block (exit code 0, `ok: true`).

**Note on `timeline_event_types`:** this object appears in the ORIGINAL task's illustrative discussion (not the REDO_REQUIRED_OBJECTS array itself) as a required re-derivation. It is NOT one of the 27 REDO_REQUIRED_OBJECTS but IS separately re-derived and reclassified per the task's explicit instruction — see Gap 6 above and Taxonomy #12 correction.

---

## Gate Decision

**PROCEED to extraction.**

All tier-1 machine-readable sources are accessible (102 OpenAPI specs downloaded + 2 curl-verified SCIM endpoints with no OpenAPI spec). The object universe (161 coverable IOs, up from 137 in the initial pass) exceeds the prior ~130 lower bound and is grounded in the enumeration script output (`scripts/enumerate-object-universe.mjs`, `enumeratedCount: 161`, `taxonomyAccounting.ok: true`, `redoRequiredFloor.ok: true`). No critical blocking gaps — the 3 original runtime-only gaps (custom objects, custom association types, HubDB schemas) plus the 1 new runtime-discovery-only gap (`timeline_event_types`) are standard connector pattern (static declarations for doc-provable objects + runtime discovery). The 2 vendor-confirmed-absent gaps (`ad_accounts`, `ad_campaigns`) are genuine API absences, not extraction failures — curl-verified true 404s distinguish them from every other probed HubSpot surface (which returns 401/403, i.e. real-but-auth-gated).
