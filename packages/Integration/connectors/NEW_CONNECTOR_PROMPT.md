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

Both tables have an `IsCustom BIT` column:
- `IsCustom = 0` (default) — standard platform object/field, defined in static metadata
- `IsCustom = 1` — custom object/field created by the customer in their instance, discovered at runtime

**The two-layer architecture:**

### Layer 1: Complete Static Metadata (MANDATORY — no gaps)

**Every single standard endpoint and every single standard field** must be defined in the metadata JSON file at `metadata/integrations/.platform-name.json`. This is non-negotiable. The metadata is pushed to the database via `mj-sync push` and becomes the authoritative source for standard objects/fields.

**How to research:** Use the platform's own API to enumerate all standard objects/fields programmatically:
- HubSpot: `/crm/v3/properties/{objectType}` returns all default properties with types
- Salesforce: Describe API (`/services/data/vXX.0/sobjects/{object}/describe/`)
- QuickBooks: Entity metadata endpoints
- Sage Intacct: `inspect` XML operation
- For APIs without introspection: webscrape official documentation for endpoint/field tables

Run the API once, capture ALL results, convert to IntegrationObject/IntegrationObjectField JSON format. Every field must include: Name, DisplayName, Type, IsPrimaryKey, IsRequired, IsReadOnly, Description, AllowsNull.

The connector's `PLATFORM_OBJECTS` TypeScript array and the metadata JSON file must match.

### Layer 2: Custom Object/Field Discovery (runtime, `IsCustom = true`)

For platforms that support user-created objects/fields, the connector implements a discovery interface:

```typescript
/** Discover custom objects created by the customer in their instance */
async DiscoverCustomObjects(companyIntegration, contextUser): Promise<ExternalObjectSchema[]>

/** Discover custom fields on an object (standard or custom) */
async DiscoverCustomFields(companyIntegration, objectName, contextUser): Promise<ExternalFieldSchema[]>
```

Each platform has its own mechanism:
- **HubSpot**: `/crm/v3/schemas` for custom objects, `/crm/v3/properties/{object}` with `hubspotDefined: false` for custom fields
- **Salesforce**: Objects/fields ending in `__c` suffix
- **QuickBooks**: Custom fields via `CustomField` array in entity responses
- **AMS connectors** (YM, Wicket, etc.): typically no custom objects/fields — discovery returns empty

Discovered custom objects/fields are persisted to IntegrationObject/IntegrationObjectField with `IsCustom = true`. The discovery captures whatever metadata the API provides (type, constraints, descriptions). If the API doesn't provide a value, it's NULL — the SchemaBuilder will make minimal assumptions (nullable, nvarchar).

### What goes where:

| Data | Where it lives | IsCustom |
|---|---|---|
| Standard endpoints (contacts, deals, etc.) | Static metadata JSON → mj-sync push | false |
| Standard fields (email, name, hs_object_id, etc.) | Static metadata JSON → mj-sync push | false |
| Custom objects (customer-created) | Discovery → IntegrationSchemaSync → DB | true |
| Custom fields (customer-added to any object) | Discovery → IntegrationSchemaSync → DB | true |

### After both layers are in the DB:
RSU reads from IntegrationObject/IntegrationObjectField (standard + custom together) and generates DDL for all of them. No special handling — same SchemaBuilder, same pipeline. The only difference is that custom objects/fields have fewer guaranteed constraints.

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

D3. Parent-Child (Template Variable) Endpoints

Some APIs require a parent ID to fetch child records (e.g., `/orders/{orderId}/items`, `/groups/{groupId}/members`). The base class `BaseRESTIntegrationConnector` has built-in support for this via **template variables** in `APIPath`:

- Set `APIPath` to a path with `{VariableName}` placeholders: e.g., `orders/{OrderID}/items`
- The engine detects template variables, looks up the parent IntegrationObject via FK metadata on `IntegrationObjectField.RelatedIntegrationObjectID`, loads parent IDs from the local MJ database, and iterates per parent.
- **Important**: Template variables only work for **path segments**, not query parameters. If the API requires parent IDs as **query params** (e.g., `?BatchId=123`), you must handle this in a `FetchChanges()` override — see `YourMembershipConnector.ts` `FetchChildRecords()` for the pattern.
- For every child object, ensure the FK field has `IsForeignKey: true` and `RelatedIntegrationObjectID` pointing to the parent object.

