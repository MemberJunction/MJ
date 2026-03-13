# Salesforce Bidirectional Connector — Implementation Plan

## Goal

Replace the mock `SalesforceConnector` (77 lines, reads from SQL Server `sf.*` tables) with a production-grade, fully bidirectional REST connector that serves as the **gold standard** reference implementation. This connector will demonstrate every capability the integration framework supports: discovery, incremental sync, full CRUD, search, bulk operations, custom object/field support, and comprehensive error handling.

---

## Current State

| Aspect | Current | Target |
|---|---|---|
| Base class | `RelationalDBConnector` | `BaseRESTIntegrationConnector` |
| Data source | Mock SQL tables (`sf.Contact`, etc.) | Salesforce REST API v61.0 |
| Auth | SQL Server connection string | OAuth 2.0 JWT Bearer Token |
| Direction | Pull only (read-only) | Full bidirectional |
| Discovery | SQL `INFORMATION_SCHEMA` | SF Describe API (standard + custom objects/fields) |
| CRUD | Read only | Create, Read, Update, Delete |
| Search | None | SOQL + SOSL |
| Custom objects | None | Full `__c` object and field support |
| Watermark | `LastModifiedDate` column | `SystemModstamp` via SOQL |
| Deleted records | `IsDeleted` column | `queryAll` SOQL / `getDeleted()` API |

---

## Architecture Overview

```
SalesforceConnector (extends BaseRESTIntegrationConnector)
├── Authentication
│   └── OAuth 2.0 JWT Bearer Token flow
│       ├── Sign JWT with private key (RS256)
│       ├── Exchange at /services/oauth2/token
│       ├── Cache access token with expiry tracking
│       └── Auto-refresh on 401 or approaching expiry
│
├── Discovery (standard + custom objects/fields)
│   ├── DiscoverObjects() → GET /services/data/v61.0/sobjects/
│   ├── DiscoverFields(obj) → GET /services/data/v61.0/sobjects/{obj}/describe
│   └── IntrospectSchema() → full object graph with relationships
│
├── Data Retrieval
│   ├── FetchChanges() → SOQL with SystemModstamp watermark
│   │   ├── SELECT ... FROM {Object} WHERE SystemModstamp > {watermark}
│   │   ├── Pagination via /query/{queryLocator} (queryMore)
│   │   └── Deleted records via queryAll (includes IsDeleted=true)
│   └── GetRecord() → GET /services/data/v61.0/sobjects/{Object}/{Id}
│
├── Data Mutation
│   ├── CreateRecord() → POST /services/data/v61.0/sobjects/{Object}/
│   ├── UpdateRecord() → PATCH /services/data/v61.0/sobjects/{Object}/{Id}
│   └── DeleteRecord() → DELETE /services/data/v61.0/sobjects/{Object}/{Id}
│
├── Search
│   └── SearchRecords() → SOQL WHERE clause or SOSL parameterized search
│
└── Rate Limit Handling
    ├── Parse Sforce-Limit-Info header
    ├── Exponential backoff on 429
    └── Proactive throttle when approaching daily limit
```

---

## Phases

### Phase 1: Core Infrastructure & Pull Sync

**Deliverables**: Authentication, discovery, read-only pull sync with watermarks.

#### 1.1 Credential Type — Salesforce JWT Bearer

Create a new credential type for Salesforce's server-to-server JWT Bearer flow.

**File**: `metadata/credential-types/schemas/salesforce-jwt-bearer.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "description": "Salesforce OAuth 2.0 JWT Bearer Token flow credentials",
  "properties": {
    "loginUrl": {
      "type": "string",
      "title": "Login URL",
      "description": "Salesforce login endpoint (login.salesforce.com for production, test.salesforce.com for sandboxes)",
      "default": "https://login.salesforce.com",
      "enum": ["https://login.salesforce.com", "https://test.salesforce.com"]
    },
    "clientId": {
      "type": "string",
      "title": "Consumer Key",
      "description": "Connected App Consumer Key from Salesforce Setup"
    },
    "username": {
      "type": "string",
      "title": "Integration User",
      "description": "Email address of the Salesforce integration user"
    },
    "privateKey": {
      "type": "string",
      "title": "Private Key (PEM)",
      "description": "PEM-encoded RSA private key for JWT signing. The corresponding X.509 certificate must be uploaded to the Connected App in Salesforce.",
      "format": "multiline"
    },
    "apiVersion": {
      "type": "string",
      "title": "API Version",
      "description": "Salesforce REST API version",
      "default": "61.0"
    }
  },
  "required": ["loginUrl", "clientId", "username", "privateKey"]
}
```

