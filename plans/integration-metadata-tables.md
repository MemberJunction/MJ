# Integration Metadata Tables — Implementation Plan

## Goal
Replace hardcoded object/field definitions in connectors (like `YM_OBJECTS` / `YM_FIELD_SCHEMAS`) with two new metadata tables: `IntegrationObject` and `IntegrationObjectField`. Then restructure `metadata/integrations/` so each integration has its own JSON file containing the integration record plus all its objects and fields as nested related entities.

## Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Database Migration | ✅ COMPLETE | Combined migration `V202603080719__v5.9.x_...` applied + CodeGen appended |
| Phase 2: CodeGen | ✅ COMPLETE | Entity classes generated: `MJIntegrationObjectEntity`, `MJIntegrationObjectFieldEntity` |
| Phase 3: Metadata Files | ✅ COMPLETE | `metadata/integrations/yourmembership/` with all 58 objects + nested fields |
| Phase 4: BaseRESTIntegrationConnector | ✅ COMPLETE | Created in engine package, refactored to use IntegrationEngineBase cache |
| Phase 5: Engine Updates | ✅ COMPLETE | IntegrationEngineBase caches objects/fields, DAG ordering, engine delegates |

### Key Architectural Decisions
- **DiscoverObjects/DiscoverFields**: Remain on BaseIntegrationConnector as abstract methods (part of the connector contract), but BaseRESTIntegrationConnector's implementations now use IntegrationEngineBase's cached data instead of ad-hoc RunView queries.
- **No per-instance caching in connectors**: BaseRESTIntegrationConnector delegates all metadata lookups to IntegrationEngineBase.Instance, which auto-refreshes on entity changes via BaseEngine.
- **DAG ordering**: `IntegrationEngineBase.GetObjectsInDependencyOrder()` uses Kahn's topological sort based on `RelatedIntegrationObjectID` FK relationships.

---

## Phase 1: Database Migration

**File**: `migrations/v5/V202603080719__v5.9.x_Integration_SchedulingFields_And_Object_Metadata.sql`

### Table 1: `__mj.IntegrationObject`

Describes an external object/endpoint exposed by an integration (e.g., "Members", "Events").

| Column | Type | Nullable | Default | Constraint | Notes |
|--------|------|----------|---------|------------|-------|
| ID | UNIQUEIDENTIFIER | NO | NEWSEQUENTIALID() | PK | |
| IntegrationID | UNIQUEIDENTIFIER | NO | | FK → Integration.ID | Which integration owns this object |
| Name | NVARCHAR(255) | NO | | | Internal/programmatic name (e.g., "Members") |
| DisplayName | NVARCHAR(255) | YES | | | Human-friendly label |
| Description | NVARCHAR(MAX) | YES | | | What this object represents |
| Category | NVARCHAR(100) | YES | | | UI grouping (e.g., "Membership", "Events", "Finance") |
| APIPath | NVARCHAR(500) | NO | | | Endpoint path, may include template vars: `Member/{ProfileID}/Groups` |
| ResponseDataKey | NVARCHAR(255) | YES | | | JSON key to extract array from response envelope (null = root array) |
| DefaultPageSize | INT | NO | 100 | | Records per page |
| SupportsPagination | BIT | NO | 1 | | Whether this endpoint supports pagination |
| PaginationType | NVARCHAR(20) | NO | 'PageNumber' | CHECK IN ('PageNumber','Offset','Cursor','None') | How pagination works |
| SupportsIncrementalSync | BIT | NO | 0 | | Supports watermark-based incremental |
| SupportsWrite | BIT | NO | 0 | | Can push data back |
| DefaultQueryParams | NVARCHAR(MAX) | YES | | | JSON object of default query params (e.g., `{"Active":"true"}`) |
| Configuration | NVARCHAR(MAX) | YES | | | Freeform JSON for connector-specific config |
| Sequence | INT | NO | 0 | | Processing/display order |
| Status | NVARCHAR(25) | NO | 'Active' | CHECK IN ('Active','Deprecated','Disabled') | Mirrors EntityField.Status values |

