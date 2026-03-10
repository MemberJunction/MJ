# Plan: Integration Sync Scheduled Job Type

## Goal
Add a new `ScheduledJobType` for integration syncs so that `CompanyIntegration` syncs can run on a cron schedule via the existing scheduling framework — just like agents and actions do today. Include a reusable Angular scheduling package (`packages/Angular/Generic/scheduling/`) with embeddable panel, slide-in panel, and dialog components — following the same architecture as `@memberjunction/ng-credentials`.

## Background
- The scheduling engine already runs on MJAPI startup via `ScheduledJobsService` (configured in `mj.config.cjs` under `scheduledJobs.enabled`) — the Memory Manager agent runs every 15 minutes this way
- Two job drivers exist in `packages/Scheduling/engine/src/drivers/`: `ActionScheduledJobDriver` and `AgentScheduledJobDriver`
- `IntegrationEngine.Instance.RunSync()` handles the full sync pipeline but currently:
  - Only accepts `companyIntegrationID` — **no entity map filtering**
  - Always syncs ALL enabled entity maps (`SyncEnabled=1 AND Status='Active'`)
  - `RunSyncAction` references `EntityMapIDs` in comments but **does not actually pass it through**
- Entity names (ground truth from `MJCoreEntities`):
  - `MJCompanyIntegrationEntity` → `"MJ: Company Integrations"`
  - `MJCompanyIntegrationRunEntity` → `"MJ: Company Integration Runs"`
  - `MJScheduledJobEntity` → `"MJ: Scheduled Jobs"`
  - `MJScheduledJobTypeEntity` → `"MJ: Scheduled Job Types"`
- The scheduling dashboard at `packages/Angular/Explorer/dashboards/src/Scheduling/` has a `job-slideout.component.ts` with a full job editor, but it's **embedded in the dashboard and not reusable**
- The credentials package (`packages/Angular/Generic/credentials/`) provides the ideal pattern: panels (embeddable), dialogs (modal wrappers), and a service for programmatic access

## Architecture

### Configuration Interface
```typescript
interface IntegrationSyncJobConfiguration extends ScheduledJobConfiguration {
    /** Required: Which company integration to sync */
    CompanyIntegrationID: string;

    /** Optional: Subset of entity map IDs to sync. If omitted, syncs all enabled maps. */
    EntityMapIDs?: string[];

    /** Optional: Force full sync vs incremental. Default: false (incremental). */
    FullSync?: boolean;
}
```

This is intentionally minimal — the `CompanyIntegration` record already has all the auth, entity maps, field maps, sync direction, conflict resolution, etc. The scheduled job just says "run this integration" with optional scope narrowing.

### Entity Relationships
```
CompanyIntegration
  └─ ScheduledJobID (FK) ──────────────► ScheduledJob
                                            ├─ CronExpression
                                            ├─ Status, Timezone, etc.
                                            ├─ Configuration (JSON)
                                            └─ JobTypeID ──► ScheduledJobType
                                                                └─ DriverClass = 'IntegrationSyncScheduledJobDriver'

CompanyIntegrationRun
  └─ ScheduledJobRunID (FK) ───────────► ScheduledJobRun
                                            └─ ScheduledJobID (FK) ──► ScheduledJob
```

---

## Implementation Steps

### Step 1: Migration — Schema Changes
**File**: `migrations/v5/V{timestamp}__v5.x_Integration_ScheduledJob_Support.sql`

#### 1a. Add `ScheduledJobRunID` FK to `CompanyIntegrationRun`
Links each integration run back to the scheduled job run that triggered it (NULL for manual runs).

```sql
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD ScheduledJobRunID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD CONSTRAINT FK_CompanyIntegrationRun_ScheduledJobRun
    FOREIGN KEY (ScheduledJobRunID)
    REFERENCES ${flyway:defaultSchema}.ScheduledJobRun(ID);
```

#### 1b. Add `ScheduledJobID` FK to `CompanyIntegration`
Associates a company integration with its scheduled job so the UI can display schedule info directly.

```sql
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD ScheduledJobID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD CONSTRAINT FK_CompanyIntegration_ScheduledJob
    FOREIGN KEY (ScheduledJobID)
    REFERENCES ${flyway:defaultSchema}.ScheduledJob(ID);
```

### Step 2: Metadata — Insert `ScheduledJobType` Record
**Folder**: `metadata/scheduled-job-types/` (create if not exists)
**File**: `metadata/scheduled-job-types/.integration-sync-type.json`

