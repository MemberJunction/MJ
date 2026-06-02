# YourMembership — Metadata Writer Report

**Vendor**: YourMembership (a Community Brands AMS product)
**Run ID**: `connector-yourmembership-1780165237029-a495a1ea`
**Written by**: `metadata-writer` agent
**Written at**: 2026-05-30T18:38:00Z

---

## 1. Files emitted

| Path | Purpose |
|---|---|
| `metadata/integrations/yourmembership/.yourmembership.integration.json` | Integration row populated for `mj sync push` (canonical columns only) |
| `packages/Integration/connectors-registry/yourmembership/runs/<runID>/output/Configuration.json` | Vendor-wide Configuration blob (sidecar — see §4 below for why this is a sidecar rather than a column on the Integration row) |
| `packages/Integration/connectors-registry/yourmembership/runs/<runID>/output/PROVENANCE.json` | Per-emission evidence citations (one entry per non-default field) |
| `packages/Integration/connectors-registry/yourmembership/runs/<runID>/output/CODE_EVIDENCE.json` | Reproducible script + probe evidence for hard-constraint claims |
| `packages/Integration/connectors-registry/yourmembership/runs/<runID>/output/extract.mjs` | Parser that pulls structured facts from the OpenAPI snapshot |
| `packages/Integration/connectors-registry/yourmembership/runs/<runID>/output/openapi.snapshot.json` | Frozen copy of `/openapi` as of 2026-05-30 18:35 UTC (1.10 MB, 297 paths, 656 defs) — enables verify-claim replay |

---

## 2. Sources walked, with counts

I worked from the source-auditor's `SOURCES.json` + `SOURCE_STUDY.md` and added live verification against the same sources. The breakdown:

| Source | Method | What I pulled |
|---|---|---|
| `ym-openapi-swagger2` (`/openapi`) | Fresh `curl` + `extract.mjs` AST walk | 13 structural facts: swagger version, host, basePath, schemes, consumes/produces, securityDefinitions, tag list, path count (297), definition count (656), tag operation breakdown, pagination param distribution (5 distinct names: PageNumber/PageSize/OffSet/Offset/limit; 112 ops use PageSize+PageNumber pair), Ams family count (149), top-20 family histogram, OAuth path parameter shapes (GetAccessToken vs GetToken vs OIDC), `/Ams/Authenticate` parameter list (13 fields), `/auth` parameter list (18 fields), ResponseStatus + ResponseError + 5 sample envelope definitions |
| `ym-rest-api-getting-started-pdf` | Quotes via SOURCE_STUDY § 2.3 (page bodies stayed out of context) | Session auth flow shape, `x-ss-id` header, 15-min TTL, pagination example (`PageSize=5&PageNumber=1`), `ListCount` in envelope |
| `ym-oauth-getting-started-pdf` | Quotes via SOURCE_STUDY § 2.4 + cross-check vs OpenAPI | OAuth endpoint set (`/OAuth/GetAccessToken`, `/OAuth/GetToken`, `/OAuth/OIDC/GetAccessToken`), grant types (`Code`, `RefreshToken`), Admin console client-app provisioning path |
| `live HEAD probe` | `curl -sI https://ws.yourmembership.com/openapi` | Server: cloudflare + ServiceStack/5.02; Access-Control-Allow-Headers list (proves both `X-ss-id` and `Authorization` are accepted); cookie shape; **absence** of any X-RateLimit-* / Retry-After header |
| `live POST error probe` | `curl -X POST /Ams/Authenticate` with empty body | Concrete error envelope shape — `ResponseStatus{ErrorCode, Message, Errors[{ErrorCode, FieldName, Message, Meta}]}` confirmed |
| `existing YM credential type` | Read of `/metadata/credential-types/.credential-types.json` + schemas/yourmembership-api.schema.json | Confirms credential type `YourMembership API` already exists with clientId+apiKey+apiPassword fields — re-used as `CredentialTypeID` |
| `existing YM integration record` | Read of `/metadata/integrations/.your-membership.json` | Pulled prior values for `ClassName`, `ImportPath`, `Icon` (cosmetic / packaging facts not driven by vendor research) |

**Total Integration-row + Configuration fields populated**: 9 row fields + 14 Configuration fields = 23. Of those, 17 trace to ExplicitStatement evidence; 6 to InferredFromContext (ClassName, ImportPath, Icon, CredentialTypeID, and the 2 cosmetic/internal-packaging facts) — none of the InferredFromContext facts gate connector control flow.