**Foreign Keys:**
- `FK_IntegrationObject_Integration` → `__mj.Integration(ID)`

**Unique Constraint:**
- `UQ_IntegrationObject_Name` → `(IntegrationID, Name)` — no duplicate object names per integration

### Table 2: `__mj.IntegrationObjectField`

Describes a field on an integration object. Mirrors `EntityField` column patterns for 1:1 type compatibility.

| Column | Type | Nullable | Default | Constraint | Notes |
|--------|------|----------|---------|------------|-------|
| ID | UNIQUEIDENTIFIER | NO | NEWSEQUENTIALID() | PK | |
| IntegrationObjectID | UNIQUEIDENTIFIER | NO | | FK → IntegrationObject.ID | Which object this field belongs to |
| Name | NVARCHAR(255) | NO | | | Field name as returned by API |
| DisplayName | NVARCHAR(255) | YES | | | Human-friendly label |
| Description | NVARCHAR(MAX) | YES | | | What this field represents |
| Category | NVARCHAR(100) | YES | | | UI grouping within the object |
| Type | NVARCHAR(100) | NO | | | Data type — uses same CHECK as EntityField |
| Length | INT | YES | | | Max length for string types |
| Precision | INT | YES | | | Numeric precision |
| Scale | INT | YES | | | Numeric scale |
| AllowsNull | BIT | NO | 1 | | Whether field can be null |
| DefaultValue | NVARCHAR(255) | YES | | | Default value from the source system |
| IsPrimaryKey | BIT | NO | 0 | | Part of this object's primary key |
| IsUniqueKey | BIT | NO | 0 | | Must be unique |
| IsReadOnly | BIT | NO | 0 | | Cannot be written back |
| IsRequired | BIT | NO | 0 | | Required for create/update operations |
| RelatedIntegrationObjectID | UNIQUEIDENTIFIER | YES | | FK → IntegrationObject.ID | FK to another integration object (enables DAG) |
| RelatedIntegrationObjectFieldName | NVARCHAR(255) | YES | | | Which field on the related object this FK points to |
| Sequence | INT | NO | 0 | | Display/processing order |
| Configuration | NVARCHAR(MAX) | YES | | | Freeform JSON for connector-specific config |
| Status | NVARCHAR(25) | NO | 'Active' | CHECK IN ('Active','Deprecated','Disabled') | Mirrors EntityField.Status |

**Foreign Keys:**
- `FK_IntegrationObjectField_Object` → `__mj.IntegrationObject(ID)`
- `FK_IntegrationObjectField_RelatedObject` → `__mj.IntegrationObject(ID)` (self-referencing)

**Unique Constraint:**
- `UQ_IntegrationObjectField_Name` → `(IntegrationObjectID, Name)` — no duplicate field names per object

### Extended Properties (sp_addextendedproperty)

Add descriptions for every column on both tables so CodeGen generates proper documentation.

### What CodeGen Will Auto-Generate (DO NOT include in migration)

- `__mj_CreatedAt` / `__mj_UpdatedAt` columns and triggers
- Foreign key indexes (`IDX_AUTO_MJ_FKEY_*`)
- Views (`vwIntegrationObjects`, `vwIntegrationObjectFields`)
- Stored procedures (`spCreateIntegrationObject`, `spUpdateIntegrationObject`, `spDeleteIntegrationObject`, etc.)
- Entity metadata records in `__mj.Entity`, `__mj.EntityField`
- TypeScript entity subclasses

---

## Phase 2: CodeGen ✅ COMPLETE

After migration is applied:

1. ✅ Run CodeGen to generate entity classes, views, stored procedures
2. ✅ Verified generated `MJIntegrationObjectEntity` and `MJIntegrationObjectFieldEntity` classes
3. ✅ Built affected packages

---

## Phase 3: Metadata Files ✅ COMPLETE