**File**: `metadata/credential-types/.credential-types.json` — append entry:

```json
{
  "fields": {
    "Name": "Salesforce JWT Bearer",
    "Description": "Salesforce OAuth 2.0 JWT Bearer Token flow for server-to-server integration. Requires a Connected App with a digital certificate.",
    "Category": "Integration",
    "FieldSchema": "@file:schemas/salesforce-jwt-bearer.schema.json",
    "IconClass": "fa-brands fa-salesforce",
    "ValidationEndpoint": null
  }
}
```

#### 1.2 Integration Metadata — Update Existing Record

The Integration record already exists (ID `3EF73582-BC71-4189-9DF9-867F0D4B074B`). Update `metadata/integrations/.integrations.json` to point to the new credential type and add Integration Objects + Fields.

**Additionally**, create `metadata/integrations/.salesforce.json` (following the Wicket pattern) with:
- Integration record with `CredentialTypeID` pointing to `Salesforce JWT Bearer`
- `relatedEntities` containing `MJ: Integration Objects` for standard SF objects
- Each object containing `relatedEntities` with `MJ: Integration Object Fields`

**Standard objects to seed** (with full field metadata from SF Describe):

| SF Object | Category | APIPath | SupportsWrite | Incremental | Priority |
|---|---|---|---|---|---|
| Account | Core | `/sobjects/Account` | true | true | 1 |
| Contact | Core | `/sobjects/Contact` | true | true | 2 |
| Lead | Core | `/sobjects/Lead` | true | true | 3 |
| Opportunity | Sales | `/sobjects/Opportunity` | true | true | 4 |
| Task | Activity | `/sobjects/Task` | true | true | 5 |
| Event | Activity | `/sobjects/Event` | true | true | 6 |
| Case | Service | `/sobjects/Case` | true | true | 7 |
| Campaign | Marketing | `/sobjects/Campaign` | true | true | 8 |
| User | System | `/sobjects/User` | false | true | 9 |
| CampaignMember | Marketing | `/sobjects/CampaignMember` | true | true | 10 |
| OpportunityContactRole | Sales | `/sobjects/OpportunityContactRole` | true | true | 11 |

**Note on custom objects**: Custom objects (`*__c`) are NOT seeded in metadata. They are discovered at runtime via `DiscoverObjects()` and the user can select which to sync. The metadata system stores them dynamically in `IntegrationObject`/`IntegrationObjectField` after discovery runs.

#### 1.3 Connector Implementation — Authentication

**File**: `packages/Integration/connectors/src/SalesforceConnector.ts` (complete rewrite)

Replace the entire file. The new connector extends `BaseRESTIntegrationConnector`.

**Authentication flow**:

```
JWT Bearer Token Flow:
1. Build JWT assertion:
   - Header: { alg: "RS256", typ: "JWT" }
   - Payload:
     - iss: clientId (Connected App Consumer Key)
     - sub: username (Integration user email)
     - aud: loginUrl (e.g., https://login.salesforce.com)
     - exp: now + 300 (5 minutes)
   - Sign with RSA private key (RS256)

2. Exchange JWT for access token:
   - POST {loginUrl}/services/oauth2/token
   - Body: grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}
   - Response: { access_token, instance_url, token_type }

3. Cache:
   - Store access_token + instance_url
   - Track expiry (default 2 hours, refresh at 80% lifetime)
   - instance_url becomes the base URL for all API calls
```

**Key design decisions**:
- Use `jsonwebtoken` package (already in repo) for JWT signing
- RS256 algorithm (asymmetric — private key stays on server, public cert in SF)
- No refresh token needed — just re-sign a new JWT when token expires
- `instance_url` from token response becomes the base URL (handles pod routing)

#### 1.4 Connector Implementation — Discovery

