# Schema Management Automation Plan

## Problem Statement

Today, the integration pipeline for new external data sources requires multiple manual steps:

1. **SchemaBuilder** generates a SQL migration file + `additionalSchemaInfo.json`
2. A developer manually places the migration in `/migrations/v5/`
3. The migration is run manually against the database (via Flyway or sqlcmd)
4. CodeGen is run manually to generate entity classes, GraphQL resolvers, and Angular forms
5. The API server is restarted to pick up new entities

This works for initial setup but doesn't scale when:
- New integration objects are added over time
- Field schemas change in the external system
- Multiple developers are onboarding different integrations simultaneously
- Production deployments need zero-touch schema evolution

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Two Execution Paths                 │
├──────────────────────┬──────────────────────────────┤
│   Production (CI/CD) │   Dev Environment (In-Process)│
│                      │                              │
│  1. PR includes      │  1. GQL mutation triggers    │
│     migration file   │     in-process orchestrator  │
│  2. Flyway runs in   │  2. Execute migration SQL    │
│     deploy pipeline  │     via existing DB connection│
│  3. CodeGen runs in  │  3. Call CodeGenLib API       │
│     GitHub Actions   │     programmatically          │
│  4. Generated code   │  4. Refresh Metadata singleton│
│     committed to PR  │     → new entities live       │
└──────────────────────┴──────────────────────────────┘
```

## Path 1: Production (CI/CD Pipeline)

### Trigger
A PR is merged that includes a new migration file in `/migrations/v5/`.

### Pipeline Steps

```yaml
# Conceptual GitHub Actions workflow
jobs:
  deploy:
    steps:
      # 1. Run Flyway migrations against target DB
      - name: Run Migrations
        run: flyway migrate -url=$DB_URL -schemas=$SCHEMA

      # 2. Run CodeGen to sync entity metadata + generate code
      - name: Run CodeGen
        run: |
          cd packages/CodeGenLib
          npx ts-node src/cli.ts --config=codegen.config.json

      # 3. If CodeGen produced changes, commit them back
      - name: Commit Generated Code
        run: |
          git add packages/MJCoreEntities/src/generated/
          git add packages/MJAPI/src/generated/
          git add packages/MJExplorer/src/app/generated/
          git diff --cached --quiet || git commit -m "CodeGen: sync generated code"
          git push
```

### Key Decisions
- **Migration files are checked into the repo** — they are the source of truth
- **CodeGen output is also checked in** — ensures reproducible builds without needing DB access at build time
- **Flyway ordering** — migrations use timestamped naming (`VYYYYMMDDHHMM__description.sql`) to avoid conflicts between parallel PRs

### SchemaBuilder Integration
The `SchemaBuilder` (called from `IntegrationEngineBase.GenerateSchema()`) already emits:
- A `.sql` migration file
- An `additionalSchemaInfo.json` with entity descriptions, field metadata, etc.

For production, the developer (or an automated PR) places these outputs in the correct locations before merging.

## Path 2: Dev Environment (In-Process Orchestration)

### Prerequisite: Elevated DB Permissions

> **IMPORTANT**: This path requires that MJAPI/MJServer is running with a database login that has DDL permissions (CREATE TABLE, ALTER TABLE, CREATE VIEW, etc.). In dev environments this is common — many developers run the server with the same credentials used by CodeGen. In production, the server typically runs with a restricted login that only has DML permissions, which is why this path must be disabled there.

The server's DB connection (configured via `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` in `.env`) must have sufficient privileges to execute `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, and similar DDL statements. This is the same level of access that CodeGen requires.

### New Component: `SchemaOrchestrator`

A server-side service that chains SchemaBuilder → Migration Execution → CodeGen into a single **in-process** operation, invokable via GraphQL. No child processes, no external tools — everything runs within the MJAPI Node.js process.

### GraphQL API

```graphql
type Mutation {
  """
  Runs the full schema pipeline for an integration:
  1. Generates migration SQL from integration metadata
  2. Executes migration SQL directly via the server's DB connection
  3. Calls CodeGenLib programmatically to generate entity classes
  4. Refreshes the Metadata singleton so new entities are immediately available
  Returns status and any errors encountered.
  """
  runIntegrationSchemaPipeline(input: SchemaPipelineInput!): SchemaPipelineResult!
}

input SchemaPipelineInput {
  """The Integration ID to generate schema for"""
  integrationID: String!

  """If true, only generate the migration file without executing it"""
  dryRun: Boolean = false

  """If true, skip CodeGen after migration (useful for batch operations)"""
  skipCodeGen: Boolean = false
}

type SchemaPipelineResult {
  success: Boolean!

  """Path to the generated migration file"""
  migrationFilePath: String

  """SQL content of the migration (for review in dry-run mode)"""
  migrationSQL: String

  """Number of tables created/modified"""
  tablesAffected: Int

  """Number of columns created/modified"""
  columnsAffected: Int

  """CodeGen output summary"""
  codeGenResult: String

  """Any warnings or errors"""
  messages: [PipelineMessage!]!
}

type PipelineMessage {
  level: MessageLevel!
  message: String!
  step: PipelineStep!
}

enum MessageLevel { INFO, WARNING, ERROR }
enum PipelineStep { SCHEMA_BUILD, MIGRATION_EXECUTE, CODEGEN, METADATA_REFRESH }
```