### New Directory Structure

```
metadata/integrations/
├── .mj-sync.json                          # EXISTING - Update for nested entities
├── .integrations.json                     # EXISTING - Keep as-is (or slim down)
├── yourmembership/
│   ├── .mj-sync.json                      # Sync config for IntegrationObject entity
│   ├── .yourmembership-objects.json        # All YM objects with nested fields
│   └── (no additionalSchemaInfo - replaced by the metadata tables)
├── hubspot/
│   ├── .mj-sync.json
│   └── .hubspot-objects.json
├── salesforce/
│   ├── .mj-sync.json
│   └── .salesforce-objects.json
└── additionalSchemaInfo.json              # KEEP for now (backward compat), eventually deprecate
```

### Approach: Integration-level metadata stays in `.integrations.json`

The existing `.integrations.json` with HubSpot, Salesforce, YourMembership, File Feed records remains as-is. The new per-integration subdirectories hold `IntegrationObject` records with nested `IntegrationObjectField` related entities.

### Per-Integration `.mj-sync.json`

Each subdirectory (e.g., `yourmembership/`) gets:

```json
{
  "entity": "MJ: Integration Objects",
  "filePattern": "**/.*.json",
  "defaults": {
    "IntegrationID": "@lookup:MJ: Integrations.Name=YourMembership"
  },
  "pull": {
    "createNewFileIfNotFound": true,
    "newFileName": ".yourmembership-objects.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "mergeStrategy": "merge",
    "backupBeforeUpdate": true,
    "backupDirectory": ".backups",
    "relatedEntities": {
      "MJ: Integration Object Fields": {
        "foreignKey": "IntegrationObjectID",
        "cascade": true
      }
    }
  }
}
```

### YourMembership Objects File (`.yourmembership-objects.json`)

Each object from `YM_OBJECTS` becomes a record with nested `IntegrationObjectField` children. Example for the "Members" object:

```json
[
  {
    "fields": {
      "IntegrationID": "@lookup:MJ: Integrations.Name=YourMembership",
      "Name": "Members",
      "DisplayName": "Members",
      "Description": "YM member records including profile data, membership status, and contact info",
      "Category": "Membership",
      "APIPath": "MemberList",
      "ResponseDataKey": "Members",
      "DefaultPageSize": 200,
      "SupportsPagination": true,
      "PaginationType": "PageNumber",
      "SupportsIncrementalSync": false,
      "SupportsWrite": false,
      "DefaultQueryParams": null,
      "Sequence": 1,
      "Status": "Active"
    },
    "relatedEntities": {
      "MJ: Integration Object Fields": [
        {
          "fields": {
            "Name": "ProfileID",
            "DisplayName": "Profile ID",
            "Type": "nvarchar",
            "Length": 100,
            "IsPrimaryKey": true,
            "IsRequired": true,
            "IsReadOnly": true,
            "AllowsNull": false,
            "Sequence": 1,
            "Status": "Active"
          }
        },
        {
          "fields": {
            "Name": "FirstName",
            "DisplayName": "First Name",
            "Type": "nvarchar",
            "Length": 200,
            "IsPrimaryKey": false,
            "IsRequired": false,
            "IsReadOnly": false,
            "AllowsNull": true,
            "Sequence": 2,
            "Status": "Active"
          }
        }
      ]
    }
  }
]
```

### Converting YM_OBJECTS → Metadata Records

All 61 YM objects get converted. Key mappings:

| YM_OBJECTS property | IntegrationObject column |
|---------------------|--------------------------|
| `name` | `Name` |
| `apiPath` | `APIPath` (replace `{ParentID}` with actual field name from parentObject config) |
| `pkField` (string) | → single `IntegrationObjectField` with `IsPrimaryKey=true` |
| `pkField` (array) | → multiple fields with `IsPrimaryKey=true` |
| `responseDataKey` | `ResponseDataKey` |
| `defaultPageSize` | `DefaultPageSize` |
| `supportsPagination` | `SupportsPagination` |
| `incrementalSync` | `SupportsIncrementalSync` |
| `defaultQueryParams` | `DefaultQueryParams` (JSON stringified) |
| `parentObject.parentObjectKey` | Determines `RelatedIntegrationObjectID` on the FK field |
| `parentObject.parentFKFieldName` | The field that gets `RelatedIntegrationObjectID` set |