```json
[
  {
    "entity": "MJ: Scheduled Job Types",
    "fields": {
      "Name": "Integration Sync",
      "Description": "Executes a company integration sync, processing all configured entity maps to synchronize data between MemberJunction and the external system.",
      "DriverClass": "IntegrationSyncScheduledJobDriver",
      "DomainRunEntity": "MJ: Company Integration Runs",
      "DomainRunEntityFKey": "ScheduledJobRunID",
      "NotificationsAvailable": true
    }
  }
]
```

Push with `npx mj-sync push`.

### Step 3: Run CodeGen
After the migration, run CodeGen to regenerate:
- `MJCompanyIntegrationRunEntity` with the new `ScheduledJobRunID` getter/setter
- `MJCompanyIntegrationEntity` with the new `ScheduledJobID` getter/setter
- Updated views (`vwCompanyIntegrations`, `vwCompanyIntegrationRuns`) with joined fields
- Updated stored procedures

### Step 4: Enhance `IntegrationEngine.RunSync()` — Entity Map Filtering
**File**: `packages/Integration/engine/src/IntegrationEngine.ts`

`RunSync()` currently loads ALL enabled entity maps with no filtering. Add support for selective sync.

#### 4a. New Options Interface
```typescript
export interface IntegrationSyncOptions {
    /** If provided, only sync these specific entity maps. Otherwise sync all enabled maps. */
    EntityMapIDs?: string[];

    /** Force full sync (ignore last-sync timestamps). Default: false. */
    FullSync?: boolean;

    /** If provided, link the resulting CompanyIntegrationRun to this ScheduledJobRun. */
    ScheduledJobRunID?: string;
}
```

#### 4b. Updated `RunSync()` Signature
Add an optional `options` parameter at the end (backward compatible):

```typescript
public async RunSync(
    companyIntegrationID: string,
    contextUser: UserInfo,
    triggerType: SyncTriggerType = 'Manual',
    onProgress?: OnProgressCallback,
    onNotification?: OnNotificationCallback,
    options?: IntegrationSyncOptions  // NEW
): Promise<SyncResult>
```

#### 4c. Entity Map Filtering Logic
In the internal method that loads entity maps, add filtering when `EntityMapIDs` is provided:

```typescript
// Current filter (always used):
let filter = `CompanyIntegrationID='${companyIntegrationID}' AND SyncEnabled=1 AND Status='Active'`;

// Add entity map ID filtering if specified:
if (options?.EntityMapIDs?.length) {
    const idList = options.EntityMapIDs.map(id => `'${id}'`).join(',');
    filter += ` AND ID IN (${idList})`;
}
```

#### 4d. ScheduledJobRunID Passthrough
When creating the `CompanyIntegrationRun` record, set `ScheduledJobRunID` if provided:

```typescript
if (options?.ScheduledJobRunID) {
    integrationRun.ScheduledJobRunID = options.ScheduledJobRunID;
    // Save happens as part of normal flow, or save explicitly if needed
}
```

#### 4e. Update `RunSyncAction`
**File**: `packages/Integration/actions/src/RunSyncAction.ts`

Update the action to actually pass through the `EntityMapIDs` and `FullSync` params it already declares in comments but never uses:

```typescript
const options: IntegrationSyncOptions = {};
if (entityMapIDs) {
    options.EntityMapIDs = entityMapIDs.split(',').map(id => id.trim());
}
if (fullSync) {
    options.FullSync = fullSync === 'true' || fullSync === true;
}
const result = await IntegrationEngine.Instance.RunSync(
    companyIntegrationID, contextUser, triggerType,
    undefined, undefined, options
);
```

### Step 5: Create `IntegrationSyncScheduledJobDriver`
**File**: `packages/Scheduling/engine/src/drivers/IntegrationSyncScheduledJobDriver.ts`

