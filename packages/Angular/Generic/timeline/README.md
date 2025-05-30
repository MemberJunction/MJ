# @memberjunction/ng-timeline

The `@memberjunction/ng-timeline` package provides a comprehensive Angular component for displaying chronological data from MemberJunction entities in a timeline format. Built on top of Kendo UI's Timeline component, it offers a flexible and intuitive way to visualize time-based data from multiple entity sources.

## Features

- **Multiple Data Sources**: Display data from multiple MemberJunction entities on a unified timeline
- **Flexible Orientation**: Support for both vertical and horizontal timeline layouts
- **Data Source Options**: Load data via entity views with filters or provide pre-loaded entity arrays
- **Customizable Display**: Configure title, date, and summary fields for each timeline item
- **Visual Customization**: Support for custom icons and colors for different event groups
- **Interactive UI**: Collapsible event details with alternating layout mode
- **Dynamic Content**: Custom summary generation via callback functions
- **Refresh Control**: Manual control over data loading and refresh operations

## Installation

```bash
npm install @memberjunction/ng-timeline
```

## Requirements

- Angular 18.0.2 or higher
- @memberjunction/core and related MemberJunction packages
- Kendo UI Angular components:
  - @progress/kendo-angular-layout (v16.2.0)
  - @progress/kendo-angular-buttons (v16.2.0)
  - @progress/kendo-angular-indicators (v16.2.0)

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

Display data from multiple entity types on the same timeline with different visual treatments:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { BaseEntity } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // First group - Tasks with custom icon and color
    const tasksGroup = new TimelineGroup();
    tasksGroup.EntityName = 'Tasks';
    tasksGroup.DataSourceType = 'entity';
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    tasksGroup.Filter = "Status = 'Active'"; // Optional filter
    tasksGroup.DisplayIconMode = 'custom';
    tasksGroup.DisplayIcon = 'fa fa-tasks';
    tasksGroup.DisplayColorMode = 'manual';
    tasksGroup.DisplayColor = '#4287f5';
    
    // Second group - Meetings with custom summary
    const meetingsGroup = new TimelineGroup();
    meetingsGroup.EntityName = 'Meetings';
    meetingsGroup.DataSourceType = 'entity';
    meetingsGroup.TitleFieldName = 'Subject';
    meetingsGroup.DateFieldName = 'StartTime';
    meetingsGroup.SummaryMode = 'custom';
    meetingsGroup.SummaryFunction = (record: BaseEntity) => {
      return `<strong>Location:</strong> ${record.Get('Location')}<br/>
              <strong>Duration:</strong> ${record.Get('DurationMinutes')} minutes`;
    };
    
    // Add groups to array
    this.timelineGroups.push(tasksGroup, meetingsGroup);
  }
}
```

#### Using RunView Parameters

Create a TimelineGroup using pre-configured RunViewParams:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunViewParams } from '@memberjunction/core';

export class YourComponent implements OnInit {
  timelineGroups: TimelineGroup[] = [];

  async ngOnInit() {
    // Configure RunViewParams for data retrieval
    const params: RunViewParams = {
      EntityName: 'Tasks',
      ExtraFilter: "Status = 'Open' AND Priority = 'High'",
      Skip: 0,
      Take: 50,
      OrderBy: 'DueDate DESC'
    };
    
    // Create TimelineGroup from view parameters
    const tasksGroup = await TimelineGroup.FromView(params);
    tasksGroup.TitleFieldName = 'Title';
    tasksGroup.DateFieldName = 'DueDate';
    tasksGroup.DisplayIconMode = 'custom';
    tasksGroup.DisplayIcon = 'fa fa-exclamation-circle';
    
    this.timelineGroups.push(tasksGroup);
  }
}
```

#### Using Pre-loaded Entity Arrays

For scenarios where you already have entity data loaded:

```typescript
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { BaseEntity } from '@memberjunction/core';

export class YourComponent {
  timelineGroups: TimelineGroup[] = [];

  displayLoadedData(entities: BaseEntity[]) {
    const group = new TimelineGroup();
    group.EntityName = 'Custom Events';
    group.DataSourceType = 'array'; // Use provided array instead of loading
    group.EntityObjects = entities;
    group.TitleFieldName = 'EventName';
    group.DateFieldName = 'EventDate';
    group.SummaryMode = 'field';
    
    this.timelineGroups = [group];
  }
}
```

