# Metadata-Driven Dashboards v2 - Implementation Plan

**Version:** 3.0
**Created:** January 2026
**Status:** Planning

---

## Executive Summary

This plan outlines the complete redesign of MemberJunction's metadata-driven dashboard system for v3.0. The new system will use Golden Layout for flexible geometry control, support pluggable panel types via metadata and `@RegisterClass`, and be architected for reuse across any Angular application.

### Key Deliverables

1. **Generic Dashboard Viewer Package** - Reusable dashboard component with Golden Layout
2. **Pluggable Panel Type System** - Metadata-driven, extensible panel architecture
3. **Query Viewer Component** - Beautiful query execution UI with parameter controls
4. **Shared Base Data Grid** - Common foundation for entity and query data display
5. **Data Explorer Integration** - New Queries section in Data Explorer
6. **Explorer Dashboard Integration** - Wrapper for MJ Explorer navigation

---

## Architecture Overview

### Package Structure

```
packages/Angular/
├── Generic/
│   ├── base-data-grid/                    # NEW - Shared grid foundation
│   │   └── @memberjunction/ng-base-data-grid
│   │
│   ├── query-viewer/                      # NEW - Query execution component
│   │   └── @memberjunction/ng-query-viewer
│   │
│   ├── dashboard-viewer/                  # NEW - Golden Layout dashboard
│   │   └── @memberjunction/ng-dashboard-viewer
│   │
│   └── entity-viewer/                     # EXISTING - Will use base-data-grid
│       └── @memberjunction/ng-entity-viewer
│
└── Explorer/
    ├── dashboards/
    │   └── src/DataExplorer/              # MODIFY - Add Queries section
    │
    └── explorer-core/
        └── src/lib/dashboard-resource/    # MODIFY - Use new dashboard-viewer
```

### Entity Model

#### New Entity: Dashboard Part Types

```sql
CREATE TABLE __mj.DashboardPartType (
    ID uniqueidentifier PRIMARY KEY DEFAULT NEWID(),
    Name nvarchar(100) NOT NULL,           -- 'View', 'Query', 'Artifact', 'WebURL', 'Custom'
    Description nvarchar(MAX),
    Icon nvarchar(100),                    -- Font Awesome class
    DriverClass nvarchar(255) NOT NULL,    -- @RegisterClass name for renderer
    ConfigDialogClass nvarchar(255),       -- @RegisterClass name for config dialog
    DefaultConfig nvarchar(MAX),           -- JSON default configuration
    SortOrder int DEFAULT 0,
    IsActive bit DEFAULT 1,
    __mj_CreatedAt datetime2 DEFAULT GETUTCDATE(),
    __mj_UpdatedAt datetime2 DEFAULT GETUTCDATE()
);
```

#### Updated Dashboard Entity

The existing `Dashboards` entity will be updated:
- `UIConfigDetails` will store v2 config format (Golden Layout + panels)
- `Type` field remains: 'Config' | 'Code' | 'Dynamic Code'
- No schema changes needed for core entity

### Configuration Schema (v2)

```typescript
interface DashboardConfigV2 {
  version: 2;
  layout: GoldenLayoutConfig;      // Full GL layout tree
  panels: DashboardPanel[];        // Panel definitions
  settings: DashboardSettings;
}

interface DashboardPanel {
  id: string;                      // Unique panel ID
  title: string;
  icon?: string;                   // Font Awesome class
  partTypeId: string;              // FK to DashboardPartType.ID
  config: Record<string, any>;     // Type-specific configuration
  state?: Record<string, any>;     // Persisted panel state
}

interface GoldenLayoutConfig {
  root: {
    type: 'row' | 'column' | 'stack';
    content: LayoutNode[];
  };
}

interface LayoutNode {
  type: 'row' | 'column' | 'stack' | 'component';
  content?: LayoutNode[];
  componentState?: { panelId: string };
  width?: number;
  height?: number;
}

interface DashboardSettings {
  theme: 'light' | 'dark';
  showHeaders: boolean;
  enablePopout: boolean;
  enableMaximize: boolean;
}
```

### Panel Type Configurations

```typescript
// View Panel
interface ViewPanelConfig {
  viewId?: string;                 // Specific saved view
  entityName?: string;             // For dynamic/default view
  extraFilter?: string;            // Additional filter criteria
  displayMode: 'grid' | 'cards' | 'timeline';
  allowModeSwitch: boolean;        // Show mode toggle in header
}

// Query Panel
interface QueryPanelConfig {
  queryId?: string;
  queryName?: string;
  categoryPath?: string;
  defaultParameters?: Record<string, any>;
  showParameterControls: boolean;  // Show params in header/sidebar
  parameterLayout: 'header' | 'sidebar' | 'dialog';
  autoRefreshSeconds?: number;
  showExecutionMetadata: boolean;  // Time, row count, cache hit
}

// Artifact Panel
interface ArtifactPanelConfig {
  artifactId: string;
  versionNumber?: number;          // Specific version or latest
  showVersionSelector: boolean;
  showMetadata: boolean;
}

// Web URL Panel
interface WebURLPanelConfig {
  url: string;
  sandboxMode: 'standard' | 'strict' | 'permissive';
  allowFullscreen: boolean;
  refreshOnResize: boolean;
}

// Custom Panel
interface CustomPanelConfig {
  driverClass: string;             // @RegisterClass name
  configuration?: Record<string, any>;
}
```

---

## Component Architecture

### Class Hierarchy

```
DashboardBasePanelRenderer (abstract)
├── ViewPanelRenderer
├── QueryPanelRenderer
├── ArtifactPanelRenderer
├── WebURLPanelRenderer
└── [Custom implementations via @RegisterClass]

DashboardBasePanelConfigDialog (abstract)
├── ViewPanelConfigDialog
├── QueryPanelConfigDialog
├── ArtifactPanelConfigDialog
├── WebURLPanelConfigDialog
└── [Custom implementations via @RegisterClass]

BaseDataGrid (abstract)
├── EntityDataGridComponent (refactored)
└── QueryDataGridComponent (new)
```

