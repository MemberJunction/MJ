# Event Abstract Submission UI - Complete Rebuild Plan

**Date:** 2025-10-31
**Status:** Planning Phase
**Goal:** Build clean, MJ-pattern-compliant Angular UI for Event Abstract Submission demo

---

## Problems with Existing Code

### ❌ What Was Wrong
1. **Over-engineered**: Used ReactiveFormsModule + FormBuilder unnecessarily
2. **Wrong UI library**: Mixed Angular Material + Kendo (MJ standard is Kendo only)
3. **No real data**: All mock data with fake delays
4. **Custom complexity**: Custom animations, markdown editor, progress tracking
5. **Ignored MJ patterns**: Didn't extend BaseFormComponent properly
6. **Empty dashboards**: Just placeholder text

### ✅ What We're Keeping
- Project structure (/forms, /dashboards, /workflows, /services)
- module.ts exports structure
- Entity imports from `mj_generatedentities`

---

## MJ Patterns Learned from Explorer

### Dashboard Pattern (from AI Dashboard)
```typescript
@Component({
  selector: 'mj-event-management-dashboard',
  templateUrl: './event-management-dashboard.component.html',
  styleUrls: ['./event-management-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'EventManagement')
export class EventManagementDashboardComponent extends BaseDashboard {
  public activeTab = 'overview';
  public selectedIndex = 0;
  public navigationItems = ['overview', 'submissions', 'speakers'];

  // Use RunView for data loading
  // Emit state changes via UserStateChanged
  // Handle tab navigation with proper change detection
}
```

**Key Learnings:**
- Extend `BaseDashboard`
- Use `@RegisterClass` for MJ registration
- `ChangeDetectionStrategy.OnPush` for performance
- Tab-based navigation with state management
- `UserStateChanged` event emitter for persistence
- Lazy loading of tab content

### Form Pattern (from Action Form)
```typescript
@Component({
  selector: 'mj-submission-form',
  templateUrl: './submission-form.component.html',
  styleUrls: ['../../shared/form-styles.css']
})
@RegisterClass(BaseFormComponent, 'Submissions')
export class SubmissionFormComponent extends BaseFormComponent {
  public record!: SubmissionEntity;

  // That's it! BaseFormComponent handles:
  // - Loading/saving
  // - Validation
  // - Change tracking
  // - Navigation
}
```

**Key Learnings:**
- Extend `BaseFormComponent`
- Use `@RegisterClass` with entity name
- Declare typed `record` property
- NO FormGroup, NO validators, NO manual save logic
- Use MJ form field components in template

### Data Loading Pattern
```typescript
// Use RunView for queries
const rv = new RunView();
const result = await rv.RunView<SubmissionEntity>({
  EntityName: 'Submissions',
  ExtraFilter: `EventID='${eventId}'`,
  ResultType: 'entity_object'
});

if (result.Success) {
  this.submissions = result.Results || [];
}

// Use GetEntityObject for new records
const md = new Metadata();
const newSubmission = await md.GetEntityObject<SubmissionEntity>('Submissions');
```

---

## New UI Architecture

### Component Structure
```
/Demos/EventAbstractSubmission/code/UI/src/
├── module.ts                          # Keep existing
├── public-api.ts                      # Keep existing
├── dashboards/
│   ├── event-management/
│   │   ├── event-management-dashboard.component.ts
│   │   ├── event-management-dashboard.component.html
│   │   └── event-management-dashboard.component.scss
│   ├── abstract-submission/
│   │   ├── abstract-submission-dashboard.component.ts
│   │   ├── abstract-submission-dashboard.component.html
│   │   └── abstract-submission-dashboard.component.scss
│   └── components/                    # Shared dashboard widgets
│       ├── kpi-card.component.ts
│       ├── submission-list.component.ts
│       ├── speaker-list.component.ts
│       └── status-badge.component.ts
├── forms/
│   ├── event-form/
│   │   ├── event-form.component.ts
│   │   └── event-form.component.html
│   ├── submission-form/
│   │   ├── submission-form.component.ts
│   │   └── submission-form.component.html
│   ├── speaker-form/
│   │   ├── speaker-form.component.ts
│   │   └── speaker-form.component.html
│   └── shared/
│       └── form-styles.css            # Shared form styling
├── workflows/                         # Future: workflow visualization
│   └── (empty for now)
└── services/                          # Real MJ data services
    ├── event.service.ts
    ├── submission.service.ts
    └── speaker.service.ts
```

