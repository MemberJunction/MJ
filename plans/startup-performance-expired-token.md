# Fix: MJExplorer Startup Performance — Expired Token Path (80s delay)

## Context

When a previously logged-in user returns with an expired token, MJExplorer takes ~80 seconds to become interactive. The timing is captured at `[Workspace] GraphQL client setup complete: 80473ms`. This is significantly slower than earlier versions.

The delay is caused by **multiple compounding factors** introduced across recent changes (MSAL v3→v5, CacheLocal on engines, new startup engines, growing metadata). No single change is the culprit — several independently-reasonable changes compound to roughly double the startup time.

### Console Log Timeline
```
[MSAL] Starting initialization...
[MSAL] Cached accounts found: 1
[MSAL] Restoring session from cached account: robert.kihm@bluecypress.io
[MSAL] Performing proactive token refresh (offset: 7200s)...
[MSAL] Initialization completed (cached session restored)         ← init done BEFORE refresh
[MSAL] Proactive token refresh successful                         ← refresh finishes in background
cdp-graphql.azurewebsites.net/ → 500 (Internal Server Error)     ← first GQL call uses EXPIRED token
[GraphQL] ExecuteGQL error caught: Object
[GraphQL] Starting token refresh...
[GraphQL] Token refresh completed successfully
LocalCacheManager initialized in 3ms
[Workspace] GraphQL client setup complete: 80473ms                ← 80 SECONDS
```

### What `setupGraphQLClient()` Does (the 80s window)

**File**: `packages/GraphQLDataProvider/src/config.ts:8-22`

```
setupGraphQLClient(config)
 ├─ provider.Config(config)                     ← ProviderBase.Config()
 │   ├─ CheckToSeeIfRefreshNeeded()
 │   │   ├─ RefreshRemoteMetadataTimestamps()   ← GQL call → 500/JWT_EXPIRED → refresh → retry
 │   │   ├─ LoadLocalMetadataFromStorage()      ← IndexedDB read
 │   │   └─ LocalMetadataObsolete()             ← returns true (data changed)
 │   ├─ GetAllMetadata()                        ← large GQL call (all entities/fields/relationships)
 │   └─ SaveLocalMetadataToStorage()            ← IndexedDB write
 ├─ StartupManager.Instance.Startup()
 │   ├─ LocalCacheManager.Initialize()          ← 3ms
 │   └─ 9 engines in parallel (all priority 100)
 │       ├─ AIEngineBase           (25+ entities, CacheLocal)
 │       ├─ UserInfoEngine         (7-10 entities, CacheLocal)  ← NEW Dec 2025
 │       ├─ DashboardEngine        (8 entities, CacheLocal)
 │       ├─ QueryEngine            (6 entities, CacheLocal)     ← NEW Feb 2026
 │       ├─ EncryptionEngineBase   (3 entities, CacheLocal)
 │       ├─ ResourcePermissionEng  (1 entity + 1 dataset)
 │       ├─ APIKeysEngineBase      (5 entities, CacheLocal)
 │       ├─ NotificationEngine     (depends on UserInfoEngine)
 │       └─ EncryptionEngine       (extends EncryptionEngineBase)
 └─ MJGlobal.RaiseEvent(LoggedIn)
```

Each engine with `CacheLocal: true` goes through the smart cache check path:
1. IndexedDB reads for each entity (cache fingerprint lookup)
2. `RunViewsWithCacheCheck` GQL call (instead of plain `RunViews`)
3. Server-side timestamp comparison per entity
4. IndexedDB writes for all results

---

## Root Causes (ranked by impact)

### Cause 1: MSAL v5 returns expired token to `handleLogin()` (HIGH IMPACT, ~5-10s)

**Commit**: `3792d5fa1` — MSAL v3→v5 upgrade

**File**: `packages/Angular/Explorer/auth-services/src/lib/providers/mjexplorer-msal-provider.service.ts`

`extractIdTokenInternal()` at **line 225** returns `account.idToken` directly without checking expiry:
```typescript
if (account.idToken) {
    return account.idToken;  // Returns expired token!
}
```

Meanwhile, `performProactiveRefresh()` is fire-and-forget at **line 134** — initialization is marked complete immediately *before* the refresh finishes:
```typescript
this.performProactiveRefresh(accounts[0]).catch(...);  // Not awaited!
this._initializationCompleted$.next(true);             // Done before refresh completes
```

**Result**: `handleLogin()` receives the expired cached token → GraphQL client is created with it → first server call fails with 500/JWT_EXPIRED → token refresh → retry. This entire round trip (~5-10s) **did not exist before the MSAL v5 migration**.