D4. Additional Required Methods

These methods are also required but often forgotten:

| Method | Purpose |
|---|---|
| `TestConnection()` | Validates credentials by making a lightweight API call. Must return `ConnectionTestResult` with Success/Message. Called from the "Test Connection" UI button. |
| `GetBaseURL()` | Returns the API base URL for a specific company integration. Override if the URL varies per tenant (e.g., Salesforce instance URLs, self-hosted platforms). |
| `IntrospectSchema()` | Full schema introspection — called by SchemaBuilder to create DB tables. Returns `SourceSchemaInfo` with objects, fields, PKs, and relationships. Typically calls `DiscoverObjects()` + `DiscoverFields()` for each object internally. |
| `GetDefaultFieldMappings(objectName)` | Returns default source→destination field mappings for auto-creating field maps during `IntegrationApplyAll`. If not overridden, the engine auto-maps by matching field names. Override to handle renamed fields or add computed mappings. |
| `GetActionGeneratorConfig()` | Returns config for auto-generating MJ Actions (Search, List, Get, Create, Update, Delete) for each integration object. Set `IconClass`, `CategoryDescription`, `IncludeSearch`, `IncludeList`, etc. |

D5. Bidirectional Sync Considerations

The integration engine supports `SyncDirection: 'Pull' | 'Push' | 'Bidirectional'` on entity maps. If the connector supports writes:

- The engine's `ProcessPushSync()` detects MJ-side changes via **Record Changes**, reverse-maps fields (MJ → external), and calls `CreateRecord()`/`UpdateRecord()`/`DeleteRecord()` on the connector.
- Per-field Direction (`SourceToDest` | `DestToSource` | `Both`) controls which fields are pushed vs pulled.
- The `SupportsCreate`/`SupportsUpdate`/`SupportsDelete` getters MUST return `true` for push to work.
- Push watermarks are tracked separately from pull watermarks.
- For bidirectional sync, the engine runs pull first, then push. Changes made by the pull sync are excluded from the push (filtered by source user ID) to prevent echo loops.

D6. Performance & Efficiency Requirements (Non-Negotiable)

These are not "nice to have" — they must be implemented from the start, not deferred.

**1. Token/Session Caching:**
- Auth tokens MUST be cached and reused until expiry. Do NOT re-authenticate on every API call.
- Cache strategy: store token + expiry timestamp, refresh proactively before expiry.
- Check existing connectors: `YourMembershipConnector` caches sessions with TTL, `SalesforceConnector` caches JWT tokens.

**2. Batch CRUD (if platform supports it):**
- If the platform supports batch/bulk create/update/delete (e.g., Salesforce SObject Collections, HubSpot Batch API, QuickBooks Batch), implement batch methods alongside individual CRUD.
- Name them `CreateRecordsBatch()`, `UpdateRecordsBatch()`, `DeleteRecordsBatch()`.
- The engine's push sync will use these when available for dramatically better performance.

**3. Change Data Capture / Webhooks:**
- If the platform provides CDC endpoints (e.g., Salesforce CDC, QuickBooks CDC, HubSpot webhooks), implement support.
- CDC is preferred over polling for incremental sync — single API call vs N queries.
- If the platform supports webhooks, document the webhook payload format and how to register receivers.

**4. Server-Side Date Filtering:**
- If the platform's list/query endpoints support `modified_since`, `updated_after`, or similar date filters, YOU MUST USE THEM.
- Pass the watermark value as a server-side filter parameter — do NOT fetch all records and filter client-side.
- If the platform has NO server-side date filtering (e.g., YourMembership), document this limitation and ensure the engine's `entity.Dirty` skip-unchanged optimization handles it.

**5. Pagination Efficiency:**
- Use the largest page size the API allows to minimize round trips.
- If the platform supports cursor-based pagination, prefer it over offset (avoids drift on large datasets).
- If the platform has a batch/bulk query endpoint (e.g., Salesforce Bulk API 2.0 for >10K records), implement it for large datasets.

