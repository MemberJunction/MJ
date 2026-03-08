# Sync Lifecycle

Detailed walkthrough of what happens during a sync run, from trigger to completion.

## 1. Triggering a Sync

Three ways to start a sync:

| Method | How | When |
|--------|-----|------|
| **Manual** | Angular UI "Run Now" button or `orchestrator.RunSync()` | Ad-hoc testing, one-off imports |
| **Scheduled** | MJ Action `Run Integration Sync` via scheduler | Recurring syncs (hourly, daily) |
| **Webhook** | External system calls MJ endpoint | Real-time event-driven sync |

All three ultimately call `IntegrationOrchestrator.RunSync()`.

## 2. Concurrency Control

Before starting, the orchestrator checks for an in-progress sync on the same `CompanyIntegrationID`:

- If a sync is already running, the new caller **waits** for it to complete (returns the same Promise)
- This prevents duplicate concurrent syncs that could cause data conflicts
- Lock is case-insensitive on the CompanyIntegrationID

## 3. Configuration Loading

`LoadRunConfiguration()` fires 3 parallel RunView queries:

1. **CompanyIntegration** — The instance record with credentials and settings
2. **EntityMaps** — Active maps ordered by priority, filtered to `SyncEnabled=1 AND Status='Active'`
3. **Integrations** — All integration definitions (to find the parent Integration)

Then resolves the connector: `ConnectorFactory.Resolve(integration)` → instantiates the registered connector class.

## 4. Run Record Creation

Creates a `CompanyIntegrationRun` record to track this execution:

```
Status: 'Running'
TriggerType: 'Manual' | 'Scheduled' | 'Webhook'
StartedAt: now
```

## 5. Entity Map Processing

Each entity map is processed sequentially (ordered by Priority):

### 5a. Watermark Loading

`WatermarkService.Load(entityMapID)` retrieves the last sync position:

| Watermark Type | Example Value | Used By |
|---------------|---------------|---------|
| `timestamp` | `2026-03-05T12:00:00Z` | Most API connectors |
| `cursor` | `abc123nextpage` | Pagination-based APIs |
| `version` | `42` | Version-numbered systems |

If no watermark exists (first sync), the connector fetches all records.

### 5b. Fetching Records

The connector's `FetchChanges(ctx)` method is called with:

```typescript
interface FetchContext {
    CompanyIntegration: ICompanyIntegration;
    EntityMap: ICompanyIntegrationEntityMap;
    FieldMaps: ICompanyIntegrationFieldMap[];
    Watermark: WatermarkType | null;
    ContextUser: UserInfo;
    BatchSize: number;  // Default: 200
}
```

Returns a `FetchBatchResult`:

```typescript
interface FetchBatchResult {
    Records: ExternalRecord[];
    HasMore: boolean;
    NewWatermark?: WatermarkType;
}
```

If `HasMore` is true, the orchestrator calls `FetchChanges` again with the updated watermark. This continues until all records are fetched.

### 5c. Field Mapping

`FieldMappingEngine.Apply(records, fieldMaps)` transforms each external record:

1. For each field map, reads the source field value from the external record
2. Applies the transform pipeline (if configured)
3. Writes the result to the destination field name

See [Field Mapping & Transforms](field-mapping.md) for pipeline details.

### 5d. Record Matching

`MatchEngine.Resolve(mappedRecords, entityMap, fieldMaps)` determines what to do with each record:

```
For each record:
  1. Check CompanyIntegrationRecordMap for existing external ID → MJ record mapping
  2. If not found, search by key fields (SQL filter on destination entity)
  3. Apply conflict resolution strategy:
     - SourceWins: always overwrite destination
     - DestWins: skip if destination has changes
     - Manual: flag for human review (future)
  4. Assign ChangeType: Create | Update | Delete | Skip
```

**Delete detection**: If a connector supports deletes (soft or hard), it includes a `_deleted` flag on records. The MatchEngine checks the `DeleteBehavior` setting:

| DeleteBehavior | Action |
|---------------|--------|
| `SoftDelete` | Set `IsDeleted=true` on the MJ record |
| `HardDelete` | Delete the MJ record entirely |
| `Skip` | Ignore deleted records |

### 5e. Writing Records

For each resolved record:

| ChangeType | Action |
|------------|--------|
| **Create** | `entity = md.GetEntityObject()` → set fields → `entity.Save()` → create RecordMap entry |
| **Update** | Load existing entity by ID → update changed fields → `entity.Save()` → update RecordMap |
| **Delete** | Load entity → `entity.Delete()` or set IsDeleted → remove/update RecordMap |
| **Skip** | No action (conflict resolution decided to skip) |

All writes use `WithRetry()` for transient failure handling.

### 5f. Watermark Update

After successful processing of a batch (or all batches), `WatermarkService.Update()` persists the new watermark value from `FetchBatchResult.NewWatermark`.

### 5g. Run Detail

A `CompanyIntegrationRunDetail` record is created for each entity map:

```
EntityMapID, RecordsProcessed, RecordsCreated, RecordsUpdated,
RecordsDeleted, RecordsErrored, RecordsSkipped, ErrorJSON
```

## 6. Finalization

### On Success

```
Run.Status = 'Completed'
Run.EndedAt = now
Run.RecordsProcessed = sum of all details
```

### On Partial Success (errors but not fatal)

```
Run.Status = 'CompletedWithErrors'
Run.ErrorJSON = first 10 errors
```

### On Failure (fatal error)

```
Run.Status = 'Failed'
Run.ErrorJSON = error details
```

## 7. Notifications

After finalization, a `SyncNotification` is emitted:

```typescript
interface SyncNotification {
    Type: 'Success' | 'PartialSuccess' | 'Failure';
    Subject: string;     // e.g., "Integration Sync Completed: HubSpot"
    Body: string;        // HTML-formatted summary with record counts
    CompanyIntegrationID: string;
    RunID: string;
}
```

The caller's `onNotification` callback receives this — typically wired to email delivery.

## Error Classification

Errors are classified for intelligent handling:

| Category | Examples | Behavior |
|----------|----------|----------|
| **Retryable** | Network timeout, 429 rate limit, connection reset | Retry with exponential backoff |
| **Critical** | Auth failure, missing entity, schema mismatch | Stop immediately, fail the run |
| **Record-level** | Validation error, duplicate key, constraint violation | Log, skip record, continue |

The `ClassifyError()` function categorizes errors based on error codes, messages, and HTTP status codes.

## Retry Strategy

`WithRetry()` configuration:

```typescript
{
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2
}
```

Delays: 1s → 2s → 4s (with jitter). Only retries errors classified as retryable.
