# Architecture Overview

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Metadata-driven** | Everything configurable through entities, not code |
| **Provider-agnostic** | The engine works the same regardless of external system |
| **Composable transforms** | Field mappings support a pipeline of chainable transform steps |
| **Incremental sync** | Watermark-based delta detection avoids full-table scans |
| **Observable** | Every sync run produces a detailed audit trail (Run → RunDetails) |
| **Multi-tenant aware** | CompanyIntegration isolates credentials and mappings per subsidiary |
| **Fail-safe** | Individual record failures don't abort the run; they're logged and sync continues |
| **File-emission-only** | Schema Builder produces files (SQL, JSON, metadata) — never executes DDL at runtime. MJAPI runs as a lower-privilege DB user that cannot CREATE SCHEMA/TABLE |
| **Migration-first** | Every DDL change produces a Flyway migration file under version control |
| **CodeGen owns metadata** | Entity, EntityField, views, SPs, triggers, timestamps, and FK indexes are all created by CodeGen after migration — Schema Builder never creates metadata records |

## Integration Scenarios

The framework supports three mapping scenarios, often mixed within a single integration:

### Scenario A: Map to Existing Entities

```
Source: HubSpot Contacts  →  MJ: Contacts (already exists)
       HubSpot Companies  →  MJ: Companies (already exists)
```

User selects existing MJ entities in the Mapping Workspace. EntityMap + FieldMap records are created. No DDL needed.

### Scenario B: Create New Entities from Source

```
Source: HubSpot Deals         →  MJ: ??? (no entity exists)
       Custom CRM Pipeline    →  MJ: ??? (no entity exists)
```

System introspects the source schema, user configures target table/schema names, Schema Builder **emits files only** (migration SQL, additionalSchemaInfo, metadata JSON). CI/CD pipeline applies migrations, runs CodeGen, pushes metadata, and restarts MJAPI.

### Scenario C: Map to MJ Core Entities (with Access Control)

```
Source: HubSpot Tags  →  MJ: __mj.Tags (core MJ entity, allowed via EntitySetting)
```

Some source objects should write into existing MJ core entities. An `IntegrationWriteAllowed` EntitySetting controls which `__mj` entities permit integration writes. System entities (Entity, EntityField, Users, Roles) are always blocked.

Most real integrations are **hybrid** — some objects map to existing entities, others need new ones, and some write into allowed MJ core entities.

## System Design

The integration framework is organized into six packages, a GraphQL resolver, a client-side GraphQL wrapper, and an Angular dashboard. Each layer has a clear responsibility boundary:

```
┌─────────────────────────────────────────────────────────┐
│                    Angular Dashboard                     │
│  Control Tower │ Connection Studio │ Mapping │ Activity  │
├─────────────────────────────────────────────────────────┤
│              IntegrationDataService                      │
│         GraphQLIntegrationClient (discovery)             │
├─────────────────────────────────────────────────────────┤
│                    GraphQL API                           │
│  IntegrationDiscoveryResolver (discover/test/preview)    │
├─────────────────────────────────────────────────────────┤
│              Integration Engine (core)                   │
│  Orchestrator │ FieldMapping │ Match │ Watermark │ Retry │
├─────────────────────────────────────────────────────────┤
│              Connector Layer                             │
│  HubSpot │ Salesforce │ YourMembership │ FileFeed │ DB   │
├─────────────────────────────────────────────────────────┤
│              Schema Builder                              │
│  DDLGenerator │ TypeMapper │ Evolution │ MetadataEmitter  │
├─────────────────────────────────────────────────────────┤
│          MJ Action (scheduling/triggers)                 │
│              RunSyncAction                               │
└─────────────────────────────────────────────────────────┘
```

## Package Responsibilities

### `@memberjunction/integration-engine`

The core package. Contains:

- **IntegrationOrchestrator** — Top-level sync coordinator. Loads configuration, resolves the connector, drives the fetch-map-match-write loop, tracks progress, handles errors.
- **BaseIntegrationConnector** — Abstract class that all connectors must extend. Defines the 4 required methods plus 2 optional ones.
- **ConnectorFactory** — Resolves connector instances from `Integration.ClassName` via `MJGlobal.ClassFactory`.
- **FieldMappingEngine** — Applies field mappings and transform pipelines to convert external records into MJ entity format.
- **MatchEngine** — Determines whether each record is a Create, Update, Delete, or Skip by checking key fields and the RecordMap table.
- **WatermarkService** — Manages incremental sync state (timestamp, cursor, or version token) per entity map.
- **RetryRunner** — Provides `WithRetry()` and `WithTimeout()` utilities with exponential backoff.
- **Type definitions** — `SyncResult`, `SyncProgress`, `SyncNotification`, `FetchContext`, `FetchBatchResult`, `MappedRecord`, error classification types.

### `@memberjunction/integration-connectors`

Concrete connector implementations:

| Connector | Base Class | External System |
|-----------|-----------|-----------------|
| `HubSpotConnector` | `RelationalDBConnector` | HubSpot CRM (mock SQL tables) |
| `SalesforceConnector` | `BaseIntegrationConnector` | Salesforce CRM (REST API) |
| `YourMembershipConnector` | `BaseIntegrationConnector` | YourMembership AMS (REST API) |
| `FileFeedConnector` | `BaseIntegrationConnector` | CSV/Excel/JSON/XML files |
| `RelationalDBConnector` | `BaseIntegrationConnector` | SQL Server (abstract base for DB connectors) |

### `@memberjunction/integration-actions`

MJ Action wrapper:

- **RunSyncAction** — Registered as `'Run Integration Sync'`. Accepts `CompanyIntegrationID`, `TriggerType`, `FullSync`, `EntityMapIDs` parameters. Calls `IntegrationOrchestrator.RunSync()` and returns structured results.

### `@memberjunction/integration-schema-builder`

DDL and metadata generation (file emission only — never executes SQL):

- **SchemaBuilder** — Orchestrates the full generation pipeline
- **DDLGenerator** — CREATE TABLE / ALTER TABLE SQL for SQL Server and PostgreSQL
- **TypeMapper** — Generic→SQL type conversion (string→NVARCHAR, integer→INT, etc.)
- **SchemaEvolution** — Detects schema diffs and generates ALTER statements
- **MigrationFileWriter** — Produces Flyway-compatible migration file names
- **SoftFKConfigEmitter** — Manages additionalSchemaInfo.json for CodeGen FK awareness
- **MetadataEmitter** — Generates mj-sync JSON files for entity settings
- **AccessControl** — Prevents writes to system entities (Users, Roles, Entities, etc.)

### `@memberjunction/integration-ui-types`

Lightweight, Angular-safe type definitions:

- `IntegrationSummary`, `RunStatusSummary`, `EntityMapSummary`, `IntegrationDashboardStats`, `ConnectorHealth`

No dependencies on engine or connectors — safe to import in Angular.

### `IntegrationDiscoveryResolver` (in MJServer)

GraphQL API for connector discovery:

| Query | Purpose |
|-------|---------|
| `IntegrationDiscoverObjects` | List external objects/tables |
| `IntegrationDiscoverFields` | List fields on an object |
| `IntegrationTestConnection` | Test connectivity |
| `IntegrationSchemaPreview` | Generate DDL preview |

### `GraphQLIntegrationClient` (in GraphQLDataProvider)

Client-side wrapper for the discovery queries. Used by the Angular dashboard.

## Entity Data Model

