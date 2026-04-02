# @memberjunction/ng-clustering

Reusable Angular components for interactive cluster visualization. Provides an SVG scatter plot, a floating configuration panel, and a headless clustering service that wraps K-Means, DBSCAN, UMAP, and PCA into a single pipeline.

## Architecture

```
+---------------------------+       +-------------------------------+
|  mj-cluster-config-panel  |       |     mj-cluster-scatter        |
|  (floating config UI)     |       |     (SVG scatter plot)        |
|                           |       |                               |
|  Entity picker            |       |  Points + Clusters -> dots    |
|  Algorithm (K-Means/DBSCAN)|      |  Zoom / Pan via viewBox       |
|  Distance metric          |       |  Tooltip on hover             |
|  Run / Save buttons       |       |  Legend overlay                |
|  Result metrics display   |       |  Selection rings              |
+--------+------------------+       +--------+----------------------+
         |                                   ^
         | RunClustering (ClusterConfig)      | Points, Clusters
         v                                   |
+--------+-----------------------------------+--+
|           ClusteringService                   |
|                                               |
|  RunClustering(vectors, config)               |
|    1. K-Means / DBSCAN via SimpleVectorService|
|    2. UMAP (or PCA fallback) to 2D           |
|    3. Returns ClusterVisualizationResult      |
+-----------------+-----------------------------+
                  |
                  v
      @memberjunction/ai-vectors-memory
        (SimpleVectorService)
```

The config panel emits a `ClusterConfig`; the parent fetches vectors (from a database, API, or any source), passes them to `ClusteringService.RunClustering()`, and feeds the result into the scatter component.

## Installation

The package is part of the MemberJunction monorepo. Add it to your Angular module or standalone component imports:

```typescript
import { ClusteringModule } from '@memberjunction/ng-clustering';

@NgModule({
    imports: [ClusteringModule],
})
export class MyFeatureModule {}
```

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms` (all 21.x).

## Quick Start

```html
<!-- my-dashboard.component.html -->
<mj-cluster-scatter
    [Points]="result?.Points ?? []"
    [Clusters]="result?.Clusters ?? []"
    [IsLoading]="isRunning"
    (PointClicked)="onPointClicked($event)">
</mj-cluster-scatter>

<mj-cluster-config-panel
    [IsRunning]="isRunning"
    [Metrics]="result?.Metrics ?? null"
    [EntityOptions]="entityOptions"
    (RunClustering)="onRun($event)">
</mj-cluster-config-panel>
```

```typescript
// my-dashboard.component.ts
import { ClusteringService, ClusterConfig, ClusterVisualizationResult } from '@memberjunction/ng-clustering';

export class MyDashboardComponent {
    private clusteringService = inject(ClusteringService);
    result: ClusterVisualizationResult | null = null;
    isRunning = false;

