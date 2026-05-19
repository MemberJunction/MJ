# Integration Full-Stack Buildout Plan

> **Status**: In Progress — Executing Phases 0-7
> **Date**: March 6, 2026
> **Branch**: `claude/integration-engine-build`
> **Prerequisites**: [Integration Engine Architecture](integration-engine-architecture.md), [Integration DDL & Schema Management](integration-ddl-schema-management.md)
> **Docs**: `packages/Integration/docs/` (7 comprehensive docs covering architecture, sync lifecycle, connectors, schema, mapping, dashboard, metadata)

> **CRITICAL EXPECTATION**: Execute ALL 7 phases (0-7) without stopping until 100% complete. No commits (user will review). No mock/stub code — everything must be real. World-class UX at all times. READ ONLY for external APIs (real YM and HubSpot credentials exist in DB — can pull data but never write back). Schema naming: YM data → `YourMembership` schema, HubSpot data → `HubSpot` schema only. DO NOT STOP until all phases are done.

---

## 1. Objective

Build a world-class, end-to-end integration experience — from connector setup through schema creation to live data sync — with HubSpot and YourMembership as the two proving connectors. The result should be a polished, professional studio that makes it simple for users to connect external systems and start syncing data.

## 2. Current State Assessment

### What Works
- **Connector registration chain**: All 4 connectors (HubSpot, Salesforce, YourMembership, FileFeed) are in the server-bootstrap manifest, imported by MJAPI, and registered in ClassFactory at startup. `ConnectorFactory.Resolve()` uses `Integration.ClassName` directly. ✅
- **Engine core**: IntegrationOrchestrator, FieldMappingEngine (9 transforms), MatchEngine, WatermarkService, RetryRunner — 216 unit tests passing. ✅
- **GraphQL API**: IntegrationDiscoveryResolver provides `DiscoverObjects`, `DiscoverFields`, `TestConnection`, `SchemaPreview` queries. ✅
- **Client-side GraphQL**: `GraphQLIntegrationClient` wraps all discovery queries. ✅
- **Schema builder**: DDLGenerator, TypeMapper, SchemaEvolution, MigrationFileWriter, SoftFKConfigEmitter, MetadataEmitter, AccessControl — all implemented. ✅
- **RunSyncAction**: MJ Action wrapper for triggering syncs. ✅
- **Angular shell**: 4-tab dashboard exists (Control Tower, Connection Studio, Mapping Workspace, Sync Activity). ✅

### Completed (as of March 2026)
1. **UI is fully built** — Mapping Workspace is a polished 3-panel layout with discovery browser, auto-map, field editor, DDL preview, and data preview. ✅
2. **Connection Studio** — Step-by-step wizard with integration selection, credential entry, test connection, object discovery with field preview. ✅
3. **HubSpot connector is real** — Extends BaseIntegrationConnector with OAuth2 Bearer auth, HubSpot API v3 calls, property discovery, batch pagination. ✅
4. **Credential flow works** — Connection Studio reads CredentialType JSON schema, renders credential form, links to CompanyIntegration. ✅
5. **Control Tower** — KPI cards, health grid, activity feed, bar charts, "Run Now" button per integration. ✅
6. **Sync Activity** — Run list with detail panel, watermark display, error log, status badges. ✅
7. **PreviewSourceData** — Full-stack implementation: server resolver → GraphQL client → Angular service. Zero stubs. ✅
8. **Schema builder** — DDLGenerator, TypeMapper, SchemaEvolution, MigrationFileWriter, SoftFKConfigEmitter, MetadataEmitter, AccessControl — all real. ✅
9. **Unit tests** — 54 connector tests passing (6 test files), 216+ engine tests, 10 schema builder test files. ✅

## 3. Architecture: Pluggable Connectors

### Registration Pattern (Already Working)

```
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseIntegrationConnector { ... }
```