**DiscoverObjects**:
- Override the base class metadata-driven approach with a LIVE discovery method
- Call `GET {instanceUrl}/services/data/v{apiVersion}/sobjects/`
- Parse `sobjects[]` array — each entry has `name`, `label`, `custom`, `createable`, `updateable`, `deletable`, `queryable`, `searchable`
- Filter to `queryable: true` (exclude non-queryable system objects)
- Map to `ExternalObjectSchema[]`
- **Custom objects**: Automatically included — SF returns `Invoice__c`, `Project__c`, etc.
- Persist discovered objects to `IntegrationObject` metadata (engine handles this)

**DiscoverFields**:
- Call `GET {instanceUrl}/services/data/v{apiVersion}/sobjects/{objectName}/describe`
- Parse `fields[]` array — each entry has `name`, `label`, `type`, `length`, `precision`, `scale`, `nillable`, `createable`, `updateable`, `custom`, `calculated`, `externalId`, `referenceTo[]`, `relationshipName`
- Map SF types to generic types:
  - `string`, `textarea`, `url`, `email`, `phone` → `string`
  - `int` → `integer`
  - `double`, `currency`, `percent` → `decimal`
  - `boolean` → `boolean`
  - `date` → `date`
  - `datetime` → `datetime`
  - `id`, `reference` → `nvarchar(18)` (SF IDs are 18 chars)
  - `picklist`, `multipicklist` → `string` (with picklist values in description)
  - `base64` → `text` (binary content as base64)
- Mark `calculated` fields as `IsReadOnly: true`
- Mark `externalId` fields as `IsUniqueKey: true`
- For `reference` fields, record `referenceTo[0]` as `RelatedIntegrationObjectID` (FK relationship)
- **Compound fields** (`address`, `location`): Skip the compound field itself, expose only component fields (`BillingStreet`, `BillingCity`, etc.) — they're already in the describe response as individual fields
- **Custom fields**: Automatically included — SF returns `Custom_Field__c` alongside standard fields

**IntrospectSchema**:
- Calls DiscoverObjects + DiscoverFields for each object
- Builds full relationship graph from `referenceTo` metadata
- Returns `SourceSchemaInfo` for Schema Builder consumption

#### 1.5 Connector Implementation — FetchChanges (SOQL-Based)

**Strategy**: Use SOQL queries through the Query API instead of per-record REST calls.

```
FetchChanges(ctx):
1. Build SOQL query:
   - SELECT {all queryable fields} FROM {ObjectName}
   - WHERE SystemModstamp > {watermarkValue}  (if watermark exists)
   - ORDER BY SystemModstamp ASC
   - LIMIT {batchSize}

2. Execute query:
   - POST {instanceUrl}/services/data/v{apiVersion}/query
   - Body: q={soqlQuery}  (URL-encoded)

3. Parse response:
   - { totalSize, done, nextRecordsUrl, records[] }
   - Each record has attributes.type + field values

4. Handle pagination:
   - If done=false, nextRecordsUrl contains /query/{locator}
   - Store locator for HasMore=true return
   - On next FetchChanges call, use locator instead of re-querying

5. Deleted records:
   - Use queryAll instead of query to include IsDeleted=true records
   - Mark ExternalRecord.IsDeleted = true for deleted records

6. Update watermark:
   - NewWatermarkValue = max(SystemModstamp) from batch
   - Watermark format: ISO 8601 (e.g., "2026-03-13T10:30:00.000Z")
```

**Override consideration**: Since SF uses SOQL (not standard REST list endpoints), the `FetchChanges` method overrides the base class pagination loop entirely. The base class's `FetchWithPagination` assumes standard REST endpoints with query params; SF's SOQL query + queryMore pattern is fundamentally different.

**Fields to always include in SELECT**:
- `Id` (primary key)
- `SystemModstamp` (watermark)
- `IsDeleted` (soft-delete tracking)
- `LastModifiedById` (audit trail)
- All fields from active `IntegrationObjectField` metadata for the object

#### 1.6 Connector Helpers

**SOQL Builder** (internal helper, not a separate file — keep it as private methods):

```typescript
private BuildSOQLQuery(
    objectName: string,
    fields: string[],
    watermarkValue: string | null,
    batchSize: number,
    includeDeleted: boolean
): string
```

- Properly escapes field names and values
- Handles SF date format in WHERE clause
- Adds `ORDER BY SystemModstamp ASC`
- Adds `LIMIT`

**SF Type Mapper** (internal helper):