Lives alongside `ActionScheduledJobDriver.ts` and `AgentScheduledJobDriver.ts` in the same `drivers/` directory.

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob } from '../BaseScheduledJob';
import { ScheduledJobExecutionContext, ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { IntegrationEngine, IntegrationSyncOptions } from '@memberjunction/integration-engine';
import { ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';

interface IntegrationSyncJobConfiguration {
    CompanyIntegrationID: string;
    EntityMapIDs?: string[];
    FullSync?: boolean;
}

@RegisterClass(BaseScheduledJob, 'IntegrationSyncScheduledJobDriver')
export class IntegrationSyncScheduledJobDriver extends BaseScheduledJob {

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<IntegrationSyncJobConfiguration>(context.Schedule);

        this.log(`Starting integration sync for CompanyIntegrationID: ${config.CompanyIntegrationID}`);
        if (config.EntityMapIDs?.length) {
            this.log(`Filtering to ${config.EntityMapIDs.length} entity maps`);
        }

        const syncOptions: IntegrationSyncOptions = {
            EntityMapIDs: config.EntityMapIDs,
            FullSync: config.FullSync ?? false,
            ScheduledJobRunID: context.Run.ID
        };

        const syncResult = await IntegrationEngine.Instance.RunSync(
            config.CompanyIntegrationID,
            context.ContextUser,
            'Scheduled',
            undefined,
            undefined,
            syncOptions
        );

        return {
            Success: syncResult.Success,
            ErrorMessage: syncResult.Success ? undefined : syncResult.ErrorMessage,
            Details: {
                CompanyIntegrationRunID: syncResult.RunID,
                RecordsProcessed: syncResult.RecordsProcessed,
                RecordsCreated: syncResult.RecordsCreated,
                RecordsUpdated: syncResult.RecordsUpdated,
                RecordsDeleted: syncResult.RecordsDeleted,
                RecordsErrored: syncResult.RecordsErrored,
                RecordsSkipped: syncResult.RecordsSkipped,
                EntityMapResults: syncResult.EntityMapResults,
                Duration: syncResult.Duration
            }
        };
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<IntegrationSyncJobConfiguration>(schedule);

            if (!config.CompanyIntegrationID || typeof config.CompanyIntegrationID !== 'string') {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.CompanyIntegrationID',
                    'CompanyIntegrationID is required and must be a string',
                    config.CompanyIntegrationID,
                    ValidationErrorType.Failure
                ));
            }

            if (config.EntityMapIDs !== undefined && !Array.isArray(config.EntityMapIDs)) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.EntityMapIDs',
                    'EntityMapIDs must be an array of strings',
                    config.EntityMapIDs,
                    ValidationErrorType.Failure
                ));
            }

            if (config.FullSync !== undefined && typeof config.FullSync !== 'boolean') {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.FullSync',
                    'FullSync must be a boolean',
                    config.FullSync,
                    ValidationErrorType.Failure
                ));
            }
        } catch (error) {
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                error instanceof Error ? error.message : 'Invalid configuration JSON',
                schedule.Configuration,
                ValidationErrorType.Failure
            ));
        }

        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent {
        const details = result.Details as Record<string, unknown> | undefined;
        const subject = result.Success
            ? `Integration Sync Completed: ${context.Schedule.Name}`
            : `Integration Sync Failed: ${context.Schedule.Name}`;

        let body: string;
        if (result.Success && details) {
            body = [
                `Integration sync completed successfully.`,
                ``,
                `Records Processed: ${details.RecordsProcessed ?? 0}`,
                `  Created: ${details.RecordsCreated ?? 0}`,
                `  Updated: ${details.RecordsUpdated ?? 0}`,
                `  Deleted: ${details.RecordsDeleted ?? 0}`,
                `  Skipped: ${details.RecordsSkipped ?? 0}`,
                `  Errors: ${details.RecordsErrored ?? 0}`,
                ``,
                `Duration: ${details.Duration ?? 'N/A'}`
            ].join('\n');
        } else {
            body = `Integration sync failed.\n\nError: ${result.ErrorMessage ?? 'Unknown error'}`;
        }

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'Integration Sync',
                CompanyIntegrationRunID: details?.CompanyIntegrationRunID
            }
        };
    }
}
```

### Step 6: Export and Register the Driver
**File**: `packages/Scheduling/engine/src/drivers/index.ts`

Add alongside existing exports:
```typescript
export * from './IntegrationSyncScheduledJobDriver';
```

Run `npm run mj:manifest` to ensure tree-shaking prevention picks up the new `@RegisterClass`.

### Step 7: Update Package Dependencies
**File**: `packages/Scheduling/engine/package.json`

Add dependency on integration-engine:
```json
{
  "dependencies": {
    "@memberjunction/integration-engine": "*"
  }
}
```

Run `npm install` at repo root. Dependency is one-directional: `scheduling-engine → integration-engine`. No reverse dependency needed.

### Step 8: Reusable Scheduling Package (Angular)
**New Package**: `@memberjunction/ng-scheduling`
**Location**: `packages/Angular/Generic/scheduling/`

Follows the `@memberjunction/ng-credentials` pattern exactly: panels (embeddable plain components), a slide-in panel (composes the plain component), a dialog (composes the plain component), and a service for programmatic access.

#### 8a. Directory Structure
```
packages/Angular/Generic/scheduling/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── public-api.ts
│   ├── __tests__/
│   │   ├── index.test.ts
│   │   └── exports.test.ts
│   └── lib/
│       ├── scheduling.module.ts
│       ├── panels/
│       │   ├── scheduled-job-editor/
│       │   │   ├── scheduled-job-editor.component.ts
│       │   │   ├── scheduled-job-editor.component.html
│       │   │   └── scheduled-job-editor.component.css
│       │   └── scheduled-job-summary/
│       │       ├── scheduled-job-summary.component.ts
│       │       ├── scheduled-job-summary.component.html
│       │       └── scheduled-job-summary.component.css
│       ├── slide-panel/
│       │   ├── scheduled-job-slide-panel.component.ts
│       │   ├── scheduled-job-slide-panel.component.html
│       │   └── scheduled-job-slide-panel.component.css
│       ├── dialogs/
│       │   └── scheduled-job-dialog.component.ts
│       └── services/
│           └── scheduled-job.service.ts
```

#### 8b. package.json
```json
{
  "name": "@memberjunction/ng-scheduling",
  "version": "2.46.0",
  "description": "Reusable Angular components for viewing and editing MemberJunction Scheduled Jobs",
  "main": "./dist/public-api.js",
  "typings": "./dist/public-api.d.ts",
  "files": ["/dist"],
  "sideEffects": false,
  "scripts": {
    "build": "ngc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@memberjunction/core": "*",
    "@memberjunction/core-entities": "*",
    "@memberjunction/global": "*",
    "@memberjunction/ng-notifications": "*",
    "@memberjunction/ng-shared-generic": "*",
    "rxjs": "~7.8.0",
    "tslib": "^2.3.0"
  },
  "peerDependencies": {
    "@angular/common": "^21.0.0",
    "@angular/core": "^21.0.0",
    "@angular/forms": "^21.0.0",
    "@progress/kendo-angular-dialog": "*",
    "@progress/kendo-angular-buttons": "*"
  }
}
```

#### 8c. tsconfig.json
```json
{
  "extends": "../../../../tsconfig.angular.json",
  "compilerOptions": {
    "outDir": "./dist",
    "paths": { "@angular/*": ["./node_modules/@angular/*"] }
  },
  "angularCompilerOptions": {
    "compilationMode": "partial"
  },
  "include": ["src/**/*.ts"]
}
```

#### 8d. Component Details

##### `ScheduledJobEditorComponent` — The Core Plain Component
**Selector**: `mj-scheduled-job-editor`
**Purpose**: Embeddable form for creating/editing a `MJ: Scheduled Jobs` record. This is the core building block — the slide-in panel and dialog both compose this component.

**Inputs**:
- `ScheduledJobID: string | null` — Pass an ID to load and edit an existing job. NULL = create mode.
- `JobTypeID: string | null` — Pre-select job type (e.g., when creating from integration UI, pre-select "Integration Sync")
- `DefaultConfiguration: string | null` — Pre-populate the Configuration JSON (e.g., `{ "CompanyIntegrationID": "..." }`)
- `HideJobType: boolean` — When true, hide the job type selector (useful when the type is predetermined)

**Outputs**:
- `Saved: EventEmitter<MJScheduledJobEntity>` — Emits on successful save
- `Deleted: EventEmitter<string>` — Emits the deleted job's ID
- `Cancelled: EventEmitter<void>` — Emits when user cancels

**Form Fields** (matching the existing slideout in the scheduling dashboard):
- Name (required), Description
- JobTypeID dropdown (required, loaded from `MJ: Scheduled Job Types`)
- CronExpression (required) with human-readable preview
- Timezone dropdown (IANA timezones)
- Status dropdown (Active, Disabled, Paused, Pending)
- ConcurrencyMode dropdown (Skip, Queue, Concurrent)
- Configuration JSON editor (using `mj-code-editor`)
- NotifyOnSuccess, NotifyOnFailure toggles
- StartAt, EndAt date pickers

**Behavior**:
- `OnPush` change detection with explicit `cdr.markForCheck()` calls
- Uses `Metadata.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs')` for entity creation
- Loads job types via RunView on init (cached in service)
- Validation: `canSave` getter checks Name, JobTypeID, CronExpression are non-empty
- Save/Delete follow the credentials pattern (try/catch, MJNotificationService, emit events)
- In edit mode, shows read-only stats: total runs, success/failure counts, created date, last run

