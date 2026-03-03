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

## 16. Build Execution Plan

### 16.1 Execution Model

All implementation is driven by a **supervisor/worker split**:

| Role | Who | Responsibilities |
|------|-----|-----------------|
| **Supervisor** | This Claude Code VSCode session | Writes task prompts, delivers them to Docker CC, reviews results, decides next task, pushes commits to remote |
| **Docker CC** | `claude-dev` container | Executes one atomic task at a time, reports PASS/FAIL with details |

**Prompt delivery pattern** (supervisor runs these from the host):
```bash
# Write task prompt to container
docker exec claude-dev bash -c 'cat > /tmp/task.txt' << 'TASKEOF'
<task text>
TASKEOF

# Launch Docker CC non-interactively
docker exec -d claude-dev bash -c \
  'cd /workspace/MJ && cat /tmp/task.txt | claude --dangerously-skip-permissions -p > /tmp/result.txt 2>&1'

# Monitor / read result when complete
docker exec claude-dev tail -f /tmp/result.txt
```

**Branch & commit pattern:**
- Docker CC works on branch `claude/integration-engine-build` (same branch, its own local clone)
- Docker CC commits locally at each milestone
- Supervisor pushes to remote: `docker exec claude-dev bash -c 'cd /workspace/MJ && git push'`

**Quality standard — non-negotiable for every task:**
- Every new file has TSDoc/JSDoc on all public members
- Every new package has a `README.md` explaining purpose, API, and usage examples
- Zero `any` types; all public members PascalCase, private/protected camelCase
- `npm run build` stays green after every task — Docker CC fixes any breaks before marking PASS

---

### 16.2 Phase 0 — Environment Bootstrap

> Supervisor + user perform this once. Docker CC not involved until T0.5.

**T0.1** — Start the Docker workbench:
```bash
cd docker/workbench && ./start.sh
```
Wait for "Claude Dev Workbench Ready".

**T0.2** — User enters container and authenticates (interactive — must be done by user in a terminal):
```bash
docker exec -it claude-dev zsh
# Inside container:
gh auth login          # GitHub auth — persists in named volume
auth-setup             # Enter Auth0 credentials
```
Auth0 test user for Playwright: `da-robot-tester@bluecypress.io` / `!!SoDamnSecureItHurt$`

**T0.3** — Bootstrap MJ database (user, inside container):
```bash
db-bootstrap           # Creates MJ_Workbench + all Flyway migrations
```
Acceptance: `sqldbs` shows `MJ_Workbench`; `sqlq "SELECT COUNT(*) FROM __mj.Entity"` > 0.

**T0.4** — Verify MJ stack comes up healthy (user, inside container):
```bash
mjapi &
mjui &
```
Acceptance: MJAPI logs "Listening on port 4000"; Explorer compiles and serves.

**T0.5** — Supervisor delivers first Docker CC task: cut the working branch:
```
cd /workspace/MJ
git checkout next && git pull origin next
git checkout -b claude/integration-engine-build
git push -u origin claude/integration-engine-build
```
Acceptance: `git branch -vv` shows `[origin/claude/integration-engine-build]`.

---

### 16.3 Phase 1 — Mock Source Databases

> These three SQL Server databases replace real SaaS API calls during the entire build. Connectors read from them instead of hitting real HubSpot/Salesforce/YourMembership endpoints. Each lives on the same `sql-claude` SQL Server instance as `MJ_Workbench`.

**T1.1** — Create `MockHubSpot` database and seed data.

Schema mirrors HubSpot CRM API v3 object structure:

