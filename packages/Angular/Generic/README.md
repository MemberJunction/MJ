# MemberJunction Generic Angular Components

This directory contains reusable Angular components that can be used in any Angular application, not just the MemberJunction Explorer. These components provide common UI patterns and functionality with MemberJunction integration.

## Overview

The Generic components are designed to be flexible, reusable, and easy to integrate into any Angular application. They handle common UI needs like chat interfaces, data grids, file management, and more, while seamlessly integrating with MemberJunction's entity system and metadata.

## Component Packages

### Foundation

- **[@memberjunction/ng-base-types](./base-types)** - Base types and classes
  - Common interfaces and types
  - Base component classes
  - Event definitions
  - Shared utilities

### Data Display & Editing

- **[@memberjunction/ng-query-grid](./query-grid)** - Query result display
  - Execute SQL queries
  - Display results in grid
  - Export capabilities
  - Virtual scrolling

- **[@memberjunction/ng-join-grid](./join-grid)** - Many-to-many editing
  - Edit junction table records
  - Checkbox or value modes
  - Batch operations
  - Transaction support

- **[@memberjunction/ng-data-context](./data-context)** - Data context UI
  - Manage data contexts
  - Display context items
  - Edit context configurations
  - Import/export contexts

- **[@memberjunction/ng-timeline](./timeline)** - Timeline visualization
  - Display temporal data
  - Event grouping
  - Interactive timeline
  - Custom templates

- **[@memberjunction/ng-tree-list](./tree-list)** - Hierarchical data
  - Tree structure display
  - Expand/collapse nodes
  - Lazy loading
  - Drag and drop

- **[@memberjunction/ng-deep-diff](./deep-diff)** - Object comparison visualization
  - Deep object difference analysis
  - Hierarchical change display
  - Added/removed/modified tracking
  - Export and filtering capabilities

### Forms & Input

- **[@memberjunction/ng-record-selector](./record-selector)** - Record selection
  - Search and select records
  - Single or multiple selection
  - Recent selections
  - Custom filtering

- **[@memberjunction/ng-find-record](./find-record)** - Advanced record search
  - Multi-field search
  - Filter building
  - Search history
  - Saved searches

- **[@memberjunction/ng-code-editor](./code-editor)** - Code editing component
  - Syntax highlighting
  - Multiple languages
  - Themes support
  - CodeMirror integration

### Communication & Collaboration

- **[@memberjunction/ng-chat](./chat)** - Chat interface
  - User/AI messages
  - Markdown support
  - File attachments
  - Real-time updates

- **[@memberjunction/ng-skip-chat](./skip-chat)** - Skip AI integration
  - AI-powered chat
  - Dynamic reports
  - Data visualization
  - Context awareness

- **[@memberjunction/ng-entity-communication](./entity-communication)** - Templated messaging
  - Email/SMS templates
  - Bulk messaging
  - Template preview
  - Provider integration

- **[@memberjunction/ng-notifications](./notifications)** - User notifications
  - Toast notifications
  - Notification center
  - Persistence
  - Actions support

### File & Resource Management

- **[@memberjunction/ng-file-storage](./file-storage)** - File management
  - Upload/download
  - File categories
  - Storage providers
  - Preview support

- **[@memberjunction/ng-resource-permissions](./resource-permissions)** - Permission UI
  - Resource access control
  - Permission requests
  - Role management
  - Sharing interface

### Layout & Navigation

- **[@memberjunction/ng-tab-strip](./tab-strip)** - Tabbed interface
  - Dynamic tabs
  - Closeable tabs
  - Tab overflow
  - State persistence

- **[@memberjunction/ng-generic-dialog](./generic-dialog)** - Modal dialogs
  - Customizable content
  - Standard actions
  - Nested dialogs
  - Responsive sizing

- **[@memberjunction/ng-container-directives](./container-directives)** - Layout helpers
  - Container management
  - Fill parent directives
  - Responsive containers
  - Layout utilities

## Key Features