**6. Response Caching for Metadata:**
- Cache `DiscoverObjects()` and `DiscoverFields()` results in-memory for the duration of a sync run. Do NOT re-fetch metadata on every entity map.
- The base class `GetCachedObject()`/`GetCachedFields()` handles this — use them.

D7. Future-Proofing

**When the platform adds new endpoints, the connector should pick them up automatically OR make it trivial to add them:**

- **Live discovery connectors** (Salesforce, Sage Intacct, HubSpot CRM): New endpoints appear automatically via the discovery API. No code changes needed for new objects.
- **Static list connectors** (QuickBooks, Wicket, YM, Rasa): New endpoints require adding to the static `PLATFORM_OBJECTS` array. Keep the array well-organized with section comments so additions are obvious.
- **Non-CRM/secondary APIs** (HubSpot non-CRM, QuickBooks Payments/Payroll): These are separate API paths that won't be auto-discovered. Document which API categories exist and which are implemented. When adding a connector, enumerate ALL API categories the platform offers — even if you don't implement them all, document what's missing and why (e.g., "Payments API — separate product, requires separate OAuth scope").

D8. Date and Value Sanitization

External APIs return invalid date values that SQL Server rejects. Your connector's `NormalizeResponse()` MUST sanitize these:

- **Empty strings** (`""`) → `null` for all date/datetime fields (DATETIMEOFFSET columns reject empty strings)
- **DateTime.MinValue** (`0001-01-01T00:00:00`) → `null` (common in .NET-based APIs like YourMembership)
- **Invalid dates** (e.g., `0000-00-00`) → `null`

The `YourMembershipConnector` has a `SanitizeDateFields()` method as a reference implementation. Apply the same pattern to any API that returns sentinel values instead of null for empty dates.

D9. Generated Actions for Integration Objects

The MJ integration platform auto-generates CRUD actions (Get, Create, Update, Delete, Search, List) from IntegrationObject/IntegrationObjectField metadata:

- **`ActionMetadataGenerator`** reads object/field metadata and generates action definitions
- **`IntegrationActionExecutor`** is the single shared DriverClass for all integration actions
- **CLI**: `npx tsx src/generate-integration-actions.ts [-- connector-name]` generates action JSON files to `metadata/actions/integrations-auto-generated/`
- Each connector implements `GetActionGeneratorConfig()` and `GetIntegrationObjects()` to provide the source data

Create/Update/Delete actions are only generated for objects with `SupportsWrite: true`. Read-only reference objects (e.g., User, RecordType, TaxCode) should set `SupportsWrite: false` to prevent write action generation.

For custom objects: the CLI currently generates actions from the static TypeScript array. After custom discovery persists objects to the DB, the CLI can be extended to also query IsCustom=true records.

E. Error Handling
Map platform-specific HTTP errors to MJ's error types:

401 → re-authenticate, then retry once
**403 → NEVER remove the object from metadata.** A 403 means the customer's API credentials don't have the required scope/permission for this object. Log a clear warning: "Object X requires additional API permissions/scopes — add scope Y to your OAuth app." Skip the object for this sync run and continue. The base class `BaseRESTIntegrationConnector` handles this automatically for FetchSinglePage/FetchPaginatedLoop.
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
 TestConnection() makes a real API call and returns meaningful success/failure
 IntrospectSchema() returns complete SourceSchemaInfo for all objects
 GetBaseURL() handles multi-tenant/instance-specific URLs
 Parent-child endpoints use template variables or FetchChanges override
 IntegrationObject metadata fields set: APIPath, PaginationType, ResponseDataKey, DefaultPageSize
 IntegrationObjectField PKs and FKs correctly annotated
 Auth tokens cached with TTL — NOT re-authenticating on every API call
 Batch CRUD implemented if platform supports it (batch create/update/delete)
 Server-side date filtering used in FetchChanges if API supports modified_since/updated_after
 Largest supported page size configured in DefaultPageSize
 All API categories documented (even unimplemented ones) with reasons for exclusion
 CDC/webhook support implemented or documented as unavailable


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


Static Metadata Completion Algorithm

When adding or auditing a connector's static metadata, follow this algorithm exactly. The goal is ZERO missing standard objects or fields. **This is not optional — every step must be executed with proof.**

### Research Methodology (MANDATORY for every connector)

