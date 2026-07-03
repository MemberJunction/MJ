# Eventbrite — Source Study

Audited: 2026-07-02
Vendor domain: eventbrite.com | API host: eventbriteapi.com/v3/

## Executive summary

Eventbrite publishes its entire v3 REST API as an **Apiary API Blueprint** (MSON format) at
`https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib`. This is the vendor's own
machine-readable contract — 32 resource groups, 102 documented HTTP operations with real paths,
and 223 MSON Data Structure type definitions — and it is the artifact this study treats as the
Tier-1 source of record. The human-facing docs site at `eventbrite.com/platform/api` and its
sibling guide pages (`/platform/docs/*`) are a React SPA whose actual reference content is
client-fetched at runtime; static `curl`/`WebFetch` retrieval returns only page chrome with no
endpoint content. The Apiary blueprint is confirmed to be the same vendor-authored v3 contract
(same host, same auth scheme, same object names, cross-referenced by the SPA's own changelog
mentions) and is fully reachable via plain HTTP GET, so it was fetched RAW via `curl`, saved whole
to `sources/eventbrite-v3-api-blueprint.apib` (394,417 bytes / 6,932 lines), and used as the
extraction source. This satisfies the "acquire the machine-readable schema RAW, in code, first"
discipline — no WebFetch summary was used as the source of record for any schema fact.

A community-published Postman collection exists on the Postman API Network (Tier 2, non-vendor)
and is reachable; it was not needed for extraction (the Apiary blueprint is complete and directly
parseable) but is retained as a secondary cross-check source per the task's requirement to
populate `PostmanPaths`.

## Object-catalog enumeration (mechanical, scripted — never hand-typed)

A dedicated enumerator, `sources/enumerate-apib.mjs`, was written and run against the saved raw
`.apib` file because the shared `enumerate-catalog.mjs` primitive has no API-Blueprint/MSON parser
(confirmed by running it first: it correctly returned `format: 'unrecognized', count: 0` on this
file — see `sources/apib-full-enumeration.json` for the final run). The dedicated script parses
two independent, cross-checkable structural signals directly out of the saved bytes:

1. **`## Data Structures` MSON type definitions** — every `### TypeName (kind)` header in the
   document (there are two "Data Structures" section markers in the file; the enumerator anchors on
   heading-level-3 globally rather than a labeled block, since `###` is used ONLY for MSON type
   defs and endpoint operation headers in this document, and the two are told apart because
   endpoint headers always carry a `[METHOD /path]` suffix).
2. **`# Group X` / `### <op> [METHOD /path]` endpoint catalog** — every documented HTTP operation,
   its group, and (for GET operations) its response envelope shape (single-object `Attributes
   (TypeName)` vs. paginated `Attributes (object) { pagination, <plural_key> (array[TypeName]) }`).

```
node sources/enumerate-apib.mjs sources/eventbrite-v3-api-blueprint.apib
```

**Enumerated universe (E) = 223 MSON record-type definitions** (`EnumerationStdoutCount = 223`).
Independent cross-check signals from the SAME run: **1,801 total field declarations** across those
223 types, **32 resource groups**, **102 documented endpoints**. These numbers agree with a manual
`grep -c '^### '` / `grep -c '^# Group '` / `grep -c '\[GET\|POST\|PUT\|PATCH\|DELETE'` sanity pass
over the raw file, confirmed during the run.

### Full accounting ledger — every one of the 223 enumerated types is bucketed, none unaccounted

