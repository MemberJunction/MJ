# Runtime Schema Update (RSU) — Detailed Implementation Plan

> **Status**: Draft v2
> **Date**: March 11, 2026
> **Author**: Amith + Craig (conversation), documented by Claude
> **Depends On**: [Integration DDL & Schema Management](integration-ddl-schema-management.md), [Schema Management Automation](schema-management-automation.md), [User Defined Tables Architecture](user-defined-tables-architecture.md)
> **Development Environment**: Docker Workbench (`docker/workbench/`)
> **Branch**: `feature/runtime-schema-update`

---

## IMPORTANT: How This Work Gets Done

### Development Model: Claude Code in Docker Workbench

This feature is **built and tested entirely inside the Docker Workbench**. The workbench provides an isolated environment with its own SQL Server, full Node.js toolchain, and SA-level database access — perfect for a feature that needs to run migrations, execute DDL, run CodeGen, and restart MJAPI repeatedly during development.

**The pattern is:**

1. **A Claude Code instance runs INSIDE the Docker workbench container** (`claude-dev`) with `--dangerously-skip-permissions`. It has:
   - Full SA rights on the workbench SQL Server (`sql-claude` container, SA / `Claude2Sql99`)
   - Read/write access to the entire `/workspace/MJ` repo
   - Ability to run migrations, CodeGen, start/stop MJAPI, execute DDL — all safely sandboxed
   - Git access to commit and push from inside the container

2. **A supervising Claude Code instance runs OUTSIDE the Docker** (on the host machine or another environment). It:
   - Oversees progress, reviews code quality, provides architectural guidance
   - Can pull the branch and review changes
   - Does NOT need database access or elevated permissions
   - Monitors the inner CC instance's work and course-corrects as needed

3. **Both instances work on the `feature/runtime-schema-update` branch.** The inner CC instance commits and pushes directly to this branch. The outer CC instance reviews and can suggest changes.

### Why This Model Works for RSU

RSU is uniquely suited to the workbench because it requires:
- **DDL execution** (CREATE TABLE, ALTER TABLE) — needs elevated DB permissions
- **CodeGen runs** — needs database connection + file system write access
- **MJAPI restarts** — needs process management (PM2)
- **End-to-end testing** — needs to verify that a table created via the pipeline actually works via GraphQL CRUD
- **Iteration** — the inner CC instance can run the full pipeline dozens of times, fixing issues each time, without any risk to production databases or shared environments

The workbench SQL Server is completely disposable. If something goes wrong, `docker compose down -v && ./start.sh` gives you a fresh environment in minutes.

### Setup Instructions for the Developer

```bash
# 1. Start the Docker workbench (from host machine)
cd docker/workbench
./start.sh

# 2. Enter the workbench container
docker exec -it claude-dev zsh

# 3. Switch to the feature branch
cd /workspace/MJ
git fetch origin
git checkout feature/runtime-schema-update

# 4. Install dependencies and build
npm install
npm run build

# 5. Run migrations to set up the workbench database
mj migrate

# 6. Start Claude Code with full permissions (inner instance)
cc
# Or for a one-shot prompt:
ccp "Read plans/runtime-schema-update-plan.md and begin Phase 0"
```

The inner CC instance should:
- Read this plan thoroughly before starting
- Work through the phases in order
- Test each phase end-to-end before moving on
- Commit progress to `feature/runtime-schema-update` frequently
- Use the workbench SQL Server (`sql-claude`) for all database operations

### Supervising from Outside

