# MJ Explorer UX Redesign - Implementation Plan

## Executive Summary

Complete redesign of MJ Explorer's user experience to create a modern, VS Code-like interface with simplified navigation, intelligent tab management, and powerful workspace capabilities. This redesign eliminates the confusing dual-navigation model (drawer + home tab) in favor of a clean left nav + Golden Layout tab system with preview/permanent tab modes.

## Goals

1. **Simplify Navigation** - Single, clean left nav with user/role-specific items
2. **Modern Tab Management** - VS Code-style preview tabs, drag-drop, split windows
3. **App-Centric Experience** - Conversations and Apps as first-class citizens
4. **Data Explorer Mode** - Toggle between dashboard and data exploration views per app
5. **Mobile Responsive** - Full mobile/tablet support throughout
6. **Preserve Workspaces** - Seamless migration of existing workspace items

## Non-Goals

- Changing the underlying entity/metadata system
- Modifying existing dashboard/report/entity components
- Breaking backward compatibility with existing data

---

## Architecture Overview

### Current Architecture (To Replace)

```
┌─────────────────────────────────────────┐
│  Header (80px, navy blue)               │
│  - Hamburger, Logo, Search, Notifs      │
├─────────────────────────────────────────┤
│      │  Kendo Drawer                    │
│ Nav  │  ├─ Home Tab (fixed)             │
│ Draw │  │   └─ <router-outlet>          │
│ er   │  │       ├─ HomeComponent        │
│      │  │       ├─ DataBrowserComp      │
│      │  │       └─ Other browsers       │
│ Mini │  └─ Dynamic Tabs (closeable)     │
│ or   │      └─ Resource wrappers        │
│ Exp. │                                   │
└─────────────────────────────────────────┘
```

**Problems:**
- Dual navigation (drawer changes home tab vs opens new tabs)
- Home tab serves too many purposes
- Kendo Drawer is complex and not responsive enough
- No preview tab concept (tab bloat)
- Inconsistent resource opening behavior

### New Architecture (Target)

```
┌─────────────────────────────────────────┐
│  Header (60px, simplified)              │
│  - Logo, Search, Notifications, Avatar  │
├─────┬───────────────────────────────────┤
│     │  Golden Layout Tab System         │
│ Nav │  ┌─────────────────────────────┐  │
│     │  │ Tab Bar (drag, split, etc.) │  │
│ - 💬│  ├─────────────────────────────┤  │
│ - 📱│  │                             │  │
│ - 📊│  │  Tab Content                │  │
│ - ⚙️ │  │  (Components)               │  │
│     │  │                             │  │
│ Cust│  │  - Preview tabs (italic)    │  │
│ om  │  │  - Permanent tabs (normal)  │  │
│ CSS │  │  - Split horizontal/vert    │  │
│     │  │                             │  │
└─────┴───────────────────────────────────┘
```

**Benefits:**
- Single navigation paradigm (left nav launches, everything in tabs)
- No special home tab
- Modern tab management (preview mode, splitting)
- Custom, responsive left nav
- Clean, professional appearance

---

## Implementation Phases

### Phase 1: Golden Layout Integration (Foundation)
**Goal:** Replace Kendo TabStrip with Golden Layout, prove it works with our components

### Phase 2: Custom Left Navigation
**Goal:** Replace Kendo Drawer with custom navigation component

### Phase 3: Navigation Items & User Preferences
**Goal:** Extend metadata for user-specific navigation

### Phase 4: App Data Explorer Mode
**Goal:** Add dashboard/explorer toggle for apps

### Phase 5: Workspace Migration & Polish
**Goal:** Migrate existing workspaces, responsive design, final touches

---

## Phase 1: Golden Layout Integration

### 1.1 Install Golden Layout

**Package:**
```bash
npm install golden-layout@2.7.0
npm install --save-dev @types/golden-layout
```

**Note:** We'll use Golden Layout 2.x (latest stable). There's an Angular wrapper `@embedded-enterprises/ng-golden-layout` but we may build our own for better control.

**Files to create:**
- `packages/Angular/Explorer/explorer-core/src/lib/golden-layout/` (new directory)

### 1.2 Create GoldenLayoutService

**Purpose:** Manage Golden Layout instance, tab operations, state persistence

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/golden-layout/golden-layout.service.ts`

**Responsibilities:**
```typescript
export class GoldenLayoutService {
  // Golden Layout instance
  private layout: GoldenLayout;

  // Current workspace
  private currentWorkspace: WorkspaceEntity;

  // Track preview tab (only one at a time)
  private previewTabId: string | null = null;

  // Tab state management
  private tabs: Map<string, TabState> = new Map();

  // Methods
  initialize(containerElement: HTMLElement, config?: LayoutConfig): void
  addTab(tabData: ResourceData, isPreview: boolean): void
  removeTab(tabId: string): void
  selectTab(tabId: string): void
  convertPreviewToPermanent(tabId: string): void
  splitHorizontal(): void
  splitVertical(): void
  serializeLayout(): LayoutConfig
  restoreLayout(config: LayoutConfig): void
  saveWorkspace(): Promise<void>
  loadWorkspace(workspaceId: string): Promise<void>
}

interface TabState {
  id: string;
  title: string;
  isPreview: boolean;
  isDirty: boolean;
  resourceType: string;
  resourceRecordId: string;
  component: Type<any>;
  configuration: any;  // Stores query params, filters, etc.
}
```

**Key Behaviors:**
- **Preview Tab Management:** Only one preview tab exists at a time. When user single-clicks a new resource:
  - If preview tab exists → Replace its content and update title
  - If no preview tab → Create new preview tab
- **Permanent Tabs:** Double-click, edit action, or manual convert makes permanent
- **Tab Replacement:** Preview tab is replaced by next single-click action
- **Visual Indicator:** Preview tab titles rendered in italic

### 1.3 Create GoldenLayoutContainerComponent

**Purpose:** Angular wrapper for Golden Layout, hosts tab content

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/golden-layout/golden-layout-container.component.ts`

**Template:**
```html
<div #layoutContainer class="golden-layout-container"></div>
```

**Component:**
```typescript
@Component({
  selector: 'mj-golden-layout-container',
  templateUrl: './golden-layout-container.component.html',
  styleUrls: ['./golden-layout-container.component.scss']
})
export class GoldenLayoutContainerComponent implements OnInit, OnDestroy {
  @ViewChild('layoutContainer', { static: true })
  containerElement: ElementRef<HTMLElement>;

  constructor(
    private goldenLayoutService: GoldenLayoutService,
    private viewContainerRef: ViewContainerRef,
    private cfr: ComponentFactoryResolver
  ) {}

  ngOnInit() {
    // Initialize Golden Layout
    this.goldenLayoutService.initialize(
      this.containerElement.nativeElement,
      this.getInitialConfig()
    );

    // Register component factory for dynamic components
    this.registerComponentFactories();

    // Listen for MJGlobal events
    this.subscribeToResourceEvents();
  }

  private registerComponentFactories() {
    // Register all resource wrapper components
    // Golden Layout will call our factory to create Angular components
  }

  private subscribeToResourceEvents() {
    // Listen to MJGlobal.Instance.GetEventListener(ResourceData)
    // When ResourceData event fires, call goldenLayoutService.addTab()
  }

  private getInitialConfig(): LayoutConfig {
    // Return default empty layout or restore from workspace
    return {
      root: {
        type: 'row',
        content: []
      }
    };
  }
}
```

**Styling:**
```scss
.golden-layout-container {
  width: 100%;
  height: 100%;
  overflow: hidden;

  // Override Golden Layout default styles to match MJ theme
  ::ng-deep {
    .lm_header {
      background-color: var(--gray-100);
      border-bottom: 1px solid var(--gray-300);
      height: 40px;

      .lm_tab {
        font-family: inherit;
        font-size: 13px;
        padding: 8px 12px;

        &.preview {
          font-style: italic;
          opacity: 0.8;
        }

        &.lm_active {
          background-color: white;
          border-bottom: 2px solid var(--mj-blue);
        }
      }
    }

    .lm_content {
      background-color: white;
    }
  }
}
```

### 1.4 Create Tab Component Wrappers

