# Path LMS — connector groundwork (overnight research 2026-06-10)

Researched credential-free from public docs so the morning build is execution, not discovery. **Path LMS is a GraphQL-source connector** (different shape from PropFuel's file feed) — which is why the GraphQL machinery matters.

## API shape (Path LMS *Reporting API*, by Blue Sky eLearn / Cadmium)
- **Base URL:** `https://data-api.pathlms.com`
- **Protocol:** **GraphQL** — queries POST to `https://data-api.pathlms.com/graphql`. (Also a CSV export at `POST /api/v1/csv`.)
- **Auth (client-credentials → bearer):**
  - `POST /api/v1/getToken`, `Content-Type: application/x-www-form-urlencoded`, params `applicationId` (Client ID) + `applicationSecret` (Client Secret).
  - Response `{"token":"Bearer <jwt>"}`; **valid 12h**; send as `Authorization: <token>`.
  - **Credential schema:** `{ applicationId, applicationSecret }`. **Gated** (CSM-issued by Blue Sky) → broker-held (user restarted broker for this).
- **Pagination:** **offset-based** — `offset` (default 0) + `limit` (default 50, **max 150**). → `PaginationType=Offset`.
- **Incremental lever:** `startDate`/`endDate` (`YYYY-MM-DD`, required on most reports). Watermark strategy: advance `startDate` to the prior run's `endDate` (date-range incremental, not a row cursor). Confirm per-query whether a per-record `updatedAt` exists for finer incrementality.
- **Other filters:** `withArchived`, `pastEvents`, `courseIds`/`teamIds`/`userIds`/`uid`, `webinarIds`, metadata template ids.
- **Rate limits:** not documented → use a conservative `RateLimitPolicy`, parse any `Retry-After`.
- **Capabilities:** **read-only** (Reporting API) → `SupportsGet/Read=true`, Create/Update/Delete=false.

## Objects (root: `account`, `teams`, `teamsList`)
~30 report queries → candidate IOs: `users`, `courses`, `coursePresentations`, `events`, `assessmentsReport`, `assignmentsReport`, `surveysReport`, `scormReport`, `certificatesReport`, `certifiedCreditsReport`, `creditsCompletedReport`, `inPersonEventsReport`, `liveWebEventsReport` (+ attendees/registrations/archive-viewers/guests/cancellations), `externalActivityReport`, `ordersReport`, `orderItemsReport`, `productCatalogReport`, `refundsReport`/`refundsDetailsReport`, `coupons`, `discounts`, `salesByCategoryReport`, `salesByUserReport`, `salesByBundleReport`, `commerceSalesByContentReport`(+Details), `courseItemViewsReport`, `courseUserVisits`, `userPresentationsReport`, `metadata`/`userMetadata` (+ templates).
72+ types: `User`, `Course`, `CourseItem`, `Event`, `Webinar`, `InPersonEvent`, `Assessment`, `Assignment`, `Survey`, `Scorm`, `Certificate`, `CertifiedCredit`, `Completion`, `Order`, `OrderItem`, `Coupon`, `Discount`, `Refund`, `ProductCatalog`, `Group`, `Metadata`, …

## Build plan (morning, with agent arc + broker)
1. **Class:** `PathLMSConnector extends BaseRESTIntegrationConnector`, `@RegisterClass(BaseIntegrationConnector,'PathLMSConnector')`, `IntegrationName` getter = exact MJ Integrations.Name.
2. **Auth:** `Authenticate` → POST `/api/v1/getToken` (form-encoded), cache the bearer 12h (use `OAuth2TokenManager`-style caching). `BuildHeaders` → `Authorization: <token>`.
3. **GraphQL over HTTP:** `MakeHTTPRequest` POSTs `{query, variables}` to `/graphql`; `NormalizeResponse` strips the `data.account.<query>` envelope to the record array.
4. **Discovery:** object catalog is **documented (credential-free)** → seed `Declared` IOs (the ~30 queries). Per-field schema → GraphQL **introspection is auth-gated** → runtime `Discovered` via `DiscoverFields` (introspect the SDL after connect), OR from doc examples. (The new flatten fix handles any nested GraphQL objects automatically.)
5. **FetchChanges:** per IO, POST its GraphQL query with `offset`/`limit≤150` paging + `startDate`/`endDate`; track max as watermark.
6. **PK/identity:** each type's scalar `id` (User.id, Course.id, …). The flatten fix means nested sub-objects → scalar columns automatically.
7. **Capabilities:** read-only; `SupportsIncrementalSync=true` via date-range; `PaginationType=Offset`.

## ⚠️ The "GQL endpoints" connection (your emphasis)
Two distinct GraphQL layers, both must work:
1. **MJ integration GraphQL API** (the connector lifecycle) — ✅ tested tonight (see PropFuel findings, 11/11 read + 5 lifecycle mutations).
2. **Path LMS as a GraphQL *source*** — the connector must POST GraphQL queries + parse responses. The framework supports this (REST base + `MakeHTTPRequest`/`NormalizeResponse` over `/graphql`), but **no shipped connector exercises a GraphQL source yet** — Path LMS will be the first, so the GraphQL-source path (auth → query → paginate → normalize → flatten → dedup) needs its first real live proof. Worth a focused morning check.

## Open questions for the morning
- Confirm the GraphQL response envelope shape (`data.account.<query>.{items,total}`? nested?) from a real probe via the broker.
- Per-record `updatedAt` for true incremental vs date-range-only?
- Which of the ~30 reports are the in-scope subset (vs out-of-scope, per the scope-decision rule)?