### Cause 2: `CacheLocal` enabled on all engines — IndexedDB overhead (HIGH IMPACT, ~10-20s)

**Commit**: `4b639ea4e` (Dec 28, 2025) — "Update several engines to use CacheLocal"

Before this change, engines used plain `RunViews()`. After, all engine configs have `CacheLocal: true`, triggering the smart cache check path in `ProviderBase.PreRunViews()` (**line 662-666**):

```typescript
const useSmartCacheCheck = params.some(p => p.CacheLocal);
if (useSmartCacheCheck && LocalCacheManager.Instance.IsInitialized) {
    return this.prepareSmartCacheCheckParams(params, ...);
}
```

This path adds per-entity IndexedDB reads before each batch call, uses `RunViewsWithCacheCheck` (heavier server endpoint), then writes all results to IndexedDB. On first/cold load this is **pure overhead** — cache reads return nothing, server fetches everything anyway, then everything gets written to IndexedDB.

With 9 engines × ~60+ entities, that's **60+ IndexedDB reads + 60+ IndexedDB writes** added to startup.

### Cause 3: Two new startup engines (MEDIUM IMPACT, ~5-15s)

- **UserInfoEngine** (commit `b5b781460`, Dec 29, 2025) — 7-10 entities
- **QueryEngine** (commit `c66bcf123`, Feb 18, 2026) — 6 entities

Each adds a parallel `RunViewsWithCacheCheck` batch call during `StartupManager.Startup()`.

### Cause 4: Growing metadata (MEDIUM IMPACT, ~5-10s)

New entities added for AI (Model Costs, Price Types, Agent Configurations, Modalities), Dashboards (Permissions, Category Permissions), and Queries increase:
- `GetAllMetadata()` response size and parsing time
- `AIEngineBase` entity count (now 25+)

### Cause 5: Smart cache check server overhead (LOW IMPACT, ~2-5s)

The `RunViewsWithCacheCheck` GQL endpoint has more server-side processing than plain `RunViews` — it must check timestamps and row counts for each entity before deciding to return data.

---

## Task List

### Task 1: Await proactive refresh before returning token (CRITICAL)
**File**: `packages/Angular/Explorer/auth-services/src/lib/providers/mjexplorer-msal-provider.service.ts`
**Priority**: CRITICAL
**Effort**: Small

Store the proactive refresh promise and await it in `extractIdTokenInternal()` before returning the cached token. This eliminates the initial 500 error and token refresh cycle entirely.

**Option A — Await proactive refresh in `extractIdTokenInternal()`**:
```typescript
private _proactiveRefreshPromise: Promise<void> | null = null;

// In _performInitialization(), line 134:
this._proactiveRefreshPromise = this.performProactiveRefresh(accounts[0])
  .catch((err: unknown) => {
    console.warn('[MSAL] Proactive token refresh failed during init:', err);
  })
  .finally(() => {
    this._proactiveRefreshPromise = null;
  });

// In extractIdTokenInternal(), before line 225:
if (this._proactiveRefreshPromise) {
    await this._proactiveRefreshPromise;
}

const account = this.auth.instance.getActiveAccount();
if (!account) return null;

if (account.idToken) {
    return account.idToken;  // Now returns the REFRESHED token
}
```

**Option B — Check token expiry before returning it** (alternative/complementary):
```typescript
// In extractIdTokenInternal(), replace line 225-227:
if (account.idToken) {
    // Check if the cached token is expired
    const claims = account.idTokenClaims;
    const expiresAt = (claims?.exp as number) ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt > now) {
        return account.idToken;  // Only return non-expired tokens
    }
    // Token expired — fall through to acquireTokenSilent
}
```

**Recommendation**: Implement Option A (await proactive refresh). It's the cleanest fix — the proactive refresh already runs and succeeds quickly; we just need to wait for it before handing the token to `handleLogin()`. Option B is a good safety net to add alongside.

**Why this is the highest-priority fix**: Eliminates the entire failed-request → token-refresh → retry cycle that adds ~5-10s and triggers the 500 error in the console.

### Task 2: Skip smart cache check on cold/first load (HIGH)
**File**: `packages/MJCore/src/generic/providerBase.ts`
**Priority**: HIGH
**Effort**: Medium

When `prepareSmartCacheCheckParams()` finds that ALL cache lookups are misses (no cached data), fall back to the traditional `InternalRunViews` path instead of `RunViewsWithCacheCheck`. This avoids the heavier server endpoint and eliminates useless cache-status payloads.