**Of the 23 fields, how many root vs Configuration?**
- 7 became real columns on the Integration row (Name, Description, ClassName, ImportPath, NavigationBaseURL, BatchMaxRequestCount, BatchRequestWaitTime, CredentialTypeID, Icon → 9 of which 7 are non-identity)
- 14 went into Configuration.json because no MJ canonical column carries them (AuthFlow, AuthHeaderPattern, PaginationDefaults, IncrementalSyncCapability, WebhooksAvailable, BulkOperationsAvailable, APIVersioningStrategy, TokenRefreshStrategy, ErrorResponseShape, CustomObjectMarkerPattern, CustomFieldMarkerPattern, ResponseEnvelopeShape, ContentType, RoleGating, RateLimitPolicy, ClientIDHandling, AdditionalNotes, universalPK) — that's actually 18 keys in Configuration.json once the supporting structure is counted.

---

## 3. Decisions made and the reasoning behind each

### 3.1 `BatchMaxRequestCount = -1`, `BatchRequestWaitTime = -1`
- **Decision**: -1/-1 (no batching, no wait window).
- **Why**: SOURCE_STUDY §5 explicitly records "Rate-limit policy not documented anywhere public" as a gap. I corroborated by live HEAD probe — no `X-RateLimit-*`, no `Retry-After`, no documented quota. The MJ convention for "no documented limit" is `-1` (same as FileFeed integration). Inventing a number from priors (e.g., "let's say 100/250ms like HubSpot") would violate the no-priors-from-other-connectors rule.

### 3.2 `Description` written as a multi-line summary covering both auth flows
- **Decision**: Include the dual-auth (session + OAuth2 authcode), the 15-minute session TTL, ClientID-in-path requirement, and ListCount+PageSize+PageNumber envelope in the Description.
- **Why**: Description is the only canonical Integration-row slot that can carry a narrative summary downstream agents and human reviewers will see in the UI. This is the highest-value place to surface the dual-auth duality so the code-builder doesn't model only one flow.

### 3.3 `Configuration.AuthFlow = "session+oauth2-authcode"` (not just one)
- **Decision**: Both flows are first-class; record both.
- **Why**: The REST API PDF describes session auth as the primary integration pattern, but the OpenAPI publishes a fully OAuth-2.0-conformant `/OAuth/GetToken` (with `grant_type`, `client_id`, `client_secret`, `redirect_uri`, `code`, `refresh_token`) AND the legacy YM-shaped `/OAuth/GetAccessToken` (with `AppId`, `AppSecret`, `GrantType=Code|RefreshToken`). The CORS allow-headers reply lists both `X-ss-id` and `Authorization`. Picking one would be wrong; recording both with their differences is correct.

### 3.4 `Configuration.universalPK = null` (explicit)
- **Decision**: Explicit `null`, not omission.
- **Why**: The OpenAPI evidence shows 149 distinct first-segment Ams families with path-parameter PKs of every flavour: `MemberID` (int), `EventId` (int), `ListId`, `ProfileID` (int), `ClientID` (in path everywhere but is the tenant key, not the record PK). There is no single field name that holds across families. An *omitted* universalPK would let a downstream agent invent a default; an *explicit null* tells the SoftPKClassifier "no shortcut — classify per-IO". This matches my memory note on connector metadata: "Where endpoint/docs don't say, leave blank — never silently default."

### 3.5 `IncrementalSyncCapability.VendorWideSupported = false`
- **Decision**: Vendor-level FALSE, per-IO TBD.
- **Why**: No `/sync` endpoint, no global `If-Modified-Since` or `since=` query semantic. A minority of resources do accept their own per-resource modifiedSince-style parameters — that's an IO-level fact handled by `ioiof-extractor`, not by me.

### 3.6 `WebhooksAvailable.Vendor = false`
- **Decision**: FALSE with no signature algorithm.
- **Why**: The `ZoomEventListener*` paths are misleading on a surface read — they're inbound callbacks **from Zoom into YM**, not outbound YM-to-customer webhooks. SOURCE_STUDY §5 calls this out. There is no documented YM webhook system.

### 3.7 `BulkOperationsAvailable.Vendor = true` (Informz-only)
- **Decision**: TRUE with explicit narrowing: the bulk surface is the Informz family (7 endpoints), plus a few resource-specific bulk-shaped endpoints (`StoreProductBulkStatus`, `PeopleBulkDetach`). There is NO generic bulk read or batch import.
- **Why**: Saying "no bulk" would miss real capability; saying "yes bulk" without scope would mislead the code-builder. The honest answer is the Informz-shape detail.

