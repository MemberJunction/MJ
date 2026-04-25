# Loading Dead State — Diagnostic Logging Plan

**Date**: 2026-04-04
**Symptom**: App stuck on loading screen ("Birds are singing...") forever when navigating to a deep URL like `/app/knowledge-hub/Search`
**Goal**: Add targeted `console.log` statements at every critical checkpoint in the startup + routing chain so we can pinpoint exactly where the flow stalls

---

## Root Cause Hypothesis (From Live Repro)

The console output shows workspace initialization **completed successfully** (GraphQL setup, cache validation, user roles). But the loading screen never clears. The flow that clears the loading screen is:

```
ResourceResolver creates tab → Shell processes tab → Tab container loads resource component
→ Resource calls LoadCompleteEvent → shell.onFirstResourceLoadComplete() → loading = false
```

**Likely race condition**: For `/app/knowledge-hub/Search`, the ResourceResolver runs and tries to look up the app via `appManager.CheckAppAccess()` + `md.Applications`. If `ApplicationManager.loadApplications()` hasn't finished yet, the app lookup fails silently (`return` with no tab created). The shell then waits forever for a tab that will never arrive.

The URL `/app/knowledge-hub/Search` hits the **nav item route handler** (line 414 of `app-routing.module.ts`). This path calls `CheckAppAccess(appName)` and then searches `md.Applications` for the app. Both can fail silently if metadata/apps aren't ready.

---

## Logging Locations

All logs use a `[STARTUP]` prefix and include timestamps for correlation.

### 1. Explorer App Component — Login Flow
**File**: `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts`

| Line | What to Log | Why |
|------|------------|-----|
| 80 | `[STARTUP] handleLogin() called, token present: ${!!token}` | Confirm login handler fires |
| 84 | `[STARTUP] Calling initializeWorkspace...` | Mark start of workspace init |
| 90 | `[STARTUP] Workspace init result: success=${result.success}` | Confirm workspace completed |
| 108 | `[STARTUP] IsChatOverlayReady = true` | Confirm overlay gate opens |
| 112-120 | `[STARTUP] Initial path: "${this.initialPath}", navigating...` | Show which route is being navigated to |
| 120 | `[STARTUP] router.navigateByUrl("${this.initialPath}")` | Confirm navigation was triggered |
| 142-146 | `[STARTUP] handleLogin() CAUGHT ERROR: ${err}` | Show if login errors are swallowed |

### 2. ResourceResolver — Route Resolution
**File**: `packages/Angular/Explorer/explorer-core/src/app-routing.module.ts`

| Line | What to Log | Why |
|------|------------|-----|
| 148 | `[STARTUP:Resolver] waitForLogin() waiting for LoggedIn event...` | Mark resolver is waiting |
| 153 | `[STARTUP:Resolver] LoggedIn event received, calling StartupManager.Startup()...` | Show LoggedIn was caught |
| 155 | `[STARTUP:Resolver] StartupManager.Startup() complete` | Confirm startup finished |
| 158-162 | `[STARTUP:Resolver] resolve() called for URL: ${state.url}, waiting for login: ${!!this.loggedInPromise}` | Show every resolve call |
| 170 | `[STARTUP:Resolver] Debounced duplicate URL: ${state.url}` | Show if debounce is eating the resolve |
| 177 | `[STARTUP:Resolver] Resolve SUPPRESSED for URL: ${state.url}` | Show if suppress flag is eating it |
| 200 | `[STARTUP:Resolver] CheckAppAccess("${appName}"): status=${accessResult.status}` | **CRITICAL** — show if app access check fails |
| 207-210 | `[STARTUP:Resolver] GetAppByPath("${appName}"): found=${!!app}` | **CRITICAL** — show if app lookup fails |
| 421 | `[STARTUP:Resolver] Nav route: CheckAppAccess("${appName}"): status=${accessResult.status}` | Nav item route handler access check |
| 431-438 | `[STARTUP:Resolver] Nav route: app lookup in md.Applications: found=${!!app}, total apps=${applications.length}` | **CRITICAL** — show if app is missing from metadata |
| 454-460 | `[STARTUP:Resolver] Nav route: navItem "${navItemName}" lookup: found=${!!navItem}, navItems count=${navItems.length}` | Show if nav item lookup fails |
| 490 | `[STARTUP:Resolver] Nav route: OpenTab() called for "${navItem.Label}" in app "${appName}"` | Confirm tab was actually queued |

