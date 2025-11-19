# App Switcher & Dynamic Routing

## Quick Answer to Your Question

**Q: "Is the logo how we switch from one app to another as a user?"**

**A: Yes! That's exactly the intent.**

The logo in the top-left corner should be the app switcher. When clicked, it shows a dropdown menu with all available apps.

### Visual Mockup

```
┌────────────────────────────────────────────────────────────┐
│ [MJ] ⬅ Click me!    💬 Conversations | Chat | Collections │
│  ▼                                                 🔍 🔔 👤 │
│ ┌──────────────────┐                                       │
│ │ 💬 Conversations │ ← Currently active                    │
│ │ 💼 CRM           │                                       │
│ │ ⚙️  Settings      │                                       │
│ └──────────────────┘                                       │
│                                                            │
│  [Your content here]                                       │
└────────────────────────────────────────────────────────────┘
```

### Current Prototype Status

✅ Logo has click handler: `(click)="ToggleAppSwitcher()"`
✅ Logo has tooltip: `title="Switch Apps"`
❌ Dropdown not implemented (marked as TODO)

**Code locations**:
- `header.component.html` - Lines 2-18 (logo with TODO comment)
- `header.component.ts` - Lines 55-66 (placeholder methods)

## Dynamic Route Loading

### Why It Matters

Right now routes are **static** (hardcoded in `app.routes.ts`). For production:

1. **3rd Party Apps**: Companies can build custom apps that plug into MJ Explorer
2. **Safe Loading**: Automatically detect and prevent route conflicts
3. **User Control**: User chooses which apps to enable
4. **No Rebuild**: Add/remove apps without recompiling

### The Problem

**Scenario**: You install two apps that both want `/crm`:
- **MJ Core CRM App** → wants `/crm` route
- **Salesforce Integration App** → also wants `/crm` route

**What happens?**
- ❌ **Without dynamic loading**: Second app overwrites first, breaks things
- ✅ **With dynamic loading**: System detects conflict, prevents loading, asks user

### Proposed Solution

#### 1. Apps Define Their Routes

```typescript
// Each app implements IApp
export class CrmApp implements IApp {
  Route = 'crm';  // Top-level route segment

  GetRoutes(): Routes {
    return [{
      path: 'crm',
      children: [
        { path: 'dashboard', component: CrmDashboardComponent },
        { path: 'contacts', component: ContactsComponent },
        // ... more routes
      ]
    }];
  }
}
```

#### 2. Shell Service Manages Registration

```typescript
// ShellService
RegisterApp(app: IApp): { success: boolean; error?: string } {
  // Check for conflicts
  if (this.routeRegistry.has(app.Route)) {
    console.error(`Route '${app.Route}' already in use!`);
    return {
      success: false,
      error: `Route conflict: '${app.Route}' is taken`
    };
  }

  // Register app
  this.apps.set(app.Id, app);
  this.routeRegistry.add(app.Route);

  // Dynamically add routes to Angular router
  this.router.config.push(...app.GetRoutes());
  this.router.resetConfig(this.router.config);

  return { success: true };
}
```

#### 3. App Discovery on Startup

```typescript
// app.component.ts
ngOnInit(): void {
  // Discover all available apps
  const availableApps = [
    new ConversationsApp(this.router),
    new CrmApp(this.router),
    new SettingsApp(this.router),
    new SalesforceApp(this.router),  // 3rd party!
  ];

  // Get user's enabled apps from preferences
  const enabledAppIds = this.getUserEnabledApps();

  // Register only enabled apps
  for (const app of availableApps) {
    if (enabledAppIds.includes(app.Id)) {
      const result = this.shellService.RegisterApp(app);

      if (!result.success) {
        // Route conflict! Show dialog, log error, etc.
        this.handleAppLoadFailure(app, result.error);
      }
    }
  }
}
```

### Conflict Resolution Options

**Option 1: First Come, First Served**
```
CRM App loads first → Gets /crm route
Salesforce App tries to load → Rejected with error
```

**Option 2: User Choice Dialog**
```
┌─────────────────────────────────────────────┐
│ Route Conflict Detected                     │
├─────────────────────────────────────────────┤
│ Both "CRM" and "Salesforce" want /crm      │
│                                             │
│ Which app should use this route?            │
│                                             │
│  ◉ CRM (MemberJunction Core)               │
│  ○ Salesforce Integration                  │
│                                             │
│        [Cancel]  [Use Selected]             │
└─────────────────────────────────────────────┘
```

**Option 3: Priority-Based**
```typescript
interface IApp {
  Priority: number;  // Core MJ apps = 0, 3rd party = 100+
}

// Lower priority number wins conflicts
```

**Option 4: Auto-Rename**
```
CRM App → /crm
Salesforce App → /salesforce-crm (auto-adjusted)
```

### Benefits

1. **Extensibility**: 3rd parties can add apps
2. **Safety**: Route conflicts detected automatically
3. **User Control**: Enable/disable apps in settings
4. **Performance**: Lazy load apps on demand
5. **Testability**: Load/unload apps in isolation
6. **Modularity**: Apps are self-contained plugins

### Implementation Checklist

**For Production**:
- [ ] Add `GetRoutes(): Routes` to `IApp` interface
- [ ] Implement route conflict detection in `ShellService`
- [ ] Add `GetAllApps(): IApp[]` to `ShellService` (for app switcher)
- [ ] Implement app switcher dropdown in header
- [ ] Create user preferences for enabled apps
- [ ] Add conflict resolution UI (dialog)
- [ ] Implement app discovery mechanism
- [ ] Add app priority system
- [ ] Create app manifest format (JSON)
- [ ] Add route unregistration for app disable

**Estimated Effort**: 2-3 days for full implementation

### Where to Start

1. **Easy Win**: Implement app switcher dropdown first
   - Shows all registered apps
   - Clicking navigates to app's default route
   - Visual indicator of current app

2. **Medium**: Add dynamic route registration
   - Apps provide routes via `GetRoutes()`
   - ShellService dynamically adds to router
   - Conflict detection logs errors

3. **Advanced**: Full conflict resolution
   - User choice dialogs
   - Priority system
   - App enable/disable UI

## Files Modified in Prototype

The prototype includes TODO comments and placeholder code:

1. **header.component.html** (lines 2-18)
   - Logo click handler added
   - Commented-out dropdown markup
   - Tooltip added

2. **header.component.ts** (lines 21, 55-66)
   - `showAppSwitcher` property
   - `ToggleAppSwitcher()` method (placeholder)
   - `GetAllApps()` method (placeholder)

3. **app.routes.ts** (lines 15-34)
   - Big comment block explaining dynamic routes
   - References FUTURE-ENHANCEMENTS.md

4. **FUTURE-ENHANCEMENTS.md** (new file)
   - Comprehensive implementation guide
   - Code examples
   - UI mockups
   - Conflict resolution strategies

## Try It Yourself

```bash
cd plans/mj-explorer-new-ux/explorer-prototype
npm start
```

Click the logo - you'll see it's clickable (has hover effect and tooltip) but doesn't show a dropdown yet. That's your starting point for implementing the app switcher!

## Summary

✅ **Concept validated**: Logo as app switcher makes sense
✅ **Architecture ready**: IApp interface supports this
✅ **TODOs documented**: Clear path to implementation
✅ **Safety planned**: Route conflict detection designed
✅ **User control**: Enable/disable apps in preferences

The prototype demonstrates the shell/plugin pattern. Production implementation just needs:
1. App switcher UI (easy)
2. Dynamic route loading (medium)
3. Conflict resolution (advanced)

All documented in `FUTURE-ENHANCEMENTS.md`!