| Table | Rows | Key columns |
|-------|------|-------------|
| `hs_Contacts` | 300 | `hs_object_id`, `firstname`, `lastname`, `email`, `phone`, `company`, `lifecyclestage`, `hs_lead_status`, `createdate`, `lastmodifieddate`, `hs_email_optout`, `city`, `state`, `zip`, `country`, `hs_is_deleted` |
| `hs_Companies` | 100 | `hs_object_id`, `name`, `domain`, `industry`, `city`, `state`, `numberofemployees`, `annualrevenue`, `lifecyclestage`, `createdate`, `lastmodifieddate`, `hs_is_deleted` |
| `hs_Deals` | 150 | `hs_object_id`, `dealname`, `amount`, `dealstage`, `closedate`, `pipeline`, `hubspot_owner_id`, `associated_company_id`, `associated_contact_id`, `createdate`, `lastmodifieddate`, `hs_is_deleted` |
| `hs_Owners` | 20 | `owner_id`, `email`, `firstname`, `lastname`, `userid`, `createdat`, `updatedat`, `archived` |

Data quality: realistic names/emails, dollar amounts $500–$250k, dates spread over 3 years. Acceptance: stored proc `EXEC MockHubSpot.dbo.sp_MockDataSummary` returns correct row counts.

**T1.2** — Create `MockSalesforce` database and seed data.

| Table | Rows | Key columns |
|-------|------|-------------|
| `sf_Contact` | 300 | `Id`, `FirstName`, `LastName`, `Email`, `Phone`, `AccountId`, `Title`, `Department`, `MailingCity`, `MailingState`, `MailingCountry`, `CreatedDate`, `LastModifiedDate`, `IsDeleted` |
| `sf_Account` | 100 | `Id`, `Name`, `Industry`, `Type`, `BillingCity`, `BillingState`, `NumberOfEmployees`, `AnnualRevenue`, `Phone`, `CreatedDate`, `LastModifiedDate`, `IsDeleted` |
| `sf_Opportunity` | 150 | `Id`, `Name`, `Amount`, `StageName`, `CloseDate`, `AccountId`, `OwnerId`, `Probability`, `Type`, `ForecastCategory`, `CreatedDate`, `LastModifiedDate`, `IsDeleted` |
| `sf_User` | 20 | `Id`, `FirstName`, `LastName`, `Email`, `Username`, `IsActive`, `Title`, `Department`, `CreatedDate` |

Referential integrity: every `sf_Contact.AccountId` and `sf_Opportunity.AccountId` must resolve to a `sf_Account.Id`. Acceptance: `EXEC MockSalesforce.dbo.sp_MockDataSummary` correct + FK check query returns 0 orphans.

**T1.3** — Create `MockYourMembership` database and seed data.

| Table | Rows | Key columns |
|-------|------|-------------|
| `ym_Members` | 300 | `member_id`, `email`, `first_name`, `last_name`, `membership_level_id`, `join_date`, `expiration_date`, `status` (Active/Expired/Pending), `phone`, `chapter_id`, `created_at`, `updated_at` |
| `ym_MembershipLevels` | 10 | `level_id`, `name`, `description`, `annual_fee`, `duration_months`, `is_active` |
| `ym_Events` | 50 | `event_id`, `title`, `description`, `start_date`, `end_date`, `location`, `max_capacity`, `current_capacity`, `status`, `chapter_id`, `created_at` |
| `ym_EventRegistrations` | 200 | `registration_id`, `event_id`, `member_id`, `registration_date`, `status`, `amount_paid`, `created_at` |
| `ym_Chapters` | 15 | `chapter_id`, `name`, `description`, `state`, `is_active`, `created_at` |

Acceptance: `EXEC MockYourMembership.dbo.sp_MockDataSummary` correct + zero orphan registrations.

---

### 16.4 Phase 2 — Database Schema (Migrations)

**T2.1** — Migration for `MJ: Integration Source Types`.
- File: `migrations/v2/V[timestamp]__v2.x_Integration_Source_Types.sql`
- Creates `__mj.IntegrationSourceType` per Section 6.2 field spec
- Seeds 3 rows: `SaaS API` / `SaaSAPIConnector`, `Relational Database` / `RelationalDBConnector`, `File Feed` / `FileFeedConnector`
- Run `mj migrate`, then CodeGen
- Acceptance: `sqlq "SELECT Name, DriverClass FROM __mj.IntegrationSourceType"` returns 3 rows; `CompanyIntegrationSourceTypeEntity` exists in generated entity subclasses and compiles