### Registration Pattern

```typescript
// Panel Renderer Registration
@RegisterClass(DashboardBasePanelRenderer, 'ViewPanelRenderer')
@Component({...})
export class ViewPanelRenderer extends DashboardBasePanelRenderer {
  // Implementation
}

// Config Dialog Registration
@RegisterClass(DashboardBasePanelConfigDialog, 'ViewPanelConfigDialog')
@Component({...})
export class ViewPanelConfigDialog extends DashboardBasePanelConfigDialog {
  // Implementation
}

// Runtime instantiation
const renderer = MJGlobal.Instance.ClassFactory.Create(
  DashboardBasePanelRenderer,
  partType.DriverClass
);
```

---

## Detailed Task Breakdown

### Phase 1: Foundation (Base Data Grid)

#### 1.1 Create Base Data Grid Package

**Package:** `@memberjunction/ng-base-data-grid`
**Location:** `packages/Angular/Generic/base-data-grid/`

| Task | Description | Files |
|------|-------------|-------|
| 1.1.1 | Create package structure | `package.json`, `ng-package.json`, `tsconfig.lib.json` |
| 1.1.2 | Create BaseDataGridComponent abstract class | `src/lib/base-data-grid.component.ts` |
| 1.1.3 | Extract common grid functionality from EntityDataGridComponent | Analysis + extraction |
| 1.1.4 | Create shared interfaces | `src/lib/models/grid-config.interface.ts` |
| 1.1.5 | Create column definition models | `src/lib/models/column-definition.interface.ts` |
| 1.1.6 | Create grid state management | `src/lib/services/grid-state.service.ts` |
| 1.1.7 | Create export functionality base | `src/lib/services/grid-export.service.ts` |
| 1.1.8 | Create BaseDataGridModule | `src/lib/base-data-grid.module.ts` |
| 1.1.9 | Write unit tests | `src/lib/*.spec.ts` |
| 1.1.10 | Update build configuration | `turbo.json`, workspace deps |

**BaseDataGridComponent Abstract Members:**
```typescript
@Directive()
export abstract class BaseDataGridComponent implements OnInit, OnDestroy {
  // Inputs
  @Input() columns: ColumnDefinition[];
  @Input() data: any[];
  @Input() loading: boolean;
  @Input() pageSize: number;
  @Input() sortable: boolean;
  @Input() filterable: boolean;
  @Input() selectable: boolean;
  @Input() exportable: boolean;

  // Outputs
  @Output() rowSelected = new EventEmitter<any>();
  @Output() rowDoubleClicked = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortDescriptor[]>();
  @Output() filterChanged = new EventEmitter<FilterDescriptor>();
  @Output() pageChanged = new EventEmitter<PageChangeEvent>();

  // Abstract methods
  abstract loadData(): Promise<void>;
  abstract getColumnDefinitions(): ColumnDefinition[];
  abstract formatCellValue(column: ColumnDefinition, value: any): string;

  // Shared implementations
  protected initializeGrid(): void { }
  protected applySort(sort: SortDescriptor[]): void { }
  protected applyFilter(filter: FilterDescriptor): void { }
  protected exportToExcel(): void { }
  protected exportToCSV(): void { }
}
```

#### 1.2 Refactor Entity Data Grid

**Package:** `@memberjunction/ng-entity-viewer`
**Location:** `packages/Angular/Generic/entity-viewer/`

| Task | Description | Files |
|------|-------------|-------|
| 1.2.1 | Add dependency on base-data-grid | `package.json` |
| 1.2.2 | Refactor EntityDataGridComponent to extend BaseDataGridComponent | `entity-data-grid.component.ts` |
| 1.2.3 | Move entity-specific logic to overrides | Column generation, cell formatting |
| 1.2.4 | Update EntityViewerModule imports | `entity-viewer.module.ts` |
| 1.2.5 | Regression test all existing functionality | Manual + unit tests |
| 1.2.6 | Update any breaking references | Search codebase |

---

### Phase 2: Query Viewer Component ✅ COMPLETED

#### 2.1 Create Query Viewer Package

**Package:** `@memberjunction/ng-query-viewer`
**Location:** `packages/Angular/Generic/query-viewer/`
**Status:** ✅ COMPLETED (January 2026)

| Task | Description | Status |
|------|-------------|--------|
| 2.1.1 | Create package structure | ✅ Done |
| 2.1.2 | Create QueryDataGridComponent with AG Grid Community | ✅ Done |
| 2.1.3 | Create QueryParameterFormComponent (slide-in panel) | ✅ Done |
| 2.1.4 | Create parameter input controls (per type) | ✅ Done |
| 2.1.5 | Create QueryViewerComponent (composite) | ✅ Done |
| 2.1.6 | Create QuerySelectorComponent (picker dialog) | ✅ Done |
| 2.1.7 | Query execution via RunQuery | ✅ Done |
| 2.1.8 | Parameter persistence via UserSettings | ✅ Done |
| 2.1.9 | Create QueryViewerModule | ✅ Done |
| 2.1.10 | Style all components | ✅ Done |
| 2.1.11 | Grid state persistence (columns, sort, widths) | ✅ Done |
| 2.1.12 | Row detail slide-in panel | ✅ Done |
| 2.1.13 | Entity link navigation | ✅ Done |
| 2.1.14 | Alternating row colors | ✅ Done |

**Implementation Notes:**
- Built directly without base-data-grid dependency (pragmatic approach)
- Uses AG Grid Community (free tier) instead of Kendo Grid
- Includes row detail panel matching entity-viewer patterns
- Full grid state persistence to User Settings