### Converting YM_FIELD_SCHEMAS → Nested IntegrationObjectField Records

Each field in `YM_FIELD_SCHEMAS[objectName]` becomes a nested `IntegrationObjectField`:

| YM_FIELD_SCHEMAS property | IntegrationObjectField column |
|---------------------------|-------------------------------|
| `FieldName` | `Name` |
| `Label` | `DisplayName` |
| `Description` | `Description` |
| `DataType` ('string','integer','datetime','decimal','boolean') | `Type` (mapped to SQL types: 'nvarchar','int','datetime','decimal','bit') |
| `IsRequired` | `IsRequired` |
| `IsUniqueKey` | `IsUniqueKey` |
| `IsReadOnly` | `IsReadOnly` |
| `IsForeignKey` | Sets `RelatedIntegrationObjectID` via `@lookup` |
| `ForeignKeyTarget` (e.g., "Members.ProfileID") | Parsed → `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` |

### Template Variable Resolution in APIPath

Current YM `{ParentID}` values get replaced with the actual FK field name:

| Object | Current APIPath | New APIPath | FK Field |
|--------|----------------|-------------|----------|
| EventRegistrations | `Event/{ParentID}/EventRegistrants` | `Event/{EventId}/EventRegistrants` | `EventId` → Events |
| EventSessions | `Event/{ParentID}/Sessions` | `Event/{EventId}/Sessions` | `EventId` → Events |
| MemberGroups | `Member/{ParentID}/Groups` | `Member/{ProfileID}/Groups` | `ProfileID` → Members (via WebSiteMemberID FK) |
| Connections | `Member/{ParentID}/Connections` | `Member/{ProfileID}/Connections` | `ProfileID` → Members |
| Locations | `Locations/{ParentID}` | `Locations/{countryId}` | `countryId` → Countries |
| MembershipModifiers | `MembershipModifiers/{ParentID}` | `MembershipModifiers/{Id}` | `Id` → Memberships |

