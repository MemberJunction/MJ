# MemberJunction Integration Engine

A pluggable, metadata-driven integration framework for syncing data between external systems (CRMs, AMSes, file feeds) and MemberJunction entities.

## Architecture

```
packages/Integration/
├── engine/          @memberjunction/integration-engine     — Core orchestration
├── connectors/      @memberjunction/integration-connectors — Connector implementations
├── actions/         @memberjunction/integration-actions    — MJ Actions for scheduling
├── ui-types/        @memberjunction/integration-ui-types   — Angular view model types
└── e2e/                                                    — End-to-end test scripts
```

## Quick Start

### Run a sync from code

```typescript
import { IntegrationOrchestrator } from '@memberjunction/integration-engine';

const orchestrator = new IntegrationOrchestrator();
const result = await orchestrator.RunSync(
    companyIntegrationID,
    contextUser,
    'Manual',
    (progress) => console.log(`${progress.PercentComplete}% complete`),
    (notification) => sendEmail(notification.Subject, notification.Body)
);

console.log(`Processed: ${result.RecordsProcessed}, Created: ${result.RecordsCreated}`);
```

### Run a sync via MJ Actions

Create a `MJ: Actions` record with Name = `Run Integration Sync` and register it in the scheduler. The action accepts:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | Yes | ID of the CompanyIntegration to sync |
| `TriggerType` | Input | No | `Manual`, `Scheduled`, or `Webhook` (default: `Manual`) |

## Data Model

The integration engine reads from and writes to these MJ entities:

| Entity | Purpose |
|--------|---------|
| `MJ: Integrations` | Integration type definitions (HubSpot, Salesforce, etc.) |
| `MJ: Integration Source Types` | Available connector drivers |
| `MJ: Company Integrations` | Instance of an integration for a company |
| `MJ: Company Integration Entity Maps` | Maps external objects → MJ entities |
| `MJ: Company Integration Field Maps` | Maps external fields → MJ fields with transforms |
| `MJ: Company Integration Runs` | Audit trail of each sync execution |
| `MJ: Company Integration Run Details` | Per-entity stats for a run |
| `MJ: Company Integration Record Maps` | Tracks external ID ↔ MJ record ID mapping |
| `MJ: Company Integration Sync Watermarks` | Incremental sync state per entity map |

## Key Concepts

**Watermarks** — Each entity map stores a watermark (timestamp, cursor, or version token) that marks the last successfully synced position. On the next run, the connector fetches only records modified after the watermark.

**Field Transforms** — Each field map can have a `TransformPipeline` JSON array that chains transform steps: `direct`, `regex`, `split`, `combine`, `lookup`, `format`, `coerce`, `substring`, `custom`.

**Record Matching** — Before writing records, the match engine checks: (1) key field matching via SQL filter, (2) CompanyIntegrationRecordMap lookup, (3) conflict resolution strategy.

**Notifications** — After a sync completes or fails, the orchestrator emits a `SyncNotification` with a pre-formatted subject and body suitable for email delivery.

## Packages

- **[engine/README.md](engine/README.md)** — Engine API and orchestration details
- **[connectors/README.md](connectors/README.md)** — Built-in connectors and how to create new ones
- **[actions/README.md](actions/README.md)** — MJ Actions integration and scheduling
