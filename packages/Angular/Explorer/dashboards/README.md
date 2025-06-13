# @memberjunction/ng-dashboards

Angular dashboard components for MemberJunction Explorer, providing comprehensive administrative interfaces for AI operations, entity management, and actions management.

## Purpose and Overview

The `@memberjunction/ng-dashboards` package provides a collection of sophisticated Angular dashboard components designed for the MemberJunction Explorer application. These dashboards offer administrative and monitoring capabilities for various aspects of the MemberJunction platform, including:

- **AI Dashboard**: Manage AI models, prompts, agents, and monitor AI system execution
- **Entity Admin Dashboard**: Visualize and manage database entities with ERD diagrams, filtering, and detailed entity information
- **Actions Management Dashboard**: Configure, monitor, and manage system actions, executions, and scheduled tasks

All dashboards extend the `BaseDashboard` class, providing consistent state management, lifecycle hooks, and communication patterns.

## Installation

```bash
npm install @memberjunction/ng-dashboards
```

## Dependencies

### Peer Dependencies
- `@angular/common`: 18.0.2
- `@angular/core`: 18.0.2
- `@angular/forms`: 18.0.2

### Core Dependencies
- `@memberjunction/core`: Core MemberJunction utilities and types
- `@memberjunction/core-entities`: Entity definitions and extended types
- `@memberjunction/templates-base-types`: Template system base types
- `@memberjunction/ng-container-directives`: Container directive utilities
- `@memberjunction/ng-notifications`: Notification system components
- `@progress/kendo-angular-*`: Kendo UI components for Angular
- `codemirror`: Code editor integration
- `d3`: Data visualization library
- `rxjs`: Reactive extensions for Angular

## Usage

### 1. Import the Module

```typescript
import { DashboardsModule } from '@memberjunction/ng-dashboards';

@NgModule({
  imports: [
    // ... other imports
    DashboardsModule
  ]
})
export class YourModule { }
```

### 2. Using the AI Dashboard

```typescript
import { Component } from '@angular/core';
import { DashboardConfig } from '@memberjunction/ng-dashboards';

@Component({
  template: `
    <mj-ai-dashboard 
      [Config]="dashboardConfig"
      (LoadingComplete)="onLoadingComplete()"
      (Error)="onError($event)"
      (UserStateChanged)="onStateChanged($event)"
      (OpenEntityRecord)="onOpenRecord($event)">
    </mj-ai-dashboard>
  `
})
export class AIManagementComponent {
  dashboardConfig: DashboardConfig = {
    dashboard: dashboardEntity, // DashboardEntityExtended instance
    userState: savedUserState    // Optional: Previously saved state
  };

  onLoadingComplete() {
    console.log('AI Dashboard loaded');
  }

  onError(error: Error) {
    console.error('Dashboard error:', error);
  }

  onStateChanged(state: any) {
    // Save user state for persistence
    localStorage.setItem('ai-dashboard-state', JSON.stringify(state));
  }

  onOpenRecord(event: {EntityName: string, RecordPKey: CompositeKey}) {
    // Handle opening entity records
  }
}
```

### 3. Using the Entity Admin Dashboard

```typescript
@Component({
  template: `
    <mj-entity-admin-dashboard 
      [Config]="dashboardConfig"
      (LoadingComplete)="onLoadingComplete()"
      (UserStateChanged)="onStateChanged($event)">
    </mj-entity-admin-dashboard>
  `
})
export class EntityAdminComponent {
  dashboardConfig: DashboardConfig = {
    dashboard: dashboardEntity
  };
}
```

### 4. Using the Actions Management Dashboard

```typescript
@Component({
  template: `
    <mj-actions-management-dashboard 
      [Config]="dashboardConfig"
      (LoadingComplete)="onLoadingComplete()"
      (UserStateChanged)="onStateChanged($event)">
    </mj-actions-management-dashboard>
  `
})
export class ActionsManagementComponent {
  dashboardConfig: DashboardConfig = {
    dashboard: dashboardEntity
  };
}
```

## API Documentation

### BaseDashboard Class

All dashboards extend the `BaseDashboard` abstract class, which provides:

#### Inputs
- `Config: DashboardConfig` - Dashboard configuration including entity and optional user state

#### Outputs
- `LoadingComplete: EventEmitter<void>` - Emitted when dashboard has finished loading
- `Error: EventEmitter<Error>` - Emitted when an error occurs
- `UserStateChanged: EventEmitter<any>` - Emitted when dashboard state changes (for persistence)
- `Interaction: EventEmitter<any>` - General interaction events
- `OpenEntityRecord: EventEmitter<{EntityName: string, RecordPKey: CompositeKey}>` - Request to open an entity record

#### Methods
- `Refresh(): void` - Reload dashboard data
- `SetVisible(visible: boolean): void` - Notify dashboard of visibility changes

### AI Dashboard Components

The AI Dashboard includes the following sub-components:

- **ModelManagementComponent**: Manage AI models and configurations
- **PromptManagementComponent**: Create and manage AI prompts
- **AgentConfigurationComponent**: Configure AI agents
- **ExecutionMonitoringComponent**: Monitor AI system execution
- **SystemConfigurationComponent**: Configure system-wide AI settings

### Entity Admin Dashboard Components

- **ERDCompositeComponent**: Main ERD visualization and management
- **EntityFilterPanelComponent**: Filter entities by various criteria
- **EntityDetailsComponent**: Detailed entity information display
- **ERDDiagramComponent**: Interactive entity relationship diagram