##### `ScheduledJobSummaryComponent` — Compact Read-Only Display
**Selector**: `mj-scheduled-job-summary`
**Purpose**: Compact card showing schedule status at a glance. Useful for embedding in integration detail views or anywhere a job's status needs to be shown inline.

**Inputs**:
- `ScheduledJobID: string | null` — Loads and displays the job's summary
- `ShowEditButton: boolean = true` — Whether to show the edit action

**Outputs**:
- `EditRequested: EventEmitter<string>` — Emits the job ID when edit is clicked

**Display**:
- Job name, status badge (color-coded)
- Cron expression with human-readable description (e.g., "Every 15 minutes")
- Next run time (relative, e.g., "in 12 minutes")
- Last run time + success/failure indicator
- Run statistics (total / success / failure)

##### `ScheduledJobSlidePanelComponent` — Slide-In Panel Wrapper
**Selector**: `mj-scheduled-job-slide-panel`
**Purpose**: Composes `ScheduledJobEditorComponent` inside a slide-in panel with header, backdrop, and close behavior. Follows the same CSS/layout pattern as the credentials slide-in panels.

**Inputs**:
- `IsOpen: boolean` — Controls panel visibility (slides in from right)
- All inputs from `ScheduledJobEditorComponent` passed through: `ScheduledJobID`, `JobTypeID`, `DefaultConfiguration`, `HideJobType`

