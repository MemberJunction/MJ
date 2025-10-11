# @memberjunction/ng-tasks

Angular components for task visualization and management with Gantt chart support.

## Features

- 📋 **Simple List View** - Clean hierarchical task list with indentation for subtasks
- 📊 **Gantt Chart View** - Timeline visualization using Frappe Gantt
- 🔄 **View Toggle** - Easy switching between list and Gantt views
- 🎨 **Clean Design** - Modern, minimal UI that matches MemberJunction aesthetics
- 📦 **Standalone Components** - Can be used independently or together
- 🔗 **Dependency Support** - Visualizes task dependencies and relationships

## Installation

This package is part of the MemberJunction monorepo. Install from the repository root:

```bash
npm install
```

## Components

### TaskComponent

Main component that composes SimpleTaskViewer and GanttTaskViewer with view toggle.

```typescript
import { TaskComponent } from '@memberjunction/ng-tasks';

@Component({
  template: `
    <mj-task
      [tasks]="myTasks"
      [title]="'Project Tasks'"
      [description]="'Tasks for the current project'"
      [viewMode]="'simple'"
      (taskClicked)="onTaskClick($event)"
      (viewModeChanged)="onViewModeChange($event)">
    </mj-task>
  `
})
export class MyComponent {
  myTasks: TaskEntity[] = [...];

  onTaskClick(task: TaskEntity) {
    console.log('Task clicked:', task);
  }

  onViewModeChange(mode: TaskViewMode) {
    console.log('View mode changed to:', mode);
  }
}
```

**Inputs:**
- `tasks: TaskEntity[]` - Array of tasks to display
- `title?: string` - Optional header title
- `description?: string` - Optional header description
- `showHeader: boolean` - Whether to show the header (default: true)
- `viewMode: TaskViewMode` - Initial view mode: 'simple' or 'gantt' (default: 'simple')

**Outputs:**
- `taskClicked: EventEmitter<TaskEntity>` - Emitted when a task is clicked
- `viewModeChanged: EventEmitter<TaskViewMode>` - Emitted when view mode changes

### SimpleTaskViewerComponent

Displays tasks in a clean, hierarchical list format.

```typescript
import { SimpleTaskViewerComponent } from '@memberjunction/ng-tasks';

@Component({
  template: `
    <mj-simple-task-viewer
      [tasks]="myTasks"
      (taskClicked)="onTaskClick($event)">
    </mj-simple-task-viewer>
  `
})
export class MyComponent {
  myTasks: TaskEntity[] = [...];
}
```

**Features:**
- Hierarchical display with indentation
- Expand/collapse for tasks with subtasks
- Status icons with color coding
- Due dates and assignee information
- Click to interact with tasks

### GanttTaskViewerComponent

Displays tasks in a Gantt chart timeline using Frappe Gantt.

```typescript
import { GanttTaskViewerComponent } from '@memberjunction/ng-tasks';

@Component({
  template: `
    <mj-gantt-task-viewer
      [tasks]="myTasks"
      (taskClicked)="onTaskClick($event)">
    </mj-gantt-task-viewer>
  `
})
export class MyComponent {
  myTasks: TaskEntity[] = [...];
}
```

**Features:**
- Timeline-based visualization
- Task dependencies with arrows
- Progress indicators
- Interactive task bars
- Hover tooltips with task details
- Multiple view modes (Day, Week, Month)

## Task Data Structure

Tasks must be `TaskEntity` objects from `@memberjunction/core-entities`. Key fields:

```typescript
interface TaskEntity {
  ID: string;
  Title: string;
  Description?: string;
  Status: 'Pending' | 'In Progress' | 'Complete';
  StartDate?: Date;
  DueDate?: Date;
  DependsOnTaskID?: string;  // For task dependencies
  AssignedTo?: string;
  // ... other MJ entity fields
}
```

## Task Dependencies

Tasks can have dependencies using the `DependsOnTaskID` field:

```typescript
const tasks = [
  {
    ID: 'task-1',
    Title: 'Design Database Schema',
    Status: 'Complete',
    StartDate: new Date('2025-01-01'),
    DueDate: new Date('2025-01-05')
  },
  {
    ID: 'task-2',
    Title: 'Implement Backend API',
    Status: 'In Progress',
    StartDate: new Date('2025-01-06'),
    DueDate: new Date('2025-01-15'),
    DependsOnTaskID: 'task-1'  // Depends on task-1
  },
  {
    ID: 'task-3',
    Title: 'Build Frontend UI',
    Status: 'Pending',
    StartDate: new Date('2025-01-16'),
    DueDate: new Date('2025-01-25'),
    DependsOnTaskID: 'task-2'  // Depends on task-2
  }
];
```

In **Simple View**, dependent tasks are indented under their parent tasks.
In **Gantt View**, dependency arrows connect the tasks.

## Styling

The components use a clean, modern design that matches MemberJunction's aesthetic:

- **Colors:** Blue (#3B82F6) for primary actions, gray scale for text
- **Typography:** System fonts with consistent sizing
- **Spacing:** Comfortable padding and margins
- **Icons:** Font Awesome icons throughout

You can customize styles by targeting the component classes or using Angular's view encapsulation.

## Integration with Conversations

The ng-tasks package is designed to work seamlessly with the conversations package:

```typescript
import { TaskComponent } from '@memberjunction/ng-tasks';

@Component({
  selector: 'mj-tasks-full-view',
  imports: [TaskComponent],
  template: `
    <mj-task
      [tasks]="allTasks"
      [title]="'All Tasks'"
      [viewMode]="'simple'"
      (taskClicked)="navigateToTask($event)">
    </mj-task>
  `
})
export class TasksFullViewComponent {
  // ... component implementation
}
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Dependencies

- **Angular:** ^18.0.0
- **Frappe Gantt:** ^0.6.1 (for Gantt view)
- **@memberjunction/core:** ^2.104.0
- **@memberjunction/core-entities:** ^2.104.0

## License

MIT

## Contributing

This package is part of the MemberJunction open-source project. Contributions are welcome!

## Support

For issues or questions, please file an issue on the [MemberJunction GitHub repository](https://github.com/MemberJunction/MJ).
