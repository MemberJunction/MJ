# YourMembership — Source Study

**Vendor**: YourMembership (a Community Brands AMS product)
**Parent**: Community Brands HoldCo, LLC
**API Base**: `https://ws.yourmembership.com`
**Stack**: ServiceStack 5.0.2 on .NET, Cloudflare-fronted
**Studied**: 2026-05-30

---

## 1. Headline finding

Contrary to the "YM docs are gated/scattered" prior, the vendor publishes a **complete, machine-readable Swagger 2.0 / OpenAPI spec at `https://ws.yourmembership.com/openapi`** — unauthenticated GET, 1.1 MB, 297 paths, 656 schema definitions. The spec is anchored by an official landing page (`yourmembership.com/api/`) that also links to two first-party PDFs (REST auth + OAuth) and a human-browsable metadata portal at `/metadata`. The "documentation is hard to find" reputation comes from (a) the URL not being signposted on the marketing site outside the `/api` landing page and (b) the *content licensing* gate (customers must license the REST API to *use* it) — not from a documentation-availability gate.

**Net**: extraction can proceed from the OpenAPI spec as ground truth, with PDFs and the `/metadata` portal as supporting evidence for auth flow and per-operation role gating.

---

## 2. Per-source deep study

### 2.1 OpenAPI spec — `https://ws.yourmembership.com/openapi` (Tier 1)

**Format & structure**:
- Swagger 2.0 (not OpenAPI 3.x). Header: `"swagger":"2.0"`, `"info":{"title":"YM REST Services","version":"1.0, ServiceStack: 5.0.2.0"}`.
- `host: ws.yourmembership.com`, `basePath: /`, `schemes: ["https"]`.
- 297 paths, 656 named definitions, 6 tags.
- `securityDefinitions`: `basic` only — but in practice the live API uses **session cookies (`x-ss-id`) and OAuth bearer tokens**; the OpenAPI security stanza understates the real auth model.

**Walk of structure**:
- Paths are grouped by URL prefix:
  - `/Ams/{ClientID}/...` — the main "Association Management System" surface (282 paths)
  - `/Ams/{ClientID}/Member/{MemberID}/...` — sub-resources of a member
  - `/Ymc/{ClientID}/Member/{MemberID}/...` — YMCareers ("Ymc") career sub-system (10 paths)
  - `/OAuth/...` — token issuance (3 paths)
  - `/auth`, `/authenticate`, `/authenticate/{provider}`, `/auth/{provider}` — ServiceStack session auth (8 + 8 paths)
  - `/.well-known/jwks` — JWKS for JWT verification (1 path)
- Tags double as the top-level taxonomy:

  | Tag | Path count | Role |
  |-----|-----------|------|
  | `Ams` | 383 ops | Core AMS surface (members, events, orders, dues, donations, certifications, content, campaigns, etc.) |
  | `Ymc` | 13 ops | YMCareers (job board / career center) |
  | `auth` | 8 ops | ServiceStack session-auth `/auth` family |
  | `authenticate` | 8 ops | ServiceStack `/authenticate` alias of `/auth` |
  | `OAuth` | 3 ops | OAuth 2.0 token endpoints (`/OAuth/GetAccessToken`, `/OAuth/GetToken`, `/OAuth/OIDC/GetAccessToken`) |
  | `.well-known` | 1 op | JWKS |

  (Operation count > 297 because most paths support multiple HTTP methods.)

**Conventions / motifs**:
- Path prefix `/Ams/{ClientID}/{Resource}` is universal for non-OAuth, non-Ymc, non-auth surfaces.
- 160 distinct first-segment resource families after `/Ams/{ClientID}/` — see §3.1.
- Two heavy hubs:
  - **Member** has 62 paths and 58 sub-resource families (Connections, Events, Photos, Likes, Messages, Notifications, Memberships, Certifications, Donations, …).
  - **Event** has 25 paths plus 11 sub-resource families (Categories, EventRegistrants, EventRegistrationIDs, EventRegistrationSessions, EventRegistrations, RegistrationAttendance, RegistrationForms, SessionAttendance, EventIDs, Events, `{EventId}` deep paths).