    async onRun(config: ClusterConfig): Promise<void> {
        this.isRunning = true;
        const vectors = await this.fetchMyVectors(config);
        this.result = await this.clusteringService.RunClustering(vectors, config);
        this.isRunning = false;
    }
}
```

---

## API Reference: `ClusterScatterComponent`

**Selector:** `mj-cluster-scatter`

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `Points` | `ClusterPoint[]` | `[]` | 2D-projected points to render |
| `Clusters` | `ClusterInfo[]` | `[]` | Cluster summaries for legend and color mapping |
| `IsLoading` | `boolean` | `false` | Show loading overlay |
| `DotRadius` | `number` | `5` | Base radius (SVG units) for each data point |
| `DotOpacity` | `number` | `0.75` | Base opacity for dots (0--1) |
| `HighlightRadius` | `number` | `8` | Radius for hovered/selected point rings |
| `ShowLegend` | `boolean` | `true` | Show the color-coded cluster legend |
| `ShowTooltip` | `boolean` | `true` | Show the tooltip popup on hover |
| `TooltipFields` | `string[]` | `[]` | Metadata keys to show in tooltip (empty = all) |
| `ColorPalette` | `string[]` | `CLUSTER_COLORS` | Override cluster colors (wraps around) |
| `EnableZoom` | `boolean` | `true` | Enable mouse-wheel zoom |
| `EnablePan` | `boolean` | `true` | Enable click-and-drag pan |
| `AnimateTransitions` | `boolean` | `true` | Animate dot/ring transitions |
| `SelectedPointIds` | `Set<string>` | `new Set()` | Externally controlled selection (by VectorKey) |
| `MinZoom` | `number` | `0.5` | Minimum zoom level (viewBox multiplier) |
| `MaxZoom` | `number` | `10` | Maximum zoom level (viewBox multiplier) |

### Outputs

#### Standard Events

| Output | Payload | Description |
|---|---|---|
| `PointClicked` | `ClusterPoint` | A point was clicked |
| `PointHovered` | `ClusterPoint \| null` | Mouse entered/left a point |
| `AfterClusteringComplete` | `ClusterVisualizationResult` | New data received and centroids computed |
| `ClusterSelected` | `ClusterSelectedEvent` | Legend item clicked |
| `SelectionChanged` | `Set<string>` | Selection set changed (user or programmatic) |
| `ViewportChanged` | `ViewportRect` | Visible area changed after zoom/pan |

#### Cancelable Events

These fire **before** the corresponding action. Set `event.Cancel = true` to suppress it.

| Output | Payload | Cancels |
|---|---|---|
| `BeforePointClick` | `CancelableEvent<ClusterPoint>` | Suppresses `PointClicked` |
| `BeforePointHover` | `CancelableEvent<ClusterPoint>` | Suppresses tooltip show |
| `BeforeZoom` | `CancelableEvent<ViewportRect>` | Suppresses zoom/pan |

### Public Methods

| Method | Signature | Description |
|---|---|---|
| `ZoomToCluster` | `(clusterId: number): void` | Animate zoom to center on a cluster |
| `ResetZoom` | `(): void` | Reset to default viewport |
| `GetVisiblePoints` | `(): ClusterPoint[]` | Return points in current viewport |
| `SelectPoints` | `(ids: string[]): void` | Add points to selection |
| `ClearSelection` | `(): void` | Clear all selected points |
| `ExportSVG` | `(): string` | Export scatter plot as SVG string |
| `HighlightCluster` | `(clusterId: number): void` | Select all points in a cluster |

---

## API Reference: `ClusterConfigPanelComponent`

**Selector:** `mj-cluster-config-panel`

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `IsRunning` | `boolean` | `false` | Disable Run button and show spinner |
| `Metrics` | `ClusterMetrics \| null` | `null` | Display result metrics when non-null |
| `EntityOptions` | `ClusterConfigPanelEntityOption[]` | `[]` | Entity choices for the dropdown |
| `ShowSaveButton` | `boolean` | `true` | Show the "Save this visualization" link |
| `ShowAlgorithmPicker` | `boolean` | `true` | Show the algorithm dropdown |
| `ShowMetricPicker` | `boolean` | `true` | Show the distance metric dropdown |
| `DefaultAlgorithm` | `'kmeans' \| 'dbscan'` | `'kmeans'` | Initial algorithm selection |
| `AvailableEntities` | `string[]` | `[]` | Filter entity picker (empty = show all) |
| `Collapsed` | `boolean` | `false` | Start panel in collapsed state |

### Outputs

#### Standard Events

| Output | Payload | Description |
|---|---|---|
| `RunClustering` | `ClusterConfig` | Run button clicked (after validation) |
| `SaveVisualization` | `void` | Save link clicked (after validation) |
| `ConfigChanged` | `ClusterConfig` | Any config value changed |
| `AlgorithmChanged` | `ClusterAlgorithm` | Algorithm dropdown changed |

#### Cancelable Events

| Output | Payload | Cancels |
|---|---|---|
| `BeforeRunClustering` | `CancelableEvent<ClusterConfig>` | Suppresses `RunClustering` |
| `BeforeSave` | `CancelableEvent<ClusterConfig>` | Suppresses `SaveVisualization` |

---

## Event Architecture: Cancelable Pattern

All `BeforeXXX` events use the `CancelableEvent<T>` interface:

```typescript
export interface CancelableEvent<T = unknown> {
    Data: T;       // The event payload
    Cancel: boolean; // Set to true to prevent the default action
}
```

The component creates a `CancelableEvent`, emits it synchronously, then checks `Cancel` before proceeding. This works because Angular `EventEmitter.emit()` calls subscribers synchronously.

### Example: Validate Before Run

```typescript
onBeforeRun(event: CancelableEvent<ClusterConfig>): void {
    if (event.Data.MaxRecords > 2000) {
        event.Cancel = true;
        this.showWarning('Max records cannot exceed 2000 in demo mode');
    }
}
```

### Example: Suppress Outlier Clicks

```typescript
onBeforeClick(event: CancelableEvent<ClusterPoint>): void {
    if (event.Data.ClusterId === -1) {
        event.Cancel = true; // ignore outlier clicks
    }
}
```

### Example: Restrict Zoom Range

```typescript
onBeforeZoom(event: CancelableEvent<ViewportRect>): void {
    if (event.Data.Width > 5000) {
        event.Cancel = true; // don't allow zooming out too far
    }
}
```

---

## Styling and Theming

All components use MemberJunction design tokens -- no hardcoded colors. Key tokens in use:

| Token | Usage |
|---|---|
| `--mj-bg-page` | Scatter container background |
| `--mj-bg-surface` | Legend background |
| `--mj-bg-surface-elevated` | Config panel, tooltip |
| `--mj-bg-surface-hover` | Legend item hover |
| `--mj-border-default` | Panel/legend borders |
| `--mj-brand-primary` | Run button, accents |
| `--mj-text-primary` | Primary text |
| `--mj-text-secondary` | Labels |
| `--mj-text-muted` | Captions, muted text |
| `--mj-status-success` | Good silhouette score |

### Color Palette Override

Override cluster colors via the `ColorPalette` input:

```html
<mj-cluster-scatter
    [ColorPalette]="['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']">