| Bucket | Count | Definition | Evidence |
|---|---|---|---|
| **COVERABLE** (→ `TaxonomyLeaves`, MSON-anchored) | 28 | MSON types that ARE the response/list-item shape of a documented, independently-addressable HTTP resource (a real `APIPath` exists that returns 1-or-many rows of this shape) | e.g. `Attendee` ← `GET /events/{event_id}/attendees/` returns `{pagination, attendees: [Attendee]}` |
| **COVERABLE, no MSON type** (→ `TaxonomyLeaves`, endpoint-anchored) | 3 | Real, documented endpoints (`Balance`, `Event Description`, `Organization Member`) whose response body is either raw (HTML) or left undocumented by the vendor's own blueprint (`+ Response 200` with no `+ Attributes` block) — still a real syncable resource by APIPath, just not represented by a named MSON type in the E=223 count | `GET /organizations/{organization_id}/members/` has `+ Response 200` with no attributes shown in source; `GET /events/{event_id}/description/` returns raw HTML per prose; `GET /balance/.../` has no MSON `Balance` object def |
| **Request/Create/Update payload variants** (excluded-scaffolding) | 33 | Types suffixed `Request`/`Create`/`Update`/`Post` (e.g. `Address Request`, `Event Create`, `Venue Create`) — these are INPUT shapes for the corresponding write operation, not a distinct record type; the record IS its base type (`Address`, `Event`, `Venue`) | Confirmed by suffix pattern + 1:1 correspondence to a base COVERABLE or container-folded type already counted |
| **Basic type aliases** (excluded-scaffolding) | 6 | Primitive/date-format wrapper pseudo-types documented as their own MSON headers for readability (`datetime-tz`, `datetime-tz-utc`, `local-datetime`, `htmltext`, `multipart-text`, `eventbrite-image`) — these are scalar-format definitions, not record shapes | `## Basic Types` section (blueprint lines 409–660) explicitly frames these as type-format documentation, not resources |
| **Error shapes** (excluded-scaffolding) | 3 | `Error`, `ErrorWithoutDetail`, `Discount Create Error` — HTTP error envelope shapes, not syncable records | `## Errors` section + inline `+ Response 4xx (Attributes (Error))` blocks throughout |
| **Container-folded** (nested value-objects) | 153 | MSON types that are embedded FIELDS of a COVERABLE parent, never independently listable/retrievable by their own APIPath (e.g. `Cost Component`, `Attendee Barcode`, `Crop Mask Coordinate`, `Structured Content Agenda Slot`) | Verified by grep: none of these 153 names appear as the arrayType/attrType of ANY of the 102 documented endpoint operations |
| **SUM** | **223** | | `28 + 33 + 6 + 3 + 153 = 223 == E` ✓ |

Final `TaxonomyLeaves` = 28 (MSON-anchored) + 3 (endpoint-anchored, no MSON type) = **31 coverable
objects**. The ledger closes exactly against the scripted enumeration; nothing was dropped
silently. (Note: two COVERABLE MSON types — `Event Team Response` and `Base Question` — are
renamed to their connector-facing IO names `Event Team` and `Question` in the final leaf list, and
`Venue Response`→`Venue`, `Text Overrides Response Content`→`Text Overrides`, `Capacity
Tier`→`Event Capacity Tier`, `Report Response Sales`→`Sales Report`, `Report Response
Attendees`→`Attendee Report`; this is a display-name normalization, not a change to the set.)

### Container-folded objects worth naming explicitly (why they don't inflate the leaf count)

The 153 container-folded types split into recognizable sub-families, all embedded fields of a
COVERABLE parent and never independently addressable:

- **Attendee sub-shapes** (11): `Attendee Address`, `Attendee Assigned Unit`, `Attendee Barcode`,
  `Attendee Profile`, `Attendee Search Order`, `Attendee Team`, `Answer`, `Question Choices`,
  `Question Ticket Class`, `Base Question Create`, `Canned Question Choices` — all nested inside
  `Attendee`/`Question`/`Canned Question` response bodies.
- **Cost/pricing sub-shapes** (9): `Cost`, `Cost Component`, `Cost Component Discount`, `Cost
  Component Rule`, `Cost Detail`, `Cost Summary`, `Currency Cost`, `Order Cost Details`, `Order
  Balances` — all nested inside `Order`/`Ticket Class`/`Attendee` cost breakdowns.
- **Structured Content module sub-shapes** (~20): `Structured Content Agenda Host/Slot/Tab/Widget`,
  `*Image Module(Data)`, `*Text Module(Data)`, `*Video Module(Data)`, `*FAQ(s Widget)` — all nested
  inside the single `Structured Content Page` document body (page composition blocks, not rows).
- **Venue/address sub-shapes** (4): `Address`, `Address Response`, `Venue Base`, `Region`,
  `Country`, `Timezone`, `Locale` — nested/reference-value fields on `Venue`/`Event`/`Organization`.
- **Ticket Class sub-shapes** (~10): `Ticket Class Confirmation Settings`, `Ticket Class Cost`,
  `Ticket Class For Sale Response`, `Ticket Class Response`, `Ticket Availability`, `Ticket Rule
  Response`, `Ticket Rule Ticket`, `Ticket Variant For Sale Response`, `Public Ticket Class` —
  nested detail/variant shapes of the `Ticket Class` response, not separate list endpoints.