**You MUST use at least 2 independent sources to verify completeness.** Checking TS matches metadata is NOT verification — both could be equally incomplete. You must verify against the ACTUAL API.

**Tier 1 sources (use first — authoritative):**
- **OpenAPI/Swagger spec** — fetch the raw JSON/YAML spec (e.g., `api-docs.rasa.io/swagger.json`). This is the single best source because it's machine-readable and complete.
- **Official API reference docs** — the developer portal's endpoint listing (e.g., `developer.intacct.com/api/`, `developers.hubspot.com/docs/reference/api/`)
- **Programmatic self-describing APIs** — endpoints that list available objects (e.g., Salesforce `/sobjects`, HubSpot `/crm/v3/schemas`, Sage Intacct `inspect`)

**Tier 2 sources (cross-reference — catches what docs miss):**
- **Official SDKs** — Ruby, PHP, Python, Node SDKs often expose entity classes/methods that map 1:1 to API endpoints. SDKs sometimes support endpoints that the docs haven't been updated to cover.
- **API Blueprint / Apiary docs** — some platforms host API specs on Apiary (e.g., Wicket)
- **Third-party integration platforms** — Tray.io, Zapier, Make connector docs list supported objects

**Tier 3 sources (supplementary):**
- **Community forums / StackOverflow** — for discovering undocumented endpoints
- **Third-party SDK wrappers** — npm/PyPI packages that wrap the API

**For each connector, your research report MUST include:**
```
Verification Report: [Connector Name]
Sources used:
  1. [Primary source URL] — [what it provided]
  2. [Cross-reference source URL] — [what it confirmed/added]
Objects found: [count]
Objects in metadata: [count]
Missing: [list or "none"]
Proof: [how you verified totality — e.g., "Swagger spec lists exactly N paths"]
```

**Examples of good research (what was done for the current connectors):**
- **Rasa.io**: Fetched `swagger.json` directly → found 14 endpoints (was only 4). Machine-readable, authoritative, complete.
- **Sage Intacct**: Fetched each category page at `developer.intacct.com/api/{category}` → found 150+ objects across 18 categories → added 38 commonly-used ones.
- **Wicket**: Fetched Apiary API Blueprint + cross-referenced PHP SDK `Client.php` → confirmed 18 documented + found 2 undocumented but SDK-supported (web_addresses).
- **QuickBooks**: Cross-referenced node-quickbooks SDK + quickbooks-ruby SDK + official all-entities docs → confirmed 33 core + 3 niche entities.
- **YourMembership**: 123 objects derived from Swagger introspection, cross-referenced with Ruby SDK (66 XML API methods) → confirmed comprehensive.
- **HubSpot**: CRM objects from official Object Types docs (32 types) + non-CRM from connector's API path catalog (27 endpoints) → 92 total.
- **Salesforce**: Object Reference docs + standard objects list → 35 objects with full field expansion.

**Examples of BAD research (what to avoid):**
- "TS has 35 objects, metadata has 35 objects, they match → done" — This proves nothing. Both could be equally incomplete.
- Checking only the CRM objects for HubSpot and missing 26 non-CRM endpoints
- Assuming a connector with "many objects" is complete without verifying against docs