```typescript
private MapSalesforceType(sfType: string): string  // Returns generic type
private MapSalesforceTypeToLength(sfType: string, sfLength: number): number | null
```

#### 1.7 Rate Limit & Governor Limit Handling

Salesforce has unique rate limiting via the `Sforce-Limit-Info` response header:
```
Sforce-Limit-Info: api-usage=25/15000
```

**Implementation**:
- Parse `Sforce-Limit-Info` on every response
- Track `currentUsage` and `dailyLimit`
- When usage exceeds 80% of daily limit, increase throttle delay
- When usage exceeds 95%, pause sync and log warning
- Standard 429 handling with exponential backoff (inherited from base)
- Minimum 100ms between requests (SF recommends staying under 25 concurrent requests)

#### 1.8 Unit Tests

**File**: `packages/Integration/connectors/src/__tests__/SalesforceConnector.test.ts`

Test coverage:
- JWT generation and signing
- Token exchange (mocked HTTP)
- Token caching and refresh logic
- SOQL query building (various filter combinations, field lists, watermarks)
- Response normalization (standard objects, custom objects, nested relationships)
- Pagination via queryMore (done=true/false handling)
- Deleted record detection
- SF type → generic type mapping
- Rate limit header parsing
- Governor limit throttling
- Error classification (INVALID_SESSION_ID, MALFORMED_QUERY, REQUEST_LIMIT_EXCEEDED)
- Discovery: DiscoverObjects response parsing
- Discovery: DiscoverFields response parsing (including custom fields, compound fields, formula fields)

---

### Phase 2: Write Operations (Push + Bidirectional)

**Deliverables**: Create, Update, Delete operations; record map tracking; conflict resolution.

#### 2.1 Capability Declarations

```typescript
public override get SupportsCreate(): boolean { return true; }
public override get SupportsUpdate(): boolean { return true; }
public override get SupportsDelete(): boolean { return true; }
public override get SupportsSearch(): boolean { return true; }
```

#### 2.2 CreateRecord

```
POST {instanceUrl}/services/data/v{apiVersion}/sobjects/{ObjectName}/

Request body:
{
  "FirstName": "Jane",
  "LastName": "Doe",
  "Email": "jane@example.com",
  "Custom_Field__c": "value"
}

Success response (201):
{
  "id": "003XXXXXXXXXXXXXXX",
  "success": true,
  "errors": []
}

Error response (400):
[{
  "message": "Required fields are missing: [LastName]",
  "errorCode": "REQUIRED_FIELD_MISSING",
  "fields": ["LastName"]
}]
```

**Implementation details**:
- Strip read-only fields (formula, rollup, auto-number, system fields like `Id`, `CreatedDate`, `SystemModstamp`)
- Strip `null` values for fields that don't allow null
- Return `CRUDResult` with `ExternalID` = response `id`
- Handle SF error codes: `REQUIRED_FIELD_MISSING`, `DUPLICATE_VALUE`, `FIELD_CUSTOM_VALIDATION_EXCEPTION`, `INVALID_FIELD_FOR_INSERT_UPDATE`, etc.

#### 2.3 UpdateRecord

```
PATCH {instanceUrl}/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}

Request body: (only changed fields)
{
  "Email": "newemail@example.com"
}

Success response: 204 No Content
Error response: same as create
```

**Implementation details**:
- Only send changed fields (delta), not full record
- Strip read-only fields
- Handle `ENTITY_IS_LOCKED` error (record in approval process)
- Handle `UNABLE_TO_LOCK_ROW` (concurrent modification — retry with backoff)

#### 2.4 DeleteRecord

```
DELETE {instanceUrl}/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}

Success response: 204 No Content
Error response:
[{
  "message": "entity is deleted",
  "errorCode": "ENTITY_IS_DELETED"
}]
```

**Implementation details**:
- Handle `ENTITY_IS_DELETED` gracefully (already deleted = success)
- Handle `DELETE_FAILED` (cascade constraints, triggers, etc.)
- Some objects don't support delete — check `deletable` from describe metadata
- Validate `SupportsWrite` on the IntegrationObject before attempting

#### 2.5 GetRecord

```
GET {instanceUrl}/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}

Response: full record JSON with all readable fields
```

- Return `null` on 404 (record deleted or ID invalid)
- Normalize field values to `ExternalRecord` format

