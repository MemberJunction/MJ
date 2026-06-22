# @memberjunction/integration-engine

MemberJunction Integration Engine — orchestration, field mapping, and connector framework for synchronizing external systems with MJ entities.

## Architecture

The integration engine follows a pipeline architecture:

```
External System → Connector → FieldMappingEngine → MatchEngine → MJ Entity Persistence
```

### Core Components

| Component | Responsibility |
|-----------|---------------|
| `BaseIntegrationConnector` | Abstract base for external system connectors |
| `ConnectorFactory` | Resolves connector instances via MJGlobal.ClassFactory |
| `FieldMappingEngine` | Applies field-level transformations from external→MJ fields |
| `MatchEngine` | Determines Create/Update/Delete/Skip for each record |
| `WatermarkService` | Manages incremental sync watermarks |
| `IntegrationOrchestrator` | Top-level coordinator that runs end-to-end sync |

## Quick Start

```typescript
import { IntegrationOrchestrator } from '@memberjunction/integration-engine';

const orchestrator = new IntegrationOrchestrator();
const result = await orchestrator.RunSync(companyIntegrationID, contextUser, 'Manual');

console.log(`Processed: ${result.RecordsProcessed}`);
console.log(`Created: ${result.RecordsCreated}, Updated: ${result.RecordsUpdated}`);
console.log(`Errors: ${result.RecordsErrored}`);
```

## Creating a Custom Connector

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
  BaseIntegrationConnector,
  ConnectionTestResult,
  ExternalObjectSchema,
  ExternalFieldSchema,
  FetchContext,
  FetchBatchResult,
} from '@memberjunction/integration-engine';