### 3. Shell Component — Initialization
**File**: `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`

| Line | What to Log | Why |
|------|------------|-----|
| 184 | `[STARTUP:Shell] ngOnInit: LoggedIn event received` | Confirm shell got login event |
| 186-188 | `[STARTUP:Shell] initialPath="/", calling initializeShell() directly` | Show which branch |
| 191-197 | `[STARTUP:Shell] initialPath="${this.authBase.initialPath}", waiting for NavigationEnd...` | **CRITICAL** — show shell is waiting for NavigationEnd |
| 196 | `[STARTUP:Shell] NavigationEnd received, calling initializeShell()` | Confirm NavigationEnd arrived |
| 203-205 | `[STARTUP:Shell] ngOnInit CAUGHT ERROR: ${error}` | Show if error kills init |
| 211 | `[STARTUP:Shell] initializeShell() START` | Mark start |
| 214 | `[STARTUP:Shell] appManager.Initialize() called` | Show app manager init |
| 216 | `[STARTUP:Shell] StartupManager.Startup() complete` (after the await) | Show startup done |
| 230 | `[STARTUP:Shell] workspaceManager.Initialize() complete` (after the await) | Show workspace done |
| 280 | `[STARTUP:Shell] Apps subscription fired: ${apps.length} apps, isLoading=${isLoading}` | **CRITICAL** — show app loading state |
| 296-303 | `[STARTUP:Shell] URL app match: routeAppPath="${routeAppPath}", urlApp found=${!!urlApp}` | Show if URL app was found |
| 319-322 | `[STARTUP:Shell] App NOT found in user's list: "${routeAppPath}", showing error dialog` | Show when error dialog triggers |
| 334-339 | `[STARTUP:Shell] Tab request received: "${request.Title}"` | Show tab requests arriving |
| 343-348 | `[STARTUP:Shell] Replaying ${queuedRequests.length} queued tab requests` | **CRITICAL** — show queued request replay |
| 387-388 | `[STARTUP:Shell] loadUserAvatar + initializeUserMenu complete` | Show these awaits finished |
| 404 | `[STARTUP:Shell] loadSearchableEntities complete` | Show this await finished |
| 406 | `[STARTUP:Shell] initialized=true, waitingForFirstResource=true` | **CRITICAL** — mark shell ready |
| 1229-1233 | `[STARTUP:Shell] onFirstResourceLoadComplete() — loading=false` | **CRITICAL** — the money line |

### 4. Tab Container — Resource Loading
**File**: `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts`

Need to add logging at:

| What to Log | Why |
|------------|-----|
| When a tab is added to the container | Confirm tab was actually created |
| When the resource component starts loading | Show resource init started |
| When `LoadCompleteEvent` is called | Confirm resource told us it's done |
| When `firstResourceLoadComplete` is emitted | Confirm event was emitted to shell |

### 5. Tab Service — Queue Management
**File**: `packages/Angular/Explorer/base-application/src/lib/tab.service.ts`

| What to Log | Why |
|------------|-----|
| `OpenTab()` called | `[STARTUP:TabService] OpenTab: "${request.Title}", queue size=${this.queuedRequests.length}` |
| `GetQueuedRequests()` called | `[STARTUP:TabService] GetQueuedRequests: returning ${this.queuedRequests.length} requests` |
| `ShouldSuppressResolve()` returns true | `[STARTUP:TabService] SuppressResolve=true, suppressing resolve` |

### 6. Application Manager — App Loading
**File**: `packages/Angular/Explorer/base-application/src/lib/application-manager.ts`