#### 2.6 SearchRecords (SOQL + SOSL)

Two strategies depending on use case:

**SOQL Search** (structured, field-level filtering):
```sql
SELECT Id, Name, Email FROM Contact
WHERE LastName = 'Smith' AND Email != null
ORDER BY LastModifiedDate DESC
LIMIT 100
```

**SOSL Search** (full-text, cross-object):
```
FIND {Smith} IN ALL FIELDS
RETURNING Contact(Id, Name, Email), Account(Id, Name)
LIMIT 100
```

**Implementation**:
- Default to SOQL for structured `SearchContext.Filters`
- Build WHERE clause from filters map
- Support `Sort`, `Page`, `PageSize` in SearchContext
- Return `SearchResult` with `Records[]`, `TotalCount`, `HasMore`

#### 2.7 Conflict Resolution Enhancement

For bidirectional sync, the engine's existing conflict resolution strategies apply:
- **SourceWins**: Always overwrite (simplest)
- **DestWins**: Keep local MJ changes
- **MostRecent**: Compare `SystemModstamp` (SF) vs `__mj_UpdatedAt` (MJ) — implement timestamp comparison
- **Manual**: Flag for review (create a notification/task)

The connector needs to expose `ModifiedAt` on all `ExternalRecord` objects (from `SystemModstamp`) so the engine can compare timestamps for `MostRecent` resolution.

#### 2.8 Record Map Tracking

The engine already manages `CompanyIntegrationRecordMap` entries. The connector needs to:
- Return `ExternalID` (SF 18-character ID) on all Create operations
- Use `ExternalID` for Update/Delete targeting
- Support SF's `ExternalId` fields for upsert matching (e.g., `External_ID__c`)

#### 2.9 Write Operation Tests

Additional test coverage:
- CreateRecord with standard and custom fields
- CreateRecord error handling (required fields, duplicates, validation rules)
- UpdateRecord with partial field updates
- UpdateRecord error handling (locked records, concurrent modification)
- DeleteRecord success and already-deleted handling
- SearchRecords with various filter combinations
- Conflict resolution timestamp comparison

---

### Phase 3: Advanced Features

**Deliverables**: Bulk API, relationship handling, picklist sync, enhanced error recovery.

#### 3.1 Bulk API 2.0 Support (Large Volume Operations)

For initial full loads or large deltas (>2,000 records), the standard REST API becomes inefficient. Salesforce Bulk API 2.0 handles this:

```
1. Create job:
   POST /services/data/v{apiVersion}/jobs/query
   Body: { operation: "query", query: "SELECT ... FROM Contact" }
   Response: { id: "jobId", state: "UploadComplete" }

2. Poll for completion:
   GET /services/data/v{apiVersion}/jobs/query/{jobId}
   Response: { state: "JobComplete", numberRecordsProcessed: 50000 }

3. Download results:
   GET /services/data/v{apiVersion}/jobs/query/{jobId}/results
   Response: CSV data with all records
```

**When to use Bulk API**:
- `totalSize` from initial SOQL query exceeds 2,000 records
- Initial full sync (no watermark)
- Configurable threshold in Integration metadata (`Configuration` JSON)

**Implementation**:
- Add `UseBulkAPI` configuration option (default: auto-detect based on volume)
- CSV parsing for results (reuse patterns from FileFeedConnector)
- Job polling with exponential backoff
- Timeout handling (SF Bulk jobs can take minutes)
- This is an enhancement within `FetchChanges` — not a separate method

#### 3.2 Relationship Handling

Salesforce has complex relationship types:

**Standard lookups** (single reference):
- `Contact.AccountId → Account.Id`
- Handled naturally by `referenceTo` in describe metadata
- Mapped as soft FK in MJ via `IntegrationObjectField.RelatedIntegrationObjectID`

**Polymorphic lookups**:
- `Task.WhoId → Contact OR Lead`
- `Task.WhatId → Account OR Opportunity OR ...`
- `referenceTo` returns array: `["Contact", "Lead"]`
- **Approach**: Store the raw SF ID; resolve via `Task.Who.Type` field or SF's `typeof()` SOQL function
- Add a transform step to resolve polymorphic IDs if the user maps to a specific entity