**T2.2** — Migration for `MJ: Company Integration Entity Maps`.
- Creates `__mj.CompanyIntegrationEntityMap` per Section 6.2
- FK to `__mj.CompanyIntegration(ID)` and `__mj.Entity(ID)`
- Run migrate + CodeGen
- Acceptance: Table exists; `CompanyIntegrationEntityMapEntity` in entity_subclasses compiles

**T2.3** — Migration for `MJ: Company Integration Field Maps`.
- Creates `__mj.CompanyIntegrationFieldMap` per Section 6.3
- FK to `__mj.CompanyIntegrationEntityMap(ID)`
- Run migrate + CodeGen
- Acceptance: Table + `CompanyIntegrationFieldMapEntity` compiles

**T2.4** — Migration for `MJ: Company Integration Sync Watermarks`.
- Creates `__mj.CompanyIntegrationSyncWatermark` per Section 6.4
- FK to `__mj.CompanyIntegrationEntityMap(ID)`
- Run migrate + CodeGen
- Acceptance: Table + `CompanyIntegrationSyncWatermarkEntity` compiles

**T2.5** — Migration: add `SourceTypeID` FK to `CompanyIntegration`.
- `ALTER TABLE __mj.CompanyIntegration ADD SourceTypeID UNIQUEIDENTIFIER NULL`
- FK constraint to `__mj.IntegrationSourceType(ID)`
- Run migrate + CodeGen
- Acceptance: Column on `CompanyIntegrationEntity`, nullable, existing rows unaffected

**T2.6** — Verify full build after all migrations.
- `npm run build` on `packages/MJCoreEntities`
- Fix any CodeGen output issues
- Commit: `feat(integration): add integration engine database schema migrations`
- Acceptance: Zero TypeScript errors; supervisor pushes commit to remote

---

### 16.5 Phase 3 — TypeScript Package Scaffold

**T3.1** — Create `packages/Integration/engine` package (`@memberjunction/integration-engine`).
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- `README.md`: purpose, package API summary, example usage
- Implement `src/types.ts`: all union types + `ExternalRecord`, `MappedRecord`, `SyncResult`, `SyncRecordError`, `DefaultFieldMapping` per Section 7.1
- `npm run build` green
- Acceptance: Package builds; types exported from index

**T3.2** — Implement `BaseIntegrationConnector` abstract class.
- Per Section 5.3: `TestConnection`, `DiscoverObjects`, `DiscoverFields`, `FetchChanges` abstract
- `GetDefaultFieldMappings` default returns `[]`
- Full TSDoc on every method (parameters, return value, purpose)
- Acceptance: `npm run build` green; abstract class exported

**T3.3** — Implement `ConnectorFactory`.
- Per Section 7.2
- Unit test (Vitest): register a mock connector class, `ConnectorFactory.Resolve` returns it correctly; throws on unknown driver class
- Acceptance: `npm run test` green

**T3.4** — Implement `FieldMappingEngine` + all transform types.
- `transforms.ts` interfaces per Section 8.2
- `FieldMappingEngine.Apply(records, fieldMaps)` executes pipeline per field map
- Each transform: `direct`, `regex`, `split`, `combine`, `lookup`, `format`, `substring`, `coerce`, `custom` (sandboxed via `vm.runInNewContext`)
- Unit tests: one test per transform type with real input/output assertion
- Acceptance: All transform unit tests pass

**T3.5** — Implement `MatchEngine`.
- Resolves each `MappedRecord` via `RunView` with key field filters + `CompanyIntegrationRecordMap` lookup
- Returns Create/Update/Skip decision per record
- Unit tests with mocked `RunView`: verify correct decisions for new, existing, and deleted records
- Acceptance: All unit tests pass

**T3.6** — Implement `WatermarkService`.
- `Load` and `Update` methods per Section 9.4
- Unit tests mock entity save; verify `Save()` called with correct watermark value
- Acceptance: All unit tests pass