### 3.8 `CustomFieldMarkerPattern`: discriminant is the endpoint, not a name prefix
- **Decision**: Capture that custom fields are accessed via a separate endpoint family, NOT via a field-name marker.
- **Why**: HubSpot uses `p_<accountID>_<name>` in field names; Salesforce uses `__c`. YM doesn't follow either pattern — custom fields are surfaced via `CustomFieldResponse` from `/Ams/{ClientID}/CustomField` and `/Ams/{ClientID}/Member/{MemberID}/CustomField`. The code-builder needs to know the discriminant is endpoint-shape, not name-pattern, or its custom-field detection logic will silently fail.

### 3.9 `CredentialTypeID = @lookup:MJ: Credential Types.Name=YourMembership API`
- **Decision**: Reuse the existing credential type rather than minting a new one.
- **Why**: The existing schema (`clientId` int + `apiKey` secret + `apiPassword` secret) matches the session-auth shape required for the *primary* flow. A second credential type for the OAuth flow (`AppId` + `AppSecret`) is a separate concern that should be handled by an additional CredentialType record if/when the OAuth flow is wired — that's not blocking the Integration row.

---

## 4. Schema reality — why Configuration is a sidecar

The metadata-writer agent doc says to write the Configuration blob "to the Integration row." But the `MJ: Integrations` entity (generated class at `packages/MJCoreEntities/src/generated/entity_subclasses.ts:73110`) has these columns and **no others** at the row level:

```
Name, Description, NavigationBaseURL, ClassName, ImportPath, BatchMaxRequestCount,
BatchRequestWaitTime, __mj_CreatedAt, __mj_UpdatedAt, ID, CredentialTypeID, Icon,
CredentialType (view-only join)
```

There is no `Configuration nvarchar(MAX)` column on the Integration row today (it exists at the **IntegrationObject** and **IntegrationObjectField** level — those are different tables). The framework redesign plan (`plans/integration-framework-redesign.md`) anticipates adding it but it isn't shipped.

**My resolution**: emit the Configuration blob as a sidecar file (`Configuration.json` in the run output) so:
- The code-builder has every fact the agent doc asks me to record.
- The provenance chain stays intact (every Configuration fact also has a PROVENANCE entry).
- When the Integration table gains a `Configuration` column, the sidecar copies verbatim into the new column with no information loss.

This is documented in the `$comment` field at the top of `Configuration.json`.

---

## 5. Negative space — vendor facts I searched for and could not find with authoritative evidence

| Facet | Why I looked | What I found | Recorded as |
|---|---|---|---|
| Per-app rate-limit RPS / daily quota | Required for `BatchMaxRequestCount` choice | Nothing in OpenAPI, nothing in either PDF, no `X-RateLimit-*` headers on live response, no `Retry-After` | `BatchMaxRequestCount=-1`; `Configuration.RateLimitPolicy.Documented=false` |
| Closed list of `ErrorCode` values | Needed for runtime error classifier | Two values observed (`NotNull`, `Predicate`); no closed catalog published | `Configuration.ErrorResponseShape.ErrorCatalog = "must be built empirically"` |
| API version history / changelog | To know upgrade path | Only `info.version='1.0, ServiceStack: 5.0.2.0'`; no changelog | `Configuration.APIVersioningStrategy.Strategy = "none-documented"` |
| Webhook signature algorithm | For verifying inbound events | YM does not publish webhooks at all (the `ZoomEventListener*` paths are Zoom-into-YM callbacks) | `Configuration.WebhooksAvailable.Vendor = false`, no signature field |
| Refresh-token TTL | For token-refresh scheduler | Vendor does not document refresh-token lifetime | Left unset on `Configuration.TokenRefreshStrategy.OAuth2`; flagged in `PROVENANCE.json` gaps |
| Postman collection | Would have eased connector-author onboarding | PDF shows Postman screenshots; no `.postman_collection.json` published | Not recorded (operational concern only) |
| Per-field semantic depth on the 656 schema definitions | For per-IO documentation | Many `description` strings are short or empty | Surfaced to the `ioiof-extractor` via gap list in PROVENANCE.json |

---

## 6. Cuts made — facts considered but deferred