```bash
# On the host machine, a separate CC instance can:
git fetch origin feature/runtime-schema-update
git log origin/feature/runtime-schema-update --oneline -20
# Review changes, provide feedback, course-correct
```

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Architecture Overview](#3-architecture-overview)
4. [SchemaEngine — Generic DDL Engine](#4-schemaengine--generic-ddl-engine)
5. [Environment Variables](#5-environment-variables)
6. [RuntimeSchemaManager — Pipeline Orchestrator](#6-runtimeschemamanager--pipeline-orchestrator)
7. [Pipeline Steps — Dev Environment](#7-pipeline-steps--dev-environment)
8. [Pipeline Steps — Git Commit & CI/CD](#8-pipeline-steps--git-commit--cicd)
9. [Concurrency & Safety](#9-concurrency--safety)
10. [Schema Protection Rules](#10-schema-protection-rules)
11. [The "Out of Sync" Indicator](#11-the-out-of-sync-indicator)
12. [MJAPI Restart Strategy](#12-mjapi-restart-strategy)
13. [Docker Workbench Development Setup](#13-docker-workbench-development-setup)
14. [Consumer 1: Integration SchemaBuilder](#14-consumer-1-integration-schemabuilder)
15. [Consumer 2: User Defined Tables (UDT)](#15-consumer-2-user-defined-tables-udt)
16. [Consumer 3: Agent-Driven Schema Creation](#16-consumer-3-agent-driven-schema-creation)
17. [Implementation Phases](#17-implementation-phases)
18. [Open Questions](#18-open-questions)
19. [Appendix: Key Codebase References](#19-appendix-key-codebase-references)

---

## 1. Executive Summary

Runtime Schema Update (RSU) is a three-layer system that enables MemberJunction to create and modify database tables, run CodeGen, restart MJAPI, and commit artifacts to git — all programmatically and in-process.

The three layers are:

1. **SchemaEngine** (`@memberjunction/schema-engine`) — A new **generic, core package** that generates platform-correct DDL (CREATE TABLE, ALTER TABLE) from declarative table definitions. Extracted from the current integration-specific `schema-builder` package and made universal. Supports SQL Server and PostgreSQL.

2. **RuntimeSchemaManager** — A singleton orchestrator that chains: migration execution → CodeGen → MJAPI restart → git commit/push. Gated by `ALLOW_RUNTIME_SCHEMA_UPDATE=1`.

3. **Consumers** — Integration SchemaBuilder, User Defined Tables (UDT), developer tools, and AI agents all use SchemaEngine + RuntimeSchemaManager to create tables through a single, consistent pipeline.

**Key insight**: SchemaBuilder is currently an integration-specific tool. By extracting its DDL generation core into a generic `@memberjunction/schema-engine` package, we get a universal "MJ way" to create and alter tables — usable by integrations, UDTs, agents, and developers alike. The RSU pipeline then becomes the execution engine that any of these consumers can invoke.

---

## 2. Problem Statement

### The Integration Problem

Today, after SchemaBuilder emits a migration file, a developer must manually:
1. Place the migration file in the correct directory
2. Run the migration against the database
3. Run CodeGen to generate entity classes, GraphQL resolvers, SQL objects
4. Restart MJAPI to pick up new resolvers
5. Commit all artifacts to git for CI/CD

### The Bigger Problem

The same manual workflow applies to *any* scenario where MJ needs new tables:
- **User Defined Tables**: A user wants to create a custom table via UI or agent
- **Developer tooling**: A developer wants to create tables programmatically
- **Agent-driven**: An AI agent needs a new table to store results

All of these need the same pipeline: DDL → migration → CodeGen → restart → git. But today, only the integration SchemaBuilder can generate DDL, and it has integration-specific assumptions baked in (sync status columns, soft FK config format, source schema mapping).

### Why Metadata.Refresh() Is Not Enough

The GraphQL schema is built **once** at startup via `buildSchemaSync()` in `packages/MJServer/src/index.ts`:

- **RunView / RunDynamicView** — Generic read-only resolvers that work with any entity via metadata. These pick up new entities after `Metadata.Refresh()`.
- **CRUD resolvers** (Create/Update/Delete) — Generated per-entity by CodeGen, loaded at startup via glob scan + `import()`, baked into the schema. **No dynamic registration mechanism exists.**
- **Relationship field resolvers** — Also generated per-entity.

**Bottom line**: For new entities to have full CRUD support via GraphQL, MJAPI must be restarted after CodeGen produces the new resolver files.

---

## 3. Architecture Overview

### Three Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│  CONSUMERS (use SchemaEngine to define tables)                         │
│                                                                        │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Integration   │  │ UDT         │  │ AI Agent     │  │ Developer  │ │
│  │ SchemaBuilder │  │ Pipeline    │  │ Table Creator │  │ CLI Tool   │ │
│  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │                 │        │
│         ▼                 ▼                 ▼                 ▼        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  @memberjunction/schema-engine  (GENERIC DDL ENGINE)             │  │
│  │                                                                  │  │
│  │  TableDefinition → DDLGenerator → Migration SQL                  │  │
│  │  TypeMapper (cross-platform type conversion)                     │  │
│  │  MigrationFileWriter (Flyway-format naming)                      │  │
│  │  SchemaValidator (validates definitions)                         │  │
│  └──────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│                              ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  RuntimeSchemaManager  (PIPELINE ORCHESTRATOR)                   │  │
│  │                                                                  │  │
│  │  1. Validate (env vars, permissions, schema protection)          │  │
│  │  2. Execute migration SQL (in-process via CodeGenConnection)     │  │
│  │  3. Run CodeGen (programmatic, exclude __mj)                     │  │
│  │  4. Compile TypeScript packages                                  │  │
│  │  5. Restart MJAPI via PM2                                        │  │
│  │  6. Clone git repo → create branch → commit → push → merge      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Two Execution Paths, One Set of Artifacts

```
                    ┌─────────────────────────────────────────────┐
                    │         Consumer (Integration/UDT/Agent)     │
                    │  Uses SchemaEngine to produce migration SQL  │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────────────┐
                    │                                              │
          ┌─────────▼─────────┐                     ┌──────────────▼────────────┐
          │  DEV PATH (fast)   │                     │  PROD PATH (safe)         │
          │  In-Process RSU    │                     │  CI/CD Pipeline           │
          │                    │                     │                           │
          │  1. Execute DDL    │                     │  1. PR includes migration │
          │  2. Run CodeGen    │                     │     + generated code      │
          │  3. Restart MJAPI  │                     │  2. Review & merge        │
          │  4. Commit to git  │──artifacts──────────▶  3. Flyway migrate        │
          │  5. Push to remote │                     │  4. (CodeGen already done)│
          │  6. Merge to       │                     │  5. Deploy MJAPI          │
          │     target branch  │                     │  6. Deploy MJExplorer     │
          └────────────────────┘                     └───────────────────────────┘
```

### End-to-End Dev Path Timeline

```
T+0s    Consumer calls SchemaEngine → produces migration SQL
T+1s    RuntimeSchemaManager: execute migration SQL against database
T+2s    CodeGen runs (entity classes, resolvers, SQL objects) — excludes __mj schema
T+30s   CodeGen complete, files written to disk
T+31s   TypeScript compilation of affected packages
T+40s   PM2 restarts MJAPI, picks up new resolvers
T+45s   MJAPI healthy, new entities available via GraphQL (CRUD + RunView)
T+46s   Git: clone repo to temp dir, create branch, commit artifacts, push
T+55s   Git: merge to target branch → triggers CI/CD
T+55s   API marked "out of sync" until CI/CD deployment catches up
```

---

## 4. SchemaEngine — Generic DDL Engine

### Why a New Core Package

The current `packages/Integration/schema-builder/` contains excellent DDL generation logic (DDLGenerator, TypeMapper, MigrationFileWriter) but has integration-specific assumptions:

1. **Input is `SourceSchemaInfo`** — assumes mapping from an external source. UDTs and generic tables don't have a "source."
2. **Standard integration columns** — every table gets `__mj_integration_SyncStatus` and `__mj_integration_LastSyncedAt`. Irrelevant for UDTs.
3. **Soft FK via `additionalSchemaInfo`** — integration-specific config format.
4. **Package location** — buried in `packages/Integration/`. A core DDL engine belongs in a core package.

### Package: `@memberjunction/schema-engine`

**Location**: `packages/SchemaEngine/`

This package extracts and generalizes the DDL generation capabilities:

```
packages/SchemaEngine/
├── src/
│   ├── index.ts                  # Public API exports
│   ├── SchemaEngine.ts           # Main orchestrator class
│   ├── DDLGenerator.ts           # Platform-aware SQL generation
│   ├── TypeMapper.ts             # Source type → SQL type mapping
│   ├── MigrationFileWriter.ts    # Flyway-format file naming/writing
│   ├── SchemaValidator.ts        # Validates table definitions
│   └── interfaces.ts             # Generic input/output types
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Generic Input Types

```typescript
// @memberjunction/schema-engine/src/interfaces.ts

/**
 * Platform-agnostic table definition. This is the universal input
 * for DDL generation — any consumer (integration, UDT, agent, developer)
 * provides this, and SchemaEngine produces platform-correct SQL.
 */
export interface TableDefinition {
    /** Target database schema (e.g., "custom", "hubspot", "dbo") */
    SchemaName: string;

    /** SQL table name (e.g., "UD_ProjectMilestones", "HubSpotContacts") */
    TableName: string;

    /** MJ entity display name (e.g., "User: Project Milestones") */
    EntityName: string;

    /** Human-readable description */
    Description?: string;

    /** Column definitions */
    Columns: ColumnDefinition[];

    /** Columns that form the soft primary key (UNIQUE constraint) */
    SoftPrimaryKeys?: string[];

    /** Foreign key relationships (soft or hard) */
    ForeignKeys?: ForeignKeyDefinition[];

    /**
     * Additional columns injected by the consumer (e.g., integration sync columns).
     * SchemaEngine does NOT add any columns beyond what's specified here.
     */
    AdditionalColumns?: ColumnDefinition[];
}

export interface ColumnDefinition {
    /** Column name */
    Name: string;

    /** Abstract type — TypeMapper converts to platform SQL type */
    Type: SchemaFieldType;

    /** Whether the column accepts NULL */
    IsNullable: boolean;

    /** Max length for string types */
    MaxLength?: number;

    /** Precision for decimal types */
    Precision?: number;

    /** Scale for decimal types */
    Scale?: number;

    /** SQL expression for default value (e.g., "'Active'", "GETUTCDATE()") */
    DefaultValue?: string;

    /** Human-readable description (becomes extended property in SQL Server) */
    Description?: string;
}

/** Supported abstract field types. TypeMapper handles platform conversion. */
export type SchemaFieldType =
    | 'string' | 'text' | 'integer' | 'bigint' | 'decimal'
    | 'boolean' | 'datetime' | 'date' | 'uuid' | 'json'
    | 'float' | 'time';

export interface ForeignKeyDefinition {
    /** Column in this table */
    ColumnName: string;

    /** Referenced schema.table.column */
    ReferencedSchema: string;
    ReferencedTable: string;
    ReferencedColumn: string;

    /** Whether to create a real DB-level FK constraint or just a soft FK in metadata */
    IsSoft: boolean;
}

export type DatabasePlatform = 'sqlserver' | 'postgresql';

/**
 * Output from SchemaEngine.GenerateMigration()
 */
export interface MigrationOutput {
    /** The generated SQL (CREATE TABLE, ALTER TABLE, etc.) */
    SQL: string;

    /** Suggested migration file name in Flyway format */
    FileName: string;

    /** Tables created or modified */
    AffectedTables: string[];

    /** Summary for commit messages */
    Summary: string;
}

/**
 * For schema evolution: represents the diff between existing and desired state.
 */
export interface SchemaEvolutionInput {
    /** The desired table definition */
    Desired: TableDefinition;

    /** Current state of the table (column names, types) */
    ExistingColumns: ExistingColumnInfo[];
}

export interface ExistingColumnInfo {
    Name: string;
    SqlType: string;
    IsNullable: boolean;
    MaxLength?: number;
}
```

### SchemaEngine Class

```typescript
// @memberjunction/schema-engine/src/SchemaEngine.ts

export class SchemaEngine {
    /**
     * Generate a migration SQL file from a table definition.
     * Pure function — does not touch the database.
     */
    public GenerateMigration(
        table: TableDefinition,
        platform: DatabasePlatform,
        mjVersion: string
    ): MigrationOutput {
        // 1. Validate the definition
        SchemaValidator.Validate(table);

        // 2. Generate DDL
        const ddl = DDLGenerator.GenerateCreateTable(table, platform);

        // 3. Generate migration file name
        const fileName = MigrationFileWriter.GenerateFileName(
            table.TableName, mjVersion, 'CreateTable'
        );

        return {
            SQL: ddl,
            FileName: fileName,
            AffectedTables: [`${table.SchemaName}.${table.TableName}`],
            Summary: `Create table ${table.SchemaName}.${table.TableName} (${table.Columns.length} columns)`,
        };
    }

    /**
     * Generate ALTER TABLE migration for schema evolution.
     * Compares desired state to existing state and produces delta DDL.
     */
    public GenerateEvolutionMigration(
        evolution: SchemaEvolutionInput,
        platform: DatabasePlatform,
        mjVersion: string
    ): MigrationOutput {
        // 1. Compute diff
        const diff = SchemaEvolution.ComputeDiff(evolution);

        // 2. Generate ALTER TABLE statements
        const ddl = DDLGenerator.GenerateAlterTable(evolution.Desired, diff, platform);

        // 3. Generate migration file name
        const fileName = MigrationFileWriter.GenerateFileName(
            evolution.Desired.TableName, mjVersion, 'AlterTable'
        );

        return {
            SQL: ddl,
            FileName: fileName,
            AffectedTables: [`${evolution.Desired.SchemaName}.${evolution.Desired.TableName}`],
            Summary: `Alter table: +${diff.AddedColumns.length} columns, ~${diff.ModifiedColumns.length} modified`,
        };
    }

    /**
     * Generate CREATE SCHEMA IF NOT EXISTS for a given schema name.
     */
    public GenerateCreateSchema(
        schemaName: string,
        platform: DatabasePlatform
    ): string {
        return DDLGenerator.GenerateCreateSchema(schemaName, platform);
    }
}
```

### TypeMapper (Extracted & Generalized)

The existing TypeMapper in `packages/Integration/schema-builder/src/TypeMapper.ts` already handles cross-platform type conversion. It moves to `@memberjunction/schema-engine` with the same API:

```
SchemaFieldType → SQL Server Type → PostgreSQL Type → MJ EntityField Type
─────────────────────────────────────────────────────────────────────────
'string'        → NVARCHAR(n)     → VARCHAR(n)      → nvarchar
'text'          → NVARCHAR(MAX)   → TEXT             → nvarchar
'integer'       → INT             → INTEGER          → int
'bigint'        → BIGINT          → BIGINT           → bigint
'decimal'       → DECIMAL(p,s)    → NUMERIC(p,s)     → decimal
'boolean'       → BIT             → BOOLEAN          → bit
'datetime'      → DATETIMEOFFSET  → TIMESTAMPTZ      → datetimeoffset
'date'          → DATE            → DATE             → date
'uuid'          → UNIQUEIDENTIFIER→ UUID             → uniqueidentifier
'json'          → NVARCHAR(MAX)   → JSONB            → nvarchar
'float'         → FLOAT           → DOUBLE PRECISION → float
'time'          → TIME            → TIME             → time
```

### DDLGenerator (Extracted & Generalized)

The existing DDLGenerator moves to `@memberjunction/schema-engine`. Key change: **no more automatic integration columns**. Consumers add their own columns via `AdditionalColumns` on the `TableDefinition`.

Platform-specific behaviors remain:
- SQL Server: `[bracket]` quoting, `sp_addextendedproperty` for descriptions, `EXEC('CREATE SCHEMA')` pattern
- PostgreSQL: `"double-quote"` identifiers, `COMMENT ON` for descriptions, `CREATE SCHEMA IF NOT EXISTS`

### Relationship to Existing Integration SchemaBuilder

The integration `schema-builder` package becomes a **thin consumer** of `@memberjunction/schema-engine`:

```typescript
// packages/Integration/schema-builder/src/SchemaBuilder.ts (updated)

import { SchemaEngine, TableDefinition, ColumnDefinition } from '@memberjunction/schema-engine';

export class SchemaBuilder {
    private engine = new SchemaEngine();

    BuildSchema(input: SchemaBuilderInput): SchemaBuilderOutput {
        // Convert integration-specific input to generic TableDefinitions
        const tables: TableDefinition[] = input.TargetConfigs.map(config => ({
            SchemaName: config.SchemaName,
            TableName: config.TableName,
            EntityName: config.EntityName,
            Description: config.Description,
            Columns: config.Columns.map(c => this.convertColumn(c)),
            SoftPrimaryKeys: config.PrimaryKeyFields,
            // Integration-specific: add sync status columns
            AdditionalColumns: [
                {
                    Name: '__mj_integration_SyncStatus',
                    Type: 'string' as const,
                    IsNullable: false,
                    MaxLength: 50,
                    DefaultValue: "'Active'",
                },
                {
                    Name: '__mj_integration_LastSyncedAt',
                    Type: 'datetime' as const,
                    IsNullable: true,
                },
            ],
        }));

        // Use generic engine for DDL
        const migrations = tables.map(t =>
            this.engine.GenerateMigration(t, input.Platform, input.MJVersion)
        );

        // Add integration-specific artifacts
        const softFKConfig = this.generateSoftFKConfig(input);
        const metadataFiles = this.generateMetadata(input);

        return {
            MigrationFiles: migrations,
            AdditionalSchemaInfoUpdate: softFKConfig,
            MetadataFiles: metadataFiles,
            Warnings: [],
            Errors: [],
        };
    }
}
```

---

## 5. Environment Variables

All RSU configuration lives in environment variables. The feature is **completely disabled** if `ALLOW_RUNTIME_SCHEMA_UPDATE` is not set to `1`.

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `ALLOW_RUNTIME_SCHEMA_UPDATE` | `1` | Master switch. Must be `1` to enable. Absent or any other value = disabled. |
| `RSU_GIT_REPO_URL` | `https://github.com/org/repo.git` | Remote git repo URL for cloning. |
| `RSU_GIT_LOCAL_PATH` | `/tmp/rsu-repo` | Local path where the repo will be cloned. Use a temp directory in containers. |
| `RSU_MIGRATIONS_PATH` | `migrations/v5` | Path to migrations directory **relative to repo root**. |
| `RSU_GIT_TARGET_BRANCH` | `next` | Branch to merge into after push. Triggers CI/CD. |
| `RSU_GIT_TOKEN` | `ghp_xxxxxxxxxxxx` | GitHub PAT for clone, push, and merge. |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RSU_GIT_USER_NAME` | `MJ Runtime Schema Update` | Git commit author name. |
| `RSU_GIT_USER_EMAIL` | `rsu@memberjunction.org` | Git commit author email. |
| `RSU_CODEGEN_EXCLUDE_SCHEMAS` | `__mj` | Comma-separated schemas to exclude from CodeGen. `__mj` always excluded. |
| `RSU_PROTECTED_SCHEMAS` | `__mj` | Schemas RSU cannot create/modify tables in. `__mj` always protected. |
| `RSU_PM2_PROCESS_NAME` | `mjapi` | PM2 process name for restart. |
| `RSU_GIT_MERGE_STRATEGY` | `pr` | `pr` = create PR with auto-merge (audit trail), `direct` = direct merge (faster). |

### Example `.env` Block

```bash
# Runtime Schema Update (Dev Environment Only)
ALLOW_RUNTIME_SCHEMA_UPDATE=1
RSU_GIT_REPO_URL=https://github.com/MyOrg/MyMJApp.git
RSU_GIT_LOCAL_PATH=/tmp/rsu-repo
RSU_MIGRATIONS_PATH=migrations/v5
RSU_GIT_TARGET_BRANCH=next
RSU_GIT_TOKEN=ghp_abc123def456
RSU_GIT_USER_NAME=MJ Schema Bot
RSU_GIT_USER_EMAIL=schema-bot@myorg.com
RSU_GIT_MERGE_STRATEGY=pr
```

---

## 6. RuntimeSchemaManager — Pipeline Orchestrator

### Package Location

`packages/Integration/engine/` or a new `packages/RuntimeSchemaManager/`

### Singleton Pattern

```typescript
import { BaseSingleton } from '@memberjunction/global';

export class RuntimeSchemaManager extends BaseSingleton<RuntimeSchemaManager> {
    protected constructor() {
        super();
    }

    public static get Instance(): RuntimeSchemaManager {
        return RuntimeSchemaManager.getInstance<RuntimeSchemaManager>();
    }

    /** Whether RSU is enabled based on env vars */
    public get IsEnabled(): boolean {
        return process.env.ALLOW_RUNTIME_SCHEMA_UPDATE === '1';
    }

    /** Whether a pipeline is currently in progress */
    public get IsRunning(): boolean { ... }

    /** Whether the local API is out of sync with the git repo */
    public get IsOutOfSync(): boolean { ... }

    /**
     * Full RSU pipeline:
     * 1. Validate environment & permissions
     * 2. Execute migration SQL against database
     * 3. Run CodeGen (excluding __mj schema)
     * 4. Compile affected TypeScript packages
     * 5. Restart MJAPI via PM2
     * 6. Clone repo, create branch, commit artifacts, push
     * 7. Merge to target branch
     */
    public async RunPipeline(
        input: RSUPipelineInput,
        contextUser: UserInfo
    ): Promise<RSUPipelineResult> { ... }

    /**
     * Dry-run: Return the migration SQL and plan without executing.
     */
    public async Preview(
        input: RSUPipelineInput,
        contextUser: UserInfo
    ): Promise<RSUPreviewResult> { ... }
}
```

### Input/Output Types

```typescript
export interface RSUPipelineInput {
    /** The migration SQL to execute (from SchemaEngine or any other source) */
    MigrationSQL: string;

    /** Descriptive name for this schema change */
    Description: string;

    /** Tables being created or modified (used in branch naming) */
    AffectedTables: string[];

    /** Optional: additionalSchemaInfo JSON content for soft FKs */
    AdditionalSchemaInfo?: string;

    /** Optional: metadata JSON files for mj-sync */
    MetadataFiles?: { Path: string; Content: string }[];

    /** If true, skip the git commit/push step */
    SkipGitCommit?: boolean;

    /** If true, skip MJAPI restart (useful for batching multiple changes) */
    SkipRestart?: boolean;
}

export interface RSUPipelineResult {
    Success: boolean;
    BranchName?: string;
    MigrationFilePath?: string;
    EntitiesProcessed?: number;
    APIRestarted: boolean;
    GitCommitSuccess: boolean;
    Steps: RSUPipelineStep[];
    ErrorMessage?: string;
    ErrorStep?: string;
}

export interface RSUPipelineStep {
    Name: string;
    Status: 'success' | 'failed' | 'skipped';
    DurationMs: number;
    Message: string;
}
```

### GraphQL API

```graphql
type Mutation {
    """
    Execute the Runtime Schema Update pipeline.
    Requires ALLOW_RUNTIME_SCHEMA_UPDATE=1 and admin permissions.
    """
    RunRuntimeSchemaUpdate(input: RSUPipelineInput!): RSUPipelineResult!
        @requireSystemUser

    """
    Preview mode: Returns the migration SQL and CodeGen plan without executing.
    """
    PreviewRuntimeSchemaUpdate(input: RSUPipelineInput!): RSUPreviewResult!
        @requireSystemUser
}

type Query {
    """
    Returns the current RSU status: enabled, running, out-of-sync.
    """
    RuntimeSchemaUpdateStatus: RSUStatus!
}

type RSUStatus {
    Enabled: Boolean!
    Running: Boolean!
    OutOfSync: Boolean!
    OutOfSyncSince: DateTime
    LastRunAt: DateTime
    LastRunResult: String
}
```

---

## 7. Pipeline Steps — Dev Environment

### Step 1: Validation

Before executing anything:
1. Check `ALLOW_RUNTIME_SCHEMA_UPDATE === '1'`
2. Check all required env vars are present
3. Check no other RSU pipeline is running (singleton mutex)
4. Validate the migration SQL doesn't touch protected schemas (see Section 10)
5. Verify the database connection has DDL permissions (attempt a no-op DDL)

### Step 2: Execute Migration SQL

Use the server's existing database connection to execute the migration SQL in-process.

```typescript
const conn: CodeGenConnection = this.getCodeGenConnection();
const tx = await conn.beginTransaction();
try {
    await tx.query(migrationSQL);
    await tx.commit();
} catch (error) {
    await tx.rollback();
    throw new RSUError('MIGRATION_EXECUTE', error.message);
}
```

The migration SQL comes from SchemaEngine (or any consumer). RSU must resolve `${flyway:defaultSchema}` placeholders before execution if Skyway is not being used directly.

### Step 3: Run CodeGen

Invoke `RunCodeGenBase` programmatically:

```typescript
const codeGen = new RunCodeGenBase();
await codeGen.setupDataSource();
await codeGen.Run(/* skipDatabaseGeneration */ false);
```

**Full CodeGen** — generates everything: SQL objects (views, stored procs), TypeScript entity subclasses, GraphQL resolvers, Angular forms. Even though Angular forms aren't useful until CI/CD, they need to be in the git commit.

**Excludes `__mj` schema** — CodeGen runs against all entities except those in protected schemas. Since CodeGen is idempotent, running against `__mj` entities wouldn't change them (the schema hasn't changed), but excluding them is faster and safer.

### Step 4: Compile Generated Code

After CodeGen writes new `.ts` files, they must be compiled:

```typescript
// Execute compilation via child_process
await execAsync('cd packages/MJCoreEntities && npm run build');
await execAsync('cd packages/MJAPI && npm run build');
```

### Step 5: Restart MJAPI via PM2

```typescript
async function restartMJAPI(): Promise<void> {
    const processName = process.env.RSU_PM2_PROCESS_NAME || 'mjapi';
    await execAsync(`pm2 restart ${processName}`);
}
```

After restart, poll the health endpoint until MJAPI is ready:

```typescript
async function waitForAPIHealth(maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch('http://localhost:4000/health');
            if (response.ok) return true;
        } catch { /* server not ready yet */ }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
}
```

### Step 6: Set "Out of Sync" Flag

Mark the API as running runtime-patched code (see Section 11).

---

## 8. Pipeline Steps — Git Commit & CI/CD

### Step 7: Clone Repository

```typescript
async function cloneRepo(): Promise<string> {
    const repoUrl = process.env.RSU_GIT_REPO_URL!;
    const localPath = process.env.RSU_GIT_LOCAL_PATH || '/tmp/rsu-repo';
    const token = process.env.RSU_GIT_TOKEN!;

    const authedUrl = repoUrl.replace('https://', `https://${token}@`);

    if (!fs.existsSync(path.join(localPath, '.git'))) {
        await execAsync(`git clone ${authedUrl} ${localPath}`);
    } else {
        await execAsync(`cd ${localPath} && git fetch origin`);
    }

    const userName = process.env.RSU_GIT_USER_NAME || 'MJ Runtime Schema Update';
    const userEmail = process.env.RSU_GIT_USER_EMAIL || 'rsu@memberjunction.org';
    await execAsync(`cd ${localPath} && git config user.name "${userName}"`);
    await execAsync(`cd ${localPath} && git config user.email "${userEmail}"`);

    return localPath;
}
```

### Step 8: Create Branch

Branch naming uses the first 2-3 affected table names for traceability:

```typescript
function generateBranchName(affectedTables: string[]): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const tableSlug = affectedTables
        .slice(0, 3)
        .map(t => t.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase())
        .join('-');
    return `rsu/${timestamp}-${tableSlug}`;
}
// Example: rsu/202603111802-hubspot-contacts-deals
```

```typescript
async function createBranch(localPath: string, branchName: string): Promise<void> {
    const targetBranch = process.env.RSU_GIT_TARGET_BRANCH || 'next';
    await execAsync(`cd ${localPath} && git checkout ${targetBranch}`);
    await execAsync(`cd ${localPath} && git pull origin ${targetBranch}`);
    await execAsync(`cd ${localPath} && git checkout -b ${branchName}`);
}
```

### Step 9: Copy Artifacts & Commit

Copy generated files from the running MJAPI's filesystem into the cloned repo:

```typescript
async function commitArtifacts(localPath: string, input: RSUPipelineInput): Promise<void> {
    const migrationsPath = process.env.RSU_MIGRATIONS_PATH || 'migrations/v5';

    // 1. Copy migration file
    const migrationFileName = generateMigrationFileName(input);
    fs.writeFileSync(path.join(localPath, migrationsPath, migrationFileName), input.MigrationSQL);

    // 2. Copy CodeGen output files
    const generatedFiles = [
        'packages/MJCoreEntities/src/generated/entity_subclasses.ts',
        'packages/MJAPI/src/generated/generated.ts',
        'packages/Angular/Explorer/core-entity-forms/src/lib/generated/',
    ];
    for (const file of generatedFiles) {
        copyRecursive(path.join(MJAPI_ROOT, file), path.join(localPath, file));
    }

    // 3. Copy CodeGen SQL migration if one was produced
    const codeGenMigration = findLatestCodeGenMigration(MJAPI_ROOT);
    if (codeGenMigration) {
        fs.copyFileSync(codeGenMigration, path.join(localPath, migrationsPath, path.basename(codeGenMigration)));
    }

    // 4. Copy additionalSchemaInfo and metadata files if provided
    if (input.AdditionalSchemaInfo) {
        fs.writeFileSync(path.join(localPath, 'additionalSchemaInfo.json'), input.AdditionalSchemaInfo);
    }
    if (input.MetadataFiles) {
        for (const mf of input.MetadataFiles) {
            fs.mkdirSync(path.dirname(path.join(localPath, mf.Path)), { recursive: true });
            fs.writeFileSync(path.join(localPath, mf.Path), mf.Content);
        }
    }

    // 5. Stage and commit
    await execAsync(`cd ${localPath} && git add -A`);
    await execAsync(`cd ${localPath} && git commit -m "RSU: ${input.Description}

Tables affected: ${input.AffectedTables.join(', ')}
Generated by Runtime Schema Update pipeline"`);
}
```

### Step 10: Push & Merge

```typescript
async function pushAndMerge(localPath: string, branchName: string): Promise<void> {
    const targetBranch = process.env.RSU_GIT_TARGET_BRANCH || 'next';
    const strategy = process.env.RSU_GIT_MERGE_STRATEGY || 'pr';

    // Push the branch
    await execAsync(`cd ${localPath} && git push -u origin ${branchName}`);

    if (strategy === 'direct') {
        // Direct merge via GitHub API
        await githubAPI(`repos/${owner}/${repo}/merges`, {
            base: targetBranch,
            head: branchName,
            commit_message: `Merge RSU: ${branchName}`,
        });
    } else {
        // Create PR with auto-merge (safer, provides audit trail)
        await execAsync(`cd ${localPath} && gh pr create --base ${targetBranch} --head ${branchName} --title "RSU: ${description}" --body "Auto-generated by Runtime Schema Update"`);
        await execAsync(`cd ${localPath} && gh pr merge ${branchName} --auto --merge`);
    }
}
```

### Step 11: CI/CD Pipeline (Triggered by Merge)

Once the merge lands on the target branch:

1. **Flyway/Skyway migration** — Applies the migration (idempotent; already applied locally)
2. **Build & Deploy MJAPI** — Canonical deployment replaces the "patched" local version
3. **Build & Deploy MJExplorer** — Frontend gets new Angular forms and components
4. **Clear "out of sync" flag** — Canonical deployment is live

### Multi-Environment Flow

```
Dev MJAPI (local) ──RSU──▶ rsu/branch ──merge──▶ next ──CI/CD──▶ Dev Deploy
                                                    │
                                            (manual merge)
                                                    │
                                              staging ──CI/CD──▶ Staging Deploy
                                                    │
                                              production ──CI/CD──▶ Prod Deploy
```

---

## 9. Concurrency & Safety

### Singleton Mutex

`RuntimeSchemaManager` prevents concurrent pipeline executions. For multi-instance safety, use a database-backed lock:

```typescript
public async AcquireLock(contextUser: UserInfo): Promise<boolean> {
    // In-memory lock (single-instance)
    if (this._isRunning) return false;
    this._isRunning = true;

    // TODO (Phase 5): Database-backed lock for multi-instance
    // INSERT INTO __mj.RuntimeSchemaLock (ID, AcquiredBy, AcquiredAt)
    return true;
}

public async ReleaseLock(): Promise<void> {
    this._isRunning = false;
}
```

### Failure Recovery

Each step is forward-only. Failures leave the system in a recoverable state:

| Failure Point | State | Recovery |
|---------------|-------|----------|
| Migration execution | Tables partially created | Manual rollback migration or re-run |
| CodeGen | Tables exist but no entity classes | Re-run CodeGen manually |
| Compilation | Source files exist, not compiled | `npm run build` manually |
| PM2 restart | Compiled code on disk | Manual `pm2 restart mjapi` |
| Git clone/push | Local state correct | Re-run git operations manually |

---

## 10. Schema Protection Rules

### `__mj` Schema Is Always Protected

The RSU pipeline **never** executes DDL against the `__mj` schema:
- No `CREATE TABLE` in `__mj`
- No `ALTER TABLE` on `__mj.*` tables
- No `DROP` anything in `__mj`

### All Other Schemas Are Allowed

Any schema not in the protected list is fair game:
- `dbo` (default)
- `custom` (UDT convention)
- `hubspot`, `salesforce`, etc. (integration convention)
- New schemas created by the migration itself

### Validation Logic

```typescript
function validateMigrationSQL(sql: string, protectedSchemas: string[]): ValidationResult {
    const errors: string[] = [];
    const allProtected = new Set(['__mj', ...protectedSchemas]);

    for (const schema of allProtected) {
        const patterns = [
            new RegExp(`CREATE\\s+TABLE\\s+${escapeRegex(schema)}\\.`, 'gi'),
            new RegExp(`ALTER\\s+TABLE\\s+${escapeRegex(schema)}\\.`, 'gi'),
            new RegExp(`DROP\\s+(?:TABLE|VIEW|PROCEDURE|FUNCTION|SCHEMA)\\s+.*${escapeRegex(schema)}\\.`, 'gi'),
        ];
        for (const pattern of patterns) {
            if (pattern.test(sql)) {
                errors.push(`Migration targets protected schema "${schema}"`);
            }
        }
    }

    return { Valid: errors.length === 0, Errors: errors };
}
```

---

## 11. The "Out of Sync" Indicator

After the local pipeline completes but before CI/CD deployment finishes, the API is running patched code.

### Implementation

```typescript
private _outOfSync = false;
private _outOfSyncSince: Date | null = null;

public get IsOutOfSync(): boolean { return this._outOfSync; }
public get OutOfSyncSince(): Date | null { return this._outOfSyncSince; }

public MarkOutOfSync(): void {
    this._outOfSync = true;
    this._outOfSyncSince = new Date();
}

// Cleared when canonical CI/CD deployment replaces this instance
public ClearOutOfSync(): void {
    this._outOfSync = false;
    this._outOfSyncSince = null;
}
```

### Friendly UI Message (Craig's Suggestion)

Instead of "out of sync," the UI shows:
> "New entities are available — full UI support is deploying..."

Exposed via the `RuntimeSchemaUpdateStatus` GraphQL query.

---

## 12. MJAPI Restart Strategy

### PM2 Configuration

```javascript
// ecosystem.config.js (in packages/MJAPI/)
module.exports = {
    apps: [{
        name: 'mjapi',
        script: 'dist/index.js',
        cwd: '/workspace/MJ/packages/MJAPI',
        watch: false,
        max_memory_restart: '2G',
        env: { NODE_ENV: 'development' },
    }]
};
```

### Restart Sequence

```
1. RSU writes CodeGen output to disk
2. Compile: npm run build in MJCoreEntities + MJAPI
3. pm2 restart mjapi
4. Poll /health endpoint until 200 OK (max 30s)
5. Proceed with git operations
```

### Why PM2 Is Required

Without an external process manager, the Node process cannot restart itself and continue the pipeline. PM2 provides:
- Graceful restart (finish in-flight requests)
- Automatic process recovery
- Log management
- The RSU pipeline triggers the restart *then exits*; PM2 brings up the new process

---

## 13. Docker Workbench Development Setup

### Changes Required

#### 1. Add PM2 to the Workbench Container

In `docker/workbench/Dockerfile` or `entrypoint.sh`:

```bash
npm install -g pm2
```

#### 2. Add RSU Environment Variables

In `docker/workbench/.env`:

```bash
ALLOW_RUNTIME_SCHEMA_UPDATE=1
RSU_GIT_REPO_URL=https://github.com/MyOrg/MyMJApp.git
RSU_GIT_LOCAL_PATH=/tmp/rsu-repo
RSU_MIGRATIONS_PATH=migrations/v5
RSU_GIT_TARGET_BRANCH=next
RSU_GIT_TOKEN=${GITHUB_TOKEN}
```

#### 3. Update MJAPI Start Aliases

```bash
alias mjapi='cd /workspace/MJ/packages/MJAPI && pm2 start ecosystem.config.js'
alias mjapi-restart='pm2 restart mjapi'
alias mjapi-logs='pm2 logs mjapi'
alias mjapi-stop='pm2 stop mjapi'
```

### Development Workflow

```bash
# 1. Start workbench
cd docker/workbench && ./start.sh
docker exec -it claude-dev zsh

# 2. Start MJAPI with PM2
mjapi

# 3. Develop on feature/runtime-schema-update branch
cd /workspace/MJ

# 4. Build & test the SchemaEngine package
cd packages/SchemaEngine && npm run build && npm run test

# 5. Build & test RuntimeSchemaManager
cd packages/Integration/engine && npm run build && npm run test

# 6. End-to-end test: trigger RSU via GraphQL mutation
```

### Test Scenarios

| Test | Expected Outcome |
|------|-----------------|
| RSU disabled (no env var) | Pipeline returns error immediately |
| Migration SQL targets `__mj` | Validation rejects with clear error |
| Happy path: new table in `custom` | Table created, CodeGen runs, API restarts, CRUD works |
| Concurrent pipeline attempt | Second attempt blocked by mutex |
| Git clone with bad token | Git step fails, local migration + CodeGen already succeeded |
| PM2 not installed | Restart step fails with actionable error |
| Schema evolution (ALTER TABLE) | Existing table modified, CodeGen updates entity classes |
| UDT creation via agent | Agent calls SchemaEngine → RSU pipeline, table available in ~60s |

---

## 14. Consumer 1: Integration SchemaBuilder

The existing `packages/Integration/schema-builder/` becomes a thin wrapper around `@memberjunction/schema-engine`.

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| DDLGenerator | In `schema-builder` | Moved to `schema-engine` |
| TypeMapper | In `schema-builder` | Moved to `schema-engine` |
| MigrationFileWriter | In `schema-builder` | Moved to `schema-engine` |
| SchemaBuilder | Monolithic orchestrator | Thin wrapper: converts integration input → generic `TableDefinition`, calls `SchemaEngine`, adds integration-specific artifacts (sync columns, soft FK config, metadata files) |

### Integration-Specific Additions

When the integration SchemaBuilder calls SchemaEngine, it adds:
- `__mj_integration_SyncStatus` column (via `AdditionalColumns`)
- `__mj_integration_LastSyncedAt` column (via `AdditionalColumns`)
- `additionalSchemaInfo.json` updates for soft FK config
- `/metadata/` JSON files for EntitySettings

### Integration → RSU Flow

```
Integration Mapping UI
    ↓
IntegrationSchemaBuilder.BuildSchema(input)
    ├── SchemaEngine.GenerateMigration(tableDef, platform)  // generic DDL
    ├── Add integration-specific columns
    ├── Generate soft FK config
    └── Generate metadata files
    ↓
RuntimeSchemaManager.RunPipeline({
    MigrationSQL: migration.SQL,
    Description: "Integration: HubSpot Contacts + Deals",
    AffectedTables: ["hubspot.Contacts", "hubspot.Deals"],
    AdditionalSchemaInfo: softFKConfig,
    MetadataFiles: metadataFiles,
})
    ↓
Migration → CodeGen → Restart → Git → CI/CD
```

---

## 15. Consumer 2: User Defined Tables (UDT)

The [User Defined Tables plan](user-defined-tables-architecture.md) describes an Airtable-like experience where users or agents can create tables via UI or natural language. With SchemaEngine + RSU, the UDT pipeline becomes straightforward.

### UDT → SchemaEngine → RSU Flow

```
User/Agent: "Create a table for project milestones"
    ↓
UserTablePipeline (new class)
    ├── Parse user intent → UserTableDefinition
    ├── Convert to TableDefinition:
    │   SchemaName: "custom"
    │   TableName: "UD_ProjectMilestones"
    │   EntityName: "User: Project Milestones"
    │   Columns: [Name, DueDate, Status, OwnerUserID]
    ├── SchemaEngine.GenerateMigration(tableDef, platform)
    └── RuntimeSchemaManager.RunPipeline(...)
    ↓
~60 seconds later: fully operational MJ entity with CRUD, RunView, permissions
```

### UDT-Specific Logic (NOT in SchemaEngine)

- Naming convention: `custom.UD_{TableName}` for SQL tables, `User: {TableName}` for entity names
- `UserDefinedTable` / `UserDefinedField` metadata entities to track what the user created
- Permission setup: auto-create EntityPermission records for the creating user
- Rate limiting: max 10 tables/user/day, max 50 fields/table
- Validation: field count limits, reserved name checking

### Why First-Class Entities

Real SQL tables through the standard MJ pipeline mean:
- **Skip can query them** — standard SQL, RunView, no special handling
- **Full MJ features** — Record Changes (versioning), permissions, audit trail, dashboards
- **CodeGen produces typed classes** — strong typing, GraphQL resolvers, Angular forms
- **No performance compromise** — real indexes, real query optimizer

The only trade-off is the ~60-second MJAPI restart, which is acceptable for table creation (not a frequent operation).

---

## 16. Consumer 3: Agent-Driven Schema Creation

AI agents can use SchemaEngine + RSU to create tables on the fly.

### Example: Skip Analysis Agent

```
Skip: "I need to store the quarterly sales analysis results"
    ↓
Agent creates a TableDefinition:
    SchemaName: "skip_analysis"
    TableName: "QuarterlySalesResults_2026Q1"
    Columns: [Region, Product, Revenue, UnitsSold, GrowthPct, AnalysisDate]
    ↓
SchemaEngine.GenerateMigration(...)
    ↓
RuntimeSchemaManager.RunPipeline(...)
    ↓
Agent: "Table created. I'll now populate it with the analysis results."
```

### Agent-Specific Considerations

- Agents should use `Preview()` before `RunPipeline()` to confirm intent
- Table naming conventions for agent-created tables (e.g., `agent.{AgentName}_{Purpose}`)
- Auto-cleanup: agent-created tables could have a TTL or require periodic confirmation
- The agent framework's `BaseAgent` would have a helper method for table creation

---

## 17. Implementation Phases

### Phase 0: Foundation — Extract SchemaEngine Package

**Goal**: Create `@memberjunction/schema-engine` by extracting and generalizing DDL generation from `packages/Integration/schema-builder/`.

**Tasks**:
1. Create `packages/SchemaEngine/` package structure (package.json, tsconfig, vitest config)
2. Move `DDLGenerator`, `TypeMapper`, `MigrationFileWriter` from `schema-builder` to `schema-engine`
3. Define generic `TableDefinition`, `ColumnDefinition`, `MigrationOutput` interfaces
4. Remove integration-specific assumptions (no auto sync columns, no `SourceSchemaInfo` dependency)
5. Create `SchemaEngine` orchestrator class with `GenerateMigration()` and `GenerateEvolutionMigration()`
6. Create `SchemaValidator` for validating table definitions
7. Update `packages/Integration/schema-builder/` to import from `@memberjunction/schema-engine` instead of its own copies
8. Ensure all existing schema-builder tests pass with the new dependency
9. Write unit tests for SchemaEngine (cross-platform DDL generation, type mapping, validation)
10. Add `@memberjunction/schema-engine` to workspace in root `package.json`

**Estimated complexity**: Medium. Mostly code extraction and interface generalization.

### Phase 1: Core RSU Pipeline (No Git)

**Goal**: SchemaEngine output → Migration execution → CodeGen → MJAPI restart, all in-process.

**Tasks**:
1. Create `RuntimeSchemaManager` class extending `BaseSingleton`
2. Implement env var validation and feature gating
3. Implement schema protection validation (parse SQL, reject `__mj` operations)
4. Implement in-process migration execution using `CodeGenConnection`
5. Implement programmatic CodeGen invocation via `RunCodeGenBase`
6. Implement TypeScript compilation step (`npm run build` via `child_process`)
7. Implement PM2 restart + health check polling
8. Implement the "out of sync" flag (in-memory)
9. Add `RSUStatus` GraphQL query
10. Add `RunRuntimeSchemaUpdate` GraphQL mutation with `@requireSystemUser`
11. Update Docker workbench to use PM2 for MJAPI
12. Write unit tests for validation, schema protection, branch naming
13. End-to-end test in Docker workbench: SchemaEngine → RSU → verify CRUD via GraphQL

**Estimated complexity**: Medium-high. Most pieces exist; the work is orchestration and wiring.

### Phase 2: Git Integration

**Goal**: After local pipeline succeeds, commit artifacts to git and trigger CI/CD.

**Tasks**:
1. Implement git clone / fetch (with token auth via HTTPS URL injection)
2. Implement branch creation with table-name-based naming
3. Implement artifact collection (migration file, CodeGen output, metadata)
4. Implement git add + commit with descriptive message
5. Implement git push to remote
6. Implement merge to target branch (PR with auto-merge or direct merge, configurable)
7. Handle git errors gracefully (auth failure, merge conflicts, network issues)
8. End-to-end test: verify artifacts appear in remote repo after pipeline

**Estimated complexity**: Medium. Standard git operations via CLI.

### Phase 3: Integration SchemaBuilder Conversion

**Goal**: Wire the integration SchemaBuilder to use SchemaEngine + RSU.

**Tasks**:
1. Update `SchemaBuilder.BuildSchema()` to use `SchemaEngine.GenerateMigration()` for DDL
2. Move integration-specific column injection to `AdditionalColumns`
3. Keep soft FK config and metadata emission in the integration layer
4. Add a "Run Schema Pipeline" button to the integration mapping UI that triggers RSU
5. End-to-end test: create integration mapping → SchemaBuilder → RSU → sync data

**Estimated complexity**: Medium. SchemaBuilder already works; this is re-wiring inputs.

### Phase 4: CI/CD Pipeline

**Goal**: Merges to the target branch trigger automated deployment.

**Tasks**:
1. Create/update GitHub Actions workflow for RSU-triggered merges
2. Workflow: run migrations → build → deploy MJAPI → deploy MJExplorer
3. Post-deploy: clear "out of sync" flag
4. Test: merge RSU branch, verify CI/CD deploys correctly

**Estimated complexity**: Medium. Depends on existing CI/CD infrastructure.

### Phase 5: UDT Pipeline

**Goal**: Users and agents can create tables via UI or natural language.

**Tasks**:
1. Create `UserTablePipeline` class (UDT → TableDefinition → SchemaEngine → RSU)
2. Create `UserDefinedTable` / `UserDefinedField` MJ entities (metadata tracking)
3. Implement naming conventions (`custom.UD_*`, `User: *`)
4. Implement permission auto-setup
5. Implement rate limiting and validation
6. Create Angular UI for table definition (column picker, type selector)
7. Create agent tool for natural-language table creation
8. End-to-end test: user creates table in UI, agent creates table via conversation

**Estimated complexity**: High. New UI, new entities, agent integration.

### Phase 6: Polish & Hardening

**Tasks**:
1. Database-backed mutex for multi-instance safety
2. Pipeline retry mechanism for transient failures
3. Audit logging (who triggered RSU, when, what changed)
4. Metrics / observability (pipeline duration, success rate)
5. Admin dashboard for RSU history and status

---

## 18. Open Questions

1. **CodeGen scope filtering**: Can we pass a schema filter to `RunCodeGenBase` to only process non-`__mj` entities? Or is full CodeGen (idempotent) acceptable? Full CodeGen takes 30-60s; filtered would be faster.

2. **Migration tracking**: Should RSU use Skyway (updates `flyway_schema_history`) to apply migrations, or execute raw SQL? Using Skyway ensures migrations aren't re-applied on next startup.

3. **Compilation strategy**: Use Turbo (`npx turbo run build --filter=...`) with smart caching, or build only directly affected packages?

4. **Angular compilation in dev**: Compile Angular packages locally (immediate frontend feedback, +30-60s) or defer entirely to CI/CD?

5. **CodeGen SQL migration**: Should CodeGen's SQL output (views, SPs) be appended to the SchemaBuilder migration (one file) or kept separate (two files per RSU run)?

6. **SchemaEngine package location**: `packages/SchemaEngine/` (top-level) or `packages/Core/SchemaEngine/` (under Core)?

7. **Agent table lifecycle**: Should agent-created tables have a TTL or require periodic confirmation to prevent table sprawl?

---

## 19. Appendix: Key Codebase References

### SchemaEngine Extraction Sources

| Component | Current Location | New Location |
|-----------|-----------------|--------------|
| DDLGenerator | `packages/Integration/schema-builder/src/DDLGenerator.ts` | `packages/SchemaEngine/src/DDLGenerator.ts` |
| TypeMapper | `packages/Integration/schema-builder/src/TypeMapper.ts` | `packages/SchemaEngine/src/TypeMapper.ts` |
| MigrationFileWriter | `packages/Integration/schema-builder/src/MigrationFileWriter.ts` | `packages/SchemaEngine/src/MigrationFileWriter.ts` |
| SchemaEvolution | `packages/Integration/schema-builder/src/SchemaEvolution.ts` | `packages/SchemaEngine/src/SchemaEvolution.ts` |

### RSU Pipeline Components

| Component | File Path | Key Method |
|-----------|-----------|------------|
| RunCodeGenBase | `packages/CodeGenLib/src/runCodeGen.ts` | `Run(skipDatabaseGeneration)` |
| CodeGenConnection | `packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts` | `query()`, `beginTransaction()` |
| Skyway Migration Runner | `packages/OpenApp/Engine/src/install/migration-runner.ts` | `RunAppMigrations(options)` |
| Metadata | `packages/MJCore/src/generic/metadata.ts` | `Refresh()` |
| IntegrationEngine | `packages/Integration/engine/src/IntegrationEngine.ts` | `RunSync()` |

### Server Architecture

| Component | File Path | Key Detail |
|-----------|-----------|------------|
| Server startup | `packages/MJServer/src/index.ts` | `buildSchemaSync()` at ~line 431 |
| Resolver discovery | `packages/MJServer/src/index.ts` | Glob scan + dynamic import, lines 170-418 |
| RunView resolver | `packages/MJServer/src/generic/RunViewResolver.ts` | Generic, works with any entity |
| Generated resolvers | `packages/MJAPI/src/generated/generated.ts` | Per-entity CRUD, built by CodeGen |
| ResolverBase | `packages/MJServer/src/generic/ResolverBase.ts` | CreateRecord, UpdateRecord, DeleteRecord |

### Docker & Infrastructure

| Component | File Path |
|-----------|-----------|
| Workbench docker-compose | `docker/workbench/docker-compose.yml` |
| Production MJAPI Docker | `docker/MJAPI/entrypoint.sh` |
| Docker docs | `docker/CLAUDE.md` |

### Related Plans

| Plan | File Path | Relationship |
|------|-----------|-------------|
| Integration DDL & Schema Management | `plans/integration-ddl-schema-management.md` | SchemaBuilder architecture, artifact emission |
| Schema Management Automation | `plans/schema-management-automation.md` | Original automation concept, evolved into RSU |
| User Defined Tables Architecture | `plans/user-defined-tables-architecture.md` | UDT plan, now a consumer of SchemaEngine + RSU |
| Integration Engine Architecture | `plans/integration-engine-architecture.md` | Integration engine foundation |

---

*This plan was documented from a conversation between Amith and Craig Adam on March 11, 2026, with architectural analysis and codebase research by Claude. Updated to incorporate the generic SchemaEngine concept and UDT integration.*