| Line | What to Log | Why |
|------|------------|-----|
| 114-117 | `[STARTUP:AppManager] LoggedIn received, calling loadApplications()` | Show when app loading starts |
| 196 | `[STARTUP:AppManager] loadApplications() START, loading$.next(true)` | Mark start |
| 200 | `[STARTUP:AppManager] md.Applications count: ${appInfoList.length}` | Show metadata app count |
| 248 | `[STARTUP:AppManager] allApplications$.next(${allApps.length} apps)` | Show apps pushed to observable |
| 253 | `[STARTUP:AppManager] initialized=true` | Confirm init complete |
| 259 | `[STARTUP:AppManager] loading$.next(false) — apps ready` | Confirm loading flag cleared |
| 438-450 | `[STARTUP:AppManager] CheckAppAccess("${path}"): appInfo found=${!!appInfo}` | Show if app exists in engine |
| 463-468 | `[STARTUP:AppManager] CheckAppAccess: accessStatus="${accessStatus}", baseApp found=${!!baseApp}` | Show access result + whether BaseApplication instance exists |

---

## Predicted Diagnosis

Based on the console output from the live repro, I predict the logs will show:

1. `handleLogin()` succeeds, calls `router.navigateByUrl("/app/knowledge-hub/Search")`
2. Shell's `ngOnInit` subscribes to LoggedIn (replay catches it), BUT waits for `NavigationEnd`
3. Router triggers `ResourceResolver.resolve()` for the nav item route
4. ResourceResolver's `waitForLogin()` completes (LoggedIn + StartupManager already done)
5. ResourceResolver calls `appManager.CheckAppAccess("knowledge-hub")` — **this is the race**:
   - `ApplicationManager.loadApplications()` is still running (it also subscribes to LoggedIn and calls StartupManager.Startup() independently)
   - `applications$.value` is still empty → `baseApp` is `undefined`
   - But `UserInfoEngine` may find the app in metadata → returns `status: 'accessible'` with no `app` object
6. ResourceResolver looks up `md.Applications.find(...)` → finds the app (metadata is loaded)
7. ResourceResolver calls `tabService.OpenTab()` — tab is **queued**
8. `NavigationEnd` fires → Shell calls `initializeShell()`
9. Shell sets up subscriptions, replays queued tab requests
10. **BUT**: somewhere in the tab processing or resource component loading, it fails to call `onFirstResourceLoadComplete()`

The alternative scenario: step 5 actually fails because `UserInfoEngine` hasn't loaded user-app associations, returning `not_installed`, and the resolver returns silently with no tab created.

---

## Implementation Notes

- All logs use `console.log` with `[STARTUP-DEAD-PATH]` prefix for easy filtering/removal
- Logs are **additive only** — no behavior changes, just visibility
- Logging has been implemented across 6 files

---

## Diagnosis Results (From Live Repro)

### Dead Flow Console (navigating to `/app/knowledge-hub/Search`)

The smoking gun line:
```
CheckAppAccess("knowledge-hub"): appInfo found=true, appManagerInitialized=false, applications$.value.length=0
```

**Confirmed sequence:**
1. AppManager subscribes to LoggedIn, starts `loadApplications()` 
2. BEFORE `loadApplications()` completes, ResourceResolver runs `CheckAppAccess("knowledge-hub")`
3. `appManagerInitialized=false`, `applications$.value.length=0` — apps not loaded yet
4. UserInfoEngine finds the app in metadata → returns `status: 'accessible'` (but `baseApp` is undefined)
5. Resolver finds the app in `md.Applications` (metadata IS loaded) → queues tab via `OpenTab("Search")`
6. `loadApplications()` finishes (17 apps ready)
7. Shell replays queued tab (`GetQueuedRequests: returning 1`)
8. **Tab container processes the tab BUT never fires `LoadCompleteEvent`** → loading screen stays forever

### Working Flow Console (navigating to `/`)

The critical difference:
- Shell calls `initializeShell()` DIRECTLY (no NavigationEnd wait)
- ResourceResolver runs AFTER shell is initialized
- Resource component loads → `emitFirstLoadCompleteOnce()` → `loading=false`
- Resolver resolve for `/app/home/Home` is SUPPRESSED (URL sync, not real navigation)

---

## Root Cause Analysis

The race condition predates lazy loading. It's a fundamental architectural issue with **three independent async subscribers** all reacting to the same `LoggedIn` event:

1. **ResourceResolver** (via `waitForLogin()`) → immediately proceeds to resolve routes
2. **ApplicationManager** (via `Initialize()`) → starts loading apps (async, takes time)  
3. **Shell** (via `ngOnInit()`) → waits for NavigationEnd before initializing

For deep links, the order is:
- LoggedIn fires → all three start
- ResourceResolver resolves first (lightweight — just `StartupManager.Startup()`)
- Resolver queues a tab via `TabService.OpenTab()`
- Shell waits for NavigationEnd which fires AFTER resolver completes
- Shell replays queued tabs → `workspaceManager.OpenTab()` → config update
- Tab container reacts to config → `loadSingleResourceContent()` → creates resource component
- Resource component either:
  - **(a)** loads and calls `LoadCompleteEvent` → success (usually)
  - **(b)** fails to load or never calls `LoadCompleteEvent` → dead state

The intermittent nature suggests (b) happens due to a secondary timing issue — possibly:
- The resource component's `Data` input triggers an async load that fails silently
- `GetRegistrationAsync` works (lazy loading is wired up) but the component initialization hits an error that's swallowed
- The tab container's `loadSingleResourceContent()` hits one of its many early-return paths before wiring `LoadCompleteEvent`

---

## Proposed Fix (Post-Diagnosis Confirmation)

### Fix 1: Safety Net Timeout in Shell (Quick Win)

Add a timeout in `initializeShell()` that forces `loading=false` if `onFirstResourceLoadComplete()` never fires within a reasonable time. Instead of the current 20-second "Reset" button (nuclear option), add a 10-second timeout that:
- Sets `loading=false` to reveal the shell
- Logs a warning for diagnostics
- Does NOT clear local storage or reload

```typescript
// After initialized=true, waitingForFirstResource=true
setTimeout(() => {
  if (this.loading && this.waitingForFirstResource) {
    console.warn('[Shell] Safety net: forcing loading=false after timeout');
    this.loading = false;
    this.waitingForFirstResource = false;
    this.stopLoadingAnimation();
    this.cdr.detectChanges();
  }
}, 10_000);
```

### Fix 2: Guard Against Missing Resource Registration (Defense in Depth)

In `tab-container.component.ts`, after `GetRegistrationAsync` returns null, still emit `firstResourceLoadComplete` so the shell can show content (even if this particular tab fails):

```typescript
if (!resourceReg) {
  LogError(`Unable to find resource registration for driver class: ${driverClass}`);
  this.emitFirstLoadCompleteOnce(); // Don't let one bad tab lock up the whole app
  return;
}
```

### Fix 3: Centralize Startup Sequencing (Architectural Fix)

The root cause is that ResourceResolver, ApplicationManager, and Shell all independently subscribe to `LoggedIn` and race each other. The fix is to make the ResourceResolver wait for ApplicationManager to finish loading:

**Option A**: Have ResourceResolver await `appManager.Applications.pipe(first(apps => apps.length > 0))` before processing
**Option B**: Have `waitForLogin()` also await `appManager.WhenReady()` (new method that resolves when `initialized=true`)

Option B is cleaner:
```typescript
// In ApplicationManager
private readyResolve!: () => void;
private readyPromise = new Promise<void>(resolve => { this.readyResolve = resolve; });

public WhenReady(): Promise<void> { return this.readyPromise; }

// In loadApplications(), after initialized = true:
this.readyResolve();

// In ResourceResolver.waitForLogin():
await StartupManager.Instance.Startup();
await this.appManager.WhenReady(); // NEW — wait for apps to load
```

### Recommended Implementation Order
1. **Fix 2** first — immediate safety net, zero risk
2. **Fix 1** next — graceful degradation for any future timing issues
3. **Fix 3** last — proper architectural fix, needs careful testing

---

## Files Modified (Diagnostic Logging)

1. `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts` (6 logs)
2. `packages/Angular/Explorer/explorer-core/src/app-routing.module.ts` (14 logs)
3. `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` (14 logs)
4. `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts` (1 log)
5. `packages/Angular/Explorer/base-application/src/lib/tab.service.ts` (2 logs)
6. `packages/Angular/Explorer/base-application/src/lib/application-manager.ts` (8 logs)