**T3.7** — Implement `IntegrationOrchestrator`.
- Full run lifecycle per Section 7.3
- Per-record error isolation: catch, log to `RunDetail.Details` JSON, continue
- Integration test using a mock connector returning 5 fake `ExternalRecord`s:
  - Writes records to `MJ_Workbench` Contacts entity
  - Creates `CompanyIntegrationRun` with `Status=Completed`
  - Updates watermark
- Acceptance: Integration test passes; `CompanyIntegrationRun.Status = 'Completed'`

**T3.8** — Create `packages/Integration/ui-types` package (`@memberjunction/integration-ui-types`).
- `IntegrationSummary`, `RunStatusSummary`, `ConnectorHealth` view model types
- No Node/SQL dependencies (Angular-safe)
- `README.md` explaining which types to use where
- Acceptance: `npm run build` green

**T3.9** — Commit Phase 3.
- `feat(integration): implement engine package with orchestrator, field mapping, and match engine`
- Acceptance: Supervisor pushes commit; `npm run test` in `integration-engine` all green

---

### 16.6 Phase 4 — HubSpot Mock Connector

**T4.1** — Create `packages/Integration/connectors` package (`@memberjunction/integration-connectors`).
- Depends on `@memberjunction/integration-engine`
- `README.md`: lists all connectors, explains mock DB pattern, documents how to swap for real APIs
- Acceptance: Empty package builds clean

**T4.2** — Seed `CompanyIntegration` records for HubSpot mock.
- `Integration` row: Name=`HubSpot`, SourceTypeID pointing to `SaaS API` source type row
- `CompanyIntegration` row: Name=`HubSpot (Mock)`, Configuration=`{"server":"sql-claude","database":"MockHubSpot"}`
- Acceptance: Rows in `MJ_Workbench`; visible in MJ Explorer

**T4.3** — Implement `HubSpotConnector`.
- `@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')`
- `TestConnection`: `SELECT 1` against `MockHubSpot`
- `DiscoverObjects`: returns the 3 `hs_*` table names with labels
- `DiscoverFields(objectName)`: reads `INFORMATION_SCHEMA.COLUMNS` from `MockHubSpot`
- `FetchChanges(ctx)`: `SELECT * FROM MockHubSpot.dbo.[objectName] WHERE lastmodifieddate > @watermark ORDER BY lastmodifieddate` with batch limit; maps rows to `ExternalRecord[]`
- `GetDefaultFieldMappings('hs_Contacts', 'Contacts')`: returns suggestions mapping `email→Email`, `firstname→FirstName`, `lastname→LastName`, `phone→Phone`, `company→CompanyName`, `lifecyclestage→Status`
- Full TSDoc on all methods
- Unit tests: first fetch (no watermark) returns 300 contacts; second fetch (watermark = now) returns 0
- Acceptance: Unit tests pass

**T4.4** — Create entity maps + field maps for HubSpot mock.
- `hs_Contacts` → MJ `Contacts` entity (or closest available), field maps from `GetDefaultFieldMappings`
- `hs_Companies` → MJ `Companies` entity, field maps
- Acceptance: Rows in entity map + field map tables

**T4.5** — Run first HubSpot mock sync end-to-end.
- Call `IntegrationOrchestrator.RunSync` for HubSpot mock `CompanyIntegration`
- Acceptance: `CompanyIntegrationRun.Status = 'Completed'`; RunDetails show `RecordsCreated > 0`; `CompanyIntegrationRecordMap` has entries; watermark updated

**T4.6** — Commit Phase 4.
- `feat(integration): add HubSpot mock connector with end-to-end sync`

---

### 16.7 Phase 5 — Salesforce Mock Connector

**T5.1** — Implement `SalesforceConnector`.
- `@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')`
- Reads from `MockSalesforce`: `sf_Contact`, `sf_Account`, `sf_Opportunity`
- Incremental: `WHERE LastModifiedDate > @watermark`
- `GetDefaultFieldMappings('sf_Contact', 'Contacts')`: `Email→Email`, `FirstName→FirstName`, `LastName→LastName`, `Phone→Phone`, `Title→Title`, `Department→Department`
- Unit tests: 300 contacts on first fetch; watermark advance reduces count
- Acceptance: Unit tests pass