### Actions Management Dashboard Components

- **ActionsOverviewComponent**: Overview of all system actions
- **ExecutionMonitoringComponent**: Monitor action executions
- **ScheduledActionsComponent**: Manage scheduled actions
- **CodeManagementComponent**: Manage action code
- **EntityIntegrationComponent**: Configure entity integrations
- **SecurityPermissionsComponent**: Manage action permissions

## Configuration Options

### DashboardConfig Interface

```typescript
interface DashboardConfig {
  dashboard: DashboardEntityExtended;  // Dashboard entity from MemberJunction
  userState?: any;                     // Optional saved user state
}
```

### State Management

Each dashboard maintains its own state structure that can be persisted and restored. The state management pattern follows these principles:

1. **State Initialization**: When a dashboard loads, the `loadData()` method checks for user state in the `Config` property and applies it
2. **State Changes**: Components emit state changes via `UserStateChanged` events with debouncing to prevent excessive updates
3. **State Persistence**: Parent components should listen to `UserStateChanged` events and persist the state as needed
4. **State Restoration**: Pass previously saved state through the `Config.userState` property when initializing the dashboard

#### How State Loading Works

When a dashboard component initializes:

```typescript
// In the dashboard's loadData() method
loadData(): void {
  // Check if we have user state in the Config and apply it
  if (this.Config?.userState) {
    this.loadUserState(this.Config.userState);
  }
  
  // Continue with other initialization...
  this.LoadingComplete.emit();
}
```

The `loadUserState()` method then applies the saved state to the component and its sub-components:

```typescript
// Example from AIDashboardComponent
public loadUserState(state: Partial<AIDashboardState>): void {
  if (state.activeTab) {
    this.activeTab = state.activeTab;
  }
  
  // Store sub-component states for when they're rendered
  if (state.executionMonitoringState) {
    this.executionMonitoringState = state.executionMonitoringState;
  }
  // ... other state properties
}
```

#### AI Dashboard State
```typescript
interface AIDashboardState {
  activeTab: string;
  modelManagementState: any;
  promptManagementState: any;
  agentConfigurationState: any;
  executionMonitoringState: ExecutionMonitoringState;
  systemConfigurationState: any;
}

// ExecutionMonitoringState includes detailed UI state
interface ExecutionMonitoringState {
  selectedTimeRange: string;
  refreshInterval: number;
  panelStates: {
    cost: boolean;
    efficiency: boolean;
    executions: boolean;
  };
  drillDownTabs: Array<{
    id: string;
    title: string;
    type: string;
    timestamp?: string;
    metric?: string;
  }>;
  activeTabId: string;
  splitterSizes?: number[];
}
```

#### Entity Admin Dashboard State
```typescript
interface DashboardState {
  filterPanelVisible: boolean;
  filterPanelWidth: number;
  filters: any;
  selectedEntityId: string | null;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  fieldsSectionExpanded: boolean;
  relationshipsSectionExpanded: boolean;
}
```

#### Example: Complete State Management Implementation

```typescript
// Parent component that uses the AI Dashboard
@Component({
  template: `
    <mj-ai-dashboard 
      [Config]="dashboardConfig"
      (UserStateChanged)="onStateChanged($event)">
    </mj-ai-dashboard>
  `
})
export class AIManagementComponent implements OnInit {
  dashboardConfig: DashboardConfig;
  
  ngOnInit() {
    // Load saved state from your persistence layer
    const savedState = this.loadSavedState();
    
    // Configure dashboard with saved state
    this.dashboardConfig = {
      dashboard: this.dashboardEntity,
      userState: savedState  // This will be applied in loadData()
    };
  }
  
  onStateChanged(state: AIDashboardState) {
    // Save state changes with debouncing handled by the dashboard
    this.saveState(state);
  }
  
  private loadSavedState(): AIDashboardState | null {
    // Load from localStorage, database, or other persistence
    const saved = localStorage.getItem('ai-dashboard-state');
    return saved ? JSON.parse(saved) : null;
  }
  
  private saveState(state: AIDashboardState): void {
    // Save to your persistence layer
    localStorage.setItem('ai-dashboard-state', JSON.stringify(state));
  }
}
```

## Integration with MemberJunction

The dashboards are designed to work seamlessly with other MemberJunction packages:

1. **Entity System**: Uses `@memberjunction/core-entities` for entity definitions
2. **Metadata System**: Leverages MemberJunction metadata for dynamic UI generation
3. **Template System**: Integrates with `@memberjunction/templates-base-types`
4. **Global Registry**: Uses `@RegisterClass` decorator for component registration

## Build and Development

### Building the Package

```bash
# From the package directory
npm run build

# From the repository root
turbo build --filter="@memberjunction/ng-dashboards"
```

### Development Mode

The package includes TypeScript configuration for Angular compilation:
- Uses Angular compiler (`ngc`) for building
- Outputs to `./dist` directory
- Generates type definitions

## Special Considerations

1. **Tree Shaking**: The package includes special tree-shaking prevention calls in `public-api.ts` to ensure all dashboard components are included in builds

2. **Icon Libraries**: Uses Font Awesome icons throughout the UI. Ensure Font Awesome is properly configured in your application

3. **State Persistence**: Dashboard state changes are emitted via `UserStateChanged` events - implement persistence in the parent component

4. **Navigation**: AI and Actions dashboards use bottom navigation patterns with icon-based navigation

5. **Responsive Design**: Dashboards are designed to work across different screen sizes with collapsible panels and responsive layouts

## License

ISC