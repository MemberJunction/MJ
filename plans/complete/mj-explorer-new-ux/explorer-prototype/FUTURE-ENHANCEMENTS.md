# Future Enhancements - Not Implemented in Prototype

## 1. App Switcher (Logo Click)

**Current**: Logo is clickable with tooltip "Switch Apps" but doesn't do anything yet

**Future Implementation**:
```typescript
// In header.component.ts
ToggleAppSwitcher(): void {
  this.showAppSwitcher = !this.showAppSwitcher;
}

GetAllApps(): IApp[] {
  return this.shellService.GetAllApps();
}
```

**UI Mockup**:
```
┌────────────────────────────────────────┐
│ [MJ] ← Click here                     │
│  ▼                                     │
│  ┌────────────────────┐                │
│  │ 💬 Conversations   │ ← Active       │
│  │ 💼 CRM             │                │
│  │ ⚙️  Settings        │                │
│  │ 📊 Analytics       │                │
│  └────────────────────┘                │
└────────────────────────────────────────┘
```

**Benefits**:
- Quick app switching without navigation
- Shows all available apps to user
- Visual indicator of current app

---

## 2. Dynamic Route Loading (IMPORTANT!)

**Current State**: Routes are statically defined in `app.routes.ts`

```typescript
// CURRENT - Static (Prototype)
export const routes: Routes = [
  { path: 'conversations', children: [...] },
  { path: 'crm', children: [...] },
  { path: 'settings', component: SettingsComponent, children: [...] }
];
```

**Future State**: Apps dynamically register their routes

### Why Dynamic Routes?

1. **3rd Party Extensibility**: Apps can be loaded as plugins
2. **Conflict Detection**: Prevent route collisions
3. **User Control**: User chooses which apps to enable
4. **Hot Loading**: Add/remove apps without rebuild

### Proposed Implementation

#### Step 1: Extend IApp Interface

```typescript
interface IApp {
  Id: string;
  Name: string;
  Icon: string;
  Route: string;  // Top-level route segment (e.g., 'crm', 'conversations')

  // NEW: App provides its own routes
  GetRoutes(): Routes;

  // Existing methods...
  GetNavigationType(): 'list' | 'breadcrumb';
  GetNavItems(): NavItem[];
  GetBreadcrumbs(): Breadcrumb[];
}
```

#### Step 2: Apps Define Their Routes

```typescript
// crm.app.ts
export class CrmApp implements IApp {
  Id = 'crm';
  Name = 'CRM';
  Route = 'crm';  // Top-level segment

  GetRoutes(): Routes {
    return [
      {
        path: this.Route,  // 'crm'
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          { path: 'dashboard', component: CrmDashboardComponent },
          { path: 'contacts', component: ContactsComponent },
          { path: 'contact/:id', component: ContactDetailComponent },
          { path: 'companies', component: CompaniesComponent },
          { path: 'opportunities', component: OpportunitiesComponent }
        ]
      }
    ];
  }
}
```

#### Step 3: ShellService Manages Route Registration

```typescript
@Injectable({ providedIn: 'root' })
export class ShellService {
  private apps = new Map<string, IApp>();
  private routeRegistry = new Set<string>(); // Track used route segments

  RegisterApp(app: IApp): { success: boolean; error?: string } {
    // Check for route conflicts
    if (this.routeRegistry.has(app.Route)) {
      console.error(`Route conflict: '${app.Route}' already registered by another app`);
      return {
        success: false,
        error: `Route '${app.Route}' is already in use`
      };
    }

    // Register app
    this.apps.set(app.Id, app);
    this.routeRegistry.add(app.Route);

    // Dynamically add routes
    this.router.config.push(...app.GetRoutes());
    this.router.resetConfig(this.router.config);

    return { success: true };
  }

  GetAllApps(): IApp[] {
    return Array.from(this.apps.values());
  }

  UnregisterApp(appId: string): void {
    const app = this.apps.get(appId);
    if (app) {
      this.routeRegistry.delete(app.Route);
      this.apps.delete(appId);

      // Remove routes (more complex - requires filtering router.config)
      // ... implementation details
    }
  }
}
```

#### Step 4: App Discovery & Loading

```typescript
// app.component.ts - Production version
export class AppComponent implements OnInit {
  ngOnInit(): void {
    // Discover available apps (from metadata, config, or modules)
    const availableApps = this.discoverApps();

    // Load user's enabled apps
    const enabledAppIds = this.getUserEnabledApps();

    // Register only enabled apps
    for (const app of availableApps) {
      if (enabledAppIds.includes(app.Id)) {
        const result = this.shellService.RegisterApp(app);

        if (!result.success) {
          console.error(`Failed to load ${app.Name}: ${result.error}`);
          // Notify user, log to error service, etc.
        }
      }
    }
  }

  private discoverApps(): IApp[] {
    // Option 1: Import from known locations
    // Option 2: Load from configuration
    // Option 3: Scan for modules implementing IApp
    // Option 4: Query metadata service

    return [
      new ConversationsApp(this.router),
      new CrmApp(this.router),
      new SettingsApp(this.router),
      // ... more apps discovered dynamically
    ];
  }

  private getUserEnabledApps(): string[] {
    // Load from user preferences
    // Could be stored in localStorage, database, etc.
    // User can enable/disable apps in settings

    return this.userPreferences.Load('enabledApps') || [
      'conversations',
      'crm',
      'settings'
    ];
  }
}
```