```typescript
// In prepareSmartCacheCheckParams(), after building smartCacheCheckParams:
// Check if ANY param actually has cache status
const hasAnyCacheStatus = smartCacheCheckParams.some(p => p.cacheStatus != null);
if (!hasAnyCacheStatus) {
    // All cache misses — fall back to traditional path (no cache status to send)
    return {
        telemetryEventId,
        allCached: false,
        uncachedParams: params,
        useSmartCacheCheck: false  // Skip executeSmartCacheCheck
    };
}
```

**Why**: On first load or after version upgrades, all IndexedDB cache reads return nothing. The smart cache check path still sends cache status (all empty) to the server, which processes it and returns full data anyway. Falling back to plain `RunViews` eliminates the `RunViewsWithCacheCheck` server overhead.

### Task 3: Add timing instrumentation to `setupGraphQLClient()` (HIGH)
**File**: `packages/GraphQLDataProvider/src/config.ts`
**Priority**: HIGH
**Effort**: Small

Add phase-level timing logs so we can measure the exact breakdown:

```typescript
export async function setupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    const t0 = Date.now();
    const provider = new GraphQLDataProvider();
    SetProvider(provider);

    const t1 = Date.now();
    console.log(`[Startup] Provider created: ${t1 - t0}ms`);

    await provider.Config(config);
    const t2 = Date.now();
    console.log(`[Startup] provider.Config() complete: ${t2 - t1}ms`);

    await StartupManager.Instance.Startup();
    const t3 = Date.now();
    console.log(`[Startup] StartupManager.Startup() complete: ${t3 - t2}ms`);

    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });
    console.log(`[Startup] Total setupGraphQLClient: ${t3 - t0}ms`);

    return provider;
}
```

Also add timing in `ProviderBase.Config()` around `CheckToSeeIfRefreshNeeded`, `GetAllMetadata`, and `SaveLocalMetadataToStorage` to pinpoint where time is spent.

**Why**: We need measured data to validate the estimated breakdown and prioritize further optimizations. This is low-risk and immediately actionable.

### Task 4: Add per-engine timing to `StartupManager.Startup()` (HIGH)
**File**: `packages/MJCore/src/generic/RegisterForStartup.ts`
**Priority**: HIGH
**Effort**: Small

The `StartupManager.Startup()` method already tracks `loadDurationMs` per registration. Surface these timings in the console:

```typescript
// After all priority groups have loaded, add:
const sortedByDuration = results
    .filter(r => r.success)
    .sort((a, b) => b.durationMs - a.durationMs);

console.log(`[Startup] Engine load times (slowest first):`);
for (const r of sortedByDuration.slice(0, 5)) {
    console.log(`  ${r.className}: ${r.durationMs}ms`);
}
console.log(`[Startup] Total StartupManager: ${totalDurationMs}ms`);
```

**Why**: Identifies which engines are the slowest (likely AIEngineBase) and guides further optimization.

### Task 5: Defer non-critical engines to post-render (MEDIUM)
**File**: `packages/MJCore/src/generic/RegisterForStartup.ts` (priority system)
**Files**: Engine classes that get deferred
**Priority**: MEDIUM
**Effort**: Medium

Use the existing priority system in `@RegisterForStartup` to split engines into two tiers:

- **Priority 10 (critical for UI render)**: EncryptionEngine, ResourcePermissionEngine, UserInfoEngine, DashboardEngine
- **Priority 100 (can load after UI is interactive)**: AIEngineBase, QueryEngine, APIKeysEngineBase, NotificationEngine

With tiered priorities, the critical engines load first and the app can begin rendering while non-critical engines load in the background.

```typescript
// Example: Defer QueryEngine
@RegisterForStartup(QueryEngine, 100)  // Default, loads after priority 10

// Example: Promote DashboardEngine
@RegisterForStartup(DashboardEngine, 10)  // Loads first
```

**Why**: Users see a responsive UI faster. The total load time stays the same, but perceived performance improves significantly.

### Task 6: Skip `CheckToSeeIfRefreshNeeded` on first `Config()` call (MEDIUM)
**File**: `packages/MJCore/src/generic/providerBase.ts`
**Priority**: MEDIUM
**Effort**: Small

On the very first `Config()` call (no local metadata exists), `CheckToSeeIfRefreshNeeded()` makes a server call to get timestamps, then loads (empty) IndexedDB, then determines refresh is needed anyway. This server call is wasted — we know we need to fetch metadata on first load.