The template variable name matches the PK field of the parent object. The engine resolves it at runtime by:
1. Scanning APIPath for `{VariableName}` patterns
2. Finding the IntegrationObjectField whose name matches (or whose RelatedIntegrationObject's PK matches)
3. Loading parent IDs from local DB (RunView) or API fallback
4. Substituting into the URL for each parent record

### Category Assignments for YM Objects

| Category | Objects |
|----------|---------|
| Membership | Members, MemberTypes, Memberships, MembershipModifiers, MembershipPromoCodes, MembersProfiles, PeopleIDs, MemberSubAccounts |
| Events | Events, EventRegistrations, EventSessions, EventTickets, EventAttendeeTypes, EventSessionGroups, EventCEUAwards, EventCategories, EventRegistrationForms, EventIDs |
| Finance | InvoiceItems, DuesTransactions, DonationTransactions, DonationFunds, DonationHistory, DuesRules, StoreOrders, StoreOrderDetails, FinanceBatches, FinanceBatchDetails, GLCodes |
| Groups | Groups, GroupTypes, MemberGroups, MembersGroupsBulk, GroupMembershipLogs |
| Certifications | Certifications, CertificationsJournals, CertificationCreditTypes |
| Products | Products, ProductCategories |
| Engagement | Connections, EngagementScores, MemberNetworks, MemberFavorites, MemberReferrals |
| Marketing | Campaigns, AllCampaigns, CampaignEmailLists, Announcements, SponsorRotators, EmailSuppressionList |
| Careers | CareerOpenings |
| Reference | Countries, Locations, ShippingMethods, PaymentProcessors, CustomTaxLocations, QBClasses, TimeZones |

---

## Phase 4: BaseRESTIntegrationConnector ✅ COMPLETE

**File**: `packages/Integration/engine/src/BaseRESTIntegrationConnector.ts`

### Class Hierarchy

```
BaseIntegrationConnector (existing abstract)
  └─ BaseRESTIntegrationConnector (NEW abstract - handles REST patterns generically)
       ├─ YourMembershipConnector (auth + response normalization only)
       ├─ SalesforceConnector (future)
       └─ HubSpotConnector (future)
```

### BaseRESTIntegrationConnector Responsibilities

This class reads from IntegrationObject/IntegrationObjectField metadata tables and implements the core REST sync patterns generically:

#### Concrete Implementations (from BaseIntegrationConnector interface):

1. **`DiscoverObjects()`** — Queries `IntegrationObject` table filtered by IntegrationID
2. **`DiscoverFields()`** — Queries `IntegrationObjectField` table filtered by IntegrationObjectID
3. **`IntrospectSchema()`** — Builds SourceSchemaInfo from the two metadata tables
4. **`FetchChanges(ctx)`** — The big one:
   - Looks up the IntegrationObject by `ctx.ObjectName`
   - Detects template variables in `APIPath`
   - If template vars exist → per-parent iteration mode:
     - Identifies parent object from FK field's `RelatedIntegrationObjectID`
     - Loads parent IDs via local DB (`RunView`) first, API fallback
     - Iterates parent records, substituting template vars into URL
     - Fetches + paginates per parent
   - If no template vars → flat mode:
     - Single fetch endpoint with pagination loop
   - Handles pagination based on `PaginationType` (PageNumber, Offset, Cursor, None)
   - Applies `DefaultQueryParams` to each request
   - Extracts response array using `ResponseDataKey`

#### Abstract Methods (concrete connectors must implement):

```typescript
/** Authenticate and return auth context (token, session, API key, etc.) */
protected abstract Authenticate(
    companyIntegration: CompanyIntegrationEntity
): Promise<AuthContext>;

/** Build per-request headers (auth headers, content-type, etc.) */
protected abstract BuildHeaders(
    auth: AuthContext
): Record<string, string>;

/** Make an HTTP request to the integration API */
protected abstract MakeHTTPRequest(
    auth: AuthContext,
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown
): Promise<HTTPResponse>;

/** Extract the data array from the vendor-specific response envelope */
protected abstract NormalizeResponse(
    rawResponse: unknown,
    responseDataKey: string | null
): Record<string, unknown>[];

/** Extract pagination info from vendor-specific response */
protected abstract ExtractPaginationInfo(
    rawResponse: unknown,
    paginationType: string
): PaginationInfo;
```

#### Helper Types:

```typescript
interface AuthContext {
    Token?: string;
    SessionID?: string;
    ExpiresAt?: Date;
    [key: string]: unknown;  // vendor-specific extras
}

interface HTTPResponse {
    Status: number;
    Body: unknown;
    Headers: Record<string, string>;
}

interface PaginationInfo {
    HasMore: boolean;
    NextCursor?: string;
    NextOffset?: number;
    NextPage?: number;
    TotalRecords?: number;
}
```

### YourMembershipConnector Changes

After BaseRESTIntegrationConnector exists, YourMembershipConnector shrinks to ~100-150 lines:

1. **Remove**: `YM_OBJECTS` array (~700 lines), `YM_FIELD_SCHEMAS` object (~500 lines)
2. **Keep**: Session auth logic (`Authenticate`, `BuildHeaders`)
3. **Keep**: Response normalization (`NormalizeResponse` — YM wraps arrays in various envelope keys)
4. **Keep**: Pagination extraction (`ExtractPaginationInfo` — YM uses `NextPageUrl` or count-based)
5. **Keep**: `MakeHTTPRequest` — YM's session-based fetch with timeout/retry

---

## Phase 5: IntegrationEngine Updates ✅ COMPLETE

### What was implemented:

1. **IntegrationEngineBase** (`packages/Integration/engine-base/src/IntegrationEngineBase.ts`):
   - Added `_integrationObjects` and `_integrationObjectFields` cached arrays loaded via `Config()`
   - Public accessors: `IntegrationObjects`, `IntegrationObjectFields`
   - Lookup methods: `GetIntegrationObjectsByIntegrationID`, `GetIntegrationObject`, `GetIntegrationObjectByID`, `GetIntegrationObjectFields`, `GetActiveIntegrationObjects`
   - DAG ordering: `GetObjectsInDependencyOrder()` with Kahn's topological sort

2. **IntegrationEngine** (`packages/Integration/engine/src/IntegrationEngine.ts`):
   - All new IntegrationEngineBase methods delegated via composition

### Original plan (kept for reference):

The `IntegrationEngine.ProcessSingleEntityMap` method needs minor updates:

1. **Object Lookup**: When processing an entity map, look up the `IntegrationObject` by `entityMap.ExternalObjectName` + `companyIntegration.IntegrationID` to get metadata for the fetch
2. **Pass Metadata to FetchContext**: Extend `FetchContext` with optional `IntegrationObject` and `IntegrationObjectField[]` so the connector can use them without re-querying
3. **DAG Ordering**: Before processing entity maps, build a dependency graph from `IntegrationObjectField.RelatedIntegrationObjectID` and sort maps in topological order

### FetchContext Extension

```typescript
export interface FetchContext {
    // ... existing fields ...

    /** Integration object metadata (if available) */
    IntegrationObject?: IntegrationObjectEntity;

    /** Integration object field metadata (if available) */
    IntegrationObjectFields?: IntegrationObjectFieldEntity[];
}
```

This is backward-compatible — connectors that don't use the metadata tables simply ignore these fields.

---

## Implementation Order

### Step 1: Migration (Phase 1) ✅ DONE
### Step 2: CodeGen (Phase 2) ✅ DONE
### Step 3: Metadata Files (Phase 3) ✅ DONE
### Step 4: BaseRESTIntegrationConnector (Phase 4) ✅ DONE
### Step 5: Engine Updates (Phase 5) ✅ DONE

### Step 6: Refactor YourMembershipConnector (NEXT)
- Change base class from `BaseIntegrationConnector` to `BaseRESTIntegrationConnector`
- Remove `YM_OBJECTS` and `YM_FIELD_SCHEMAS` constants (~1300 lines)
- Implement the 5 abstract methods (Authenticate, BuildHeaders, MakeHTTPRequest, NormalizeResponse, ExtractPaginationInfo)
- Keep session management logic
- Write/update unit tests

### Step 7: End-to-End Test
- Push metadata via `mj sync push`
- Run sync against YM API using metadata-driven connector
- Verify all 58 objects fetch correctly
- Compare results with current hardcoded approach

---

## Entity Names (Post-CodeGen)

Based on MJ naming conventions, the new entities will likely be registered as:

- `MJ: Integration Objects` → `IntegrationObjectEntity`
- `MJ: Integration Object Fields` → `IntegrationObjectFieldEntity`

These names are used in metadata files for `@lookup:` references and `relatedEntities` keys.

---

## Risk Considerations

1. **Backward Compatibility**: The `BaseRESTIntegrationConnector` is opt-in. Existing connectors that extend `BaseIntegrationConnector` directly continue to work unchanged.

2. **HubSpot/Salesforce**: Their connectors will continue using `BaseIntegrationConnector` until their metadata is populated. No breaking changes.

3. **FetchContext Extension**: Adding optional fields to `FetchContext` is non-breaking.

4. **Migration Rollback**: Both tables are new — can be dropped cleanly if needed.

5. **Template Variables**: The `{FieldName}` pattern in APIPath doesn't conflict with any existing URL patterns since real API paths don't use curly braces.
