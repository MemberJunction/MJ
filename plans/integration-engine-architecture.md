# MemberJunction Integration Engine — Architecture Plan

> **Status**: Approved Draft
> **Date**: March 3, 2026
> **Branch**: `claude/study-integration-architecture-qW5p1`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [Non-Negotiables](#3-non-negotiables)
4. [Existing Entities We Preserve](#4-existing-entities-we-preserve)
5. [Unified Source Model](#5-unified-source-model)
6. [Additive Metadata Entities](#6-additive-metadata-entities)
7. [Core Abstractions](#7-core-abstractions)
8. [Field Mapping & Transform Engine](#8-field-mapping--transform-engine)
9. [Runtime Architecture](#9-runtime-architecture)
10. [DB Connector Strategy](#10-db-connector-strategy)
11. [SaaS API Connector Strategy](#11-saas-api-connector-strategy)
12. [File Connector Strategy](#12-file-connector-strategy)
13. [End-to-End Sync Flow](#13-end-to-end-sync-flow)
14. [Package Structure](#14-package-structure)
15. [UI Plan](#15-ui-plan)
16. [Implementation Phases](#16-implementation-phases)
17. [Success Criteria](#17-success-criteria)

---

## 1. Executive Summary

The **Integration Engine** is a metadata-driven orchestration layer that synchronises data between MemberJunction and external systems. It introduces a **unified connector model** so the same orchestration engine handles:

1. **SaaS APIs** — HubSpot, Salesforce, QuickBooks, YourMembership, etc.
2. **Relational Databases** — SQL Server, PostgreSQL, MySQL.
3. **Files & Spreadsheets** — CSV, Excel, cloud file feeds (via MJ Storage).

The key architectural insight is that we stop treating integrations as API-only "action calls" and treat them as **sources with a common contract** implemented through driver classes registered in the MJ class factory.

### Engine Responsibility Map

| Concern | Owner |
|---------|-------|
| External communication (auth, HTTP, queries) | Connector (per source type) |
| Which entities to sync, field mappings, transforms | Integration Engine |
| When to sync (cron, manual, webhook) | Existing Scheduling Engine |
| Record-level audit trail | Automatic via BaseEntity writes → Record Changes |
| Run history and error logs | Existing `MJ: Company Integration Runs` + `MJ: Error Logs` |

### Key Decisions

1. **Source types are table-driven** — `MJ: Integration Source Types` with `DriverClass`, same pattern as Agent Types. Adding a new source type is a package drop-in, not a core engine change.
2. **Connectors are pluggable** — any class extending `BaseIntegrationConnector` and registered via `@RegisterClass` is a valid connector.
3. **SaaS connectors CAN use Actions but do not have to** — Actions are the encouraged pattern for reusability in agents and scheduling, but direct subclass implementations are fully supported.
4. **File connectors must use MJ Storage** — no direct filesystem access; all file operations go through `@memberjunction/storage`.
5. **Existing entities are never replaced** — all new capabilities are additive.
6. **v1 is pull-only** but the entity model and interfaces are fully bidirectional by design.

---

## 2. Design Principles

1. **Metadata-driven** — Everything configurable through entities, not hard-coded logic.
2. **Source-agnostic** — The engine works identically regardless of whether it talks to a REST API, SQL database, or a CSV file.
3. **Driver class extensibility** — New source types and connectors are registered plugins; the engine never needs modification.
4. **Thin connectors** — Connectors fetch data and return `ExternalRecord[]`. All mapping, matching, and writing lives in the engine.
5. **Composable transforms** — Field mappings support a pipeline of ordered transform steps.
6. **Incremental sync** — Watermark-based delta detection avoids full-table scans.
7. **Observable** — Every sync run produces a detailed audit trail against existing run/detail entities.
8. **Fail-safe** — Individual record failures do not abort the run; they're logged and the sync continues.
9. **Multi-tenant aware** — `CompanyIntegration` isolates credentials and mappings per subsidiary/environment.

---

## 3. Non-Negotiables

1. Do not replace or rename existing integration entities.
2. Do not break current run history, record map, or credential behavior.
3. All new capabilities are additive only.
4. One orchestration flow for SaaS API, DB, and file sources.
5. Keep v1 implementation scope controlled and shippable.

---

## 4. Existing Entities We Preserve

The following entities already exist and remain first-class:

| Entity | Notes |
|--------|-------|
| `MJ: Integrations` | Integration definition (renamed in MJ to `Integration`) |
| `MJ: Company Integrations` | Per-company integration instance |
| `MJ: Company Integration Runs` | One record per sync execution |
| `MJ: Company Integration Run Details` | Per-entity results within a run |
| `MJ: Company Integration Run API Logs` | API request/response traces |
| `MJ: Company Integration Record Maps` | External ID ↔ MJ record ID mapping |
| `MJ: Employee Company Integrations` | Employee-level integration assignments |
| `MJ: Integration URL Formats` | URL pattern definitions |
| `MJ: Record Changes` | Automatic via BaseEntity — no integration-specific attribution needed |
| `MJ: Error Logs` | Already has `CompanyIntegrationRunID` and `CompanyIntegrationRunDetailID` links |

These entities are already wired into generated GraphQL, Angular forms, and existing action base classes. Replacing them creates avoidable migration and regression risk.

---

## 5. Unified Source Model

### 5.1 Core Concept

Every configured `CompanyIntegration` is a **Source Instance**. Each source instance is backed by a connector implementation resolved from the integration's source type. All connectors implement the same base contract regardless of where the data lives.

### 5.2 Source Types as a Metadata Table

Source types are **not** a code enum. They are rows in `MJ: Integration Source Types` with a `DriverClass` column — exactly how `MJ: AI Agent Types` works in the agent framework.

#### `MJ: Integration Source Types` entity

| Field | Type | Description |
|-------|------|-------------|
| `ID` | UUID PK | |
| `Name` | nvarchar(200) | e.g., `"SaaS API"`, `"Relational Database"`, `"File Feed"` |
| `Description` | nvarchar(max) | |
| `DriverClass` | nvarchar(500) | `@RegisterClass` name, e.g. `"SaaSAPIConnector"` |
| `IconClass` | nvarchar(200) | Font Awesome class |
| `Status` | nvarchar(50) | `'Active'` \| `'Inactive'` |

**Seeded source types** (v1):

| Name | DriverClass |
|------|-------------|
| `SaaS API` | `SaaSAPIConnector` |
| `Relational Database` | `RelationalDBConnector` |
| `File Feed` | `FileFeedConnector` |

Adding a `NoSQL Database` or `Event Stream` source type in the future requires only a new package + row insertion. No changes to the engine.

### 5.3 Unified Connector Contract

```typescript
// packages/Integration/engine/src/BaseIntegrationConnector.ts

export interface ConnectionTestResult {
    Success: boolean;
    Message: string;
    Details?: Record<string, string | number | boolean>;
}

export interface ExternalObjectSchema {
    Name: string;
    Label: string;
    Description?: string;
    SupportsIncremental: boolean;
}

export interface ExternalFieldSchema {
    Name: string;
    Label: string;
    DataType: string;
    IsNullable: boolean;
    IsCustomField: boolean;
}

export interface FetchContext {
    CompanyIntegration: CompanyIntegrationEntity;
    EntityMap: CompanyIntegrationEntityMapEntity;
    FieldMaps: CompanyIntegrationFieldMapEntity[];
    Watermark?: CompanyIntegrationSyncWatermarkEntity;
    BatchSize: number;
    ContextUser: UserInfo;
}

export interface FetchBatchResult {
    Records: ExternalRecord[];
    HasMore: boolean;
    NextWatermark?: string;
    TotalAvailable?: number;
}

export abstract class BaseIntegrationConnector {

    /**
     * Validate credentials and reachability.
     */
    abstract TestConnection(
        companyIntegration: CompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult>;

    /**
     * Return available objects/tables/sheets in the source.
     * Used by the UI when setting up entity maps.
     */
    abstract DiscoverObjects(
        companyIntegration: CompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]>;

    /**
     * Return fields for a specific source object.
     * Includes custom/dynamic fields where supported.
     */
    abstract DiscoverFields(
        companyIntegration: CompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]>;

    /**
     * Fetch records changed since the watermark value (incremental),
     * or all records if no watermark is set (initial load).
     */
    abstract FetchChanges(ctx: FetchContext): Promise<FetchBatchResult>;

    /**
     * Provider-specific default field mappings for well-known objects.
     * Returns suggested mappings the user can accept or customize.
     */
    GetDefaultFieldMappings(
        objectName: string,
        entityName: string
    ): DefaultFieldMapping[] {
        return [];  // Default: no suggestions — connectors override as needed
    }
}
```

Connectors are registered via `@RegisterClass`:

```typescript
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseIntegrationConnector {
    // ...
}
```

The `ConnectorFactory` resolves the correct class by looking up the `Integration.SourceTypeID → IntegrationSourceType.DriverClass` chain.

---

## 6. Additive Metadata Entities

We add exactly the metadata needed to support generalized sync. Nothing here touches existing entities.

### 6.1 New Entities

| Entity | Purpose |
|--------|---------|
| `MJ: Integration Source Types` | Driver class registry for source types |
| `MJ: Company Integration Entity Maps` | Maps a source object to an MJ entity |
| `MJ: Company Integration Field Maps` | Field-level mapping with transform pipeline |
| `MJ: Company Integration Sync Watermarks` | Incremental sync cursor/position per entity map |

### 6.2 `MJ: Company Integration Entity Maps`

Maps a source object (API endpoint, table, sheet) to an MJ entity within a specific `CompanyIntegration`.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | UUID PK | |
| `CompanyIntegrationID` | UUID FK | Parent company integration |
| `ExternalObjectName` | nvarchar(500) | Source name: `"contacts"`, `"public.customers"`, `"Sheet1"` |
| `ExternalObjectLabel` | nvarchar(500) | Display label for UI |
| `EntityID` | UUID FK | Target MJ entity |
| `SyncDirection` | nvarchar(50) | `'Pull'` \| `'Push'` \| `'Bidirectional'` |
| `SyncEnabled` | bit | |
| `MatchStrategy` | nvarchar(max) | JSON: key fields and match mode |
| `ConflictResolution` | nvarchar(50) | `'SourceWins'` \| `'DestWins'` \| `'MostRecent'` \| `'Manual'` |
| `Priority` | int | Processing order |
| `DeleteBehavior` | nvarchar(50) | `'SoftDelete'` \| `'DoNothing'` \| `'HardDelete'` |
| `Status` | nvarchar(50) | `'Active'` \| `'Inactive'` |
| `Configuration` | nvarchar(max) | JSON: connector-specific overrides |

### 6.3 `MJ: Company Integration Field Maps`

Field-level mapping with an optional transform pipeline.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | UUID PK | |
| `EntityMapID` | UUID FK | Parent entity map |
| `SourceFieldName` | nvarchar(500) | e.g., `"firstname"` |
| `SourceFieldLabel` | nvarchar(500) | e.g., `"First Name"` |
| `DestinationFieldName` | nvarchar(500) | e.g., `"FirstName"` |
| `DestinationFieldLabel` | nvarchar(500) | e.g., `"First Name"` |
| `Direction` | nvarchar(50) | `'SourceToDest'` \| `'DestToSource'` \| `'Both'` |
| `TransformPipeline` | nvarchar(max) | JSON: array of transform steps |
| `IsKeyField` | bit | Used for record matching |
| `IsRequired` | bit | |
| `DefaultValue` | nvarchar(max) | Applied when source value is null |
| `Priority` | int | Processing order |
| `Status` | nvarchar(50) | `'Active'` \| `'Inactive'` |

### 6.4 `MJ: Company Integration Sync Watermarks`

Tracks incremental sync position per entity map per direction.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | UUID PK | |
| `EntityMapID` | UUID FK | Parent entity map |
| `Direction` | nvarchar(50) | `'Pull'` \| `'Push'` |
| `WatermarkType` | nvarchar(50) | `'Timestamp'` \| `'Cursor'` \| `'ChangeToken'` \| `'Version'` |
| `WatermarkValue` | nvarchar(max) | Serialized position value |
| `LastSyncAt` | datetimeoffset | |
| `RecordsSynced` | int | Count from last sync |

### 6.5 Why These Are Additive-Safe

1. They do not duplicate run, record map, or company integration entities.
2. They fill current gaps: object mapping, field-level mapping, incremental cursor state.
3. They let us support SQL tables, views, and file sheets the same way we support SaaS objects.

---

## 7. Core Abstractions

### 7.1 Type Definitions

```typescript
// packages/Integration/engine/src/types.ts

export type SyncDirection = 'Pull' | 'Push' | 'Bidirectional';
export type SyncTriggerType = 'Scheduled' | 'Manual' | 'Webhook';
export type WatermarkType = 'Timestamp' | 'Cursor' | 'ChangeToken' | 'Version';
export type ConflictResolution = 'SourceWins' | 'DestWins' | 'MostRecent' | 'Manual';
export type DeleteBehavior = 'SoftDelete' | 'DoNothing' | 'HardDelete';
export type RecordChangeType = 'Create' | 'Update' | 'Delete' | 'Skip';
export type IntegrationRunStatus = 'Running' | 'Completed' | 'Failed' | 'Cancelled';

export interface ExternalRecord {
    ExternalID: string;
    ObjectType: string;
    Fields: Record<string, unknown>;
    ModifiedAt?: Date;
    IsDeleted?: boolean;
}

export interface MappedRecord {
    ExternalRecord: ExternalRecord;
    MJEntityName: string;
    MappedFields: Record<string, unknown>;
    ChangeType: RecordChangeType;
    MatchedMJRecordID?: string;
}

export interface SyncResult {
    Success: boolean;
    RecordsProcessed: number;
    RecordsCreated: number;
    RecordsUpdated: number;
    RecordsDeleted: number;
    RecordsErrored: number;
    RecordsSkipped: number;
    Errors: SyncRecordError[];
    WatermarkAfter?: string;
}

export interface SyncRecordError {
    ExternalID: string;
    ChangeType: RecordChangeType;
    ErrorMessage: string;
    ExternalRecord?: ExternalRecord;
}

export interface DefaultFieldMapping {
    SourceFieldName: string;
    DestinationFieldName: string;
    TransformPipeline?: TransformStep[];
    IsKeyField?: boolean;
}
```

> **Naming convention:** All public class/interface members use **PascalCase**. Private and protected members use **camelCase**. This applies throughout all integration packages.

### 7.2 Connector Factory

```typescript
// packages/Integration/engine/src/ConnectorFactory.ts

export class ConnectorFactory {

    static Resolve(
        integration: CompanyIntegrationEntity,
        sourceTypes: IntegrationSourceTypeEntity[]
    ): BaseIntegrationConnector {
        const sourceType = sourceTypes.find(
            st => st.ID === integration.SourceTypeID
        );
        if (!sourceType) {
            throw new Error(`Unknown source type for integration: ${integration.Name}`);
        }

        const connectorClass = MJGlobal.Instance.ClassFactory.CreateInstance<BaseIntegrationConnector>(
            BaseIntegrationConnector,
            sourceType.DriverClass
        );
        if (!connectorClass) {
            throw new Error(`No connector registered for driver class: ${sourceType.DriverClass}`);
        }
        return connectorClass;
    }
}
```

### 7.3 Integration Orchestrator

```typescript
// packages/Integration/engine/src/IntegrationOrchestrator.ts

export class IntegrationOrchestrator {

    async RunSync(
        companyIntegrationID: string,
        contextUser: UserInfo,
        triggerType: SyncTriggerType = 'Manual'
    ): Promise<SyncResult> {
        const run = await this.createRun(companyIntegrationID, triggerType, contextUser);
        try {
            const entityMaps = await this.loadEntityMaps(companyIntegrationID, contextUser);
            for (const entityMap of entityMaps) {
                await this.syncEntityMap(run, entityMap, contextUser);
            }
            return await this.finalizeRun(run, contextUser);
        } catch (error) {
            return await this.failRun(run, error, contextUser);
        }
    }

    private async syncEntityMap(
        run: CompanyIntegrationRunEntity,
        entityMap: CompanyIntegrationEntityMapEntity,
        contextUser: UserInfo
    ): Promise<void> {
        const detail = await this.createRunDetail(run, entityMap, contextUser);
        const watermark = await this.watermarkService.Load(entityMap.ID, contextUser);
        const connector = ConnectorFactory.Resolve(run.CompanyIntegration, this.sourceTypes);

        const fetchCtx: FetchContext = {
            CompanyIntegration: run.CompanyIntegration,
            EntityMap: entityMap,
            FieldMaps: await this.loadFieldMaps(entityMap.ID, contextUser),
            Watermark: watermark ?? undefined,
            BatchSize: this.config.DefaultBatchSize,
            ContextUser: contextUser,
        };

        const batch = await connector.FetchChanges(fetchCtx);
        const mapped = this.fieldMappingEngine.Apply(batch.Records, fetchCtx.FieldMaps);
        const matched = await this.matchEngine.Resolve(mapped, entityMap, contextUser);
        const result = await this.applyRecords(matched, entityMap, contextUser);

        await this.watermarkService.Update(entityMap.ID, batch.NextWatermark, contextUser);
        await this.finalizeRunDetail(detail, result, contextUser);
    }
}
```

---

## 8. Field Mapping & Transform Engine

### 8.1 Transform Pipeline Concept

Each field map can carry an ordered array of transform steps. Steps are applied sequentially — the output of each step is the input to the next.

```
Source Field Value → [Step 1] → [Step 2] → ... → Destination Field Value
```

Stored as a JSON array in `TransformPipeline`:

```json
[
    { "Type": "regex",  "Config": { "Pattern": "^\\+1\\s?", "Replacement": "" }, "OnError": "Null" },
    { "Type": "format", "Config": { "FormatType": "phone", "OutputFormat": "E164" }, "OnError": "Skip" }
]
```

### 8.2 Transform Types

```typescript
// packages/Integration/engine/src/transforms.ts

export type TransformType =
    | 'direct'      // Pass through unchanged
    | 'regex'       // Regex replace with capture groups
    | 'split'       // Split one field into multiple by delimiter
    | 'combine'     // Combine multiple source fields into one
    | 'lookup'      // Map discrete values via a lookup table
    | 'format'      // Date, number, phone, currency formatting
    | 'substring'   // Extract substring by offset/length
    | 'coerce'      // Type coercion (string→number, etc.)
    | 'custom';     // Sandboxed JS expression

export interface TransformStep {
    Type: TransformType;
    Config: TransformConfig;
    OnError: 'Skip' | 'Null' | 'Fail';
}

export type TransformConfig =
    | DirectConfig
    | RegexConfig
    | SplitConfig
    | CombineConfig
    | LookupConfig
    | FormatConfig
    | SubstringConfig
    | CoerceConfig
    | CustomConfig;

export interface RegexConfig {
    Pattern: string;
    Replacement: string;
    Flags?: string;
}

export interface SplitConfig {
    Delimiter: string;
    Index: number;
    TrimWhitespace?: boolean;
}

export interface CombineConfig {
    /** Field references use {{FieldName}} syntax */
    Parts: string[];
    Separator?: string;
}

export interface LookupConfig {
    Map: Record<string, string>;
    DefaultValue?: string;
    CaseSensitive?: boolean;
}

export interface FormatConfig {
    FormatType: 'date' | 'number' | 'phone' | 'currency';
    InputFormat?: string;
    OutputFormat: string;
    Locale?: string;
}

export interface CoerceConfig {
    TargetType: 'string' | 'number' | 'boolean' | 'date';
    TrueValues?: string[];
    FalseValues?: string[];
}

export interface SubstringConfig {
    Start: number;
    Length?: number;
}

export interface CustomConfig {
    /**
     * Sandboxed JS expression. Available variables:
     * - `value` — current field value
     * - `record` — full ExternalRecord.Fields map
     */
    Expression: string;
}
```

### 8.3 Transform Examples

#### Status value lookup (HubSpot lifecycle stage → MJ status)

```json
{
    "SourceFieldName": "lifecyclestage",
    "DestinationFieldName": "Status",
    "TransformPipeline": [
        {
            "Type": "lookup",
            "Config": {
                "Map": {
                    "subscriber":             "Lead",
                    "lead":                   "Lead",
                    "marketingqualifiedlead": "MQL",
                    "salesqualifiedlead":     "SQL",
                    "opportunity":            "Opportunity",
                    "customer":               "Customer"
                },
                "DefaultValue": "Unknown",
                "CaseSensitive": false
            },
            "OnError": "Null"
        }
    ]
}
```

#### Date format normalization

```json
{
    "Type": "format",
    "Config": {
        "FormatType": "date",
        "InputFormat": "MM/DD/YYYY",
        "OutputFormat": "YYYY-MM-DD"
    },
    "OnError": "Null"
}
```

---

## 9. Runtime Architecture

### 9.1 Existing Assets — Keep As-Is

- Existing action framework and class registration model
- Existing `CompanyIntegration` credential patterns
- Existing run/detail/audit and record map entities
- Existing scheduling engine and action-based job triggers

### 9.2 New Runtime Components

| Component | Responsibility |
|-----------|---------------|
| `IntegrationOrchestrator` | Run lifecycle — creates run, iterates entity maps, finalizes |
| `ConnectorFactory` | Resolves `BaseIntegrationConnector` subclass from source type driver class |
| `FieldMappingEngine` | Applies the transform pipeline for each field map |
| `MatchEngine` | Resolves record identity using key fields + `CompanyIntegrationRecordMap` |
| `WatermarkService` | Reads/writes `Company Integration Sync Watermarks` |

### 9.3 Data Flow — Pull Sync

```
Scheduler / Manual trigger
        │
        ▼
IntegrationOrchestrator
  ├─ Create CompanyIntegrationRun
  └─ For each active EntityMap:
       ├─ Create CompanyIntegrationRunDetail
       ├─ WatermarkService.Load()
       ├─ ConnectorFactory.Resolve() → BaseIntegrationConnector
       ├─ connector.FetchChanges(ctx) → ExternalRecord[]
       ├─ FieldMappingEngine.Apply() → MappedRecord[]
       ├─ MatchEngine.Resolve() → (Create | Update | Skip) per record
       ├─ entity.Save() per record  ← Record Changes created automatically
       ├─ WatermarkService.Update()
       └─ Finalize RunDetail counters/errors
  └─ Finalize CompanyIntegrationRun aggregate status
```

### 9.4 Record Changes

Writes go through `BaseEntity.Save()` which automatically creates `Record Changes` entries. No integration-specific attribution logic is needed — the framework handles this.

---

## 10. DB Connector Strategy

### 10.1 Source Representation

Each external database source is represented by:

1. An `Integration` row for the DB type (`SQL Server`, `PostgreSQL`, `MySQL`).
2. A `CompanyIntegration` row for the concrete instance (host, db, credentials).
3. Credentials stored via standard `CompanyIntegration` auth configuration.

### 10.2 Extraction Modes

Per entity map, support three source object modes:

| Mode | Description |
|------|-------------|
| `TableMode` | Source object is a table — SELECT with watermark WHERE clause |
| `ViewMode` | Source object is a view — same as TableMode |
| `QueryMode` | Source object is a managed SQL query stored in `Configuration` |

### 10.3 Incremental Sync Strategies

| Strategy | When to Use |
|----------|-------------|
| Timestamp watermark | Source has an `UpdatedAt`-style column |
| Numeric high-water mark | Source uses identity, version, or sequence column |
| Cursor token | Connector-managed opaque cursor |
| Bounded full scan | No incremental signal — full scan with checkpoint batching |

### 10.4 Safety Controls

- Read-only DB credentials enforced by convention and documented in setup.
- Schema allow-list per `CompanyIntegration` — only allowed schemas can be queried.
- Max rows per batch and per run enforced in orchestrator.
- Watermark/key columns should be indexed — orchestrator warns if not.
- All SQL queries are parameterized — no dynamic SQL construction from untrusted input.

---

## 11. SaaS API Connector Strategy

### 11.1 Action-Backed Pattern (Recommended)

The recommended approach for SaaS connectors is to delegate external calls to BizApps Actions. Actions are independently useful in agents, scheduled jobs, and low-code workflows — so the investment is shared.

```typescript
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseIntegrationConnector {

    async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const actionRunner = new ActionEngine();
        const result = await actionRunner.RunAction('Search HubSpot Contacts', {
            After: ctx.Watermark?.WatermarkValue,
            Limit: ctx.BatchSize,
        }, ctx.ContextUser);

        return this.parseActionResult(result);
    }
}
```

### 11.2 Direct Implementation Pattern (Also Valid)

A connector can implement the external calls directly. This is appropriate when:

- A dedicated BizApps Action does not exist for the source.
- The integration logic is complex enough that a direct implementation is cleaner.
- The source API is proprietary or unusual.

```typescript
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseIntegrationConnector {

    async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const credentials = this.loadCredentials(ctx.CompanyIntegration);
        const response = await fetch(`${credentials.BaseUrl}/api/members`, {
            headers: { Authorization: `Bearer ${credentials.Token}` },
        });
        // ...
    }
}
```

Both patterns are valid and produce the same `FetchBatchResult` output. The engine does not know or care which pattern a connector uses.

### 11.3 SaaS Connector Requirements

- API request/response traces flow into `MJ: Company Integration Run API Logs`.
- Schema discovery should surface custom objects and fields where the API supports it.
- Pagination and rate-limit logic stays inside the connector.

---

## 12. File Connector Strategy

### 12.1 MJ Storage Dependency

**All file access must go through `@memberjunction/storage`.** No direct filesystem access or raw `fs` calls. This ensures files work consistently regardless of whether they live locally, in Azure Blob Storage, S3, SharePoint, or any other storage provider.

```typescript
@RegisterClass(BaseIntegrationConnector, 'FileFeedConnector')
export class FileFeedConnector extends BaseIntegrationConnector {

    async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const storageProvider = MJStorageProviderFactory.GetProvider();
        const fileData = await storageProvider.GetFile(
            ctx.CompanyIntegration.Configuration.StoragePath
        );
        return this.parseFile(fileData, ctx.EntityMap.Configuration);
    }
}
```

### 12.2 Supported Formats

- CSV — schema inferred from header row, types normalized.
- Excel (.xlsx) — sheet selection via `EntityMap.ExternalObjectName` (e.g., `"Sheet1"`).

### 12.3 Recurrent File Feeds

Files can be re-ingested on schedule. Watermarking for file feeds tracks last modified timestamp or file content hash to skip unchanged files.

### 12.4 One File → Many Entities

A single file with multiple sheets can have one `EntityMap` per sheet, each mapping to a different MJ entity.

---

## 13. End-to-End Sync Flow

1. Trigger run (manual, scheduled, or webhook).
2. Create `MJ: Company Integration Run` with `Status = 'Running'`.
3. Load all active entity maps + their field maps for the integration.
4. For each entity map (in priority order):
   1. Create `MJ: Company Integration Run Detail`.
   2. Load watermark from `MJ: Company Integration Sync Watermarks`.
   3. Resolve connector via `ConnectorFactory`.
   4. Call `connector.FetchChanges(ctx)` → `ExternalRecord[]`.
   5. Apply transform pipeline via `FieldMappingEngine` → `MappedRecord[]`.
   6. Resolve existing MJ records via `MatchEngine` (uses `CompanyIntegrationRecordMap`).
   7. For each record: call `entity.Save()` (creates/updates MJ record + automatic Record Changes entry).
   8. Update `MJ: Company Integration Record Maps` for new records.
   9. Advance watermark in `MJ: Company Integration Sync Watermarks`.
   10. Finalize run detail with counters and any per-record errors.
5. Finalize run aggregate status (`Completed`, `Failed`, or `Partial`).

---

## 14. Package Structure

Phase 1 uses a lean three-package layout to avoid over-fragmentation. Further splits only if scale demands it.

```
packages/Integration/
├── engine/          ← @memberjunction/integration-engine
│   ├── package.json
│   └── src/
│       ├── BaseIntegrationConnector.ts   ← Abstract base + FetchContext types
│       ├── IntegrationOrchestrator.ts    ← Run lifecycle orchestration
│       ├── ConnectorFactory.ts           ← Resolves connector from DriverClass
│       ├── FieldMappingEngine.ts         ← Transform pipeline executor
│       ├── MatchEngine.ts                ← Record identity resolution
│       ├── WatermarkService.ts           ← Watermark read/write
│       ├── transforms.ts                 ← TransformStep, TransformConfig types
│       └── types.ts                      ← ExternalRecord, SyncResult, etc.
│
├── connectors/      ← @memberjunction/integration-connectors
│   ├── package.json
│   └── src/
│       ├── SaaSAPIConnector.ts           ← Base for action-backed SaaS connectors
│       ├── RelationalDBConnector.ts      ← Base for SQL database connectors
│       ├── FileFeedConnector.ts          ← CSV/Excel via MJ Storage
│       ├── HubSpotConnector.ts           ← HubSpot implementation
│       ├── SqlServerConnector.ts         ← SQL Server implementation
│       ├── PostgreSQLConnector.ts        ← PostgreSQL implementation
│       ├── MySQLConnector.ts             ← MySQL implementation
│       └── YourMembershipConnector.ts    ← YourMembership implementation
│
└── ui-types/        ← @memberjunction/integration-ui-types
    ├── package.json
    └── src/
        └── types.ts                      ← Shared UI-safe types (no server deps)
```

The `engine` package is server-side only. The `ui-types` package is safe to import in Angular.

---

## 15. UI Plan

### 15.1 Primary Screens

Three focused screens cover all operator and developer needs:

| Screen | Purpose |
|--------|---------|
| **Integration Control Tower** | Health overview — run status, failures, stale watermarks, per-integration health indicators |
| **Connection Studio** | Create and edit source instances — wizard for SaaS/API, DB, and file sources; credential testing; source type selection |
| **Mapping & Activity Workspace** | Entity mapping, field transforms, run drill-down, error inspection, watermark management |

### 15.2 Screen Responsibilities

**Integration Control Tower**
- Summary cards per active integration (last run, status, records synced, errors).
- Stale watermark warnings (integration hasn't synced in N days).
- Quick actions: trigger manual run, pause, resume.
- Link to run history for each integration.

**Connection Studio**
- Select source type (drives form fields based on `MJ: Integration Source Types`).
- Source-specific configuration (API keys, DB connection string, storage path).
- Test connection button — calls `connector.TestConnection()`.
- Save as `CompanyIntegration` + credential reference.

**Mapping & Activity Workspace**
- Left panel: entity map list for selected integration.
- Center panel: field mapping editor for selected entity map.
  - Schema discovery populates source field dropdown.
  - MJ entity field picker for destination.
  - Transform pipeline editor per field map.
- Right panel: run detail drill-down (per-record errors, watermark before/after).

---

## 16. Implementation Phases

### Phase 1 — Foundation (Non-Breaking)

1. Add migration for new additive entities (`Integration Source Types`, `Company Integration Entity Maps`, `Field Maps`, `Sync Watermarks`).
2. Implement `BaseIntegrationConnector` + `ConnectorFactory`.
3. Implement `IntegrationOrchestrator` using existing run/detail entities.
4. Implement `FieldMappingEngine` and `MatchEngine`.
5. Implement `WatermarkService`.
6. Seed `MJ: Integration Source Types` rows.

### Phase 2 — Initial Connectors

1. `HubSpotConnector` (action-backed).
2. `SqlServerConnector` (direct DB, read-only).
3. `YourMembershipConnector` (direct API — simple AMS source).
4. `FileFeedConnector` (CSV via MJ Storage).

### Phase 3 — Additional Connectors

1. `PostgreSQLConnector`.
2. `MySQLConnector`.
3. `ExcelConnector` (multi-sheet support).
4. Recurrent file feed ingestion.

### Phase 4 — UI

1. Integration Control Tower (health overview).
2. Connection Studio (source instance wizard).
3. Mapping & Activity Workspace (entity/field map editor + run drill-down).
4. Run diagnostics and watermark health indicators.
5. Admin controls: manual trigger, backfill, partial replay.

### Phase 5 — Hardening

1. Distributed locking and concurrency controls (prevent duplicate runs).
2. Backoff/retry policies per source type.
3. Performance tuning for large-volume initial loads.
4. Operational alerts and SLO instrumentation.

---

## 17. Success Criteria

1. Existing integrations continue to run unchanged after all migrations.
2. New source types can be added as packages with zero engine changes.
3. One orchestration model handles SaaS API, relational DB, and file sources.
4. Run history, record maps, and audit lineage remain intact.
5. File operations work against any MJ Storage provider (not just local disk).
6. Initial production rollout can be phased safely without migration shock.