**QueryViewerComponent Structure:**
```typescript
@Component({
  selector: 'mj-query-viewer',
  template: `
    <div class="query-viewer">
      <!-- Header with query info and actions -->
      <div class="query-header">
        <div class="query-info">
          <i [class]="'fa-solid fa-flask'"></i>
          <h3>{{ query?.Name }}</h3>
          <span class="query-status" [class]="query?.Status?.toLowerCase()">
            {{ query?.Status }}
          </span>
        </div>
        <div class="query-actions">
          <button kendoButton (click)="toggleParameters()">
            <i class="fa-solid fa-sliders"></i>
            Parameters
          </button>
          <button kendoButton (click)="refresh()" [disabled]="loading">
            <i class="fa-solid fa-refresh" [class.fa-spin]="loading"></i>
            Run Query
          </button>
          <button kendoButton (click)="exportResults()">
            <i class="fa-solid fa-download"></i>
            Export
          </button>
        </div>
      </div>

      <!-- Parameter panel (collapsible) -->
      <mj-query-parameter-form
        *ngIf="showParameters && parameters.length > 0"
        [parameters]="parameters"
        [values]="parameterValues"
        (valuesChanged)="onParameterValuesChanged($event)"
        (submit)="executeQuery()">
      </mj-query-parameter-form>

      <!-- Execution metadata -->
      <div class="query-metadata" *ngIf="lastExecution">
        <span><i class="fa-solid fa-clock"></i> {{ lastExecution.executionTime }}ms</span>
        <span><i class="fa-solid fa-table-rows"></i> {{ lastExecution.rowCount }} rows</span>
        <span *ngIf="lastExecution.cacheHit">
          <i class="fa-solid fa-bolt"></i> Cached
        </span>
      </div>

      <!-- Results grid -->
      <mj-query-data-grid
        [queryId]="queryId"
        [parameters]="parameterValues"
        [loading]="loading"
        (rowSelected)="onRowSelected($event)">
      </mj-query-data-grid>
    </div>
  `
})
export class QueryViewerComponent {
  @Input() queryId: string;
  @Input() queryName: string;
  @Input() defaultParameters: Record<string, any>;
  @Input() showParameterControls: boolean = true;
  @Input() parameterLayout: 'header' | 'sidebar' | 'dialog' = 'header';
  @Input() autoRefreshSeconds: number;

  @Output() executed = new EventEmitter<QueryExecutionResult>();
  @Output() rowSelected = new EventEmitter<any>();
}
```

**QueryParameterFormComponent:**
```typescript
@Component({
  selector: 'mj-query-parameter-form',
  template: `
    <div class="parameter-form">
      <div class="parameter-grid">
        @for (param of parameters; track param.ID) {
          <div class="parameter-field">
            <label [for]="param.Name">
              {{ param.Name }}
              <span *ngIf="param.IsRequired" class="required">*</span>
            </label>

            <!-- Dynamic control based on type -->
            <ng-container [ngSwitch]="param.Type">
              <input *ngSwitchCase="'string'"
                     type="text"
                     [id]="param.Name"
                     [(ngModel)]="values[param.Name]"
                     [placeholder]="param.SampleValue || ''">

              <input *ngSwitchCase="'number'"
                     type="number"
                     [id]="param.Name"
                     [(ngModel)]="values[param.Name]">

              <kendo-datepicker *ngSwitchCase="'date'"
                               [id]="param.Name"
                               [(ngModel)]="values[param.Name]">
              </kendo-datepicker>

              <kendo-switch *ngSwitchCase="'boolean'"
                           [id]="param.Name"
                           [(ngModel)]="values[param.Name]">
              </kendo-switch>

              <kendo-multiselect *ngSwitchCase="'array'"
                                [id]="param.Name"
                                [(ngModel)]="values[param.Name]"
                                [allowCustom]="true">
              </kendo-multiselect>
            </ng-container>

            <small class="param-description">{{ param.Description }}</small>
          </div>
        }
      </div>

      <div class="parameter-actions">
        <button kendoButton (click)="saveDefaults()">
          <i class="fa-solid fa-save"></i>
          Save as Defaults
        </button>
        <button kendoButton (click)="resetToDefaults()">
          <i class="fa-solid fa-rotate-left"></i>
          Reset
        </button>
        <button kendoButton themeColor="primary" (click)="submit.emit()">
          <i class="fa-solid fa-play"></i>
          Run Query
        </button>
      </div>
    </div>
  `
})
export class QueryParameterFormComponent {
  @Input() parameters: QueryParameterEntity[];
  @Input() values: Record<string, any>;
  @Output() valuesChanged = new EventEmitter<Record<string, any>>();
  @Output() submit = new EventEmitter<void>();
}
```

#### 2.2 Integrate Query Viewer into Data Explorer

**Location:** `packages/Angular/Explorer/dashboards/src/DataExplorer/`

| Task | Description | Files |
|------|-------------|-------|
| 2.2.1 | Add Queries section to home view | `data-explorer-dashboard.component.html` |
| 2.2.2 | Create QueryBrowserComponent | `components/query-browser/query-browser.component.ts` |
| 2.2.3 | Add query loading to state service | `services/explorer-state.service.ts` |
| 2.2.4 | Add query state interfaces | `models/explorer-state.interface.ts` |
| 2.2.5 | Create query category tree component | `components/query-category-tree/` |
| 2.2.6 | Add query favorites support | State + UI |
| 2.2.7 | Add query recent access tracking | State + UI |
| 2.2.8 | Update navigation panel for queries | `components/navigation-panel/` |
| 2.2.9 | Update module imports | `module.ts` |
| 2.2.10 | Style query browser | `*.component.css` |