```
┌──────────────────────┐
│   Integration        │──── General definition (HubSpot, Salesforce, etc.)
│   ClassName          │     Points to registered connector class
│   IntegrationSource  │──── FK to IntegrationSourceType
│   TypeID             │
└──────────┬───────────┘
           │
           │ 1:N
           ▼
┌──────────────────────────┐
│   CompanyIntegration     │──── Instance for a specific company
│   IntegrationID          │     Links to Integration
│   CredentialID           │     Links to credential for auth
│   IsActive               │
└──────────┬───────────────┘
           │
           │ 1:N
           ▼
┌──────────────────────────────────┐
│   CompanyIntegrationEntityMap    │──── Maps external object → MJ entity
│   ExternalObjectName             │     e.g., "contacts" → "Contacts"
│   EntityID                       │
│   SyncDirection                  │     Inbound, Outbound, Bidirectional
│   ConflictResolution             │     SourceWins, DestWins, Manual
│   DeleteBehavior                 │     SoftDelete, HardDelete, Skip
└──────────┬───────────────────────┘
           │
           │ 1:N                          1:1
           ▼                              ▼
┌────────────────────────────┐  ┌─────────────────────────────────┐
│ CompanyIntegrationFieldMap │  │ CompanyIntegrationSyncWatermark  │
│ SourceFieldName            │  │ WatermarkValue                   │
│ DestinationFieldName       │  │ WatermarkType (timestamp/cursor) │
│ TransformPipeline (JSON)   │  └─────────────────────────────────┘
└────────────────────────────┘

           CompanyIntegration
           │
           │ 1:N
           ▼
┌──────────────────────────────┐
│   CompanyIntegrationRun      │──── Audit trail of each sync execution
│   StartedAt, EndedAt         │
│   Status, TriggerType        │
│   RecordsProcessed/Created/  │
│   Updated/Deleted/Errored    │
└──────────┬───────────────────┘
           │
           │ 1:N
           ▼
┌──────────────────────────────────┐
│ CompanyIntegrationRunDetail      │──── Per-entity stats within a run
│ EntityMapID                      │
│ RecordsProcessed/Created/etc.    │
│ ErrorJSON                        │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ CompanyIntegrationRecordMap      │──── External ID ↔ MJ record ID mapping
│ CompanyIntegrationID             │     Prevents duplicates across syncs
│ ExternalRecordID                 │
│ EntityID, EntityRecordID         │
└──────────────────────────────────┘

┌──────────────────────────┐
│ IntegrationSourceType    │──── General category (NOT per-vendor)
│ Name (SaaS API, DB, File)│
│ DriverClass              │     Base connector class name
│ IconClass                │
└──────────────────────────┘
```

## Data Flow: Sync Execution

```
1. Trigger (Manual / Scheduled / Webhook)
       │
2. IntegrationOrchestrator.RunSync()
       │
3. LoadRunConfiguration()
   ├── Load CompanyIntegration
   ├── Load EntityMaps (active, ordered by priority)
   └── Load Integration → ConnectorFactory.Resolve(integration)
       │
4. CreateRunRecord() → CompanyIntegrationRun
       │
5. For each EntityMap:
   │
   ├── WatermarkService.Load() → get last sync position
   │
   ├── Connector.FetchChanges(context) → batched records
   │   └── Repeat while HasMore
   │
   ├── FieldMappingEngine.Apply(records, fieldMaps)
   │   └── Transform pipeline for each field
   │
   ├── MatchEngine.Resolve(mappedRecords)
   │   ├── Key field matching (SQL filter)
   │   ├── RecordMap lookup
   │   └── Conflict resolution → Create/Update/Delete/Skip
   │
   ├── Write to MJ entities (Save/Delete)
   │   └── WithRetry() for transient failures
   │
   ├── Update RecordMap entries
   │
   ├── WatermarkService.Update() → save new position
   │
   └── Create RunDetail record
       │
6. FinalizeRun() → update Run status, emit SyncNotification
```

## Connector Resolution

The `ConnectorFactory` resolves connectors using a simple, direct pattern:

1. Read `Integration.ClassName` (e.g., `"YourMembershipConnector"`)
2. Look up `MJGlobal.ClassFactory.GetRegistration(BaseIntegrationConnector, className)`
3. Create instance via `ClassFactory.CreateInstance()`

Connectors register themselves with `@RegisterClass(BaseIntegrationConnector, 'ClassName')`.

**IntegrationSourceType** is a general category (SaaS API, Relational Database, File Feed) — it is NOT used for connector resolution. The vendor-specific class name lives on the `Integration` entity.

## Tree-Shaking Prevention

Connector classes use `@RegisterClass` decorators which are invisible to ESBuild/Vite tree-shaking. To ensure connectors are loaded at runtime:

1. `@memberjunction/integration-connectors` is a dependency of `@memberjunction/server-bootstrap`
2. The manifest generator (`mj codegen manifest`) scans for `@RegisterClass` decorators and generates static imports
3. The pre-built manifest in `server-bootstrap` includes all `@memberjunction/*` connector classes

## CI/CD Pipeline: From Artifacts to Running System

When new integration tables are created (Scenario B), the Schema Builder emits three categories of artifacts that flow through a 4-step CI/CD pipeline:

```
Schema Builder Output              CI/CD Step
─────────────────────              ──────────
Migration .sql files       ──→    1. Flyway migrate (elevated DB credentials)
additionalSchemaInfo JSON  ──→    2. CodeGen (entity classes, views, SPs, soft FKs)
/metadata/ JSON files      ──→    3. mj-sync push (EntitySettings, field decorations)
                                   4. MJAPI restart (loads generated TypeScript classes)
```

### Step 1: Flyway migrate

Runs with DBA-level credentials (not available to MJAPI at runtime):
- Creates schemas (`CREATE SCHEMA IF NOT EXISTS`)
- Creates tables (`CREATE TABLE`)
- Applies ALTER TABLE for evolution scenarios

### Step 2: CodeGen

Discovers new tables via `INFORMATION_SCHEMA` and generates:
- `Entity` and `EntityField` records in metadata tables
- Soft FK metadata from `additionalSchemaInfo` (`RelatedEntityID`, `RelatedEntityFieldName`, `IsSoftForeignKey=1`)
- Views (`vwHubSpotDeal`), stored procedures (`spCreate*`, `spUpdate*`, `spDelete*`)
- `__mj_CreatedAt` / `__mj_UpdatedAt` columns with triggers
- FK indexes (`IDX_AUTO_MJ_FKEY_*`)
- TypeScript entity classes with Zod schemas
- Angular form components

### Step 3: mj-sync push

Applies metadata that doesn't go through CodeGen:
- EntitySettings (`IntegrationWriteAllowed`) for access control
- Entity field decorations emitted by Schema Builder
- Uses `@lookup:` references — no hardcoded UUIDs

### Step 4: MJAPI restart

- Loads newly generated TypeScript entity subclasses
- Refreshes metadata cache
- New entities become available via GraphQL API

### Environment Matrix

| Environment | Who Triggers | Notes |
|-------------|-------------|-------|
| **Local dev** | Developer manually runs steps 1-4 | Can use `flyway migrate` locally or apply SQL manually |
| **Staging** | CI/CD on merge to `next` | Fully automated |
| **Production** | CI/CD on release tag | Fully automated, same pipeline |

## Post-Deploy: Runtime Without Restart

If an MJAPI restart is not immediately feasible (e.g., zero-downtime requirement), the integration sync engine can still operate. After CodeGen has run, entity metadata, views, and SPs exist in the database — but MJAPI hasn't loaded the generated TypeScript subclass. The engine uses `BaseEntity` with generic `Get()`/`Set()` field access, which provides full CRUD capability without typed properties. The sync engine doesn't need typed accessors — it maps fields dynamically from source data.

After the next MJAPI restart, the generated subclass loads and typed access, Zod validation, and Angular forms become available.