Each connector:
1. Lives in `packages/Integration/connectors/src/`
2. Extends `BaseIntegrationConnector` (or `RelationalDBConnector` for SQL-based connectors)
3. Registers via `@RegisterClass(BaseIntegrationConnector, 'ClassName')`
4. Is exported from the connectors package index
5. Gets pulled into the server-bootstrap manifest by `mj codegen manifest`
6. Is instantiated at runtime by `ConnectorFactory.Resolve(integration)` using `Integration.ClassName`

### Connector Contract

Every connector must implement:

| Method | Purpose |
|--------|---------|
| `TestConnection(ci, user)` | Validate credentials and connectivity |
| `DiscoverObjects(ci, user)` | List available external objects |
| `DiscoverFields(ci, obj, user)` | List fields on an external object |
| `FetchChanges(ctx)` | Fetch records with watermark-based incremental sync |

Optional:
| Method | Purpose |
|--------|---------|
| `GetDefaultFieldMappings(obj, entity)` | Suggest field mappings |
| `IntrospectSchema(ci, user)` | Full schema introspection for DDL generation |

### Extensibility for Third Parties

Third-party connectors follow the same pattern:
1. Create an npm package with connector class(es)
2. Use `@RegisterClass(BaseIntegrationConnector, 'ClassName')`
3. Add the package to the app's supplemental manifest (via `mj codegen manifest --exclude-packages @memberjunction`)
4. Create Integration metadata record with matching `ClassName`

No changes to engine, factory, or framework code required.

## 4. Default Setup Flow (New Capability)

### Problem

Today, setting up an integration requires many manual steps: create CompanyIntegration, discover objects, create entity maps one by one, configure field mappings. For common integrations like HubSpot or YM, the setup should be nearly automatic.

### Solution: Connector-Driven Default Configurations

Each connector can provide a `GetDefaultConfiguration()` method that returns a proposed setup:

```typescript
interface DefaultIntegrationConfig {
    /** Proposed DB schema name for new tables (e.g., "ym", "hubspot") */
    DefaultSchemaName: string;
    /** Objects to sync by default with proposed table names */
    DefaultObjects: DefaultObjectConfig[];
}

interface DefaultObjectConfig {
    /** Source object name */
    SourceObjectName: string;
    /** Proposed target table name */
    TargetTableName: string;
    /** Proposed MJ entity name */
    TargetEntityName: string;
    /** Whether to enable sync by default */
    SyncEnabled: boolean;
    /** Proposed field mappings (from GetDefaultFieldMappings) */
    FieldMappings: DefaultFieldMapping[];
}
```

### UI Flow

```
User clicks "Add Integration"
       │
       ▼
Select integration type (HubSpot, YourMembership, etc.)
       │
       ▼
Enter credentials (API key, OAuth, etc.)
       │
       ▼
Test Connection → Success
       │
       ▼
"Quick Setup" vs "Custom Setup" choice
       │
       ├── Quick Setup:
       │   - Show proposed schema, tables, mappings from connector defaults
       │   - User reviews and approves (or tweaks)
       │   - System generates DDL, applies migration, runs CodeGen
       │   - Entity maps and field maps auto-created
       │   - Ready to sync
       │
       └── Custom Setup:
           - Full manual mapping workspace (current flow, improved)
           - User picks objects, defines schemas, maps fields individually
```

## 5. Local Development Workflow for Schema Creation

When a user maps to a new entity (no existing MJ entity), the schema builder generates migration files. In production, these go through CI/CD. For local dev, we need a manual workflow:

### Step-by-Step Local Flow

```
1. Schema Builder emits migration .sql file
   └── Written to: migrations/v2/V{timestamp}__v5.7_Integration_{Source}_{Action}.sql

2. Run migration locally
   └── npm run mj:migrate (or node packages/MJCLI/bin/run.js migrate)
   └── Flyway applies the SQL with elevated credentials

3. Run CodeGen
   └── npm run mj:codegen (or node packages/MJCLI/bin/run.js codegen)
   └── Discovers new tables, creates Entity/EntityField records
   └── Generates views, SPs, triggers, timestamp columns
   └── Reads additionalSchemaInfo for soft FKs

4. Refresh metadata (no server restart needed)
   └── Server: Metadata.Refresh() via GraphQL mutation or API call
   └── Client: Provider.Refresh() reloads entity cache
   └── BaseEntity access works immediately (typed subclasses need restart)

5. Continue with field mapping and sync
```