#### Deferred Loading

Control when the timeline loads data using the `AllowLoad` property:

```typescript
import { Component, ViewChild } from '@angular/core';
import { TimelineComponent, TimelineGroup } from '@memberjunction/ng-timeline';

@Component({
  template: `
    <mj-timeline 
      #timeline
      [Groups]="timelineGroups" 
      [AllowLoad]="false">
    </mj-timeline>
    <button (click)="loadTimeline()">Load Timeline Data</button>
  `
})
export class YourComponent {
  @ViewChild('timeline') timeline!: TimelineComponent;
  timelineGroups: TimelineGroup[] = [];

  constructor() {
    // Configure groups but don't load yet
    const group = new TimelineGroup();
    group.EntityName = 'Events';
    group.TitleFieldName = 'Name';
    group.DateFieldName = 'EventDate';
    this.timelineGroups = [group];
  }

  async loadTimeline() {
    // Manually trigger data loading
    await this.timeline.Refresh();
  }
}

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
| `SummaryFieldName` | `string` | (optional) | Field name for summary when using 'field' mode (Note: Currently uses TitleFieldName) |
| `SummaryFunction` | `(record: BaseEntity) => string` | (optional) | Function for custom summary generation |

#### Static Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `FromView` | `RunViewParams` | `Promise<TimelineGroup>` | Creates a TimelineGroup from RunViewParams |

## Styling

The component uses Kendo UI's Timeline styling with additional customization options:

- The timeline component automatically applies alternating layout mode for better visual separation
- Events are displayed with collapsible details for better space utilization
- Custom CSS can be applied by targeting the `.wrapper` class or Kendo UI elements
- Icon and color customization per group allows for visual categorization

### CSS Example

```css
/* Custom timeline styling */
mj-timeline .wrapper {
  height: 100%;
  padding: 20px;
}

/* Custom event styling */
mj-timeline .k-timeline-event {
  /* Your custom styles */
}
```

## Integration with MemberJunction

This component is designed to work seamlessly with the MemberJunction framework:

- **Entity System**: Automatically loads and displays data from any MemberJunction entity
- **Metadata Integration**: Leverages MJ's metadata system for entity field access
- **View System**: Supports RunView parameters for flexible data retrieval
- **Container Directives**: Uses `mjFillContainer` directive for responsive layouts
- **Entity Form Dialog**: Can integrate with entity form dialogs for detailed views (future enhancement)

## Performance Considerations

- **Data Loading**: The component loads all data at once. For large datasets, consider using filters or pagination
- **Multiple Groups**: Each group triggers a separate data query. Consolidate groups when possible
- **Refresh Operations**: The `Refresh()` method reloads all groups. Use judiciously for performance

## Dependencies

### Production Dependencies
- @memberjunction/core (^2.43.0)
- @memberjunction/core-entities (^2.43.0)
- @memberjunction/global (^2.43.0)
- @memberjunction/ng-container-directives (^2.43.0)
- @memberjunction/ng-entity-form-dialog (^2.43.0)
- @memberjunction/ng-shared (^2.43.0)
- @progress/kendo-angular-buttons (^16.2.0)
- @progress/kendo-angular-layout (^16.2.0)
- @progress/kendo-angular-indicators (^16.2.0)
- @progress/kendo-angular-scheduler (^16.2.0)
- tslib (^2.3.0)

### Peer Dependencies
- @angular/common (^18.0.2)
- @angular/core (^18.0.2)
- @angular/forms (^18.0.2)
- @angular/router (^18.0.2)

## Building

This package is part of the MemberJunction monorepo. To build:

```bash
# From the package directory
npm run build

# From the monorepo root
turbo build --filter="@memberjunction/ng-timeline"
```

## Future Enhancements

- Support for pagination and virtual scrolling for large datasets
- Integration with entity form dialogs for inline editing
- Custom event templates for advanced display scenarios
- Export functionality for timeline data
- Real-time updates via entity change notifications

## License

ISC