**Master-detail relationships**:
- `OpportunityLineItem.OpportunityId → Opportunity.Id` (cascade delete)
- Handled same as standard lookup for sync purposes
- Sync order matters — parent objects must sync before children
- Use `IntegrationObject.Sequence` to control order (Account=1, Contact=2, Opportunity=3, OpportunityLineItem=4)

**Self-referencing**:
- `Account.ParentId → Account.Id`
- Requires two-pass sync: first pass creates all records, second pass updates parent references
- Or: sort by hierarchy depth before inserting

#### 3.3 Picklist Value Synchronization

Salesforce picklist values can be synced to inform the MJ side:

- `describe` response includes `picklistValues[]` for each picklist field
- Each value: `{ value, label, active, defaultValue }`
- Store as `EntityFieldValue` records in MJ (CodeGen handles this if we emit correct metadata)
- Restricted picklists: only allow values from the list
- Dependent picklists: controlled by another field's value (complex — skip for v1)

**Approach**: Expose picklist values in field description during discovery. The user can choose to enforce validation or treat as informational.

#### 3.4 Enhanced Error Recovery

Salesforce-specific error codes to handle:

| Error Code | Meaning | Action |
|---|---|---|
| `INVALID_SESSION_ID` | Token expired | Re-authenticate, retry |
| `REQUEST_LIMIT_EXCEEDED` | Daily API limit hit | Pause sync, notify admin |
| `UNABLE_TO_LOCK_ROW` | Concurrent modification | Retry with backoff (up to 3x) |
| `ENTITY_IS_LOCKED` | Record in approval process | Skip, log warning |
| `MALFORMED_QUERY` | Bad SOQL | Configuration error — fail fast |
| `INVALID_FIELD` | Field doesn't exist | Field removed from SF? Refresh discovery |
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | Trigger/validation rule | Log validation message, skip record |
| `DUPLICATE_VALUE` | Unique constraint violation | Match resolution, skip or update |
| `INSUFFICIENT_ACCESS_OR_READONLY` | Permission issue | Log, skip field or record |
| `STRING_TOO_LONG` | Value exceeds field length | Truncate based on field metadata |

#### 3.5 Compound Address/Geolocation Handling

SF has compound field types (`address`, `location`) that are read-only aggregates:
- `BillingAddress` = `{ street, city, state, postalCode, country, latitude, longitude }`
- The component fields (`BillingStreet`, `BillingCity`, etc.) are individually writable
- `DiscoverFields()` already handles this — compound fields are skipped, components are exposed
- On write: send individual component fields, never the compound field

---

### Phase 4: Default Mappings & Migration

**Deliverables**: Default field mappings for common SF↔MJ entity pairs, database migration for entity maps.

#### 4.1 Default Field Mappings

Provide `GetDefaultFieldMappings()` for common SF objects to MJ core entities:

**Account → Companies**:
```
Name → Name (key)
BillingStreet → Address1
BillingCity → City
BillingState → StateOrProvince
BillingPostalCode → PostalCode
BillingCountry → Country
Phone → Phone
Website → WebSite
Industry → Industry
Description → Description
```

**Contact → Contacts**:
```
Email → Email (key)
FirstName → FirstName
LastName → LastName
Phone → Phone
MobilePhone → MobilePhone
Title → Title
Department → Department
MailingStreet → Address1
MailingCity → City
MailingState → StateOrProvince
MailingPostalCode → PostalCode
MailingCountry → Country
```

**Lead → Contacts** (with transform):
```
Email → Email (key)
FirstName → FirstName
LastName → LastName
Phone → Phone
Company → CompanyName (transform: lookup Company entity)
Title → Title
Status → LeadStatus (new field or custom mapping)
```

**User → (reference only, no MJ entity mapping by default)**:
- Used for resolving `OwnerId`, `CreatedById`, `LastModifiedById` relationships
- Pull-only, no write

#### 4.2 GetDefaultConfiguration

```typescript
GetDefaultConfiguration(): DefaultIntegrationConfig {
  return {
    DefaultSchemaName: 'Salesforce',
    DefaultObjects: [
      {
        SourceObjectName: 'Account',
        TargetTableName: 'SalesforceAccount',
        TargetEntityName: 'Salesforce Account',
        SyncEnabled: true,
        FieldMappings: this.GetDefaultFieldMappings('Account', 'Companies')
      },
      {
        SourceObjectName: 'Contact',
        TargetTableName: 'SalesforceContact',
        TargetEntityName: 'Salesforce Contact',
        SyncEnabled: true,
        FieldMappings: this.GetDefaultFieldMappings('Contact', 'Contacts')
      },
      // ... more objects
    ]
  };
}
```