**T5.2** — Seed `CompanyIntegration` records + entity maps for Salesforce mock.
- Acceptance: Rows present; MJ Explorer shows Salesforce integration

**T5.3** — Run first Salesforce mock sync end-to-end.
- Acceptance: `CompanyIntegrationRun.Status = 'Completed'`; records created; watermark updated

**T5.4** — Commit Phase 5.
- `feat(integration): add Salesforce mock connector with end-to-end sync`

---

### 16.8 Phase 6 — YourMembership Mock Connector

**T6.1** — Implement `YourMembershipConnector`.
- `@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')`
- Reads from `MockYourMembership`: `ym_Members`, `ym_Events`, `ym_EventRegistrations`
- Incremental on `updated_at` / `created_at`
- `GetDefaultFieldMappings('ym_Members', 'Contacts')`: `email→Email`, `first_name→FirstName`, `last_name→LastName`, `phone→Phone`, `status→Status`, `join_date→JoinDate`
- Unit tests: 300 members on first fetch
- Acceptance: Unit tests pass

**T6.2** — Seed `CompanyIntegration` + entity maps.
- Acceptance: Rows present

**T6.3** — Run first YourMembership mock sync end-to-end.
- Acceptance: `CompanyIntegrationRun.Status = 'Completed'`; records created

**T6.4** — Commit Phase 6.
- `feat(integration): add YourMembership mock connector with end-to-end sync`

---

### 16.9 Phase 7 — File Feed Connector

**T7.1** — Implement `FileFeedConnector`.
- `@RegisterClass(BaseIntegrationConnector, 'FileFeedConnector')`
- Uses `@memberjunction/storage` to read file from `CompanyIntegration.Configuration.StoragePath`
- `DiscoverObjects`: returns file/sheet names
- `FetchChanges`: parses CSV (header row → field names) or Excel (sheet selector from `EntityMap.ExternalObjectName`); returns `ExternalRecord[]`
- Watermark on file last-modified timestamp or content hash
- Unit test: 100-row CSV returns correct ExternalRecord array
- Acceptance: Unit tests pass

**T7.2** — Create sample 100-row CSV mock file and `CompanyIntegration` record.
- CSV: `first_name,last_name,email,phone,company`
- Store in `/workspace/MJ/packages/Integration/connectors/test-fixtures/sample-contacts.csv`
- `CompanyIntegration`: Name=`CSV Import (Sample)`, SourceTypeID=`File Feed`
- Run sync end-to-end
- Acceptance: `CompanyIntegrationRun.Status = 'Completed'`; 100 records created

**T7.3** — Commit Phase 7.
- `feat(integration): add File Feed connector (CSV/Excel) via MJ Storage`

---

### 16.10 Phase 8 — Angular UI: Control Tower

**T8.1** — Create Integration Dashboard module scaffold.
- New Angular module in `packages/Angular/Explorer/dashboards/src/lib/integration/`
- `IntegrationControlTowerComponent` registered with `@RegisterClass(BaseResourceComponent, 'IntegrationControlTower')`
- `LoadIntegrationDashboard()` tree-shaking prevention function exported from `public-api.ts`
- Module added to dashboards barrel and `app.module.ts` bootstrap
- `README.md` in the module folder
- Acceptance: Component navigable in MJ Explorer (blank page is fine at this step)

**T8.2** — Implement integration health cards.
- Batch-load all `CompanyIntegration` + most recent `CompanyIntegrationRun` per integration with one `RunViews` call
- Card per integration: name, source type icon (Font Awesome), last run time (relative), status chip (green=Completed, amber=stale >24h, red=Failed), records synced count
- Use `<mj-loading>` during data fetch
- Acceptance: Playwright screenshot shows 4 cards (HubSpot, Salesforce, YourMembership, CSV Import)