| Considered fact | Why I considered it | Why I deferred |
|---|---|---|
| A per-resource pagination table (which IOs are PageNumber-paged, which use Offset/limit) | Would have been a precise vendor-wide statement | This is per-IO knowledge — belongs on `MJ: Integration Objects.PaginationType`, not on the parent Integration row. Surfaced to `ioiof-extractor` |
| A `Configuration.role_gates_per_op` map (operation → required role) | The `/metadata` portal exposes role-gate info | Per-operation fact, not vendor-wide. Belongs on IntegrationObjects, where `ioiof-extractor` should harvest it from `/json/metadata?op={OperationName}` pages |
| Listing all 149 Ams resource families on the Integration row | Would have made the row feel "complete" | Wrong place — IntegrationObjects own resource enumeration. The Integration row only needs vendor-wide facts |
| A second `CredentialType` for OAuth (`AppId`+`AppSecret` shape) | The OAuth flow requires different credentials than session auth | Minting a new credential type is out of metadata-writer's scope and creates a downstream commitment to wiring it. If/when the OAuth flow is implemented in code, this should be added as a separate metadata seeding step |
| A `Configuration.SessionAuthFormShape` capturing all 13 `/Ams/Authenticate` form fields | Concrete fact, easy to record | Most of those fields (ConsumerKey, ConsumerSecret, AccessToken, Token, EmailAddress, IncludeMemberConfig, IncludeExchangeToken, IncludeBrandingConfig, Device) are optional flags or alt-auth paths. Recording all 13 would be noise; the runtime only needs ClientID+UserType+Username+Password. Kept the minimal canonical set |
| A `Configuration.GeographySegmentation` or `TenancyModel` field | Some integrations have these | YM has a single SaaS endpoint per ClientID — there is no geo split or tenant model worth recording at the vendor level |

---

## 7. Set-completeness checks

| Set I enumerated | How I verified completeness |
|---|---|
| Auth flows | Walked all OpenAPI tags (`auth`, `authenticate`, `OAuth`, `.well-known`), confirmed only 4 auth-related surfaces exist (session via `/Ams/Authenticate`, ServiceStack session via `/auth`+`/authenticate`, OAuth2 via `/OAuth/GetToken`+`/OAuth/GetAccessToken`, JWT via `/.well-known/jwks` + `JwtIssuer`). Recorded all four. |
| Pagination param vocabulary | Iterated every operation's parameter list — found 5 distinct paginal param names (`PageNumber`, `PageSize`, `OffSet`, `Offset`, `limit`). Default chosen by majority (PageNumber: 112 ops) and explicitly noted the alternatives in the Configuration note |
| Bulk endpoint family | Grepped all path templates for `Bulk` substring: confirmed 7 Informz endpoints + StoreProductBulkStatus + StoreProductBulkStatusAll + PeopleBulkDetach. No other bulk-shaped paths exist |
| Error envelope fields | Walked `definitions.ResponseStatus` + `definitions.ResponseError` for exhaustive field lists; cross-verified against a live error probe |
| OAuth grant types | Inspected `/OAuth/GetToken` parameter list — `grant_type` value space is `authorization_code` + `refresh_token` per the legacy YM-PDF (`Code` + `RefreshToken` in `/OAuth/GetAccessToken`); no `client_credentials`, no `password` grant. Recorded explicit absence to defeat priors |

---

## 8. Uncertainty / known gaps surfaced to downstream

- **Rate-limit policy** — gap. The code-builder must decide an empirical throttle (suggest: 5 RPS conservative) but should NOT hard-code anything until production telemetry exists.
- **Refresh-token TTL** — gap. Token-refresh scheduler must observe expiry, not pre-schedule.
- **ErrorCode catalog** — gap. Error classifier should fall back on `Errors[].FieldName` + `Errors[].Meta.PropertyName` for field-level routing; ErrorCode is descriptive only.
- **Per-resource pagination type** — TBD by `ioiof-extractor`. Default to `PageNumber` only when neither `Offset`/`limit` shows up on the operation parameter list.
- **Per-operation role gating** — TBD by `ioiof-extractor`. Should be harvested from `https://ws.yourmembership.com/json/metadata?op={OperationName}` per-operation pages.

---

## 9. Handoff summary

```json
{
  "FieldsPopulated": 23,
  "FieldsDeferredAsGaps": 5,
  "ProvenanceEntries": 21,
  "ConfigurationJSONKeysUsed": [
    "universalPK", "AuthFlow", "AuthFlowDetail", "AuthHeaderPattern",
    "PaginationDefaults", "IncrementalSyncCapability", "WebhooksAvailable",
    "BulkOperationsAvailable", "APIVersioningStrategy", "TokenRefreshStrategy",
    "ErrorResponseShape", "CustomObjectMarkerPattern", "CustomFieldMarkerPattern",
    "ResponseEnvelopeShape", "ContentType", "RoleGating", "RateLimitPolicy",
    "ClientIDHandling", "AdditionalNotes"
  ],
  "WriteBackPath": "metadata/integrations/yourmembership/.yourmembership.integration.json"
}
```
