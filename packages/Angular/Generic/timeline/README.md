# @memberjunction/ng-timeline

The `@memberjunction/ng-timeline` package provides a comprehensive timeline component for chronological display of data from MemberJunction entities. The component leverages Kendo UI's Timeline component to render events in either horizontal or vertical orientation.

## Features

- Display data from multiple entity sources on a unified timeline
- Support for both vertical and horizontal timeline orientations
- Configurable data sources via entity views or direct entity arrays
- Customizable event display with title, summary, and date fields
- Support for custom icons and colors for different event groups
- Collapsible event details
- Ability to customize summary display with field values or custom functions
- Dynamic refresh and loading control

## Installation

```bash
npm install @memberjunction/ng-timeline
```

## Requirements

- Angular 18+
- @memberjunction/core and related packages
- Kendo UI Angular components (Layout, Buttons, Indicators)

## Usage

### Basic Usage

First, import the TimelineModule in your module:

```typescript
import { TimelineModule } from '@memberjunction/ng-timeline';

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
<mj-timeline [Groups]="timelineGroups" [DisplayOrientation]="'vertical'"></mj-timeline>
```

In your component file:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';

export class YourComponent {
  timelineGroups: TimelineGroup[] = [];

  constructor() {
    // Create a timeline group using entity data
    const tasksGroup = new TimelineGroup();
    tasksGroup.EntityName = 'Tasks';
    tasksGroup.DataSourceType = 'entity';
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    tasksGroup.Filter = "Status = 'Open'";
    
    // Add the group to the array
    this.timelineGroups.push(tasksGroup);
  }
}
```

### Advanced Usage

#### Using Multiple Data Sources

You can display data from multiple entity types on the same timeline:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunViewParams } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // First group - Tasks
    const tasksGroup = new TimelineGroup();
    tasksGroup.EntityName = 'Tasks';
    tasksGroup.DataSourceType = 'entity';
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    tasksGroup.DisplayIconMode = 'custom';
    tasksGroup.DisplayIcon = 'fa fa-tasks';
    tasksGroup.DisplayColorMode = 'manual';
    tasksGroup.DisplayColor = '#4287f5';
    
    // Second group - Meetings
    const meetingsGroup = new TimelineGroup();
    meetingsGroup.EntityName = 'Meetings';
    meetingsGroup.DataSourceType = 'entity';
    meetingsGroup.TitleFieldName = 'Subject';
    meetingsGroup.DateFieldName = 'StartTime';
    meetingsGroup.SummaryMode = 'custom';
    meetingsGroup.SummaryFunction = (record) => {
      return `<strong>Location:</strong> ${record.Get('Location')}<br/>
              <strong>Duration:</strong> ${record.Get('DurationMinutes')} minutes`;
    };
    
    // Add groups to array
    this.timelineGroups.push(tasksGroup, meetingsGroup);
  }
}
```

#### Using RunView Parameters

You can create a TimelineGroup using the static FromView method:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunViewParams } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // Create RunViewParams
    const params: RunViewParams = {
      EntityName: 'Tasks',
      ExtraFilter: "Status = 'Open'",
      Skip: 0,
      Take: 25,
      OrderBy: 'DueDate DESC'
    };
    
    // Create TimelineGroup from view
    const tasksGroup = await TimelineGroup.FromView(params);
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    
    this.timelineGroups.push(tasksGroup);
  }
}
```

## API Reference

### TimelineComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `DisplayOrientation` | `'horizontal' \| 'vertical'` | `'vertical'` | Orientation of the timeline |
| `Groups` | `TimelineGroup[]` | `[]` | Array of groups to display on the timeline |
| `AllowLoad` | `boolean` | `true` | Whether to load data automatically |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | None | `Promise<void>` | Refreshes the timeline with current group data |

### TimelineGroup Class

#### Properties

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EntityName` | `string` | (required) | Entity name for the records to display |
| `DataSourceType` | `'array' \| 'entity'` | `'entity'` | Specifies data source type |
| `Filter` | `string` | (optional) | Filter to apply when loading entity data |
| `EntityObjects` | `BaseEntity[]` | `[]` | Array of entities when using 'array' data source |
| `TitleFieldName` | `string` | (required) | Field name for event titles |
| `DateFieldName` | `string` | (required) | Field name for event dates |
| `DisplayIconMode` | `'standard' \| 'custom'` | `'standard'` | Icon display mode |
| `DisplayIcon` | `string` | (optional) | Custom icon class for events |
| `DisplayColorMode` | `'auto' \| 'manual'` | `'auto'` | Color selection mode |
| `DisplayColor` | `string` | (optional) | Manual color for events |
| `SummaryMode` | `'field' \| 'custom' \| 'none'` | `'field'` | Mode for summary display |
| `SummaryFunction` | `(record: any) => string` | (optional) | Function for custom summary generation |

#### Static Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `FromView` | `RunViewParams` | `Promise<TimelineGroup>` | Creates a TimelineGroup from RunViewParams |

## Styling

The component uses Kendo UI's styling for the timeline display. You can customize the appearance by targeting the Kendo UI elements or creating custom CSS for your implementation.

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