**T8.3** — Implement "Run Now" button with live status polling.
- "Run Now" per card → calls `RunIntegrationSync` action
- Polls `CompanyIntegrationRun.Status` every 3 seconds until terminal state
- Card status chip animates during Running; updates to Completed/Failed on finish
- Acceptance: Playwright test: click Run Now → card shows Running → then Completed

**T8.4** — Implement run history expandable rows.
- Click card → expand run history (last 10 runs, paginated)
- Click a run row → drill down showing per-entity-map record counts and any errors
- Acceptance: Playwright: expand HubSpot card → run history visible with at least 1 row; click row → run detail shows entity maps

---

### 16.11 Phase 9 — Angular UI: Connection Studio

**T9.1** — Create `IntegrationConnectionStudioComponent` wizard.
- Step 1: Source type selection (loads `MJ: Integration Source Types` as icon cards)
- Step 2: Configuration form — fields differ by selected source type:
  - SaaS API: Name, Description, API Base URL, API Key hint
  - Relational Database: Name, Server, Database Name, Username, Password
  - File Feed: Name, Storage Path, File Type (CSV/Excel)
- Step 3: Test connection → Save
- `README.md` for the wizard
- Acceptance: Playwright screenshot shows 3 source type cards in step 1

**T9.2** — Implement Test Connection flow.
- Calls `connector.TestConnection()` via a new `TestIntegrationConnection` action
- Shows success (green check, message) or failure (red, error detail)
- "Save" button only enabled after successful test
- On Save: creates `CompanyIntegration` + `SourceTypeID` record
- Acceptance: Playwright: select Relational Database → fill MockSalesforce connection details → Test → sees "Connection successful"

---

### 16.12 Phase 10 — Angular UI: Mapping & Activity Workspace

**T10.1** — Create `IntegrationMappingWorkspaceComponent` layout.
- Left panel (25%): integration selector + entity map list
- Center panel (50%): field mapping editor for selected entity map
- Right panel (25%): run detail drill-down
- `README.md` for the workspace
- Acceptance: Layout renders without errors; Playwright screenshot shows 3-column layout

**T10.2** — Implement entity map list panel.
- Loads `CompanyIntegrationEntityMap` for selected integration
- Enable/disable toggle per entity map (updates `SyncEnabled`)
- "Add Entity Map" button → dialog: source object picker (calls `DiscoverObjects`), MJ entity picker, conflict resolution selector
- Acceptance: Playwright: select HubSpot Mock → see Contacts and Companies entity maps with toggles

**T10.3** — Implement field mapping grid.
- Select entity map → load field maps in a Kendo Grid
- Source field dropdown from `DiscoverFields`; destination dropdown from MJ entity fields
- Transform type selector (dropdown) per row; transform config panel slides in on select
- "Apply Suggestions" button runs `GetDefaultFieldMappings` and populates empty rows
- Inline save per row
- Acceptance: Playwright: click Contacts entity map → grid loads ≥5 pre-mapped rows; transform dropdown works

**T10.4** — Implement run detail panel.
- Shows last `CompanyIntegrationRunDetail` for selected entity map
- Records created/updated/errored counters
- Watermark before/after
- Per-record error table (ExternalID, error message) if any errors
- Acceptance: After a completed sync, Playwright: select entity map → right panel shows record counts and watermark values

**T10.5** — Commit Phase 8–10.
- `feat(integration): add Angular UI (Control Tower, Connection Studio, Mapping Workspace)`
- Acceptance: `npm run build` for MJExplorer zero errors; supervisor pushes commit

---

### 16.13 Phase 11 — End-to-End Playwright Tests

> All tests run headless inside the Docker workbench. Auth0 login uses `da-robot-tester@bluecypress.io` / `!!SoDamnSecureItHurt$`. Screenshots saved to `/workspace/e2e-screenshots/integration/`.

**T11.1** — Auth0 login test.
- Open `http://localhost:4200`
- Snapshot → find Login button → click
- Auth0 redirect → fill email + password → submit
- Wait for app shell to load
- Verify nav bar present, zero console errors
- Screenshot: `integration-01-login.png`
- Acceptance: PASS

