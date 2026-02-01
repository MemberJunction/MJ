# MemberJunction Dashboard Development Best Practices

This guide covers patterns and best practices for building dashboards in MemberJunction Angular applications. These patterns have been refined through production use and are designed to work well with MJ's metadata-driven architecture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Naming Conventions](#naming-conventions)
3. [Navigation Patterns](#navigation-patterns)
4. [Component Structure](#component-structure)
5. [State Management with Getter/Setters](#state-management-with-gettersetters)
6. [Using Engine Classes](#using-engine-classes)
7. [User Preferences](#user-preferences)
8. [Data Loading Patterns](#data-loading-patterns)
9. [Local Caching with RunView](#local-caching-with-runview)
10. [Layout Patterns](#layout-patterns)
11. [Template Patterns](#template-patterns)
12. [Permission Checking](#permission-checking)
13. [Creating New Engines](#creating-new-engines)

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
- **Left panel navigation** within dashboards (top nav is reserved for shell)

---

## Naming Conventions

MemberJunction uses specific casing conventions for class members:

### Acronyms in Names

**Important:** Common acronyms like `ID`, `URL`, `API`, `HTTP` should be **ALL CAPS** in names:

```typescript
// ✅ CORRECT
AgentID, ModelID, UserID, RecordID
APIKey, APIURL
HTTPClient, HTTPStatus

// ❌ WRONG
AgentId, ModelId, UserId, RecordId
ApiKey, ApiUrl
HttpClient, HttpStatus
```

### PascalCase for Public Members

All public properties, methods, inputs, and outputs use **PascalCase**:

```typescript
export class AgentConfigurationComponent extends BaseResourceComponent {
  // Public properties - PascalCase
  @Input() AgentID: string | null = null;
  @Input() AutoRefresh: boolean = false;
  @Output() AgentSelected = new EventEmitter<string>();

  public IsLoading = false;
  public SelectedAgent: AIAgentEntity | null = null;
  public FilteredAgents: AIAgentEntity[] = [];

  // Public methods - PascalCase
  public LoadAgents(): Promise<void> { }
  public RefreshData(): void { }
  public GetAgentByID(id: string): AIAgentEntity | null { }
}
```

### camelCase for Private/Protected Members

All private and protected members use **camelCase**:

```typescript
export class AgentConfigurationComponent extends BaseResourceComponent {
  // Private backing fields - camelCase
  private _agentID: string | null = null;
  private _isLoading = false;
  private _agents: AIAgentEntity[] = [];
  private _filterText = '';

  // Protected members - camelCase
  protected metadata = new Metadata();
  protected permissionCache = new Map<string, boolean>();

  // Private methods - camelCase
  private loadAgentDetails(agentID: string): Promise<void> { }
  private applyFilters(): void { }
  private saveUserPreferences(): void { }
}
```

### Combined Example

```typescript
export class ModelManagementComponent extends BaseResourceComponent {
  // Private backing fields (camelCase)
  private _selectedModelID: string | null = null;
  private _viewMode: 'grid' | 'list' = 'grid';

  // Public getter/setter (PascalCase) wrapping private field (camelCase)
  @Input()
  set SelectedModelID(value: string | null) {
    if (value !== this._selectedModelID) {
      this._selectedModelID = value;
      this.onModelSelectionChanged(value);
    }
  }
  get SelectedModelID(): string | null {
    return this._selectedModelID;
  }

  // Public computed property (PascalCase)
  get HasSelection(): boolean {
    return this._selectedModelID !== null;
  }

  // Private reaction method (camelCase)
  private onModelSelectionChanged(modelID: string | null): void {
    // ...
  }
}
```

---

## Navigation Patterns

### Shell Uses Top Navigation

The MJ Explorer shell uses **top navigation tabs** for switching between main areas within an application. Each Application in MemberJunction defines its nav items which appear as top tabs.

### Dashboards Use Left Panel Navigation

**IMPORTANT:** Dashboard components should use **left panel (sidebar) navigation**, not another layer of top tabs. Using top tabs within a dashboard creates a confusing double-layer of horizontal navigation that disorients users.

```
┌─────────────────────────────────────────────────────────────┐
│  [App Logo]    [Tab 1]  [Tab 2]  [Tab 3]    [User Menu]    │  ← Shell top nav
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌────────────────────────────────────────────┐ │
│ │ Section 1│ │                                            │ │
│ │ Section 2│ │         Main Content Area                  │ │  ← Dashboard uses
│ │ Section 3│ │                                            │ │     LEFT nav
│ │ Section 4│ │                                            │ │
│ └──────────┘ └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Left Navigation Implementation

```html
<div class="dashboard-layout">
  <!-- Left Navigation Panel -->
  <nav class="dashboard-nav" [class.collapsed]="NavCollapsed">
    <div class="nav-header">
      <h3>AI Dashboard</h3>
      <button class="collapse-btn" (click)="toggleNav()">
        <i class="fa-solid" [class.fa-chevron-left]="!NavCollapsed"
                            [class.fa-chevron-right]="NavCollapsed"></i>
      </button>
    </div>

    <ul class="nav-items">
      @for (section of NavSections; track section.id) {
        <li class="nav-item"
            [class.active]="ActiveSection === section.id"
            (click)="selectSection(section.id)">
          <i [class]="section.icon"></i>
          @if (!NavCollapsed) {
            <span>{{ section.label }}</span>
          }
        </li>
      }
    </ul>
  </nav>

  <!-- Main Content -->
  <main class="dashboard-content">
    @switch (ActiveSection) {
      @case ('models') { <app-model-management></app-model-management> }
      @case ('prompts') { <app-prompt-management></app-prompt-management> }
      @case ('agents') { <app-agent-configuration></app-agent-configuration> }
      @case ('monitor') { <app-execution-monitoring></app-execution-monitoring> }
    }
  </main>
</div>
```

```scss
.dashboard-layout {
  display: flex;
  height: 100%;
}

.dashboard-nav {
  width: 220px;
  background: #f8f9fa;
  border-right: 1px solid #e0e6ed;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;

  &.collapsed {
    width: 56px;

    .nav-item span { display: none; }
  }
}

.nav-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.08);
    color: #6366f1;
  }

  &.active {
    background: rgba(99, 102, 241, 0.12);
    color: #6366f1;
    font-weight: 600;
    border-left: 3px solid #6366f1;
  }

  i {
    width: 20px;
    text-align: center;
  }
}

.dashboard-content {
  flex: 1;
  overflow: auto;
}
```

### When Tabs ARE Appropriate

Tabs within a dashboard content area are fine for **related content within a single view**, such as:
- Detail view tabs (Overview, Settings, History)
- Filter groupings (All, Active, Archived)
- Data presentation modes (Table, Chart, Summary)

The key is: **one level of primary navigation** (left panel), with optional secondary organization (tabs within content).

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
    <div class="kpi-card" [class]="'kpi-card--' + Data.color">
      <div class="kpi-card__icon">
        <i [class]="'fa-solid ' + Data.icon"></i>
      </div>
      <div class="kpi-card__title">{{ Data.title }}</div>
      <div class="kpi-card__value">{{ FormatValue(Data.value) }}</div>
    </div>
  `
})
export class KPICardComponent {
  @Input() Data!: KPICardData;
  @Output() CardClick = new EventEmitter<KPICardData>();

  FormatValue(value: string | number): string {
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
  // PRIVATE BACKING FIELDS (camelCase)
  // ========================================================================

  private _selectedAgentID: string | null = null;
  private _viewMode: 'grid' | 'list' = 'grid';
  private _isLoading = false;
  private _agents: AIAgentEntity[] = [];
  private _filterText = '';
  private _isDetailPanelVisible = false;

  // ========================================================================
  // INPUT PROPERTIES WITH GETTER/SETTERS (PascalCase)
  // ========================================================================

  @Input()
  set SelectedAgentID(value: string | null) {
    if (value !== this._selectedAgentID) {
      this._selectedAgentID = value;
      // Explicit, deterministic reaction to value change
      this.onAgentSelectionChanged(value);
    }
  }
  get SelectedAgentID(): string | null {
    return this._selectedAgentID;
  }

  // ========================================================================
  // LOCAL STATE WITH GETTER/SETTERS (PascalCase for public)
  // ========================================================================

  set ViewMode(value: 'grid' | 'list') {
    if (value !== this._viewMode) {
      this._viewMode = value;
      this.saveUserPreferences();
    }
  }
  get ViewMode(): 'grid' | 'list' {
    return this._viewMode;
  }

  set IsLoading(value: boolean) {
    this._isLoading = value;
  }
  get IsLoading(): boolean {
    return this._isLoading;
  }

  // ========================================================================
  // COMPUTED PROPERTIES (PascalCase - getters only)
  // ========================================================================

  get FilteredAgents(): AIAgentEntity[] {
    if (!this._filterText) return this._agents;
    const search = this._filterText.toLowerCase();
    return this._agents.filter(a =>
      a.Name.toLowerCase().includes(search) ||
      a.Description?.toLowerCase().includes(search)
    );
  }

  get HasSelection(): boolean {
    return this._selectedAgentID !== null;
  }

  get SelectedAgent(): AIAgentEntity | null {
    if (!this._selectedAgentID) return null;
    return this._agents.find(a => a.ID === this._selectedAgentID) || null;
  }

  // ========================================================================
  // REACTION METHODS (camelCase - private)
  // ========================================================================

  private onAgentSelectionChanged(agentID: string | null): void {
    if (agentID) {
      this._isDetailPanelVisible = true;
      this.loadAgentDetails(agentID);
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
  // Private backing fields (camelCase)
  private _allPrompts: AIPromptEntity[] = [];
  private _filterText = '';
  private _statusFilter: string[] = [];
  private _isLoading = false;

  // Public method (PascalCase)
  async LoadData(): Promise<void> {
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

  // Public computed property (PascalCase)
  get FilteredPrompts(): AIPromptEntity[] {
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

## Local Caching with RunView

For data that doesn't change frequently (like AI Prompts, configuration entities, lookup tables), use the `CacheLocal` option to store results in the browser's local storage. This dramatically improves load times on subsequent visits.

### When to Use Local Caching

**Good candidates for local caching:**
- AI Prompts - configuration data, rarely changes
- AI Models - model definitions, rarely changes
- Lookup tables - status codes, types, categories
- System configuration - settings that change infrequently

**Not suitable for local caching:**
- User-specific data that changes frequently
- Real-time data (execution logs, notifications)
- Data that must always be fresh

### Basic Usage

```typescript
import { RunView } from '@memberjunction/core';

export class PromptManagementComponent extends BaseResourceComponent {
  private _prompts: AIPromptEntity[] = [];

  async LoadPrompts(): Promise<void> {
    this.IsLoading = true;

    const rv = new RunView();
    const result = await rv.RunView<AIPromptEntity>({
      EntityName: 'AI Prompts',
      OrderBy: 'Name',
      ResultType: 'entity_object',
      CacheLocal: true,           // Enable local caching
      CacheLocalTTL: 300000       // Cache for 5 minutes (300,000ms)
    });

    if (result.Success) {
      this._prompts = result.Results;
    }

    this.IsLoading = false;
  }
}
```

### Cache TTL Guidelines

| Data Type | Recommended TTL | Example |
|-----------|-----------------|---------|
| Static configuration | 30-60 minutes | `1800000` - `3600000` |
| Semi-static data | 5-15 minutes | `300000` - `900000` |
| Frequently updated | 1-5 minutes | `60000` - `300000` |

### Force Refresh Pattern

When users need fresh data, pass `ForceRefresh: true`:

```typescript
export class PromptManagementComponent extends BaseResourceComponent {

  async LoadPrompts(forceRefresh = false): Promise<void> {
    this.IsLoading = true;

    const rv = new RunView();
    const result = await rv.RunView<AIPromptEntity>({
      EntityName: 'AI Prompts',
      OrderBy: 'Name',
      ResultType: 'entity_object',
      CacheLocal: true,
      CacheLocalTTL: 300000,
      ForceRefresh: forceRefresh   // Bypass cache when true
    });

    if (result.Success) {
      this._prompts = result.Results;
    }

    this.IsLoading = false;
  }

  // UI refresh button handler
  OnRefreshClicked(): void {
    this.LoadPrompts(true);  // Force fresh data from server
  }
}
```

### Batch Loading with Caching

Local caching works with `RunViews` (plural) as well:

```typescript
const rv = new RunView();
const [prompts, models, vendors] = await rv.RunViews([
  {
    EntityName: 'AI Prompts',
    ResultType: 'entity_object',
    CacheLocal: true,
    CacheLocalTTL: 300000  // 5 minutes
  },
  {
    EntityName: 'AI Models',
    ResultType: 'entity_object',
    CacheLocal: true,
    CacheLocalTTL: 600000  // 10 minutes
  },
  {
    EntityName: 'MJ: AI Vendors',
    ResultType: 'entity_object',
    CacheLocal: true,
    CacheLocalTTL: 3600000  // 1 hour (very static)
  }
]);
```

### Cache Invalidation After Mutations

When you modify cached data, remember to force refresh or manually update the cache:

```typescript
async SavePrompt(prompt: AIPromptEntity): Promise<boolean> {
  const saved = await prompt.Save();

  if (saved) {
    // Option 1: Force refresh to get updated data
    await this.LoadPrompts(true);

    // Option 2: Update local array directly (faster UX)
    const index = this._prompts.findIndex(p => p.ID === prompt.ID);
    if (index >= 0) {
      this._prompts[index] = prompt;
    } else {
      this._prompts.push(prompt);
    }
  }

  return saved;
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
    [selected]="agent.ID === SelectedAgentID"
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

  ClearPermissionCache(): void {
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

  public GetItemByID(itemID: string): MyEntity | undefined {
    return this._Items.find(i => i.ID === itemID);
  }

  public GetRelatedItemsForItem(itemID: string): MyRelatedEntity[] {
    return this._RelatedItems.filter(r => r.ItemID === itemID);
  }

  public GetItemName(itemID: string): string {
    return this.GetItemByID(itemID)?.Name ?? 'Unknown';
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

**Component Setup**
- [ ] Extend `BaseResourceComponent` with `@RegisterClass` decorator
- [ ] Add tree-shaking prevention function (`export function LoadMyResource() {}`)
- [ ] Register component in NgModule (no standalone components)

**Naming Conventions**
- [ ] Use **PascalCase** for all public members (properties, methods, @Input, @Output)
- [ ] Use **camelCase** for private/protected members

**State Management**
- [ ] Use private backing fields with getter/setter wrappers for all state
- [ ] Never use `ngOnChanges` - use getter/setters for deterministic reactions

**Navigation**
- [ ] Use **left panel navigation** within dashboards (shell uses top nav)

**Data Loading**
- [ ] Use existing Engine classes for data (MCPEngine, UserInfoEngine, etc.)
- [ ] Use `RunViews` (plural) for batch data loading
- [ ] Use `CacheLocal: true` for static/semi-static data (AI Prompts, Models, etc.)
- [ ] Set appropriate `CacheLocalTTL` based on data volatility

**User Preferences**
- [ ] Define a TypeScript interface for user preferences
- [ ] Use hierarchical settings keys (`APP_ROOT/component-name`)
- [ ] Use `SetSettingDebounced` for preference saves

**UI/UX**
- [ ] Use CSS Flexbox/Grid for layouts (no external layout libraries)
- [ ] Use Angular 17+ control flow syntax (`@if`, `@for`, `@switch`)
- [ ] Use `mj-loading` component for loading states
- [ ] Cache permission checks for performance