- Resource families use PascalCase plurals (`Members`, `Events`, `Orders`) — with sibling singular forms when the action targets a single record (`Member`, `Event`, `Product`, `Post`).
- ServiceStack idioms throughout: `BaseDto` mixed into every request DTO, `ResponseStatus` envelope on every response, role-gated operations marked with `admin` / `oauthadmin` roles.

**Idiosyncrasies (vendor-specific)**:
- "Informz" appears as a discrete resource cluster (`InformzBulkUpload*`, `InformzFindGroup`, `HasInformz`) — Informz is a Community Brands email-marketing product; YM has wiring for cross-product bulk sync.
- "Freestone" types and "QuickBooks Online OAuth" + "Zoom OAuth" + "Zoom Event Listener" surfaces — cross-vendor integration hooks live inside the YM API surface.
- `BrandingConfig.css` and `Custom.css` are exposed as **paths** (the URL literally ends in `.css`) — they return rendered CSS, not JSON. Extractor should treat these as informational, not as data IOs.
- `JwtIssuer` and `Jwks` are exposed under both the `auth` tag and as deep operations — indicates JWT bearer token verification is supported alongside the legacy session cookie.

**Scope — what it covers**:
- Endpoint paths, methods, request body schemas, response schemas, parameter names, descriptions.

**Scope — what it does NOT cover**:
- Rate limits (no `x-rate-limit-*` extensions, no headers documented).
- Error code catalog beyond the generic `ResponseStatus` shape.
- Webhook/push event subscription docs (Zoom event listener paths exist but no narrative).
- Per-field semantic documentation — many properties have short or no `description`.

**Coverable taxonomies discovered** — see §3.

---

### 2.2 Metadata portal — `https://ws.yourmembership.com/metadata` (Tier 1)

**Format & structure**:
- Plain HTML index page generated by ServiceStack. 260 lines, 22 KB per detail page.
- Index lists 221 unique operation names, each linking to `https://ws.yourmembership.com/json/metadata?op={OperationName}` for the per-operation detail page.
- Per-operation page contents: list of routes (method + URL template), `Requires Authentication` flag, `Requires any of the roles:` list (e.g., `admin, oauthadmin`), parameter table (NAME / PARAMETER kind / DATA TYPE / REQUIRED / DESCRIPTION), `BaseDto Parameters`.

