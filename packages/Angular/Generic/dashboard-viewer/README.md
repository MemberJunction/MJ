# @memberjunction/ng-dashboard-viewer

Angular component for rendering configurable dashboards with draggable/resizable panels using Golden Layout 2.

## Architecture

This package uses a **single source of truth** design where Golden Layout's native `ResolvedLayoutConfig` stores both layout geometry AND panel configuration data.

### Key Design Principles

1. **No Redundancy**: Panel data is stored ONLY in Golden Layout's `componentState` within the layout tree. There is no separate `panels[]` array to keep in sync.

2. **Native GL Format**: We store Golden Layout's `ResolvedLayoutConfig` directly without conversion. This preserves all layout properties (widths, heights, positions, stacks) losslessly.

3. **Layout IS the Data**: The layout configuration contains everything needed to restore a dashboard - both the visual arrangement and the panel configurations.

## Data Model

```typescript
interface DashboardConfig {
    /** Golden Layout configuration - THE SINGLE SOURCE OF TRUTH */
    layout: ResolvedLayoutConfig | null;
    /** Dashboard-level settings (not per-panel) */
    settings: DashboardSettings;
}

interface DashboardPanel {
    id: string;
    title: string;
    icon?: string;
    partTypeId: string;
    config: PanelConfig;
    state?: Record<string, unknown>;
}
```

Panel data is embedded in each component's `componentState` within the Golden Layout tree. To extract panels, use the utility function:

```typescript
import { extractPanelsFromLayout, findPanelInLayout } from '@memberjunction/ng-dashboard-viewer';

const panels = extractPanelsFromLayout(config.layout);
const panel = findPanelInLayout(config.layout, 'panel-id');
```

## Usage

### Basic Usage

```html
<mj-dashboard-viewer
    [dashboard]="dashboard"
    [isEditing]="isEditMode"
    (dashboardSaved)="onSaved($event)"
    (panelInteraction)="onInteraction($event)">
</mj-dashboard-viewer>
```

### Adding Panels

```typescript
@ViewChild(DashboardViewerComponent) viewer: DashboardViewerComponent;

addPanel() {
    this.viewer.addPanel(
        'part-type-id',
        { type: 'View', entityName: 'Customers', displayMode: 'grid', ... },
        'Customer List',
        'fa-solid fa-users'
    );
}
```

## Panel Types

- **View**: Entity grid/card/timeline views
- **Query**: Query results with parameters
- **Artifact**: MJ artifact rendering
- **WebURL**: Embedded iframe content
- **Custom**: Custom components via `@RegisterClass`

## Golden Layout Integration

The `GoldenLayoutWrapperService` provides a clean Angular interface to Golden Layout 2.6.0's VirtualLayout API:

- Initialize with saved layout or empty
- Add/remove panels
- Handle layout change events
- Manage edit mode (drag/drop/resize/close)

Layout is destroyed and recreated when toggling edit mode to ensure proper Golden Layout state.

## Module

Import the module to use the dashboard viewer:

```typescript
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';

@NgModule({
    imports: [DashboardViewerModule]
})
export class MyModule {}
```