@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseIntegrationConnector {
  async TestConnection(companyIntegration, contextUser): Promise<ConnectionTestResult> {
    // Test HubSpot API connectivity
  }

  async DiscoverObjects(companyIntegration, contextUser): Promise<ExternalObjectSchema[]> {
    // Return available HubSpot objects (Contacts, Companies, Deals, etc.)
  }

  async DiscoverFields(companyIntegration, objectName, contextUser): Promise<ExternalFieldSchema[]> {
    // Return fields for a specific HubSpot object
  }

  async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
    // Fetch changed records using HubSpot's API with watermark-based pagination
  }
}
```

## Transform Types

The `FieldMappingEngine` supports 9 transform types configured via JSON in the `TransformPipeline` field:

| Type | Description | Config |
|------|-------------|--------|
| `direct` | Pass-through with optional default | `{ DefaultValue?: unknown }` |
| `regex` | Regex find/replace | `{ Pattern, Replacement, Flags? }` |
| `split` | Split string, extract by index | `{ Delimiter, Index }` |
| `combine` | Merge multiple fields | `{ SourceFields, Separator }` |
| `lookup` | Case-insensitive value mapping | `{ Map, Default? }` |
| `format` | Date/number formatting | `{ FormatString, FormatType }` |
| `coerce` | Type conversion | `{ TargetType: 'string'|'number'|'boolean'|'date' }` |
| `substring` | Extract portion of string | `{ Start, Length? }` |
| `custom` | JavaScript expression | `{ Expression }` |

### Transform Pipeline Example

```json
[
  { "Type": "regex", "Config": { "Pattern": "[^0-9]", "Replacement": "", "Flags": "g" } },
  { "Type": "substring", "Config": { "Start": 0, "Length": 3 } }
]
```

This pipeline strips non-numeric characters then extracts the first 3 digits (e.g., area code from phone number).

### Error Handling

Each transform step can specify `OnError`:
- `"Fail"` (default) — throws, halting the record
- `"Skip"` — skips the field entirely
- `"Null"` — sets the field to null

## API Reference

### Notifications

After a sync completes or fails, an optional `onNotification` callback receives a `SyncNotification` with pre-formatted subject and body text suitable for email delivery:

```typescript
const result = await orchestrator.RunSync(
    companyIntegrationID, contextUser, 'Scheduled',
    undefined,  // onProgress
    (notification) => {
        if (notification.Severity !== 'Info') {
            emailService.send({
                to: 'ops@example.com',
                subject: notification.Subject,
                text: notification.Body,
            });
        }
    }
);
```

**SyncNotification** properties:
- `Event`: `'SyncCompleted'` | `'SyncCompletedWithErrors'` | `'SyncFailed'`
- `Severity`: `'Info'` | `'Warning'` | `'Error'`
- `Subject` / `Body`: human-readable text ready for email
- `Result`: the full `SyncResult` for programmatic access

### IntegrationOrchestrator

- `RunSync(companyIntegrationID, contextUser, triggerType?, onProgress?, onNotification?)` — Executes a full sync run

### FieldMappingEngine

- `Apply(records, fieldMaps, entityName)` — Maps external records to MJ entity fields

### MatchEngine

- `Resolve(records, entityMap, fieldMaps, contextUser)` — Resolves Create/Update/Delete/Skip

### WatermarkService

- `Load(entityMapID, contextUser)` — Loads current watermark
- `Update(entityMapID, newValue, contextUser)` — Updates or creates watermark

### ConnectorFactory

- `Resolve(integration, sourceTypes)` — Creates connector instance via ClassFactory

### BaseIntegrationConnector (abstract)

- `TestConnection(companyIntegration, contextUser)` — Tests external system connectivity
- `DiscoverObjects(companyIntegration, contextUser)` — Lists available external objects
- `DiscoverFields(companyIntegration, objectName, contextUser)` — Lists fields on an object
- `FetchChanges(ctx)` — Fetches a batch of changed records
- `GetDefaultFieldMappings(objectName, entityName)` — Suggests default mappings

## Environment Variables

Operator-tunable knobs read from the process environment. All are optional with safe defaults.

### Schema materialization caps (operator guardrails)

These bound what a `create-tables` / RSU apply (`IntegrationApplyAll` / `ApplyAllBatch` / `ApplySchemaBatch`) may materialize. They are **deliberately env-only — NOT per-connection or GraphQL-settable** — because a cap a user could raise via the same API they apply with would be no guardrail. An over-limit selection is **rejected with a clear error (never truncated)**; discovery still surfaces every object/field, only materialization is capped.

| Var | Default | Effect |
|---|---|---|
| `MJ_INTEGRATION_MAX_TABLES` | unset = unbounded | Max tables a single apply may select; over-limit → apply rejected. |
| `MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE` | unset = unbounded | Max columns any one selected table may have; over-limit → apply rejected. |

### Discovery (stage-2 streaming field discovery — no-describe / file-feed sources only)

Bound the data sample used to build a column corpus + lightweight PK guess (NOT a full scan). Also overridable **per-connection** via `IntegrationSetSyncConfig` (`discoveryBatchSize` / `discoveryMaxRecords` / `discoveryTimeBudgetMs`); precedence is explicit-opts > per-connection Configuration > env > default.

| Var | Default | Effect |
|---|---|---|
| `MJ_INTEGRATION_DISCOVERY_MAX_RECORDS` | 500 | Max records sampled before discovery stops and uses what it gathered. |
| `MJ_INTEGRATION_DISCOVERY_BATCH_SIZE` | 500 | Records per `FetchChanges` page during discovery. |
| `MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS` | 300000 (5 min) | Wall-clock budget for the read-path discovery sweep. |
| `MJ_INTEGRATION_DISCOVERY_COMPOSITE_ROW_CAP` | 2000 | Row cap for composite-PK uniqueness checking. |
| `MJ_INTEGRATION_DISCOVERY_MAX_DISTINCT` | 100000 | Cap on distinct values tracked per field for uniqueness inference. |
| `MJ_INTEGRATION_DISCOVERY_SAMPLE_VALUE_CAP` | 10 | Sample values retained per field (for type/shape inference). |

### Sync / runtime

| Var | Default | Effect |
|---|---|---|
| `MJ_INTEGRATION_FULL_PUSH_MAX_RECORDS` | unset = unbounded | Cap on records pushed in a single full push. |
| `MJ_INTEGRATION_MAX_RUNS_PER_CI` | 100 | Run-history rows retained per CompanyIntegration (≤0 disables pruning). |
| `MJ_INTEGRATION_VERBOSE_RECORD_LOGS` | off | When `true`, emits per-record console logs (structured artifacts are unaffected either way). |