Golden Layout needs to render Angular components dynamically. We'll create a generic wrapper.

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/golden-layout/tab-content-host.component.ts`

**Purpose:** Dynamically loads the appropriate resource wrapper component

```typescript
@Component({
  selector: 'mj-tab-content-host',
  template: '<ng-container #dynamicComponentContainer></ng-container>'
})
export class TabContentHostComponent implements OnInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true })
  container: ViewContainerRef;

  @Input() tabState: TabState;

  constructor(private cfr: ComponentFactoryResolver) {}

  ngOnInit() {
    this.loadComponent();
  }

  private loadComponent() {
    // Get component type based on resourceType
    const componentType = this.getComponentForResourceType(
      this.tabState.resourceType
    );

    // Create component
    const factory = this.cfr.resolveComponentFactory(componentType);
    const componentRef = this.container.createComponent(factory);

    // Pass data to component
    if (componentRef.instance.ResourceData) {
      componentRef.instance.ResourceData = {
        ResourceTypeID: this.tabState.resourceType,
        ResourceRecordID: this.tabState.resourceRecordId,
        Configuration: this.tabState.configuration
      };
    }

    // Subscribe to component events (dirty state, title changes, etc.)
    this.subscribeToComponentEvents(componentRef.instance);
  }

  private getComponentForResourceType(resourceType: string): Type<any> {
    // Map resource types to components
    // e.g., 'Dashboard' → DashboardResourceComponent
    // This uses the existing resource wrapper components
  }
}
```

### 1.5 Update NavigationComponent

**Goal:** Replace Kendo TabStrip with Golden Layout

**Current file:** `packages/Angular/Explorer/explorer-core/src/lib/navigation/navigation.component.ts`

**Changes:**
```typescript
// OLD (remove):
@ViewChild(TabStripComponent, { static: false }) tabstrip: TabStripComponent;
tabs: Array<Tab> = [];

// NEW (add):
@ViewChild(GoldenLayoutContainerComponent, { static: true })
goldenLayout: GoldenLayoutContainerComponent;
```

**Template changes:**
```html
<!-- OLD (remove) -->
<kendo-drawer-container>
  <kendo-drawer>...</kendo-drawer>
  <kendo-drawer-content>
    <mj-tabstrip>
      <mj-tabstrip-tab [title]="'Home'" [selected]="true">
        <router-outlet></router-outlet>
      </mj-tabstrip-tab>
      <mj-tabstrip-tab *ngFor="let tab of tabs">
        <mj-resource [Data]="tab.data"></mj-resource>
      </mj-tabstrip-tab>
    </mj-tabstrip>
  </kendo-drawer-content>
</kendo-drawer-container>

<!-- NEW (add) -->
<kendo-drawer-container>
  <kendo-drawer>...</kendo-drawer>
  <kendo-drawer-content>
    <mj-golden-layout-container></mj-golden-layout-container>
  </kendo-drawer-content>
</kendo-drawer-container>
```

**Logic changes:**
```typescript
// OLD method (remove/refactor):
AddOrSelectTab(resourceData: ResourceData) {
  // Old logic that managed tabs array
}

// NEW method (update):
AddOrSelectTab(resourceData: ResourceData, isPreview: boolean = true) {
  this.goldenLayoutService.addTab(resourceData, isPreview);
}

// Handle double-click for permanent tabs
onResourceDoubleClick(resourceData: ResourceData) {
  this.goldenLayoutService.addTab(resourceData, false); // Permanent
}