### MemberJunction Integration
- Entity-aware components
- Metadata-driven behavior
- Permission checking
- Transaction support

### Flexibility
- Standalone usage
- Configurable behavior
- Event-driven architecture
- Extensible design

### Modern Angular
- Angular 21+ features
- Standalone components
- Strong typing
- Reactive patterns

### UI/UX Excellence
- Kendo UI components
- Responsive design
- Accessibility support
- Consistent styling

## Getting Started

### Installation

```bash
# Install individual components as needed
npm install @memberjunction/ng-chat
npm install @memberjunction/ng-query-grid
npm install @memberjunction/ng-file-storage
# etc.
```

### Basic Usage

```typescript
// Import modules
import { ChatModule } from '@memberjunction/ng-chat';
import { QueryGridModule } from '@memberjunction/ng-query-grid';

@NgModule({
  imports: [
    ChatModule,
    QueryGridModule,
    // ... other imports
  ]
})
export class AppModule { }
```

### Component Examples

```html
<!-- Chat Component -->
<lib-chat
  [Messages]="chatMessages"
  [ShowWelcomeScreen]="true"
  [WelcomeItems]="welcomePrompts"
  (SendMessage)="handleChatMessage($event)">
</lib-chat>

<!-- Query Grid -->
<lib-query-grid
  [Query]="sqlQuery"
  [AutoNavigate]="true"
  (DataLoaded)="onQueryComplete($event)">
</lib-query-grid>

<!-- File Storage -->
<lib-file-upload
  [EntityName]="'Attachments'"
  [CategoryID]="categoryId"
  (FileUploaded)="onFileUpload($event)">
</lib-file-upload>
```

## Common Patterns

### Working with Entities

```typescript
import { Metadata } from '@memberjunction/core';

export class MyComponent {
  async loadEntity(entityName: string, id: string) {
    const md = new Metadata();
    const entity = await md.GetEntityObject(entityName);
    await entity.Load(id);
    return entity;
  }
}
```

### Event Handling

```typescript
import { EventCodes } from '@memberjunction/ng-base-types';

// Listen for events
this.sharedService.NotifyObservables(EventCodes.ComponentLoaded, {
  component: 'MyComponent'
});

// Subscribe to events
this.sharedService.ComponentLoadedEvent.subscribe(data => {
  // Handle event
});
```

### Using Base Components

```typescript
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

export class MyComponent extends BaseAngularComponent {
  constructor() {
    super();
    // Component initialization
  }
}
```

## Best Practices

### Component Design
1. **Single Responsibility** - Each component should do one thing well
2. **Configurable** - Provide inputs for customization
3. **Event-Driven** - Emit events for parent interaction
4. **Self-Contained** - Minimize external dependencies
5. **Documented** - Include inline documentation

### Performance
1. **Virtual Scrolling** - For large datasets
2. **Lazy Loading** - Load on demand
3. **Change Detection** - Use OnPush when possible
4. **Debouncing** - For user input
5. **Memoization** - Cache expensive operations

### Integration
1. **Metadata First** - Use entity metadata when available
2. **Permission Aware** - Check permissions appropriately
3. **Transaction Support** - Participate in transactions
4. **Error Handling** - Graceful error recovery
5. **Logging** - Appropriate logging levels

## Styling

Components use:
- Kendo UI theme variables
- CSS custom properties
- BEM naming convention
- Scoped styles
- Responsive breakpoints

### Customization

```scss
// Override component styles
:host ::ng-deep {
  .my-component {
    --primary-color: #007bff;
    --spacing: 1rem;
  }
}
```

## Testing

Components include:
- Unit tests (Jasmine/Karma)
- Integration tests
- Visual regression tests
- Accessibility tests
- Performance tests

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers

## Contributing

When contributing generic components:
1. Ensure true reusability
2. Minimize dependencies
3. Include comprehensive docs
4. Add unit tests
5. Follow Angular best practices
6. Consider accessibility

## License

All generic components follow the same licensing as the MemberJunction project.