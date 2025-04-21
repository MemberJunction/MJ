# @memberjunction/ng-treelist

The `@memberjunction/ng-treelist` package provides a calendar-like visualization component using Kendo UI's Scheduler for displaying MemberJunction entity data in a timeline format. This component allows for chronological display of entity records with time-based properties.

## Features

- Calendar-style visualization of MemberJunction entity data
- Week view display of timeline events
- Support for entity data sources through TimelineGroup configuration
- Customizable event display with title, date, and summary information
- Event styling with custom colors and icons
- Auto-refresh when data sources change
- Optional custom summary generation with configurable functions

## Installation

```bash
npm install @memberjunction/ng-treelist
```

## Requirements

- Angular 18+
- @memberjunction/core and related packages
- Kendo UI Angular components (Scheduler, Layout, Buttons, Indicators)

## Usage

### Basic Usage

First, import the TimelineModule in your module:

```typescript
import { TimelineModule } from '@memberjunction/ng-treelist';

@NgModule({
  imports: [
    // other imports...
    TimelineModule
  ],
})
export class YourModule { }
```

Then, use the component in your template:

```html
<mj-timeline [Groups]="timelineGroups"></mj-timeline>
```

In your component file:

```typescript
import { TimelineGroup } from '@memberjunction/ng-treelist';
import { RunView } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // Create a timeline group for tasks
    const tasksGroup = new TimelineGroup();
    tasksGroup.EntityName = 'Tasks';
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    
    // Load data into the group
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Tasks',
      ResultType: 'entity_object'
    });
    
    if (result && result.Success) {
      tasksGroup.EntityObjects = result.Results;
      this.timelineGroups.push(tasksGroup);
    }
  }
}
```

### Advanced Usage

#### Custom Styling and Summary Functions

You can customize the appearance and content of timeline events:

```typescript
import { TimelineGroup } from '@memberjunction/ng-treelist';
import { BaseEntity } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // Create a meeting events timeline group
    const meetingsGroup = new TimelineGroup();
    meetingsGroup.EntityName = 'Meetings';
    meetingsGroup.TitleFieldName = 'Subject';
    meetingsGroup.DateFieldName = 'StartTime';
    
    // Custom styling
    meetingsGroup.DisplayIconMode = 'custom';
    meetingsGroup.DisplayIcon = 'fa fa-calendar-check';
    meetingsGroup.DisplayColorMode = 'manual';
    meetingsGroup.DisplayColor = '#4287f5';
    
    // Custom summary function
    meetingsGroup.SummaryMode = 'custom';
    meetingsGroup.SummaryFunction = (record: BaseEntity) => {
      return `<strong>Location:</strong> ${record.Get('Location')}<br>
              <strong>Duration:</strong> ${record.Get('DurationMinutes')} minutes<br>
              <strong>Attendees:</strong> ${record.Get('AttendeeCount')}`;
    };
    
    // Load data and add to groups
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Meetings',
      ResultType: 'entity_object'
    });
    
    if (result && result.Success) {
      meetingsGroup.EntityObjects = result.Results;
      this.timelineGroups.push(meetingsGroup);
    }
  }
}
```

#### Using RunView Parameters

You can create a TimelineGroup using the static FromView method:

```typescript
import { TimelineGroup } from '@memberjunction/ng-treelist';
import { RunViewParams } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // Create params for the view
    const params: RunViewParams = {
      EntityName: 'Appointments',
      ExtraFilter: "Status = 'Confirmed'",
      Skip: 0,
      Take: 50,
      OrderBy: 'AppointmentDate DESC'
    };
    
    // Create group from view
    const appointmentsGroup = await TimelineGroup.FromView(params);
    appointmentsGroup.TitleFieldName = 'Title';
    appointmentsGroup.DateFieldName = 'AppointmentDate';
    
    this.timelineGroups.push(appointmentsGroup);
  }
}
```

## API Reference

### TimelineComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Groups` | `TimelineGroup[]` | `[]` | Array of groups to display on the timeline |
| `AllowLoad` | `boolean` | `true` | Whether to load data automatically |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | None | `void` | Refreshes the timeline with current group data |

### TimelineGroup Class

#### Properties

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EntityName` | `string` | (required) | Entity name for the records to display |
| `EntityObjects` | `BaseEntity[]` | `[]` | Array of entity objects to display |
| `TitleFieldName` | `string` | (required) | Field name for event titles |
| `DateFieldName` | `string` | (required) | Field name for event dates |
| `DisplayIconMode` | `'standard' \| 'custom'` | `'standard'` | Icon display mode |
| `DisplayIcon` | `string` | (optional) | Custom icon class for events |
| `DisplayColorMode` | `'auto' \| 'manual'` | `'auto'` | Color selection mode |
| `DisplayColor` | `string` | (optional) | Manual color for events |
| `SummaryMode` | `'field' \| 'custom' \| 'none'` | `'field'` | Mode for summary display |
| `SummaryFunction` | `(record: BaseEntity) => string` | (optional) | Function for custom summary generation |

#### Static Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `FromView` | `RunViewParams` | `Promise<TimelineGroup>` | Creates a TimelineGroup from RunViewParams |

## Styling

The component uses Kendo UI's styling for the scheduler display. You can customize the appearance by targeting the Kendo UI scheduler elements in your CSS.

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/global
- @memberjunction/ng-container-directives
- @memberjunction/ng-entity-form-dialog
- @memberjunction/ng-shared
- @progress/kendo-angular-buttons
- @progress/kendo-angular-layout
- @progress/kendo-angular-indicators
- @progress/kendo-angular-scheduler