</mj-cluster-scatter>
```

When there are more clusters than colors, the palette wraps around. The default palette (`CLUSTER_COLORS`) provides 10 accessible, distinct colors.

---

## Integration Examples

### Knowledge Hub (Data Explorer)

The Knowledge Hub dashboard uses both components inside a `BaseResourceComponent`:

```typescript
@RegisterClass(BaseResourceComponent, 'ClusterVisualizationResource')
@Component({ ... })
export class ClusterVisualizationResourceComponent extends BaseResourceComponent {
    clusteringService = inject(ClusteringService);
    result: ClusterVisualizationResult | null = null;

    async OnRunClustering(config: ClusterConfig): Promise<void> {
        const vectors = await this.fetchVectorsForEntity(config);
        this.result = await this.clusteringService.RunClustering(vectors, config);
    }
}
```

### Custom Application

Use individual components with your own data source:

```typescript
@Component({
    template: `
        <mj-cluster-scatter
            [Points]="points"
            [Clusters]="clusters"
            [DotRadius]="4"
            [ShowTooltip]="true"
            [TooltipFields]="['Score', 'Category']"
            [EnablePan]="true"
            (BeforePointClick)="validateClick($event)"
            (ClusterSelected)="onClusterPicked($event)">
        </mj-cluster-scatter>
    `
})
export class MyVisualizationComponent {
    points: ClusterPoint[] = [];
    clusters: ClusterInfo[] = [];

    validateClick(event: CancelableEvent<ClusterPoint>): void {
        if (event.Data.Metadata['locked']) {
            event.Cancel = true;
        }
    }

    onClusterPicked(event: ClusterSelectedEvent): void {
        console.log(`Selected cluster ${event.Label} with ${event.MemberCount} members`);
    }
}
```

### Standalone Service Usage (No UI)

Use `ClusteringService` without the Angular components:

```typescript
const svc = new ClusteringService();
const result = await svc.RunClustering(myVectors, {
    EntityName: 'Products',
    Algorithm: 'kmeans',
    K: 5,
    Epsilon: 0,
    MinPoints: 0,
    DistanceMetric: 'cosine',
    MaxRecords: 1000,
    Filter: '',
});
console.log(`Found ${result.Clusters.length} clusters`);
```

---

## Performance Notes

| Scenario | Recommendation |
|---|---|
| < 500 records | Excellent performance; use UMAP for best quality |
| 500--2000 records | Good performance; UMAP may take 1--3 seconds |
| 2000--5000 records | Acceptable; consider PCA fallback for speed |
| > 5000 records | Set `MaxRecords` to cap at 5000; SVG rendering may lag |

### UMAP vs PCA

- **UMAP** preserves local structure (clusters stay tight) but is slower (O(n log n))
- **PCA** is a fast linear fallback (O(n * d)) that works well for well-separated clusters
- The service automatically falls back to PCA if UMAP is unavailable or fails

### SVG Rendering

- Each point is a `<circle>` element; above ~5000 elements the browser may struggle
- Selection rings and highlight rings add extra elements per selected point
- Use `AnimateTransitions = false` for better performance with large datasets

---

## Type Exports

All types are exported from the package root:

```typescript
import {
    // Core data types
    ClusterPoint,
    ClusterInfo,
    ClusterConfig,
    ClusterMetrics,
    ClusterVisualizationResult,
    SavedClusterVisualization,
    ClusterInputVector,

    // Config panel helper
    ClusterConfigPanelEntityOption,

    // Event payloads
    CancelableEvent,
    ViewportRect,
    ClusterSelectedEvent,

    // Constants and factories
    ClusterAlgorithm,
    ClusterDistanceMetric,
    CLUSTER_COLORS,
    DefaultClusterConfig,
} from '@memberjunction/ng-clustering';
```
