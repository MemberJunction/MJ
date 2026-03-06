# Angular Dashboard

The Integration dashboard is a 4-tab Angular application built as a custom MJ resource component.

## Tab Overview

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Control Tower** | `ControlTowerComponent` | Overview dashboard with KPIs, health cards, activity feed |
| **Connection Studio** | `ConnectionStudioComponent` | Test connections, discover objects/fields |
| **Mapping Workspace** | `MappingWorkspaceComponent` | Configure entity maps, field mappings, schema preview |
| **Sync Activity** | `SyncActivityComponent` | Run history, error drill-down, watermark status |

## Architecture

```
┌──────────────────────────────────────────────┐
│              IntegrationModule               │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │ControlTower │  │  ConnectionStudio    │   │
│  │  (tab 1)    │  │    (tab 2)           │   │
│  └─────────────┘  └──────────────────────┘   │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │  Mapping    │  │   SyncActivity       │   │
│  │ Workspace   │  │    (tab 4)           │   │
│  │  (tab 3)    │  │                      │   │
│  └─────────────┘  └──────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │      IntegrationDataService         │    │
│  │  ┌──────────────────────────────┐   │    │
│  │  │ GraphQLIntegrationClient     │   │    │
│  │  └──────────────────────────────┘   │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

## Control Tower

The landing tab shows:

- **Integration Cards** — One card per active CompanyIntegration, showing:
  - Integration name and health status (Healthy/Degraded/Offline/Unknown)
  - Last sync time
  - Entity map count
  - "Run Now" button
- **KPIs** — Active integrations, records synced today, failed runs in 24h
- **Activity Feed** — Recent sync events across all integrations
- **Daily Record Chart** — 7-day bar chart of synced record counts

### Data Loading

```typescript
async LoadData(): Promise<void> {
    const [summaries, runs, dailyCounts] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(this.Provider),
        this.dataService.LoadRecentRuns(20, this.Provider),
        this.dataService.LoadDailyRecordCounts(7, this.Provider),
    ]);
    this.KPIs = this.dataService.ComputeKPIs(summaries);
}
```

## Connection Studio

For testing connectivity and exploring external schemas:

- **Connection Test** — Calls `TestConnection()` on the resolved connector, displays success/failure with server version
- **Object Discovery** — Lists all available objects from the external system
- **Field Discovery** — Select an object to see its fields with types and constraints
- **Schema Preview** — Select objects to generate DDL preview

### GraphQL Queries Used

```typescript
// Client-side calls
await this.dataService.TestConnection(companyIntegrationID);
await this.dataService.DiscoverObjects(companyIntegrationID);
await this.dataService.DiscoverFields(companyIntegrationID, objectName);
```

## Mapping Workspace

The most complex tab — allows users to configure entity maps and field mappings.

### Layout

Three-panel flexbox layout:

```
┌────────────┬────────────────────────┬───────────────┐
│  Left      │      Center            │    Right      │
│  Panel     │      Panel             │    Panel      │
│            │                        │               │
│ Integration│  Field mapping editor  │  Last run     │
│ selector   │  Auto-map banner       │  details      │
│            │  Data preview          │               │
│ Add Map    │  Pending entity view   │               │
│ button     │                        │               │
│            │                        │               │
│ Map list   │                        │               │
│ (real +    │                        │               │
│  pending)  │                        │               │
└────────────┴────────────────────────┴───────────────┘
```

### Key Features

**Source Object Discovery**
- Select a CompanyIntegration → auto-discovers available objects via dropdown
- Results cached per integration to avoid redundant API calls

**Target Mode Toggle**
- **Existing Entity** — Map to an existing MJ entity (combobox picker)
- **New Entity** — Define a new entity: schema name, table name, entity name → generates DDL

**Pending Entity Maps**
- When mapping to a new entity, a `PendingMapEntry` tracks progress:
  - Step 1: DDL Generated (file preview)
  - Step 2: Migration Applied (manual)
  - Step 3: CodeGen Run (manual)
  - Step 4: Ready to Map (field mappings can be configured)

**Auto Field Mapping**
- After saving an entity map, discovers source fields and destination fields
- Matches by name (case-insensitive)
- Shows banner: "Auto-mapped X of Y fields"

**Data Preview**
- Source preview: fetches sample records from the external system
- Destination preview: loads records from the MJ entity via RunView

### State Management

The component manages two types of maps:

```typescript
// Real maps - persisted in DB as CompanyIntegrationEntityMap records
EntityMaps: CompanyIntegrationEntityMapEntity[] = [];

// Pending maps - local state, not yet in DB (target entity doesn't exist)
PendingMaps: PendingMapEntry[] = [];

// Combined for display
get AllMaps(): MapListItem[] {
    return [...realMapItems, ...pendingMapItems];
}
```

## Sync Activity

Run history and error analysis:

- **Run History Table** — All runs for the selected integration, sorted by most recent
  - Status, trigger type, start/end time, duration
  - Record counts (processed, created, updated, deleted, errored)
- **Error Drill-Down** — Click a run to see detailed errors with entity map and record context
- **Watermark Status** — Current watermark values for each entity map

## IntegrationDataService

Injectable Angular service that aggregates data loading:

| Method | Description | Data Source |
|--------|-------------|-------------|
| `LoadIntegrationSummaries()` | All integrations with health | RunViews on multiple entities |
| `LoadRecentRuns(count)` | N most recent runs | RunView on CompanyIntegrationRuns |
| `LoadDailyRecordCounts(days)` | Daily sync counts | RunView with date aggregation |
| `ComputeKPIs(summaries)` | Dashboard KPIs | Client-side aggregation |
| `RunSync(id)` | Trigger manual sync | RunSyncAction via Actions |
| `DiscoverObjects(id)` | External objects | GraphQLIntegrationClient |
| `DiscoverFields(id, obj)` | External fields | GraphQLIntegrationClient |
| `TestConnection(id)` | Connection test | GraphQLIntegrationClient |
| `PreviewSourceData(id, obj)` | Source data preview | Stub (needs server endpoint) |
| `PreviewDestinationData(entity, n)` | Dest data preview | RunView on target entity |

## GraphQLIntegrationClient

Client-side wrapper in `@memberjunction/graphql-dataprovider`:

```typescript
import { GraphQLIntegrationClient } from '@memberjunction/graphql-dataprovider';

const client = new GraphQLIntegrationClient(dataProvider);
const objects = await client.DiscoverObjects(companyIntegrationID);
const fields = await client.DiscoverFields(companyIntegrationID, 'contacts');
const test = await client.TestConnection(companyIntegrationID);
const preview = await client.PreviewSchema(companyIntegrationID, objects);
```

## Application Registration

The Integration app is registered in `metadata/applications/.integrations-application.json` with nav items pointing to each tab's resource component:

```json
{
    "DefaultNavItems": [
        { "Label": "Control Tower", "DriverClass": "IntegrationControlTower", "isDefault": true },
        { "Label": "Connection Studio", "DriverClass": "IntegrationConnectionStudio" },
        { "Label": "Mapping Workspace", "DriverClass": "IntegrationMappingWorkspace" },
        { "Label": "Sync Activity", "DriverClass": "IntegrationSyncActivity" }
    ]
}
```

Each component is registered with `@RegisterClass(BaseResourceComponent, 'DriverClassName')`.