### Conflict Resolution Strategy

When two apps try to use the same route segment:

**Option 1: First Come, First Served**
```typescript
RegisterApp(app: IApp): { success: boolean; error?: string } {
  if (this.routeRegistry.has(app.Route)) {
    return {
      success: false,
      error: `Route '${app.Route}' already in use`
    };
  }
  // ... register app
}
```

**Option 2: Priority-Based**
```typescript
interface IApp {
  Priority: number;  // Lower number = higher priority
  // ...
}

// Core MJ apps have Priority: 0
// 3rd party apps have Priority: 100+
```

**Option 3: User Choice Dialog**
```
┌─────────────────────────────────────────────┐
│ Route Conflict Detected                     │
├─────────────────────────────────────────────┤
│ Both "CRM App" and "Sales Suite" want to   │
│ use the route "/crm".                       │
│                                             │
│ Which app would you like to enable?         │
│                                             │
│  ○ CRM App (Core - MemberJunction)         │
│  ○ Sales Suite (3rd Party - Acme Corp)     │
│                                             │
│           [Cancel]  [Choose Selected]       │
└─────────────────────────────────────────────┘
```

### App Metadata for Discovery

```typescript
// app.manifest.json (shipped with each app)
{
  "id": "crm",
  "name": "CRM",
  "version": "1.0.0",
  "author": "MemberJunction",
  "description": "Customer Relationship Management",
  "route": "crm",
  "icon": "fa-solid fa-briefcase",
  "priority": 10,
  "entryPoint": "./crm.app.ts",
  "dependencies": [
    "@memberjunction/core",
    "@memberjunction/ng-base-forms"
  ],
  "permissions": [
    "contacts.read",
    "contacts.write",
    "companies.read"
  ]
}
```

### Benefits of Dynamic Loading

1. **Modularity**: Each app is self-contained
2. **Extensibility**: 3rd parties can add apps without modifying core
3. **Safety**: Route conflicts detected and prevented
4. **User Control**: Users enable only apps they need
5. **Performance**: Lazy load apps on-demand
6. **Testability**: Load/unload apps in isolation

### Implementation Notes

**Where to Put This**:
- `ShellService.RegisterApp()` - Route conflict detection
- `ShellService.GetAllApps()` - For app switcher dropdown
- `app.component.ts` - App discovery and initialization
- Each `*.app.ts` file - Add `GetRoutes()` method

**Testing Strategy**:
```typescript
describe('Route Conflict Detection', () => {
  it('should prevent duplicate route registration', () => {
    const app1 = new CrmApp();
    const app2 = new SalesApp(); // Also wants '/crm'

    service.RegisterApp(app1);
    const result = service.RegisterApp(app2);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already in use');
  });
});
```

---

## 3. Golden Layout Integration

**Status**: Installed but not wired up

**What's Missing**:
- Drag-drop tab reordering
- Split panes (horizontal/vertical)
- Pop-out windows
- Maximize/minimize panes
- Custom tab layouts

**Implementation Complexity**: Medium (2-3 days)

See original plan document for Golden Layout implementation details.

---

## 4. Other Enhancements

### Tab Context Menu
Right-click tab for options:
- Close
- Close Others
- Close to Right
- Close All
- Pin Tab (prevent accidental close)

### Keyboard Shortcuts
- `Cmd/Ctrl + W` - Close active tab
- `Cmd/Ctrl + T` - New tab
- `Cmd/Ctrl + Tab` - Next tab
- `Cmd/Ctrl + Shift + Tab` - Previous tab
- `Cmd/Ctrl + 1-9` - Jump to tab 1-9

### Tab Limits
Warn user when they have too many tabs open (performance)

### Mobile Responsive
- Tab bar becomes dropdown on mobile
- Touch gestures for tab switching
- Swipe to close tabs

### App-to-App Communication
```typescript
// From Conversations app
this.shellService.OpenResource('Contact', contactId);

// Shell finds CRM app and delegates
const crmApp = this.apps.get('crm');
crmApp.HandleResourceRequest('Contact', contactId);

// CRM opens contact detail in new tab
```

---

## Summary

The prototype demonstrates core concepts with static routes. For production:

1. **App Switcher**: Logo click shows all apps
2. **Dynamic Routes**: Apps register routes safely
3. **Conflict Detection**: Prevent duplicate routes
4. **User Control**: Enable/disable apps
5. **3rd Party Safe**: Plugin architecture

All of this is achievable with the current architecture - the `IApp` interface and `ShellService` are designed to support it!