#### 4.3 Database Migration (Optional — for pre-configured setups)

Following the Wicket pattern, create a migration that pre-populates entity maps and field maps for customers who want a quick-start Salesforce setup. This is optional — users can also configure everything through the UI after running discovery.

**File**: `migrations/v5/V{timestamp}__v5.12.x_Integration_Salesforce_EntityMaps.sql`

This creates:
- `CompanyIntegrationEntityMap` records for Account→Companies, Contact→Contacts
- `CompanyIntegrationFieldMap` records for each default field mapping
- Sync direction: Bidirectional
- Conflict resolution: MostRecent
- Delete behavior: SoftDelete

---

### Phase 5: Documentation & Polish

#### 5.1 Connector Documentation

**File**: `packages/Integration/docs/salesforce-connector.md`

Contents:
- Prerequisites (Connected App setup in SF, certificate generation)
- Step-by-step setup guide
- Authentication configuration
- Object discovery walkthrough
- Bidirectional sync configuration
- Custom object/field handling
- Troubleshooting common errors
- Rate limit and governor limit guidance
- Bulk API usage

#### 5.2 Salesforce Connected App Setup Guide

**File**: `packages/Integration/docs/salesforce-connected-app-setup.md`

Step-by-step:
1. Generate RSA key pair (`openssl genrsa` / `openssl req`)
2. Create Connected App in SF Setup
3. Upload X.509 certificate
4. Configure OAuth scopes (`api`, `refresh_token`)
5. Pre-authorize the integration user
6. Extract Consumer Key
7. Configure MJ credential with private key + consumer key + username

---

## File Inventory

### New Files

| File | Description |
|---|---|
| `packages/Integration/connectors/src/SalesforceConnector.ts` | Complete rewrite — real REST API connector |
| `metadata/credential-types/schemas/salesforce-jwt-bearer.schema.json` | Credential type JSON schema |
| `metadata/integrations/.salesforce.json` | Integration + Objects + Fields metadata |
| `packages/Integration/connectors/src/__tests__/SalesforceConnector.test.ts` | Comprehensive unit tests |
| `packages/Integration/docs/salesforce-connector.md` | Usage documentation |
| `packages/Integration/docs/salesforce-connected-app-setup.md` | SF admin setup guide |
| `migrations/v5/V{timestamp}__v5.12.x_Integration_Salesforce_EntityMaps.sql` | Optional quick-start entity maps |

### Modified Files

| File | Change |
|---|---|
| `metadata/credential-types/.credential-types.json` | Add Salesforce JWT Bearer entry |
| `metadata/integrations/.integrations.json` | Update Salesforce record to use new credential type |
| `packages/Integration/connectors/src/index.ts` | Update export (same name, may add types) |
| `packages/Integration/connectors/package.json` | Add `jsonwebtoken` + `@types/jsonwebtoken` if not already present |

### Deleted Files

None — the existing `SalesforceConnector.ts` is overwritten in place.

---

## Dependencies

| Package | Purpose | Already in repo? |
|---|---|---|
| `jsonwebtoken` | JWT signing (RS256) | Yes (used by Wicket) |
| `@types/jsonwebtoken` | TypeScript types | Yes |

**No new dependencies required.** The connector uses native `fetch()` for HTTP (Node 18+ built-in), `jsonwebtoken` for JWT signing, and the existing integration framework for everything else.

---

## Salesforce API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/services/oauth2/token` | POST | Token exchange |
| `/services/data/v61.0/` | GET | API version info / connection test |
| `/services/data/v61.0/sobjects/` | GET | List all objects (discovery) |
| `/services/data/v61.0/sobjects/{name}/describe` | GET | Object field metadata (discovery) |
| `/services/data/v61.0/sobjects/{name}/` | POST | Create record |
| `/services/data/v61.0/sobjects/{name}/{id}` | GET | Get single record |
| `/services/data/v61.0/sobjects/{name}/{id}` | PATCH | Update record |
| `/services/data/v61.0/sobjects/{name}/{id}` | DELETE | Delete record |
| `/services/data/v61.0/query?q={soql}` | GET | SOQL query |
| `/services/data/v61.0/queryAll?q={soql}` | GET | SOQL query including deleted |
| `/services/data/v61.0/query/{locator}` | GET | Query pagination (queryMore) |
| `/services/data/v61.0/search?q={sosl}` | GET | SOSL search |
| `/services/data/v61.0/jobs/query` | POST | Bulk API job creation |
| `/services/data/v61.0/jobs/query/{id}` | GET | Bulk API job status |
| `/services/data/v61.0/jobs/query/{id}/results` | GET | Bulk API results |