**Outputs**:
- `Close: EventEmitter<void>` — Emits when panel is closed (backdrop click, X button, or ESC key)
- `Saved: EventEmitter<MJScheduledJobEntity>` — Passed through from editor
- `Deleted: EventEmitter<string>` — Passed through from editor

**Template Structure**:
```html
@if (IsOpen) {
  <div class="slide-panel-backdrop" (click)="closePanel()"></div>
  <div class="slide-panel" [class.open]="IsOpen">
    <div class="slide-panel-header">
      <i class="fa-solid fa-calendar-check"></i>
      <span>{{ ScheduledJobID ? 'Edit Schedule' : 'Create Schedule' }}</span>
      <button (click)="closePanel()"><i class="fa-solid fa-times"></i></button>
    </div>
    <div class="slide-panel-body">
      <mj-scheduled-job-editor
        [ScheduledJobID]="ScheduledJobID"
        [JobTypeID]="JobTypeID"
        [DefaultConfiguration]="DefaultConfiguration"
        [HideJobType]="HideJobType"
        (Saved)="onSaved($event)"
        (Deleted)="onDeleted($event)"
        (Cancelled)="closePanel()">
      </mj-scheduled-job-editor>
    </div>
  </div>
}
```

**CSS**: Fixed panel from right with z-index 1000, backdrop overlay, slide-in animation. Same pattern as credentials panels.

##### `ScheduledJobDialogComponent` — Dialog Wrapper
**Selector**: `mj-scheduled-job-dialog`
**Purpose**: Composes `ScheduledJobEditorComponent` inside a Kendo dialog modal. For cases where a modal is preferred over a slide-in.

**Inputs**:
- `Visible: boolean` — Controls dialog visibility
- All inputs from `ScheduledJobEditorComponent` passed through

**Outputs**:
- `Close: EventEmitter<ScheduledJobDialogResult>` — Emits result with `{ saved: boolean, job?: MJScheduledJobEntity, deleted?: boolean }`

**Template** (inline):
```typescript
template: `
  @if (Visible) {
    <kendo-dialog title="{{ScheduledJobID ? 'Edit Schedule' : 'Create Schedule'}}"
                  (close)="onClose()">
      <mj-scheduled-job-editor
        [ScheduledJobID]="ScheduledJobID"
        [JobTypeID]="JobTypeID"
        [DefaultConfiguration]="DefaultConfiguration"
        [HideJobType]="HideJobType"
        (Saved)="onSaved($event)"
        (Deleted)="onDeleted($event)"
        (Cancelled)="onClose()">
      </mj-scheduled-job-editor>
    </kendo-dialog>
  }
