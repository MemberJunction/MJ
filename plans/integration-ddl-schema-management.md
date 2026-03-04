# Integration DDL & Schema Management Plan

> **Status**: Draft — Pending Review
> **Date**: March 4, 2026
> **Depends On**: [Integration Engine Architecture](integration-engine-architecture.md)
> **Branch**: `claude/study-integration-architecture-qW5p1`

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Two Integration Scenarios](#2-two-integration-scenarios)
3. [Design Principles](#3-design-principles)
4. [Schema Provisioning Architecture](#4-schema-provisioning-architecture)
5. [Source Schema Introspection](#5-source-schema-introspection)
6. [DDL Generation Engine](#6-ddl-generation-engine)
7. [Migration File Generation](#7-migration-file-generation)
8. [Entity Metadata Registration](#8-entity-metadata-registration)
9. [CodeGen Integration](#9-codegen-integration)
10. [Schema Evolution (Modify Integration)](#10-schema-evolution-modify-integration)
11. [Source Control & CI/CD Integration](#11-source-control--cicd-integration)
12. [UI Workflow](#12-ui-workflow)
13. [Safety & Rollback](#13-safety--rollback)
14. [Package Structure](#14-package-structure)
15. [Implementation Phases](#15-implementation-phases)

---

## 1. Problem Statement

When a user creates or modifies an integration, two scenarios exist:

**Scenario A — "Map to Existing"**: The destination MJ entities already exist. The user maps source objects/fields to existing MJ entities/fields. This is fully handled by `CompanyIntegrationEntityMap` and `CompanyIntegrationFieldMap` today.

**Scenario B — "Create from Source"**: The external source has objects (tables, API entities) that have **no corresponding MJ entity**. The system must:
1. Introspect the source system's schema
2. Generate DDL to create local tables
3. Execute the DDL against the MJ database
4. Register entity metadata so MJ "sees" the new entities
5. Run CodeGen to generate views, stored procedures, and TypeScript classes
6. Generate migration files for version control and CI/CD reproducibility

Scenario B is the focus of this document. It must be:
- **Automated** — minimal manual SQL writing
- **Reversible** — schema changes can be rolled back
- **Versioned** — all DDL lives in migration files under source control
- **CI/CD-friendly** — migrations apply cleanly in other environments
- **Safe** — never drops data without explicit user confirmation

---

## 2. Two Integration Scenarios

### Scenario A: Map to Existing Entities

```
Source: HubSpot Contacts  →  MJ: Contacts (already exists)
       HubSpot Companies  →  MJ: Companies (already exists)
```

- User selects existing MJ entities in the Mapping Workspace
- EntityMap + FieldMap records are created
- No DDL needed — sync engine uses existing entity infrastructure

### Scenario B: Create from Source (THIS PLAN)

```
Source: HubSpot Deals         →  MJ: ??? (no entity exists)
       HubSpot Line Items     →  MJ: ??? (no entity exists)
       Custom CRM Pipeline    →  MJ: ??? (no entity exists)
```

- User selects source objects that have no MJ counterpart
- System introspects source schema, proposes table structure
- User reviews/customizes the proposed schema
- System generates DDL, creates tables, registers metadata
- Generates migration file for reproducibility

### Hybrid: Some objects map, others create

Most real integrations are hybrid — some source objects map to existing MJ entities, others need new ones. The UI must support mixing both approaches per-object within a single integration setup.

---

## 3. Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Migration-first** | Every DDL change produces a Flyway migration file — never "just execute" DDL without a file |
| **Schema isolation** | New integration entities live in a dedicated schema (e.g., `hubspot`, `salesforce`) to avoid collision with core MJ tables |
| **CodeGen-compatible** | Generated tables follow MJ conventions so CodeGen can auto-generate views, SPs, entity classes |
| **Incremental** | Adding fields later produces ALTER TABLE migrations, not recreating tables |
| **Source-of-truth is metadata** | `CompanyIntegrationEntityMap` is the authoritative mapping — DDL is derived from it |
| **User-reviewable** | User always sees proposed DDL before execution |
| **Idempotent** | Running the same migration twice is safe (IF NOT EXISTS guards) |
| **Leverages Open App patterns** | Reuse `SchemaManager` from `@memberjunction/open-app-engine` for schema creation |

---

## 4. Schema Provisioning Architecture

### Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Source System    │────▶│  Schema Builder   │────▶│  MJ Database     │
│  (via Connector)  │     │  Service          │     │                  │
│                  │     │                  │     │  1. CREATE SCHEMA │
│  Schema metadata │     │  • Introspect     │     │  2. CREATE TABLE  │
│  • Tables        │     │  • Map types      │     │  3. Entity records│
│  • Columns       │     │  • Generate DDL   │     │  4. Field records │
│  • Types         │     │  • Create tables  │     │  5. CodeGen run   │
│  • Relationships │     │  • Register meta  │     │                  │
└──────────────────┘     │  • Emit migration │     └──────────────────┘
                         └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  Migration File   │
                         │  (Flyway .sql)    │
                         │                  │
                         │  Version-controlled│
                         │  CI/CD reproducible│
                         └──────────────────┘
```

### Key Components

1. **SourceSchemaIntrospector** — Queries source system for its schema (tables, columns, types, PKs, FKs)
2. **TypeMapper** — Converts source types to SQL Server/PostgreSQL types
3. **DDLGenerator** — Produces CREATE TABLE/ALTER TABLE SQL
4. **MigrationFileWriter** — Writes properly named Flyway migration files
5. **EntityRegistrar** — Creates Entity + EntityField metadata records
6. **SchemaBuilder** (orchestrator) — Coordinates the full flow

---

## 5. Source Schema Introspection

Each connector must implement a schema introspection interface:

```typescript
interface SourceSchemaInfo {
  Objects: SourceObjectInfo[];
}

interface SourceObjectInfo {
  /** Name in the source system (e.g., "deals", "line_items") */
  ExternalName: string;
  /** Human-readable label */
  ExternalLabel: string;
  /** Fields/columns in the source object */
  Fields: SourceFieldInfo[];
  /** Primary key field(s) */
  PrimaryKeyFields: string[];
  /** Foreign key relationships to other source objects */
  Relationships: SourceRelationshipInfo[];
}

interface SourceFieldInfo {
  /** Field name in the source */
  Name: string;
  /** Human-readable label */
  Label: string;
  /** Source system type (e.g., "string", "number", "datetime", "boolean") */
  SourceType: string;
  /** Whether the field is required */
  IsRequired: boolean;
  /** Maximum length for string types */
  MaxLength: number | null;
  /** Precision for numeric types */
  Precision: number | null;
  /** Scale for numeric types */
  Scale: number | null;
  /** Default value expression */
  DefaultValue: string | null;
  /** Whether this is a primary key */
  IsPrimaryKey: boolean;
  /** Whether this is a foreign key */
  IsForeignKey: boolean;
  /** If FK, which source object it references */
  ForeignKeyTarget: string | null;
}
```

### Connector Contract Extension

```typescript
// Added to BaseIntegrationConnector
abstract class BaseIntegrationConnector {
  // ... existing methods ...

  /**
   * Introspect the source system's schema.
   * Returns metadata about available objects and their fields.
   * Used by the Schema Builder to generate local DDL.
   */
  abstract IntrospectSchema(): Promise<SourceSchemaInfo>;
}
```

### Per-Connector Implementations

| Connector | Introspection Strategy |
|-----------|----------------------|
| **RelationalDB** | `INFORMATION_SCHEMA.TABLES` + `INFORMATION_SCHEMA.COLUMNS` — straightforward |
| **HubSpot** | `GET /crm/v3/schemas` API — returns object definitions |
| **Salesforce** | `describe` SOAP/REST API — returns SObject metadata |
| **YourMembership** | API docs + hardcoded schema (API doesn't expose metadata) |
| **FileFeed (CSV)** | Read header row + sample rows to infer types |
| **FileFeed (JSON)** | Parse sample records to infer schema |

---

## 6. DDL Generation Engine

### Type Mapping

The DDL generator maps source types to MJ-compatible SQL types:

```typescript
interface TypeMapping {
  SourceType: string;
  SqlServerType: string;
  PostgresType: string;
  MJFieldType: string;  // For EntityField.Type
}

// Example mappings
const TYPE_MAP: TypeMapping[] = [
  { SourceType: 'string',    SqlServerType: 'NVARCHAR',          PostgresType: 'VARCHAR',      MJFieldType: 'nvarchar' },
  { SourceType: 'text',      SqlServerType: 'NVARCHAR(MAX)',     PostgresType: 'TEXT',          MJFieldType: 'nvarchar' },
  { SourceType: 'integer',   SqlServerType: 'INT',               PostgresType: 'INTEGER',       MJFieldType: 'int' },
  { SourceType: 'bigint',    SqlServerType: 'BIGINT',            PostgresType: 'BIGINT',        MJFieldType: 'bigint' },
  { SourceType: 'decimal',   SqlServerType: 'DECIMAL(p,s)',      PostgresType: 'NUMERIC(p,s)',  MJFieldType: 'decimal' },
  { SourceType: 'boolean',   SqlServerType: 'BIT',               PostgresType: 'BOOLEAN',       MJFieldType: 'bit' },
  { SourceType: 'datetime',  SqlServerType: 'DATETIMEOFFSET',    PostgresType: 'TIMESTAMPTZ',   MJFieldType: 'datetimeoffset' },
  { SourceType: 'date',      SqlServerType: 'DATE',              PostgresType: 'DATE',          MJFieldType: 'date' },
  { SourceType: 'uuid',      SqlServerType: 'UNIQUEIDENTIFIER',  PostgresType: 'UUID',          MJFieldType: 'uniqueidentifier' },
  { SourceType: 'json',      SqlServerType: 'NVARCHAR(MAX)',     PostgresType: 'JSONB',         MJFieldType: 'nvarchar' },
];
```

### Table Naming Convention

Source objects are mapped to MJ table names with a consistent prefix:

```
Source: "deals" (HubSpot)
Schema: hubspot
Table:  hubspot.Deal

Source: "Account" (Salesforce)
Schema: salesforce
Table:  salesforce.Account
```

Rules:
- Schema name = lowercase integration source type name
- Table name = PascalCase singular form of source object name
- MJ Entity name = "{SourceType} {ObjectLabel}" (e.g., "HubSpot Deal", "Salesforce Account")

### Generated DDL Template

```sql
-- Auto-generated by MJ Integration Schema Builder
-- Source: HubSpot | Object: deals
-- Generated: 2026-03-04T20:30:00Z

CREATE SCHEMA [hubspot];

CREATE TABLE [hubspot].[Deal] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SourceRecordID NVARCHAR(255) NOT NULL,  -- External system's ID
    Name NVARCHAR(500) NULL,
    Amount DECIMAL(18,2) NULL,
    Stage NVARCHAR(255) NULL,
    CloseDate DATE NULL,
    OwnerEmail NVARCHAR(500) NULL,
    CompanySourceID NVARCHAR(255) NULL,     -- FK to source company
    SourceJSON NVARCHAR(MAX) NULL,          -- Raw source record for debugging
    SyncStatus NVARCHAR(50) NOT NULL DEFAULT 'Active',
    LastSyncedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_HubSpot_Deal PRIMARY KEY (ID),
    CONSTRAINT UQ_HubSpot_Deal_SourceRecordID UNIQUE (SourceRecordID)
);
-- NOTE: __mj_CreatedAt, __mj_UpdatedAt, and FK indexes are added by CodeGen
```

### Standard Columns Added Automatically

Every generated table includes:

| Column | Type | Purpose |
|--------|------|---------|
| `ID` | `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` | MJ primary key |
| `SourceRecordID` | `NVARCHAR(255) NOT NULL` | External system's identifier (with UNIQUE constraint) |
| `SourceJSON` | `NVARCHAR(MAX) NULL` | Raw source record for debugging/auditing |
| `SyncStatus` | `NVARCHAR(50) DEFAULT 'Active'` | Track soft-deleted/archived records |
| `LastSyncedAt` | `DATETIMEOFFSET NULL` | When this record was last synced |

These standard columns ensure:
- Every record can be traced back to its source
- Soft deletes are supported
- Deduplication can match on `SourceRecordID`
- The raw source data is preserved for troubleshooting

---

## 7. Migration File Generation

### File Naming

Generated migrations follow the Flyway convention:

```
migrations/v2/V{YYYYMMDDHHMM}__v{MJ_VERSION}.x_Integration_{SourceType}_{Action}.sql
```

Examples:
```
V202603041530__v5.7.x_Integration_HubSpot_CreateSchema.sql
V202603041531__v5.7.x_Integration_HubSpot_CreateDealTable.sql
V202603041532__v5.7.x_Integration_HubSpot_CreateContactTable.sql
V202603050900__v5.7.x_Integration_HubSpot_AddDealPriorityColumn.sql
```

### Migration Content

Each migration file includes:
1. Header comment with source, generation timestamp, and user who initiated
2. Schema creation (first migration only)
3. Table creation DDL
4. Check constraints for enum-like fields
5. Foreign key constraints (to other integration tables, NOT to core MJ tables)
6. Comments/extended properties for CodeGen to pick up

### Two-Phase Execution

**Phase 1 — DDL Execution** (immediate, in the local MJ instance):
```typescript
// Execute DDL against the database directly
await databaseProvider.ExecuteSQL(ddlScript);
```

**Phase 2 — Migration File Write** (for version control):
```typescript
// Write the same DDL to a migration file
const fileName = `V${timestamp}__v${mjVersion}.x_Integration_${sourceType}_${action}.sql`;
const filePath = path.join(migrationsDir, fileName);
await fs.writeFile(filePath, ddlScript);
```

This two-phase approach means:
- The local instance gets the schema immediately (no restart needed)
- The migration file is committed to git for reproducibility
- Other environments (staging, production) apply the migration via Flyway during deployment

---

## 8. Entity Metadata Registration

After DDL execution, the system must register entities in MJ metadata so the framework "sees" them.

### Entities to Create

For each source object that generates a table:

1. **Entity record** in the `Entity` table
2. **EntityField records** for each column
3. **EntityRelationship records** for foreign keys between integration entities

### Registration Pattern

```typescript
// Uses MJ's own entity system to create metadata records
const md = new Metadata();

// 1. Create Entity record
const entityObj = await md.GetEntityObject<EntityEntity>('Entities', contextUser);
entityObj.NewRecord();
entityObj.Set('Name', 'HubSpot Deal');           // Entity name
entityObj.Set('SchemaName', 'hubspot');           // DB schema
entityObj.Set('BaseTable', 'Deal');               // Table name (without schema)
entityObj.Set('Description', 'Deals imported from HubSpot CRM');
entityObj.Set('TrackRecordChanges', true);        // Enable version control
entityObj.Set('AllowCreateAPI', true);
entityObj.Set('AllowUpdateAPI', true);
entityObj.Set('AllowDeleteAPI', true);
entityObj.Set('AllowUserSearchAPI', true);
await entityObj.Save();

// 2. Create EntityField records for each column
for (const field of sourceFields) {
  const fieldObj = await md.GetEntityObject<EntityFieldEntity>('Entity Fields', contextUser);
  fieldObj.NewRecord();
  fieldObj.Set('EntityID', entityObj.Get('ID'));
  fieldObj.Set('Name', field.MJColumnName);
  fieldObj.Set('Type', field.MJType);
  fieldObj.Set('MaxLength', field.MaxLength);
  fieldObj.Set('AllowsNull', !field.IsRequired);
  fieldObj.Set('Description', field.Label);
  await fieldObj.Save();
}
```

### What CodeGen Still Does

Even after manual entity registration, CodeGen is needed to generate:
- **Views** (`vwHubSpotDeal`) with proper JOINs
- **Stored Procedures** (`spCreateHubSpotDeal`, `spUpdateHubSpotDeal`, `spDeleteHubSpotDeal`)
- **TypeScript entity classes** with Zod schemas
- **Angular form components**
- **`__mj_CreatedAt` / `__mj_UpdatedAt`** timestamp columns + triggers
- **Foreign key indexes**

---

## 9. CodeGen Integration

### Triggering CodeGen After Schema Creation

After DDL execution and metadata registration, CodeGen must run to complete the entity setup:

```typescript
// Option A: Full CodeGen run (slow but complete)
await exec('npx mj codegen', { cwd: mjRootDir });

// Option B: Targeted CodeGen for specific entities (faster)
await exec(`npx mj codegen --entities "HubSpot Deal,HubSpot Contact"`, { cwd: mjRootDir });
```

### CodeGen Output for Integration Entities

CodeGen generates these artifacts:

| Artifact | Location | Purpose |
|----------|----------|---------|
| View | `vwHubSpotDeal` in DB | Read-friendly view with JOINs |
| SP Create | `spCreateHubSpotDeal` | Insert with validation |
| SP Update | `spUpdateHubSpotDeal` | Update with dirty checking |
| SP Delete | `spDeleteHubSpotDeal` | Soft/hard delete |
| TypeScript class | `entity_subclasses.ts` | Typed entity class |
| Angular form | `core-entity-forms` | CRUD UI |
| Migration SQL | `CodeGen_Run_*.sql` | Reproducible DB objects |

### Timing Consideration

CodeGen produces a **CodeGen migration file** (e.g., `CodeGen_Run_2026-03-04_15-30-00.sql`) that must also be committed to source control. This file contains the generated views, SPs, triggers, and index DDL.

---

## 10. Schema Evolution (Modify Integration)

When an integration is modified (new fields added in source, fields removed, types changed):

### Field Addition

```sql
-- Generated migration: V202603050900__v5.7.x_Integration_HubSpot_AddDealPriority.sql
ALTER TABLE [hubspot].[Deal]
    ADD Priority NVARCHAR(50) NULL;
```

Plus: new `EntityField` record inserted, CodeGen re-run to update view/SPs.

### Field Type Change

```sql
-- Generated migration: V202603050901__v5.7.x_Integration_HubSpot_AlterDealAmount.sql
ALTER TABLE [hubspot].[Deal]
    ALTER COLUMN Amount DECIMAL(22,4);  -- Increased precision
```

Plus: `EntityField` record updated, CodeGen re-run.

### Field Removal

Fields are **never physically dropped** from integration tables. Instead:
1. The `EntityField` record is marked as deprecated (Description prefixed with "[DEPRECATED]")
2. The `CompanyIntegrationFieldMap` for that field is set to `Status = 'Inactive'`
3. The sync engine stops syncing the field
4. A future cleanup migration can drop the column after a grace period

### Object Addition

Same as initial creation — new table, new Entity/EntityField records, CodeGen run.

### Object Removal

Objects are never physically dropped. The `CompanyIntegrationEntityMap` for that object is set to `Status = 'Inactive'`, and the sync engine stops syncing it.

---

## 11. Source Control & CI/CD Integration

### Git Workflow

```
developer creates integration in UI
    │
    ▼
Schema Builder generates DDL + migration file
    │
    ▼
Migration file written to: migrations/v2/V{timestamp}__v{version}.x_Integration_*.sql
    │
    ▼
Developer commits migration file to feature branch
    │
    ▼
PR review → merge to `next`
    │
    ▼
CI/CD pipeline runs Flyway → migration applies in staging
    │
    ▼
Promotion to production → Flyway applies same migration
```

### Key Points

1. **Migration files ARE the source of truth** — the local DDL execution is a preview; the migration file is what matters for reproducibility
2. **Each environment runs Flyway independently** — development creates the migration, staging/production apply it
3. **CodeGen migrations are separate** — the Schema Builder migration (CREATE TABLE) and the CodeGen migration (CREATE VIEW, CREATE PROCEDURE) are two distinct files
4. **Order matters** — Schema Builder migration must have an earlier timestamp than CodeGen migration

### CI/CD Pipeline Integration

```yaml
# In the CI/CD pipeline (e.g., GitHub Actions)
steps:
  - name: Apply Flyway migrations
    run: flyway migrate
    # This applies both:
    # 1. Integration DDL migrations (CREATE TABLE)
    # 2. CodeGen migrations (CREATE VIEW, SP, etc.)

  - name: Verify entities exist
    run: npm run verify-entities
    # Optional: validate that expected entities are registered
```

### Environment-Specific Considerations

| Concern | Solution |
|---------|----------|
| Dev has integration, staging doesn't | Migration file in git applies it everywhere |
| Different DB credentials per environment | Flyway config handles this |
| Integration needs source system access | Only the DDL is environment-agnostic; connector config is per-environment |
| Schema already exists in target env | Migration uses IF NOT EXISTS guards |

---

## 12. UI Workflow

### "Create from Source" Flow in Mapping Workspace

**Step 1: Select Source Objects**
- User views list of source objects (from connector's `IntrospectSchema()`)
- Each object shows: name, field count, estimated row count
- User checks objects they want to sync
- For each object, user chooses: "Map to Existing Entity" or "Create New Entity"

**Step 2: Review Proposed Schema**
- For "Create New" objects, system shows proposed table structure:
  - Table name (editable)
  - Entity name (editable)
  - Schema name (defaults to source type, editable)
  - Column list with types (editable — user can change types, add constraints)
  - Standard columns shown as read-only (ID, SourceRecordID, etc.)
- User can add/remove columns, change types, set nullable flags
- Preview of the generated DDL shown in a collapsible panel

**Step 3: Review & Confirm**
- Summary showing all changes:
  - N tables to create
  - N entities to register
  - Migration file name
- "Create Schema" button (with confirmation dialog)

**Step 4: Execution**
- Progress indicator showing:
  1. Creating schema... (if new)
  2. Creating tables... (N of M)
  3. Registering entities...
  4. Running CodeGen...
  5. Writing migration file...
- Final result: success/failure with details

**Step 5: Field Mapping**
- After schema creation, automatically transition to field mapping
- Source fields pre-mapped to generated columns (1:1 since we just created them)
- User can adjust mappings, add transforms

---

## 13. Safety & Rollback

### Pre-Flight Checks

Before executing DDL:
1. **Schema collision check** — ensure schema name doesn't conflict with existing schemas
2. **Table collision check** — ensure table names don't exist
3. **Entity name collision check** — ensure entity names aren't already registered
4. **Permission check** — user must have admin/integration-manager role
5. **Disk space estimate** — warn if expected data volume is very large

### Rollback Strategy

Each schema creation generates a corresponding rollback script:

```sql
-- Rollback: V202603041530__v5.7.x_Integration_HubSpot_CreateSchema.sql
-- WARNING: This will permanently delete all data in the hubspot schema

-- Remove entity metadata
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE EntityID IN (
    SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE SchemaName = 'hubspot'
);
DELETE FROM ${flyway:defaultSchema}.Entity WHERE SchemaName = 'hubspot';

-- Drop tables
DROP TABLE IF EXISTS [hubspot].[Deal];
DROP TABLE IF EXISTS [hubspot].[Contact];

-- Drop schema
DROP SCHEMA IF EXISTS [hubspot];
```

Rollback scripts are:
- Generated alongside the creation migration
- Stored in `migrations/rollback/` (NOT applied by Flyway automatically)
- Require manual execution with explicit confirmation
- Logged in `MJ: Company Integration Runs` as a "Schema Rollback" operation

### Data Protection

- **Soft delete first**: Before dropping anything, mark entities as inactive
- **Grace period**: Schema drops are only available 30+ days after deactivation
- **Backup reminder**: UI warns user to backup data before schema rollback
- **Audit trail**: All DDL operations are logged with user, timestamp, and DDL text

---

## 14. Package Structure

```
packages/Integration/
├── engine/                          # Existing orchestrator
├── connectors/                      # Existing connectors
├── schema-builder/                  # NEW: DDL generation and schema management
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── SchemaBuilder.ts         # Orchestrator
│   │   ├── SourceSchemaIntrospector.ts  # Interface + base class
│   │   ├── TypeMapper.ts            # Source type → SQL type mapping
│   │   ├── DDLGenerator.ts          # CREATE TABLE / ALTER TABLE generation
│   │   ├── MigrationFileWriter.ts   # Writes Flyway-compatible .sql files
│   │   ├── EntityRegistrar.ts       # Creates Entity/EntityField metadata
│   │   ├── SchemaEvolution.ts       # ALTER TABLE diff engine
│   │   ├── RollbackGenerator.ts     # Generates rollback scripts
│   │   └── __tests__/
│   │       ├── TypeMapper.test.ts
│   │       ├── DDLGenerator.test.ts
│   │       ├── MigrationFileWriter.test.ts
│   │       └── SchemaEvolution.test.ts
│   └── README.md
└── ui-types/                        # Existing shared types
```

---

## 15. Implementation Phases

### Phase 1: Schema Introspection (1-2 days)
- Define `SourceSchemaInfo` / `SourceObjectInfo` / `SourceFieldInfo` interfaces
- Add `IntrospectSchema()` to `BaseIntegrationConnector`
- Implement for `RelationalDBConnector` (most straightforward — uses INFORMATION_SCHEMA)
- Implement for `FileFeedConnector` (CSV header parsing + type inference)
- Unit tests for introspection

### Phase 2: DDL Generation Engine (2-3 days)
- Implement `TypeMapper` (source types → SQL Server + PostgreSQL types)
- Implement `DDLGenerator` (CREATE TABLE, ALTER TABLE, standard columns)
- Implement `MigrationFileWriter` (Flyway naming, header comments, IF NOT EXISTS guards)
- Implement `RollbackGenerator`
- Unit tests for all generators

### Phase 3: Entity Registration & CodeGen (1-2 days)
- Implement `EntityRegistrar` (creates Entity + EntityField metadata records)
- Implement CodeGen triggering (targeted entity generation)
- Integration test: create table → register entity → verify in metadata

### Phase 4: Schema Evolution (1-2 days)
- Implement `SchemaEvolution` diff engine (compare source schema vs existing table)
- Generate ALTER TABLE migrations for field additions/type changes
- Handle field deprecation (soft removal)
- Unit tests for diff scenarios

### Phase 5: UI Integration (2-3 days)
- Add "Create New Entity" option in Mapping Workspace
- Schema preview/edit panel
- DDL preview panel
- Execution progress indicator
- Wire to SchemaBuilder service

### Phase 6: Source Control & CI/CD (1 day)
- Document migration file workflow
- Add migration validation to CI pipeline
- Test Flyway application in Docker workbench

---

## Open Questions

1. **Schema naming**: Should each integration source type get its own schema, or should all integration entities live in a single `integration` schema?
   - **Recommendation**: Per-source-type schema (e.g., `hubspot`, `salesforce`) for isolation
   - Alternative: Single `integration` schema with table name prefixes

2. **CodeGen triggering**: Should CodeGen run automatically after schema creation, or should the user manually trigger it?
   - **Recommendation**: Automatic, but with an option to defer

3. **Cross-integration relationships**: If a HubSpot Deal references a Salesforce Account, how do we handle the FK?
   - **Recommendation**: Don't create physical FKs across integration schemas; use soft references via `SourceRecordID`

4. **Existing data migration**: If the source system already has data, should we offer an initial bulk import as part of schema creation?
   - **Recommendation**: Yes — after schema creation, offer "Initial Sync" button that runs a full pull

5. **SaaS connector introspection**: Some APIs don't expose schema metadata. How do we handle this?
   - **Recommendation**: Hardcoded schema definitions per connector, with override capability via JSON config files