**Data Explorer Home View Update:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Data Explorer                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┬───────────────────────────────┐   │
│  │ Recent Records          │ Recent Entities               │   │
│  │ [List of records...]    │ [List of entities...]         │   │
│  ├─────────────────────────┼───────────────────────────────┤   │
│  │ Favorite Records        │ Favorite Entities             │   │
│  │ [List of favorites...]  │ [List of favorites...]        │   │
│  ├─────────────────────────┴───────────────────────────────┤   │
│  │ Saved Queries                                [View All] │   │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │ │ Query 1 │ │ Query 2 │ │ Query 3 │ │ Query 4 │        │   │
│  │ │ Sales   │ │ Revenue │ │ Users   │ │ Metrics │        │   │
│  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ All Entities                          [Common] [All]   │   │
│  │ [Grid of entity cards...]                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Dashboard Viewer Package

#### 3.1 Create Dashboard Viewer Package

**Package:** `@memberjunction/ng-dashboard-viewer`
**Location:** `packages/Angular/Generic/dashboard-viewer/`

| Task | Description | Files |
|------|-------------|-------|
| 3.1.1 | Create package structure | `package.json`, `ng-package.json`, `tsconfig.lib.json` |
| 3.1.2 | Install Golden Layout dependency | `package.json` |
| 3.1.3 | Create GoldenLayoutWrapperService | `src/lib/services/golden-layout-wrapper.service.ts` |
| 3.1.4 | Create DashboardViewerComponent | `src/lib/dashboard-viewer/dashboard-viewer.component.ts` |
| 3.1.5 | Create DashboardPanelComponent | `src/lib/dashboard-panel/dashboard-panel.component.ts` |
| 3.1.6 | Create PanelHeaderComponent | `src/lib/panel-header/panel-header.component.ts` |
| 3.1.7 | Create DashboardBasePanelRenderer base class | `src/lib/renderers/dashboard-base-panel-renderer.ts` |
| 3.1.8 | Create DashboardBasePanelConfigDialog base class | `src/lib/config-dialogs/dashboard-base-panel-config-dialog.ts` |
| 3.1.9 | Create AddPanelDialogComponent | `src/lib/add-panel-dialog/add-panel-dialog.component.ts` |
| 3.1.10 | Create DashboardSettingsDialogComponent | `src/lib/dashboard-settings-dialog/` |
| 3.1.11 | Create config schema interfaces | `src/lib/models/*.interface.ts` |
| 3.1.12 | Create DashboardConfigService | `src/lib/services/dashboard-config.service.ts` |
| 3.1.13 | Create DashboardStateService | `src/lib/services/dashboard-state.service.ts` |
| 3.1.14 | Create DashboardViewerModule | `src/lib/dashboard-viewer.module.ts` |
| 3.1.15 | Style all components | `*.component.css` |
| 3.1.16 | Write unit tests | `*.spec.ts` |

**GoldenLayoutWrapperService:**
```typescript
@Injectable()
export class GoldenLayoutWrapperService {
  private goldenLayout: GoldenLayout | null = null;

  // Initialize Golden Layout in container
  initialize(
    container: HTMLElement,
    config: GoldenLayoutConfig,
    componentFactory: (panelId: string) => ComponentRef<DashboardBasePanelRenderer>
  ): void;

  // Layout manipulation
  addPanel(panel: DashboardPanel, targetLocation?: LayoutLocation): void;
  removePanel(panelId: string): void;

  // Split operations
  splitHorizontal(panelId: string): void;
  splitVertical(panelId: string): void;
  addToStack(panelId: string, targetStackId: string): void;

  // State management
  getLayoutConfig(): GoldenLayoutConfig;
  applyLayoutConfig(config: GoldenLayoutConfig): void;

  // Events
  onLayoutChanged: Subject<GoldenLayoutConfig>;
  onPanelClosed: Subject<string>;
  onPanelMaximized: Subject<string>;

  // Cleanup
  destroy(): void;
}
```

**DashboardBasePanelRenderer:**
```typescript
@Directive()
export abstract class DashboardBasePanelRenderer implements OnInit, OnDestroy {
  @Input() panel: DashboardPanel;
  @Input() partType: DashboardPartTypeEntity;
  @Input() isEditing: boolean = false;

  @Output() stateChanged = new EventEmitter<Record<string, any>>();
  @Output() titleChanged = new EventEmitter<string>();
  @Output() configChanged = new EventEmitter<Record<string, any>>();
  @Output() interaction = new EventEmitter<PanelInteractionEvent>();
  @Output() error = new EventEmitter<Error>();

  // Lifecycle
  abstract initialize(): Promise<void>;
  abstract refresh(): Promise<void>;
  abstract destroy(): void;

  // State management
  abstract getState(): Record<string, any>;
  abstract applyState(state: Record<string, any>): void;

  // Configuration
  abstract validateConfig(config: Record<string, any>): ValidationResult;
  abstract getDefaultConfig(): Record<string, any>;
}
```

**DashboardBasePanelConfigDialog:**
```typescript
@Directive()
export abstract class DashboardBasePanelConfigDialog implements OnInit {
  @Input() partType: DashboardPartTypeEntity;
  @Input() existingConfig: Record<string, any> | null = null;

  @Output() configSaved = new EventEmitter<PanelConfigResult>();
  @Output() cancelled = new EventEmitter<void>();

  // Validation
  abstract validateConfig(): ValidationResult;
  abstract getConfig(): Record<string, any>;

  // UI helpers
  abstract getTitle(): string;
  abstract getIcon(): string;
}

interface PanelConfigResult {
  title: string;
  icon?: string;
  config: Record<string, any>;
}
```

#### 3.2 Create Built-in Panel Renderers