**T11.2** — Control Tower navigation test.
- Navigate to Integration section (Control Tower)
- Verify 4 integration cards present (HubSpot, Salesforce, YourMembership, CSV)
- Each card shows a last-run timestamp and status chip
- Screenshot: `integration-02-control-tower.png`
- Acceptance: PASS; zero JS console errors

**T11.3** — Manual sync trigger test.
- Click "Run Now" on HubSpot Mock card
- Wait for status to change Running → Completed (max 60 seconds)
- Verify `RecordsProcessed > 0` shown on card
- Screenshot: `integration-03-sync-complete.png`
- Acceptance: PASS; run history row added under HubSpot card

**T11.4** — Run history drill-down test.
- Expand HubSpot Mock card → see run history
- Click most recent run → see per-entity-map counters
- Verify RecordsCreated shown for at least one entity map
- Screenshot: `integration-04-run-detail.png`
- Acceptance: PASS

**T11.5** — Connection Studio smoke test.
- Navigate to Connection Studio
- Verify 3 source type cards visible
- Select "Relational Database" → fill MockSalesforce connection (server=sql-claude, db=MockSalesforce, user=sa, password=Claude2Sql99)
- Click Test Connection → see "Connection successful"
- Screenshot: `integration-05-connection-test.png`
- Acceptance: PASS

**T11.6** — Mapping Workspace test.
- Navigate to Mapping Workspace
- Select HubSpot Mock integration
- Select Contacts entity map
- Verify field mapping grid shows ≥5 rows
- Change one transform type via dropdown
- Save inline
- Screenshot: `integration-06-field-maps.png`
- Acceptance: PASS; row saved without error

**T11.7** — Full three-source regression run.
- Trigger RunSync for HubSpot, Salesforce, and YourMembership in sequence
- For each: verify `CompanyIntegrationRun.Status = 'Completed'`, watermark not null
- Check MJ entity record counts match expected (Contacts should have ≥300 records after 3 sources)
- Screenshot: `integration-07-regression-complete.png`
- Acceptance: All 3 PASS; zero Failed runs; zero JS console errors throughout

**T11.8** — Commit Phase 11 + PR.
- `test(integration): add end-to-end Playwright tests for integration engine UI`
- Open PR targeting `next`:
  - Title: `feat: Integration Engine with mock SaaS, DB, and file connectors`
  - Body summarizes all phases completed, links to E2E screenshots
- Acceptance: PR open; all CI checks green; supervisor verifies final state

---

### 16.14 Completion Gate

The build is **done** when ALL of the following are true:

1. `MockHubSpot`, `MockSalesforce`, `MockYourMembership` databases exist with correct row counts verified by summary procs.
2. All 5 migrations applied cleanly; CodeGen produces compiling entity classes for all 4 new entities.
3. `npm run build` passes for `integration-engine` and `integration-connectors` packages.
4. All unit tests (Vitest) pass with zero failures across both packages.
5. All 3 mock connectors produce correct `ExternalRecord[]` output verified by unit tests.
6. All 4 end-to-end sync runs (HubSpot, Salesforce, YourMembership, CSV) complete with `Status=Completed`.
7. Angular UI compiles with zero TypeScript errors; no `any` types introduced.
8. All 7 Playwright tests PASS with screenshots saved.
9. Every new package and component has a `README.md` and full TSDoc coverage.
10. PR `claude/integration-engine-build → next` is open and passing CI.

---

## 17. Success Criteria

1. Existing integrations continue to run unchanged after all migrations.
2. New source types can be added as packages with zero engine changes.
3. One orchestration model handles SaaS API, relational DB, and file sources.
4. Run history, record maps, and audit lineage remain intact.
5. File operations work against any MJ Storage provider (not just local disk).
6. Initial production rollout can be phased safely without migration shock.
7. Mock connectors are clearly documented and trivially swappable for real API implementations.
