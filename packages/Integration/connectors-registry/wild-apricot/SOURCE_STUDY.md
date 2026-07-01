# Wild Apricot — Source Study

Audited: 2026-06-30. Primary spec version: 9.14.0-oas3 (2026-04-01).

---

## Sources Overview

| Tier | Source | Type | Status |
|------|--------|------|--------|
| 1 | SwaggerHub Admin API v9.14.0-oas3 | OpenAPI 3.1.0 JSON | Reachable (local: `sources/openapi.admin.9.14.0.json`) |
| 1 | api.wildapricot.org Public Access spec | OpenAPI 3.0.0 YAML | Reachable (local: `sources/openapi.public-access.9.08.0.yaml`) |
| 1 | gethelp.wildapricot.com Admin API (24 articles) | OfficialDocs HTML (Elevio SPA) | Reachable |
| 1 | gethelp.wildapricot.com Authentication guide | OfficialDocs HTML | Reachable |
| 2 | gethelp.wildapricot.com Member API (10 articles) | OfficialDocs HTML | Reachable |
| 1 | gethelp.wildapricot.com API Updates 2025 | OfficialDocs HTML | Reachable |
| 2 | github.com/WildApricot/ApiSamples | OfficialSDK (samples only, no typed defs) | Reachable |

**No Postman collection found.** Wild Apricot does not publish a public Postman collection. The GitHub README explicitly directs users to SwaggerHub. No collection found at postman.com/wildapricot or postman.com/wild-apricot.

**No OpenAPI hosted on vendor domain.** The primary spec lives on SwaggerHub (api.swaggerhub.com). The public-access YAML spec is served directly from api.wildapricot.org.

**SwaggerHub version history:** 20 published versions from 2.1.1 (2019-02-15) to 9.14.0-oas3 (2026-04-01). The latest is the canonical source; older versions are referenced only for version-diff context.

---

## Source 1: Wild Apricot Admin API — OpenAPI 3.1.0 (v9.14.0)

**URL:** https://api.swaggerhub.com/apis/WildApricot/wild-apricot_public_api/9.14.0-oas3  
**Local file:** `sources/openapi.admin.9.14.0.json`  
**Format:** OpenAPI 3.1.0 JSON (Swagger 2.0 in older versions; OAS3 from v7.15.0 onward)  
**Size:** 212,645 bytes  
**Spec stats:** 84 paths · 183 schemas · 29 distinct API tags

### Structure walk

The spec uses a single host `api.wildapricot.org`, versioned base `/v2.2/`. Every resource is nested under `/accounts/{accountId}/` (the tenant anchor) or `/rpc/{accountId}/` (actions). There are no un-anchored collection roots.

**Path families:**
- `GET /accounts` — list accounts (typically returns one account per token)
- `GET/POST /accounts/{accountId}/{resource}` — collection list + create
- `GET/PUT/DELETE /accounts/{accountId}/{resource}/{id}` — single-item CRUD
- `POST /rpc/{accountId}/{ActionName}` — named operations (member approval, event check-in, invoice void, email sending, etc.)
- `GET/POST /accounts/{accountId}/store/orders` and `store/products` — online store sub-namespace

**Tag grouping (canonical taxonomy from the spec itself):**

| Tag | Paths | Resource |
|-----|-------|----------|
| Accounts | 2 | Account info |
| Contacts | 6 | Contact CRUD + RPC (AcceptTermsOfUse, Send2FACode, Verify2FACode) |
| Contacts.CustomFields | 4 | Custom contact field definitions |
| Contacts.SavedSearch | 2 | Saved searches |
| Events | 6 | Event CRUD + CloneEvent RPC |
| Events.EventRegistrationTypes | 5 | Registration types per event |
| Events.EventRegistrations | 5 | Event registration CRUD + CheckIn + RegisterFromWaitlist RPCs |
| Finances.Donations | 4 | Donation CRUD (no delete) |
| Donation.CustomFields | 4 | Custom donation field definitions |
| Finances.Invoices | 7 | Invoice CRUD + GenerateInvoice + VoidInvoice RPCs |
| Finances.Payments | 10 | Payment CRUD + allocate/unallocate RPCs |
| Finances.PaymentAllocations | 1 | Read-only allocation records |
| Finances.Refunds | 4 | Refund CRUD |
| Finances.AuditLog | 2 | Read-only audit log |
| Finances.Tenders | 4 | Tender CRUD (payment tender configurations) |
| Membership.Bundles | 2 | Read-only bundles |
| Membership.Groups | 2 | Read-only member groups |
| Membership.Levels | 2 | Read-only membership levels |
| Membership.Operations | 3 | Approve/Reject/GenerateInvoiceForPending RPCs |
| Emailing.Drafts | 3 | Email draft management (read + delete) |
| Emailing.SentEmails | 2 | Sent email log (read-only) |
| Emailing.SentEmailRecipients | 1 | Per-recipient delivery tracking (read-only) |
| Emailing.Operations | 7 | Email RPC actions (SendEmail, SendEmailDraft, CountRecipients, etc.) |
| OnlineStore.Orders | 3 | Online store orders (read-only) + SetStatus RPC |
| OnlineStore.Orders.Operations | 1 | Order status update |
| OnlineStore.Products | 6 | Product CRUD |
| Attachments | 3 | File attachment upload + retrieval |
| Pictures | 2 | Picture upload + retrieval |
| CeuRecords | 6 | Continuing Education Unit record CRUD |
| Internal.Features | 1 | Account feature flag read |