| Task | Description | Files |
|------|-------------|-------|
| 3.2.1 | Create ViewPanelRenderer | `src/lib/renderers/view-panel-renderer.component.ts` |
| 3.2.2 | Create QueryPanelRenderer | `src/lib/renderers/query-panel-renderer.component.ts` |
| 3.2.3 | Create ArtifactPanelRenderer | `src/lib/renderers/artifact-panel-renderer.component.ts` |
| 3.2.4 | Create WebURLPanelRenderer | `src/lib/renderers/weburl-panel-renderer.component.ts` |
| 3.2.5 | Create CustomPanelRenderer (delegating) | `src/lib/renderers/custom-panel-renderer.component.ts` |
| 3.2.6 | Register all renderers | `src/lib/renderers/index.ts` |

**ViewPanelRenderer:**
```typescript
@RegisterClass(DashboardBasePanelRenderer, 'ViewPanelRenderer')
@Component({
  selector: 'mj-view-panel-renderer',
  template: `
    <mj-entity-viewer
      [entityName]="config.entityName"
      [viewId]="config.viewId"
      [extraFilter]="config.extraFilter"
      [displayMode]="config.displayMode"
      [showModeToggle]="config.allowModeSwitch"
      (recordSelected)="onRecordSelected($event)"
      (modeChanged)="onModeChanged($event)">
    </mj-entity-viewer>
  `
})
export class ViewPanelRenderer extends DashboardBasePanelRenderer {
  // Uses mj-entity-viewer for all view rendering
}
```

**QueryPanelRenderer:**
```typescript
@RegisterClass(DashboardBasePanelRenderer, 'QueryPanelRenderer')
@Component({
  selector: 'mj-query-panel-renderer',
  template: `
    <mj-query-viewer
      [queryId]="config.queryId"
      [queryName]="config.queryName"
      [defaultParameters]="config.defaultParameters"
      [showParameterControls]="config.showParameterControls"
      [parameterLayout]="config.parameterLayout"
      [autoRefreshSeconds]="config.autoRefreshSeconds"
      (executed)="onQueryExecuted($event)"
      (rowSelected)="onRowSelected($event)">
    </mj-query-viewer>
  `
})
export class QueryPanelRenderer extends DashboardBasePanelRenderer {
  // Uses mj-query-viewer for query execution and display
}
```

**ArtifactPanelRenderer:**
```typescript
@RegisterClass(DashboardBasePanelRenderer, 'ArtifactPanelRenderer')
@Component({
  selector: 'mj-artifact-panel-renderer',
  template: `
    <div class="artifact-panel">
      <div class="artifact-header" *ngIf="config.showVersionSelector">
        <kendo-dropdownlist
          [data]="versions"
          [value]="selectedVersion"
          (valueChange)="onVersionChanged($event)"
          textField="VersionNumber"
          valueField="ID">
        </kendo-dropdownlist>
      </div>
      <mj-artifact-viewer-panel
        [artifactId]="config.artifactId"
        [versionNumber]="selectedVersionNumber"
        (error)="onError($event)">
      </mj-artifact-viewer-panel>
    </div>
  `
})
export class ArtifactPanelRenderer extends DashboardBasePanelRenderer {
  // Uses mj-artifact-viewer-panel from artifacts package
}
```

**WebURLPanelRenderer:**
```typescript
@RegisterClass(DashboardBasePanelRenderer, 'WebURLPanelRenderer')
@Component({
  selector: 'mj-weburl-panel-renderer',
  template: `
    <div class="weburl-panel">
      <iframe
        [src]="sanitizedUrl"
        [sandbox]="sandboxValue"
        [allowFullscreen]="config.allowFullscreen"
        (load)="onIframeLoaded()"
        (error)="onIframeError($event)">
      </iframe>
      <div class="iframe-loading" *ngIf="loading">
        <mj-loading text="Loading content..."></mj-loading>
      </div>
    </div>
  `
})
export class WebURLPanelRenderer extends DashboardBasePanelRenderer {
  private sanitizer = inject(DomSanitizer);

  get sandboxValue(): string {
    switch (this.config.sandboxMode) {
      case 'strict': return '';
      case 'permissive': return 'allow-scripts allow-same-origin allow-forms allow-popups';
      default: return 'allow-scripts allow-same-origin';
    }
  }
}
```

#### 3.3 Create Built-in Config Dialogs

| Task | Description | Files |
|------|-------------|-------|
| 3.3.1 | Create ViewPanelConfigDialog | `src/lib/config-dialogs/view-panel-config-dialog.component.ts` |
| 3.3.2 | Create QueryPanelConfigDialog | `src/lib/config-dialogs/query-panel-config-dialog.component.ts` |
| 3.3.3 | Create ArtifactPanelConfigDialog | `src/lib/config-dialogs/artifact-panel-config-dialog.component.ts` |
| 3.3.4 | Create WebURLPanelConfigDialog | `src/lib/config-dialogs/weburl-panel-config-dialog.component.ts` |
| 3.3.5 | Create CustomPanelConfigDialog | `src/lib/config-dialogs/custom-panel-config-dialog.component.ts` |
| 3.3.6 | Register all dialogs | `src/lib/config-dialogs/index.ts` |

---

### Phase 4: Database Schema & Metadata

#### 4.1 Create Migration for Dashboard Part Types

**Location:** `migrations/v2/`

| Task | Description | Files |
|------|-------------|-------|
| 4.1.1 | Create DashboardPartType table | Migration SQL |
| 4.1.2 | Insert built-in part types (View, Query, Artifact, WebURL, Custom) | Migration SQL |
| 4.1.3 | Add entity metadata | Migration SQL |
| 4.1.4 | Run CodeGen for entity classes | CodeGen |
| 4.1.5 | Create metadata JSON files | `metadata/dashboard-part-types/` |