---

## Implementation Plan

### Phase 1: Clean Out Old Code (15 minutes)

**Delete these files:**
```bash
# Delete all old implementations
rm -rf src/forms/*/
rm -rf src/dashboards/*/
rm -rf src/workflows/*/
rm -rf src/services/*.ts
rm -rf src/models/*.ts

# Keep only:
# - module.ts
# - public-api.ts
# - package.json
# - tsconfig.json
# - angular.json
```

**Update module.ts:**
- Remove all Angular Material imports
- Remove ReactiveFormsModule
- Keep only Kendo UI imports
- Keep BaseFormsModule, DashboardsModule
- Remove all component declarations (we'll add back as we build)

### Phase 2: Event Management Dashboard (1 hour)

**Purpose**: List all events with metrics, allow event selection

**Features:**
- Grid/list view of events (use Kendo Grid)
- KPI cards: Total Events, Total Submissions, Active Speakers
- Quick actions: Create Event, View Submissions
- Filter by event status

**Template Structure:**
```html
<div class="event-dashboard">
  <!-- Header with KPIs -->
  <div class="kpi-section">
    <mj-kpi-card title="Total Events" [value]="totalEvents" icon="calendar"></mj-kpi-card>
    <mj-kpi-card title="Submissions" [value]="totalSubmissions" icon="document"></mj-kpi-card>
    <mj-kpi-card title="Speakers" [value]="totalSpeakers" icon="user"></mj-kpi-card>
  </div>

  <!-- Events List -->
  <kendo-card class="events-card">
    <kendo-card-header>
      <h3>Events</h3>
      <button kendoButton (click)="createEvent()">Create Event</button>
    </kendo-card-header>
    <kendo-card-body>
      <kendo-grid [data]="events" [height]="600">
        <kendo-grid-column field="Name" title="Event Name"></kendo-grid-column>
        <kendo-grid-column field="StartDate" title="Start Date"></kendo-grid-column>
        <kendo-grid-column field="Status" title="Status"></kendo-grid-column>
        <kendo-grid-command-column title="Actions">
          <ng-template kendoGridCellTemplate let-dataItem>
            <button kendoButton (click)="viewEvent(dataItem)">View</button>
          </ng-template>
        </kendo-grid-command-column>
      </kendo-grid>
    </kendo-card-body>
  </kendo-card>
</div>
```

**Data Loading:**
```typescript
async loadDashboardData() {
  const rv = new RunView();

  // Load events
  const eventsResult = await rv.RunView<EventEntity>({
    EntityName: 'Events',
    ResultType: 'entity_object'
  });
  this.events = eventsResult.Results || [];

  // Load submissions count
  const submissionsResult = await rv.RunView<SubmissionEntity>({
    EntityName: 'Submissions',
    ResultType: 'entity_object'
  });
  this.totalSubmissions = submissionsResult.Results?.length || 0;
}
```

### Phase 3: Abstract Submission Dashboard (1.5 hours)

**Purpose**: Detailed view of submissions for a specific event

**Features:**
- Tab-based navigation: Overview | Submissions | Speakers | Analytics
- Submission list with status filters
- Speaker profiles
- Basic analytics (submission counts by status/type)

**Template Structure:**
```html
<div class="submission-dashboard">
  <!-- Navigation Tabs -->
  <kendo-tabstrip [selected]="selectedIndex" (tabSelect)="onTabChange($event)">
    <kendo-tabstrip-tab [title]="'Overview'">
      <ng-template kendoTabContent>
        <!-- KPI cards and summary -->
        <div class="overview-section">
          <mj-kpi-card title="Total Submissions" [value]="submissions.length"></mj-kpi-card>
          <mj-kpi-card title="Accepted" [value]="acceptedCount"></mj-kpi-card>
          <mj-kpi-card title="Under Review" [value]="reviewCount"></mj-kpi-card>
        </div>

        <!-- Recent submissions -->
        <kendo-card>
          <kendo-card-header><h3>Recent Submissions</h3></kendo-card-header>
          <kendo-card-body>
            <mj-submission-list [submissions]="recentSubmissions" [limit]="10"></mj-submission-list>
          </kendo-card-body>
        </kendo-card>
      </ng-template>
    </kendo-tabstrip-tab>

    <kendo-tabstrip-tab [title]="'Submissions'">
      <ng-template kendoTabContent>
        <!-- Full submissions grid -->
        <kendo-grid [data]="submissions">
          <kendo-grid-column field="SubmissionTitle" title="Title"></kendo-grid-column>
          <kendo-grid-column field="Status" title="Status">
            <ng-template kendoGridCellTemplate let-dataItem>
              <mj-status-badge [status]="dataItem.Status"></mj-status-badge>
            </ng-template>
          </kendo-grid-column>
          <kendo-grid-command-column>
            <ng-template kendoGridCellTemplate let-dataItem>
              <button kendoButton (click)="editSubmission(dataItem)">Edit</button>
            </ng-template>
          </kendo-grid-command-column>
        </kendo-grid>
      </ng-template>
    </kendo-tabstrip-tab>

    <kendo-tabstrip-tab [title]="'Speakers'">
      <ng-template kendoTabContent>
        <mj-speaker-list [speakers]="speakers"></mj-speaker-list>
      </ng-template>
    </kendo-tabstrip-tab>
  </kendo-tabstrip>
</div>
```

### Phase 4: Form Components (45 minutes)

**Event Form:**
```typescript
@Component({
  selector: 'mj-event-form',
  template: `
    <kendo-card>
      <kendo-card-header>
        <h3>{{ record?.ID ? 'Edit Event' : 'New Event' }}</h3>
      </kendo-card-header>
      <kendo-card-body>
        <mj-form-field [record]="record" fieldName="Name"></mj-form-field>
        <mj-form-field [record]="record" fieldName="StartDate"></mj-form-field>
        <mj-form-field [record]="record" fieldName="EndDate"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Status"></mj-form-field>
      </kendo-card-body>
      <kendo-card-actions>
        <button kendoButton (click)="Save()">Save</button>
        <button kendoButton (click)="Cancel()">Cancel</button>
      </kendo-card-actions>
    </kendo-card>
  `
})
@RegisterClass(BaseFormComponent, 'Events')
export class EventFormComponent extends BaseFormComponent {
  public record!: EventEntity;
}
```

**Submission Form:**
```typescript
@Component({
  selector: 'mj-submission-form',
  template: `
    <kendo-card>
      <kendo-card-header>
        <h3>{{ record?.ID ? 'Edit Submission' : 'New Submission' }}</h3>
      </kendo-card-header>
      <kendo-card-body>
        <mj-form-field [record]="record" fieldName="SubmissionTitle"></mj-form-field>
        <mj-form-field [record]="record" fieldName="SubmissionAbstract"></mj-form-field>
        <mj-form-field [record]="record" fieldName="SubmissionType"></mj-form-field>
        <mj-form-field [record]="record" fieldName="EventID"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Status"></mj-form-field>
        <mj-form-field [record]="record" fieldName="TechLevel"></mj-form-field>
        <mj-form-field [record]="record" fieldName="TargetAudience"></mj-form-field>
      </kendo-card-body>
      <kendo-card-actions>
        <button kendoButton (click)="Save()">Save</button>
        <button kendoButton (click)="Cancel()">Cancel</button>
      </kendo-card-actions>
    </kendo-card>
  `
})
@RegisterClass(BaseFormComponent, 'Submissions')
export class SubmissionFormComponent extends BaseFormComponent {
  public record!: SubmissionEntity;
}
```

**Speaker Form:**
```typescript
@Component({
  selector: 'mj-speaker-form',
  template: `
    <kendo-card>
      <kendo-card-header>
        <h3>{{ record?.ID ? 'Edit Speaker' : 'New Speaker' }}</h3>
      </kendo-card-header>
      <kendo-card-body>
        <mj-form-field [record]="record" fieldName="FirstName"></mj-form-field>
        <mj-form-field [record]="record" fieldName="LastName"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Email"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Company"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Title"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Bio"></mj-form-field>
        <mj-form-field [record]="record" fieldName="LinkedIn"></mj-form-field>
        <mj-form-field [record]="record" fieldName="Twitter"></mj-form-field>
      </kendo-card-body>
      <kendo-card-actions>
        <button kendoButton (click)="Save()">Save</button>
        <button kendoButton (click)="Cancel()">Cancel</button>
      </kendo-card-actions>
    </kendo-card>
  `
})
@RegisterClass(BaseFormComponent, 'Speakers')
export class SpeakerFormComponent extends BaseFormComponent {
  public record!: SpeakerEntity;
}
```

### Phase 5: Shared Components (30 minutes)

**KPI Card Component:**
```typescript
@Component({
  selector: 'mj-kpi-card',
  template: `
    <kendo-card class="kpi-card">
      <kendo-card-body>
        <div class="kpi-icon">
          <span class="k-icon k-i-{{icon}}"></span>
        </div>
        <div class="kpi-content">
          <div class="kpi-value">{{ value }}</div>
          <div class="kpi-title">{{ title }}</div>
        </div>
      </kendo-card-body>
    </kendo-card>
  `,
  styles: [`
    .kpi-card { display: flex; min-width: 200px; }
    .kpi-icon { font-size: 48px; color: #3b82f6; margin-right: 16px; }
    .kpi-value { font-size: 32px; font-weight: bold; }
    .kpi-title { font-size: 14px; color: #666; }
  `]
})
export class KpiCardComponent {
  @Input() title: string = '';
  @Input() value: number = 0;
  @Input() icon: string = 'info-circle';
}
```

**Status Badge Component:**
```typescript
@Component({
  selector: 'mj-status-badge',
  template: `
    <kendo-chip [label]="status" [rounded]="'full'" [type]="getChipType()"></kendo-chip>
  `
})
export class StatusBadgeComponent {
  @Input() status: string = '';

  getChipType(): 'success' | 'error' | 'warning' | 'info' {
    const statusMap: { [key: string]: any } = {
      'Accepted': 'success',
      'Rejected': 'error',
      'Under Review': 'info',
      'New': 'warning',
      'Draft': 'info'
    };
    return statusMap[this.status] || 'info';
  }
}
```

### Phase 6: Services (30 minutes)

**Real MJ Data Services (No Mocks!):**

```typescript
@Injectable({ providedIn: 'root' })
export class EventService {

  async getEvents(): Promise<EventEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<EventEntity>({
      EntityName: 'Events',
      OrderBy: 'StartDate DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getEventById(id: string): Promise<EventEntity | null> {
    const md = new Metadata();
    const event = await md.GetEntityObject<EventEntity>('Events');
    const loaded = await event.Load(id);
    return loaded ? event : null;
  }

  async createEvent(): Promise<EventEntity> {
    const md = new Metadata();
    return await md.GetEntityObject<EventEntity>('Events');
  }
}
```

```typescript
@Injectable({ providedIn: 'root' })
export class SubmissionService {

  async getSubmissionsByEvent(eventId: string): Promise<SubmissionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<SubmissionEntity>({
      EntityName: 'Submissions',
      ExtraFilter: `EventID='${eventId}'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSubmissionStatistics(eventId: string): Promise<{
    total: number;
    accepted: number;
    underReview: number;
    rejected: number;
  }> {
    const submissions = await this.getSubmissionsByEvent(eventId);

    return {
      total: submissions.length,
      accepted: submissions.filter(s => s.Status === 'Accepted').length,
      underReview: submissions.filter(s => s.Status === 'Under Review').length,
      rejected: submissions.filter(s => s.Status === 'Rejected').length
    };
  }
}
```

---

## Updated module.ts

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Only
import { CardModule } from '@progress/kendo-angular-layout';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

// MemberJunction
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { DashboardsModule } from '@memberjunction/ng-dashboards';

// Dashboards
import { EventManagementDashboardComponent } from './dashboards/event-management/event-management-dashboard.component';
import { AbstractSubmissionDashboardComponent } from './dashboards/abstract-submission/abstract-submission-dashboard.component';

// Forms
import { EventFormComponent } from './forms/event-form/event-form.component';
import { SubmissionFormComponent } from './forms/submission-form/submission-form.component';
import { SpeakerFormComponent } from './forms/speaker-form/speaker-form.component';

// Shared Components
import { KpiCardComponent } from './dashboards/components/kpi-card.component';
import { StatusBadgeComponent } from './dashboards/components/status-badge.component';
import { SubmissionListComponent } from './dashboards/components/submission-list.component';
import { SpeakerListComponent } from './dashboards/components/speaker-list.component';

// Services
import { EventService } from './services/event.service';
import { SubmissionService } from './services/submission.service';
import { SpeakerService } from './services/speaker.service';

@NgModule({
  declarations: [
    // Dashboards
    EventManagementDashboardComponent,
    AbstractSubmissionDashboardComponent,

    // Forms
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent,

    // Shared Components
    KpiCardComponent,
    StatusBadgeComponent,
    SubmissionListComponent,
    SpeakerListComponent
  ],
  imports: [
    CommonModule,

    // Kendo UI
    CardModule,
    ButtonsModule,
    GridModule,
    LayoutModule,
    IndicatorsModule,

    // MemberJunction
    BaseFormsModule,
    DashboardsModule
  ],
  providers: [
    EventService,
    SubmissionService,
    SpeakerService
  ],
  exports: [
    // Dashboards
    EventManagementDashboardComponent,
    AbstractSubmissionDashboardComponent,

    // Forms
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent
  ]
})
export class EventAbstractSubmissionModule { }
```

---

## Testing Plan

1. **Build Test**: `cd code/UI && npm run build`
2. **Load in MJExplorer**:
   - Add dashboard to navigation
   - Test event CRUD operations
   - Test submission list/create/edit
   - Verify speaker management
3. **Data Flow Test**:
   - Create event via form
   - Create submissions via form
   - Create speakers via form
   - Verify relationships (SubmissionSpeakers)
4. **Agent Integration Test**:
   - Run Event Abstract Submission Flow Agent
   - Verify records appear in dashboards
   - Check data integrity

---

## Success Criteria

✅ All components use proper MJ patterns (BaseFormComponent, BaseDashboard)
✅ Kendo UI only (no Angular Material)
✅ Real data loading via RunView (no mocks)
✅ Forms use mj-form-field (no ReactiveFormsModule)
✅ Dashboards have tab navigation with state persistence
✅ Clean, minimal templates (< 100 lines per component)
✅ Shared components for reusability
✅ Services use proper MJ data access patterns
✅ Builds without errors
✅ Integrates seamlessly with MJExplorer

---

## Next Steps After Implementation

1. **Add Workflow Visualization** (Phase 2):
   - Submission pipeline component
   - Review process tracker
   - Status transitions

2. **Add Agent Integration** (Phase 2):
   - "Run Agent" button on event dashboard
   - Real-time agent execution monitoring
   - Display agent run results

3. **Add Analytics** (Phase 3):
   - Charts for submission trends
   - Speaker statistics
   - Review time metrics

4. **Add Notifications** (Phase 3):
   - Toast notifications for CRUD operations
   - Status change notifications
   - Agent completion notifications
