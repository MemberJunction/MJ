# Auto-Generated Integration Actions Plan

## Executive Summary

MemberJunction has two parallel systems for talking to external APIs: the **Integration Engine** (bulk data sync with connectors, field mapping, watermarks) and **BizApps Actions** (164 hand-written single-record HTTP wrappers). These two systems share no code despite doing fundamentally the same thing — authenticated communication with external SaaS APIs.

This plan unifies them. We extend integration connectors with single-record CRUD methods, then **auto-generate Action metadata** from connector capabilities so that agents, workflows, and end users get a massive library of strongly-typed actions with zero hand-written code per action.

### Key Outcomes
- **One connector = dozens of actions** — write the connector once, get Get/Create/Update/Delete/Search/List actions for every object automatically
- **Strongly-typed ActionParams** — agents see `FirstName`, `LastName`, `Email` as individual params, not a generic `Fields` blob
- **No new Action Type** — reuse existing `Type='Custom'` with a single shared `DriverClass` and a new `Config` JSON field for routing
- **Seamless migration** — existing action IDs, names, and agent mappings preserved; just swap `DriverClass` and populate `Config`
- **Credential unification** — all integrations use `CompanyIntegration` → `Credential` entity; no more `.env` variable fallbacks

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Changes](#2-database-changes)
3. [Connector CRUD Methods](#3-connector-crud-methods)
4. [IntegrationActionExecutor](#4-integrationactionexecutor)
5. [Action Metadata Generation Utility](#5-action-metadata-generation-utility)
6. [Schema Drift & Auto-Sync](#6-schema-drift--auto-sync)
7. [Existing Action Classification](#7-existing-action-classification)
8. [Action Taxonomy Recommendations](#8-action-taxonomy-recommendations)
9. [Migration Strategy](#9-migration-strategy)
10. [Implementation Phases](#10-implementation-phases)
11. [Open Questions & Future Work](#11-open-questions--future-work)

---

## 1. Architecture Overview

```
                    ┌──────────────────────────────────┐
                    │      AI Agents / Izzy / UIs       │
                    │   (discover & invoke actions)      │
                    └───────────────┬──────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │         Action Layer              │
                    │  "HubSpot - Get Contact"          │
                    │  "QuickBooks - Create Invoice"     │
                    │  "LearnWorlds - Enroll User"       │
                    │                                    │
                    │  Type='Custom'                     │
                    │  DriverClass='IntegrationAction    │
                    │    Executor'                       │
                    │  Config={"integration":"HubSpot",  │
                    │    "object":"Contacts",            │
                    │    "verb":"Get"}                   │
                    │                                    │
                    │  ActionParams: strongly typed      │
                    │    per-field params from            │
                    │    IntegrationObjectFields         │
                    └───────────────┬──────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │    IntegrationActionExecutor      │
                    │    (single generic class)          │
                    │                                    │
                    │  1. Read Config JSON               │
                    │  2. Resolve connector via factory  │
                    │  3. Map ActionParams → fields      │
                    │  4. Dispatch to CRUD method        │
                    │  5. Map result → output params     │
                    └───────────────┬──────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                      ▼
     ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐
     │   HubSpot    │    │   QuickBooks     │    │  LearnWorlds   │
     │  Connector   │    │   Connector      │    │  Connector     │
     │  (CRUD+Sync) │    │   (CRUD+Sync)    │    │  (CRUD+Sync)   │
     └──────────────┘    └──────────────────┘    └────────────────┘
```

### Design Principles

1. **No new Action Type** — `Type='Custom'`, `DriverClass='IntegrationActionExecutor'` for all auto-generated actions
2. **Config JSON for routing** — new `Config` field on Actions entity carries integration-specific context (integration name, object, verb, etc.)
3. **Strongly typed ActionParams** — each field in the external object becomes an individual ActionParam with proper type, required flag, and description
4. **Connector-first** — connectors are the source of truth for what operations are available; actions are derived metadata
5. **Build-time generation** — a CLI utility produces action metadata records; no runtime generation
6. **Credential entity only** — no `.env` fallbacks; all credentials via `CompanyIntegration` → `Credential`

### Shipping Model: MJ-Shipped vs. Customer-Generated Actions

A critical distinction in how action generation works:

#### What Drives Action Generation?

**IntegrationObjects/Fields** — NOT CompanyIntegrationEntityMap.

- **IntegrationObjects/Fields** = "What does HubSpot's API offer?" — the full breadth of objects and fields a connector can work with. This is static metadata that ships with MJ.
- **CompanyIntegrationEntityMap** = "What has this customer chosen to sync into MJ tables?" — a per-deployment configuration decision.

Actions represent **capability** ("what CAN you do with HubSpot?"), not sync scope ("what ARE you syncing?"). An agent should be able to invoke "HubSpot - Get Deal" even if the customer hasn't configured Deal syncing into MJ. This is especially important for the Izzy use case: temporary fetch for agent context, no data replication.

Therefore, **the generation utility reads IntegrationObjects/Fields to determine which actions to create**. The CompanyIntegrationEntityMap has zero influence on action generation.

#### MJ-Shipped Actions (Standard Library)

Actions generated from connectors that ship with MJ are **built at MJ release time** and included in the release as metadata-sync files. Customers receive them when they install or upgrade MJ.

- Generated during MJ's CI/CD build pipeline
- Shipped as static metadata alongside the connector code
- Updated only when MJ ships a new version with connector changes (new objects, new fields, new connectors)
- Customers do NOT run the generation utility for these — they're pre-built

This means a customer's action library evolves at the pace of MJ releases. When MJ v5.12 ships with a new "Mailchimp" connector, that release includes all the auto-generated Mailchimp actions.

#### Customer-Generated Actions (Custom Integrations)

Customers who build their own custom connectors (for industry-specific SaaS tools like association management systems, niche ERPs, etc.) run the generation utility themselves:

```bash
# Customer runs this after building their custom connector
npx mj-integration generate-actions --integration MyCustomCRM
```

This produces action metadata for their custom integration, following the same patterns as MJ-shipped actions. Their custom actions live in their deployment's metadata, not in the MJ repo.

#### Summary

| Aspect | MJ-Shipped | Customer-Generated |
|--------|-----------|-------------------|
| Who generates? | MJ build pipeline | Customer dev team |
| When updated? | MJ releases | Customer builds |
| Driven by? | IntegrationObjects/Fields in MJ repo | IntegrationObjects/Fields in customer's metadata |
| Affected by CompanyIntegrationEntityMap? | No | No |
| Where stored? | MJ repo `/metadata/actions/generated/` | Customer's metadata directory |

---

## 2. Database Changes

### Required Migrations Summary

Only **two migrations** are needed (combined into a single migration file):

| Table | Change | Why |
|-------|--------|-----|
| `Action` | Add `Config NVARCHAR(MAX) NULL` | Carries routing JSON (integration name, object, verb) for `IntegrationActionExecutor` |
| `IntegrationObject` | Add `WriteAPIPath NVARCHAR(500) NULL`, `WriteMethod NVARCHAR(10) NULL DEFAULT 'POST'`, `DeleteMethod NVARCHAR(10) NULL DEFAULT 'DELETE'` | Write-specific endpoint configuration when different from read path |

**NOT needed:**
- `IsWritable` on `IntegrationObjectField` — existing `IsReadOnly` column already covers this (invert the logic)

### 2.1 New Column: `Config` on Action Entity

Add a single nullable column to the `Action` table:

```sql
ALTER TABLE ${flyway:defaultSchema}.[Action]
    ADD Config NVARCHAR(MAX) NULL;
```

This is a generic extension point. Any action can store arbitrary JSON configuration here. For integration actions, the schema is:

```typescript
interface IntegrationActionConfig {
    /** Name of the integration (e.g., "HubSpot", "QuickBooks") */
    integrationName: string;

    /** Name of the integration object (e.g., "Contacts", "Deals") */
    objectName: string;

    /** CRUD verb: Get, Create, Update, Delete, Search, List */
    verb: 'Get' | 'Create' | 'Update' | 'Delete' | 'Search' | 'List';

    /** Optional: API version override */
    apiVersion?: string;

    /** Optional: object-specific config the connector may need */
    connectorConfig?: Record<string, unknown>;
}
```

Non-integration actions ignore this field (it stays `NULL`). The field is generic enough that future action patterns can use it for their own purposes.

### 2.2 IntegrationObjectField — No Migration Needed

The `IntegrationObjectField` entity already has `IsReadOnly BIT DEFAULT 0`. Rather than adding a redundant `IsReadOnly` column, we invert the existing flag: fields where `IsReadOnly = 0` are writable (become Input params on Create/Update actions), and fields where `IsReadOnly = 1` are read-only (become Output-only params). No migration required.

### 2.3 IntegrationObject Write Support

The `IntegrationObject` entity already has `SupportsWrite: boolean`. We'll start using it:

```sql
-- Also add optional write-specific endpoint configuration
ALTER TABLE ${flyway:defaultSchema}.[IntegrationObject]
    ADD WriteAPIPath NVARCHAR(500) NULL,
        WriteMethod NVARCHAR(10) NULL DEFAULT 'POST',
        DeleteMethod NVARCHAR(10) NULL DEFAULT 'DELETE';
    -- WriteAPIPath: if different from read APIPath (e.g., POST /contacts vs GET /contacts/{id})
    -- WriteMethod: HTTP method for create operations
    -- DeleteMethod: HTTP method for delete operations
```

---

## 3. Connector CRUD Methods

### 3.1 New Methods on BaseIntegrationConnector

Add optional CRUD methods to the base class. Connectors override them to indicate support:

```typescript
// New types
export interface CRUDContext {
    CompanyIntegration: CompanyIntegrationEntity;
    ContextUser: UserInfo;
}

export interface IntegrationRecord {
    ExternalID: string;
    ObjectName: string;
    Fields: Record<string, unknown>;
    Metadata?: {
        CreatedAt?: Date;
        UpdatedAt?: Date;
        ExternalURL?: string;  // link to record in source system UI
    };
}

export interface ListOptions {
    MaxRecords?: number;
    Cursor?: string;
    Filter?: string;
    OrderBy?: string;
}

export interface ListResult {
    Records: IntegrationRecord[];
    HasMore: boolean;
    Cursor?: string;
    TotalCount?: number;
}

// New optional methods on BaseIntegrationConnector
export abstract class BaseIntegrationConnector {
    // --- Existing methods (unchanged) ---
    abstract TestConnection(...): Promise<ConnectionTestResult>;
    abstract DiscoverObjects(...): Promise<ExternalObjectSchema[]>;
    abstract DiscoverFields(...): Promise<ExternalFieldSchema[]>;
    abstract FetchChanges(...): Promise<FetchBatchResult>;

    // --- NEW: Single-record CRUD (optional, override to support) ---

    /** Check if this connector supports single-record CRUD for the given object */
    SupportsCRUD(objectName: string): boolean { return false; }

    /** Retrieve a single record by its external ID */
    async GetRecord(objectName: string, recordId: string, ctx: CRUDContext): Promise<IntegrationRecord | null> {
        throw new Error(`GetRecord not implemented for ${this.constructor.name}`);
    }

    /** Create a new record, returns the created record with ExternalID */
    async CreateRecord(objectName: string, fields: Record<string, unknown>, ctx: CRUDContext): Promise<IntegrationRecord> {
        throw new Error(`CreateRecord not implemented for ${this.constructor.name}`);
    }

    /** Update an existing record by its external ID */
    async UpdateRecord(objectName: string, recordId: string, fields: Record<string, unknown>, ctx: CRUDContext): Promise<IntegrationRecord> {
        throw new Error(`UpdateRecord not implemented for ${this.constructor.name}`);
    }

    /** Delete a record by its external ID */
    async DeleteRecord(objectName: string, recordId: string, ctx: CRUDContext): Promise<boolean> {
        throw new Error(`DeleteRecord not implemented for ${this.constructor.name}`);
    }

    /** Search records by query string or filter expression */
    async SearchRecords(objectName: string, query: string, ctx: CRUDContext, options?: ListOptions): Promise<ListResult> {
        throw new Error(`SearchRecords not implemented for ${this.constructor.name}`);
    }

    /** List records with pagination */
    async ListRecords(objectName: string, ctx: CRUDContext, options?: ListOptions): Promise<ListResult> {
        throw new Error(`ListRecords not implemented for ${this.constructor.name}`);
    }

    /** Declare which verbs are supported for a given object */
    GetSupportedVerbs(objectName: string): ('Get' | 'Create' | 'Update' | 'Delete' | 'Search' | 'List')[] {
        return [];
    }
}
```

### 3.2 Default CRUD Implementations on BaseRESTIntegrationConnector

The REST base class can provide generic implementations using existing metadata:

```typescript
export abstract class BaseRESTIntegrationConnector extends BaseIntegrationConnector {

    override SupportsCRUD(objectName: string): boolean {
        const obj = this.GetIntegrationObject(objectName);
        return obj != null && obj.Status === 'Active';
    }

    override GetSupportedVerbs(objectName: string): string[] {
        const obj = this.GetIntegrationObject(objectName);
        if (!obj) return [];

        const verbs: string[] = ['Get', 'List'];
        if (obj.SupportsWrite) {
            verbs.push('Create', 'Update', 'Delete');
        }
        if (obj.SupportsPagination) {
            verbs.push('Search');
        }
        return verbs;
    }

    override async GetRecord(objectName: string, recordId: string, ctx: CRUDContext): Promise<IntegrationRecord | null> {
        const obj = this.GetIntegrationObject(objectName);
        const auth = await this.Authenticate(ctx.CompanyIntegration);
        const url = `${this.GetBaseURL(ctx.CompanyIntegration)}/${obj.APIPath}/${recordId}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        if (response.Status === 404) return null;

        const normalized = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        if (normalized.length === 0) return null;

        return {
            ExternalID: recordId,
            ObjectName: objectName,
            Fields: normalized[0]
        };
    }

    override async CreateRecord(objectName: string, fields: Record<string, unknown>, ctx: CRUDContext): Promise<IntegrationRecord> {
        const obj = this.GetIntegrationObject(objectName);
        const auth = await this.Authenticate(ctx.CompanyIntegration);
        const writePath = obj.WriteAPIPath || obj.APIPath;
        const url = `${this.GetBaseURL(ctx.CompanyIntegration)}/${writePath}`;
        const headers = this.BuildHeaders(auth);
        const body = this.BuildWritePayload(objectName, fields);
        const method = obj.WriteMethod || 'POST';

        const response = await this.MakeHTTPRequest(auth, url, method, headers, body);
        const result = this.ExtractWriteResponse(objectName, response.Body);

        return {
            ExternalID: result.ExternalID,
            ObjectName: objectName,
            Fields: { ...fields, ...result.AdditionalFields }
        };
    }

    // Connectors override these for provider-specific payload formats
    protected BuildWritePayload(objectName: string, fields: Record<string, unknown>): unknown {
        return fields; // default: pass fields directly as JSON body
    }

    protected ExtractWriteResponse(objectName: string, responseBody: unknown): { ExternalID: string; AdditionalFields?: Record<string, unknown> } {
        // Default: look for common ID field patterns
        const body = responseBody as Record<string, unknown>;
        return {
            ExternalID: (body.id || body.Id || body.ID || '') as string,
            AdditionalFields: body as Record<string, unknown>
        };
    }

    // ... similar patterns for UpdateRecord, DeleteRecord, SearchRecords, ListRecords
}
```

Provider-specific connectors (HubSpot, QuickBooks, etc.) only need to override `BuildWritePayload` and `ExtractWriteResponse` when the API has non-standard patterns. For example, HubSpot wraps fields in a `properties` envelope:

```typescript
// HubSpotConnector overrides
protected override BuildWritePayload(objectName: string, fields: Record<string, unknown>): unknown {
    return { properties: fields }; // HubSpot wraps in { properties: {...} }
}

protected override ExtractWriteResponse(objectName: string, responseBody: unknown): { ExternalID: string; AdditionalFields?: Record<string, unknown> } {
    const body = responseBody as { id: string; properties: Record<string, unknown> };
    return { ExternalID: body.id, AdditionalFields: body.properties };
}
```

---

## 4. IntegrationActionExecutor

A single action class that handles ALL auto-generated integration actions:

```typescript
@RegisterClass(BaseAction, 'IntegrationActionExecutor')
export class IntegrationActionExecutor extends BaseAction {

    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // 1. Parse Config from the action metadata
        const config = JSON.parse(params.Action.Config_ || '{}') as IntegrationActionConfig;
        if (!config.integrationName || !config.objectName || !config.verb) {
            return { Success: false, ResultCode: 'INVALID_CONFIG', Message: 'Action Config missing required fields' };
        }

        // 2. Get CompanyIntegrationID from params (required for all integration actions)
        const companyIntegrationId = this.GetParamValue(params.Params, 'CompanyIntegrationID');
        if (!companyIntegrationId) {
            return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'CompanyIntegrationID is required' };
        }

        // 3. Load CompanyIntegration + resolve connector
        const companyIntegration = await this.LoadCompanyIntegration(companyIntegrationId, params.ContextUser);
        const connector = ConnectorFactory.Resolve(companyIntegration.Integration);

        // 4. Build CRUDContext
        const ctx: CRUDContext = { CompanyIntegration: companyIntegration, ContextUser: params.ContextUser };

        // 5. Dispatch based on verb
        switch (config.verb) {
            case 'Get':
                return await this.ExecuteGet(connector, config, params, ctx);
            case 'Create':
                return await this.ExecuteCreate(connector, config, params, ctx);
            case 'Update':
                return await this.ExecuteUpdate(connector, config, params, ctx);
            case 'Delete':
                return await this.ExecuteDelete(connector, config, params, ctx);
            case 'Search':
                return await this.ExecuteSearch(connector, config, params, ctx);
            case 'List':
                return await this.ExecuteList(connector, config, params, ctx);
            default:
                return { Success: false, ResultCode: 'UNKNOWN_VERB', Message: `Unknown verb: ${config.verb}` };
        }
    }

    private async ExecuteGet(connector: BaseIntegrationConnector, config: IntegrationActionConfig, params: RunActionParams, ctx: CRUDContext): Promise<ActionResultSimple> {
        const recordId = this.GetParamValue(params.Params, 'RecordID');
        if (!recordId) {
            return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'RecordID is required for Get' };
        }

        const record = await connector.GetRecord(config.objectName, recordId, ctx);
        if (!record) {
            return { Success: false, ResultCode: 'NOT_FOUND', Message: `Record ${recordId} not found` };
        }

        // Map integration record fields back to output params
        this.PopulateOutputParams(params.Params, record.Fields);
        this.SetParamValue(params.Params, 'Result', JSON.stringify(record));

        return { Success: true, ResultCode: 'SUCCESS', Params: params.Params };
    }

    private async ExecuteCreate(connector: BaseIntegrationConnector, config: IntegrationActionConfig, params: RunActionParams, ctx: CRUDContext): Promise<ActionResultSimple> {
        // Collect all Input params (except system params) into a fields object
        const fields = this.CollectFieldParams(params.Params);

        const record = await connector.CreateRecord(config.objectName, fields, ctx);

        this.PopulateOutputParams(params.Params, record.Fields);
        this.SetParamValue(params.Params, 'CreatedRecordID', record.ExternalID);
        this.SetParamValue(params.Params, 'Result', JSON.stringify(record));

        return { Success: true, ResultCode: 'SUCCESS', Params: params.Params };
    }

    // ... ExecuteUpdate, ExecuteDelete, ExecuteSearch, ExecuteList follow same pattern

    /**
     * Collect all non-system Input params into a fields dictionary.
     * System params: CompanyIntegrationID, RecordID, SearchQuery, MaxRecords, Cursor
     */
    private CollectFieldParams(params: ActionParam[]): Record<string, unknown> {
        const systemParams = new Set(['CompanyIntegrationID', 'RecordID', 'SearchQuery', 'MaxRecords', 'Cursor', 'Result', 'CreatedRecordID']);
        const fields: Record<string, unknown> = {};
        for (const p of params) {
            if (p.Type === 'Input' && p.Value != null && !systemParams.has(p.Name)) {
                fields[p.Name] = p.Value;
            }
        }
        return fields;
    }

    /** Map record fields back to output ActionParams */
    private PopulateOutputParams(params: ActionParam[], fields: Record<string, unknown>): void {
        for (const p of params) {
            if ((p.Type === 'Output' || p.Type === 'Both') && p.Name in fields) {
                p.Value = fields[p.Name];
            }
        }
    }
}
```

### Key Design Points

- **One class, all verbs** — the `Config` JSON determines which integration, object, and verb to execute
- **System params vs. field params** — a small set of system params (`CompanyIntegrationID`, `RecordID`, `SearchQuery`, etc.) are handled specially; all other Input params are treated as object fields
- **Output params populated from response** — the connector returns an `IntegrationRecord` with `Fields`; those fields are mapped back to Output ActionParams by name
- **Error handling** — connector exceptions are caught and mapped to ActionResultCodes (`AUTH_FAILED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `NOT_FOUND`, etc.)

---

## 5. Action Metadata Generation Utility

### 5.1 Overview

A CLI utility that reads integration connector metadata and produces Action/ActionParam/ActionResultCode records as metadata-sync JSON files. Run at build time whenever an integration's object/field definitions change.

### 5.2 CLI Interface

```bash
# Generate actions for all integrations
npx mj-integration generate-actions

# Generate for a specific integration
npx mj-integration generate-actions --integration HubSpot

# Preview what would be generated (dry run)
npx mj-integration generate-actions --dry-run

# Regenerate after connector changes (respects existing Action IDs)
npx mj-integration generate-actions --update

# Output to specific directory
npx mj-integration generate-actions --output ./metadata/actions/generated/
```

### 5.3 Generation Logic

For each Integration:
```
  For each IntegrationObject where Status='Active':
    verbs = connector.GetSupportedVerbs(objectName)
    For each verb in verbs:
      1. Generate Action record:
         - Name: "{Integration} - {Verb} {Object}"  (e.g., "HubSpot - Get Contact")
         - Type: 'Custom'
         - DriverClass: 'IntegrationActionExecutor'
         - Config: JSON with integrationName, objectName, verb
         - Category: "Integrations > {Integration}"
         - Status: 'Active'
         - Description: auto-generated (e.g., "Retrieve a single Contact record from HubSpot by its record ID")
         - Icon: verb-appropriate Font Awesome icon

      2. Generate system ActionParams:
         - CompanyIntegrationID (Input, required, all verbs)
         - RecordID (Input, required for Get/Update/Delete)
         - SearchQuery (Input, required for Search)
         - MaxRecords (Input, optional for List/Search)
         - Cursor (Input, optional for List/Search)
         - Result (Output, all verbs — full JSON response)
         - CreatedRecordID (Output, Create verb)

      3. Generate field-level ActionParams (from IntegrationObjectFields):
         For each field where Status='Active':
           - Name: field.DisplayName or field.Name
           - Type:
             - Get verb: 'Output' (read fields are outputs)
             - Create verb: 'Input' if NOT IsReadOnly, skip if IsReadOnly
             - Update verb: 'Input' if NOT IsReadOnly, skip if IsReadOnly
             - Delete verb: skip (no field params)
             - Search verb: skip (uses SearchQuery string)
             - List verb: 'Output' (list returns field values)
           - ValueType: mapped from field.Type (nvarchar→Scalar, int→Scalar, etc.)
           - IsRequired: field.IsRequired AND verb is Create
           - Description: field.DisplayName or auto-generated

      4. Generate filtered list variants:
         Where the integration object has known parent/filter relationships
         (e.g., Deals → Company, Deals → Contact, Tasks → date range),
         generate ADDITIONAL specific actions with strongly-typed filter params:
           - "HubSpot - Get Deals by Company" with CompanyID (Input, required)
           - "HubSpot - Get Deals by Contact" with ContactID (Input, required)
           - "HubSpot - Get Upcoming Tasks" with StartDate/EndDate params
         These are more discoverable than a generic List + filter string.
         Vector search on action names/descriptions makes the explosion manageable.

      5. Generate ActionResultCodes:
         - SUCCESS
         - NOT_FOUND (Get, Update, Delete)
         - VALIDATION_ERROR (Create, Update)
         - AUTH_FAILED (all)
         - RATE_LIMITED (all)
         - MISSING_PARAMETER (all)
         - UNEXPECTED_ERROR (all)
```

### 5.4 Output Format

The utility produces metadata-sync JSON files, one per integration:

```
metadata/actions/generated/
├── .hubspot-integration-actions.json      (auto-generated, ~78 actions)
├── .quickbooks-integration-actions.json   (auto-generated, ~24 actions)
├── .learnworlds-integration-actions.json  (auto-generated, ~36 actions)
├── .your-membership-integration-actions.json (auto-generated, ~180 actions)
└── ...
```

Each file follows the existing metadata-sync format with `@lookup` references for categories, result codes, etc.

### 5.5 Update Mode (Preserving Existing IDs)

When `--update` is used, the utility:
1. Loads existing actions from the database (or existing JSON files)
2. Matches by integration + object + verb combination
3. For matched actions: updates params/result codes but preserves `Action.ID`, `Action.Name`, and any manual customizations (description, icon, category overrides)
4. For new objects/verbs: creates new action records
5. For removed objects/verbs: marks actions as `Status='Disabled'` (not deleted)

This ensures:
- Agent-Action mappings (`MJ: AI Agent Actions`) are preserved
- Execution logs remain linked to the correct action
- No breaking changes for existing consumers

---

## 6. Schema Drift & Auto-Sync

### The Problem

Integration APIs evolve over time — fields are added, renamed, deprecated, or removed. If we generate ActionParams at build time from IntegrationObjectFields, those params can go stale.

### Recommended Approach: Sync-On-Update

**When an integration's metadata is updated (via `DiscoverFields()` or manual edit), automatically regenerate the corresponding actions.**

#### Implementation

```
IntegrationObject/Field Updated
    │
    ▼
Trigger: IntegrationObjectField entity save hook (server-side)
    │
    ▼
Queue action regeneration for the affected Integration
    │
    ▼
ActionSyncService.SyncActionsForIntegration(integrationId)
    │
    ├─ Load current IntegrationObjects + Fields
    ├─ Load existing auto-generated Actions (where Config contains this integration)
    ├─ Diff: new fields → add ActionParams
    │         removed fields → mark ActionParams inactive (or remove)
    │         changed types → update ActionParam metadata
    │         new objects → create new Actions
    │         removed objects → disable Actions
    └─ Save changes
```

#### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Sync-on-update** (recommended) | Always current; triggered by actual changes; no scheduled overhead | Requires entity save hook; slightly complex | **Best balance of freshness and simplicity** |
| **Scheduled re-sync** (e.g., nightly) | Simple timer; no hooks needed | Stale for up to 24h; unnecessary DB churn when nothing changed | Too lazy for production |
| **On-demand only** (manual CLI run) | Full control; no automation risk | Human must remember to run it; drift accumulates silently | Good for initial development, not long-term |
| **Runtime lazy-sync** (check on action invoke) | Always fresh at invoke time | Adds latency to every action call; complex caching | Over-engineered |

#### Sync-on-update Details

1. **Entity Save Hook**: Add a server-side `AfterSave` hook on `IntegrationObject` and `IntegrationObjectField` entities. When a record is created, updated, or deleted, enqueue a sync job.

2. **Debouncing**: Batch updates within a 5-second window. If multiple fields are updated in quick succession (common during `DiscoverFields()`), only run the sync once after the batch settles.

3. **Diff Algorithm**:
   - **New field added** → Add corresponding ActionParam to all relevant actions (Create/Update get Input params, Get/List get Output params)
   - **Field removed** → Remove the ActionParam from all relevant actions (or mark inactive)
   - **Field type changed** → Update the ActionParam's `ValueType` and `Description`
   - **Field IsReadOnly changed** → Toggle whether it appears as Input on Create/Update actions (IsReadOnly=1 means Output-only)
   - **New object added** → Generate full set of CRUD actions for the new object
   - **Object removed/disabled** → Set corresponding actions to `Status='Disabled'`

4. **Safety**: Never delete Action records — only disable them. This preserves execution history and allows re-enabling if the object reappears.

5. **Audit**: Log all sync operations with before/after state for troubleshooting.

---

## 7. Existing Action Classification

### 7.1 Actions to Convert to Integration Connectors

These are CRUD operations on well-defined business data objects in SaaS systems with databases. They should become integration connectors, and their actions should be auto-generated.

#### Accounting — QuickBooks (4 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| QuickBooks - Create Journal Entry | Create | Journal Entries | Standard CRUD on accounting object |
| QuickBooks - Get Account Balances | List | Account Balances | Read from chart of accounts |
| QuickBooks - Get GL Codes | List | GL Codes | Read from general ledger codes |
| QuickBooks - Get Transactions | List | Transactions | Read from transaction ledger |

#### Accounting — Business Central (4 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| Business Central - Get Customers | List | Customers | Standard CRUD on customer records |
| Business Central - Get GL Accounts | List | GL Accounts | Chart of accounts data |
| Business Central - Get Sales Invoices | List | Sales Invoices | Invoice records |
| Business Central - Get GL Entries | List | GL Entries | Ledger entries |

#### CRM — HubSpot (18 actions → connector already exists)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| HubSpot - Create Contact | Create | Contacts | Standard CRUD |
| HubSpot - Get Contact | Get | Contacts | Standard CRUD |
| HubSpot - Update Contact | Update | Contacts | Standard CRUD |
| HubSpot - Delete Contact | Delete | Contacts | Standard CRUD |
| HubSpot - Search Contacts | Search | Contacts | Standard CRUD |
| HubSpot - Create Company | Create | Companies | Standard CRUD |
| HubSpot - Get Company | Get | Companies | Standard CRUD |
| HubSpot - Update Company | Update | Companies | Standard CRUD |
| HubSpot - Search Companies | Search | Companies | Standard CRUD |
| HubSpot - Create Deal | Create | Deals | Standard CRUD |
| HubSpot - Get Deal | Get | Deals | Standard CRUD |
| HubSpot - Update Deal | Update | Deals | Standard CRUD |
| HubSpot - Search Deals | Search | Deals | Standard CRUD |
| HubSpot - Get Deals by Company | List | Deals | Filtered list (by parent) — keep as separate action with strongly-typed CompanyID param |
| HubSpot - Get Deals by Contact | List | Deals | Filtered list (by parent) — keep as separate action with strongly-typed ContactID param |
| HubSpot - Create Task | Create | Tasks | Standard CRUD |
| HubSpot - Update Task | Update | Tasks | Standard CRUD |
| HubSpot - Get Upcoming Tasks | List | Tasks | Filtered list (by date) — keep as separate action with strongly-typed date params |

#### Form Builders — Typeform (6 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| Typeform - Create Form | Create | Forms | Standard CRUD |
| Typeform - Update Form | Update | Forms | Standard CRUD |
| Typeform - Get Form | Get | Forms | Standard CRUD |
| Typeform - Get Forms | List | Forms | Standard CRUD |
| Typeform - Get Responses | List | Responses | Standard CRUD |
| Typeform - Get Single Response | Get | Responses | Standard CRUD |

#### Form Builders — JotForm (5 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| JotForm - Create Form | Create | Forms | Standard CRUD |
| JotForm - Update Form | Update | Forms | Standard CRUD |
| JotForm - Get Form | Get | Forms | Standard CRUD |
| JotForm - Get Submissions | List | Submissions | Standard CRUD |
| JotForm - Get Single Submission | Get | Submissions | Standard CRUD |

#### Form Builders — SurveyMonkey (5 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| SurveyMonkey - Create Survey | Create | Surveys | Standard CRUD |
| SurveyMonkey - Update Survey | Update | Surveys | Standard CRUD |
| SurveyMonkey - Get Survey | Get | Surveys | Standard CRUD |
| SurveyMonkey - Get Responses | List | Responses | Standard CRUD |
| SurveyMonkey - Get Single Response | Get | Responses | Standard CRUD |

#### Form Builders — Google Forms (2 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| Google Forms - Get Form | Get | Forms | Standard CRUD |
| Google Forms - Get Single Response | Get | Responses | Standard CRUD |

#### LMS — LearnWorlds (10 actions → connector)

| Current Action | Verb | Object | Notes |
|---------------|------|--------|-------|
| LearnWorlds - Create User | Create | Users | Standard CRUD |
| LearnWorlds - Update User | Update | Users | Standard CRUD |
| LearnWorlds - Get User Details | Get | Users | Standard CRUD |
| LearnWorlds - Get Users | List | Users | Standard CRUD |
| LearnWorlds - Enroll User | Create | Enrollments | Standard CRUD (enrollment record) |
| LearnWorlds - Get User Enrollments | List | Enrollments | Standard CRUD |
| LearnWorlds - Get Courses | List | Courses | Standard CRUD |
| LearnWorlds - Get Course Details | Get | Courses | Standard CRUD |
| LearnWorlds - Get Bundles | List | Bundles | Standard CRUD |
| LearnWorlds - Get Certificates | List | Certificates | Standard CRUD |

**Total: 54 actions across 8 providers → converted to integration connectors**

Once these providers have connectors with CRUD methods, the auto-generation utility will produce these same actions (plus additional ones for objects not currently covered by manual actions), and the existing action IDs will be preserved via the update mechanism.

### 7.2 Actions to Keep as Platform-Specific (Not Integration Candidates)

#### HubSpot — Platform-Specific Operations (4 actions, keep as custom)

| Action | Why Skip |
|--------|----------|
| HubSpot - Log Activity | HubSpot-specific "Engagement" abstraction (calls, emails, meetings, notes) — not a standard data object |
| HubSpot - Get Activities by Contact | Retrieves engagement timeline — HubSpot-specific concept |
| HubSpot - Merge Contacts | Data deduplication — platform-specific merge semantics with winner/loser logic |
| HubSpot - Associate Contact to Company | HubSpot-specific relationship/association management — unique API pattern |

#### Social Media — All Providers (65 actions, keep as custom)

| Provider | Actions | Why Skip |
|----------|---------|----------|
| Twitter/X | 8 | Social publishing (tweets, threads, scheduling) — not a database, no persistent business data objects to sync |
| Instagram | 8 | Media publishing (posts, stories, reels) — platform-specific content formats |
| Facebook | 9 | Page management (posts, albums, boosts, insights) — advertising/publishing platform |
| LinkedIn | 8 | Professional publishing (posts, articles) — content and engagement platform |
| TikTok | 7 | Video publishing — entirely platform-specific content format |
| YouTube | 9 | Video hosting (uploads, playlists, metadata) — media platform, not a database |
| Buffer | 8 | Multi-social scheduling — aggregator with queue/scheduling concepts |
| Hootsuite | 8 | Multi-social management — dashboard/scheduling platform |

**Rationale**: Social media platforms are **content publishing and analytics tools**, not databases with replicable business data. Their "objects" (tweets, posts, stories) are platform-specific content artifacts, not business records you'd sync into MJ. These actions are correctly modeled as standalone operations.

#### Form Builders — Platform-Specific Operations (12 actions, keep as custom)

| Action | Why Skip |
|--------|----------|
| Typeform - Get Statistics | Platform-specific analytics aggregation |
| Typeform - Export CSV | Platform-specific export format |
| Typeform - Get File Content | Platform-specific file retrieval |
| Typeform - Watch New Responses | Event-driven webhook pattern, not CRUD |
| JotForm - Get Statistics | Platform-specific analytics |
| JotForm - Export CSV | Platform-specific export |
| JotForm - Watch New Submissions | Event-driven webhook pattern |
| SurveyMonkey - Get Statistics | Platform-specific analytics |
| SurveyMonkey - Export CSV | Platform-specific export |
| SurveyMonkey - Watch New Responses | Event-driven webhook pattern |
| Google Forms - Get Statistics | Platform-specific analytics |
| Google Forms - Export CSV | Platform-specific export |

**Rationale**: Statistics, CSV exports, and webhook watchers are platform-specific features that don't map to CRUD on business objects. Statistics are computed aggregations, exports are bulk format conversions, and watchers are event subscriptions.

#### LMS — Platform-Specific Operations (9 actions, keep as custom)

| Action | Why Skip |
|--------|----------|
| LearnWorlds - Get User Progress | Platform-specific learning progress tracking (completion %, quiz scores) |
| LearnWorlds - Update User Progress | Platform-specific progress mutation |
| LearnWorlds - Get Course Analytics | Platform-specific reporting aggregation |
| LearnWorlds - Get Quiz Results | Platform-specific assessment data |
| LearnWorlds - Onboard Learner | Multi-step workflow (create user + enroll + assign) — not a single CRUD operation |
| LearnWorlds - SSO Login | Authentication flow — not data CRUD |
| LearnWorlds - Attach Tags | Platform-specific tagging system |
| LearnWorlds - Detach Tags | Platform-specific tagging system |
| LearnWorlds - Get Bulk Data | Platform-specific bulk export |

#### Core/Utility Actions (97 actions, not relevant)

All core framework actions (CRUD operations on MJ entities, workflow control, MCP, AI, file storage, visualization, web search, data transformation, user management, demo actions) are **MJ-internal utilities** — they operate on MJ's own data or provide general-purpose capabilities. They have no connection to external integrations and remain as-is.

### 7.3 Summary

| Category | Action Count | Disposition |
|----------|-------------|-------------|
| **Convert to integration connectors** | 54 | Build connectors, auto-generate actions |
| **Keep as platform-specific custom** | 90 | Social media, analytics, exports, webhooks, special operations |
| **Core/utility (unchanged)** | 97 | MJ framework actions, not integration-related |
| **Total** | 241 | |

---

## 8. Action Taxonomy Recommendations

### 8.1 Current State

The existing taxonomy has **inconsistent naming patterns** across integration actions:

| Pattern | Example | Usage |
|---------|---------|-------|
| `{Provider} - {Verb} {Object}` | "HubSpot - Create Contact" | CRM, Accounting, LMS (51 actions) |
| `{Verb} {Object} ({Provider})` | "Create Post (Buffer)" | Social Media (65 actions) |
| `{Provider}{Verb}{Object}Action` | Class name only, no action name pattern | Some internal references |

There are also **two separate category trees** for essentially the same providers:
- "CRM > HubSpot" (for integration-style actions)
- "Social Media > Twitter" (for platform-specific actions)

### 8.2 Recommended Changes

#### Naming Convention: Standardize on `{Provider} - {Verb} {Object}`

All integration actions should use the `{Provider} - {Verb} {Object}` pattern:
- "HubSpot - Get Contact" ✅ (already correct)
- "QuickBooks - Create Journal Entry" ✅ (already correct)
- "Create Post (Buffer)" → **"Buffer - Create Post"** (align with standard)

**Rationale**:
- Consistent alphabetical grouping by provider in lists
- Matches the metadata-sync file naming pattern
- Clear visual hierarchy: provider first, then what it does
- The `(Provider)` suffix pattern breaks sorting and scanning

#### Category Hierarchy: Add "Integrations" Top-Level Category

```
Integrations/                          ← NEW top-level category
├── CRM/
│   └── HubSpot/                       ← auto-generated CRUD actions
├── Accounting/
│   ├── QuickBooks/                    ← auto-generated CRUD actions
│   └── Business Central/             ← auto-generated CRUD actions
├── Form Builders/
│   ├── Typeform/                      ← auto-generated CRUD actions
│   ├── JotForm/
│   ├── SurveyMonkey/
│   └── Google Forms/
├── LMS/
│   └── LearnWorlds/                   ← auto-generated CRUD actions
├── AMS/                               ← Association Management Systems
│   └── YourMembership/                ← auto-generated CRUD actions
└── [future providers]/

Social Media/                          ← stays separate (not integrations)
├── Twitter/
├── LinkedIn/
├── Facebook/
├── Instagram/
├── TikTok/
├── YouTube/
├── Buffer/
└── Hootsuite/
```

**Key distinction**: "Integrations" contains actions that operate on **replicable business data** (contacts, invoices, enrollments, etc.). "Social Media" contains actions that operate on **platform-specific content** (posts, tweets, stories). This matches the user's vision: integrations = SaaS systems with databases.

#### Icon Conventions for Auto-Generated Actions

| Verb | Icon | Rationale |
|------|------|-----------|
| Get | `fa-solid fa-magnifying-glass` | Looking up a record |
| Create | `fa-solid fa-plus` | Adding new |
| Update | `fa-solid fa-pen` | Editing existing |
| Delete | `fa-solid fa-trash` | Removing |
| Search | `fa-solid fa-search` | Searching across records |
| List | `fa-solid fa-list` | Listing multiple records |

#### Social Media Naming Migration

For the 65 social media actions, migrate from `{Verb} ({Provider})` to `{Provider} - {Verb}`:

| Current | Proposed |
|---------|----------|
| Create Post (Buffer) | Buffer - Create Post |
| Get Analytics (LinkedIn) | LinkedIn - Get Analytics |
| Delete Video (YouTube) | YouTube - Delete Video |
| Upload Media (Twitter) | Twitter - Upload Media |

This is a metadata-only change (update Action.Name). Since agents reference actions by ID (not name), this is non-breaking. However, any hardcoded name references in agent prompts or UI code would need updating.

---

## 9. Migration Strategy

### Phase 0: Infrastructure (no user-visible changes)

1. Add `Config` column to `Action` table (migration)
2. Add `WriteAPIPath`, `WriteMethod`, `DeleteMethod` to `IntegrationObject` (migration)
3. Add CRUD methods to `BaseIntegrationConnector` and `BaseRESTIntegrationConnector`
4. Build `IntegrationActionExecutor` class
5. Build action generation CLI utility

### Phase 1: HubSpot Pilot

HubSpot is the ideal first target — it already has both a connector AND 22 BizApps actions.

1. Add CRUD method overrides to `HubSpotConnector` (leveraging existing API knowledge from `HubSpotBaseAction`)
2. Set `SupportsWrite: true` on HubSpot IntegrationObjects that support it
3. Run generation utility to produce action metadata
4. Map generated actions to existing Action IDs where they overlap (18 of 22)
5. Test: verify generated actions produce identical results to hand-written ones
6. Flip: update existing actions to use `IntegrationActionExecutor` + populate `Config`
7. Keep 4 platform-specific HubSpot actions as custom code

### Phase 2: Remaining Converters

For each provider (QuickBooks, Business Central, Typeform, JotForm, SurveyMonkey, Google Forms, LearnWorlds):

1. Build a `BaseRESTIntegrationConnector` subclass if one doesn't exist
2. Implement `Authenticate()`, `BuildHeaders()`, `GetBaseURL()`, etc. (extract from existing BizApps action base classes)
3. Define `IntegrationObject` and `IntegrationObjectField` metadata
4. Override `BuildWritePayload()` / `ExtractWriteResponse()` if the API has non-standard patterns
5. Run generation utility
6. Test and flip existing actions

**Acceleration opportunity**: An AI agent can read the existing BizApps action source code (e.g., `QuickBooksBaseAction.makeQuickBooksRequest()`) and generate the connector implementation. The API knowledge is already captured in code — it just needs to be restructured.

### Phase 3: YourMembership Expansion

YourMembership already has a connector with 30+ objects but no CRUD methods. Add write support and generate actions. This will produce ~180 auto-generated actions from a single connector — demonstrating the leverage.

### Phase 4: New Integrations

All new integrations follow the connector-first pattern:
1. Write the connector
2. Define IntegrationObject/Field metadata
3. Run `npx mj-integration generate-actions`
4. Get dozens of actions automatically

### Phase 5: Taxonomy Cleanup

1. Rename social media actions to `{Provider} - {Verb}` pattern
2. Move integration actions to new `Integrations > {Domain} > {Provider}` categories
3. Update any hardcoded name references

---

## 10. Implementation Phases

### Release Mapping

| Phase | Ships In | Notes |
|-------|----------|-------|
| Phase 0 (DB migrations + CodeGen) | **v5.12** | COMPLETE — migration applied, CodeGen run |
| Phase 0 (Foundation code) + Phase 1 (HubSpot) | **v5.13** | Current work — code only, metadata to `/metadata/` folder |
| Phase 2-5 | **v5.14+** | Future work |

### Phase 0: Foundation

**DB Migrations: COMPLETE (shipped in v5.12)**

| Task | Status |
|------|--------|
| Migration: Add `Config` to Action table | DONE |
| Migration: Add `WriteAPIPath`, `WriteMethod`, `DeleteMethod` to IntegrationObject | DONE |
| Run CodeGen for new fields | DONE |

**Code Implementation (shipping in v5.13):**

| Task | Package | Status |
|------|---------|--------|
| Add CRUD types (`CRUDContext`, etc.) — already existed | `packages/Integration/engine/` | DONE (pre-existing) |
| Add `ListContext`/`ListResult` types | `packages/Integration/engine/src/types.ts` | DONE |
| Add `SupportsListing` getter + `ListRecords` to `BaseIntegrationConnector` | `packages/Integration/engine/` | DONE |
| Export `ListContext`/`ListResult` from barrel | `packages/Integration/engine/src/index.ts` | DONE |
| Build `IntegrationActionExecutor` class | `packages/Actions/CoreActions/src/custom/integration/` | DONE |
| Build `ActionMetadataGenerator` class | `packages/Integration/engine/src/ActionMetadataGenerator.ts` | DONE |
| Build HubSpot generation CLI script | `packages/Integration/engine/src/generate-hubspot-actions.ts` | DONE |
| Use existing `HubSpot` category (under `Business Apps > CRM > HubSpot`) | `metadata/action-categories/` | DONE (pre-existing categories are sufficient) |
| Unit tests for `ActionMetadataGenerator` (30 tests) | `packages/Integration/engine/` | DONE |
| Unit tests for `IntegrationActionExecutor` (31 tests) | `packages/Actions/CoreActions/` | DONE |

### Phase 1: HubSpot Pilot (shipping in v5.13)

| Task | Package | Status |
|------|---------|--------|
| Add CRUD overrides to `HubSpotConnector` (Get/Create/Update/Delete/Search/List) | `packages/Integration/connectors/` | DONE |
| Override capability getters (`SupportsCreate/Update/Delete/Search/Listing`) | `packages/Integration/connectors/` | DONE |
| Update `MakeHTTPRequest` + `FetchWithTimeout` to support request bodies | `packages/Integration/connectors/` | DONE |
| Generate HubSpot action metadata (30 actions, 5 objects × 6 verbs) | CLI → `metadata/integration-actions-hubspot/` | DONE |
| Build and verify compilation of all affected packages | all | DONE |
| Map to existing Action IDs | CLI utility --update | DEFERRED to Phase 2+ |

### Phase 2: Remaining Providers (~2-3 weeks, parallelizable)

Each provider can be done independently and in parallel:

| Provider | New Connector? | Existing Actions to Convert | Notes |
|----------|---------------|---------------------------|-------|
| QuickBooks | Yes (new) | 4 | Extract from QuickBooksBaseAction |
| Business Central | Yes (new) | 4 | Extract from BusinessCentralBaseAction |
| Typeform | Yes (new) | 6 | Extract from TypeformBaseAction |
| JotForm | Yes (new) | 5 | Extract from JotFormBaseAction |
| SurveyMonkey | Yes (new) | 5 | Extract from SurveyMonkeyBaseAction |
| Google Forms | Yes (new) | 2 | Extract from GoogleFormsBaseAction |
| LearnWorlds | Yes (new) | 10 | Extract from LearnWorldsBaseAction |

### Phase 3: YourMembership + Salesforce Expansion (~1 week)

| Task | Notes |
|------|-------|
| Add CRUD methods to YourMembershipConnector | Connector already exists with 30+ objects |
| Add CRUD methods to SalesforceConnector | Connector exists but is mock — needs real API implementation |
| Generate actions for both | Expect ~180 YM actions, ~30+ Salesforce actions |

### Phase 4: Schema Sync Automation (~1 week)

| Task | Notes |
|------|-------|
| Build `ActionSyncService` | Diff engine for IntegrationObjectField → ActionParam sync |
| Add entity save hooks on IntegrationObject/Field | Trigger sync on metadata changes |
| Add debouncing (5-second batch window) | Prevent thrashing during DiscoverFields() |
| Add sync audit logging | Track all auto-sync operations |

### Phase 5: Taxonomy & Cleanup (~3 days)

| Task | Notes |
|------|-------|
| Rename social media actions to `{Provider} - {Verb}` pattern | Metadata-only update |
| Move auto-generated actions to `Integrations` category tree | Metadata-only update |
| Remove deprecated BizApps action code (after validation) | Code cleanup |
| Update documentation | CLAUDE.md, README updates |

---

## 11. Open Questions & Future Work

### Decided

| Question | Decision |
|----------|----------|
| New Action Type? | No — use `Type='Custom'` with shared `DriverClass` |
| How to route? | `Config` JSON field on Action entity |
| Param style? | Strongly typed per-field ActionParams (Option B) |
| Generation timing? | Build-time CLI utility |
| Credential management? | CompanyIntegration → Credential entity only |
| Schema drift? | Sync-on-update via entity save hooks |
| Rate limiting? | Connector-level in the integration engine. Actions are an overlay on connectors, so rate limiting belongs where the HTTP calls happen. The connector already has the context (API keys, provider limits) to enforce rate limits. Both sync engine and action-invoked CRUD share the same connector instance, so a single rate limiter covers both paths. |
| Filtered list actions? | **Explode, don't collapse.** Auto-generate specific filtered variants (e.g., "HubSpot - Get Deals by Company", "HubSpot - Get Upcoming Tasks") as separate actions with strongly-typed parameters and rich descriptions. More actions with clear names and params are better for discoverability — vector search makes it easy for agents and humans to find the right action. A generic List + filter param is harder to discover and use correctly. |
| `IsWritable` column? | No — use existing `IsReadOnly` on `IntegrationObjectField` (invert the logic: `IsReadOnly = 0` means writable). No new migration needed. |

### Open for Discussion

1. **Batch operations**: Should we auto-generate "Batch Create Contacts" and "Batch Update Contacts" actions for providers that support batch APIs? Recommend: defer to Phase 5+ — single-record CRUD covers 90% of agent use cases.

2. **Credential scope for multi-tenant**: When an agent invokes an integration action, how does it know which `CompanyIntegrationID` to use? Options: (a) agent has it configured in its context, (b) inferred from the user's organization, (c) explicitly passed. Recommend: (c) explicitly passed as a required param, with agent context providing a default.

3. **Webhook/event actions**: Some platforms support webhooks (Typeform, JotForm "Watch New Responses"). Should the integration framework support event-driven actions? Recommend: defer — this is a fundamentally different pattern (push vs. pull) and warrants its own design.

4. **Action description quality**: Auto-generated descriptions need to be good enough for AI agents to understand what the action does. Consider using a prompt template: "Retrieve a single {Object} record from {Integration} by its record ID. Returns all available fields including {top 5 field names}."

5. **Existing BizApps package lifecycle**: After all CRUD actions are migrated to connectors, the BizApps packages (CRM, Accounting, LMS, FormBuilders) will shrink to only platform-specific actions. Should we keep the package structure or consolidate? Recommend: keep for now, consolidate in a future cleanup pass.

6. **Social media actions**: Classification of social media providers (Twitter, LinkedIn, Facebook, etc.) as standalone vs. integration is deferred for future discussion. Current plan keeps them as standalone custom actions.

---

## Appendix A: Integration vs. Action — Decision Framework

When deciding whether a new external system should be an **integration connector** or a set of **standalone actions**, use this framework:

| Criterion | Integration Connector | Standalone Actions |
|-----------|----------------------|-------------------|
| **Data nature** | Persistent business records (contacts, invoices, users) | Ephemeral content (posts, tweets, messages) |
| **Primary verbs** | CRUD (Create, Read, Update, Delete) | Publish, Schedule, Analyze, Export |
| **Sync value** | High — data should be replicated/cached in MJ | Low — data is consumed in real-time, not stored |
| **Object count** | Many objects with many fields | Few objects with specialized operations |
| **API pattern** | RESTful CRUD endpoints | Specialized endpoints per operation |
| **Examples** | HubSpot, Salesforce, QuickBooks, NetSuite, Mailchimp | Twitter, Slack, Twilio, Stripe (payments), SendGrid |

**Rule of thumb**: If the system has a "database" of business records you'd want to query, filter, and potentially replicate — it's an integration. If it's primarily a publishing, messaging, or analytics tool — it's standalone actions.

## Appendix B: Config JSON Schema Reference

```typescript
/**
 * JSON schema for the Config field on auto-generated integration actions.
 * Stored in Action.Config_ as a JSON string.
 */
interface IntegrationActionConfig {
    /**
     * Name of the integration as registered in the Integrations entity.
     * Must exactly match Integration.Name.
     * Example: "HubSpot", "QuickBooks Online", "YourMembership"
     */
    integrationName: string;

    /**
     * Name of the integration object as defined in IntegrationObject.Name.
     * Case-sensitive, must match exactly.
     * Example: "contacts", "Journal Entry", "MemberList"
     */
    objectName: string;

    /**
     * CRUD verb this action performs.
     */
    verb: 'Get' | 'Create' | 'Update' | 'Delete' | 'Search' | 'List';

    /**
     * Optional: Override the API version used by the connector.
     * If not specified, uses the connector's default version.
     */
    apiVersion?: string;

    /**
     * Optional: Additional connector-specific configuration.
     * Passed through to the connector's CRUD methods.
     * Example: { "includeAssociations": true } for HubSpot
     */
    connectorConfig?: Record<string, unknown>;

    /**
     * Auto-populated by the generation utility. Used for update-mode
     * matching to identify which integration+object+verb this action represents.
     * Format: "{integrationName}:{objectName}:{verb}"
     */
    generationKey?: string;
}
```

## Appendix C: Existing BizApps Actions — Database ID Preservation Map

This appendix inventories all existing BizApps actions with their database primary keys. When migrating to `IntegrationActionExecutor`, we **preserve these IDs** — update `DriverClass` and populate `Config` on the existing records rather than creating new ones.

### HubSpot — CRUD Actions (Migrate to IntegrationActionExecutor)

| Action Name | Primary Key ID | Current DriverClass | New Verb | New ObjectName |
|-------------|---------------|-------------------|----------|---------------|
| HubSpot - Get Contact | A5C7433E-F36B-1410-8DB6-00021F8B792E | GetContactAction | Get | contacts |
| HubSpot - Create Contact | 6CC7433E-F36B-1410-8DB6-00021F8B792E | CreateContactAction | Create | contacts |
| HubSpot - Update Contact | 76C7433E-F36B-1410-8DB6-00021F8B792E | UpdateContactAction | Update | contacts |
| HubSpot - Delete Contact | 80C7433E-F36B-1410-8DB6-00021F8B792E | DeleteContactAction | Delete | contacts |
| HubSpot - Search Contacts | 8AC7433E-F36B-1410-8DB6-00021F8B792E | SearchContactsAction | Search | contacts |
| HubSpot - Get Company | D5C7433E-F36B-1410-8DB6-00021F8B792E | GetCompanyAction | Get | companies |
| HubSpot - Create Company | ADC7433E-F36B-1410-8DB6-00021F8B792E | CreateCompanyAction | Create | companies |
| HubSpot - Update Company | B5C7433E-F36B-1410-8DB6-00021F8B792E | UpdateCompanyAction | Update | companies |
| HubSpot - Search Companies | E8C7433E-F36B-1410-8DB6-00021F8B792E | SearchCompaniesAction | Search | companies |
| HubSpot - Get Deal | F6C7433E-F36B-1410-8DB6-00021F8B792E | GetDealAction | Get | deals |
| HubSpot - Create Deal | BDC7433E-F36B-1410-8DB6-00021F8B792E | CreateDealAction | Create | deals |
| HubSpot - Update Deal | 04C8433E-F36B-1410-8DB6-00021F8B792E | UpdateDealAction | Update | deals |
| HubSpot - Search Deals | 20C8433E-F36B-1410-8DB6-00021F8B792E | SearchDealsAction | Search | deals |
| HubSpot - Create Task | C5C7433E-F36B-1410-8DB6-00021F8B792E | CreateTaskAction | Create | tasks |
| HubSpot - Update Task | 58C8433E-F36B-1410-8DB6-00021F8B792E | UpdateTaskAction | Update | tasks |
| HubSpot - Get Deals by Company | 2EC8433E-F36B-1410-8DB6-00021F8B792E | GetDealsByCompanyAction | Search | deals |
| HubSpot - Get Deals by Contact | 3CC8433E-F36B-1410-8DB6-00021F8B792E | GetDealsByContactAction | Search | deals |
| HubSpot - Get Upcoming Tasks | 60C8433E-F36B-1410-8DB6-00021F8B792E | GetUpcomingTasksAction | Search | tasks |

### HubSpot — Keep as Custom (Platform-Specific)

| Action Name | Primary Key ID | Reason |
|-------------|---------------|--------|
| HubSpot - Associate Contact to Company | CDC7433E-F36B-1410-8DB6-00021F8B792E | HubSpot-specific association API |
| HubSpot - Merge Contacts | DDC7433E-F36B-1410-8DB6-00021F8B792E | Platform-specific merge semantics |
| HubSpot - Log Activity | 12C8433E-F36B-1410-8DB6-00021F8B792E | HubSpot engagement abstraction |
| HubSpot - Get Activities by Contact | 4AC8433E-F36B-1410-8DB6-00021F8B792E | HubSpot engagement timeline |

### LearnWorlds — CRUD Actions (Migrate to IntegrationActionExecutor)

| Action Name | Primary Key ID | Current DriverClass | New Verb | New ObjectName |
|-------------|---------------|-------------------|----------|---------------|
| LearnWorlds - Create User | 94C7433E-F36B-1410-8DB6-00021F8B792E | CreateUserAction | Create | users |
| LearnWorlds - Update User | 3CDE4163-878C-4FE2-AF2C-8B51BDE4F651 | UpdateUserAction | Update | users |
| LearnWorlds - Get User Details | 64C8433E-F36B-1410-8DB6-00021F8B792E | GetLearnWorldsUserDetailsAction | Get | users |
| LearnWorlds - Get Users | 75C8433E-F36B-1410-8DB6-00021F8B792E | GetLearnWorldsUsersAction | List | users |
| LearnWorlds - Enroll User | 62C8433E-F36B-1410-8DB6-00021F8B792E | EnrollUserAction | Create | enrollments |
| LearnWorlds - Get User Enrollments | 66C8433E-F36B-1410-8DB6-00021F8B792E | GetUserEnrollmentsAction | List | enrollments |
| LearnWorlds - Get Courses | 68C8433E-F36B-1410-8DB6-00021F8B792E | GetLearnWorldsCoursesAction | List | courses |
| LearnWorlds - Get Course Details | 6AC8433E-F36B-1410-8DB6-00021F8B792E | GetLearnWorldsCourseDetailsAction | Get | courses |
| LearnWorlds - Get Bundles | AD9E61C5-B22B-4A52-867E-8E0C017C065B | GetBundlesAction | List | bundles |
| LearnWorlds - Get Certificates | 70C8433E-F36B-1410-8DB6-00021F8B792E | GetCertificatesAction | List | certificates |

### LearnWorlds — Keep as Custom (Platform-Specific)

| Action Name | Primary Key ID | Reason |
|-------------|---------------|--------|
| LearnWorlds - Get User Progress | 6CC8433E-F36B-1410-8DB6-00021F8B792E | Platform-specific progress tracking |
| LearnWorlds - Update User Progress | 6EC8433E-F36B-1410-8DB6-00021F8B792E | Platform-specific progress mutation |
| LearnWorlds - Get Course Analytics | 72C8433E-F36B-1410-8DB6-00021F8B792E | Platform-specific analytics |
| LearnWorlds - Get Quiz Results | 79C8433E-F36B-1410-8DB6-00021F8B792E | Platform-specific assessment data |
| LearnWorlds - Onboard Learner | FB7D4AD2-5D94-453C-99FC-35C08B386E66 | Multi-step workflow |
| LearnWorlds - SSO Login | E0F498DA-D398-4CDE-B17A-1BA162EEA6D0 | Auth flow, not CRUD |
| LearnWorlds - Attach Tags | DCE5945A-3108-43A6-B1F9-E9D69EF617C4 | Platform-specific tagging |
| LearnWorlds - Detach Tags | 4652495C-D5C1-4725-AFE2-388454CE97A2 | Platform-specific tagging |
| LearnWorlds - Get Bulk Data | D8DF07CA-BB03-4CD6-A5E1-A89961E57C21 | Platform-specific bulk export |

### QuickBooks — CRUD Actions (Migrate to IntegrationActionExecutor)

| Action Name | Primary Key ID | Current DriverClass | New Verb | New ObjectName |
|-------------|---------------|-------------------|----------|---------------|
| QuickBooks - Get GL Codes | 7DC8433E-F36B-1410-8DB6-00021F8B792E | GetGLCodesAction | List | gl_codes |
| QuickBooks - Get Account Balances | 81C8433E-F36B-1410-8DB6-00021F8B792E | GetAccountBalancesAction | List | account_balances |
| QuickBooks - Get Transactions | 85C8433E-F36B-1410-8DB6-00021F8B792E | GetTransactionsAction | List | transactions |
| QuickBooks - Create Journal Entry | 9DC7433E-F36B-1410-8DB6-00021F8B792E | CreateJournalEntryAction | Create | journal_entries |

### Business Central — CRUD Actions (Migrate to IntegrationActionExecutor)

| Action Name | Primary Key ID | Current DriverClass | New Verb | New ObjectName |
|-------------|---------------|-------------------|----------|---------------|
| Business Central - Get Customers | 89C8433E-F36B-1410-8DB6-00021F8B792E | GetCustomersAction | List | customers |
| Business Central - Get General Ledger Entries | 8DC8433E-F36B-1410-8DB6-00021F8B792E | GetGeneralLedgerEntriesAction | List | general_ledger_entries |
| Business Central - Get GL Accounts | 91C8433E-F36B-1410-8DB6-00021F8B792E | GetGLAccountsAction | List | gl_accounts |
| Business Central - Get Sales Invoices | 95C8433E-F36B-1410-8DB6-00021F8B792E | GetSalesInvoicesAction | List | sales_invoices |

### Migration Procedure (Per Action)

To migrate an existing action to `IntegrationActionExecutor` while preserving its database ID:

1. **Update the action record** in the metadata JSON file:
   - Change `DriverClass` from current class name to `IntegrationActionExecutor`
   - Add `Config` field with `{"IntegrationName":"...", "ObjectName":"...", "Verb":"..."}`
   - Keep `primaryKey.ID` unchanged

2. **Update ActionParams** to match the new executor's expected parameter names:
   - `ExternalID` (Input, required for Get/Update/Delete)
   - `CompanyIntegrationID` (Input, optional)
   - Per-field params matching connector's object fields
   - Standard output params: `Record`, `ExternalID`, `Records`, `TotalCount`, `HasMore`, `NextCursor`

3. **Push via mj-sync**: `npx mj sync push --dir=metadata --include="actions"`

4. **Verify**: The action ID remains the same, so all agent references, execution logs, and history are preserved.

### Summary

| Provider | Migrate to Connector | Keep as Custom | Total |
|----------|---------------------|---------------|-------|
| HubSpot | 18 | 4 | 22 |
| LearnWorlds | 10 | 9 | 19 |
| QuickBooks | 4 | 0 | 4 |
| Business Central | 4 | 0 | 4 |
| **Total** | **36** | **13** | **49** |

## Appendix D: Generated Action Example (HubSpot - Create Contact)

Here's what the generation utility would produce for "HubSpot - Create Contact":

```json
{
    "entity": "Actions",
    "fields": {
        "Name": "HubSpot - Create Contact",
        "Description": "Create a new Contact record in HubSpot. Provide contact fields as input parameters. Returns the created record's external ID and all populated fields.",
        "Type": "Custom",
        "Status": "Active",
        "DriverClass": "IntegrationActionExecutor",
        "Config": "{\"integrationName\":\"HubSpot\",\"objectName\":\"contacts\",\"verb\":\"Create\",\"generationKey\":\"HubSpot:contacts:Create\"}",
        "CategoryID": "@lookup:[Action Categories].Name='HubSpot' AND [Action Categories].ParentID=@lookup:[Action Categories].Name='CRM' AND [Action Categories].ParentID=@lookup:[Action Categories].Name='Integrations'",
        "IconClass": "fa-solid fa-plus"
    },
    "relatedEntities": {
        "Action Params": [
            {
                "fields": {
                    "Name": "CompanyIntegrationID",
                    "Type": "Input",
                    "ValueType": "Scalar",
                    "IsRequired": true,
                    "Description": "ID of the Company Integration record that provides HubSpot credentials"
                }
            },
            {
                "fields": {
                    "Name": "Email",
                    "Type": "Input",
                    "ValueType": "Scalar",
                    "IsRequired": true,
                    "Description": "Contact email address"
                }
            },
            {
                "fields": {
                    "Name": "FirstName",
                    "Type": "Input",
                    "ValueType": "Scalar",
                    "IsRequired": false,
                    "Description": "Contact first name"
                }
            },
            {
                "fields": {
                    "Name": "LastName",
                    "Type": "Input",
                    "ValueType": "Scalar",
                    "IsRequired": false,
                    "Description": "Contact last name"
                }
            },
            {
                "fields": {
                    "Name": "Phone",
                    "Type": "Input",
                    "ValueType": "Scalar",
                    "IsRequired": false,
                    "Description": "Contact phone number"
                }
            },
            {
                "fields": {
                    "Name": "CreatedRecordID",
                    "Type": "Output",
                    "ValueType": "Scalar",
                    "Description": "External ID of the newly created contact in HubSpot"
                }
            },
            {
                "fields": {
                    "Name": "Result",
                    "Type": "Output",
                    "ValueType": "Simple Object",
                    "Description": "Full JSON response from HubSpot containing all created record fields"
                }
            }
        ],
        "Action Result Codes": [
            { "fields": { "ResultCode": "SUCCESS", "Description": "Contact created successfully" } },
            { "fields": { "ResultCode": "VALIDATION_ERROR", "Description": "Required fields missing or invalid" } },
            { "fields": { "ResultCode": "DUPLICATE_RECORD", "Description": "Contact with this email already exists" } },
            { "fields": { "ResultCode": "AUTH_FAILED", "Description": "HubSpot authentication failed" } },
            { "fields": { "ResultCode": "RATE_LIMITED", "Description": "HubSpot API rate limit exceeded" } },
            { "fields": { "ResultCode": "UNEXPECTED_ERROR", "Description": "Unexpected error during creation" } }
        ]
    }
}
```