**Migration SQL:**
```sql
-- Create Dashboard Part Type table
CREATE TABLE ${flyway:defaultSchema}.DashboardPartType (
    ID uniqueidentifier NOT NULL DEFAULT NEWID(),
    Name nvarchar(100) NOT NULL,
    Description nvarchar(MAX) NULL,
    Icon nvarchar(100) NULL,
    DriverClass nvarchar(255) NOT NULL,
    ConfigDialogClass nvarchar(255) NULL,
    DefaultConfig nvarchar(MAX) NULL,
    SortOrder int NOT NULL DEFAULT 0,
    IsActive bit NOT NULL DEFAULT 1,
    __mj_CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_DashboardPartType PRIMARY KEY (ID),
    CONSTRAINT UQ_DashboardPartType_Name UNIQUE (Name)
);

-- Insert built-in part types
INSERT INTO ${flyway:defaultSchema}.DashboardPartType
    (ID, Name, Description, Icon, DriverClass, ConfigDialogClass, SortOrder)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'View',
     'Display entity data using saved views with grid, cards, or timeline layout',
     'fa-solid fa-table', 'ViewPanelRenderer', 'ViewPanelConfigDialog', 1),

    ('22222222-2222-2222-2222-222222222222', 'Query',
     'Execute and display query results with parameter controls',
     'fa-solid fa-flask', 'QueryPanelRenderer', 'QueryPanelConfigDialog', 2),

    ('33333333-3333-3333-3333-333333333333', 'Artifact',
     'Display conversation artifacts with version selection',
     'fa-solid fa-palette', 'ArtifactPanelRenderer', 'ArtifactPanelConfigDialog', 3),

    ('44444444-4444-4444-4444-444444444444', 'Web URL',
     'Embed external web content via iframe',
     'fa-solid fa-globe', 'WebURLPanelRenderer', 'WebURLPanelConfigDialog', 4),

    ('55555555-5555-5555-5555-555555555555', 'Custom',
     'Use a custom registered component',
     'fa-solid fa-puzzle-piece', 'CustomPanelRenderer', 'CustomPanelConfigDialog', 5);
```

---

### Phase 5: Explorer Integration

#### 5.1 Create Explorer Dashboard Wrapper

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/dashboard-resource/`

| Task | Description | Files |
|------|-------------|-------|
| 5.1.1 | Create ExplorerDashboardComponent wrapper | `explorer-dashboard.component.ts` |
| 5.1.2 | Integrate with Explorer navigation events | Navigation handling |
| 5.1.3 | Handle dashboard user state persistence | State management |
| 5.1.4 | Connect to Explorer toolbar actions | Toolbar integration |
| 5.1.5 | Update DashboardResource to use new viewer | `dashboard-resource.component.ts` |
| 5.1.6 | Update module imports | `explorer-core.module.ts` |
| 5.1.7 | Test in Explorer context | Integration tests |

**ExplorerDashboardComponent:**
```typescript
@Component({
  selector: 'mj-explorer-dashboard',
  template: `
    <div class="explorer-dashboard-wrapper">
      <!-- Explorer-specific header with nav integration -->
      <div class="dashboard-header">
        <h2>{{ dashboard?.Name }}</h2>
        <div class="dashboard-actions">
          <button kendoButton (click)="openInNewTab()">
            <i class="fa-solid fa-up-right-from-square"></i>
            Open in Tab
          </button>
          <button kendoButton (click)="toggleEdit()" *ngIf="canEdit">
            <i class="fa-solid fa-pen"></i>
            {{ isEditing ? 'Done Editing' : 'Edit' }}
          </button>
        </div>
      </div>

      <!-- Generic dashboard viewer -->
      <mj-dashboard-viewer
        [dashboardId]="dashboardId"
        [config]="config"
        [editable]="isEditing"
        (configChanged)="onConfigChanged($event)"
        (saveRequested)="onSaveRequested($event)"
        (panelInteraction)="onPanelInteraction($event)">
      </mj-dashboard-viewer>
    </div>
  `
})
export class ExplorerDashboardComponent extends BaseResourceComponent {
  @Input() dashboardId: string;

