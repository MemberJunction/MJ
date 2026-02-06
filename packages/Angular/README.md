# MemberJunction Angular Components

This directory contains Angular components, directives, and services that provide the user interface layer for MemberJunction applications. The packages are organized into Explorer-specific components and generic reusable components.

## Overview

The MemberJunction Angular packages provide a comprehensive set of UI components built with Angular 21+ and Kendo UI. These components handle everything from basic form fields to complex data grids, AI-powered chat interfaces, and complete application shells.

## Package Structure

### Explorer Components

Located in the [Explorer](./Explorer) subdirectory - components **specific to the MemberJunction Explorer** application:

- **[@memberjunction/ng-explorer-core](./Explorer/explorer-core)** - Core Explorer application framework
- **[@memberjunction/ng-auth-services](./Explorer/auth-services)** - Authentication services supporting Auth0 and MSAL
- **[@memberjunction/ng-dashboards](./Explorer/dashboards)** - Dashboard components for AI, Entity Admin, and Actions
- **[@memberjunction/ng-ask-skip](./Explorer/ask-skip)** - AI-powered Skip chat integration
- And many more...

### Generic Components

Located in the [Generic](./Generic) subdirectory - reusable components for any Angular application:

- **[@memberjunction/ng-base-types](./Generic/base-types)** - Base classes and types for all Angular components
- **[@memberjunction/ng-chat](./Generic/chat)** - Flexible chat interface component
- **[@memberjunction/ng-data-context](./Generic/data-context)** - Data context management UI
- **[@memberjunction/ng-query-grid](./Generic/query-grid)** - Query result display grid
- And many more...

## Key Features

### Modern Angular Patterns
- Angular 21+ with standalone components
- Modern control flow syntax (`@if`, `@for`, `@switch`)
- Reactive forms with strong typing
- RxJS for state management
- Full TypeScript support

### Kendo UI Integration
- Professional UI components
- Consistent theming
- Accessibility compliance
- Responsive design
- Rich data visualization

### MemberJunction Integration
- Entity-aware components
- Metadata-driven forms
- Permission-based UI
- Real-time data updates
- Transaction support

## Getting Started

### Installation

```bash
# Install base types (required for most components)
npm install @memberjunction/ng-base-types

# Install specific components as needed
npm install @memberjunction/ng-user-view-grid
npm install @memberjunction/ng-chat
# etc.
```

### Basic Usage

```typescript
// Import modules
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { ChatModule } from '@memberjunction/ng-chat';

@NgModule({
  imports: [
    UserViewGridModule,
    ChatModule,
    // ... other imports
  ]
})
export class AppModule { }
```

### Component Example

```html
<!-- User View Grid -->
<ng-user-view-grid 
  [viewID]="viewId"
  [allowEditing]="true"
  (recordSelected)="onRecordSelect($event)">
</ng-user-view-grid>

<!-- Chat Component -->
<lib-chat
  [Messages]="messages"
  [ShowWelcomeScreen]="true"
  (SendMessage)="handleMessage($event)">
</lib-chat>
```

## Component Categories

### Data Display
- **User View Grid** - Display and edit data from views
- **Query Grid** - Execute and display query results
- **List Detail Grid** - Master-detail data editing
- **Simple Record List** - Basic record listing
- **Timeline** - Temporal data visualization

### Forms & Input
- **Base Forms** - Foundation for entity forms
- **Entity Forms** - Auto-generated and custom forms
- **Record Selector** - Record picker with search
- **Code Editor** - Syntax-highlighted code editing
- **Find Record** - Advanced record search

### Navigation & Layout
- **Tab Strip** - Tabbed interface component
- **Container Directives** - Layout helpers
- **Link Directives** - Smart linking system
- **Tree List** - Hierarchical data display

### AI & Communication
- **Chat** - Conversational interfaces
- **Skip Chat** - AI-powered assistant
- **Entity Communication** - Templated messaging
- **Notifications** - User notification system

### Visualization
- **Dashboards** - Pre-built dashboard layouts
- **Timeline** - Event timeline display
- **Compare Records** - Side-by-side comparison
- **Record Changes** - Change history viewer

### Files & Resources
- **File Storage** - File upload and management
- **Resource Permissions** - Permission management UI
- **Shared Resources** - Shared component utilities

## Development Guidelines

### Angular Best Practices
Follow the guidelines in [CLAUDE.md](./CLAUDE.md):
- Use modern Angular syntax
- Implement proper change detection
- Follow reactive patterns
- Ensure accessibility

### Component Architecture
1. **Extend Base Classes** - Use provided base classes for consistency
2. **Metadata Integration** - Leverage MemberJunction metadata
3. **Permission Checks** - Implement security appropriately
4. **Error Handling** - Provide user-friendly error messages
5. **Performance** - Use virtual scrolling for large datasets

### Styling
- Use Kendo UI theme variables
- Follow BEM naming conventions
- Ensure responsive design
- Support dark mode where applicable

## Common Patterns

### Working with Entities

```typescript
import { BaseEntity, Metadata } from '@memberjunction/core';

// Load entity using metadata
const md = new Metadata();
const entity = await md.GetEntityObject<CustomerEntity>('Customers');
await entity.Load(customerId);
```

### Using Base Components

```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

export class MyFormComponent extends BaseFormComponent {
  // Implement required methods
  async Load(): Promise<void> {
    // Custom loading logic
  }
}
```

### Event Handling

```typescript
// Subscribe to shared events
this.sharedService.InvokeManualEvent(EventCodes.RefreshData, { 
  entityName: 'Customers' 
});
```

## Performance Optimization

1. **Virtual Scrolling** - Use for large datasets
2. **Lazy Loading** - Load modules on demand
3. **Change Detection** - Use OnPush where possible
4. **Debouncing** - Throttle user input
5. **Caching** - Cache metadata and static data

## Testing

Components should include:
- Unit tests with Jasmine/Karma
- Component integration tests
- E2E tests with Cypress/Playwright
- Accessibility testing
- Visual regression tests

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome)

## Contributing

When contributing Angular components:
1. Follow Angular style guide
2. Include comprehensive documentation
3. Add unit tests
4. Ensure accessibility compliance
5. Update relevant README files
6. Follow the patterns in CLAUDE.md

## License

All Angular packages follow the same licensing as the MemberJunction project.