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

### IntegrationOrchestrator

- `RunSync(companyIntegrationID, contextUser, triggerType?)` — Executes a full sync run

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