  // Integrates with Explorer's:
  // - Tab management
  // - Navigation events
  // - User state persistence
  // - Permission checking
}
```

---

### Phase 6: Testing & Documentation

| Task | Description | Files |
|------|-------------|-------|
| 6.1 | Write unit tests for base-data-grid | `packages/Angular/Generic/base-data-grid/src/**/*.spec.ts` |
| 6.2 | Write unit tests for query-viewer | `packages/Angular/Generic/query-viewer/src/**/*.spec.ts` |
| 6.3 | Write unit tests for dashboard-viewer | `packages/Angular/Generic/dashboard-viewer/src/**/*.spec.ts` |
| 6.4 | Create integration tests | Test files |
| 6.5 | Write package README files | `README.md` for each package |
| 6.6 | Update main CLAUDE.md with dashboard docs | `/CLAUDE.md` |
| 6.7 | Create example dashboards in metadata | `metadata/dashboards/` |

---

## UX Mockups

### Query Viewer in Data Explorer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Data Explorer                                              [Search...]     │
├───────────────────┬─────────────────────────────────────────────────────────┤
│                   │                                                         │
│  Navigation       │  Revenue by Region                                      │
│  ───────────────  │  ════════════════════════════════════════════════════  │
│                   │                                                         │
│  📁 Queries       │  Parameters                                    [Hide]   │
│   └ 📁 Sales      │  ┌─────────────────────────────────────────────────┐   │
│      └ Revenue... │  │ Region: [All Regions    ▼]  Start: [2024-01-01] │   │
│      └ Top Cust.. │  │ End: [2024-12-31]  [Save Defaults] [Run Query]  │   │
│   └ 📁 Marketing  │  └─────────────────────────────────────────────────┘   │
│   └ 📁 Analytics  │                                                         │
│                   │  Execution: 45ms | 127 rows | Cached                    │
│  📋 Views         │  ─────────────────────────────────────────────────────  │
│   └ My Views...   │                                                         │
│                   │  ┌─────────────────────────────────────────────────┐   │
│  ⭐ Favorites     │  │ Region    │ Revenue   │ Growth  │ Quarter      │   │
│   └ Query 1       │  ├───────────┼───────────┼─────────┼──────────────┤   │
│   └ View 2        │  │ North     │ $125,000  │ +12.5%  │ Q4 2024      │   │
│                   │  │ South     │ $98,000   │ +8.2%   │ Q4 2024      │   │
│  🕐 Recent        │  │ East      │ $156,000  │ +15.1%  │ Q4 2024      │   │
│   └ Query 3       │  │ West      │ $112,000  │ +10.8%  │ Q4 2024      │   │
│                   │  │ Central   │ $89,000   │ +6.4%   │ Q4 2024      │   │
│                   │  └─────────────────────────────────────────────────┘   │
│                   │                                                         │
│                   │  [Export ▼]  Showing 1-127 of 127                       │
│                   │                                                         │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

### Dashboard Viewer with Golden Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Sales Dashboard                              [+ Add Panel] [⚙️] [Save]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────┬───────────────────────────────────┐   │
│  │ 📋 Monthly Sales               ═│ 📊 Revenue Query                 ═│   │
│  │ ┌─────────────────────────────┐ │ ┌───────────────────────────────┐ │   │
│  │ │ [Entity Viewer - Grid Mode] │ │ │ Parameters: [Q4 ▼] [Run]      │ │   │
│  │ │                             │ │ │ ─────────────────────────────  │ │   │
│  │ │ ID   Customer    Amount     │ │ │ [Query Data Grid]             │ │   │
│  │ │ 1    Acme Corp   $5,000     │ │ │                               │ │   │
│  │ │ 2    Beta Inc    $3,200     │ │ │ Region   Revenue   Growth     │ │   │
│  │ │ 3    Gamma LLC   $8,500     │ │ │ North    $125K     +12%       │ │   │
│  │ │                             │ │ │ South    $98K      +8%        │ │   │
│  │ │ [Grid] [Cards] [Timeline]   │ │ └───────────────────────────────┘ │   │
│  │ └─────────────────────────────┘ │                                   │   │
│  ├═════════════════════════════════┼═══════════════════════════════════┤   │
│  │ 🎨 Sales Chart                 ═│ 🌐 Power BI                      ═│   │
│  │ ┌─────────────────────────────┐ │ ┌───────────────────────────────┐ │   │
│  │ │ [Artifact Viewer]           │ │ │ [iframe: External Dashboard]  │ │   │
│  │ │                             │ │ │                               │ │   │
│  │ │     📈 Rendered Chart       │ │ │                               │ │   │
│  │ │                             │ │ │                               │ │   │
│  │ │ Version: [v3 (latest) ▼]    │ │ │                               │ │   │
│  │ └─────────────────────────────┘ │ └───────────────────────────────┘ │   │
│  └─────────────────────────────────┴───────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Add Panel Dialog

```
┌──────────────────────────────────────────────────────────────────┐
│  Add Panel                                              [✗]      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Select Panel Type:                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │ 📋       │ │ 📊       │ │ 🎨       │ │ 🌐       │      │ │
│  │  │ View     │ │ Query    │ │ Artifact │ │ Web URL  │      │ │
│  │  │ ○        │ │ ●        │ │ ○        │ │ ○        │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  │                                                            │ │
│  │  [Custom panel types registered by plugins appear here]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ══════════════════════════════════════════════════════════════ │
│                                                                  │
│  Query Configuration:                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Select Query:                                              │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ 🔍 Search queries...                                 │  │ │
│  │  ├──────────────────────────────────────────────────────┤  │ │
│  │  │ 📁 /MJ/Sales                                         │  │ │
│  │  │    ├ Revenue by Region ✓                             │  │ │
│  │  │    └ Monthly Trends                                  │  │ │
│  │  │ 📁 /MJ/Analytics                                     │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  Options:                                                   │ │
│  │  [✓] Show parameter controls in panel                      │ │
│  │  [ ] Auto-refresh every [  60  ] seconds                   │ │
│  │  [✓] Show execution metadata                               │ │
│  │                                                             │ │
│  │  Panel Title: [Revenue by Region_____________________]     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                                         [Cancel] [Add Panel]     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Task Summary Checklist

### Phase 1: Foundation (Base Data Grid)
- [ ] 1.1.1 Create base-data-grid package structure
- [ ] 1.1.2 Create BaseDataGridComponent abstract class
- [ ] 1.1.3 Extract common grid functionality from EntityDataGridComponent
- [ ] 1.1.4 Create shared interfaces
- [ ] 1.1.5 Create column definition models
- [ ] 1.1.6 Create grid state management service
- [ ] 1.1.7 Create export functionality base
- [ ] 1.1.8 Create BaseDataGridModule
- [ ] 1.1.9 Write unit tests
- [ ] 1.1.10 Update build configuration
- [ ] 1.2.1 Add dependency on base-data-grid to entity-viewer
- [ ] 1.2.2 Refactor EntityDataGridComponent to extend BaseDataGridComponent
- [ ] 1.2.3 Move entity-specific logic to overrides
- [ ] 1.2.4 Update EntityViewerModule imports
- [ ] 1.2.5 Regression test all existing functionality
- [ ] 1.2.6 Update any breaking references