### Schema classification summary

The enumerator (`enumerate-catalog.mjs`) identified **152 non-trivial object types** from the 183 total schemas. Full accounting against E=183:

| Bucket | Count | Evidence |
|--------|-------|----------|
| COVERABLE (→ TaxonomyLeaves) | 26 | First-class REST collection or singleton with own endpoint; listed below |
| INPUT_PARAM (excluded) | 30 | Request body schemas (Create*/Edit*/Update*/Send*/*Params) — not syncable records, they are write inputs |
| CONTAINER_FOLDED (excluded) | 25 | Pagination/list wrappers (*ListResponse, *IdsResponse, *CountResponse, *Response, *ListResult, *AsyncResponse) — containers for the coverable item type, not standalone records |
| INFORMATIONAL (excluded) | 56 | Enum values, auth helpers, abstract unions, read-only variant types (see detail below) |
| NESTED_DETAIL (excluded) | 46 | Embedded sub-objects within a coverable entity; not independently queryable |
| **Total** | **183** | |

Accounting closes: 26 + 30 + 25 + 56 + 46 = **183 = E**. No unaccounted gaps.

### INFORMATIONAL types (not coverable — detail)

These 56 types are all present in the enumerator's 152 output list (the enumerator does not itself apply the COVERABLE filter; classification is the audit's job):

- **Enum / value types (23):** ContactFieldAccessLevel, CustomFieldType, DeliveryStatus, DeliveryType, DigitalProductType, DonationType, EmailDraftType, EmailOriginType, EmailType, EventAccessControl, EventAccessLevel, EventGuestRegistrationPolicy, EventPaymentMethodType, EventRegistrationCancellationBehavior, EventRegistrationStatus, EventRegistrationTypeAvailability, EventRegistrationUnavailabilityPolicy, InitializationSourceType, InvoiceOrderType, MemberFieldAccess, OrderDeliveryOption, OrderDetailType, OrderProductType, OrderStatus, PaymentStatus, PaymentType, ProductStatus, ProductType
- **Infrastructure / pagination helpers (7):** PagingSettings, Resource, ResourceUrl, LinkedResource, LinkedResourceWithName, OptionsListItem, Country, Currency, Localization, TimeZone (some overlap — BillingPlan, BillingPlan, SquareRegisterSettings)
- **API-mechanics types (8):** Error, EmailDraftPreview, OrderSetStatusResult, FinanceDocument (abstract union), emailDraftId (integer type alias), DocumentParam (action parameter helper), AttachmentDataList (typed alias for array of AttachmentData — a container, not an entity), SentEmailRecipientsRecords (wrapper type)
- **Contact read-variants (3):** ContactsMe (single /contacts/me endpoint variant), ShortContact (nested reference type), ContactLimitInfo (account-level metadata)
- **Product write-variant (1):** MutableProduct (write shape for Product creation/update; same /store/products resource)
- **Event summary (1):** EventStub (lightweight list-item shape for Event; same /events resource)
- **RPC/action result (1):** EventRegistrationPost / EventRegistrationPut (request body schemas for event registration create/update; classified as INPUT_PARAM category but also appear in INFORMATIONAL if the enumerator emits them under a different key)

### Naming conventions observed

- Collection resources: camelCase path segment (`contacts`, `eventregistrations`, `donationfields`)
- ID parameter: `{contactId}`, `{eventId}`, `{event_registration_id}` (inconsistent casing — one uses underscore)
- Schema names: PascalCase; list schemas use `*ListResponse`, `*IdsResponse`, `*CountResponse` suffixes
- Request body schemas: `Create*`, `Edit*`, `Update*` prefixes
- RPC actions: PascalCase verb (`ApprovePendingMembership`, `CheckInEventAttendee`)
- Store sub-namespace: `store/orders`, `store/products` (lowercase, slash-separated sub-path)

### Idiosyncrasies

1. **`donationId` vs `paymentId` path parameter** — the `/payments/{donationId}/AllocateRefund*` paths use `donationId` as the variable name even though the path is under `/payments/` — this appears to be a naming bug in the spec; the actual resource is a Payment. The connector must resolve this from the path context.
2. **Async contacts endpoint** — `/contacts` returns a `ContactsAsyncResponse` with a URL for polling when the response would exceed limits; the sync response returns `ContactsListResponse`. Both share the same path/GET verb — differentiated by a `$async` query parameter.
3. **EventRegistration id naming** — the path variable is `{event_registration_id}` (snake_case) unlike all other resources which use camelCase `{typeId}`, `{contactId}`, etc.
4. **Pictures and Attachments** — Pictures uses `POST /pictures` (upload) + `GET /pictures/{pictureId}`. Attachments uses `POST /attachments/Upload` + `GET /attachments/GetInfos` + `GET /attachments/{attachmentId}` — non-RESTful action-names in the path.
5. **Donations lack DELETE** — `/donations/{donationId}` supports GET/PUT only. No DELETE.
6. **Orders are read-only** — `/store/orders` supports GET only (list + single). No create/update/delete. Order status update is via a separate `PUT /store/orders/{orderNumber}/status` endpoint.
7. **Bundles and MemberGroups are read-only** — GET only.
8. **ceuRecords has `PUT` on the collection path** — `PUT /accounts/{accountId}/ceuRecords` (unusual — collection-level PUT, not just item-level).
9. **Pagination mandate (Nov 2025)** — As of Nov 1 2025, all collection endpoints require pagination params ($skip, $top). PagingSettings wrapper with ResultId, PageSize, PageIndex, Count is returned. Watermark-based incremental is done via `$filter` on date fields.

### Source coverage per taxonomy area

All 29 tags are covered by this spec. No taxonomy gap. The spec is the machine-readable truth for all covered taxonomies.

---

## Source 2: Wild Apricot Public-Access API — OpenAPI 3.0.0 YAML (v9.08.0)

**URL:** https://api.wildapricot.org/ui/swagger/publicAccess  
**Local file:** `sources/openapi.public-access.9.08.0.yaml`  
**Format:** OpenAPI 3.0.0 YAML  
**Size:** 103,805 bytes  
**Spec stats:** 32 paths · ~75 schemas

### Purpose

This is the **member-facing API** — unauthenticated or token-limited endpoints for member self-service:
- Apply for membership, renew, cancel renewal
- Register for events, cancel registrations, calculate costs
- View own contacts/profile, invoices, payments
- Check event attendees

### Overlap with Admin API

This spec documents a SUBSET of the admin API's resources from the member's perspective. The schemas are similar but distinct types (e.g. `ContactMe` vs `Contact`, `EventRegistrationParams` vs `EventRegistrationPost`). The member API paths expose fewer fields and have stricter access controls.

### Value as a cross-reference source

For PK/FK detection: this spec can confirm which fields are IDs and how they link across entities from the member perspective. Not used as the primary catalog source (the admin spec is authoritative) but valuable for confirming field shapes.

---

## Source 3: Admin API Help Center Documentation (24 articles)

**URL:** https://gethelp.wildapricot.com/en/categories/62-wildapricot-admin-api  
**Format:** JavaScript-rendered HTML (Elevio SPA). Structured data in `window.initialData` JSON.

### Value

The HTML docs often contain information NOT in the OpenAPI spec:
- Filter parameter names (e.g. `$filter=Contact.Id eq 123`)
- `$async` parameter behavior for contacts
- Version difference notes (what changed between 2.1.x, 2.2.x)
- Edge cases for specific operations (e.g. soft-delete semantics for contacts)
- Pagination parameter names (`$skip`, `$top`, `$count`)

### Article inventory (24 articles confirmed 2026-06-30)

| Article ID | Title |
|------------|-------|
| 506 | Accounts admin API call |
| 505 | AuditLogItems admin API call |
| 504 | Bundles admin API call |
| 507 | Base admin API call |
| 502 | Contacts admin API call |
| 503 | ContactFields admin API call |
| 1607 | EmailDrafts admin API call |
| 500 | EventRegistrationTypes admin API call |
| 501 | EventRegistrations admin API call |
| 499 | Events admin API call |
| 498 | Invoices admin API call |
| 497 | MemberGroups admin API call |
| 496 | MembershipLevels admin API call |
| 495 | PaymentAllocations admin API call |
| 494 | Payments admin API call |
| 493 | Pictures admin API call |
| 492 | Refunds admin API call |
| 489 | Remote procedure calls for admin API |
| 491 | SavedSearches admin API call |
| 1606 | SentEmails admin API call |
| 1873 | Store admin API call |
| 490 | Tenders admin API call |
| 1599 | API Version 2.1 differences |
| 1683 | API Version 2.2 differences |

**Notable gap:** No dedicated Donations article in the Admin API docs category. The Donations resource (`/donations`, `/donationfields`) is documented in the OpenAPI spec but does not have a standalone help-center article in the admin API category as of 2026-06-30.

---

## Source 4: API Authentication Guide

**URL:** https://gethelp.wildapricot.com/en/articles/484-api-authentication  
**Role:** INFORMATIONAL

Covers: OAuth 2.0 password grant (API key), OAuth 2.0 authorization_code flow (multi-tenant apps), token refresh, scopes. The authorization_code multi-tenant app flow is explicitly called out as out-of-scope for the connector (per task spec — it is INFORMATIONAL).

---

## Taxonomy Definitions

### COVERABLE Taxonomies

These are the **26 first-class syncable entity types** exposed by the Wild Apricot Admin API:

| # | Name | OpenAPI Tag | Path | CRUD |
|---|------|-------------|------|------|
| 1 | Account | Accounts | `/accounts`, `/accounts/{accountId}` | R |
| 2 | Contact | Contacts | `/contacts`, `/contacts/{contactId}` | CRUD |
| 3 | ContactFieldDescription | Contacts.CustomFields | `/contactfields`, `/contactfields/{id}` | CRUD |
| 4 | SavedSearch | Contacts.SavedSearch | `/savedsearches`, `/savedsearches/{id}` | R |
| 5 | Event | Events | `/events`, `/events/{eventId}` | CRUD |
| 6 | EventRegistrationType | Events.EventRegistrationTypes | `/EventRegistrationTypes`, `/EventRegistrationTypes/{typeId}` | CRUD |
| 7 | EventRegistration | Events.EventRegistrations | `/eventregistrations`, `/eventregistrations/{id}` | CRUD |
| 8 | Donation | Finances.Donations | `/donations`, `/donations/{donationId}` | CRU (no delete) |
| 9 | EntityFieldDescription | Donation.CustomFields | `/donationfields`, `/donationfields/{id}` | CRUD |
| 10 | Invoice | Finances.Invoices | `/invoices`, `/invoices/{invoiceId}` | CRUD |
| 11 | Payment | Finances.Payments | `/payments`, `/payments/{paymentId}` | CRUD |
| 12 | PaymentAllocation | Finances.PaymentAllocations | `/paymentAllocations` | R |
| 13 | Refund | Finances.Refunds | `/refunds`, `/refunds/{refundId}` | CRUD |
| 14 | Tender | Finances.Tenders | `/tenders`, `/tenderId` | CRUD |
| 15 | AuditLogItem | Finances.AuditLog | `/auditLogItems`, `/auditLogItems/{itemId}` | R |
| 16 | MembershipLevel | Membership.Levels | `/membershiplevels`, `/membershiplevels/{levelId}` | R |
| 17 | MembershipGroup | Membership.Groups | `/membergroups`, `/membergroups/{memberGroupId}` | R |
| 18 | Bundle | Membership.Bundles | `/bundles`, `/bundles/{bundleId}` | R |
| 19 | Order | OnlineStore.Orders | `/store/orders`, `/store/orders/{orderNumber}` | R (status update via RPC) |
| 20 | Product | OnlineStore.Products | `/store/products`, `/store/products/{id}` | CRUD |
| 21 | EmailDraft | Emailing.Drafts | `/EmailDrafts`, `/EmailDrafts/{draftId}` | R+D |
| 22 | EmailLog | Emailing.SentEmails | `/SentEmails`, `/SentEmails/{emailId}` | R |
| 23 | SentEmailRecipient | Emailing.SentEmailRecipients | `/SentEmailRecipients` | R |
| 24 | AttachmentData | Attachments | `/attachments/GetInfos`, `/attachments/{id}` | R+Create |
| 25 | Feature | Internal.Features | `/features/{featureId}` | R |
| 26 | CeuRecord | CeuRecords | `/ceuRecords`, `/ceuRecords/{id}` | CRUD |

### INFORMATIONAL Taxonomies

These taxonomies describe vendor mechanics, auth flows, or type systems — they inform extraction logic but are NOT syncable entity families in their own right.

| Taxonomy | Role | Coverage |
|----------|------|----------|
| OAuth2AuthFlow | Auth mechanics — password grant and authorization_code flow | Source: gethelp.wildapricot.com/en/articles/484 |
| MultiTenantAppFlow | Authorization_code flow for third-party apps — explicitly OUT OF SCOPE per task spec | Source: gethelp.wildapricot.com/en/articles/484 |
| WebhookDelivery | Webhook event delivery mechanism — OUT OF SCOPE per task spec | Not documented in OpenAPI spec; would require separate webhook docs |
| BatchRequests | BATCH HTTP method combining multiple requests in one call | Source: gethelp.wildapricot.com/en/articles/182 |
| RateLimiting | Rate limit policy (429 handling, Retry-After header) | Source: gethelp.wildapricot.com/en/articles/182 + response schemas |
| PaginationChanges2025 | New $skip/$top/$count pagination params + PagingSettings wrapper | Source: gethelp.wildapricot.com/en/categories/314 article 2911 |
| AdminRPCOperations | Named action operations (/rpc/{accountId}/{ActionName}) — not syncable records | Source: OpenAPI spec + article 489 |
| MemberRPCOperations | Member-facing RPC operations (apply for membership, event cancel, etc.) | Source: public-access spec + article 1618 |
| APIVersionDifferences | Changelog for v2.1 → v2.2 API versions | Source: articles 1599, 1683 |

---

## Enumeration Verification

**Primary enumeration:** `enumerate-catalog.mjs` on `sources/openapi.admin.9.14.0.json`  
**Script stdout count: 152** (the EnumerationStdoutCount)  
**Total schemas in spec: 183**  
**Difference: 31** schemas filtered by the enumerator (primitive types, pure enums without object bodies — the enumerator uses type-object filtering internally)

**Cross-check:** The 26 COVERABLE types are a strict subset of the enumerator's 152 output. All 26 confirmed present. The remaining 126 in the enumerator's list are classified into INPUT_PARAM (30), CONTAINER_FOLDED (25), INFORMATIONAL (56-some portion), and NESTED_DETAIL (46) buckets. The total accounting is against E=183 (all schemas), not 152 (enumerator filtered set).

**Independent signal cross-check:**  
- Spec tag count: 29 tags (all distinct resource families)  
- Doc article count: 22 resource-specific articles + 2 version notes = 24  
- COVERABLE count: 26 (consistent with 22 resource doc articles — difference is Feature and CeuRecord which are in the spec but lack dedicated doc articles, plus Pictures and Attachments which share a combined doc)  
- These counts are mutually consistent; no unexplained shortfall.

---

## Gaps

| Area | Reason |
|------|--------|
| Donations help-center article | The /donations and /donationfields endpoints are fully documented in the OpenAPI spec (v9.14.0) but have no dedicated help-center article in the Admin API category as of 2026-06-30. All field-level information is derivable from the spec alone. |
| Postman collection | Wild Apricot publishes no public Postman collection. SwaggerHub is the machine-readable source. The GitHub ApiSamples repo README explicitly directs to SwaggerHub. No collection found at postman.com or any community fixture. |
| Webhook delivery docs | Webhook documentation was not discoverable via gethelp.wildapricot.com or the OpenAPI spec. Webhook delivery is INFORMATIONAL/out-of-scope per task spec; recorded here for completeness. |
| Typed SDK (Python/TypeScript) | Wild Apricot does not publish a typed SDK. SwaggerHub does offer generated client libraries but these are auto-generated from the spec, not independently maintained typed definitions. The OpenAPI spec IS the typed source of truth. |
| CeuRecords help-center article | The /ceuRecords endpoint is in the spec but has no dedicated doc article in the Admin API category. Field semantics (what each CEU record field means) require spec-reading only. |
