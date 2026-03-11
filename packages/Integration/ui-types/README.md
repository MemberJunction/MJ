# @memberjunction/integration-ui-types

Lightweight, Angular-safe view model types for the MemberJunction Integration UI.

This package contains only TypeScript interfaces and type aliases with zero runtime dependencies. It is safe to import from Angular components, Node.js services, or any other TypeScript environment.

## Types

| Type | Description |
|------|-------------|
| `IntegrationSummary` | Overview of a company integration's current state |
| `ConnectorHealth` | Health status union: `'Healthy' \| 'Degraded' \| 'Offline' \| 'Unknown'` |
| `RunStatusSummary` | Summary of a single integration run |
| `EntityMapSummary` | Entity map sync configuration summary |
| `IntegrationDashboardStats` | Aggregate stats for dashboard overview |

## Usage

```typescript
import type {
  IntegrationSummary,
  RunStatusSummary,
  ConnectorHealth,
} from '@memberjunction/integration-ui-types';
```
