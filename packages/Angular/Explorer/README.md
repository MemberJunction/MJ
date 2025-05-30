# MemberJunction Explorer Angular Components

This directory contains Angular components specifically designed for the MemberJunction Explorer application. These components provide the core user interface functionality for browsing, editing, and managing data within MemberJunction.

## Overview

The Explorer components work together to create a complete data management application with navigation, forms, grids, and specialized features like AI integration and dashboard capabilities.

## Component Packages

### Core Infrastructure

- **[@memberjunction/ng-explorer-core](./explorer-core)** - Core Explorer framework
  - Application shell and routing
  - Resource container system
  - Navigation components
  - Authentication integration
  - Form toolbar functionality

- **[@memberjunction/ng-auth-services](./auth-services)** - Authentication services
  - Auth0 provider integration
  - MSAL (Microsoft) provider integration
  - Token management
  - User context handling

- **[@memberjunction/ng-shared](./shared)** - Shared Explorer utilities
  - Base components for navigation and resources
  - Shared services and events
  - Common pipes and utilities

### Data Management

- **[@memberjunction/ng-user-view-grid](./user-view-grid)** - Primary data grid
  - View-based data display
  - In-line editing
  - Export capabilities
  - Custom actions

- **[@memberjunction/ng-list-detail-grid](./list-detail-grid)** - Advanced grid component
  - Master-detail editing
  - Batch operations
  - Transaction support
  - Rich editing features

- **[@memberjunction/ng-simple-record-list](./simple-record-list)** - Basic record listing
  - Simple CRUD operations
  - Quick record selection
  - Lightweight alternative to full grid

- **[@memberjunction/ng-user-view-properties](./user-view-properties)** - View configuration
  - Column management
  - Sort configuration
  - Filter setup
  - View preferences

### Forms and Editing

- **[@memberjunction/ng-base-forms](./base-forms)** - Form foundation
  - Base form components
  - Field rendering
  - Validation framework
  - Form lifecycle management

- **[@memberjunction/ng-core-entity-forms](./core-entity-forms)** - Entity form system
  - Auto-generated forms
  - Custom form support
  - Form registration
  - Dynamic form loading

- **[@memberjunction/ng-entity-form-dialog](./entity-form-dialog)** - Modal form editing
  - Dialog-based editing
  - Form composition
  - Save/cancel workflow

- **[@memberjunction/ng-form-toolbar](./form-toolbar)** - Form action toolbar
  - Save/cancel/delete actions
  - Form state management
  - Navigation controls
  - Custom actions

### Specialized Features

- **[@memberjunction/ng-dashboards](./dashboards)** - Dashboard components
  - AI Dashboard - Model management and monitoring
  - Entity Admin Dashboard - ERD visualization
  - Actions Dashboard - Action configuration

- **[@memberjunction/ng-ask-skip](./ask-skip)** - AI-powered assistant
  - Skip chat integration
  - Dynamic reporting
  - AI-driven insights
  - Conversation management

- **[@memberjunction/ng-record-changes](./record-changes)** - Change tracking
  - Change history display
  - Diff visualization
  - Audit trail UI

- **[@memberjunction/ng-compare-records](./compare-records)** - Record comparison
  - Side-by-side comparison
  - Merge functionality
  - Difference highlighting

### Navigation and UI

- **[@memberjunction/ng-link-directives](./link-directives)** - Smart linking
  - Email links
  - Web links
  - Field-based navigation

- **[@memberjunction/ng-entity-permissions](./entity-permissions)** - Permission UI
  - Entity permission grid
  - Role-based configuration
  - Permission management

- **[@memberjunction/ng-explorer-settings](./explorer-settings)** - Application settings
  - User preferences
  - System configuration
  - Display options

## Integration Architecture

### Component Hierarchy
```
Explorer Shell (explorer-core)
├── Navigation (shared)
├── Authentication (auth-services)
├── Resource Container
│   ├── Data Browser
│   │   ├── User View Grid
│   │   └── List Detail Grid
│   ├── Record Editor
│   │   ├── Entity Forms
│   │   └── Form Toolbar
│   └── Dashboards
│       ├── AI Dashboard
│       ├── Entity Admin
│       └── Actions Dashboard
└── Dialogs/Modals
    ├── Entity Form Dialog
    ├── Compare Records
    └── Settings
```

### Event System
Components communicate through:
- Shared service events
- Angular EventEmitters
- RxJS observables
- MemberJunction event system

### State Management
- Component-level state
- Shared service state
- Route parameters
- Session storage

## Key Features

### Metadata-Driven UI
- Forms generated from entity metadata
- Dynamic field rendering
- Validation from metadata
- Permission-based UI

### Real-Time Updates
- WebSocket integration
- Live data refresh
- Optimistic updates
- Conflict resolution

### Extensibility
- Custom form registration
- Component inheritance
- Event hooks
- Plugin architecture

## Usage Patterns

### Launching the Explorer

```typescript
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';

@NgModule({
  imports: [
    ExplorerCoreModule,
    // ... other modules
  ]
})
export class AppModule { }
```

### Custom Form Registration

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'CustomEntityForm', 'EntityID')
export class CustomEntityForm extends BaseFormComponent {
  // Custom implementation
}
```

### Navigation Integration

```typescript
import { BaseNavigationComponent } from '@memberjunction/ng-shared';

export class MyNavComponent extends BaseNavigationComponent {
  override async LoadData(): Promise<void> {
    // Custom navigation data loading
  }
}
```

## Configuration

### Authentication Setup
Configure authentication providers:
```typescript
{
  auth: {
    type: 'auth0', // or 'msal'
    domain: 'your-domain',
    clientId: 'your-client-id',
    audience: 'your-audience'
  }
}
```

### Grid Configuration
Customize grid behavior:
```typescript
{
  grid: {
    pageSize: 50,
    allowExport: true,
    allowInlineEdit: true,
    virtualScrolling: true
  }
}
```

## Best Practices

1. **Component Composition** - Build complex UIs from smaller components
2. **Event Decoupling** - Use events for loose coupling
3. **Lazy Loading** - Load features on demand
4. **Error Boundaries** - Handle errors gracefully
5. **Performance** - Monitor and optimize rendering

## Development

### Running the Explorer
```bash
# From the MJExplorer package
npm run start:explorer
```

### Building Components
```bash
# Build all Explorer components
npm run build:explorer-components
```

### Testing
```bash
# Run Explorer component tests
npm test
```

## Contributing

When contributing Explorer components:
1. Follow Explorer UI patterns
2. Ensure metadata integration
3. Support permissions
4. Include E2E tests
5. Document in component README

## License

All Explorer components follow the same licensing as the MemberJunction project.