### GraphQL Mutation for Metadata Refresh

We need a new `IntegrationRefreshMetadata` mutation that calls `Metadata.Refresh()` server-side and returns success. The Angular client calls this after migration + CodeGen completes.

## 6. Making Connectors Real (HubSpot & YM)

### YourMembership Connector

Current state: **Already has real REST API calls.** Full implementation includes:
- Session-based authentication (POST `/Ams/Authenticate`) with session caching and 14-min TTL
- 8 object types: Members, Events, MemberTypes, Memberships, Groups, Products, DonationFunds, Certifications
- Paginated fetching (Members, Events, Certifications) and single-call fetching for smaller objects
- Auto-retry on 401 (session expiry) with re-authentication
- Hardcoded field schemas (YM API doesn't expose metadata discovery)
- Default field mappings for Members → Contacts and Events
- Special handling for Groups (nested GroupType → Groups flattening)

Remaining work:
1. Wire credential reading from `CompanyIntegration.CredentialID` → `Credential.ConfigData` (currently reads from `Configuration` JSON directly)
2. Test against real API with real credentials (credentials exist in DB)
3. Validate all 8 object types return expected data shapes

### HubSpot Connector

Current state: Extends RelationalDBConnector, reads from mock SQL tables.

To make real:
1. Change base class from `RelationalDBConnector` to `BaseIntegrationConnector`
2. Implement HubSpot REST API v3 calls
3. `TestConnection` → `GET /crm/v3/objects/contacts?limit=1` with Bearer token
4. `DiscoverObjects` → hardcoded list (contacts, companies, deals) + optionally `GET /crm/v3/schemas` for custom objects
5. `DiscoverFields` → `GET /crm/v3/properties/{objectType}` for field metadata
6. `FetchChanges` → `GET /crm/v3/objects/{objectType}` with `after` cursor pagination
7. Authentication: Read OAuth token or API key from credential JSON

### Credential Flow

Both connectors need to read credentials from the `CompanyIntegration` record:

```typescript
// In BaseIntegrationConnector or a shared utility
protected GetCredentialConfig(companyIntegration: MJCompanyIntegrationEntity): Record<string, string> {
    // Load Credential entity by companyIntegration.CredentialID
    // Parse the credential's JSON configuration
    // Return as typed config object
}
```

The credential JSON schema (defined per CredentialType) drives the UI form for entering API keys/tokens.

## 7. World-Class UX Buildout

### Control Tower Enhancements
- Real-time health indicators (green/yellow/red) based on last sync status
- "Run Now" button per integration with progress indicator
- Sync schedule display and next-run countdown
- Record count trends (sparkline charts)
- Quick-action buttons: Test Connection, View Logs, Edit Mapping

### Connection Studio Enhancements
- Guided credential entry driven by CredentialType JSON schema
- Live connection test with detailed error messages
- Object discovery browser with field preview
- Schema preview with syntax-highlighted DDL

### Mapping Workspace Enhancements (Priority)
- **Quick Setup wizard** for new integrations (see Section 4)
- **Drag-and-drop field mapping** between source and destination panels
- **Auto-map intelligence** — match by name, type, and connector suggestions
- **Transform pipeline visual editor** — add/remove/reorder transforms with preview
- **Live data preview** — show sample records from source and destination side by side
- **Bulk operations** — select all, map all matching, clear all
- **Validation indicators** — required fields unmapped, type mismatches, warnings
- **Schema creation inline** — when targeting a new entity, show DDL preview and "Create" button that triggers the local dev workflow

### Sync Activity Enhancements
- Real-time sync monitoring (progress bar, records/second, ETA)
- Error categorization and filtering
- Record-level drill-down (view source record, mapped record, error details)
- Watermark status per entity map
- Re-run failed records button

## 8. Playwright Testing Strategy

### Setup
- Persistent browser profile at `.playwright-cli/profile` (auth cached after first login)
- MJAPI on port 4001, MJExplorer on port 4201
- Start both as background processes, wait for ready signals

### Test Scenarios

1. **Smoke Test**: Navigate to Integrations app, verify 4 tabs load
2. **Connection Test**: Select YM integration, test connection (mock success path)
3. **Object Discovery**: Discover objects, verify list matches connector's DiscoverObjects output
4. **Field Discovery**: Select an object, discover fields, verify field list
5. **Quick Setup**: Run quick setup for YM, verify proposed schema and mappings
6. **Schema Preview**: Preview DDL for a new entity, verify SQL output
7. **Field Mapping**: Create entity map, verify auto-mapped fields, adjust a mapping
8. **Sync Execution**: Run a sync, verify run record created, check record counts
9. **Error Handling**: Test connection failure, verify error display

## 9. Task List

### Phase 0: Verification & Foundation
- [ ] P0.1: Start MJAPI + MJExplorer, launch Playwright with persistent profile, login once
- [ ] P0.2: Navigate to Integrations app, verify all 4 tabs render, screenshot current state
- [ ] P0.3: Verify connector registration — call IntegrationTestConnection via GraphQL for a CompanyIntegration, confirm connector resolves
- [ ] P0.4: Trace credential flow — verify CompanyIntegration.CredentialID links to a real Credential with config JSON

### Phase 1: Credential & Connection Flow
- [ ] P1.1: Ensure credential types exist for YM and HubSpot (metadata/credential-types)
- [ ] P1.2: Wire Connection Studio to show credential form driven by CredentialType JSON schema
- [ ] P1.3: Implement "Test Connection" button → GraphQL → connector.TestConnection → display result
- [ ] P1.4: Implement "Discover Objects" → display object list in Connection Studio
- [ ] P1.5: Implement "Discover Fields" for selected object → display field table

### Phase 2: Default Setup / Quick Start
- [ ] P2.1: Add `GetDefaultConfiguration()` method to BaseIntegrationConnector (optional, returns null by default)
- [ ] P2.2: Implement `GetDefaultConfiguration()` in YourMembershipConnector (schema: "ym", objects: Members, Events, MemberTypes, etc.)
- [ ] P2.3: Implement `GetDefaultConfiguration()` in HubSpotConnector (schema: "hubspot", objects: contacts, companies, deals)
- [ ] P2.4: Add GraphQL query `IntegrationGetDefaultConfig(companyIntegrationID)` to IntegrationDiscoveryResolver
- [ ] P2.5: Build "Quick Setup" wizard component in Angular — shows proposed schema/tables/mappings, approve/modify/apply
- [ ] P2.6: Wire "Quick Setup" to schema builder → generate DDL preview → user approves → emit migration file

### Phase 3: Local Schema Creation Pipeline
- [ ] P3.1: Implement server-side endpoint to write migration file to disk (secure, admin-only)
- [ ] P3.2: Implement server-side endpoint to trigger `mj migrate` (run Flyway migration)
- [ ] P3.3: Implement server-side endpoint to trigger `mj codegen` (generate entity classes)
- [ ] P3.4: Add `IntegrationRefreshMetadata` GraphQL mutation → calls `Metadata.Refresh()` server-side
- [ ] P3.5: Wire Angular UI: after DDL approval → write file → migrate → codegen → refresh → continue
- [ ] P3.6: Handle error cases: migration failure, codegen failure, partial state recovery

### Phase 4: Mapping Workspace UX
- [ ] P4.1: Redesign left panel — integration selector, object list with sync status, add map button
- [ ] P4.2: Build center panel — source/destination field columns with drag-drop mapping
- [ ] P4.3: Implement auto-map — use connector's GetDefaultFieldMappings + name matching
- [ ] P4.4: Build transform pipeline editor — visual step chain with add/remove/configure
- [ ] P4.5: Implement data preview — sample records from source and destination side by side
- [ ] P4.6: Add validation — highlight unmapped required fields, type mismatches
- [ ] P4.7: Implement bulk operations — map all matching, clear all, select all
- [ ] P4.8: Build inline schema creation — "New Entity" mode with DDL preview + create button

### Phase 5: Real API Connectors
- [ ] P5.1: Verify YourMembershipConnector works with real credentials (already has real API calls)
- [ ] P5.2: Wire YM credential reading from CompanyIntegration.CredentialID if needed
- [ ] P5.3: Refactor HubSpotConnector from RelationalDBConnector base to real API calls (BaseIntegrationConnector)
- [ ] P5.4: Implement HubSpot API v3 pagination (cursor-based)
- [ ] P5.5: Test both connectors against real API endpoints (requires real credentials)
- [ ] P5.6: Handle rate limiting, auth refresh, and transient errors

### Phase 6: Control Tower & Sync Activity Polish
- [ ] P6.1: Real-time health indicators based on last sync status
- [ ] P6.2: "Run Now" with progress bar and live record counts
- [ ] P6.3: Sync Activity drill-down — click run → see per-entity details → click entity → see record errors
- [ ] P6.4: Watermark status display per entity map
- [ ] P6.5: Record count trends with sparkline charts

### Phase 7: Playwright E2E Tests
- [ ] P7.1: Smoke test — load Integrations app, verify tabs
- [ ] P7.2: Connection test flow — enter credentials, test connection, verify result
- [ ] P7.3: Object discovery flow — discover objects, select one, discover fields
- [ ] P7.4: Quick setup flow — run quick setup, verify proposed config, approve
- [ ] P7.5: Mapping flow — create entity map, verify auto-map, adjust field mapping
- [ ] P7.6: Sync execution flow — run sync, verify run record, check counts
- [ ] P7.7: Error handling — test with bad credentials, verify error display

## 10. Success Criteria

1. **User can connect YM or HubSpot in under 5 minutes** — enter credentials, quick setup, approve, sync
2. **Schema creation works locally** — migration emitted, applied, CodeGen run, metadata refreshed, no server restart needed
3. **Field mappings are intuitive** — auto-map gets 80%+ right, remaining are easy to configure
4. **Sync works end-to-end** — records flow from external system to MJ entities with proper matching and watermarks
5. **Professional UX** — loading states, error messages, progress indicators, responsive layout
6. **Playwright tests pass** — full flow validated automatically

## 11. Data Safety Rules

- **READ ONLY**: Real credentials for YM and HubSpot exist in the database. Data may be pulled but **never written back** to external systems.
- **Schema naming**: YM data goes into schema `YourMembership`, HubSpot data into schema `HubSpot`. No other schemas.
- **Data privacy**: Real data from these systems must not be used for anything beyond integration testing.

## 12. Future: RelationalDB Connector Sub-Classes

The `RelationalDBConnector` base class supports connecting to any relational database. Future sub-classes planned (lower priority than SaaS connectors):

| Sub-Class | Target Database |
|-----------|----------------|
| `SQLServerConnector` | SQL Server (INFORMATION_SCHEMA-based discovery) |
| `PostgreSQLConnector` | PostgreSQL (INFORMATION_SCHEMA + pg_catalog) |
| `MySQLConnector` | MySQL (INFORMATION_SCHEMA-based discovery) |

These use standard SQL metadata queries for schema introspection, making them relatively straightforward to implement. Not in scope for this buildout — focus is SaaS systems (HubSpot + YM).

## 13. Out of Scope (For Now)

- Bidirectional sync (outbound from MJ → external system)
- Real-time webhook-triggered sync
- OAuth authorization flow (users paste tokens, not full OAuth dance)
- Multi-environment CI/CD pipeline (production deployment workflow)
- Custom object/field creation in HubSpot/Salesforce
- Salesforce connector real API implementation (focus on HubSpot + YM first)
- RelationalDB sub-classes (SQL Server, PostgreSQL, MySQL) — planned but not in this buildout