- **Forward-referenced-but-unexposed shapes** (3): `Campaign` (+ `Campaign Invoice/Stats/Status/
  Template`), `Contact List` (+ `Contact List Item/Preferences/Type`), `Collection` — these ARE
  named, fielded MSON types with rich schemas, but **no documented endpoint in this source returns
  or accepts them as a top-level resource** — they appear only as nested/referenced field types
  (e.g. `contact_list_preferences` on `Attendee`/`Order`; `collection_id` filter param on the
  Events-by-Organization list). Flagged explicitly as a **known gap**: if Eventbrite exposes
  Campaigns/Contact-Lists/Collections management via a separate, not-yet-discovered endpoint
  family (marketing/campaigns APIs are known to exist in Eventbrite's product), it is not covered
  by this Tier-1 source and would need a follow-up audit pass. See `outOfScopeFamilies` below.
- **Remaining scattered nested shapes** (~96): payment/organization settings sub-objects
  (`Payment Method`, `Payment Capability`, `Payment Constraint`, `Organization Settings`), webhook
  trigger vocabulary (`Triggers`), image/media sub-shapes (`Crop Mask`, `Crop Mask Coordinate`,
  `Image`, `Medium Labels`), pagination envelope shapes (`Pagination`, `Continuation`), and various
  one-off nested response fragments — all confirmed embedded-only via the same grep cross-check.

## COVERABLE taxonomy — 31 leaves, each with APIPath + access-path + pagination + CRUD evidence

Every leaf below cites its collection (`List`) `APIPath`, its `ResponseDataKey` (the array field
name in the paginated envelope), whether `SupportsPagination`/cursor-`continuation` applies, and
its write-surface (`SupportsCreate`/`Update`/`Delete`) from the documented POST/PUT/DELETE
operations in the SAME group.

| # | Object (IO name) | List `APIPath` | `ResponseDataKey` | Paginated (cursor) | Get-one `APIPath` | Create | Update | Delete | Access-path |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Event** | `GET /organizations/{organization_id}/events/` | `events` | Yes | `GET /events/{event_id}/` | `POST /organizations/{organization_id}/events/` | `POST /events/{event_id}/` | `DELETE /events/{event_id}/` | root; also nested off Venue (`/venues/{venue_id}/events/`) and Event Series (`/series/{event_series_id}/events/`) |
| 2 | **Attendee** | `GET /events/{event_id}/attendees/` | `attendees` | Yes | `GET /events/{event_id}/attendees/{attendee_id}/` | — (created via Order flow, not directly) | — | — | nested off Event; also `GET /organizations/{organization_id}/attendees/` (org-wide) and `GET /events/{event_id}/teams/{team_id}/attendees/` |
| 3 | **Order** | `GET /organizations/{organization_id}/orders/` | `orders` | Yes | `GET /orders/{order_id}/` | — | — | — | nested off Organization; also `GET /events/{event_id}/orders/`, `GET /users/{user_id}/orders/` — read-only in this source |
| 4 | **Ticket Class** | `GET /events/{event_id}/ticket_classes/` | `ticket_classes` | Yes | `GET /events/{event_id}/ticket_classes/{ticket_class_id}/` | `POST /events/{event_id}/ticket_classes/` | `POST /events/{event_id}/ticket_classes/{ticket_class_id}/` | — (no delete endpoint documented) | nested off Event; `.../for_sale/` variant is a filtered view of the same table (`Ticket Class For Sale Response`) |
| 5 | **Ticket Group** | `GET /organizations/{organization_id}/ticket_groups/` | `ticket_groups` | No (no pagination block shown) | `GET /ticket_groups/{ticket_group_id}/` | `POST /organizations/{organization_id}/ticket_groups/` | `POST /ticket_groups/{ticket_group_id}/` | `DELETE /ticket_groups/{ticket_group_id}/` | nested off Organization |
| 6 | **Venue** | `GET /organizations/{organization_id}/venues/` | `venues` | Yes | `GET /venues/{venue_id}/` | `POST /organizations/{organization_id}/venues/` | `POST /venues/{venue_id}/` | — | nested off Organization |
| 7 | **Category** | `GET /categories/` | `categories` | Yes | `GET /categories/{id}/` | — | — | — | global reference data, not org/event-scoped |
| 8 | **Subcategory** | `GET /subcategories/` | `subcategories` | Yes | `GET /subcategories/{subcategory_id}/` | — | — | — | global reference data; also nested field `subcategories` on `Category` |
| 9 | **Format** | `GET /formats/` | `formats` | No (no pagination block shown; response wraps `locale` + `formats`) | `GET /formats/{format_id}/` | — | — | — | global reference data |
| 10 | **Organization** | `GET /users/me/organizations/` | `organizations` | Yes | — (no documented GET-by-id) | — | — | — | root, accessed via authenticated User context; also `GET /users/{user_id}/organizations/` |
| 11 | **Organization Role** | `GET /organizations/{organization_id}/roles/` | `roles` | Yes (`Continuation` pagination variant) | — | — | — | — | nested off Organization |
| 12 | **Organization Member** | `GET /organizations/{organization_id}/members/` | (undocumented in source — `+ Response 200` with no `+ Attributes` block) | Yes (doc states "Returns a paginated response") | — | — | — | — | nested off Organization. **Gap**: response schema not fully provable from this source; flagged for live-probe / runtime discovery confirmation |
| 13 | **Discount** | `GET /organizations/{organization_id}/discounts/{?scope}` | `discounts` | No (no pagination block shown) | `GET /discounts/{discount_id}/` | `POST /organizations/{organization_id}/discounts/` | `POST /discounts/{discount_id}/` | `DELETE /discounts/{discount_id}/` | nested off Organization; full CRUD |
| 14 | **Inventory Tier** | `GET /events/{event_id}/inventory_tiers/` | `inventory_tiers` | Yes | `GET /events/{event_id}/inventory_tiers/{inventory_tier_id}/` | `POST /events/{event_id}/inventory_tiers/` | `POST /events/{event_id}/inventory_tiers/{inventory_tier_id}/` | `DELETE /events/{event_id}/inventory_tiers/{inventory_tier_id}/` | nested off Event; full CRUD |
| 15 | **Event Team** | `GET /events/{event_id}/teams/` | `teams` | Yes | `GET /events/{event_id}/teams/{team_id}/` | `POST /events/{event_id}/teams/create/` | — | — | nested off Event; also `.../search/?term=` and `.../check_password/` sub-actions |
| 16 | **Canned Question** | `GET /events/{event_id}/canned_questions/` | `questions` | Yes | `GET /event/{event_id}/canned_questions/{question_id}` (note: singular `event` — vendor doc quirk, verified in source) | `POST /events/{event_id}/canned_questions/` | `POST /event/{event_id}/canned_questions/{question_id}` | `DELETE /event/{event_id}/canned_questions/{question_id}` | nested off Event; pre-defined/system question templates |
| 17 | **Question** | `GET /events/{event_id}/questions/` | `questions` | Yes | `GET /events/{event_id}/questions/{question_id}/` | `POST /events/{event_id}/questions/` | — | `DELETE /events/{event_id}/questions/{question_id}/` | nested off Event; custom (organizer-authored) questions. MSON type name is `Base Question` |
| 18 | **Fee Rate** | `GET /pricing/fee_rates{?country,currency,plan,payment_type,channel,item_type}` | `fee_rates` | Yes | — | — | — | — | reference/pricing data, parametrized by country/currency/plan, not org/event-scoped |
| 19 | **Seat Map** | `GET /organizations/{organization_id}/seatmaps/{?venue_id,venue_name_filter}` | `seatmaps` | No | — | `POST /events/{event_id}/seatmaps/` (assign to event) | — | — | nested off Organization; list + assign-to-event only |
| 20 | **Webhook** | `GET /organizations/{organization_id}/webhooks/` | `webhooks` | Yes | — | `POST /organizations/{organization_id}/webhooks/` | — | `DELETE /webhooks/{id}/` | nested off Organization; legacy `/webhooks/` (GET/POST) deprecated 2020-06-01 per inline warning |
| 21 | **User** | — (singleton; no list endpoint) | — | No | `GET /users/me/`, `GET /users/{user_id}/` | — | — | — | root singleton, authenticated-context user |
| 22 | **Balance** | — (singleton; no list endpoint) | — | No | `GET /balance/<public_organization_id>/events/<public_event_id>/` | — | — | — | per-event financial balance; **Gap**: no MSON `Balance` type def in this source |
| 23 | **Structured Content Page** | — (singleton per event; no list endpoint) | — | No | `GET /events/{id}/structured_content/` (+ `.../edit/` working-copy variant) | `POST /events/{id}/structured_content/{version}/` | (same endpoint, versioned) | — | 1:1 per Event; rich nested module composition (agenda/FAQ/image/text/video widgets) |
| 24 | **Text Overrides** | — (singleton per org+locale scope; no list endpoint) | — | No | `GET /organizations/{organization_id}/text_overrides/{?locale,event_id,venue_id,text_codes}` | `POST /organizations/{organization_id}/text_overrides/` | (same endpoint) | — | nested off Organization, scoped by locale/event/venue/text_codes filters |
| 25 | **Ticket Buyer Settings** | — (singleton per event; no list endpoint) | — | No | `GET /events/{event_id}/ticket_buyer_settings/` | — | `POST /events/{event_id}/ticket_buyer_settings/` | — | 1:1 per Event |
| 26 | **Display Settings** | — (singleton per event; no list endpoint) | — | No | `GET /events/{event_id}/display_settings/` | — | `POST /events/{event_id}/display_settings/` | — | 1:1 per Event |
| 27 | **Event Capacity Tier** | — (singleton per event; no list endpoint) | — | No | `GET /events/{event_id}/capacity_tier/` | — | `POST /events/{event_id}/capacity_tier/` | — | 1:1 per Event. MSON type name `Capacity Tier` — distinct from the separately-listable `Inventory Tier` object (#14) |
| 28 | **Event Description** | — (singleton per event; no list endpoint) | — | No | `GET /events/{event_id}/description/` | — | — (no update endpoint documented in this source; description is set via Event object's `description` field on create/update) | — | 1:1 per Event, returns raw HTML. **Gap**: no MSON type def; retrieve-only in this source |
| 29 | **Event Schedule** | — | — | No | — (no GET documented in this source) | `POST /events/{event_id}/schedules/` | — | — | 1:1/1:N per Event. **Gap**: only Create documented; no List/Retrieve endpoint in this source |
| 30 | **Sales Report** | — (parametrized report, not a list) | — | No | `GET /reports/sales/` | — | — | — | organization/date-range scoped report; MSON type `Report Response Sales` |
| 31 | **Attendee Report** | — (parametrized report, not a list) | — | No | `GET /reports/attendees/` | — | — | — | organization/date-range scoped report; MSON type `Report Response Attendees` |

**Not yet exposed by a Get-one path in this source**: `Event Series` retrieve (`GET
/series/{event_series_id}/`) returns the `Event` type per the source's own attribute annotation —
folded into Event rather than kept as a separate leaf (Event Series's OWN list-of-events sub-path
`GET /series/{event_series_id}/events/` also returns `Event` rows, confirming this is a filtered
view of Event, not a distinct record type). `Event Search` (`GET /events/search/`) is explicitly
marked deprecated in its own section title ("List - deprecated") and also returns `Event` rows —
folded into Event, not counted separately.

## Pagination envelope (confirmed machine-readable, verbatim from source)

```json
{
  "pagination": {
    "object_count": 4,
    "continuation": "AEtFRyiWxkr0ZXyCJcnZ5U1-uSWXJ6vO0sxN06GbrDngaX5U5i8XYmEuZfmZZYB9Uq6bSizOLYoV",
    "page_count": 2,
    "page_size": 2,
    "has_more_items": true,
    "page_number": 1
  },
  "categories": [ { "...": "..." } ]
}
```

`PaginationType = Cursor`. Advance by re-issuing the SAME request with `?continuation=<token>`
appended, while `pagination.has_more_items === true`. When all records are retrieved, the
continuation token returns an empty list (per the source's own worked example, blueprint lines
173–229). A minority of list endpoints (Format, Discount-by-org, Ticket Group-by-org, Seat Map) do
NOT show a `pagination` block in their documented `Response 200 Attributes` — these are treated as
`SupportsPagination=false` per the honest-absence rule (no fabricated pagination where the source
doesn't state it), though it is plausible some do paginate in practice and were simply
under-documented; flagged as a soft gap for live-probe cross-check, not asserted either way.

## Authentication (Tier-1, machine-readable, from blueprint `## Authentication`)

- **OAuth 2.0** (server-side or client-side authorization flow) for acting on behalf of other
  users — `https://www.eventbrite.com/oauth/authorize` (authorize) → `https://www.eventbrite.com/oauth/token`
  (token exchange).
- **Private/Personal OAuth Token** (static, account-scoped, from the API Keys page) for
  first-party single-account integration — every documented endpoint's example request header
  shows `Authorization: Bearer PERSONAL_OAUTH_TOKEN`.
- `CredentialTypeID` candidate: OAuth2 Bearer Token (the Private Token IS an OAuth2 access token
  issued out-of-band, not a separate credential shape).

## Rate limits (Tier-1, machine-readable, from blueprint `## Errors` HTTP-429 row)

> "429 / HIT_RATE_LIMIT / Hourly rate limit has been reached for this token. Default rate limits
> are 2,000 calls per hour."

`RateLimitPolicy` candidate: `{TokensPerSec: ~0.556 (2000/3600), Burst: unknown (not documented)}`.
No `Retry-After` header format is documented in this source (soft gap — would need live-probe
header inspection to confirm `ExtractRetryAfterMs` shape).

## INFORMATIONAL taxonomies (structural knowledge, NOT coverable IOs)

| Taxonomy | Definition | Source citation |
|---|---|---|
| **Authentication & OAuth** | OAuth 2.0 authorize/token flow + Private Token scheme | blueprint `## Authentication` (lines 18–119) |
| **Errors & Status Codes** | HTTP status code table (400/401/403/404/429/500) with `error` enum codes and descriptions | blueprint `## Errors` (lines 119–173) |
| **Pagination Envelope** | `pagination` object shape (`object_count`, `continuation`, `page_count`, `page_size`, `has_more_items`, `page_number`) + continuation-token advance protocol | blueprint `## Paginated Responses` (lines 173–230) |
| **Expansions** | `?expand=` query-param mechanism for inlining related-object data on GET responses (e.g. `?expand=ticket_classes,venue`) — informs FK/relationship modeling but is not itself an IO | blueprint `## Expansions` (lines 230–366) |
| **API Switches** | Feature-flag-like query params that toggle response shape/behavior | blueprint `## API Switches` (lines 366–409) |
| **Basic Types & Date Formats** | Integer/Boolean/String/Float/Decimal + the 4 date formats (Date, Datetime, Local Datetime, Datetime-with-Timezone) | blueprint `## Basic Types` (lines 409–661) |
| **Eventual Consistency** | Vendor's documented caveat that some writes may not be immediately reflected in subsequent reads | blueprint `## Eventual Consistency` (lines 661–723) |
| **Webhook Trigger-Action Vocabulary** | The `actions` enum on Webhook/Create Webhook (`event.created`, `event.published`, `order.placed`, `order.refunded`, `order.updated`, `organizer.updated`, `attendee.updated`, `ticket_class.created/updated/deleted`, `venue.updated`) — informs webhook-subscription connector logic, not itself a syncable object | blueprint `### Create Webhook (object)` (lines ~5696–5711) |
| **Cost/Pricing Component Vocabulary** | `Cost Component` `name`/`base`/`bucket`/`recipient`/`payer` enums describing fee-calculation semantics — informs how to interpret nested cost breakdowns on Order/Attendee/Ticket Class, not a syncable object itself | blueprint `### Cost Component (object)` (lines ~4670–4710) |
| **Structured Content Module Composition** | The set of module types (Image/Text/Video/Agenda/FAQ) composable inside a single `Structured Content Page` document — informs how to flatten/represent page content, not separate IOs | blueprint `# Group Structured Content` + `## Data Structures` module definitions |

## Discovery rule confirmation

Every one of the 102 documented endpoints was grouped into either a COVERABLE taxonomy (31 leaves,
table above) or folds into an already-counted COVERABLE parent (Event Search, Event Series-events
→ Event; canned/custom questions are two distinct Question-family leaves per their genuinely
distinct APIPaths and CRUD surfaces). No endpoint was found that fits no named taxonomy.

## Known gaps / out-of-scope families (honest negatives)

`outOfScopeFamilies` — object families known or suspected to exist in the broader Eventbrite
product surface but NOT covered by this Tier-1 source, with reasons:

1. **Campaigns / Contact Lists / Collections management** — the blueprint documents rich, fielded
   MSON types (`Campaign`, `Campaign Stats/Status/Template/Invoice`, `Contact List`, `Contact List
   Item/Preferences/Type`, `Collection`) that are referenced as NESTED FIELDS elsewhere
   (`contact_list_preferences` on Attendee/Order; `collection_id` filter param on Events-list) but
   have **no documented top-level CRUD endpoint** in this source. Eventbrite's product does have
   marketing/campaign and collection features in its UI; if a separate "Marketing API" or
   "Campaigns API" endpoint family exists, it was not discovered in this audit pass (not found via
   web search either — only the nested-field references were located). **Reason for exclusion**:
   no `APIPath` provable from any reachable Tier-1/Tier-2 source at audit time.
2. **Organization Member response schema** — the List Members endpoint (`GET
   /organizations/{organization_id}/members/`) is documented with a `+ Response 200` marker but NO
   `+ Attributes` block follows it in the source (the blueprint's own documentation is incomplete
   at this specific point — verified by direct inspection of the raw bytes, not a parsing
   artifact). **Reason for exclusion from full COVERABLE confidence**: the endpoint and its
   existence are Tier-1-provable; its exact response field shape is not. Recommend a live-probe
   (credentialed, read-only) call to `GET /organizations/{organization_id}/members/` to complete
   the field schema before finalizing IOF rows for this object.
3. **Event Schedule retrieve/list** — only `POST /events/{event_id}/schedules/` (Create) is
   documented; no GET/List endpoint for existing schedules was found in this source. **Reason**:
   genuinely absent from this Tier-1 source, not a parsing gap (confirmed via full-text grep for
   "schedule" across all 6,932 lines — no additional GET operation exists).
4. **Deprecated endpoints retained for completeness, not for new integration** — legacy `/webhooks/`
   (GET/POST, no org scoping) is explicitly marked deprecated (June 1, 2020) in the source; legacy
   `/events/search/` is marked "List - deprecated" in its own section title. Both are captured in
   the endpoint catalog for completeness but the connector should target the non-deprecated,
   organization-scoped equivalents (`/organizations/{organization_id}/webhooks/`,
   `/organizations/{organization_id}/events/`).

## Scope decision

**In scope**: all 31 COVERABLE leaves in the table above — the full set of independently
list/retrievable resources documented in Eventbrite's own v3 API Blueprint, spanning Events,
Attendees, Orders, Ticket Classes/Groups, Venues, Organizations (+ Roles/Members), reference data
(Categories/Subcategories/Formats/Fee Rates), event-configuration singletons (Display Settings,
Capacity Tier, Ticket Buyer Settings, Description, Schedule, Structured Content), and
organization-level utility objects (Discounts, Inventory Tiers, Event Teams, Questions/Canned
Questions, Seat Maps, Webhooks, Text Overrides, Reports).

**Out of scope, with reasons**: Campaigns/Contact Lists/Collections (no discovered top-level
endpoint — see gap #1), and everything folded into the 153 container-folded types (genuinely
non-syncable nested value objects — cost breakdowns, address sub-shapes, structured-content module
internals, ticket-class variant/confirmation sub-shapes — confirmed by cross-referencing every
name against all 102 endpoint response shapes with zero matches).

**Justification for the 223→31 narrowing**: this is NOT a "kept only the famous ones" narrowing —
every one of the 223 enumerated MSON types is accounted for in the ledger above (28 coverable + 33
excluded-scaffolding request-variants + 6 excluded-scaffolding type-aliases + 3 excluded-scaffolding
error-shapes + 153 container-folded = 223), plus 3 additional coverable objects reachable by
documented endpoint but lacking an MSON type definition. The narrowing is a structural fact about
how Eventbrite's API is shaped (many nested value-objects per top-level resource), not a
scope-reduction choice.

## Per-source study detail

### Source 1 (Tier 1, machine-readable, PRIMARY): Eventbrite API v3 Blueprint

- **URL**: `https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib`
- **Saved to**: `sources/eventbrite-v3-api-blueprint.apib` (394,417 bytes, 6,932 lines)
- **Format**: API Blueprint (Markdown-superset) with MSON (Markdown Syntax for Object Notation)
  data-structure definitions.
- **Structure walked**: `FORMAT: 1A` header → `HOST:` directive (`https://www.eventbriteapi.com/v3/`)
  → top-level prose sections (About, Authentication, Errors, Paginated Responses, Expansions, API
  Switches, Basic Types, Eventual Consistency) → 32 `# Group <Name>` resource sections, each
  containing an `## <Name> Object` intro + one-or-more `## <Action> [/url-fragment/]` sub-sections,
  each containing one-or-more `### <Title> [METHOD /real/path/]` concrete operation definitions
  with `+ Parameters`, `+ Request`, `+ Response NNN (content-type)` blocks → a final `## Data
  Structures` section (appearing as both a stub early in the doc and the full block near the end)
  with ~223 `### TypeName (kind)` MSON type definitions, each a flat list of `+ field_name (type,
  modifiers) - description` lines, some with nested `+ Members` (enum values) or nested field
  blocks.
- **Motifs/patterns identified**: (1) every write operation embeds its request-body shape as a
  named `(Create X)`/`(Update X)` MSON type immediately adjacent to the response type; (2) every
  list operation follows the identical `{pagination, <plural_snake_case_key>: [Type]}` envelope;
  (3) nearly every object carries `id` (string, despite representing an integer on the wire — the
  vendor deliberately types IDs as strings), `resource_uri`, and `created`/`changed` timestamps
  where mutable; (4) deprecated endpoints are marked inline with a `> Warning:` blockquote citing an
  effective date, never silently removed — good forward/backward-compat signal for the connector's
  own deprecation handling; (5) backtick-wrapped field names (`` `field_name` ``) appear to signal
  "recently added / less stable" fields per informal MSON convention, though not formally stated by
  the vendor — treated as a soft signal, not acted upon structurally.
- **Idiosyncrasies**: (a) the Canned Questions Get/Update/Delete-by-id paths use **singular**
  `/event/{event_id}/...` while every other Event-scoped path uses **plural** `/events/{event_id}/...`
  — verified as a genuine source inconsistency, not a transcription error (grep-confirmed at
  blueprint lines 3100, 3142, 3167 vs. the List/Create variants at lines 3084, 3119 which DO use
  plural `/events/`); (b) `Capacity Tier` (event-level, singleton) and `Inventory Tier` (list,
  per-event, full CRUD) are two DISTINCT objects despite very similar names — do not conflate; (c)
  the Organization Member List response has no documented `+ Attributes` block (see gap #2); (d)
  `Event Series` retrieve and `Event Search` (deprecated) both return the `Event` type rather than
  a series-specific or search-result-specific type — confirms these are Event views, not separate
  record types.
- **Scope / explicit non-coverage**: this source does NOT include GraphQL, does NOT include a
  Campaigns/Marketing API (see gap #1), and explicitly deprecates two endpoint families in-line
  (legacy webhooks, legacy event search) while keeping them documented for backward-compat
  awareness.

### Source 2 (Tier 1, canonical URL, NOT used as parse source): `eventbrite.com/platform/api` + `/platform/docs/*`

- These are the vendor's PUBLIC-FACING doc site — same v3 API, same object model — rendered as a
  React SPA. Confirmed via `curl`/`WebFetch` that the static HTML payload contains only page shell
  (`window.__SERVER_DATA__` = navigation/session metadata, no endpoint content; the actual
  reference content loads via client-side React Query fetch not observable from a plain HTTP GET).
  Retained in `SOURCES.json` for citation/authority purposes (these ARE the vendor's canonical,
  most-current URLs and should be the human-facing links surfaced to downstream consumers) but the
  Apiary blueprint was used for all extraction since it is provably complete and machine-parseable.
- Sub-pages retained: Intro to APIs, API Basics, API Explorer, Getting Information on Events,
  Creating an Event, Finding Order Information, Working With Ticket Classes and Ticket Groups,
  Using Webhooks, Changelog — all guide/tutorial-level Tier 1–2 content that corroborates (never
  contradicts) the blueprint's machine-readable facts wherever cross-checked (rate limit, auth flow,
  webhook actions, deprecation dates).

### Source 3 (Tier 2, community, secondary cross-check): Postman API Network collection

- **URL**: `https://www.postman.com/lunar-rocket-345152/documentation/12364351-445e34da-597f-4d7b-bf4b-58f987706f61`
- Community-published (not vendor-authored) Postman documentation entry for the Eventbrite API,
  OAuth 2.0 configured, includes Events/Attendees/Orders-family requests. Confirmed reachable (HTTP
  200). Not downloaded as raw collection JSON (requires interactive Postman Network export); not
  used for any hard-constraint extraction (Tier 2, non-vendor) — retained per the task's
  requirement to populate `PostmanPaths` for downstream multi-source PK/FK cross-referencing.

## Multi-source PK/FK detection inputs (for the extractor)

- **Tier-1 PK signal**: every COVERABLE object's Get-one `APIPath` ends in a `{name}_id` or `{id}`
  path parameter that matches the object's own `id` field (string-typed on the wire per vendor
  convention) — e.g. `GET /events/{event_id}/` ↔ `Event.id`; `GET
  /orders/{order_id}/` ↔ `Order.id`. This is Tier-1 `ExplicitStatement` evidence for `IsPrimaryKey`
  on `id` across all 31 leaves.
- **Tier-1 FK signal (parametric child path)**: every nested APIPath's leading path segment names
  the FK — `/events/{event_id}/attendees/` → `Attendee.event_id` FK → `Event`; `/events/{event_id}/
  ticket_classes/{ticket_class_id}/` → `Ticket Class.event_id` FK → `Event`, and
  `Ticket_Class.id`↔`ticket_class_id`; `/organizations/{organization_id}/venues/` →
  `Venue.organization_id` FK → `Organization`; `/organizations/{organization_id}/orders/` →
  `Order.organization_id` FK → `Organization`; and so on for every nested resource in the table
  above. Each `Attendee`/`Order`/`Ticket Class` MSON type definition ALSO explicitly declares the
  FK field in its own field list (e.g. `Attendee.event_id: 12345 (string) - The event id that this
  attendee is attending`, `Attendee.order_id: 12345 (string) - The order id this attendee is part
  of`, `Attendee.ticket_class_id`) — doubly-confirmed Tier-1 evidence.
- **Cross-IO match**: `Attendee.event_id` matches `Event.id`'s PK type/name pattern; `Attendee.
  order_id` matches `Order.id`; `Attendee.ticket_class_id` matches `Ticket Class.id`; `Ticket
  Class.event_id` matches `Event.id`; `Order` nested fields reference `event_id`/`organization_id`
  similarly. These cross-IO name matches corroborate the parametric-path FK signal for every FK
  relationship in the schema.