`
```

##### `ScheduledJobService` — Data Loading & Programmatic Access
**Provided in**: `root`
**Purpose**: Caches job types, provides convenience methods for loading jobs, and offers programmatic dialog/panel opening.

```typescript
@Injectable({ providedIn: 'root' })
export class ScheduledJobService {
    private _jobTypes: MJScheduledJobTypeEntity[] = [];
    private _jobTypesLoading: Promise<void> | null = null;

    /** Cached list of all scheduled job types */
    public get JobTypes(): MJScheduledJobTypeEntity[] { return this._jobTypes; }

    /** Load and cache job types (safe to call multiple times) */
    public async LoadJobTypes(): Promise<MJScheduledJobTypeEntity[]> { ... }

    /** Load a single scheduled job by ID */
    public async LoadJob(jobID: string): Promise<MJScheduledJobEntity | null> { ... }

    /** Clear cached data */
    public ClearCache(): void { ... }
}
```

#### 8e. Module
**File**: `scheduling.module.ts`

```typescript
@NgModule({
    declarations: [
        ScheduledJobEditorComponent,
        ScheduledJobSummaryComponent,
        ScheduledJobSlidePanelComponent,
        ScheduledJobDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonsModule,
        SharedGenericModule  // provides mj-loading, mj-code-editor
    ],
    exports: [
        ScheduledJobEditorComponent,
        ScheduledJobSummaryComponent,
        ScheduledJobSlidePanelComponent,
        ScheduledJobDialogComponent
    ]
})
export class SchedulingModule { }
```

All components use `standalone: false` (NgModule-declared) to match the credentials pattern.

#### 8f. public-api.ts
```typescript
/**
 * Public API Surface for @memberjunction/ng-scheduling
 *
 * Reusable Angular components for viewing and editing MemberJunction Scheduled Jobs.
 * - Plain editor component for embedding in any layout
 * - Slide-in panel for side-panel editing
 * - Dialog component for modal editing
 * - Summary component for compact status display
 * - Service for data loading and caching
 */

// Module
export * from './lib/scheduling.module';

// Panel components (embeddable)
export * from './lib/panels/scheduled-job-editor/scheduled-job-editor.component';
export * from './lib/panels/scheduled-job-summary/scheduled-job-summary.component';

// Slide-in panel
export * from './lib/slide-panel/scheduled-job-slide-panel.component';

// Dialog
export * from './lib/dialogs/scheduled-job-dialog.component';

// Services
export * from './lib/services/scheduled-job.service';
```

### Step 9: Refactor Scheduling Dashboard to Use the New Package
**Location**: `packages/Angular/Explorer/dashboards/src/Scheduling/`

The existing `job-slideout.component.ts` contains ~300 lines of embedded editing logic. Refactor to:

1. Import `SchedulingModule` from `@memberjunction/ng-scheduling`
2. Replace the embedded slideout form with `<mj-scheduled-job-slide-panel>`:
   ```html
   <mj-scheduled-job-slide-panel
     [IsOpen]="SlideoutOpen"
     [ScheduledJobID]="SelectedJob?.jobId ?? null"
     (Saved)="onJobSaved($event)"
     (Deleted)="onJobDeleted($event)"
     (Close)="closeSlideout()">
   </mj-scheduled-job-slide-panel>
   ```
3. Remove the old `job-slideout.component.ts` and its associated HTML/CSS
4. The `scheduling-jobs.component.ts` continues to manage the job list, filtering, and slideout open/close state — it just delegates editing to the new reusable component

### Step 10: Integration UI — Add Schedule Section
In the integration detail/edit view (wherever `MJ: Company Integrations` editing happens), add a scheduling section:

1. **If `ScheduledJobID` is NULL** → Show a "Schedule Sync" button that opens the slide panel or dialog:
   ```html
   <button kendoButton (click)="openScheduleCreator()">
     <i class="fa-solid fa-calendar-plus"></i> Schedule Sync
   </button>

   <mj-scheduled-job-slide-panel
     [IsOpen]="SchedulePanelOpen"
     [ScheduledJobID]="null"
     [JobTypeID]="integrationSyncJobTypeID"
     [DefaultConfiguration]="defaultScheduleConfig"
     [HideJobType]="true"
     (Saved)="onScheduleCreated($event)"
     (Close)="SchedulePanelOpen = false">
   </mj-scheduled-job-slide-panel>
   ```
   Where `defaultScheduleConfig = JSON.stringify({ CompanyIntegrationID: this.companyIntegration.ID })`.
   On save, update `CompanyIntegration.ScheduledJobID` with the new job's ID and save the entity.

