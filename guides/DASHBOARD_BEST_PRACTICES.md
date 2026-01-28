# MemberJunction Dashboard Development Best Practices

This guide covers patterns and best practices for building dashboards in MemberJunction Angular applications. These patterns have been refined through production use and are designed to work well with MJ's metadata-driven architecture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Structure](#component-structure)
3. [State Management with Getter/Setters](#state-management-with-gettersetters)
4. [Using Engine Classes](#using-engine-classes)
5. [User Preferences](#user-preferences)
6. [Data Loading Patterns](#data-loading-patterns)
7. [Layout Patterns](#layout-patterns)
8. [Template Patterns](#template-patterns)
9. [Permission Checking](#permission-checking)
10. [Creating New Engines](#creating-new-engines)

---

## Architecture Overview

MemberJunction dashboards follow a layered architecture:

```
/YourDashboard/
├── components/
│   ├── domain-area-1/         # Domain-specific components
│   ├── domain-area-2/
│   └── widgets/               # Reusable UI components (KPI cards, charts)
└── index.ts                   # Public API exports
```

**Key Principles:**
- **No shared Angular data services** - Use MJ Engine classes instead (UI-independent, reusable)
- **Getter/setter pattern** for all component state (deterministic, debuggable)
- **BaseResourceComponent** for dashboard tabs that integrate with the resource system
- **Debounced user preferences** via UserInfoEngine with hierarchical keys
- **CSS-based layouts** using Flexbox and Grid (no external layout libraries)

---

## Component Structure

### Resource Components (Dashboard Tabs)

Dashboard tabs extend `BaseResourceComponent` and use `@RegisterClass` for framework integration:

```typescript
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

@RegisterClass(BaseResourceComponent, 'MyDashboardResource')
@Component({
  selector: 'app-my-dashboard',
  templateUrl: './my-dashboard.component.html',
  styleUrls: ['./my-dashboard.component.scss']
})
export class MyDashboardComponent extends BaseResourceComponent {

  // Required abstract method implementations
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'My Dashboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}

// REQUIRED: Tree-shaking prevention function
export function LoadMyDashboardResource() {}
```

### Presentational Components

Lightweight, focused components that receive data via `@Input` and emit events via `@Output`:

```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface KPICardData {
  title: string;
  value: string | number;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
}

@Component({
  selector: 'app-kpi-card',
  template: `
    <div class="kpi-card" [class]="'kpi-card--' + data.color">
      <div class="kpi-card__icon">
        <i [class]="'fa-solid ' + data.icon"></i>
      </div>
      <div class="kpi-card__title">{{ data.title }}</div>
      <div class="kpi-card__value">{{ formatValue(data.value) }}</div>
    </div>
  `
})
export class KPICardComponent {
  @Input() data!: KPICardData;
  @Output() cardClick = new EventEmitter<KPICardData>();

  formatValue(value: string | number): string {
    if (typeof value === 'number') {
      return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
    }
    return value;
  }
}
```

**Key characteristics:**
- No service dependencies - all data comes from parent via `@Input`
- Events communicated via `@Output` EventEmitters
- Single responsibility - one component, one purpose
- No state management of their own

---

## State Management with Getter/Setters

**Never use `ngOnChanges`** - it's unpredictable and hard to debug. Instead, use private backing fields with getter/setter wrappers for total control:

```typescript
export class AgentConfigurationComponent extends BaseResourceComponent {

  // ========================================================================
  // PRIVATE BACKING FIELDS
  // ========================================================================

  private _selectedAgentId: string | null = null;
  private _viewMode: 'grid' | 'list' = 'grid';
  private _isLoading = false;
  private _agents: AIAgentEntity[] = [];
  private _filterText = '';
  private _isDetailPanelVisible = false;

  // ========================================================================
  // INPUT PROPERTIES WITH GETTER/SETTERS
  // ========================================================================

  @Input()
  set selectedAgentId(value: string | null) {
    if (value !== this._selectedAgentId) {
      this._selectedAgentId = value;
      // Explicit, deterministic reaction to value change
      this.onAgentSelectionChanged(value);
    }
  }
  get selectedAgentId(): string | null {
    return this._selectedAgentId;
  }

  // ========================================================================
  // LOCAL STATE WITH GETTER/SETTERS
  // ========================================================================

  set viewMode(value: 'grid' | 'list') {
    if (value !== this._viewMode) {
      this._viewMode = value;
      this.saveUserPreferences();
    }
  }
  get viewMode(): 'grid' | 'list' {
    return this._viewMode;
  }

  set isLoading(value: boolean) {
    this._isLoading = value;
  }
  get isLoading(): boolean {
    return this._isLoading;
  }

  // ========================================================================
  // COMPUTED PROPERTIES (GETTERS ONLY)
  // ========================================================================

  get filteredAgents(): AIAgentEntity[] {
    if (!this._filterText) return this._agents;
    const search = this._filterText.toLowerCase();
    return this._agents.filter(a =>
      a.Name.toLowerCase().includes(search) ||
      a.Description?.toLowerCase().includes(search)
    );
  }

  get hasSelection(): boolean {
    return this._selectedAgentId !== null;
  }

  get selectedAgent(): AIAgentEntity | null {
    if (!this._selectedAgentId) return null;
    return this._agents.find(a => a.ID === this._selectedAgentId) || null;
  }

  // ========================================================================
  // REACTION METHODS
  // ========================================================================

  private onAgentSelectionChanged(agentId: string | null): void {
    if (agentId) {
      this._isDetailPanelVisible = true;
      this.loadAgentDetails(agentId);
    } else {
      this._isDetailPanelVisible = false;
    }
  }
}
```

**Benefits:**
- **Deterministic**: You know exactly when and why state changes
- **Debuggable**: Set breakpoints in setters to trace value changes
- **Controlled side effects**: Reactions happen in explicit methods
- **No timing issues**: Unlike `ngOnChanges`, setters fire synchronously

---

## Using Engine Classes

**Do NOT create Angular services for data access.** MemberJunction has a comprehensive Engine pattern that is:
- UI-independent (works in Angular, Node.js, or anywhere)
- Singleton-based with built-in caching
- Metadata-driven with auto-refresh capabilities

### Using Existing Engines

```typescript
import { MCPEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

export class MCPDashboardComponent extends BaseResourceComponent {

  private mcpEngine = MCPEngine.Instance;

  async ngOnInit(): Promise<void> {
    // Ensure engine is configured (idempotent - safe to call multiple times)
    await this.mcpEngine.Config(false);

    // Access cached data directly
    const servers = this.mcpEngine.Servers;
    const activeServers = this.mcpEngine.ActiveServers;
    const tools = this.mcpEngine.GetToolsByServer(serverId);
  }

  async refreshData(): Promise<void> {
    // Force refresh from database
    await this.mcpEngine.Config(true);
  }
}
```

### Common Engines and Their Locations

| Engine | Import Path | Purpose |
|--------|-------------|---------|
| `MCPEngine` | `@memberjunction/core-entities` | MCP servers, connections, tools |
| `UserInfoEngine` | `@memberjunction/core-entities` | User settings, notifications, favorites |
| `CredentialEngine` | `@memberjunction/credentials` | Secure credential storage |
| `EncryptionEngine` | `@memberjunction/encryption` | Field-level encryption |
| `AIEngine` | `@memberjunction/aiengine` | AI orchestration |

### When to Use RunView

For data not covered by engines, or when you need custom queries:

```typescript
import { RunView } from '@memberjunction/core';

// Single entity query
const rv = new RunView();
const result = await rv.RunView<MyEntity>({
  EntityName: 'My Entity',
  ExtraFilter: `Status = 'Active'`,
  OrderBy: 'Name',
  ResultType: 'entity_object'
});

// Batch multiple queries (much more efficient than sequential calls)
const [entities1, entities2, entities3] = await rv.RunViews([
  { EntityName: 'Entity One', ResultType: 'entity_object' },
  { EntityName: 'Entity Two', ResultType: 'entity_object' },
  { EntityName: 'Entity Three', ResultType: 'entity_object' }
]);
```

---

## User Preferences

User preferences are stored in the `MJ: User Settings` entity via `UserInfoEngine`. Use hierarchical keys and debounced updates.

### Key Structure Convention

```
{APPLICATION_ROOT}/{component-name}
```

Example keys:
- `AI_DASHBOARD_ROOT/ai-models` - AI Models tab preferences
- `AI_DASHBOARD_ROOT/ai-prompts` - AI Prompts tab preferences
- `AI_DASHBOARD_ROOT/execution-monitor` - Execution Monitor preferences

### Defining Preferences Interface

```typescript
/**
 * User preferences for the AI Models management component.
 * Stored as JSON in UserInfoEngine with key: AI_DASHBOARD_ROOT/ai-models
 */
export interface AIModelPreferences {
  viewMode: 'grid' | 'list';
  sortField: 'name' | 'vendor' | 'updated';
  sortDirection: 'asc' | 'desc';
  expandedSections: string[];
  gridColumnWidths?: Record<string, number>;
  filterPanelCollapsed: boolean;
}

const DEFAULT_PREFERENCES: AIModelPreferences = {
  viewMode: 'grid',
  sortField: 'name',
  sortDirection: 'asc',
  expandedSections: ['active-models'],
  filterPanelCollapsed: false
};
```

### Loading and Saving Preferences

```typescript
import { UserInfoEngine } from '@memberjunction/core-entities';

export class ModelManagementComponent extends BaseResourceComponent {

  // Settings key hierarchy: APPLICATION_ROOT/component-name
  private static readonly SETTINGS_ROOT = 'AI_DASHBOARD_ROOT';
  private static readonly SETTINGS_KEY = 'ai-models';

  private get FullSettingsKey(): string {
    return `${ModelManagementComponent.SETTINGS_ROOT}/${ModelManagementComponent.SETTINGS_KEY}`;
  }

  private _preferencesLoaded = false;

  async ngOnInit(): Promise<void> {
    await this.loadPreferences();
    this._preferencesLoaded = true;
  }

  /**
   * Load preferences from UserInfoEngine
   */
  private async loadPreferences(): Promise<void> {
    const json = UserInfoEngine.Instance.GetSetting(this.FullSettingsKey);
    if (json) {
      try {
        const prefs = JSON.parse(json) as AIModelPreferences;
        this.applyPreferences(prefs);
      } catch (e) {
        console.warn('Failed to parse preferences, using defaults');
        this.applyPreferences(DEFAULT_PREFERENCES);
      }
    } else {
      this.applyPreferences(DEFAULT_PREFERENCES);
    }
  }

  private applyPreferences(prefs: AIModelPreferences): void {
    this._viewMode = prefs.viewMode;
    this._sortField = prefs.sortField;
    this._sortDirection = prefs.sortDirection;
    this._expandedSections = new Set(prefs.expandedSections);
    this._filterPanelCollapsed = prefs.filterPanelCollapsed;
  }

  /**
   * Save preferences using DEBOUNCED method.
   * Multiple rapid calls are batched - only saves after 500ms of inactivity.
   */
  private savePreferences(): void {
    // Don't save during initial load
    if (!this._preferencesLoaded) return;

    const prefs: AIModelPreferences = {
      viewMode: this._viewMode,
      sortField: this._sortField,
      sortDirection: this._sortDirection,
      expandedSections: Array.from(this._expandedSections),
      filterPanelCollapsed: this._filterPanelCollapsed
    };

    // Use debounced method - automatically batches rapid updates
    UserInfoEngine.Instance.SetSettingDebounced(
      this.FullSettingsKey,
      JSON.stringify(prefs)
    );
  }

  // Setters that trigger preference saves
  set viewMode(value: 'grid' | 'list') {
    if (value !== this._viewMode) {
      this._viewMode = value;
      this.savePreferences();
    }
  }
}
```

### Debounce Configuration

The default debounce time is 500ms. You can adjust it globally:

```typescript
// Change debounce time (flushes any pending settings first)
UserInfoEngine.Instance.SettingsDebounceMs = 1000; // 1 second

// Force immediate save of all pending settings
await UserInfoEngine.Instance.FlushPendingSettings();

// Check if there are pending saves
if (UserInfoEngine.Instance.HasPendingSettings) {
  console.log(`${UserInfoEngine.Instance.PendingSettingsCount} settings pending`);
}
```

---

## Data Loading Patterns

### Load Once, Filter Client-Side

For reasonably sized datasets, load all data once and filter in memory:

```typescript
export class PromptManagementComponent extends BaseResourceComponent {
  private _allPrompts: AIPromptEntity[] = [];
  private _filterText = '';
  private _statusFilter: string[] = [];

  async loadData(): Promise<void> {
    this._isLoading = true;

    const rv = new RunView();
    const result = await rv.RunView<AIPromptEntity>({
      EntityName: 'AI Prompts',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this._allPrompts = result.Results;
    }

    this._isLoading = false;
  }

  // Filter client-side for instant response
  get filteredPrompts(): AIPromptEntity[] {
    let filtered = this._allPrompts;

    if (this._filterText) {
      const search = this._filterText.toLowerCase();
      filtered = filtered.filter(p =>
        p.Name.toLowerCase().includes(search)
      );
    }

    if (this._statusFilter.length > 0) {
      filtered = filtered.filter(p =>
        this._statusFilter.includes(p.Status)
      );
    }

    return filtered;
  }
}
```

### Batch Queries with RunViews

When loading multiple independent entities, **always use `RunViews` (plural)**:

```typescript
// GOOD: Single batch request
const rv = new RunView();
const [models, vendors, prompts] = await rv.RunViews([
  { EntityName: 'AI Models', ResultType: 'entity_object' },
  { EntityName: 'MJ: AI Vendors', ResultType: 'entity_object' },
  { EntityName: 'AI Prompts', ResultType: 'entity_object' }
]);

// BAD: Multiple sequential requests (slower, more DB connections)
const models = await new RunView().RunView({ EntityName: 'AI Models' });
const vendors = await new RunView().RunView({ EntityName: 'MJ: AI Vendors' });
const prompts = await new RunView().RunView({ EntityName: 'AI Prompts' });
```

### ResultType Guidelines

- Use `ResultType: 'entity_object'` when you need to **mutate and save** records
- Use `ResultType: 'simple'` for **read-only display** (more efficient)
- Use `Fields: ['ID', 'Name', ...]` with `simple` to limit data transfer

```typescript
// Read-only lookup - use simple for efficiency
const result = await rv.RunView<{ ID: string; Name: string }>({
  EntityName: 'AI Models',
  Fields: ['ID', 'Name', 'Status'],
  ResultType: 'simple'
});

// Need to modify records - use entity_object
const result = await rv.RunView<AIModelEntity>({
  EntityName: 'AI Models',
  ResultType: 'entity_object'
});
for (const model of result.Results) {
  model.Status = 'Active';
  await model.Save();
}
```

---

## Layout Patterns

Use CSS Flexbox and Grid for layouts. No external layout libraries needed.

### Resizable Panel Layout

```scss
.dashboard-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width, 280px);
  min-width: 180px;
  max-width: 450px;
  border-right: 1px solid #e0e0e0;
  overflow: auto;
  transition: width 0.2s ease;

  &.collapsed {
    width: 0;
    min-width: 0;
    border-right: none;
  }
}

.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;

  &:hover {
    background: #6366f1;
  }
}

.main-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
```

### Grid Dashboard Layout

```scss
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 20px;
}

.dashboard-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 16px;
  padding: 20px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;

  &.full-width {
    grid-column: 1 / -1;
  }
}
```

---

## Template Patterns

Use Angular 17+ control flow syntax:

```html
<!-- Loading state -->
@if (isLoading) {
  <div class="loading-overlay">
    <mj-loading text="Loading data..." size="large"></mj-loading>
  </div>
}

<!-- Conditional rendering -->
@if (selectedAgent) {
  <app-agent-detail [agent]="selectedAgent"></app-agent-detail>
} @else {
  <div class="empty-state">
    <i class="fa-solid fa-robot"></i>
    <p>Select an agent to view details</p>
  </div>
}

<!-- Lists with track -->
@for (agent of filteredAgents; track agent.ID) {
  <app-agent-card
    [agent]="agent"
    [selected]="agent.ID === selectedAgentId"
    (click)="selectAgent(agent.ID)"
  ></app-agent-card>
} @empty {
  <div class="no-results">No agents match your filter</div>
}

<!-- Switch statements -->
@switch (viewMode) {
  @case ('grid') {
    <div class="grid-view">...</div>
  }
  @case ('list') {
    <div class="list-view">...</div>
  }
}
```

---

## Permission Checking

Cache permission lookups for performance:

```typescript
export class AdminDashboardComponent extends BaseResourceComponent {
  private _permissionCache = new Map<string, boolean>();
  private _metadata = new Metadata();

  get UserCanCreateAgents(): boolean {
    return this.checkEntityPermission('AI Agents', 'Create');
  }

  get UserCanEditPrompts(): boolean {
    return this.checkEntityPermission('AI Prompts', 'Update');
  }

  private checkEntityPermission(
    entityName: string,
    permissionType: 'Create' | 'Read' | 'Update' | 'Delete'
  ): boolean {
    const cacheKey = `${entityName}_${permissionType}`;

    if (this._permissionCache.has(cacheKey)) {
      return this._permissionCache.get(cacheKey)!;
    }

    try {
      const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
      if (!entityInfo) {
        this._permissionCache.set(cacheKey, false);
        return false;
      }

      const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);

      let hasPermission = false;
      switch (permissionType) {
        case 'Create': hasPermission = userPermissions.CanCreate; break;
        case 'Read': hasPermission = userPermissions.CanRead; break;
        case 'Update': hasPermission = userPermissions.CanUpdate; break;
        case 'Delete': hasPermission = userPermissions.CanDelete; break;
      }

      this._permissionCache.set(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('Permission check failed:', error);
      this._permissionCache.set(cacheKey, false);
      return false;
    }
  }

  clearPermissionCache(): void {
    this._permissionCache.clear();
  }
}
```

---

## Creating New Engines

When you need to cache entity data that isn't covered by existing engines, create a new engine following this pattern.

### Simple Engine Template

```typescript
// File: packages/MJCoreEntities/src/engines/MyDomainEngine.ts

import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  UserInfo
} from '@memberjunction/core';
import { MyEntity, MyRelatedEntity } from '../generated/entity_subclasses';

/**
 * MyDomainEngine provides centralized caching for my-domain entities.
 *
 * @example
 * ```typescript
 * await MyDomainEngine.Instance.Config(false, contextUser);
 * const items = MyDomainEngine.Instance.Items;
 * const activeItems = MyDomainEngine.Instance.ActiveItems;
 * ```
 */
export class MyDomainEngine extends BaseEngine<MyDomainEngine> {

  // ========================================
  // Singleton Pattern
  // ========================================

  public static get Instance(): MyDomainEngine {
    return super.getInstance<MyDomainEngine>();
  }

  // ========================================
  // Private Storage
  // ========================================

  private _Items: MyEntity[] = [];
  private _RelatedItems: MyRelatedEntity[] = [];

  // ========================================
  // Configuration
  // ========================================

  public async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'My Entity',
        PropertyName: '_Items',
        CacheLocal: true
      },
      {
        Type: 'entity',
        EntityName: 'My Related Entity',
        PropertyName: '_RelatedItems',
        CacheLocal: true
      }
    ];

    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  // ========================================
  // Public Getters
  // ========================================

  public get Items(): MyEntity[] {
    return this._Items;
  }

  public get RelatedItems(): MyRelatedEntity[] {
    return this._RelatedItems;
  }

  // Computed/filtered getters
  public get ActiveItems(): MyEntity[] {
    return this._Items.filter(i => i.Status === 'Active');
  }

  // ========================================
  // Helper Methods
  // ========================================

  public GetItemById(itemId: string): MyEntity | undefined {
    return this._Items.find(i => i.ID === itemId);
  }

  public GetRelatedItemsForItem(itemId: string): MyRelatedEntity[] {
    return this._RelatedItems.filter(r => r.ItemID === itemId);
  }

  public GetItemName(itemId: string): string {
    return this.GetItemById(itemId)?.Name ?? 'Unknown';
  }
}
```

### Export from Package

Add to `packages/MJCoreEntities/src/index.ts`:

```typescript
export * from './engines/MyDomainEngine';
```

### BaseEnginePropertyConfig Options

| Property | Type | Description |
|----------|------|-------------|
| `Type` | `'entity' \| 'dataset'` | Data source type |
| `PropertyName` | `string` | Property name on the engine class (must match private field) |
| `EntityName` | `string` | Entity name for Type='entity' |
| `CacheLocal` | `boolean` | Use LocalCacheManager (default: false) |
| `CacheLocalTTL` | `number` | Local cache TTL in ms |
| `Filter` | `string` | Optional WHERE clause (but prefer client-side filtering) |
| `OrderBy` | `string` | Optional ORDER BY |
| `AutoRefresh` | `boolean` | Auto-refresh on entity changes (default: true) |
| `DebounceTime` | `number` | Per-config debounce time (default: 1500ms) |

---

## Summary Checklist

When building a new dashboard:

- [ ] Extend `BaseResourceComponent` with `@RegisterClass` decorator
- [ ] Add tree-shaking prevention function (`export function LoadMyResource() {}`)
- [ ] Use private backing fields with getter/setter wrappers for all state
- [ ] Use existing Engine classes for data (MCPEngine, UserInfoEngine, etc.)
- [ ] Use `RunViews` (plural) for batch data loading
- [ ] Define a TypeScript interface for user preferences
- [ ] Use hierarchical settings keys (`APP_ROOT/component-name`)
- [ ] Use `SetSettingDebounced` for preference saves
- [ ] Use CSS Flexbox/Grid for layouts
- [ ] Use Angular 17+ control flow syntax (`@if`, `@for`, `@switch`)
- [ ] Cache permission checks
- [ ] Use `mj-loading` component for loading states
- [ ] Register component in NgModule (no standalone components)