### Implementation

```typescript
// Conceptual — lives in packages/Integration/engine/src/SchemaOrchestrator.ts

import { DataSource } from 'typeorm'; // or mssql/pg driver directly
import { CodeGenRunner } from '@memberjunction/codegen-lib';
import { Metadata } from '@memberjunction/core';

export class SchemaOrchestrator {

  /**
   * Full in-process pipeline: SchemaBuilder → SQL Execution → CodeGen → Metadata Refresh
   *
   * Requires: The server's DB connection must have DDL permissions (CREATE TABLE, etc.).
   * This is typical in dev environments but NOT in production.
   */
  async RunPipeline(
    integrationID: string,
    options: PipelineOptions,
    contextUser: UserInfo
  ): Promise<PipelineResult> {

    const messages: PipelineMessage[] = [];

    // Step 1: Generate migration SQL via SchemaBuilder
    const schemaResult = await this.generateSchema(integrationID, contextUser);
    messages.push({ level: 'INFO', step: 'SCHEMA_BUILD',
      message: `Generated migration: ${schemaResult.tables} tables, ${schemaResult.columns} columns` });

    if (options.dryRun) {
      return { success: true, migrationSQL: schemaResult.sql, messages };
    }

    // Step 2: Write migration file to disk (for version control)
    const migrationPath = this.writeMigrationFile(schemaResult.sql);
    messages.push({ level: 'INFO', step: 'SCHEMA_BUILD',
      message: `Migration written to ${migrationPath}` });

    // Step 3: Execute migration SQL directly via the server's DB connection
    //         No sqlcmd, no child process — just run the SQL in-process
    const execResult = await this.executeMigrationInProcess(schemaResult.sql);
    if (!execResult.success) {
      messages.push({ level: 'ERROR', step: 'MIGRATION_EXECUTE',
        message: execResult.error });
      return { success: false, messages };
    }
    messages.push({ level: 'INFO', step: 'MIGRATION_EXECUTE',
      message: 'Migration executed successfully against local database' });

    // Step 4: Run CodeGen programmatically (if not skipped)
    if (!options.skipCodeGen) {
      const codeGenResult = await this.runCodeGenInProcess();
      if (!codeGenResult.success) {
        messages.push({ level: 'ERROR', step: 'CODEGEN',
          message: codeGenResult.error });
        return { success: false, messages };
      }
      messages.push({ level: 'INFO', step: 'CODEGEN',
        message: codeGenResult.summary });
    }

    // Step 5: Refresh the Metadata singleton so new entities are live immediately
    //         Without this, the server would need a restart to see new entities
    await this.refreshMetadata(contextUser);
    messages.push({ level: 'INFO', step: 'METADATA_REFRESH',
      message: 'Metadata refreshed — new entities are available immediately' });

    return { success: true, migrationPath, messages };
  }

  /**
   * Execute migration SQL directly using the server's existing DB connection.
   * This runs in-process — no sqlcmd or child process needed.
   *
   * Requires: The server's DB login must have DDL permissions.
   */
  private async executeMigrationInProcess(sql: string): Promise<ExecResult> {
    try {
      // Use the server's existing database connection/pool
      // The exact API depends on which DB driver is in use (mssql, typeorm, etc.)
      const dataSource = this.getDataSource(); // existing server connection
      await dataSource.query(sql);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `DDL execution failed: ${error.message}. ` +
               `Ensure the server's DB login has DDL permissions (CREATE TABLE, ALTER TABLE, etc.)`
      };
    }
  }

  /**
   * Call CodeGenLib's object model directly — no child process, no CLI.
   * Runs entirely in-process with full programmatic control.
   */
  private async runCodeGenInProcess(): Promise<CodeGenResult> {
    try {
      const runner = new CodeGenRunner();
      // Pass config programmatically rather than reading from CWD
      const config = this.buildCodeGenConfig();
      const result = await runner.Run(config);
      return {
        success: true,
        summary: `CodeGen complete: ${result.entitiesProcessed} entities, ` +
                 `${result.filesGenerated} files generated`
      };
    } catch (error) {
      return {
        success: false,
        error: `CodeGen failed: ${error.message}`
      };
    }
  }

  /**
   * Refresh the server's Metadata singleton to pick up newly created entities
   * without requiring a server restart.
   */
  private async refreshMetadata(contextUser: UserInfo): Promise<void> {
    const md = new Metadata();
    await md.Refresh(); // Re-loads entity metadata from the database
  }
}
```

### Why In-Process?

| Concern | Child Process (sqlcmd + CLI) | In-Process |
|---------|------------------------------|------------|
| **External dependencies** | Requires sqlcmd installed | None — uses existing DB driver |
| **Cross-platform** | sqlcmd not available on all platforms | Works everywhere Node runs |
| **Credential management** | Passes credentials via shell args | Uses server's existing connection |
| **Error handling** | Parse stdout/stderr strings | Native TypeScript try/catch |
| **Performance** | Process startup overhead per step | Zero overhead |
| **CodeGen control** | Black-box CLI output | Programmatic progress/callbacks |
| **Security** | Credentials visible in process list | Credentials stay in-memory |

### Security Considerations

1. **Authorization**: The GQL mutation must be restricted to admin users only (check user roles/permissions)
2. **DDL permissions**: Relies on the server's existing DB connection having DDL privileges — this is the developer's responsibility to configure appropriately
3. **SQL injection**: The migration SQL is generated by SchemaBuilder (not user input), but the orchestrator should still validate content before execution
4. **Dev-only**: This entire path must be disabled in production via config flag (`enableDevSchemaPipeline: false` in `mj.config.cjs`). Production servers should never have DDL permissions on their DB login.
5. **No new credentials needed**: Unlike the child-process approach, this doesn't need separate `CODEGEN_DB_USERNAME`/`CODEGEN_DB_PASSWORD` — it uses whatever the server is already connected with

### Environment Requirements

```javascript
// mj.config.cjs
module.exports = {
  integrationEngine: {
    // Enable only in dev environments where the server's DB login has DDL permissions
    enableDevSchemaPipeline: true,  // default: false
  }
};
```

No additional environment variables needed beyond what MJAPI already uses for its DB connection.

## Migration File Naming

Both paths use the same naming convention:

```
V{YYYYMMDDHHMM}__v{VERSION}.x_Integration_{IntegrationName}_{Action}.sql
```

Examples:
- `V202603081357__v5.8.x_Integration_YourMembership_CreateTables.sql`
- `V202603151200__v5.8.x_Integration_HubSpot_CreateTables.sql`
- `V202604010900__v5.8.x_Integration_HubSpot_AddTicketFields.sql`

## Schema Evolution (Future)

When an external system adds new fields or objects:

1. **Detection**: The connector's `DiscoverFields()` or metadata diff detects new fields
2. **SchemaBuilder**: Generates an `ALTER TABLE ADD COLUMN` migration (not a full CREATE)
3. **Pipeline**: Same two paths — CI/CD for production, GQL mutation for dev
4. **Backward compatible**: Only additive changes (new columns, new tables) — never drops

### Diff-Based Migration Generation

The SchemaBuilder should compare:
- **Current state**: Entity metadata in the database (what tables/columns exist)
- **Desired state**: Integration metadata (what the external system exposes)
- **Delta**: Generate only the `ALTER TABLE` / `CREATE TABLE` statements needed

This prevents duplicate table creation errors and makes migrations idempotent.

## Implementation Phases

### Phase 1: Server-Side Orchestrator (Dev Path)
- Create `SchemaOrchestrator` class in `packages/Integration/engine/`
- Wire up GQL mutation with admin-only auth
- Test with HubSpot integration end-to-end
- Add config flag to disable in production

### Phase 2: CI/CD Pipeline
- Create GitHub Actions workflow for migration + CodeGen
- Test with a sample migration PR
- Document the PR workflow for new integrations

### Phase 3: Schema Evolution
- Implement diff-based migration generation in SchemaBuilder
- Support `ALTER TABLE` for field additions/type changes
- Add field removal handling (soft-delete columns or ignore)

### Phase 4: Self-Service UI
- Angular component for triggering schema pipeline from Explorer
- Shows migration preview (dry-run mode)
- Progress indicator for multi-step pipeline
- Error display with actionable messages

## Open Questions

1. **Metadata refresh completeness**: Does `Metadata.Refresh()` fully re-initialize the GraphQL schema and resolvers, or does the server need additional steps to expose new entities via the API? May need to also refresh the Apollo schema registry.
2. **Migration review**: Should dry-run mode be the default, requiring explicit confirmation before execution? A two-step flow (preview → confirm) is safer but adds friction.
3. **Concurrent safety**: What happens if two developers run the pipeline simultaneously? Need a mutex/lock within the orchestrator to prevent concurrent DDL + CodeGen execution.
4. **CodeGen scope**: Should the in-process CodeGen run a full generation pass or a targeted pass for only the new integration's entities? A targeted pass would be significantly faster.
5. **Generated file management**: CodeGen produces files on disk (entity classes, GQL resolvers, Angular forms). In dev, these files change locally. Should the orchestrator auto-stage them in git, or leave that to the developer?