```typescript
public async Config(data: ProviderConfigDataBase, providerToUse?: IMetadataProvider): Promise<boolean> {
    this._ConfigData = data;

    if (Metadata.Provider && !data.IgnoreExistingMetadata) {
        if (this.CopyMetadataFromGlobalProvider()) {
            return true;
        }
    }

    // On first load (no local metadata), skip the timestamp check and go straight to GetAllMetadata
    const isFirstLoad = !this._localMetadata && !this._refresh;
    if (this._refresh || isFirstLoad || await this.CheckToSeeIfRefreshNeeded(providerToUse)) {
        this._refresh = false;
        const start = new Date().getTime();
        const res = await this.GetAllMetadata(providerToUse);
        // ... rest unchanged
    }
    return true;
}
```

**Why**: Eliminates one server round trip on first load. This is especially impactful when the token is expired (Cause 1), as it avoids the first 500 error entirely — `GetAllMetadata` is the call that fails instead, and that's the call that needs to happen regardless.

### Task 7: Reduce `AIEngineBase` entity count or lazy-load subsets (LOW)
**File**: `packages/AI/BaseAIEngine/src/BaseAIEngine.ts`
**Priority**: LOW
**Effort**: Medium

`AIEngineBase` loads 25+ entities at startup. Many of these (Model Costs, Price Types, Price Unit Types, Agent Modalities, etc.) are rarely needed during normal UI operation. Consider:
- Moving cost/pricing entities to lazy loading (loaded on-demand when the AI cost dashboard is opened)
- Splitting into `AIEngineCore` (models, prompts, agents — always needed) and `AIEngineExtended` (costs, modalities, configurations — lazy)

**Why**: Reduces the largest single batch call during startup. This is a bigger refactor and should be guided by the timing data from Task 4.

---

## Estimated Impact

| Task | Estimated Time Saved | Effort | Risk |
|------|---------------------|--------|------|
| 1. Await proactive refresh | 5-10s | Small | Low |
| 2. Skip cache check on cold load | 5-10s | Medium | Low |
| 3. Add timing instrumentation | 0s (diagnostic) | Small | None |
| 4. Per-engine timing | 0s (diagnostic) | Small | None |
| 5. Defer non-critical engines | 10-20s perceived | Medium | Low |
| 6. Skip timestamp check on first load | 2-5s | Small | Low |
| 7. Lazy-load AI subsets | 5-10s | Medium | Medium |

**Tasks 1 + 2 + 6** together should reduce the 80s to ~55-60s with minimal risk.
**Tasks 1 + 2 + 5 + 6** should bring perceived startup down to ~30-40s.
Tasks 3 + 4 are diagnostic and should be done first to validate the estimates.

---

## Files Modified Summary

| Task | File(s) | Change |
|------|---------|--------|
| 1 | `packages/Angular/Explorer/auth-services/src/lib/providers/mjexplorer-msal-provider.service.ts` | Await proactive refresh before returning token |
| 2 | `packages/MJCore/src/generic/providerBase.ts` | Fall back to plain RunViews on all-miss cache |
| 3 | `packages/GraphQLDataProvider/src/config.ts` | Add phase timing logs |
| 4 | `packages/MJCore/src/generic/RegisterForStartup.ts` | Add per-engine timing output |
| 5 | Engine classes + `RegisterForStartup.ts` | Assign priority tiers |
| 6 | `packages/MJCore/src/generic/providerBase.ts` | Skip timestamp check on first load |
| 7 | `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` | Split entity configs into core/extended |

---

## Verification

### Measuring Improvement
1. Clear browser data (IndexedDB, localStorage) to simulate cold load
2. Open MJExplorer with an expired-token user
3. Record the `[Workspace] GraphQL client setup complete: Xms` timing
4. Compare before/after each task

### Regression Testing
1. **Fresh login**: Verify login flow still works (no redirect issues)
2. **Cached session (valid token)**: Verify startup is fast (no unnecessary refreshes)
3. **Expired token**: Verify the 500 error no longer appears and startup is faster
4. **Engine data availability**: Verify all engine data is accessible after startup (especially deferred engines if Task 5 is implemented)
5. **CacheLocal functionality**: Verify that subsequent loads (warm cache) still benefit from smart cache check

### Build Verification
```bash
cd packages/Angular/Explorer/auth-services && npm run build
cd packages/MJCore && npm run build
cd packages/GraphQLDataProvider && npm run build
cd packages/AI/BaseAIEngine && npm run build
```
