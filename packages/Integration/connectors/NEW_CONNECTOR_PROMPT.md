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

MethodPurposeKey GotchasAuthenticate()Return RESTAuthContextMust handle token refresh. Use MJ Credentials entity — never hardcode secrets. Check how other connectors cache tokens.DiscoverObjects()Return IntegrationObjectInfo[] for all API resourcesIf platform has a metadata endpoint, use it. Otherwise build a complete static PLATFORM_OBJECTS array. Every GET-able resource = one object.DiscoverFields(objectName)Return field metadata per objectSee CRITICAL section below — MUST use dynamic discovery first.FetchChanges()Incremental data retrievalMust respect watermarks. Must handle pagination to completion (don't stop at page 1). Prefer server-side updated_at>= filtering over client-side comparison.CreateRecord()POST new recordSet SupportsCreate getter to true. Return the created record's ID.UpdateRecord()PUT/PATCH existing recordSet SupportsUpdate getter to true. Use PATCH if platform supports partial updates.DeleteRecord()DELETE recordSet SupportsDelete getter to true. Handle soft-delete platforms gracefully.ExtractPaginationInfo()Parse pagination metadata from responseMatch the platform's exact pagination pattern.BuildPaginatedURL()Construct URL for next pageMust work for all objects, not just one.ExtractRecords()Unwrap response envelopeHandle { data: [...] } vs { results: [...] } vs raw array vs JSON:API etc.

### 🚨 CRITICAL: DiscoverFields() MUST Be Dynamic — NEVER Static-Only

`DiscoverFields()` is the most important method for ensuring CodeGen doesn't skip integration tables. If it returns only the 2-3 static overlay fields, CodeGen has nothing to work with.

**Required pattern for EVERY connector:**

```typescript
public override async DiscoverFields(
    companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
): Promise<ExternalFieldSchema[]> {
    // 1. DYNAMIC FIRST: Try to fetch one sample record from the API
    try {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, `${baseURL}/${objectName}?limit=1`, 'GET', headers);
        if (response.Status === 200) {
            const records = this.NormalizeResponse(response.Body, null);
            if (records.length > 0) {
                return this.InferFieldsWithOverlay(records[0], objectName, PLATFORM_OBJECTS);
            }
        }
    } catch { /* fall through to static */ }

    // 2. STATIC FALLBACK: Only if API call fails (auth not configured, endpoint down, etc.)
    const staticObj = PLATFORM_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
    if (!staticObj) return [];
    return staticObj.Fields.map(f => ({ ... }));
}

// 3. MERGE: Infer ALL fields from sample, overlay static PK/FK metadata on top
private InferFieldsWithOverlay(
    sample: Record<string, unknown>, objectName: string, allObjects: IntegrationObjectInfo[]
): ExternalFieldSchema[] {
    const staticObj = allObjects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
    const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
    const fields: ExternalFieldSchema[] = [];
    for (const [key, value] of Object.entries(sample)) {
        if (key === '_links' || key === 'links') continue; // skip HATEOAS
        const sf = staticMap.get(key.toLowerCase());
        fields.push({
            Name: key,
            Label: sf?.DisplayName ?? key,
            Description: sf?.Description ?? '',
            DataType: sf?.Type ?? this.InferType(value), // infer from value if no static type
            IsRequired: sf?.IsRequired ?? false,
            IsUniqueKey: sf?.IsPrimaryKey ?? false,
            IsReadOnly: sf?.IsReadOnly ?? false,
        });
    }
    return fields;
}
```

**Why this matters:**
- Without dynamic field discovery, CodeGen only sees the 2-3 overlay fields (PK, FK, date) and skips the table
- With dynamic discovery, CodeGen sees ALL fields the API returns and creates proper typed entities
- The static overlay adds the metadata the API can't provide (PK/FK flags, descriptions)
- If auth isn't configured yet (first-time setup), the static fallback still works

**Platforms with native describe/metadata APIs should use those instead of sample records:**
- Salesforce: `/sobjects/{objectName}/describe` → full field metadata with types, required flags, picklist values
- NetSuite: `/metadata-catalog/nstype/{recordType}` → JSON Schema with properties, required array
- HubSpot: `/crm/v3/properties/{objectType}` → property definitions with type, readOnly, hasUniqueValue

**Every connector in the codebase follows this pattern. Do NOT deviate.**
D. API Coverage Completeness — EVERY ENDPOINT, NO EXCEPTIONS
This is the single most important requirement. A connector that covers 10 out of 50 endpoints is NOT a connector — it is a demo. You must cover the platform's ENTIRE API surface.

**The mandate:**
1. Fetch and parse the platform's API documentation (fetch the URL, read it)
2. Enumerate **EVERY** resource/endpoint that supports GET (list)
3. For each resource, check POST/PUT/PATCH/DELETE support
4. **EVERY** endpoint must be reachable for sync — no cherry-picking "common" ones
5. **EVERY** writable endpoint must support bidirectional sync (Create/Update/Delete where the API allows)
6. **EVERY** endpoint with date filtering must support incremental sync via watermarks

**Two-tier strategy for coverage — Dynamic + Static:**

| Tier | When to use | How it works |
|---|---|---|
| **Dynamic discovery** (preferred) | Platform has a metadata/describe/schema API (e.g., NetSuite `/record/v1/metadata-catalog`, Salesforce `/sobjects`, HubSpot `/crm/v3/schemas`) | `DiscoverObjects()` calls the metadata API at runtime to enumerate ALL available record types. `DiscoverFields()` calls the field-describe endpoint per record type. New endpoints added to the platform are automatically picked up — zero code changes needed. |
| **Static metadata** (fallback) | Platform has NO metadata API (most platforms) | Define ALL objects and fields in the connector's `PLATFORM_OBJECTS` array AND in metadata JSON files at `metadata/integrations/.platform-name.json`. These populate the `IntegrationObject` and `IntegrationObjectField` database tables via `mj-sync push`. |
| **Hybrid** | Platform has partial metadata (e.g., field names but not types, or objects but not all fields) | `DiscoverObjects()` uses live API + static overlay. `DiscoverFields()` fetches live schema and merges with static PK/FK/description annotations. |

**For platforms with 50+ endpoints (e.g., NetSuite ~100+ record types, Blackbaud ~70+ resources):**
- You MUST use dynamic discovery — hardcoding 100 static objects with field definitions is unmaintainable
- Implement `DiscoverObjects()` to hit the platform's metadata API and return the full catalog
- Implement `DiscoverFields(objectName)` to fetch field metadata from the describe endpoint
- Add a static overlay ONLY for MJ-specific metadata that the API can't provide (PaginationType, ResponseDataKey, Category, parent-child FK annotations)

**For platforms with <50 endpoints (e.g., Wild Apricot ~22, Constant Contact ~19):**
- Static `PLATFORM_OBJECTS` array is acceptable, but it MUST cover ALL endpoints
- Cross-reference against the live API docs — if the docs list an endpoint and you don't have it, that's a gap

**What "every endpoint" means in practice:**
- If the API has `/contacts`, `/events`, `/invoices`, `/payments`, `/refunds`, `/donations`, `/orders`, `/membergroups`, `/emailmessages`, `/auditlog` — you implement ALL of them, not just contacts and events
- If `/events/{id}/sessions` and `/events/{id}/registrations` exist as sub-resources — those are separate IntegrationObjects with parent-child relationships
- Lookup/reference tables (membership types, payment methods, categories) — include them as read-only objects
- Utility/action endpoints (void invoice, clone event, send email) — document in header comment but don't model as sync objects

**The core principle: Dynamic Discovery + Static Metadata Overlay**

Every connector MUST maximize what it learns from the API at runtime. The pattern is:

1. **`DiscoverObjects()`** — Call the platform's metadata/describe/schema endpoint to enumerate ALL available record types. Extract as much as the API provides: names, labels, write support, field lists, constraints. If the platform has no metadata endpoint, fall back to a complete static list — but the static list must cover EVERY endpoint.

2. **`DiscoverFields(objectName)`** — Call the platform's field-describe endpoint (or fetch one sample record) to learn field names, types, required flags, read-only flags, constraints. Extract everything the API provides.

3. **Static metadata overlay** — For information the API *cannot* self-describe, define it in the connector's `PLATFORM_OBJECTS` array and/or in `metadata/integrations/.platform-name.json` files. The engine merges static metadata ON TOP of live discovery. Common overlay fields:
   - `PaginationType` — the API won't tell you this; you must know it
   - `ResponseDataKey` — the JSON envelope key (e.g., `value`, `items`, `data`)
   - `DefaultPageSize` — optimal page size for the platform
   - Parent-child FK annotations (`IsForeignKey`, `RelatedIntegrationObjectID`)
   - `Category` — grouping for UI display (e.g., `CRM`, `Marketing`, `Finance`)
   - Field descriptions — if the API doesn't provide them
   - `DefaultQueryParams` — any required default filters

The goal: if the platform adds a new record type or field tomorrow, the connector picks it up automatically via discovery. Static overlay is only for what the API structurally cannot provide.

**Important: Metadata is stored in the database, not just TypeScript.**
The `PLATFORM_OBJECTS` array in TypeScript is NOT the final resting place for this metadata. When `IntegrationApplyAll` or `IntegrationApplySchema` runs, the engine calls `DiscoverObjects()` + `DiscoverFields()` and writes the results into `IntegrationObject` and `IntegrationObjectField` DB rows. These DB rows are the runtime source of truth. This means:
- Users/admins can add **custom objects** beyond what the connector discovers (e.g., a custom API endpoint specific to their tenant)
- Users can override field metadata (mark additional fields as required, add descriptions, set FK relationships)
- The static TypeScript array is a **seed** — it populates the DB on first run, and subsequent discovery calls update/merge
- Don't try to cram every field detail into the TypeScript array — define objects with essential metadata (Name, APIPath, PaginationType, SupportsWrite, PK field, key fields), and let `DiscoverFields()` populate the full field inventory from the API at runtime
- For platforms without field-level discovery, include enough fields in the static definition for the engine to create meaningful DB tables (PK + all commonly-used fields)

**Bidirectional sync — non-negotiable for every writable endpoint:**
- Every object with POST support → `SupportsWrite: true` + `CreateRecord()` handles it
- Every object with PUT/PATCH support → `UpdateRecord()` handles it
- Every object with DELETE support → `DeleteRecord()` handles it
- `SupportsCreate`, `SupportsUpdate`, `SupportsDelete` getters must return `true`

**Incremental sync — non-negotiable where the API supports date filtering:**
- If the API supports `modified_since`, `updated_after`, `lastModifiedDate`, `$filter`, or similar → you MUST use it as a server-side filter in `FetchChanges()`
- Do NOT full-sync and filter client-side when server-side filtering is available
- Pass the watermark value as a query/filter parameter to reduce data transfer

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
Step 5: Create Metadata JSON File (MANDATORY — not optional)
Create `metadata/integrations/.{platform-name}.json` following the exact structure of existing files (e.g., `.rasa.json`, `.wild-apricot.json`). This file is what actually populates the `IntegrationObject` and `IntegrationObjectField` database tables via `mj-sync push`.

Structure:
```json
[{
  "fields": {
    "Name": "Platform Name",
    "ClassName": "PlatformConnector",
    "ImportPath": "@memberjunction/integration-connectors",
    "Icon": "fa-solid fa-icon-name"
  },
  "relatedEntities": {
    "MJ: Integration Objects": [
      {
        "fields": {
          "IntegrationID": "@parent:ID",
          "Name": "ObjectName",
          "DisplayName": "Object Display Name",
          "APIPath": "/api/path",
          "PaginationType": "Offset|Cursor|PageNumber|None",
          "DefaultPageSize": 200,
          "ResponseDataKey": "items",
          "SupportsWrite": true,
          "SupportsIncrementalSync": true,
          "Status": "Active"
        },
        "relatedEntities": {
          "MJ: Integration Object Fields": [
            // ONLY overlay fields: PK, FKs, and incremental date field.
            // All other fields are discovered at runtime via DiscoverFields().
          ]
        }
      }
    ]
  }
}]
```

**Requirements:**
- EVERY endpoint must have an IntegrationObject entry — not just the "primary" ones
- For each object, include ONLY overlay fields that cannot be discovered dynamically:
  - PK field (IsPrimaryKey: true)
  - FK fields (IsForeignKey: true — for parent-child relationships)
  - Incremental date field (the field used for watermark-based date filtering)
- Do NOT include every column — `DiscoverFields()` handles the full field inventory at runtime
- New records must NOT include `primaryKey` or `sync` objects — these are auto-populated by `mj-sync push`
- For dynamic discovery connectors (e.g., NetSuite, MJ-to-MJ), the relatedEntities array can be empty — objects are discovered at runtime

Step 6: Build Verification
```bash
cd packages/Integration/connectors
npm run build
```
Fix any errors. Re-run until clean.
Step 7: Self-Review Checklist
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
 Metadata JSON file created at metadata/integrations/.{platform}.json with ALL objects
 Metadata file follows .rasa.json structure (Integration → Objects → overlay Fields)
 Every API endpoint has an IntegrationObject entry in the metadata file
 IntegrationObject fields include PK, FK, and incremental date fields ONLY (not every column)
 Dynamic connectors have empty IntegrationObjects array (objects discovered at runtime)
 Every writable endpoint has SupportsWrite: true AND bidirectional CRUD methods
 Every endpoint with date filtering has SupportsIncrementalSync: true AND server-side watermark filtering in FetchChanges()


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