2. **If `ScheduledJobID` is set** → Show the summary + edit capability:
   ```html
   <mj-scheduled-job-summary
     [ScheduledJobID]="companyIntegration.ScheduledJobID"
     (EditRequested)="openScheduleEditor($event)">
   </mj-scheduled-job-summary>
   ```
   Plus a "Remove Schedule" button that clears `ScheduledJobID` (with confirmation).

### Step 11: Build and Test
1. Run migration
2. Push metadata via `npx mj-sync push`
3. Run CodeGen
4. Build modified packages in dependency order:
   - `@memberjunction/integration-engine` (RunSync options)
   - `@memberjunction/scheduling-engine` (new driver + integration-engine dep)
   - `@memberjunction/ng-scheduling` (new Angular package)
   - `@memberjunction/ng-explorer-dashboards` (refactored to use ng-scheduling)
5. Verify the driver loads via ClassFactory at MJAPI startup (check logs)
6. Create a test scheduled job via metadata:
   ```json
   {
     "Name": "Test Integration Sync - Every 15 Minutes",
     "JobTypeID": "@lookup:MJ: Scheduled Job Types.DriverClass=IntegrationSyncScheduledJobDriver",
     "CronExpression": "0 */15 * * * *",
     "Timezone": "UTC",
     "Status": "Active",
     "Configuration": {
       "CompanyIntegrationID": "<test-company-integration-id>"
     }
   }
   ```
7. Verify execution creates linked `MJ: Company Integration Runs` + `MJ: Scheduled Job Runs` records
8. Verify entity map filtering works by specifying `EntityMapIDs` in config
9. Test Angular components:
   - Editor in create and edit modes
   - Slide panel open/close animation
   - Dialog open/close
   - Summary display with live data
   - Scheduling dashboard still works after refactor
   - Integration UI schedule creation flow

---

## Package Impact Summary

| Package | Change | Type |
|---------|--------|------|
| `migrations/v5/` | Add `ScheduledJobRunID` FK to `CompanyIntegrationRun`, `ScheduledJobID` FK to `CompanyIntegration` | Migration |
| `metadata/scheduled-job-types/` | New folder + `.integration-sync-type.json` | Metadata |
| CodeGen output | Regenerated entity classes, views, stored procs | Generated |
| `@memberjunction/integration-engine` | Add `IntegrationSyncOptions` to `RunSync()`: entity map filtering + `ScheduledJobRunID` passthrough | Enhancement |
| `@memberjunction/scheduling-engine` | New `IntegrationSyncScheduledJobDriver`, new dep on integration-engine | New driver |
| `@memberjunction/ng-scheduling` (NEW) | Editor, Summary, SlidePanel, Dialog components + Service | New package |
| `@memberjunction/ng-explorer-dashboards` | Refactor scheduling dashboard slideout to use `ng-scheduling` | Refactor |
| Integration UI | Add schedule section using `ng-scheduling` components | Enhancement |

## Dependency Graph
```
@memberjunction/ng-scheduling (NEW)
  ├── Used by: ng-explorer-dashboards (Scheduling dashboard — replaces embedded slideout)
  └── Used by: Integration UI (CompanyIntegration detail — schedule creation/editing)

@memberjunction/scheduling-engine
  └── @memberjunction/integration-engine (NEW dep, for IntegrationSyncScheduledJobDriver)
      (No reverse dependency — integration-engine does NOT depend on scheduling-engine)
```

## Implementation Order
1. **Migration** (Step 1) — no dependencies
2. **Metadata** (Step 2) — after migration applied
3. **CodeGen** (Step 3) — after migration
4. **Integration engine enhancement** (Step 4) — after CodeGen
5. **Scheduled job driver** (Steps 5-7) — after Step 4
6. **Angular scheduling package** (Step 8) — can start in parallel with Steps 4-7
7. **Dashboard refactor** (Step 9) — after Step 8
8. **Integration UI** (Step 10) — after Steps 8 + 3
9. **Build and test** (Step 11) — after all above