// Handle single-click for preview
onResourceSingleClick(resourceData: ResourceData) {
  this.goldenLayoutService.addTab(resourceData, true); // Preview
}
```

### 1.6 Update Resource Wrapper Components

**Goal:** Make resource wrappers notify when they become "dirty" (edited)

**Affected files:**
- `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/*.component.ts`

**Changes to each wrapper:**
```typescript
@Output() becameDirty = new EventEmitter<void>();

// In methods that indicate editing (e.g., form changes, grid edits)
onFormChange() {
  this.becameDirty.emit();
  // Also notify GoldenLayoutService to convert preview → permanent
}
```

**GoldenLayoutService listens:**
```typescript
private subscribeToComponentEvents(component: any) {
  if (component.becameDirty) {
    component.becameDirty.subscribe(() => {
      this.convertPreviewToPermanent(currentTabId);
    });
  }
}
```

### 1.7 Workspace Integration

**Goal:** Save/restore Golden Layout state to Workspace Items

**WorkspaceItem.Configuration JSON structure:**
```typescript
interface WorkspaceItemConfig {
  // Golden Layout serialized state
  layoutState?: {
    type: 'component' | 'row' | 'column' | 'stack';
    content: any[];  // Golden Layout's own format
    width?: number;
    height?: number;
  };

  // Tab-specific data
  isPreview: boolean;
  resourceType: string;
  resourceRecordId: string;
  queryParams?: Record<string, any>;
  gridState?: any;
  scrollPosition?: number;

  // App-specific (for Phase 4)
  appMode?: 'dashboard' | 'explorer';
  selectedDashboardTab?: string;
}
```

**Save logic:**
```typescript
async saveWorkspace(): Promise<void> {
  const layoutConfig = this.layout.saveLayout();
  const md = new Metadata();

  // Get current workspace
  const workspace = this.currentWorkspace;

  // Delete existing workspace items
  const rv = new RunView();
  const existingItems = await rv.RunView<WorkspaceItemEntity>({
    EntityName: 'Workspace Items',
    ExtraFilter: `WorkspaceID='${workspace.ID}'`,
    ResultType: 'entity_object'
  });

  for (const item of existingItems.Results || []) {
    await item.Delete();
  }

  // Create new workspace items from current tabs
  let sequence = 1;
  for (const [tabId, tabState] of this.tabs.entries()) {
    const item = await md.GetEntityObject<WorkspaceItemEntity>(
      'Workspace Items'
    );

    item.WorkspaceID = workspace.ID;
    item.Name = tabState.title;
    item.ResourceTypeID = tabState.resourceType;
    item.ResourceRecordID = tabState.resourceRecordId;
    item.Sequence = sequence++;
    item.Configuration = JSON.stringify({
      isPreview: tabState.isPreview,
      layoutState: this.getTabLayoutState(tabId),
      ...tabState.configuration
    });

    await item.Save();
  }
}
```

**Load logic:**
```typescript
async loadWorkspace(workspaceId: string): Promise<void> {
  const md = new Metadata();
  const rv = new RunView();

  // Load workspace
  this.currentWorkspace = await md.GetEntityObject<WorkspaceEntity>(
    'Workspaces'
  );
  await this.currentWorkspace.Load(workspaceId);

  // Load workspace items
  const items = await rv.RunView<WorkspaceItemEntity>({
    EntityName: 'Workspace Items',
    ExtraFilter: `WorkspaceID='${workspaceId}'`,
    OrderBy: 'Sequence ASC',
    ResultType: 'entity_object'
  });

  // Restore tabs
  for (const item of items.Results || []) {
    const config = JSON.parse(item.Configuration || '{}');

    const tabData: ResourceData = {
      ResourceTypeID: item.ResourceTypeID,
      ResourceRecordID: item.ResourceRecordID,
      Configuration: config
    };

    this.addTab(tabData, config.isPreview || false);
  }

  // If no layout state in configs (legacy), default to horizontal row
  // This handles migration from old workspace items
}
```

### 1.8 Testing Phase 1

**Test Cases:**
1. ✅ Golden Layout renders with empty state
2. ✅ Click resource → Preview tab opens (italic title)
3. ✅ Click another resource → Preview tab content replaced
4. ✅ Double-click resource → Permanent tab opens (normal title)
5. ✅ Edit in preview tab → Converts to permanent automatically
6. ✅ Close tab → Tab removed, no errors
7. ✅ Right-click tab → Context menu (Close, Close Others, etc.)
8. ✅ Drag tab → Reorder works
9. ✅ Split horizontal → Creates split layout
10. ✅ Split vertical → Creates split layout
11. ✅ Save workspace → Layout saved to database
12. ✅ Reload app → Workspace restored correctly
13. ✅ Legacy workspace items → Migrated to horizontal layout

**Success Criteria:**
- All existing resource types render correctly in Golden Layout
- Preview/permanent tab behavior works as expected
- Workspace persistence functional
- No performance degradation
- Legacy workspaces migrate seamlessly

---

## Phase 2: Custom Left Navigation

### 2.1 Remove Kendo Drawer Dependency

**Goal:** Replace Kendo Drawer with custom component

**Benefits:**
- Full control over styling
- Better mobile responsiveness
- Simpler, cleaner code
- No Kendo licensing for drawer

### 2.2 Create LeftNavComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/left-nav/left-nav.component.ts`

**Template:**
```html
<nav class="left-nav" [class.collapsed]="isCollapsed" [class.mobile-open]="isMobileOpen">
  <!-- Header Section -->
  <div class="nav-header">
    <button class="collapse-toggle" (click)="toggleCollapse()" *ngIf="!isMobile">
      <i class="fa-solid" [class.fa-angles-left]="!isCollapsed" [class.fa-angles-right]="isCollapsed"></i>
    </button>
  </div>

  <!-- Navigation Items -->
  <div class="nav-items" @navAnimation>
    <div
      *ngFor="let item of navigationItems"
      class="nav-item"
      [class.active]="item.isActive"
      [class.expanded]="item.isExpanded"
      (click)="onItemClick(item)"
      [attr.title]="isCollapsed ? item.name : null"
    >
      <i class="nav-icon" [ngClass]="item.iconCSSClass"></i>
      <span class="nav-label" *ngIf="!isCollapsed">{{ item.name }}</span>

      <!-- Expansion indicator for items with children -->
      <i
        class="expand-icon fa-solid fa-chevron-down"
        *ngIf="item.children?.length && !isCollapsed"
        [class.expanded]="item.isExpanded"
      ></i>
    </div>

    <!-- Child items (if expanded) -->
    <div
      *ngFor="let child of getExpandedChildren()"
      class="nav-item child"
      [class.active]="child.isActive"
      (click)="onItemClick(child)"
      @slideDown
    >
      <i class="nav-icon" [ngClass]="child.iconCSSClass"></i>
      <span class="nav-label">{{ child.name }}</span>
    </div>
  </div>

  <!-- Bottom Section (User settings, etc.) -->
  <div class="nav-footer">
    <!-- Could add user-specific items here -->
  </div>
</nav>

<!-- Mobile backdrop -->
<div class="mobile-backdrop" *ngIf="isMobile && isMobileOpen" (click)="closeMobileNav()"></div>
```

**Component Logic:**
```typescript
@Component({
  selector: 'mj-left-nav',
  templateUrl: './left-nav.component.html',
  styleUrls: ['./left-nav.component.scss'],
  animations: [
    trigger('navAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('slideDown', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('150ms ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ height: 0, opacity: 0 }))
      ])
    ])
  ]
})
export class LeftNavComponent implements OnInit {
  navigationItems: NavigationItem[] = [];
  isCollapsed = false;
  isMobile = false;
  isMobileOpen = false;

  @Output() itemSelected = new EventEmitter<NavigationItem>();

  constructor(
    private router: Router,
    private breakpointObserver: BreakpointObserver
  ) {}

  ngOnInit() {
    this.loadNavigationItems();
    this.setupResponsive();
  }

  async loadNavigationItems() {
    // Load from Explorer Navigation Items

    //--- DO NOT USE CODE BELOW - instead get this from the core metadata that we load up upon boot that
    // is already there in ExplorerNavigationItems

    // const rv = new RunView();
    // const result = await rv.RunView<ExplorerNavigationItemEntity>({
    //   EntityName: 'Explorer Navigation Items',
    //   ExtraFilter: 'IsActive=1 AND ShowInNavigationDrawer=1',
    //   OrderBy: 'Sequence ASC',
    //   ResultType: 'entity_object'
    // });

    // Transform to UI model
    this.navigationItems = (result.Results || []).map(item => ({
      id: item.ID,
      name: item.Name,
      route: item.Route,
      iconCSSClass: item.IconCSSClass,
      description: item.Description,
      isActive: false,
      isExpanded: false,
      children: [] // Could support hierarchical nav in future
    }));
  }

  setupResponsive() {
    this.breakpointObserver
      .observe(['(max-width: 768px)'])
      .subscribe(result => {
        this.isMobile = result.matches;
        if (this.isMobile) {
          this.isCollapsed = true; // Always collapsed on mobile
        }
      });
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem('mj-nav-collapsed', this.isCollapsed.toString());
  }

  onItemClick(item: NavigationItem) {
    // Handle expansion if item has children
    if (item.children?.length) {
      item.isExpanded = !item.isExpanded;
      return;
    }

    // Set active state
    this.navigationItems.forEach(i => i.isActive = false);
    item.isActive = true;

    // Emit event
    this.itemSelected.emit(item);

    // Navigate (opens in tab via Golden Layout)
    this.router.navigate([item.route]);

    // Close mobile nav
    if (this.isMobile) {
      this.isMobileOpen = false;
    }
  }

  getExpandedChildren(): NavigationItem[] {
    return this.navigationItems
      .filter(item => item.isExpanded)
      .flatMap(item => item.children || []);
  }

  closeMobileNav() {
    this.isMobileOpen = false;
  }
}

interface NavigationItem {
  id: string;
  name: string;
  route: string;
  iconCSSClass: string | null;
  description: string | null;
  isActive: boolean;
  isExpanded: boolean;
  children?: NavigationItem[];
}
```

**Styling:**
```scss
.left-nav {
  width: 240px;
  height: 100%;
  background-color: var(--gray-50);
  border-right: 1px solid var(--gray-300);
  display: flex;
  flex-direction: column;
  transition: width 200ms ease-out;
  overflow: hidden;

  &.collapsed {
    width: 60px;

    .nav-label, .expand-icon {
      display: none;
    }
  }

  // Mobile styles
  @media (max-width: 768px) {
    position: fixed;
    top: 60px;
    left: -240px;
    z-index: 1000;
    box-shadow: 2px 0 8px rgba(0,0,0,0.1);
    transition: left 200ms ease-out;

    &.mobile-open {
      left: 0;
    }
  }
}

.nav-header {
  padding: 16px;
  border-bottom: 1px solid var(--gray-300);

  .collapse-toggle {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--gray-600);
    font-size: 16px;
    padding: 8px;
    border-radius: 4px;

    &:hover {
      background-color: var(--gray-200);
    }
  }
}

.nav-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 150ms ease;
  color: var(--gray-700);
  position: relative;

  &:hover {
    background-color: var(--gray-100);
  }

  &.active {
    background-color: var(--mj-blue-light);
    color: var(--mj-blue);
    border-left: 3px solid var(--mj-blue);

    .nav-icon {
      color: var(--mj-blue);
    }
  }

  &.child {
    padding-left: 48px;
    font-size: 14px;
  }

  .nav-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
    margin-right: 12px;
    color: var(--gray-600);
  }

  .nav-label {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
  }

  .expand-icon {
    font-size: 12px;
    transition: transform 150ms ease;

    &.expanded {
      transform: rotate(180deg);
    }
  }
}

.nav-footer {
  padding: 16px;
  border-top: 1px solid var(--gray-300);
}

.mobile-backdrop {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
}
```

### 2.3 Update HeaderComponent

**Goal:** Add hamburger button for mobile nav toggle

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/header/header.component.ts`

**Template changes:**
```html
<header class="mj-header">
  <!-- Hamburger for mobile -->
  <button class="hamburger-btn" (click)="toggleMobileNav()" *ngIf="isMobile">
    <i class="fa-solid fa-bars"></i>
  </button>

  <!-- Logo -->
  <div class="logo">
    <img src="assets/mj-logo.svg" alt="MemberJunction">
  </div>

  <!-- Right side: Search, Notifications, Avatar (existing) -->
  <!-- ... -->
</header>
```

**Logic:**
```typescript
@Output() mobileNavToggle = new EventEmitter<void>();

toggleMobileNav() {
  this.mobileNavToggle.emit();
}
```

### 2.4 Update NavigationComponent Integration

**Template:**
```html
<div class="app-layout">
  <mj-header
    (mobileNavToggle)="leftNav.isMobileOpen = !leftNav.isMobileOpen"
  ></mj-header>

  <div class="app-body">
    <mj-left-nav
      #leftNav
      (itemSelected)="onNavItemSelected($event)"
    ></mj-left-nav>

    <div class="app-content">
      <mj-golden-layout-container></mj-golden-layout-container>
    </div>
  </div>
</div>
```

**Styling:**
```scss
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: hidden;
}
```

### 2.5 Testing Phase 2

**Test Cases:**
1. ✅ Left nav renders with items from metadata
2. ✅ Click nav item → Opens in Golden Layout tab
3. ✅ Collapse/expand nav → Width transitions smoothly
4. ✅ Mobile view → Nav becomes overlay
5. ✅ Mobile hamburger → Opens/closes nav
6. ✅ Mobile backdrop click → Closes nav
7. ✅ Active state highlights current item
8. ✅ Icons render correctly (Font Awesome)
9. ✅ Tooltips show in collapsed state
10. ✅ Responsive breakpoint at 768px works

**Success Criteria:**
- Clean, modern navigation appearance
- Smooth animations and transitions
- Perfect mobile responsiveness
- No dependency on Kendo Drawer

---

## Phase 3: Navigation Items & User Preferences

### 3.1 Extend ExplorerNavigationItem Entity

**Goal:** Add Scope and UserID for user-specific navigation

**Database Migration:** `migrations/v2/V202501XXXX__v2.46.x_explorer_nav_user_scope.sql`

```sql
-- Add Scope column (defaults to 'Global')
ALTER TABLE [${flyway:defaultSchema}].ExplorerNavigationItem
ADD Scope NVARCHAR(50) NOT NULL DEFAULT 'Global';

-- Add UserID column (nullable for global items)
ALTER TABLE [${flyway:defaultSchema}].ExplorerNavigationItem
ADD UserID UNIQUEIDENTIFIER NULL;

-- Add foreign key
ALTER TABLE [${flyway:defaultSchema}].ExplorerNavigationItem
ADD CONSTRAINT FK_ExplorerNavigationItem_User
FOREIGN KEY (UserID) REFERENCES [${flyway:defaultSchema}].[User](ID);

-- Add check constraint for Scope values
ALTER TABLE [${flyway:defaultSchema}].ExplorerNavigationItem
ADD CONSTRAINT CK_ExplorerNavigationItem_Scope
CHECK (Scope IN ('Global', 'User'));

-- Add validation: If Scope='User', UserID must be set
ALTER TABLE [${flyway:defaultSchema}].ExplorerNavigationItem
ADD CONSTRAINT CK_ExplorerNavigationItem_UserScope
CHECK (
  (Scope = 'Global' AND UserID IS NULL) OR
  (Scope = 'User' AND UserID IS NOT NULL)
);

-- Update metadata
UPDATE [${flyway:defaultSchema}].EntityField
SET Description = 'Scope of the navigation item: Global (available to all users) or User (specific to a user)'
WHERE EntityID = (SELECT ID FROM [${flyway:defaultSchema}].Entity WHERE Name = 'Explorer Navigation Items')
  AND Name = 'Scope';

UPDATE [${flyway:defaultSchema}].EntityField
SET Description = 'For User-scoped items, the ID of the user this navigation item belongs to'
WHERE EntityID = (SELECT ID FROM [${flyway:defaultSchema}].Entity WHERE Name = 'Explorer Navigation Items')
  AND Name = 'UserID';

-- Create extended property descriptions
EXEC sp_addextendedproperty
  @name = N'MS_Description',
  @value = N'Scope of the navigation item: Global (available to all users) or User (specific to a user)',
  @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
  @level1type = N'TABLE', @level1name = 'ExplorerNavigationItem',
  @level2type = N'COLUMN', @level2name = 'Scope';

EXEC sp_addextendedproperty
  @name = N'MS_Description',
  @value = N'For User-scoped items, the ID of the user this navigation item belongs to',
  @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
  @level1type = N'TABLE', @level1name = 'ExplorerNavigationItem',
  @level2type = N'COLUMN', @level2name = 'UserID';
```

**Run CodeGen** after migration to regenerate `ExplorerNavigationItemEntity` class.

### 3.2 Update Navigation Loading Logic

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/left-nav/left-nav.component.ts`

**Updated loadNavigationItems:**
```typescript
async loadNavigationItems() {
  const currentUser = UserCache.Instance.Users[0]; // Get current user

  // Load navigation items:
  // 1. Global items (Scope='Global')
  // 2. User-specific items (Scope='User' AND UserID=currentUser.ID)
  const rv = new RunView();
  const result = await rv.RunView<ExplorerNavigationItemEntity>({
    EntityName: 'Explorer Navigation Items',
    ExtraFilter: `
      IsActive=1
      AND ShowInNavigationDrawer=1
      AND (
        Scope='Global'
        OR (Scope='User' AND UserID='${currentUser.ID}')
      )
    `,
    OrderBy: 'Sequence ASC',
    ResultType: 'entity_object'
  });

  // Transform to UI model
  this.navigationItems = (result.Results || []).map(item => ({
    id: item.ID,
    name: item.Name,
    route: item.Route,
    iconCSSClass: item.IconCSSClass,
    description: item.Description,
    scope: item.Scope,
    isActive: false,
    isExpanded: false,
    children: []
  }));

  // Merge with User Applications (apps the user has selected)
  await this.loadUserApplications(currentUser.ID);
}

async loadUserApplications(userId: string) {
  // Load user's selected applications
  const rv = new RunView();
  const result = await rv.RunView({
    EntityName: 'User Applications',
    ExtraFilter: `UserID='${userId}'`,
    OrderBy: 'Sequence ASC',
    ResultType: 'entity_object'
  });

  // Add apps to navigation (after Conversations, before system items)
  for (const userApp of result.Results || []) {
    this.navigationItems.splice(1, 0, { // Insert after first item (Conversations)
      id: userApp.ID,
      name: userApp.Application, // App name from view
      route: `/app/${userApp.ApplicationID}`,
      iconCSSClass: 'fa-solid fa-cube', // Default app icon
      description: userApp.ApplicationDescription,
      scope: 'User',
      isActive: false,
      isExpanded: false,
      children: []
    });
  }
}
```

### 3.3 Add User Nav Management UI (Future Enhancement)

**Note:** This is optional for Phase 3, can be added later.

**Concept:** Settings page where users can:
- Reorder navigation items (drag-drop)
- Hide/show global items
- Create custom navigation shortcuts
- Pin favorite items to top

**Implementation:** Could be a dialog or dedicated settings section.

### 3.4 Default Navigation Items

**Seed Data Migration:** `migrations/v2/V202501XXXX__v2.46.x_default_nav_items.sql`

```sql
-- Conversations (Sequence 1)
INSERT INTO [${flyway:defaultSchema}].ExplorerNavigationItem
(Sequence, Name, Route, IsActive, ShowInHomeScreen, ShowInNavigationDrawer, IconCSSClass, Description, Scope, UserID)
VALUES
(1, 'Conversations', '/conversations', 1, 0, 1, 'fa-solid fa-comments', 'Multi-agent AI conversations', 'Global', NULL);

-- Settings (Sequence 999, always at bottom)
INSERT INTO [${flyway:defaultSchema}].ExplorerNavigationItem
(Sequence, Name, Route, IsActive, ShowInHomeScreen, ShowInNavigationDrawer, IconCSSClass, Description, Scope, UserID)
VALUES
(999, 'Settings', '/settings', 1, 0, 1, 'fa-solid fa-gear', 'Application settings', 'Global', NULL);

-- Optional power-user items (can be hidden by default, users opt-in)
INSERT INTO [${flyway:defaultSchema}].ExplorerNavigationItem
(Sequence, Name, Route, IsActive, ShowInHomeScreen, ShowInNavigationDrawer, IconCSSClass, Description, Scope, UserID)
VALUES
(900, 'Reports', '/reports', 1, 0, 0, 'fa-solid fa-chart-bar', 'Browse and run reports', 'Global', NULL),
(901, 'Queries', '/queries', 1, 0, 0, 'fa-solid fa-database', 'Saved queries', 'Global', NULL),
(902, 'Lists', '/lists', 1, 0, 0, 'fa-solid fa-list', 'Manage lists', 'Global', NULL);
```

**Note:** `ShowInNavigationDrawer=0` for Reports/Queries/Lists by default. Power users can create User-scoped items to show them.

### 3.5 Testing Phase 3

**Test Cases:**
1. ✅ Migration adds Scope and UserID columns
2. ✅ CodeGen regenerates entity with new fields
3. ✅ Default nav items seeded correctly
4. ✅ Load nav shows global + user items
5. ✅ User apps appear in nav after Conversations
6. ✅ Different users see different user-scoped items
7. ✅ Check constraint prevents invalid Scope/UserID combos
8. ✅ Sequence ordering works across global + user items

**Success Criteria:**
- Metadata supports user-specific navigation
- Nav loading filters correctly by user
- Apps integrate seamlessly into nav
- Foundation for future customization in place

---

## Phase 4: App Data Explorer Mode

### 4.1 Overview

**Goal:** When user clicks an app in nav, show dashboard(s) by default with toggle to switch to Data Explorer mode

**User Experience:**
1. Click "CRM App" in nav → Opens tab (preview mode)
2. Tab shows `AppDashboardComponent` (loads user's dashboards for that app)
3. Top-right corner has toggle button: "📊 Dashboard" ⇄ "🔧 Data Explorer"
4. Click toggle → Switches to `AppDataExplorerComponent`
5. Mode preference saved in Workspace Item configuration

### 4.2 Create AppDashboardComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/app-dashboard/app-dashboard.component.ts`

**Purpose:** Wrapper that loads app-specific dashboards, delegates to TabbedDashboardComponent

**Template:**
```html
<div class="app-dashboard-container">
  <!-- Mode Toggle -->
  <div class="mode-toggle">
    <button
      class="toggle-btn"
      [class.active]="mode === 'dashboard'"
      (click)="switchMode('dashboard')"
      title="Dashboard View"
    >
      <i class="fa-solid fa-chart-line"></i>
      <span>Dashboard</span>
    </button>
    <button
      class="toggle-btn"
      [class.active]="mode === 'explorer'"
      (click)="switchMode('explorer')"
      title="Data Explorer"
    >
      <i class="fa-solid fa-table"></i>
      <span>Data Explorer</span>
    </button>
  </div>

  <!-- Content Area -->
  <div class="app-content" *ngIf="mode === 'dashboard'">
    <mj-tabbed-dashboard
      [Scope]="'App'"
      [ApplicationID]="applicationId"
      [UserID]="userId"
    ></mj-tabbed-dashboard>
  </div>

  <div class="app-content" *ngIf="mode === 'explorer'">
    <mj-app-data-explorer
      [applicationId]="applicationId"
    ></mj-app-data-explorer>
  </div>
</div>
```

**Component:**
```typescript
@Component({
  selector: 'mj-app-dashboard',
  templateUrl: './app-dashboard.component.html',
  styleUrls: ['./app-dashboard.component.scss']
})
export class AppDashboardComponent implements OnInit {
  @Input() applicationId: string;

  mode: 'dashboard' | 'explorer' = 'dashboard';
  userId: string;

  constructor(
    private goldenLayoutService: GoldenLayoutService
  ) {
    this.userId = UserCache.Instance.Users[0].ID;
  }

  ngOnInit() {
    // Restore mode from workspace configuration
    this.restoreMode();
  }

  switchMode(newMode: 'dashboard' | 'explorer') {
    this.mode = newMode;
    this.saveMode();
  }

  private restoreMode() {
    // Get current tab state from GoldenLayoutService
    const tabState = this.goldenLayoutService.getCurrentTabState();
    if (tabState?.configuration?.appMode) {
      this.mode = tabState.configuration.appMode;
    }
  }

  private saveMode() {
    // Save mode to tab configuration
    this.goldenLayoutService.updateTabConfiguration({
      appMode: this.mode
    });

    // Auto-save workspace
    this.goldenLayoutService.saveWorkspace();
  }
}
```

**Styling:**
```scss
.app-dashboard-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mode-toggle {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background-color: var(--gray-50);
  border-bottom: 1px solid var(--gray-300);

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: white;
    border: 1px solid var(--gray-300);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: var(--gray-700);
    transition: all 150ms ease;

    &:hover {
      background-color: var(--gray-100);
      border-color: var(--gray-400);
    }

    &.active {
      background-color: var(--mj-blue);
      border-color: var(--mj-blue);
      color: white;
    }

    i {
      font-size: 16px;
    }
  }

  // Mobile: Stack vertically, smaller buttons
  @media (max-width: 768px) {
    .toggle-btn span {
      display: none;
    }

    .toggle-btn {
      padding: 8px 12px;
    }
  }
}

.app-content {
  flex: 1;
  overflow: hidden;
}
```

### 4.3 Create AppDataExplorerComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/app-data-explorer/app-data-explorer.component.ts`

**Purpose:** Modern UI for browsing entities, views, creating new views

**Template:**
```html
<div class="app-data-explorer">
  <!-- Search Bar -->
  <div class="explorer-header">
    <div class="search-box">
      <i class="fa-solid fa-search"></i>
      <input
        type="text"
        placeholder="Search entities, views, or data..."
        [(ngModel)]="searchQuery"
        (input)="onSearchChange()"
      >
    </div>
  </div>

  <!-- Favorites Section -->
  <div class="section" *ngIf="favoriteEntities.length > 0">
    <div class="section-header">
      <i class="fa-solid fa-star"></i>
      <h3>Favorites</h3>
    </div>
    <div class="entity-list">
      <div
        *ngFor="let entity of favoriteEntities"
        class="entity-item favorite"
        (click)="openEntity(entity, true)"
        (dblclick)="openEntity(entity, false)"
      >
        <i class="entity-icon" [ngClass]="entity.icon"></i>
        <div class="entity-info">
          <span class="entity-name">{{ entity.name }}</span>
          <span class="entity-view">{{ entity.defaultView }}</span>
        </div>
        <button
          class="view-menu-btn"
          (click)="toggleViewMenu(entity, $event)"
          title="Views"
        >
          <i class="fa-solid fa-chevron-down"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- All Entities Section -->
  <div class="section">
    <div class="section-header">
      <i class="fa-solid fa-folder-open"></i>
      <h3>All Entities</h3>
    </div>
    <div class="entity-list">
      <div
        *ngFor="let entity of filteredEntities"
        class="entity-item"
        (click)="openEntity(entity, true)"
        (dblclick)="openEntity(entity, false)"
      >
        <i class="entity-icon" [ngClass]="entity.icon"></i>
        <div class="entity-info">
          <span class="entity-name">{{ entity.name }}</span>
          <span class="entity-count">{{ entity.recordCount }} records</span>
        </div>
        <button
          class="view-menu-btn"
          (click)="toggleViewMenu(entity, $event)"
          title="Views"
        >
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <button
          class="favorite-btn"
          (click)="toggleFavorite(entity, $event)"
          [class.is-favorite]="entity.isFavorite"
          title="Pin to favorites"
        >
          <i class="fa-solid fa-star"></i>
        </button>
      </div>

      <!-- View Menu (dropdown) -->
      <div
        *ngIf="entity.showViewMenu"
        class="view-menu"
        @slideDown
      >
        <div class="view-menu-header">
          <span>Views</span>
          <button class="close-btn" (click)="entity.showViewMenu = false">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>
        <div
          *ngFor="let view of entity.views"
          class="view-item"
          (click)="openView(entity, view, true)"
          (dblclick)="openView(entity, view, false)"
        >
          <i class="fa-solid fa-eye"></i>
          <span>{{ view.name }}</span>
          <span class="view-type" *ngIf="view.isDefault">(Default)</span>
        </div>
        <div class="view-menu-footer">
          <button class="create-view-btn" (click)="createNewView(entity)">
            <i class="fa-solid fa-plus"></i>
            Create New View
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Manage Section -->
  <div class="section">
    <div class="section-header">
      <i class="fa-solid fa-sliders"></i>
      <h3>Manage</h3>
    </div>
    <div class="manage-actions">
      <button class="action-btn" (click)="manageViews()">
        <i class="fa-solid fa-eye"></i>
        Manage All Views
      </button>
      <button class="action-btn" (click)="manageCategories()">
        <i class="fa-solid fa-folder"></i>
        Manage Categories
      </button>
    </div>
  </div>
</div>
```

**Component Logic:**
```typescript
@Component({
  selector: 'mj-app-data-explorer',
  templateUrl: './app-data-explorer.component.html',
  styleUrls: ['./app-data-explorer.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('200ms ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ height: 0, opacity: 0 }))
      ])
    ])
  ]
})
export class AppDataExplorerComponent implements OnInit {
  @Input() applicationId: string;

  searchQuery = '';
  entities: EntityInfo[] = [];
  filteredEntities: EntityInfo[] = [];
  favoriteEntities: EntityInfo[] = [];

  constructor(
    private goldenLayoutService: GoldenLayoutService
  ) {}

  async ngOnInit() {
    await this.loadEntities();
    await this.loadFavorites();
  }

  async loadEntities() {
    // Load entities for this application
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Application Entities',
      ExtraFilter: `ApplicationID='${this.applicationId}'`,
      OrderBy: 'Sequence ASC',
      ResultType: 'entity_object'
    });

    // Transform to UI model
    this.entities = await Promise.all(
      (result.Results || []).map(async ae => {
        const views = await this.loadViewsForEntity(ae.EntityID);
        const defaultView = views.find(v => v.isDefault) || views[0];

        return {
          id: ae.EntityID,
          name: ae.Entity,
          icon: this.getEntityIcon(ae.Entity),
          recordCount: await this.getRecordCount(ae.Entity),
          defaultView: defaultView?.name || 'All Records',
          views: views,
          isFavorite: false,
          showViewMenu: false
        };
      })
    );

    this.filteredEntities = [...this.entities];
  }

  async loadViewsForEntity(entityId: string): Promise<ViewInfo[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'User Views',
      ExtraFilter: `EntityID='${entityId}'`,
      OrderBy: 'Name ASC',
      ResultType: 'entity_object'
    });

    return (result.Results || []).map(view => ({
      id: view.ID,
      name: view.Name,
      isDefault: view.IsDefault || false
    }));
  }

  async loadFavorites() {
    // Load user's favorite entities for this app
    // Could be stored in user preferences table
    const favoriteIds = this.getUserFavoriteEntityIds();
    this.favoriteEntities = this.entities.filter(e =>
      favoriteIds.includes(e.id)
    );
  }

  onSearchChange() {
    if (!this.searchQuery.trim()) {
      this.filteredEntities = [...this.entities];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredEntities = this.entities.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.views.some(v => v.name.toLowerCase().includes(query))
    );
  }

  openEntity(entity: EntityInfo, isPreview: boolean) {
    // Open entity's default view in tab
    const resourceData: ResourceData = {
      ResourceTypeID: this.getResourceTypeId('View'),
      ResourceRecordID: entity.views[0]?.id || entity.id,
      Configuration: {
        entityId: entity.id,
        entityName: entity.name
      }
    };

    this.goldenLayoutService.addTab(resourceData, isPreview);
  }

  openView(entity: EntityInfo, view: ViewInfo, isPreview: boolean) {
    const resourceData: ResourceData = {
      ResourceTypeID: this.getResourceTypeId('View'),
      ResourceRecordID: view.id,
      Configuration: {
        entityId: entity.id,
        entityName: entity.name,
        viewId: view.id,
        viewName: view.name
      }
    };

    this.goldenLayoutService.addTab(resourceData, isPreview);
    entity.showViewMenu = false;
  }

  toggleViewMenu(entity: EntityInfo, event: Event) {
    event.stopPropagation();
    entity.showViewMenu = !entity.showViewMenu;

    // Close other view menus
    this.entities.forEach(e => {
      if (e !== entity) e.showViewMenu = false;
    });
  }

  toggleFavorite(entity: EntityInfo, event: Event) {
    event.stopPropagation();
    entity.isFavorite = !entity.isFavorite;

    if (entity.isFavorite) {
      this.favoriteEntities.push(entity);
    } else {
      this.favoriteEntities = this.favoriteEntities.filter(e => e !== entity);
    }

    this.saveFavorites();
  }

  createNewView(entity: EntityInfo) {
    // Open view creation dialog/component
    // This could use existing view creation UI
  }

  manageViews() {
    // Open views management interface
  }

  manageCategories() {
    // Open category management interface
  }

  private getEntityIcon(entityName: string): string {
    // Map entity names to icons (could be from metadata)
    const iconMap: Record<string, string> = {
      'Contacts': 'fa-solid fa-user',
      'Companies': 'fa-solid fa-building',
      'Opportunities': 'fa-solid fa-handshake',
      'Activities': 'fa-solid fa-calendar-check'
    };
    return iconMap[entityName] || 'fa-solid fa-table';
  }

  private async getRecordCount(entityName: string): Promise<number> {
    // Get approximate record count
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: '',
      ResultType: 'count_only'
    });
    return result.TotalRowCount || 0;
  }

  private getUserFavoriteEntityIds(): string[] {
    // Load from user preferences (localStorage or database)
    const key = `mj-favorites-${this.applicationId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  private saveFavorites() {
    const key = `mj-favorites-${this.applicationId}`;
    const favoriteIds = this.favoriteEntities.map(e => e.id);
    localStorage.setItem(key, JSON.stringify(favoriteIds));
  }

  private getResourceTypeId(typeName: string): string {
    // Get resource type ID from metadata
    // This would come from Resource Types entity
    return typeName; // Placeholder
  }
}

interface EntityInfo {
  id: string;
  name: string;
  icon: string;
  recordCount: number;
  defaultView: string;
  views: ViewInfo[];
  isFavorite: boolean;
  showViewMenu: boolean;
}

interface ViewInfo {
  id: string;
  name: string;
  isDefault: boolean;
}
```

**Styling:**
```scss
.app-data-explorer {
  height: 100%;
  overflow-y: auto;
  background-color: var(--gray-50);
  padding: 16px;
}

.explorer-header {
  margin-bottom: 24px;

  .search-box {
    display: flex;
    align-items: center;
    background: white;
    border: 1px solid var(--gray-300);
    border-radius: 8px;
    padding: 12px 16px;

    i {
      color: var(--gray-500);
      margin-right: 12px;
    }

    input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 14px;

      &::placeholder {
        color: var(--gray-400);
      }
    }
  }
}

.section {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);

  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--gray-200);

    i {
      color: var(--mj-blue);
      font-size: 18px;
    }

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--gray-800);
    }
  }
}

.entity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 150ms ease;
  position: relative;

  &:hover {
    background-color: var(--gray-100);
  }

  &.favorite {
    border-left: 3px solid var(--yellow-500);
  }

  .entity-icon {
    font-size: 20px;
    color: var(--gray-600);
    width: 24px;
    text-align: center;
  }

  .entity-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .entity-name {
      font-weight: 500;
      color: var(--gray-800);
      font-size: 14px;
    }

    .entity-view,
    .entity-count {
      font-size: 12px;
      color: var(--gray-500);
    }
  }

  .view-menu-btn,
  .favorite-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--gray-500);
    padding: 6px 8px;
    border-radius: 4px;
    transition: all 150ms ease;

    &:hover {
      background-color: var(--gray-200);
      color: var(--gray-700);
    }
  }

  .favorite-btn.is-favorite {
    color: var(--yellow-500);
  }
}

.view-menu {
  margin-left: 36px;
  margin-top: 8px;
  background-color: var(--gray-50);
  border: 1px solid var(--gray-300);
  border-radius: 6px;
  overflow: hidden;

  .view-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: var(--gray-100);
    border-bottom: 1px solid var(--gray-300);
    font-weight: 600;
    font-size: 12px;
    color: var(--gray-700);
  }

  .view-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;

    &:hover {
      background-color: var(--gray-100);
    }

    i {
      color: var(--gray-500);
      font-size: 12px;
    }

    .view-type {
      margin-left: auto;
      font-size: 11px;
      color: var(--mj-blue);
      font-weight: 500;
    }
  }

  .view-menu-footer {
    border-top: 1px solid var(--gray-300);
    padding: 8px;

    .create-view-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px;
      background: none;
      border: 1px dashed var(--gray-400);
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      color: var(--gray-700);
      transition: all 150ms ease;

      &:hover {
        background-color: var(--gray-100);
        border-color: var(--mj-blue);
        color: var(--mj-blue);
      }
    }
  }
}

.manage-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .action-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: none;
    border: 1px solid var(--gray-300);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: var(--gray-700);
    transition: all 150ms ease;

    &:hover {
      background-color: var(--gray-100);
      border-color: var(--mj-blue);
    }

    i {
      color: var(--gray-600);
    }
  }
}

// Mobile responsiveness
@media (max-width: 768px) {
  .app-data-explorer {
    padding: 12px;
  }

  .section {
    padding: 12px;
  }

  .entity-item {
    padding: 10px;

    .entity-icon {
      font-size: 18px;
    }
  }
}
```

### 4.4 Register App Route

**Location:** `packages/MJExplorer/src/app/app-routing.module.ts`

**Add route:**
```typescript
{
  path: 'app/:appId',
  component: AppDashboardComponent,
  data: { resourceType: 'Application' }
}
```

### 4.5 Update User Applications Navigation

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/left-nav/left-nav.component.ts`

**Update route for app items:**
```typescript
// In loadUserApplications()
this.navigationItems.splice(1, 0, {
  id: userApp.ID,
  name: userApp.Application,
  route: `/app/${userApp.ApplicationID}`, // ← Route to AppDashboardComponent
  iconCSSClass: 'fa-solid fa-cube',
  // ...
});
```

### 4.6 Testing Phase 4

**Test Cases:**
1. ✅ Click app in nav → Opens AppDashboardComponent in tab
2. ✅ Dashboard mode shows TabbedDashboardComponent
3. ✅ Toggle to Explorer mode → Shows AppDataExplorerComponent
4. ✅ Mode preference saved in workspace
5. ✅ Reload app → Mode restored correctly
6. ✅ Entity list loads for application
7. ✅ View menu dropdown works
8. ✅ Single-click entity → Opens preview tab
9. ✅ Double-click entity → Opens permanent tab
10. ✅ Favorites persist (localStorage)
11. ✅ Search filters entities/views
12. ✅ Mobile view works (smaller toggle buttons)

**Success Criteria:**
- Seamless toggle between dashboard and explorer modes
- Explorer UI is clean, modern, intuitive
- All existing functionality preserved
- Performance is good (no lag on entity list)

---

## Phase 5: Workspace Migration & Polish

### 5.1 Workspace Migration Strategy

**Goal:** Seamlessly migrate existing Workspace Items to new Golden Layout structure

**Challenge:** Old workspace items have:
- No layout geometry (split positions, sizes)
- Simple sequence (left-to-right ordering)

**Solution:** Reconstruct as horizontal row layout

**Migration Logic:**
```typescript
// In GoldenLayoutService.loadWorkspace()
async loadWorkspace(workspaceId: string): Promise<void> {
  const items = await this.loadWorkspaceItems(workspaceId);

  // Check if any items have layoutState (new format)
  const hasNewFormat = items.some(item =>
    item.Configuration && JSON.parse(item.Configuration).layoutState
  );

  if (hasNewFormat) {
    // Use Golden Layout's restore from saved state
    await this.restoreGoldenLayoutState(items);
  } else {
    // Legacy migration: Create horizontal row
    await this.migrateLegacyWorkspace(items);
  }
}

private async migrateLegacyWorkspace(items: WorkspaceItemEntity[]) {
  // Build horizontal row layout from sequence
  const layoutConfig: LayoutConfig = {
    root: {
      type: 'row',
      content: items.map(item => ({
        type: 'component',
        componentType: 'tab',
        componentState: {
          tabId: item.ID,
          title: item.Name,
          resourceType: item.ResourceTypeID,
          resourceRecordId: item.ResourceRecordID,
          isPreview: false, // Legacy tabs are permanent
          configuration: JSON.parse(item.Configuration || '{}')
        }
      }))
    }
  };

  this.layout.loadLayout(layoutConfig);

  // Save updated format
  await this.saveWorkspace();
}
```

**User Impact:**
- Existing users see their tabs in same order (horizontal)
- Can immediately start dragging, splitting, etc.
- Next save will upgrade to new format

### 5.2 Responsive Design - Mobile Optimization

**Breakpoints:**
```scss
// Variables
$mobile: 768px;
$tablet: 1024px;
$desktop: 1200px;

// Mixins
@mixin mobile {
  @media (max-width: $mobile) {
    @content;
  }
}

@mixin tablet {
  @media (min-width: $mobile + 1) and (max-width: $tablet) {
    @content;
  }
}

@mixin desktop {
  @media (min-width: $tablet + 1) {
    @content;
  }
}
```

**Mobile-Specific Behaviors:**

#### Left Navigation
- Becomes fixed overlay (see Phase 2)
- Opens from hamburger button
- Backdrop closes nav
- Swipe gestures (optional enhancement)

#### Golden Layout Tabs
- Tab bar becomes dropdown selector on mobile
- Swipe between tabs (optional)
- No split layouts on mobile (stack only)

**Mobile Tab Selector (Alternative to tab bar):**
```html
<!-- For mobile only -->
<div class="mobile-tab-selector" *ngIf="isMobile">
  <button class="tab-dropdown-btn" (click)="toggleTabDropdown()">
    <span>{{ currentTab.title }}</span>
    <i class="fa-solid fa-chevron-down"></i>
  </button>

  <div class="tab-dropdown" *ngIf="showTabDropdown" @slideDown>
    <div
      *ngFor="let tab of tabs"
      class="tab-option"
      [class.active]="tab === currentTab"
      (click)="selectTab(tab)"
    >
      <span [class.preview]="tab.isPreview">{{ tab.title }}</span>
      <button class="close-tab-btn" (click)="closeTab(tab, $event)">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>
  </div>
</div>
```

#### Touch Interactions
- Increase hit target sizes (minimum 44px)
- Add touch ripple effects (optional)
- Swipe to close tabs (optional)
- Long-press for context menu

### 5.3 Header Simplification

**Goal:** Streamline header to 60px height, cleaner appearance

**Current:** 80px with lots of elements
**New:** 60px, essentials only

**Template:**
```html
<header class="mj-header">
  <!-- Mobile hamburger -->
  <button class="hamburger" (click)="toggleMobileNav()" *ngIf="isMobile">
    <i class="fa-solid fa-bars"></i>
  </button>

  <!-- Logo -->
  <div class="logo">
    <img src="assets/mj-logo.svg" alt="MJ" height="32">
  </div>

  <!-- Search -->
  <button class="icon-btn search-btn" (click)="toggleSearch()">
    <i class="fa-solid fa-search"></i>
  </button>

  <!-- Notifications -->
  <button class="icon-btn notifications-btn" (click)="toggleNotifications()">
    <i class="fa-solid fa-bell"></i>
    <span class="badge" *ngIf="unreadCount > 0">{{ unreadCount }}</span>
  </button>

  <!-- User avatar -->
  <div class="user-menu">
    <button class="avatar-btn" (click)="toggleUserMenu()">
      <img [src]="userAvatar" alt="User">
    </button>

    <!-- Dropdown menu -->
    <div class="dropdown" *ngIf="showUserMenu" @slideDown>
      <div class="dropdown-item" (click)="navigateTo('/settings')">
        <i class="fa-solid fa-gear"></i>
        Settings
      </div>
      <div class="dropdown-item" (click)="logout()">
        <i class="fa-solid fa-sign-out"></i>
        Logout
      </div>
    </div>
  </div>
</header>
```

**Styling:**
```scss
.mj-header {
  height: 60px;
  background-color: white;
  border-bottom: 1px solid var(--gray-300);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);

  .logo {
    margin-right: auto;
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gray-600);
    font-size: 18px;
    transition: background-color 150ms ease;
    position: relative;

    &:hover {
      background-color: var(--gray-100);
    }

    .badge {
      position: absolute;
      top: 6px;
      right: 6px;
      background-color: var(--red-500);
      color: white;
      border-radius: 10px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      min-width: 18px;
      text-align: center;
    }
  }

  .avatar-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--gray-300);
    background: none;
    cursor: pointer;
    padding: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .user-menu {
    position: relative;

    .dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: white;
      border: 1px solid var(--gray-300);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      min-width: 180px;
      overflow: hidden;
      z-index: 1000;

      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        cursor: pointer;
        transition: background-color 150ms ease;

        &:hover {
          background-color: var(--gray-100);
        }

        i {
          color: var(--gray-600);
          width: 16px;
        }
      }
    }
  }
}
```

### 5.4 Performance Optimization

**Lazy Loading Components:**
```typescript
// In app-routing.module.ts
const routes: Routes = [
  {
    path: 'conversations',
    loadChildren: () => import('@memberjunction/ng-conversations')
      .then(m => m.ConversationsModule)
  },
  {
    path: 'app/:appId',
    loadChildren: () => import('./app-dashboard/app-dashboard.module')
      .then(m => m.AppDashboardModule)
  }
  // ... more lazy-loaded routes
];
```

**Virtual Scrolling for Long Lists:**
```typescript
// In AppDataExplorerComponent
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

// Template
<cdk-virtual-scroll-viewport itemSize="50" class="entity-list">
  <div *cdkVirtualFor="let entity of filteredEntities" class="entity-item">
    <!-- ... -->
  </div>
</cdk-virtual-scroll-viewport>
```

**Debounced Search:**
```typescript
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

searchQuery$ = new Subject<string>();

ngOnInit() {
  this.searchQuery$
    .pipe(
      debounceTime(300),
      distinctUntilChanged()
    )
    .subscribe(query => this.performSearch(query));
}

onSearchInput(query: string) {
  this.searchQuery$.next(query);
}
```

### 5.5 Accessibility Improvements

**ARIA Labels:**
```html
<button
  class="hamburger"
  (click)="toggleMobileNav()"
  aria-label="Toggle navigation menu"
  [attr.aria-expanded]="isMobileOpen"
>
  <i class="fa-solid fa-bars"></i>
</button>

<div
  class="nav-item"
  role="button"
  tabindex="0"
  [attr.aria-label]="item.description"
  (click)="onItemClick(item)"
  (keydown.enter)="onItemClick(item)"
  (keydown.space)="onItemClick(item)"
>
  <!-- ... -->
</div>
```

**Keyboard Navigation:**
- Tab through nav items
- Enter/Space to activate
- Arrow keys for tab navigation
- Esc to close dropdowns/menus

**Focus Management:**
```typescript
// Trap focus in mobile nav when open
@HostListener('keydown', ['$event'])
handleKeyboardEvent(event: KeyboardEvent) {
  if (this.isMobileOpen && event.key === 'Escape') {
    this.closeMobileNav();
  }
}
```

### 5.6 Final Polish

**Loading States:**
```html
<!-- Workspace loading skeleton -->
<div class="workspace-loading" *ngIf="isLoadingWorkspace">
  <div class="skeleton-tabs"></div>
  <div class="skeleton-content"></div>
</div>
```

**Empty States:**
```html
<!-- No tabs open -->
<div class="empty-workspace" *ngIf="tabs.length === 0">
  <i class="fa-solid fa-folder-open"></i>
  <h3>No tabs open</h3>
  <p>Select an item from the navigation to get started</p>
</div>
```

**Error Handling:**
```typescript
// In GoldenLayoutService
private handleError(error: Error, context: string) {
  console.error(`Error in ${context}:`, error);

  // Show user-friendly toast notification
  this.notificationService.error(
    'Something went wrong',
    'Please try again or contact support if the issue persists'
  );

  // Log to monitoring service (if available)
  this.loggingService?.logError(error, { context });
}
```

**Animations:**
```scss
// Smooth transitions everywhere
* {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

// Fade in animations for dynamic content
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 200ms ease-out;
}
```

### 5.7 Testing Phase 5

**Migration Tests:**
1. ✅ Legacy workspace with 5 tabs migrates to horizontal layout
2. ✅ Empty workspace loads without errors
3. ✅ Workspace with invalid data handled gracefully
4. ✅ After migration, subsequent saves use new format

**Responsive Tests:**
1. ✅ Mobile (< 768px): Nav overlay, tab dropdown, touch targets
2. ✅ Tablet (768-1024px): Collapsible nav, normal tabs
3. ✅ Desktop (> 1024px): Full layout with all features
4. ✅ Rotate device: Layout adapts correctly
5. ✅ Resize browser: Breakpoints trigger properly

**Performance Tests:**
1. ✅ Initial load < 2 seconds (typical network)
2. ✅ Tab switching < 100ms
3. ✅ Search results update < 300ms
4. ✅ Workspace save < 500ms
5. ✅ 50+ entities in explorer: No lag

**Accessibility Tests:**
1. ✅ Screen reader announces navigation items
2. ✅ Keyboard navigation works throughout
3. ✅ Focus visible on all interactive elements
4. ✅ Color contrast ratios meet WCAG AA
5. ✅ No keyboard traps

**Browser Compatibility:**
1. ✅ Chrome (latest)
2. ✅ Firefox (latest)
3. ✅ Safari (latest)
4. ✅ Edge (latest)

**Success Criteria:**
- All existing workspaces migrate successfully
- Mobile experience is excellent
- Performance meets targets
- Accessibility standards met
- Zero critical bugs

---

## Testing Strategy

### Unit Tests

**Key Components to Test:**
- `GoldenLayoutService`
  - Tab state management
  - Preview vs permanent logic
  - Workspace serialization/deserialization
- `LeftNavComponent`
  - Navigation item loading
  - User/role filtering
  - Mobile responsiveness
- `AppDataExplorerComponent`
  - Entity loading
  - Search filtering
  - Favorites management

**Example Test:**
```typescript
describe('GoldenLayoutService', () => {
  it('should replace preview tab on second single-click', () => {
    const service = new GoldenLayoutService();

    // First click creates preview tab
    service.addTab(resourceData1, true);
    expect(service.getPreviewTab()).toBeTruthy();
    expect(service.getTabs().length).toBe(1);

    // Second click replaces preview tab
    service.addTab(resourceData2, true);
    expect(service.getTabs().length).toBe(1);
    expect(service.getCurrentTab().resourceRecordId).toBe(resourceData2.ResourceRecordID);
  });

  it('should convert preview to permanent when dirty', () => {
    const service = new GoldenLayoutService();
    service.addTab(resourceData, true);

    const tab = service.getCurrentTab();
    expect(tab.isPreview).toBe(true);

    service.convertPreviewToPermanent(tab.id);
    expect(tab.isPreview).toBe(false);
    expect(service.getPreviewTab()).toBeNull();
  });
});
```

### Integration Tests

**Scenarios:**
1. User login → Workspace loads → Tabs restored
2. Click nav item → Tab opens → Component renders
3. Edit in preview tab → Becomes permanent → Save works
4. Close all tabs → Empty state shows
5. Split layout → Save workspace → Reload → Layout restored

### E2E Tests (Playwright/Cypress)

**Critical Paths:**
```typescript
test('user can navigate and create permanent tab', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.left-nav');

  // Click Conversations in nav
  await page.click('text=Conversations');

  // Verify preview tab (italic title)
  const tabTitle = await page.locator('.lm_tab.lm_active .lm_title');
  await expect(tabTitle).toHaveCSS('font-style', 'italic');

  // Double-click to make permanent
  await tabTitle.dblclick();
  await expect(tabTitle).not.toHaveCSS('font-style', 'italic');

  // Verify workspace saved
  await page.reload();
  await expect(page.locator('text=Conversations')).toBeVisible();
});
```

---

## Migration Guide for Developers

### Updating Existing Components

**If your component is a resource wrapper:**
```typescript
// Add dirty state emission
@Output() becameDirty = new EventEmitter<void>();

onFormChange() {
  this.becameDirty.emit(); // Notify tab system
}
```

**If you route to resources:**
```typescript
// OLD: Navigate to route
this.router.navigate(['/resource', resourceType, resourceId]);

// NEW: Use MJGlobal event (works with Golden Layout)
MJGlobal.Instance.RaiseEvent<ResourceData>({
  event: ResourceData.EventName,
  eventType: 'custom',
  data: {
    ResourceTypeID: resourceType,
    ResourceRecordID: resourceId
  },
  args: {},
  eventCode: 'ResourceData'
});
```

### Removing Kendo Drawer References

**Search for:**
- `kendo-drawer`
- `kendo-drawer-container`
- `kendo-drawer-content`
- `KendoDrawerComponent`

**Replace with:**
- `mj-left-nav`
- Standard `<div>` containers
- `LeftNavComponent`

### Updating Styles

**Old classes:**
```scss
.k-drawer { } // Kendo drawer
.k-drawer-container { }
```

**New classes:**
```scss
.left-nav { } // Custom nav
.app-layout { }
.app-body { }
```

---

## Rollback Plan

### Feature Flags

**Implementation:**
```typescript
// In environment.ts
export const environment = {
  production: false,
  features: {
    useGoldenLayout: true,
    useCustomNav: true,
    useAppExplorer: true
  }
};

// In NavigationComponent
ngOnInit() {
  if (environment.features.useGoldenLayout) {
    this.initializeGoldenLayout();
  } else {
    this.initializeKendoTabs(); // Fallback
  }
}
```

### Data Compatibility

**Workspace Items remain backward compatible:**
- Old format: Simple sequence-based tabs
- New format: Golden Layout state + metadata
- Both can coexist in database
- System auto-detects and migrates on load

**If rollback needed:**
1. Set feature flags to `false`
2. Redeploy previous version
3. Workspace items still work (sequence-based)
4. No data loss

---

## Documentation Updates

### User Documentation

**Topics to cover:**
1. **New Navigation** - How to use left nav, find features
2. **Tab Management** - Preview vs permanent tabs, splitting, drag-drop
3. **Workspace Persistence** - How tabs are saved and restored
4. **App Explorer Mode** - Switching between dashboard and data views
5. **Mobile Usage** - How navigation works on mobile devices

**Location:** Create new docs in `docs/user-guide/explorer-ux.md`

### Developer Documentation

**Topics to cover:**
1. **Golden Layout Integration** - How to work with the tab system
2. **Creating Navigation Items** - Using metadata to add nav items
3. **Resource Components** - Building components that work in tabs
4. **Workspace State** - Saving custom state in configuration
5. **Mobile Responsiveness** - Patterns and breakpoints

**Location:** Create new docs in `docs/developer-guide/explorer-architecture.md`

---

## Timeline Estimates

### Phase 1: Golden Layout Integration
**Effort:** 5-7 days
- Service setup: 1 day
- Container component: 1 day
- Navigation integration: 1 day
- Workspace persistence: 2 days
- Testing & fixes: 1-2 days

### Phase 2: Custom Left Navigation
**Effort:** 3-4 days
- Component development: 2 days
- Header updates: 1 day
- Testing & polish: 1 day

### Phase 3: Navigation Items & User Preferences
**Effort:** 2-3 days
- Schema changes & migration: 1 day
- Loading logic updates: 1 day
- Testing: 1 day

### Phase 4: App Data Explorer Mode
**Effort:** 4-5 days
- AppDashboardComponent: 1 day
- AppDataExplorerComponent: 2-3 days
- Integration & routing: 1 day
- Testing: 1 day

### Phase 5: Workspace Migration & Polish
**Effort:** 3-4 days
- Migration logic: 1 day
- Responsive design: 1 day
- Accessibility & polish: 1 day
- Final testing: 1 day

**Total Estimated Effort:** 17-23 days (3.5-4.5 weeks)

---

## Success Metrics

### User Experience
- ✅ New users can find Conversations immediately
- ✅ Tab bloat reduced by 60%+ (preview mode)
- ✅ Mobile navigation feels native and smooth
- ✅ Workspace loads in < 2 seconds

### Technical
- ✅ 100% backward compatibility with existing workspaces
- ✅ No Kendo Drawer dependency
- ✅ Golden Layout state serialization works perfectly
- ✅ All resource types render in tabs

### Performance
- ✅ Initial page load: < 3 seconds
- ✅ Tab switching: < 100ms
- ✅ Workspace save: < 500ms
- ✅ Navigation item load: < 200ms

### Code Quality
- ✅ Unit test coverage > 80% for new services
- ✅ E2E tests cover critical paths
- ✅ TypeScript strict mode passes
- ✅ No console errors or warnings

---

## Open Questions / Decisions Needed

1. **Golden Layout License:** Verify licensing (MIT license, should be fine)
2. **Default Navigation Items:** Which items show by default for new users?
3. **App Icons:** Should apps have custom icons in metadata?
4. **Search Enhancement:** Should we build command palette (Cmd+K) in this phase or later?
5. **Tab Close Behavior:** Confirm on close if tab has unsaved changes?
6. **Maximum Tabs:** Should we limit number of open tabs for performance?

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Golden Layout learning curve | Medium | High | Allocate extra time for R&D, build prototype first |
| Browser compatibility issues | High | Low | Test on all browsers early, use polyfills if needed |
| Performance with many tabs | Medium | Medium | Implement tab limits, virtual scrolling, lazy loading |
| User confusion with new UX | High | Medium | Clear documentation, onboarding tour, user feedback |
| Migration data loss | High | Low | Extensive testing, rollback plan, database backups |
| Mobile experience subpar | Medium | Medium | Test on real devices, iterate based on feedback |

---

## Appendix

### A. Golden Layout Resources
- Official Docs: https://golden-layout.github.io/golden-layout/
- GitHub: https://github.com/golden-layout/golden-layout
- Examples: https://golden-layout.github.io/golden-layout/examples/

### B. Font Awesome Icons (Recommended)
- Search: https://fontawesome.com/icons
- Categories: Solid, Regular, Light, Brands
- Usage: `<i class="fa-solid fa-icon-name"></i>`

### C. CSS Variables Reference
```scss
// Colors
--mj-blue: #1976d2;
--mj-blue-light: #e3f2fd;
--navy: #1a237e;
--gray-50: #fafafa;
--gray-100: #f5f5f5;
--gray-200: #eeeeee;
--gray-300: #e0e0e0;
--gray-400: #bdbdbd;
--gray-500: #9e9e9e;
--gray-600: #757575;
--gray-700: #616161;
--gray-800: #424242;
--red-500: #f44336;
--yellow-500: #ffc107;

// Spacing
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

// Shadows
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.15);

// Border radius
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-full: 9999px;
```

### D. Responsive Breakpoint Reference
```scss
// Mobile first approach
$breakpoints: (
  'mobile': 0,
  'tablet': 768px,
  'desktop': 1024px,
  'wide': 1200px
);
```

---

## Conclusion

This redesign represents a significant modernization of MJ Explorer's UX, bringing it in line with contemporary application design patterns while preserving all existing functionality. By implementing Golden Layout, custom navigation, and the innovative app explorer mode, we'll create an experience that is:

- **Intuitive** for new users
- **Powerful** for advanced users
- **Mobile-friendly** for on-the-go access
- **Maintainable** for long-term evolution

The phased approach allows for incremental validation and reduces risk, while the comprehensive testing strategy ensures quality throughout the implementation.
