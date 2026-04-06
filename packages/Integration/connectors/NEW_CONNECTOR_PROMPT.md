Prompt: Add a New Integration Connector to MemberJunction
Use this prompt when you want Claude Code to create a new integration connector for MJ. Fill in the [BRACKETED] sections, then paste the whole thing.

Context & Role
You are building a new integration connector for the MemberJunction (MJ) open-source platform. MJ connectors live in packages/Integration/connectors/src/ and follow strict conventions. Your job is to produce a production-ready, fully typed connector that follows the existing patterns exactly — not an approximation.
Before writing ANY code, you MUST:

Read every file in packages/Integration/connectors/src/ to catalog the existing connectors
Read packages/Integration/core/src/BaseIntegrationConnector.ts and BaseRESTIntegrationConnector.ts end-to-end to understand the base class contracts, abstract methods, and available hooks
Read the existing index.ts to understand the export pattern
Identify which existing connector is the closest architectural match to the new platform (see Selection Criteria below)
Read that reference connector in full — every line, every comment
Only then begin implementation

Do NOT skip or skim the file reads. The #1 failure mode is writing code that "looks right" but doesn't match the actual base class signatures, return types, or lifecycle hooks.

Platform Details

Platform name: [PLATFORM NAME, e.g., Mailchimp, Stripe, Xero]
API docs URL: [paste link — Claude Code should fetch and parse these]
Auth method: [OAuth 2.0 / API Key / Basic Auth / Bearer Token / other]
API base URL: [e.g., https://api.platform.com/v2]
API style: [REST JSON / JSON:API / GraphQL / XML-SOAP / other]
Pagination style: [offset-limit / cursor-based / page-number / link-header / unknown]
Rate limits: [e.g., 100 req/min, or "unknown — discover from docs"]
Change detection: [webhooks / CDC endpoint / updated_at filter / none-known]
Response envelope pattern: [e.g., { data: [...] }, { results: [...], next: "..." }, or "unknown — discover from docs"]


If any field above is "unknown", your first task is to fetch the API documentation URL and determine the answer before writing any code.


Reference Connector Selection Criteria
Choose the closest-match reference connector based on these characteristics:
If the new platform uses...Study this connectorREST + live schema/metadata discovery endpointHubSpotConnector.tsREST + static object definitions + full CRUDWicketConnector.tsREST + session-based auth (not OAuth)YourMembershipConnector.tsXML/SOAP APISageIntacctConnector.tsOAuth + SQL-like query languageQuickBooksConnector.tsOAuth + REST + proprietary query languageSalesforceConnector.ts
Read the matching connector AND at least one other for cross-referencing patterns.

Implementation Requirements
A. File Structure
packages/Integration/connectors/src/
├── [PlatformName]Connector.ts    ← main file (create this)
├── index.ts                       ← add export here
└── ...existing connectors
B. Class Skeleton (match exactly)
typescript// Use the EXACT decorator, imports, and registration pattern from existing connectors.
// Do NOT guess these — copy them from a reference connector after reading it.

@RegisterClass(BaseIntegrationConnector, '[PlatformName]Connector')
export class [PlatformName]Connector extends BaseRESTIntegrationConnector {
  // ...
}

// Tree-shaking prevention — REQUIRED
export function Load[PlatformName]Connector() {}
C. Required Method Implementations
For each method below, read the base class implementation FIRST to understand:

The exact method signature (parameter types + return type)
What the base class already handles (don't duplicate it)
What hooks/callbacks are available

MethodPurposeKey GotchasAuthenticate()Return RESTAuthContextMust handle token refresh. Use MJ Credentials entity — never hardcode secrets. Check how other connectors cache tokens.DiscoverObjects()Return IntegrationObjectInfo[] for all API resourcesIf platform has a metadata endpoint, use it. Otherwise build a complete static PLATFORM_OBJECTS array. Every GET-able resource = one object.DiscoverFields(objectName)Return field metadata per objectMap API field types to MJ types accurately. Set PK, FK, IsRequired, IsReadOnly. Use describe/schema endpoints if available.FetchChanges()Incremental data retrievalMust respect watermarks. Must handle pagination to completion (don't stop at page 1). Prefer server-side updated_at>= filtering over client-side comparison.CreateRecord()POST new recordSet SupportsCreate getter to true. Return the created record's ID.UpdateRecord()PUT/PATCH existing recordSet SupportsUpdate getter to true. Use PATCH if platform supports partial updates.DeleteRecord()DELETE recordSet SupportsDelete getter to true. Handle soft-delete platforms gracefully.ExtractPaginationInfo()Parse pagination metadata from responseMatch the platform's exact pagination pattern.BuildPaginatedURL()Construct URL for next pageMust work for all objects, not just one.ExtractRecords()Unwrap response envelopeHandle { data: [...] } vs { results: [...] } vs raw array vs JSON:API etc.
D. API Coverage Completeness
This is critical. Do not implement a partial connector with 5-10 "common" endpoints. You must:

Fetch and parse the platform's API documentation
Enumerate EVERY resource that supports GET (list)
Create an IntegrationObjectInfo entry for each one
For each resource, check POST/PUT/DELETE support and set the corresponding flags
If the API has 50+ endpoints, implement them ALL — do not cherry-pick

If the platform has a live discovery endpoint (like Salesforce /sobjects or HubSpot /crm/v3/schemas), use it instead of hardcoding. This makes the connector self-updating.

D2. IntegrationObject & IntegrationObjectField Metadata (Critical)

MJ stores integration metadata in two database tables that the engine uses at runtime:
- **`IntegrationObject`** — one row per API endpoint/table (Name, APIPath, PaginationType, DefaultPageSize, ResponseDataKey, SupportsWrite, Category, etc.)
- **`IntegrationObjectField`** — one row per field on each object (Name, Type, IsPrimaryKey, IsForeignKey, IsRequired, IsReadOnly, etc.)

**The overlay pattern**: Connectors can populate these tables two ways, and they COMBINE:

1. **Dynamic (live API discovery)** — `DiscoverObjects()` and `DiscoverFields()` are called at runtime when `IntegrationApplyAll` or `IntegrationApplySchema` mutations run. The engine compares the live-discovered objects/fields against what's already in the DB and adds/updates as needed. This is the preferred approach — it means new objects and fields added to the external API are automatically picked up.

2. **Static metadata overlay** — For objects/fields that the API can't self-describe (pagination type, response data key, default query params, soft FKs, field descriptions), define them in the connector's `PLATFORM_OBJECTS` array (type `IntegrationObjectInfo[]`) and/or in a metadata JSON file at `metadata/integrations/.platform-name.json`. The engine merges static metadata ON TOP of live discovery — static values win for fields they specify, but live-discovered fields/objects that aren't in the static list are preserved.

**When to use which approach:**

| Scenario | Approach |
|---|---|
| Platform has a schema/describe/metadata API endpoint | **Dynamic** via `DiscoverObjects()` + `DiscoverFields()`. Add static overlay only for MJ-specific metadata (PaginationType, ResponseDataKey, etc.) that the API doesn't provide. |
| Platform has no metadata endpoint (most common) | **Static** `PLATFORM_OBJECTS` array with all objects and fields. `DiscoverObjects()` returns from this array. `DiscoverFields()` fetches one record from the API to infer field types, then merges with static metadata for PK/FK/description annotations. |
| Platform has partial metadata (e.g., field names but not types) | **Hybrid** — `DiscoverFields()` calls the API for what it can provide, then overlays static metadata for PKs, FKs, required flags, descriptions. |

**Key fields on IntegrationObject that must be set correctly:**
- `APIPath` — the URL path segment for this object (e.g., `contacts`, `MemberList`, `accounts`)
- `PaginationType` — `None`, `PageNumber`, `Offset`, or `Cursor`
- `DefaultPageSize` — batch size for paginated fetches (e.g., 100, 200, 500)
- `ResponseDataKey` — the JSON key containing the array of records in the API response (e.g., `results`, `data`, `Members`). If the response IS the array (no envelope), set to `null`.
- `DefaultQueryParams` — JSON string of default query params appended to every request (e.g., `{"DateFrom": "2000-01-01"}`)
- `SupportsWrite` — whether the object supports POST/PUT/DELETE
- `SupportsPagination` — whether the endpoint returns paginated results
- `Category` — optional grouping (e.g., `Association`, `Report`, `CRM`)

**Key fields on IntegrationObjectField:**
- `Name` — exact API field name (case-sensitive)
- `Type` — MJ-compatible type: `string`, `number`, `boolean`, `datetime`, `decimal`, `nvarchar`, etc.
- `IsPrimaryKey` — true for the field(s) that uniquely identify a record
- `IsForeignKey` — true if this field references another IntegrationObject
- `RelatedIntegrationObjectID` — if IsForeignKey, the ID of the parent IntegrationObject (enables template-variable parent-child fetching)
- `IsRequired` — true if the API requires this field for create/update
- `IsReadOnly` — true if the field cannot be set via POST/PUT (e.g., auto-generated IDs, timestamps)

**For connectors with NO live discovery**, ALL objects and fields MUST be in the static metadata. The engine won't know about endpoints that aren't in `IntegrationObject` rows.

E. Error Handling
Map platform-specific HTTP errors to MJ's error types:

401 → re-authenticate, then retry once
429 → exponential backoff (start 1s, max 60s, jitter)
404 on a record → SyncErrorCode.RecordNotFound (or equivalent in codebase)
5xx → retry up to 3 times with backoff, then fail with descriptive error
Validation errors (400/422) → parse error body and include field-level details in error message

Check how existing connectors handle errors. Match that pattern.
F. TypeScript Quality

Zero any types. Define interfaces for every API response shape.
Zero // @ts-ignore.
All fields strongly typed. Define interface [Platform]Record, interface [Platform]PaginationInfo, etc.
Use readonly where appropriate on config/constant properties.


Execution Steps (follow this order)
Step 1: Codebase Discovery
Read these files in this order:
1. packages/Integration/core/src/BaseIntegrationConnector.ts
2. packages/Integration/core/src/BaseRESTIntegrationConnector.ts
3. packages/Integration/connectors/src/index.ts
4. The reference connector file(s) selected above
5. Any shared types/interfaces imported by those connectors
After reading, write a brief summary of:

The exact abstract methods you must implement
The method signatures (params + return types)
Patterns you noticed across multiple connectors

Step 2: API Documentation Analysis
Fetch the API docs URL provided above.
Produce a complete inventory:
- Every resource/endpoint (GET, POST, PUT, DELETE)
- Auth flow details
- Pagination mechanism
- Rate limit specifics
- Response format/envelope
- Change detection mechanism (updated_at, CDC, etc.)
- Any metadata/describe/schema endpoints
Step 3: Implementation
Write the connector following everything above. For each method you implement, add a brief code comment explaining any platform-specific quirk.
Step 4: Integration
Update packages/Integration/connectors/src/index.ts to export the new connector. Follow the exact pattern used for existing exports.
Step 5: Build Verification
bashcd packages/Integration/connectors
npm run build
Fix any errors. Re-run until clean.
Step 6: Self-Review Checklist
Go through each item. If ANY check fails, fix it before presenting results.

 Read the base class files before writing code (not after)
 DiscoverObjects() returns ALL API endpoints, not a subset
 DiscoverFields() returns accurate field types, PKs, FKs, required flags
 FetchChanges() paginates to completion (tested: what happens with 1000+ records?)
 FetchChanges() correctly uses watermarks for incremental sync
 CreateRecord(), UpdateRecord(), DeleteRecord() implemented for all writable objects
 SupportsCreate, SupportsUpdate, SupportsDelete getters return true
 Auth handles token expiry/refresh without manual intervention
 Rate limiting handled with exponential backoff + jitter (not fixed sleep)
 All response envelope patterns handled in ExtractRecords()
 Pagination works for cursor, offset, AND page-number patterns (if platform uses multiple)
 Zero any types — all API response shapes have interfaces
 @RegisterClass decorator present with correct arguments
 Tree-shaking prevention function exported
 index.ts updated with new export
 npm run build passes with zero errors and zero warnings
 Code comments explain platform-specific quirks


Common Mistakes to Avoid
These are the most frequent failure modes. Check your work against each one:

Pagination off-by-one: Stopping before the last page because you check results.length === 0 instead of results.length < pageSize (or vice versa depending on the API). Read how the reference connector handles the termination condition.
Hardcoding the first page only: FetchChanges() must loop through ALL pages. If you see a single API call without a pagination loop, that's a bug.
Ignoring the response envelope: If the API returns { data: [...], meta: {...} }, you must unwrap data, not try to iterate the top-level object.
Wrong auth token placement: Some APIs want Authorization: Bearer TOKEN, others want X-Api-Key: TOKEN, others want it as a query param. Check the actual API docs, don't guess.
Incomplete object list: Shipping with 10 objects when the API has 40. The prompt says ALL endpoints. Count them.
Not matching base class signatures: If the base class FetchChanges() returns Promise<SyncResult> and you return Promise<any[]>, the build will pass but runtime will fail. Read the base class.
Skipping DiscoverFields() implementation: Returning empty arrays or generic fields. Every field the API returns should be discovered with its correct type.
Not handling empty responses: API returns null, undefined, or { data: null } instead of { data: [] }. Your ExtractRecords() must handle this.


Output Format
Present your work in this order:

Codebase analysis summary (what you learned from reading the base classes and reference connectors)
API inventory (complete list of discovered endpoints and their CRUD capabilities)
The connector file ([PlatformName]Connector.ts)
Updated index.ts (show the diff, not the whole file)
Build results (paste npm run build output)
Self-review checklist (mark each item pass/fail with brief notes)