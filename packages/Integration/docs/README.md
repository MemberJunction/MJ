# MemberJunction Integration Engine — Documentation

Comprehensive documentation for the MemberJunction integration framework: a pluggable, metadata-driven system for syncing data between external systems and MJ entities.

## Table of Contents

### Core Concepts
1. **[Architecture Overview](architecture.md)** — System design, package structure, entity data model, and how all the pieces connect
2. **[Sync Lifecycle](sync-lifecycle.md)** — End-to-end flow of a sync run: orchestration, watermarks, batching, retry, record matching, error handling, and notifications
3. **[Field Mapping & Transforms](field-mapping.md)** — Field mapping engine, transform pipelines, auto-mapping, and the 9 built-in transform types

### Building & Extending
4. **[Connector Development Guide](connector-development.md)** — How to build a new connector: BaseIntegrationConnector contract, registration, discovery, fetching, and testing patterns
5. **[Schema Management](schema-management.md)** — DDL generation, type mapping, schema evolution, soft foreign keys, access control, and migration file output

### Operations & Configuration
6. **[Metadata & Configuration](metadata-configuration.md)** — Integration metadata JSON files, mj-sync setup, IntegrationSourceTypes, entity settings, and credential types
7. **[Angular Dashboard](angular-dashboard.md)** — UI components (Control Tower, Connection Studio, Mapping Workspace, Sync Activity), data service, and GraphQL client

## Package Map

```
packages/Integration/
├── engine/           @memberjunction/integration-engine        Core orchestration & types
├── connectors/       @memberjunction/integration-connectors    Built-in connector implementations
├── actions/          @memberjunction/integration-actions       MJ Action for triggering syncs
├── schema-builder/   @memberjunction/integration-schema-builder DDL & metadata generation
├── ui-types/         @memberjunction/integration-ui-types      Angular-safe view model types
├── mock-data/                                                   Test fixture data
└── docs/             (this directory)                           Documentation

packages/MJServer/src/resolvers/
└── IntegrationDiscoveryResolver.ts     GraphQL discovery/schema-preview API

packages/GraphQLDataProvider/src/
└── graphQLIntegrationClient.ts         Client-side GraphQL wrapper

packages/Angular/Explorer/dashboards/src/Integration/
├── components/       Angular UI components (4 tabs)
├── services/         IntegrationDataService
└── integration.module.ts

metadata/
├── integrations/                       Integration definitions (HubSpot, YM, etc.)
├── integration-source-types/           General source type categories
└── applications/                       Dashboard app config
```

## Quick Start

### Run a sync programmatically

```typescript
import { IntegrationOrchestrator } from '@memberjunction/integration-engine';

const orchestrator = new IntegrationOrchestrator();
const result = await orchestrator.RunSync(
    companyIntegrationID,
    contextUser,
    'Manual',
    (progress) => console.log(`${progress.PercentComplete}%`),
    (notification) => sendEmail(notification.Subject, notification.Body)
);
```

### Run a sync via MJ Actions

```typescript
import { RunAction } from '@memberjunction/actions';

const result = await RunAction('Run Integration Sync', {
    CompanyIntegrationID: 'abc-123',
    TriggerType: 'Scheduled'
}, contextUser);
```

### Build a new connector

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseIntegrationConnector } from '@memberjunction/integration-engine';

@RegisterClass(BaseIntegrationConnector, 'MySystemConnector')
export class MySystemConnector extends BaseIntegrationConnector {
    // Implement 4 required methods: TestConnection, DiscoverObjects, DiscoverFields, FetchChanges
}
```

See [Connector Development Guide](connector-development.md) for the full walkthrough.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Connector resolution via `Integration.ClassName`** | The `Integration` entity stores the connector class name. `IntegrationSourceType` is a general category (SaaS API, Database, File Feed) — not per-vendor. |
| **Watermark-based incremental sync** | Minimizes data transfer; each entity map maintains its own watermark (timestamp, cursor, or version token). |
| **Field transform pipelines** | Chainable transforms allow complex mappings without custom code. |
| **Schema-builder emits files only** | DDL is generated as migration files — never executed directly. Human review required before applying. |
| **Record matching before write** | Prevents duplicates via key-field lookup + RecordMap table. Supports conflict resolution strategies. |

## Design Principles

1. **Metadata-driven** — Everything configurable through entities, not code
2. **Provider-agnostic** — The engine works the same regardless of external system
3. **Composable transforms** — Field mappings support a pipeline of transform steps
4. **Incremental sync** — Watermark-based delta detection avoids full-table scans
5. **Observable** — Every sync run produces a detailed audit trail
6. **Multi-tenant aware** — CompanyIntegration isolates credentials and mappings per subsidiary
7. **Fail-safe** — Individual record failures don't abort the run; they're logged and sync continues
8. **File-emission-only** — Schema Builder produces files, never executes DDL at runtime