**Relationship to OpenAPI**:
- Same surface, different rendering. The 221 operations here map to the 297 OpenAPI paths because one operation can have multiple routes (e.g., `CampaignEmailLists` has GET/PUT/DELETE on different path templates).
- The metadata portal exposes **role-gate information more directly** than OpenAPI (which only declares the `basic` securityDefinition and doesn't model the `admin` vs `oauthadmin` distinction).

**Idiosyncrasies**:
- Operation names follow `XxxYyyZzz` style — sometimes the operation name doesn't appear literally in the URL path (e.g., `MembershipRenewalReminderGetRequest` is the operation but the path is just `/Ams/{ClientID}/MembershipRenewalReminder`).
- Some entries are obvious internal scaffolding and should be excluded from the IO catalog:
  - `HassAcessTestFolder` (sic — misspelled "HasAccessTestFolder", a probing/testing endpoint)
  - `Ping`
  - `HelpTopic` (returns embedded help, not data)
  These are INFORMATIONAL/test scaffolds, not coverable IOs.

---

### 2.3 Getting Started with the REST API PDF (Tier 1)

**Format**: PDF, 879 KB, 9 pages, dated 2021. Branded "Community Brands".

**Content**:
- Confirms base URL `https://ws.yourmembership.com` and the `/Ams/{ClientID}/{Resource}` convention.
- Auth flow worked example: `POST /Ams/Authenticate` with body `{ClientID, UserType:"Admin", Username:<API-key-username>, Password:<API-key-password>}` → response with `SessionId` → use `SessionId` as the **`x-ss-id` HTTP header** on subsequent calls. Session TTL: **15 minutes**, after which re-authenticate.
- Worked CRUD example on `CampaignEmailLists` showing pagination (`?PageSize=5&PageNumber=1`) and the response envelope shape (`ListCount`, `PageSize`, `PageNumber`, `IsForceReload`, `UsingRedis`, `AppInitTime`, `ServerID`, `ClientID`, `BypassCache`, plus the resource array).
- Pointers to additional resources: `https://ws.yourmembership.com/metadata` and `https://ws.yourmembership.com/swagger-ui/`.

**Quirks worth noting for extractor**:
- API auth requires a **separate API-key username/password** generated in the admin backend — NOT the admin's interactive login credentials.
- Pagination is `PageSize` + `PageNumber` (1-indexed), with `ListCount` returned for total. The "IsForceReload" / "BypassCache" envelope fields hint that YM has its own server-side caching layer (Redis mentioned) — extractor doesn't need to model this but downstream sync logic should know about it.

---

### 2.4 Getting Started with OAuth PDF (Tier 1)

**Format**: PDF, 426 KB, dated 2021.

**Content** (corroborated by OpenAPI `/OAuth/*` paths):
- OAuth endpoint: `/OAuth/GetAccessToken`, parameters `AppID`, `AppSecret`, `GrantType`.
- Grant types: `"Code"` (auth-code exchange) and `"RefreshToken"`.
- Client App provisioning: Admin console → General Settings → API Configuration → OAuth Management → Add Client App.
- Redirect URI pattern for the Higher Logic partner SSO: `{livesiteurl}/higherlogic/security/membersso/callback`.
- OIDC variant at `/OAuth/OIDC/GetAccessToken`.

**Cross-references**: JWT verification via `/.well-known/jwks` and `JwtIssuer` operation in `/metadata` — confirms YM is OAuth + OIDC + JWT-bearer capable, not session-cookie-only.

---

### 2.5 YourMembership API landing page — `https://www.yourmembership.com/api/` (Tier 2)

**Role**: Document index / provenance anchor. Links to the four authoritative resources above. No standalone content but confirms vendor authorship.

---

### 2.6 Swagger UI — `https://ws.yourmembership.com/swagger-ui/` (Tier 2)

**Role**: Interactive HTML wrapper that loads the same `/openapi` JSON. Useful for humans; redundant for extraction.

---

### 2.7 AMS API Overview PDF (May 2020) — Tier 2

**Role**: Marketing-flavored overview. Confirms the licensing-gate: YM customers must license the REST API as a paid add-on before integration is permitted. No endpoint-level content.

---

### 2.8 Higher Logic — YourMembership REST API Integration Guide (Tier 2)

**Role**: Worked example by a sibling Community Brands product. Names `MemberProfile`, `People`, and `CampaignEmailLists` as the central sync surfaces and documents the redirect-URI shape for the OAuth Client App. Useful as a real-world cross-check for which resources matter in a contact-sync use case.

---

### 2.9 Rasa.io YM integration docs — **404 (broken)** — Tier 3

**Access status**: HTTP 404 as of 2026-05-30 18:28 UTC. Recorded for transparency.

---

### 2.10 QuorumUS/ym-api (PHP) — Tier 3, legacy

**Access status**: Reachable but **archived 2024-05-09, last release 2017-01-30**. References the legacy `yourmembership.com/company/api-reference` (XML-RPC era), NOT the current REST API at `ws.yourmembership.com`. Listed so downstream agents don't waste cycles on it.

---

### 2.11 ECHOInternational/your_membership (Ruby) — Tier 3, legacy

**Access status**: Reachable but covers **legacy XML API v2.00** with namespaces `Events`, `Member`, `Sa` (system admin), `Session`, `People`, `Profile`, `Export`. Distinct surface from the current REST API. Useful only as a hint for what "classical" YM nouns existed historically.

---

## 3. Taxonomies discovered from the sources

Each taxonomy below is **named by walking the OpenAPI spec's path structure and the `/metadata` portal's operation list**, not invented. Each is labeled as **COVERABLE** (extractor should emit IOs) or **INFORMATIONAL** (extraction-logic context only).

### 3.1 `Ams` Resource Families (COVERABLE — primary)

**Definition**: First path segment after `/Ams/{ClientID}/` — each is a distinct resource family.
**Source citation**: `https://ws.yourmembership.com/openapi` (paths starting with `/Ams/{ClientID}/`).
**Count**: 160 distinct families with 383 operations total.

**Member-family hub** (62 paths, 58 sub-resource families) — its own L2 surface:
- `Announcements`, `BasicMemberProfile`, `Certifications`, `CertificationsJournals`, `Config`, `ConnectionCategoryList`, `ConnectionSuggestions`, `Connections`, `ContentProxy`, `DirectorySearch`, `DonationHistory`, `DonationHistoryCancelAutoBill`, `EngagementScores`, `Event`, `EventRegistrants`, `EventSearch`, `Events`, `Favorites`, `Feeds`, `FilesUpload`, `GroupJoin`, `GroupTypes`, `Groups`, `Likes`, `List`, `MediaGalleryAlbum`, `MemberProfile`, `MemberPulse`, `MessageFolders`, `Messages`, `NetworkTypes`, `Networks`, `NetworksCloud`, `NotificationSubscription`, `Notifications`, `Photos`, `Post`, `PushNotificationsConfig`, `Referrals`, `Shares`, `SponsorPosts`, `StoreOrders`, `SubAccounts`, `TopContributors`, `TrendingPosts`, `Types`, `WallComments`, `WallPostFirst`, `WallPosts`, `WebScraper`, `s` (= `Members` — token-split artifact), `sGroups`, `sProfiles`, `ship` (= `Membership`), `shipModifiers`, `shipPromoCodes`, `shipRenewalReminder`, `ships` (= `Memberships`).
- (The `s` / `ship*` entries are first-segment artifacts caused by `Member` being a prefix of `Members`/`Membership`; conceptually these belong under their own sibling resource families, not under `Member`. Extractor should normalize.)

**Event-family hub** (25 paths, 11 sub-resource families):
- `Categories`, `EventRegistrants`, `EventRegistrationIDs`, `EventRegistrationSessions`, `EventRegistrations`, `IDs` (= `EventIDs`), `RegistrationAttendance`, `RegistrationForms`, `SessionAttendance`, `s` (= `Events`), `{EventId}` (21 deep operations on a single event).

**Other major resource clusters** (alphabetical, count = endpoints):
- Auth-adjacent: `Auth` (1), `Authenticate` (2), `OAuthClientAppAPISetting` (1), `OAuthClientAppName` (1), `OAuthClientApps` (2), `OAuthScopes` (1), `CheckPassword` (1), `CheckUsername` (1), `MemberPasswordReset` (1), `FinalizeLogin` (1), `FraudPrevention` (1)
- Members & people: `Members` (2), `MembersGroups` (1), `MembersProfiles` (1), `MemberTypes` (1), `MemberList` (1), `MemberReferrals` (1), `MemberSubAccounts` (1), `MemberGroups` (1), `FindMembers` (1), `People` (1), `PeopleBulkDetach` (1), `PeopleGroups` (1), `PeopleIDs` (1), `PeopleProfileFindID` (1)
- Memberships: `Membership` (2), `Memberships` (2), `MembershipModifiers` (1), `MembershipPromoCodes` (3), `MembershipRenewalReminder` (2), `SingleMembership` (1 — from /metadata index)
- Events: `Events` (2), `EventCategories` (1), `EventIDs` (1), `EventRegistrationAttendance` (1), `EventRegistrationForms` (1), `EventSessionAttendance` (1), `FindEventRegistrationForms` (1), `FindEventTickets` (1)
- Commerce / store: `Orders` (1), `Products` (2), `Product` (1), `ProductCategories` (1), `FindProducts` (1), `StoreOrders` (2), `StoreOrderDetails` (1), `StoreProductBulkStatus` (1), `StoreProductBulkStatusAll` (1), `StoreProductExtract` (1), `StoreProductPromoCodes` (2), `StoreProductSelect` (1), `StoreProductSequence` (1), `StoreProductUpdate` (2), `ShippingMethods` (1)
- Dues & finance: `Dues` (1), `DuesRules` (1), `DuesTransactions` (1), `InvoiceItems` (1), `InvoicePayments` (1), `FinanceBatches` (1), `FinanceBatchDetails` (1), `GLCodes` (1), `PaymentProcessors` (1), `TaxRate` (1), `CustomTaxLocations` (1)
- Donations: `Donations` (1), `DonationFunds` (2), `DonationTransactions` (1)
- Marketing campaigns: `Campaigns` (3), `AllCampaigns` (1), `CampaignReports` (3), `CampaignEmailLists` (3), `CampaignEmailListDuplicates` (1), `CopyCampaign` (1), `ResendCampaign` (1), `SMSCampaigns` (3), `SMSCampaignReports` (3), `SMSCampaignListDetails` (1), `EmailSenderInfo` (1), `EmailSuppressionList` (1), `EmailVerification` (3)
- Content & branding: `Announcements` (2), `BrandingConfig` (1), `BrandingConfig.css` (1), `Custom.css` (1), `CBXClientConfig` (1), `ClientConfig` (1), `ContentAreas` (1), `ContentAreaVersions` (1), `ContentAreaCustomMacros` (1), `CommunityPhotos` (1), `CustomForms` (1), `CustomPages` (1), `CustomPageCategories` (1), `CustomPageCrossLinks` (1), `CustomPageDocTypes` (1), `CustomPageFeatures` (1), `CustomPageFileCollections` (1), `CustomPageForms` (1), `CustomPageMemberTypes` (1), `CustomPageTemplates` (1), `CustomPageVersions` (1), `ExternalLink` (1), `Feeds` (1), `FilesUpload` (1), `LatestPosts` (1), `Markup` (2), `MarkupComponentTypes` (1), `MarkupMacroComponents` (2), `MarkupRender` (2), `OrganizationPosts` (2), `PageMetaInfo` (1), `Post` (1), `RssBuilder` (1), `Shares` (1), `SponsorRotators` (1), `WallComments` (1)
- Certifications: `CertificationCreditTypes` (1), `Certifications` (1), `CertificationsJournals` (1)
- Career (some career endpoints live under `/Ams` too): `CareerOpenings` (1)
- Notifications: `Notification` (2), `NotificationMacros` (2)
- Groups: `Groups` (1), `GroupTypes` (1), `GroupMembershipLogs` (1)
- Lookup data: `Countries` (1), `TimeZones` (1), `Locations` (1), `FreestoneTypes` (1)
- Cross-vendor integrations: `QuickBooksOnlineOAuth` (2), `QBClasses` (1), `ZoomOAuth` (2), `ZoomEventListener` (1), `ZoomEventListenerOAuth` (1), `SocialOAuth` (1), `Social` (1), `DomainAuthentication` (2), `HasInformz` (1), `InformzBulkUploadBySearchGuid` (1), `InformzBulkUploadEventRegistrants` (1), `InformzBulkUploadForDues` (1), `InformzBulkUploadForDuesBySearchId` (1), `InformzBulkUploadForOrders` (1), `InformzBulkUploadForOrdersBySearchId` (1), `InformzBulkUploadForReports` (1), `InformzFindGroup` (1)
- Search & discovery: `SavedSearch` (1), `DashboardData` (1)
- Misc utility: `HasAccessPath` (1), `HelpTopic` (1) — informational, `HtmlSanitization` (1), `Ping` (1) — health check, `ConvertToMember` (1), `ResouremanagerFilesUpload` (1 — typo in vendor path)

### 3.2 `Ymc` (YMCareers) Resource Family (COVERABLE)

**Definition**: Operations under `/Ymc/{ClientID}/Member/{MemberID}/...` — separate sub-API for the YMCareers career-board product bundled with YM.
**Source citation**: `https://ws.yourmembership.com/openapi`, all paths starting with `/Ymc/`.
**Count**: 13 operations across 6 sub-resources.
**Members**: `Pinpoint`, `LocationCoordinates`, `JobAlertsCriteria`, `JobAlerts`, `JobSearch`, `SavedJobs`, `Templates`.

### 3.3 OAuth 2.0 Token Endpoints (INFORMATIONAL)

**Definition**: The OAuth-flow surface for issuing/refreshing access tokens.
**Source citation**: `https://ws.yourmembership.com/openapi` paths under `/OAuth/`, plus the OAuth Getting Started PDF.
**Members**: `/OAuth/GetAccessToken`, `/OAuth/GetToken`, `/OAuth/OIDC/GetAccessToken`.
**Role**: Extractor uses these to model auth — they don't themselves become data-entity IOs.

### 3.4 ServiceStack Session-Auth Endpoints (INFORMATIONAL)

**Definition**: ServiceStack's built-in `/auth` and `/authenticate` family — produces the `x-ss-id` session cookie used by `/Ams/*` calls.
**Source citation**: `https://ws.yourmembership.com/openapi` paths `/auth`, `/auth/{provider}`, `/authenticate`, `/authenticate/{provider}`; REST API Getting Started PDF auth flow section.
**Role**: Session-issuance mechanic, not an IO source.

### 3.5 JWKS / JWT Issuer Endpoints (INFORMATIONAL)

**Definition**: JWKS distribution and JWT issuer config for bearer-token verification.
**Source citation**: `/openapi` path `/.well-known/jwks`; `/metadata` operations `Jwks` and `JwtIssuer`.
**Role**: Used by clients verifying YM-issued JWTs. Not an IO source.

### 3.6 Cross-Vendor Integration Hooks (INFORMATIONAL)

**Definition**: Endpoints that wire YM into third-party / sibling Community Brands products. They expose OAuth callbacks and bulk-upload endpoints, not first-class YM data entities.
**Source citation**: `/openapi` under `/Ams/{ClientID}/`: `QuickBooksOnlineOAuth`, `ZoomOAuth`, `ZoomEventListener`, `ZoomEventListenerOAuth`, `SocialOAuth`, all `Informz*` operations, `HasInformz`, `DomainAuthentication`.
**Role**: Important context — these reveal which downstream systems YM integrates with — but they are *plumbing*, not data IOs from YM's own model.

### 3.7 ServiceStack Internal/Test Scaffolding (EXCLUDED from coverable)

**Definition**: Operations whose names indicate internal probes, health checks, or test stubs — not real data surfaces.
**Source citation**: `/metadata` index, observed by inspection.
**Excluded members**:
- `Ping` — generic ServiceStack health probe.
- `HassAcessTestFolder` (sic — misspelled, clearly a developer-only test path).
- `HelpTopic` — returns embedded help text, not data.
- `BrandingConfig.css`, `Custom.css` — return rendered CSS strings, not data IOs.
- `HtmlSanitization` — utility transform, not a data source.
- `MarkupRender` — utility transform.
- `WebScraper` — generic fetch helper.

These are *INFORMATIONAL* in that they confirm what's in the surface, but they should not show up as extracted entity IOs.

### 3.8 Response Envelope & Pagination Schema (INFORMATIONAL)

**Definition**: ServiceStack envelope fields wrapping every `Ams` response: `ListCount`, `PageSize`, `PageNumber`, `IsForceReload`, `UsingRedis`, `AppInitTime`, `ServerID`, `ClientID`, `BypassCache`, `ResponseStatus`.
**Source citation**: REST API Getting Started PDF page 8; also visible in the 656 `definitions` in `/openapi`.
**Role**: Extractor and downstream sync must understand this shape for pagination + error detection. Not an IO of its own.

### 3.9 Role Gate Vocabulary (INFORMATIONAL)

**Definition**: Per-operation role requirements: `admin`, `oauthadmin` (observed). Operations marked "Requires Authentication" in `/metadata` carry these role lists.
**Source citation**: `/metadata` per-operation pages (visible in the Getting Started PDF screenshot of the `CampaignEmailLists` detail page).
**Role**: Extractor should propagate role requirements to downstream consumers so action invocation knows which auth level is needed.

---

## 4. Coverage matrix (per-taxonomy → source)

| Taxonomy | Role | Primary source | Backup source |
|---|---|---|---|
| Ams Resource Families (160 families) | COVERABLE | OpenAPI `/openapi` | `/metadata` portal |
| Ymc Career Family (6 sub-resources) | COVERABLE | OpenAPI `/openapi` | — |
| OAuth Token Endpoints | INFORMATIONAL | OpenAPI `/openapi` + OAuth PDF | `/metadata` (`OAuth*` ops) |
| Session-Auth Endpoints | INFORMATIONAL | OpenAPI `/openapi` + REST API PDF | `/metadata` (`Authenticate` op) |
| JWKS / JWT Issuer | INFORMATIONAL | OpenAPI `/openapi` | `/metadata` (`Jwks`, `JwtIssuer`) |
| Cross-Vendor Integration Hooks | INFORMATIONAL | OpenAPI `/openapi` | Higher Logic integration guide |
| Internal/Test Scaffolding | EXCLUDED | `/metadata` index inspection | — |
| Response Envelope & Pagination | INFORMATIONAL | REST API Getting Started PDF | OpenAPI definitions |
| Role Gate Vocabulary | INFORMATIONAL | `/metadata` per-operation pages | — |

Every COVERABLE taxonomy has an OpenAPI citation. Every INFORMATIONAL taxonomy has a citation. No coverable surface is left unsourced.

---

## 5. Gaps (honest)

- **Rate limits**: No published documentation. Server uses Redis caching internally per the response envelope, but the public rate-limit policy (RPS, daily quotas, throttle response headers) is undocumented. *Mitigation for downstream*: instrument empirically.
- **Error code catalog**: Only the generic ServiceStack `ResponseStatus` shape is documented. There is no published list of error codes or business error classifications. *Mitigation*: capture observed errors at runtime; build a catalog from production telemetry.
- **Webhook / push event subscription**: `ZoomEventListener` paths exist in the OpenAPI but there is no narrative documentation of YM's own webhook model (if any). *Possible gap*: YM may simply not push events; this would need a partner-portal inquiry to confirm.
- **Changelog**: No published version history for the REST API. The OpenAPI `info.version` says `"1.0, ServiceStack: 5.0.2.0"` only.
- **Postman collection**: The Getting Started PDF uses Postman in its screenshots but no `.postman_collection.json` is published. Downstream consumers must generate one from the OpenAPI spec.
- **Per-field semantic depth**: Many properties in the 656 definitions have terse or no `description` strings. Extractor will need to fall back on name-conventions and the example shapes in the PDFs.

---

## 6. Hand-off summary for downstream agents

- **For endpoint enumeration**: Use `https://ws.yourmembership.com/openapi` directly. It's the canonical contract.
- **For auth modeling**: Cross-reference the REST API Getting Started PDF (session auth) and OAuth Getting Started PDF (OAuth 2.0 + OIDC). The OpenAPI `securityDefinitions` understates the auth model.
- **For per-operation role gating**: Hit per-operation pages at `https://ws.yourmembership.com/json/metadata?op={OperationName}` when the OpenAPI security stanza is insufficient.
- **For partner-integration use-case validation**: Higher Logic integration guide names `MemberProfile`, `People`, `CampaignEmailLists` as the central sync surfaces.
- **Do NOT use** `ECHOInternational/your_membership` or `QuorumUS/ym-api` — both target the legacy XML API surface and will mislead extraction.

## 7. Sources

- [YourMembership API documentation landing page](https://www.yourmembership.com/api/)
- [YM REST Services — OpenAPI / Swagger 2.0 JSON](https://ws.yourmembership.com/openapi)
- [YM REST Services — Swagger UI](https://ws.yourmembership.com/swagger-ui/)
- [YM REST Services — Metadata portal](https://ws.yourmembership.com/metadata)
- [Getting Started with the REST API — PDF (2021)](https://www.yourmembership.com/wp-content/uploads/2021/02/YM_Getting_Started_REST_API_2021.pdf)
- [Getting Started with OAuth — PDF (2021)](https://www.yourmembership.com/wp-content/uploads/2021/02/YM_Getting_Started_OAuth_2021.pdf)
- [YourMembership AMS API Overview — PDF (2020)](https://www.yourmembership.com/wp-content/uploads/2020/05/YM-AMS-APIOverview.pdf)
- [Higher Logic — YourMembership REST API Integration Guide](https://support.higherlogic.com/hc/en-us/articles/4410238657172-YourMembership-REST-API-Integration-Guide)
- [QuorumUS/ym-api (PHP, archived 2024, legacy XML era)](https://github.com/QuorumUS/ym-api)
- [ECHOInternational/your_membership (Ruby, legacy XML API v2.00)](https://github.com/ECHOInternational/your_membership)
- [Rasa.io YM integration docs (404 — broken)](https://help.rasa.io/yourmembership-integration-documentation)
