# MemberJunction Explorer New UX - Implementation Plan

## Executive Summary

This document outlines the implementation plan for bringing the new Explorer UX prototype into production. The prototype introduces app-centric navigation with colored tabs, VS Code-style pinning behavior, multi-pane layouts via Golden Layout, and a unified workspace configuration system.

**Target Version:** 2.120.x

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Schema Changes](#schema-changes)
3. [BaseApplication Class System](#baseapplication-class-system)
4. [Workspace Configuration Structure](#workspace-configuration-structure)
5. [Component Architecture](#component-architecture)
6. [Data Migration](#data-migration)
7. [Deprecations](#deprecations)
8. [Implementation Checklist](#implementation-checklist)
9. [Prototype Comparison Requirements](#prototype-comparison-requirements)

---

## Architecture Overview

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Unified Configuration** | Single `Workspace.Configuration` JSON blob stores all tabs, layout, and preferences |
| **BaseApplication Classes** | Applications become first-class TypeScript classes with dynamic behavior |
| **App-Colored Tabs** | Each tab displays a color accent based on its parent application |
| **Pinned/Temporary Tabs** | VS Code-style behavior where unpinned tabs get replaced |
| **Golden Layout Integration** | Multi-pane drag-and-drop tab layouts |
| **Lazy Loading** | Tab content loads on first activation, persists in memory |

### Design Principles

1. **Single source of truth** - Workspace.Configuration holds everything
2. **Extensible via JSON** - No schema changes needed to add new preferences
3. **Dynamic app behavior** - BaseApplication subclasses can override defaults
4. **Cross-app tabs** - Users can have tabs from multiple apps simultaneously
5. **User-defined ordering** - Tab order is user-controlled, not based on pin state

---

## Schema Changes

### Application Entity Extensions

```sql
-- Add new columns to Application table
ALTER TABLE [__mj].[Application] ADD
    Color nvarchar(20) NULL,
    DefaultNavItems nvarchar(MAX) NULL,
    ClassName nvarchar(255) NULL;

-- Extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color code for visual theming (e.g., #4caf50)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'Color';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of default navigation items for this application. Parsed by BaseApplication.GetNavItems()',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'DefaultNavItems';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'TypeScript class name for ClassFactory registration (e.g., CRMApplication)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'ClassName';
```

### Workspace Entity Extensions

```sql
-- Add Configuration column to Workspace table
ALTER TABLE [__mj].[Workspace] ADD
    Configuration nvarchar(MAX) NULL;

-- Extended property for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON blob containing all workspace state: tabs, layout configuration, theme preferences, and active tab. Replaces WorkspaceItem table.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Workspace',
    @level2type = N'COLUMN', @level2name = N'Configuration';
```

### DefaultNavItems JSON Structure

```json
[
  {
    "Label": "Dashboard",
    "Route": "/crm/dashboard",
    "Icon": "fa-solid fa-chart-line"
  },
  {
    "Label": "Contacts",
    "Route": "/crm/contacts",
    "Icon": "fa-solid fa-address-book"
  },
  {
    "Label": "Companies",
    "Route": "/crm/companies",
    "Icon": "fa-solid fa-building"
  }
]
```

---

## BaseApplication Class System

### Package Location

Create new package: `@memberjunction/ng-base-application`

Location: `packages/Angular/Explorer/base-application/`

### BaseApplication Class

```typescript
import { RegisterClass } from '@memberjunction/global';

export interface NavItem {
  Label: string;
  Route: string;
  Icon?: string;
  Badge?: number | string;
}

export interface TabRequest {
  ApplicationId: string;
  Title: string;
  Route: string;
  ResourceTypeId?: string;
  ResourceRecordId?: string;
  Configuration?: Record<string, unknown>;
}

@RegisterClass(BaseApplication, 'BaseApplication')
export class BaseApplication {
  public ID: string;
  public Name: string;
  public Description: string;
  public Icon: string;
  public Color: string;
  public DefaultNavItems: string; // JSON string from DB
  public ClassName: string;

  constructor(data?: Partial<BaseApplication>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Returns navigation items for this application.
   * Override in subclass for dynamic behavior based on permissions, context, etc.
   */
  GetNavItems(): NavItem[] {
    if (this.DefaultNavItems) {
      try {
        return JSON.parse(this.DefaultNavItems);
      } catch (e) {
        console.error(`Failed to parse DefaultNavItems for ${this.Name}:`, e);
        return [];
      }
    }
    return [];
  }

  /**
   * Returns the application color for theming.
   * Override in subclass for dynamic color based on context.
   */
  GetColor(): string {
    return this.Color || '#757575';
  }

  /**
   * Creates the default tab request when user switches to this app.
   * Override in subclass for custom default tab logic.
   */
  CreateDefaultTab(): TabRequest | null {
    const navItems = this.GetNavItems();
    if (navItems.length > 0) {
      return {
        ApplicationId: this.ID,
        Title: navItems[0].Label,
        Route: navItems[0].Route
      };
    }
    return null;
  }

  /**
   * Called when this application becomes the active app.
   * Override in subclass for custom initialization logic.
   */
  async OnActivate(): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when user navigates away from this application.
   * Override in subclass for cleanup logic.
   */
  async OnDeactivate(): Promise<void> {
    // Default: no-op
  }
}
```

### Example Subclass

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, NavItem } from '@memberjunction/ng-base-application';

@RegisterClass(BaseApplication, 'CRMApplication')
export class CRMApplication extends BaseApplication {

  override GetNavItems(): NavItem[] {
    const baseItems = super.GetNavItems();

    // Dynamically add items based on user permissions
    // This would check against MJ's permission system
    if (this.userCanViewOpportunities()) {
      baseItems.push({
        Label: 'Opportunities',
        Route: '/crm/opportunities',
        Icon: 'fa-solid fa-handshake'
      });
    }

    return baseItems;
  }

  private userCanViewOpportunities(): boolean {
    // Check permissions via MJ authorization system
    return true; // Simplified
  }
}
```

### ClassFactory Usage

```typescript
import { MJGlobal } from '@memberjunction/global';
import { BaseApplication } from '@memberjunction/ng-base-application';

// Load application from database
const md = new Metadata();
const appEntity = await md.GetEntityObject<ApplicationEntity>('Applications');
await appEntity.Load(appId);

// Create instance using ClassFactory (gets subclass if registered)
const appClass = MJGlobal.Instance.ClassFactory.CreateInstance<BaseApplication>(
  BaseApplication,
  appEntity.ClassName || 'BaseApplication',
  appEntity
);

// Now use dynamic methods
const navItems = appClass.GetNavItems();
const color = appClass.GetColor();
const defaultTab = appClass.CreateDefaultTab();
```

---

## Workspace Configuration Structure

### TypeScript Interfaces

```typescript
/**
 * Root configuration stored in Workspace.Configuration
 */
export interface WorkspaceConfiguration {
  version: number;  // Schema version for future migrations

  // Layout state
  layout: LayoutConfig;
  activeTabId: string | null;

  // User preferences
  theme: 'light' | 'dark';
  preferences: WorkspacePreferences;

  // All tabs (replaces WorkspaceItem table)
  tabs: WorkspaceTab[];
}

/**
 * Layout configuration (Golden Layout serialized state)
 */
export interface LayoutConfig {
  root: LayoutNode;
  dimensions?: {
    headerHeight: number;
    borderWidth: number;
  };
}

export interface LayoutNode {
  type: 'row' | 'column' | 'stack' | 'component';
  content?: LayoutNode[];
  componentType?: string;
  componentState?: Record<string, unknown>;
  width?: number;
  height?: number;
  isClosable?: boolean;
  title?: string;
}

/**
 * User preferences for workspace behavior
 */
export interface WorkspacePreferences {
  tabPosition: 'top' | 'bottom';
  showTabIcons: boolean;
  autoSaveInterval: number; // milliseconds, 0 = disabled
}

/**
 * Individual tab definition (replaces WorkspaceItem row)
 */
export interface WorkspaceTab {
  id: string;
  applicationId: string;
  title: string;
  resourceTypeId: string;
  resourceRecordId: string;
  isPinned: boolean;
  sequence: number;
  lastAccessedAt: string; // ISO date string

  // Resource-specific configuration
  configuration: TabConfiguration;

  // Layout position reference
  layoutPosition?: string;
}

/**
 * Tab-specific configuration (extensible)
 */
export interface TabConfiguration {
  // Common fields
  entity?: string;
  extraFilter?: string;
  viewId?: string;
  searchInput?: string;

  // UI state
  scrollPosition?: number;
  expandedSections?: string[];
  customTitle?: string;

  // Allow additional properties
  [key: string]: unknown;
}
```

### Default Configuration

```typescript
export function createDefaultWorkspaceConfiguration(): WorkspaceConfiguration {
  return {
    version: 1,
    layout: {
      root: {
        type: 'row',
        content: []
      }
    },
    activeTabId: null,
    theme: 'light',
    preferences: {
      tabPosition: 'top',
      showTabIcons: true,
      autoSaveInterval: 5000
    },
    tabs: []
  };
}
```

---

## Component Architecture

### Shell Structure

```
AppComponent
├── HeaderComponent
│   ├── AppSwitcherComponent
│   │   ├── Current app display (icon, name, dropdown arrow)
│   │   └── Dropdown with all apps (colored accent bars)
│   ├── AppNavComponent
│   │   └── Horizontal nav items for current app (from GetNavItems())
│   └── ActionsComponent
│       ├── Search button
│       ├── Notifications button
│       └── User menu dropdown
├── TabContainerComponent
│   ├── Golden Layout container
│   │   ├── Tab headers with app-colored accents
│   │   └── Tab content (lazy loaded)
│   └── TabContextMenuComponent (right-click menu)
└── StatusBarComponent (optional, future)
```

### Key Components

#### TabContainerComponent

Responsibilities:
- Initialize and manage Golden Layout
- Handle tab creation, destruction, movement
- Apply app-specific styling (colors, pin icons)
- Manage lazy loading of tab content
- Save layout configuration on changes
- Restore layout from Workspace.Configuration

#### AppSwitcherComponent

Responsibilities:
- Display current active app with icon and name
- Show dropdown of all available apps
- Handle app switching (updates nav items, may open default tab)
- Apply app colors to dropdown items

#### AppNavComponent

Responsibilities:
- Display navigation items for current app
- Highlight active nav item based on current tab
- Handle navigation (opens tab or focuses existing)
- Apply app color to active state

### State Management

No separate Angular services for ORM - use BaseEntity classes directly. State management via BehaviorSubjects:

```typescript
export class WorkspaceStateManager {
  private workspace$ = new BehaviorSubject<WorkspaceEntity | null>(null);
  private configuration$ = new BehaviorSubject<WorkspaceConfiguration | null>(null);
  private applications$ = new BehaviorSubject<BaseApplication[]>([]);
  private activeApp$ = new BehaviorSubject<BaseApplication | null>(null);

  // Load workspace and applications on init
  async initialize(userId: string): Promise<void> {
    await this.loadWorkspace(userId);
    await this.loadApplications();
  }

  // Use BaseEntity directly
  private async loadWorkspace(userId: string): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<WorkspaceEntity>({
      EntityName: 'Workspaces',
      ExtraFilter: `UserID='${userId}'`,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results.length > 0) {
      const workspace = result.Results[0];
      this.workspace$.next(workspace);

      const config = workspace.Configuration
        ? JSON.parse(workspace.Configuration)
        : createDefaultWorkspaceConfiguration();
      this.configuration$.next(config);
    }
  }

  // Save configuration (debounced in practice)
  async saveConfiguration(): Promise<void> {
    const workspace = this.workspace$.value;
    const config = this.configuration$.value;
    if (workspace && config) {
      workspace.Configuration = JSON.stringify(config);
      await workspace.Save();
    }
  }
}
```

---

## Data Migration

### Migration Script (v2.120.x)

The migration must:
1. Add new columns to Application and Workspace tables
2. Migrate WorkspaceItem rows into Workspace.Configuration
3. Mark deprecated entities

```sql
-- ============================================================================
-- Migration: v2.120.x - New Explorer UX
-- ============================================================================

-- 1. Extend Application table
ALTER TABLE [__mj].[Application] ADD
    Color nvarchar(20) NULL,
    DefaultNavItems nvarchar(MAX) NULL,
    ClassName nvarchar(255) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hex color code for visual theming (e.g., #4caf50)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'Color';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of default navigation items. Parsed by BaseApplication.GetNavItems()',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'DefaultNavItems';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'TypeScript class name for ClassFactory registration',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'ClassName';

-- 2. Extend Workspace table
ALTER TABLE [__mj].[Workspace] ADD
    Configuration nvarchar(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON blob containing all workspace state: tabs, layout, theme. Replaces WorkspaceItem table.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Workspace',
    @level2type = N'COLUMN', @level2name = N'Configuration';

-- 3. Migrate WorkspaceItems into Workspace.Configuration
-- This creates the tabs array from existing WorkspaceItem rows
UPDATE w
SET Configuration = (
    SELECT
        1 as [version],
        JSON_QUERY('{"root":{"type":"row","content":[]}}') as [layout],
        NULL as activeTabId,
        'light' as theme,
        JSON_QUERY('{"tabPosition":"top","showTabIcons":true,"autoSaveInterval":5000}') as preferences,
        (
            SELECT
                LOWER(CONVERT(nvarchar(36), wi.ID)) as id,
                LOWER(CONVERT(nvarchar(36), COALESCE(
                    (SELECT TOP 1 ae.ApplicationID
                     FROM [__mj].[ApplicationEntity] ae
                     JOIN [__mj].[ResourceType] rt ON rt.EntityID = ae.EntityID
                     WHERE rt.ID = wi.ResourceTypeID),
                    '00000000-0000-0000-0000-000000000000'
                ))) as applicationId,
                wi.Name as title,
                LOWER(CONVERT(nvarchar(36), wi.ResourceTypeID)) as resourceTypeId,
                wi.ResourceRecordID as resourceRecordId,
                CAST(0 as bit) as isPinned,
                wi.Sequence as sequence,
                FORMAT(GETUTCDATE(), 'yyyy-MM-ddTHH:mm:ss.fffZ') as lastAccessedAt,
                JSON_QUERY(COALESCE(wi.Configuration, '{}')) as configuration
            FROM [__mj].[WorkspaceItem] wi
            WHERE wi.WorkspaceID = w.ID
            ORDER BY wi.Sequence
            FOR JSON PATH
        ) as tabs
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
)
FROM [__mj].[Workspace] w
WHERE EXISTS (SELECT 1 FROM [__mj].[WorkspaceItem] wi WHERE wi.WorkspaceID = w.ID);

-- Set default configuration for workspaces with no items
UPDATE [__mj].[Workspace]
SET Configuration = '{"version":1,"layout":{"root":{"type":"row","content":[]}},"activeTabId":null,"theme":"light","preferences":{"tabPosition":"top","showTabIcons":true,"autoSaveInterval":5000},"tabs":[]}'
WHERE Configuration IS NULL;

-- 4. Mark WorkspaceItem entity as deprecated
UPDATE [__mj].[Entity]
SET __mj_UpdatedAt = GETUTCDATE()
WHERE Name = 'Workspace Items';

-- Note: Entity deprecation is handled by setting appropriate metadata flags
-- The actual Status field update depends on your deprecation strategy

-- 5. Mark Explorer Navigation Items entity as deprecated
UPDATE [__mj].[Entity]
SET __mj_UpdatedAt = GETUTCDATE()
WHERE Name = 'Explorer Navigation Items';

-- 6. Set default colors for existing applications
UPDATE [__mj].[Application]
SET Color = CASE Name
    WHEN 'Admin' THEN '#757575'
    WHEN 'Explorer' THEN '#1976d2'
    WHEN 'Settings' THEN '#616161'
    ELSE '#1976d2'  -- Default blue
END
WHERE Color IS NULL;
```

---

## Deprecations

### Entities to Deprecate

| Entity | Status | Replacement |
|--------|--------|-------------|
| Workspace Items | Deprecated | Workspace.Configuration.tabs array |
| Explorer Navigation Items | Deprecated | Application.DefaultNavItems |

### Migration Path for Existing Code

1. **WorkspaceItem usage** - Update all code to use Workspace.Configuration.tabs
2. **Explorer Navigation Items** - Remove from UI, data migrated to Application.DefaultNavItems
3. **NavigationComponent** - Rewrite to use new configuration structure

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] **Create database migration file**
  - [ ] Add columns to Application table (Color, DefaultNavItems, ClassName)
  - [ ] Add Configuration column to Workspace table
  - [ ] Add sp_addextendedproperty for all new columns
  - [ ] Create data migration for WorkspaceItems → Configuration
  - [ ] Mark deprecated entities

- [ ] **Run CodeGen**
  - [ ] Generate updated entity classes for Application and Workspace
  - [ ] Verify new properties appear in TypeScript classes

- [ ] **Create @memberjunction/ng-base-application package**
  - [ ] Set up package structure in packages/Angular/Explorer/base-application/
  - [ ] Implement BaseApplication class with all methods
  - [ ] Define TypeScript interfaces (NavItem, TabRequest, WorkspaceConfiguration, etc.)
  - [ ] Export all types from package index
  - [ ] Add to workspace dependencies

### Phase 2: Core Infrastructure

- [ ] **Implement WorkspaceStateManager**
  - [ ] Load workspace with configuration
  - [ ] Parse/serialize configuration JSON
  - [ ] Debounced save functionality
  - [ ] Tab CRUD operations
  - [ ] Layout configuration management

- [ ] **Implement ApplicationManager**
  - [ ] Load all applications on startup
  - [ ] Create BaseApplication instances via ClassFactory
  - [ ] Manage active application state
  - [ ] Provide GetNavItems() access

- [ ] **Golden Layout Integration**
  - [ ] Install golden-layout 2.6.0
  - [ ] Create wrapper for Angular integration
  - [ ] Implement layout serialization/deserialization
  - [ ] Tab creation with app-colored styling

### Phase 3: UI Components

- [ ] **HeaderComponent redesign**
  - [ ] Implement AppSwitcherComponent
    - [ ] Dropdown UI with app colors
    - [ ] Click-outside-to-close behavior
    - [ ] App switching logic
  - [ ] Implement AppNavComponent
    - [ ] Horizontal nav items from GetNavItems()
    - [ ] Active state based on current tab
    - [ ] App color theming
  - [ ] Update actions section (search, notifications, user menu)

- [ ] **TabContainerComponent**
  - [ ] Golden Layout initialization
  - [ ] Tab styling with app colors (CSS variables)
  - [ ] Pin icon rendering and interaction
  - [ ] Context menu (right-click)
    - [ ] Pin/Unpin option
    - [ ] Close option
  - [ ] Double-click to pin/unpin
  - [ ] Hover-based close button (hidden by default)
  - [ ] Lazy loading of tab content

- [ ] **Tab styling (SCSS)**
  - [ ] App color accent bar (left edge)
  - [ ] Active tab styling (white background, border)
  - [ ] Pinned tab indicator
  - [ ] Close button hover behavior
  - [ ] Transition animations

### Phase 4: Behavior Implementation

- [ ] **Tab management**
  - [ ] Open tab (new or focus existing)
  - [ ] Close tab (with unsaved changes check)
  - [ ] Pin/unpin toggle
  - [ ] Temporary tab replacement logic
  - [ ] Tab reordering via drag
  - [ ] Move tab to new pane

- [ ] **App switching**
  - [ ] Switch to app with existing tabs
  - [ ] Switch to app without tabs (open default)
  - [ ] Replace temporary tab on app switch
  - [ ] Preserve cross-app tabs

- [ ] **Layout persistence**
  - [ ] Save on tab open/close
  - [ ] Save on tab move/resize
  - [ ] Save on pin/unpin
  - [ ] Debounced saves (500ms)
  - [ ] Restore layout on load

- [ ] **Lazy loading**
  - [ ] Show loading placeholder
  - [ ] Load content on first 'show' event
  - [ ] Keep loaded content in memory
  - [ ] Update lastAccessedAt on show

### Phase 5: Testing & Validation

- [ ] **Unit tests**
  - [ ] BaseApplication class and subclasses
  - [ ] WorkspaceStateManager operations
  - [ ] Configuration serialization/deserialization
  - [ ] Tab matching logic

- [ ] **Integration tests**
  - [ ] Database migrations
  - [ ] CodeGen entity generation
  - [ ] API operations for Workspace/Application

- [ ] **E2E tests**
  - [ ] Open/close/pin tabs
  - [ ] Drag tabs between panes
  - [ ] App switching
  - [ ] Layout persistence across refresh
  - [ ] Cross-app tab behavior

- [ ] **Prototype comparison** (see next section)

### Phase 6: Migration & Deployment

- [ ] **Documentation**
  - [ ] Update developer docs for new architecture
  - [ ] Document BaseApplication extension pattern
  - [ ] Document WorkspaceConfiguration structure
  - [ ] Add migration guide for existing implementations

- [ ] **Deployment**
  - [ ] Run database migrations
  - [ ] Deploy updated packages
  - [ ] Verify data migration success
  - [ ] Monitor for issues

---

## Prototype Comparison Requirements

### Mandatory Comparison Process

During development, the implementation MUST be continuously compared against the prototype to ensure:

1. **Functional parity** - All prototype features work identically in production
2. **Visual parity** - UI looks exactly like the prototype

### Comparison Checklist

#### Visual Comparison

Run prototype (`plans/mj-explorer-new-ux/explorer-prototype`) and production side-by-side:

- [ ] **Header**
  - [ ] App switcher button styling matches (icon, name, arrow)
  - [ ] App switcher dropdown matches (colored accent bars, hover states)
  - [ ] Nav items match (horizontal layout, spacing, active state)
  - [ ] App colors applied correctly throughout

- [ ] **Tabs**
  - [ ] Tab height and padding matches
  - [ ] App color accent bar position and size
  - [ ] Active tab styling (white background, top border-radius)
  - [ ] Inactive tab styling (transparent, hover state)
  - [ ] Font styling (italic for temporary, normal for pinned)
  - [ ] Close button positioning and hover behavior
  - [ ] Pin icon styling and position

- [ ] **Tab bar**
  - [ ] Background color (#f5f5f5)
  - [ ] Bottom border styling
  - [ ] Padding/margins match

#### Functional Comparison

- [ ] **Tab operations**
  - [ ] Single-click opens/focuses tab
  - [ ] Double-click pins/unpins tab
  - [ ] Right-click shows context menu
  - [ ] Close button appears on hover (not on pinned tabs)
  - [ ] Pin icon clickable to unpin

- [ ] **App switching**
  - [ ] Clicking app in dropdown switches active app
  - [ ] Nav items update for new app
  - [ ] If no tabs for app, opens default
  - [ ] Replaces temporary tab from previous app

- [ ] **Layout persistence**
  - [ ] Tabs persist on page refresh
  - [ ] Tab positions persist (Golden Layout panes)
  - [ ] Active tab restored
  - [ ] Pin states restored

- [ ] **Drag and drop**
  - [ ] Tabs can be reordered within strip
  - [ ] Tabs can be moved to new panes
  - [ ] App color persists after move
  - [ ] Pin state persists after move

- [ ] **Lazy loading**
  - [ ] Tab content only loads on first click
  - [ ] Loading placeholder shown initially
  - [ ] Content stays loaded after first view

### Prototype Reference Files

When implementing, reference these prototype files:

| Component | Prototype File |
|-----------|----------------|
| Shell layout | `src/app/shell/shell.component.*` |
| Header | `src/app/shell/header/header.component.*` |
| Tab container | `src/app/shell/tab-container/tab-container.component.*` |
| Shell service | `src/app/core/services/shell.service.ts` |
| Interfaces | `src/app/core/models/app.interface.ts` |
| App definitions | `src/app/core/apps/` |

### Sign-off Requirement

Before merging, obtain sign-off that:

1. All items in comparison checklist are verified
2. No visual differences between prototype and production
3. All functional behaviors match exactly
4. Performance is acceptable (lazy loading, save debouncing)

---

## Technical Notes

### Golden Layout Version

Using golden-layout 2.6.0 - stable and well-documented.

### Package Dependencies

```json
{
  "@memberjunction/ng-base-application": {
    "dependencies": {
      "@memberjunction/global": "workspace:*",
      "@memberjunction/core": "workspace:*"
    }
  }
}
```

### Performance Considerations

1. **Debounced saves** - 500ms delay to batch rapid changes
2. **Lazy loading** - Only load tab content on first activation
3. **Single configuration blob** - One DB read/write for entire workspace
4. **Memory management** - Keep loaded tabs in memory, don't re-create

### Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Timeline

This implementation should be broken into sprints:

1. **Sprint 1**: Foundation (migration, CodeGen, base-application package)
2. **Sprint 2**: Core infrastructure (state management, Golden Layout)
3. **Sprint 3**: UI components (header, tabs, styling)
4. **Sprint 4**: Behavior (tab ops, app switching, persistence)
5. **Sprint 5**: Testing, validation, documentation
6. **Sprint 6**: Deployment and monitoring

---

## Appendix: Code Examples

### Loading Applications with ClassFactory

```typescript
import { MJGlobal } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { ApplicationEntity } from '@memberjunction/core-entities';
import { BaseApplication } from '@memberjunction/ng-base-application';

async function loadApplications(): Promise<BaseApplication[]> {
  const rv = new RunView();
  const result = await rv.RunView<ApplicationEntity>({
    EntityName: 'Applications',
    ResultType: 'entity_object'
  });

  if (!result.Success) {
    throw new Error('Failed to load applications');
  }

  return result.Results.map(appEntity => {
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseApplication>(
      BaseApplication,
      appEntity.ClassName || 'BaseApplication',
      appEntity
    );
  });
}
```

### Saving Workspace Configuration

```typescript
async function saveWorkspaceConfiguration(
  workspace: WorkspaceEntity,
  configuration: WorkspaceConfiguration
): Promise<void> {
  workspace.Configuration = JSON.stringify(configuration);
  const saved = await workspace.Save();
  if (!saved) {
    throw new Error('Failed to save workspace configuration');
  }
}
```

### Tab Opening Logic

```typescript
function openTab(
  configuration: WorkspaceConfiguration,
  request: TabRequest,
  app: BaseApplication
): WorkspaceConfiguration {
  // Check for existing tab
  const existingTab = configuration.tabs.find(tab =>
    tab.applicationId === request.ApplicationId &&
    tab.configuration.entity === request.Configuration?.entity &&
    tab.configuration.viewId === request.Configuration?.viewId
  );

  if (existingTab) {
    // Focus existing tab
    return {
      ...configuration,
      activeTabId: existingTab.id
    };
  }

  // Find temporary tab to replace
  const tempTab = configuration.tabs.find(tab =>
    tab.applicationId === request.ApplicationId && !tab.isPinned
  );

  if (tempTab) {
    // Replace temporary tab
    const updatedTabs = configuration.tabs.map(tab =>
      tab.id === tempTab.id
        ? {
            ...tab,
            title: request.Title,
            resourceTypeId: request.ResourceTypeId || '',
            resourceRecordId: request.ResourceRecordId || '',
            configuration: request.Configuration || {},
            lastAccessedAt: new Date().toISOString()
          }
        : tab
    );
    return {
      ...configuration,
      tabs: updatedTabs,
      activeTabId: tempTab.id
    };
  }

  // Create new tab
  const newTab: WorkspaceTab = {
    id: generateUUID(),
    applicationId: request.ApplicationId,
    title: request.Title,
    resourceTypeId: request.ResourceTypeId || '',
    resourceRecordId: request.ResourceRecordId || '',
    isPinned: false,
    sequence: configuration.tabs.length,
    lastAccessedAt: new Date().toISOString(),
    configuration: request.Configuration || {}
  };

  return {
    ...configuration,
    tabs: [...configuration.tabs, newTab],
    activeTabId: newTab.id
  };
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-XX-XX | Claude | Initial implementation plan |