```
for connector in [HubSpot, YourMembership, Rasa, Wicket, QuickBooks, Salesforce, SageIntacct]:

    # ── Step 1: Discover ALL standard objects ──────────────────────
    objects = []

    if connector.has_programmatic_object_discovery():
        # e.g., HubSpot /crm/v3/schemas, Salesforce /sobjects, Sage inspect
        objects = call_api_to_list_all_objects()

    # ALWAYS also scrape official API docs (even if API gives objects)
    # to catch non-discoverable endpoints (HubSpot non-CRM, QB reports, etc.)
    doc_objects = webscrape_api_docs(connector.docs_url)
    objects = merge_and_dedupe(objects, doc_objects)
    
    # ALWAYS cross-reference with at least one SDK or third-party source
    sdk_objects = check_official_sdks(connector.sdk_repos)
    objects = merge_and_dedupe(objects, sdk_objects)

    # Cross-reference with existing static PLATFORM_OBJECTS in connector .ts
    # Loop until convergence — keep discovering and adding until nothing is missing
    while True:
        existing_static = read_connector_ts_static_array()
        missing_objects = objects - existing_static
        extra_objects = existing_static - objects
        if len(extra_objects) > 0:
            log("STALE objects in static — verify these still exist: ", extra_objects)
        if len(missing_objects) == 0:
            break  # converged — all objects accounted for
        # Add missing objects to static metadata and loop again
        add_objects_to_static_metadata(missing_objects)
        add_objects_to_metadata_json(missing_objects)

    # ── Step 2: For each object, discover ALL standard fields ─────
    for obj in objects:
        fields = []

        if connector.has_programmatic_field_discovery(obj):
            # e.g., HubSpot /crm/v3/properties/{obj}, Salesforce describe
            fields = call_api_to_list_all_fields(obj)
            # API gives us: name, type, required, readOnly, description, unique

        if len(fields) == 0:
            # No programmatic discovery — scrape docs for field tables
            fields = webscrape_field_tables(connector.docs_url, obj)

        if len(fields) == 0:
            # Last resort — fetch one sample record, infer fields from keys
            sample = call_api_get_one_record(obj)
            fields = infer_fields_from_sample(sample)

        # For each field, determine constraints:
        for field in fields:
            field.type = map_to_mj_type(field.api_type)
            field.is_primary_key = prove_pk(field, obj)
            field.is_required = field.api_required       # NULL if API doesn't say
            field.is_read_only = field.api_read_only     # NULL if API doesn't say
            field.description = field.api_description    # NULL if API doesn't say
            field.allows_null = not field.is_required

        # Loop until convergence — keep discovering and adding until nothing is missing
        while True:
            existing_fields = read_metadata_json_fields(connector, obj)
            missing_fields = fields - existing_fields
            if len(missing_fields) == 0:
                break  # converged — all fields accounted for
            add_fields_to_metadata_json(connector, obj, missing_fields)
            add_fields_to_static_array(connector, obj, missing_fields)

    # ── Step 3: Write complete metadata JSON ──────────────────────
    write_metadata_json(connector, objects, all_fields)  # metadata/integrations/.{connector}.json

    # ── Step 4: Update connector .ts static array to match ────────
    update_connector_static_objects_array(connector, objects, all_fields)

    # ── Step 5: Custom discovery interface ─────────────────────────
    if connector.supports_custom_objects_or_fields():
        implement_custom_discovery_interface(connector)
        # HubSpot: /crm/v3/schemas + hubspotDefined=false
        # Salesforce: __c suffix
        # QuickBooks: CustomField arrays
    else:
        implement_noop_custom_discovery(connector)  # AMS connectors — return empty

    # ── Step 6: Generated actions for custom ──────────────────────
    verify_action_generator_config_covers_custom(connector)

    # ── Step 7: Verify bidirectional sync ─────────────────────────
    for obj in objects:
        if obj.supports_write:
            verify_create_record_works(connector, obj)
            verify_update_record_works(connector, obj)
            verify_delete_record_works(connector, obj)
            verify_field_map_direction_respected(connector, obj)

    # ── Step 8: Build and verify ──────────────────────────────────
    build_package(connector)
    assert build_passes()

    # ── Step 9: Prove completeness ────────────────────────────────
    report = {
        'connector': connector.name,
        'total_objects': len(objects),
        'total_fields': sum(len(obj.fields) for obj in objects),
        'source': 'API' or 'docs' or 'sample',  # per object
        'custom_discovery': connector.supports_custom(),
        'bidirectional': [obj.name for obj in objects if obj.supports_write],
        'proof_url': connector.docs_url,
    }
    print(report)
```

For **FileFeed**, **RelationalDB** — skip (schema-on-read, no static metadata needed).

**Programmatic-first approach**: Always prefer the platform's self-describing API over manual doc research. Run the API once, capture ALL results, convert to metadata JSON format. Only manually research what the API can't tell us. For platforms without introspection, webscrape official doc pages for endpoint/field tables.


Output Format
Present your work in this order:

Codebase analysis summary (what you learned from reading the base classes and reference connectors)
API inventory (complete list of discovered endpoints and their CRUD capabilities)
The connector file ([PlatformName]Connector.ts)
Updated index.ts (show the diff, not the whole file)
Build results (paste npm run build output)
Self-review checklist (mark each item pass/fail with brief notes)