### Phase 2: Query Viewer Component ✅ COMPLETED
- [x] 2.1.1 Create query-viewer package structure
- [x] 2.1.2 Create QueryDataGridComponent with AG Grid Community
- [x] 2.1.3 Create QueryParameterFormComponent (slide-in panel)
- [x] 2.1.4 Create parameter input controls (per type)
- [x] 2.1.5 Create QueryViewerComponent (composite)
- [x] 2.1.6 Create QuerySelectorComponent (picker dialog)
- [x] 2.1.7 Query execution via RunQuery
- [x] 2.1.8 Parameter persistence via UserSettings
- [x] 2.1.9 Create QueryViewerModule
- [x] 2.1.10 Style all components
- [x] 2.1.11 Grid state persistence (columns, sort, widths)
- [x] 2.1.12 Row detail slide-in panel
- [x] 2.1.13 Entity link navigation
- [x] 2.1.14 Alternating row colors
- [ ] 2.2.1 Add Queries section to Data Explorer home view
- [ ] 2.2.2 Create QueryBrowserComponent (in dashboards package)
- [ ] 2.2.3 Add query loading to state service
- [ ] 2.2.4 Add query state interfaces
- [ ] 2.2.5 Create query category tree component
- [ ] 2.2.6 Add query favorites support
- [ ] 2.2.7 Add query recent access tracking
- [ ] 2.2.8 Update navigation panel for queries
- [ ] 2.2.9 Update module imports
- [ ] 2.2.10 Style query browser

### Phase 3: Dashboard Viewer Package
- [ ] 3.1.1 Create dashboard-viewer package structure
- [ ] 3.1.2 Install Golden Layout dependency
- [ ] 3.1.3 Create GoldenLayoutWrapperService
- [ ] 3.1.4 Create DashboardViewerComponent
- [ ] 3.1.5 Create DashboardPanelComponent
- [ ] 3.1.6 Create PanelHeaderComponent
- [ ] 3.1.7 Create DashboardBasePanelRenderer base class
- [ ] 3.1.8 Create DashboardBasePanelConfigDialog base class
- [ ] 3.1.9 Create AddPanelDialogComponent
- [ ] 3.1.10 Create DashboardSettingsDialogComponent
- [ ] 3.1.11 Create config schema interfaces
- [ ] 3.1.12 Create DashboardConfigService
- [ ] 3.1.13 Create DashboardStateService
- [ ] 3.1.14 Create DashboardViewerModule
- [ ] 3.1.15 Style all components
- [ ] 3.1.16 Write unit tests
- [ ] 3.2.1 Create ViewPanelRenderer
- [ ] 3.2.2 Create QueryPanelRenderer
- [ ] 3.2.3 Create ArtifactPanelRenderer
- [ ] 3.2.4 Create WebURLPanelRenderer
- [ ] 3.2.5 Create CustomPanelRenderer (delegating)
- [ ] 3.2.6 Register all renderers
- [ ] 3.3.1 Create ViewPanelConfigDialog
- [ ] 3.3.2 Create QueryPanelConfigDialog
- [ ] 3.3.3 Create ArtifactPanelConfigDialog
- [ ] 3.3.4 Create WebURLPanelConfigDialog
- [ ] 3.3.5 Create CustomPanelConfigDialog
- [ ] 3.3.6 Register all dialogs

### Phase 4: Database Schema & Metadata
- [ ] 4.1.1 Create DashboardPartType table migration
- [ ] 4.1.2 Insert built-in part types
- [ ] 4.1.3 Add entity metadata
- [ ] 4.1.4 Run CodeGen for entity classes
- [ ] 4.1.5 Create metadata JSON files

### Phase 5: Explorer Integration
- [ ] 5.1.1 Create ExplorerDashboardComponent wrapper
- [ ] 5.1.2 Integrate with Explorer navigation events
- [ ] 5.1.3 Handle dashboard user state persistence
- [ ] 5.1.4 Connect to Explorer toolbar actions
- [ ] 5.1.5 Update DashboardResource to use new viewer
- [ ] 5.1.6 Update module imports
- [ ] 5.1.7 Test in Explorer context

### Phase 6: Testing & Documentation
- [ ] 6.1 Write unit tests for base-data-grid
- [ ] 6.2 Write unit tests for query-viewer
- [ ] 6.3 Write unit tests for dashboard-viewer
- [ ] 6.4 Create integration tests
- [ ] 6.5 Write package README files
- [ ] 6.6 Update main CLAUDE.md with dashboard docs
- [ ] 6.7 Create example dashboards in metadata

---

## Dependencies Between Phases

```
Phase 1 (Base Data Grid)
    ↓
Phase 2 (Query Viewer) ──────────────────┐
    ↓                                    │
Phase 4 (Database Schema)                │
    ↓                                    │
Phase 3 (Dashboard Viewer) ←─────────────┘
    ↓
Phase 5 (Explorer Integration)
    ↓
Phase 6 (Testing & Documentation)
```

**Notes:**
- Phase 1 must complete before Phase 2 (Query Viewer depends on Base Data Grid)
- Phase 4 can run in parallel with Phase 2
- Phase 3 requires Phase 2 and Phase 4 to be complete
- Phase 5 requires Phase 3 to be complete
- Phase 6 runs last but test writing can happen alongside each phase

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Golden Layout Angular compatibility | High | Test early with POC; have Kendo TileLayout fallback |
| BaseDataGrid extraction complexity | Medium | Careful refactoring with comprehensive tests |
| Performance with many panels | Medium | Implement lazy loading; limit simultaneous renders |
| Query parameter UI complexity | Low | Start simple; iterate based on feedback |
| Plugin discovery issues | Low | Clear documentation; example implementations |

---

## Success Criteria

1. **Base Data Grid**: EntityDataGridComponent refactored with no regression
2. **Query Viewer**: Users can execute any query with beautiful parameter UI
3. **Dashboard Viewer**: Users can create dashboards with free-form panel arrangement
4. **Pluggability**: Third parties can register custom panel types via metadata + code
5. **Reusability**: Dashboard viewer works in any Angular app, not just Explorer
6. **Performance**: Dashboards with 10+ panels load in under 2 seconds
