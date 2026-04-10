# @memberjunction/integration-actions

MJ Actions for triggering MemberJunction integration syncs. Connects the Integration Engine to the MJ Actions + Scheduling system.

## Installation

This package is registered as a workspace package. Add it as a dependency and import it so the `@RegisterClass` decorator fires:

```typescript
// In your bootstrap or entry point:
import '@memberjunction/integration-actions';
```

## Actions

### Run Integration Sync

**Action Name**: `Run Integration Sync`

Triggers a full sync run for a `MJ: Company Integration` record.

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `CompanyIntegrationID` | Input | string | Yes | ID of the CompanyIntegration to sync |
| `TriggerType` | Input | string | No | `Manual`, `Scheduled`, or `Webhook` (default: `Manual`) |
| `RecordsProcessed` | Output | number | — | Total records processed |
| `RecordsCreated` | Output | number | — | Records created in MJ |
| `RecordsUpdated` | Output | number | — | Records updated in MJ |
| `RecordsDeleted` | Output | number | — | Records deleted in MJ |
| `RecordsErrored` | Output | number | — | Records that encountered errors |
| `RecordsSkipped` | Output | number | — | Records that were skipped |
| `ErrorSummary` | Output | string | — | JSON array of first 10 errors (only when errors exist) |

**Result Codes**:
- `SUCCESS` — Sync completed without errors
- `SYNC_COMPLETED_WITH_ERRORS` — Sync completed but some records failed
- `MISSING_PARAMETER` — Required `CompanyIntegrationID` not provided
- `UNEXPECTED_ERROR` — Unhandled exception during sync

## Scheduling via MJ Scheduler

1. Create an `MJ: Actions` record for `Run Integration Sync`
2. Create an `MJ: Action Params` record for `CompanyIntegrationID`
3. Set up a Scheduled Job pointing to this action
4. The scheduler calls the action on the configured cadence

## Usage from Code

```typescript
import '@memberjunction/integration-actions'; // ensure registration
import { ActionEngine } from '@memberjunction/actions';

const engine = ActionEngine.Instance;
const result = await engine.RunAction({
    ActionName: 'Run Integration Sync',
    ContextUser: currentUser,
    Params: [
        { Name: 'CompanyIntegrationID', Type: 'Input', Value: 'your-ci-id' },
        { Name: 'TriggerType', Type: 'Input', Value: 'Scheduled' },
    ],
});
```

## Direct Orchestrator Usage

For server-side code that doesn't go through the Actions system:

```typescript
import { IntegrationOrchestrator } from '@memberjunction/integration-engine';

const orchestrator = new IntegrationOrchestrator();
const result = await orchestrator.RunSync(
    companyIntegrationID,
    contextUser,
    'Manual',
    (progress) => console.log(`${progress.PercentComplete}%`),
    (notification) => console.log(notification.Subject)
);
```
