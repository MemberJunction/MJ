# Integration Dashboard

The Integration dashboard is a 5-tab Angular application built as custom MJ resource components, providing a world-class integration management suite.

## Tab Overview

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Overview** | `OverviewComponent` | Health dashboard with KPIs, pipeline cards, sparklines, activity feed, 7-day bar chart |
| **Pipelines** | `PipelinesComponent` | Visual SVG canvas showing data flow as connected node graphs with animated flow dots |
| **Connections** | `ConnectionsComponent` | Connection card grid with test/configure/sync actions, 4-step wizard for new integrations |
| **Activity** | `ActivityComponent` | Filterable sync history with expandable entity breakdowns and watermark tracking |
| **Schedules** | `SchedulesComponent` | Per-integration schedule management with 24-hour timeline, interval/cron configuration |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                 IntegrationModule                    │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Overview   │  │  Pipelines   │  │ Connections│  │
│  │  (tab 1)    │  │  (tab 2)     │  │  (tab 3)   │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Mapping    │  │  Activity    │  │ Schedules  │  │
│  │ Workspace   │  │  (tab 4)     │  │  (tab 5)   │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │          IntegrationDataService              │    │
│  │  ┌──────────────────────────────────────┐    │    │
│  │  │     GraphQLIntegrationClient         │    │    │
│  │  └──────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## Overview

The default landing tab showing integration health at a glance:

- **Metric Strip** — 5 KPI cards: Total Pipelines, Records Today, Success Rate (conic-gradient ring), Active Now (pulse dot), Avg Duration
- **Pipeline Health Grid** — Responsive card grid, one per CompanyIntegration:
  - Integration icon + name + status dot
  - Visual flow: Source → X entity maps → MJ
  - Stats: last sync, records, duration, errors
  - Sparkline dots for last 5 runs
  - Sync Now button
- **Bottom Split** — 7-day bar chart (left) + activity feed (right)

## Pipelines

Visual SVG canvas showing data pipelines as connected node graphs:

- **Source Nodes** (blue) — Integration icon + name
- **Entity Map Nodes** (purple) — ExternalObject → Entity with field count
- **Destination Nodes** (green) — MJ entity group
- **SVG Bezier Connections** — Animated flow dots traveling along paths
- **Click entity map node** — Slides in detail panel (420px) with field mapping table, transform badges, key/required indicators
- **Zoom controls** — In/Out/Fit with scale range 0.5x–2.0x

## Connections

Card grid layout for managing integration connections:

- **Connection Cards** — Icon, name, status badge, credential info (masked), entity map count, test/configure/sync actions
- **New Connection Wizard** (4-step modal):
  1. Choose Integration — searchable card grid of available integrations
  2. Configure — connection name, company selector, credential picker
  3. Test — connection test with success/error feedback
  4. Quick Setup — toggle discovered objects, auto-create entity maps

## Activity

Filterable sync history with drill-down:

- **Filter Bar** — Status pills, integration dropdown, date range pills, search
- **Summary Strip** — Total runs, successful, failed, records processed
- **Split View** (70/30):
  - Run list with expandable inline entity breakdown
  - Detail panel with entity stats + watermarks tab
- **Error Log** — Dark monospace panel for error details

## Schedules

Per-integration schedule management:

- **24-Hour Timeline** — Visual timeline showing scheduled sync points per integration
- **Schedule Cards** — Toggle enable/disable, schedule type (Manual/Interval/Cron):
  - Interval presets: 5m, 15m, 30m, 1h, 6h, 12h, 24h
  - Cron expression input with human-readable description
  - Common cron presets
- **Lock Status** — Shows if sync is currently running
- **Save/Run Now** — Save schedule changes, trigger immediate sync

### Database Fields

Schedule metadata on CompanyIntegration:
- `ScheduleEnabled`, `ScheduleType`, `ScheduleIntervalMinutes`, `CronExpression`
- `NextScheduledRunAt`, `LastScheduledRunAt`
- `IsLocked`, `LockedAt`, `LockedByInstance`, `LockExpiresAt`

## IntegrationDataService

Injectable Angular service that aggregates data loading:

| Method | Description | Data Source |
|--------|-------------|-------------|
| `LoadIntegrationSummaries()` | All integrations with health | RunViews on multiple entities |
| `LoadSchedules()` | Schedule metadata per integration | RunView on Company Integrations |
| `LoadEntityMapCounts()` | Entity map counts per integration | RunView with client-side aggregation |
| `LoadWatermarks(id)` | Sync watermarks for an integration | RunView on Sync Watermarks |
| `LoadRecentRuns(count)` | N most recent runs | RunView on Company Integration Runs |
| `LoadDailyRecordCounts(days)` | Daily sync counts | RunView with date aggregation |
| `ComputeKPIs(summaries)` | Dashboard KPIs | Client-side aggregation |
| `RunSync(id)` | Trigger manual sync | RunSyncAction via Actions |
| `DiscoverObjects(id)` | External objects | GraphQLIntegrationClient |
| `DiscoverFields(id, obj)` | External fields | GraphQLIntegrationClient |
| `TestConnection(id)` | Connection test | GraphQLIntegrationClient |
| `ResolveIntegrationIcon(name)` | Icon resolution | Shared regex-based icon map |

## Application Registration

Registered in `metadata/applications/.integrations-application.json`:

```json
{
    "DefaultNavItems": [
        { "Label": "Overview", "DriverClass": "IntegrationOverview", "isDefault": true },
        { "Label": "Pipelines", "DriverClass": "IntegrationPipelines" },
        { "Label": "Connections", "DriverClass": "IntegrationConnections" },
        { "Label": "Activity", "DriverClass": "IntegrationActivity" },
        { "Label": "Schedules", "DriverClass": "IntegrationSchedules" }
    ]
}
```

Each component is registered with `@RegisterClass(BaseResourceComponent, 'DriverClassName')`.