---

## Key Design Decisions

### 1. SOQL over REST list endpoints
SF's REST API doesn't have a generic "list records" endpoint with filter params like most REST APIs. SOQL is the primary query mechanism. This means `FetchChanges()` overrides the base class's pagination pattern entirely — it builds SOQL queries, not URL query params.

### 2. No `jsforce` library
The SF REST API is straightforward enough that native `fetch()` + `jsonwebtoken` is sufficient. Adding `jsforce` (~2MB) brings its own connection management, caching, and error handling that conflicts with our framework's approach. Keeping it lean.

### 3. RS256 over HS256
Wicket uses HS256 (symmetric secret). Salesforce requires RS256 (asymmetric key pair) for JWT Bearer flow. This is more secure — the private key never leaves the MJ server, and the public certificate is uploaded to SF. SF doesn't support HS256 for server-to-server flows.

### 4. queryAll for deleted record detection
SF's standard `query` endpoint excludes deleted records. `queryAll` includes them with `IsDeleted=true`. This is more efficient than calling the separate `getDeleted()` endpoint, which only covers a 15-day window.

### 5. Discovery-first for custom objects
Rather than trying to seed metadata for custom objects at install time, the connector discovers them at runtime. This means:
- Zero configuration needed for custom objects
- Schema changes in SF are picked up on next discovery run
- No maintenance burden for keeping metadata in sync
- Users choose which custom objects to sync after discovery

### 6. Override FetchChanges entirely (not using base class pagination)
`BaseRESTIntegrationConnector.FetchChanges()` is designed for standard REST endpoints with URL query param-based pagination. Salesforce uses SOQL + `queryMore` cursor, which is fundamentally different. The connector overrides `FetchChanges()` completely while still using `MakeHTTPRequest()` for the actual HTTP calls.

---

## Testing Strategy

### Unit Tests (Phase 1-2)
- Mock all HTTP calls
- Test JWT generation with known key pairs
- Test SOQL query building edge cases
- Test response parsing for all object types
- Test error code classification and handling
- Test rate limit header parsing
- Test token caching and refresh

### Integration Tests (Manual, Phase 3+)
- Requires a Salesforce Developer Edition org (free)
- Create Connected App with test certificate
- Run discovery against real SF instance
- CRUD operations on test records
- Verify watermark incremental sync
- Test custom object sync
- Verify rate limiting behavior under load

### E2E Sync Tests (with Docker workbench)
- Full sync lifecycle: discover → map → sync → verify
- Bidirectional conflict resolution
- Deleted record handling
- Custom object creation and sync

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SF API versioning breaks | Low | Medium | Pin to v61.0, add version config |
| Governor limits hit during large sync | Medium | High | Proactive throttling, Bulk API fallback |
| Token refresh race condition | Low | Medium | Mutex on token refresh, cache-then-check |
| Polymorphic field resolution complexity | Medium | Low | Phase 3 scope, simple ID storage initially |
| Custom validation rules block writes | High | Medium | Detailed error logging per record, skip-and-continue |
| Connected App setup complexity | High | Low | Step-by-step documentation |

---

## Estimated Scope

| Phase | Files | Complexity | Notes |
|---|---|---|---|
| Phase 1 (Pull) | 5 new, 3 modified | Large | Core connector + auth + discovery + SOQL |
| Phase 2 (Write) | Same files expanded | Medium | CRUD methods + search + conflict resolution |
| Phase 3 (Advanced) | Same files + bulk helper | Medium-Large | Bulk API, relationships, error catalog |
| Phase 4 (Mappings) | 2 new (metadata + migration) | Small | Default mappings + quick-start migration |
| Phase 5 (Docs) | 2 new | Small | Documentation and setup guides |
