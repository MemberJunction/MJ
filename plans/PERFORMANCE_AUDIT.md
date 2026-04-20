# MJExplorer Full-Stack Performance Audit

**Branch:** `AN-BC/performance`
**Date Started:** 2026-03-23
**Status:** In progress — 6 commits pushed, 31% TTI reduction achieved
**Goal:** 50% faster load times, snappy interactions throughout

---

## Results Summary

| Metric | Baseline | Current | Improvement |
|--------|----------|---------|-------------|
| **TTI (browser refresh)** | ~2,925ms | **~2,008ms** | **-31%** |
| **TTI (cold load)** | ~3,091ms | **~2,918ms** | -6% |
| **GraphQL requests on load** | 18 | **3** | **-83%** |
| **Blocking server requests** | 18 | **0** | **-100%** |
| **GraphQL cumulative time** | 4,202ms | **~500ms** | **-88%** |
| **Console code errors** | 7 | **0** | **-100%** |
| **MJCore unit tests** | 789/789 | **789/789** | No regressions |

All 3 remaining GraphQL requests are **background/non-blocking** — the app shell loads entirely from local IndexedDB cache on warm refreshes.

---

## Environment Setup

### Working Directory
`/Users/amith/g-drive/develop/MJ_M5Max` — a full git clone of MemberJunction, separate from the main MJ directory to avoid Google Drive sync conflicts.

### Auth0 Configuration (Headless Automation)
Both server (.env) and client (environment.ts) are configured for the headless Auth0 tenant:
- **Auth0 Domain:** `bluecypress-dev.us.auth0.com`
- **Client ID:** `uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI`
- **Test User:** `da-robot-tester@bluecypress.io` / `!!SoDamnSecureItHurt$`
- **MJAPI .env:** Symlinked from `packages/MJAPI/.env` -> `../../.env`
- **MJExplorer environments:** `packages/MJExplorer/src/environments/environment.ts` and `environment.development.ts` with `AUTH_TYPE: 'auth0'`

### Ports
- **MJAPI:** localhost:4001 (GRAPHQL_PORT=4001 in .env)
- **MJExplorer:** localhost:4201 (ng serve --port 4201)

### Database
- SQL Server on localhost:1433, database `MJ_5_15_0`

### Playwright CLI
- Installed globally: `@playwright/cli` v1.59.0
- Profile cached at `.playwright-cli/profile` (contains Auth0 session tokens)
- Headed mode: `playwright-cli open --headed --profile .playwright-cli/profile http://localhost:4201`

### npm install
- Run with `npm install --ignore-scripts` (isolated-vm native build fails on this machine)
- Full Turbo build completed: 171 tasks, 141 cached, ~48 seconds

---

## Commits (6 total on AN-BC/performance)

### Commit 1: `8686751` — Request Coalescing (biggest single win)
**Files changed:**
- `packages/MJCore/src/generic/providerBase.ts` — Added coalescing queue + flush mechanism
- `packages/MJCore/src/__tests__/providerBase.dedup.test.ts` — Disable coalescing in dedup tests
- `packages/Angular/Explorer/shared/src/lib/shared.service.ts` — Remove duplicate RefreshUserNotifications, move preWarmEngines earlier
- `packages/Angular/Explorer/auth-services/src/lib/redirect.component.ts` — OnPush + ChangeDetectorRef for NG0100 fix
- `packages/MJServer/src/index.ts` — Startup timing instrumentation

**What it does:**
When multiple engines call `RunViews()` concurrently during startup, instead of each firing a separate HTTP request, the coalescing window (10ms) accumulates them and merges into a single mega-batch. Each caller's promise resolves with only their slice of results.

**Impact:** 18 GraphQL requests -> ~10, cumulative query time 4,202ms -> ~1,005ms

### Commit 2: `b84b734` — Earlier LoggedIn + PreWarm Timing
**Files changed:**
- `packages/GraphQLDataProvider/src/config.ts` — Fire LoggedIn event before awaiting StartupManager
- `packages/Angular/Explorer/shared/src/lib/shared.service.ts` — Fire preWarmEngines before StartupManager

**What it does:**
Pre-warm engines (AI, Artifacts, Dashboards, Communications) now start loading during startup instead of after. Their RunViews calls arrive within the coalescing window, getting merged into the mega-batch.

**Impact:** 10 requests -> 8, TTI 2,558ms -> 2,175ms

### Commit 3: `fa6748b` — Dataset Status Batching
**Files changed:**
- `packages/MJServer/src/resolvers/DatasetResolver.ts` — New `GetMultipleDatasetStatusByName` batch resolver
- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` — Dataset status coalescing (same pattern as RunViews)

**What it does:**
The 3 separate `GetDatasetStatusByName` calls (MJ_Metadata, ResourceTypes, Template_Metadata) are coalesced into a single batched GraphQL request.

**Impact:** 8 requests -> 7

### Commit 4: `44e0c7f` — Metadata Stale-While-Revalidate
**Files changed:**
- `packages/MJCore/src/generic/providerBase.ts` — Fast-start from IndexedDB cache + background validation

**What it does:**
On warm loads, loads metadata from IndexedDB immediately instead of blocking on a server status check. Background validation runs asynchronously — if metadata is stale, it's atomically swapped in place.

**Impact:** 7 requests -> 6, eliminated blocking metadata check from critical path

### Commit 5: `d3670ae` — FastStartupMode for Entity Configs
**Files changed:**
- `packages/MJCore/src/generic/providerBase.ts` — FastStartupMode flag + PreRunViews cache trust
- `packages/MJCore/src/__tests__/providerBase.dedup.test.ts` — CoalesceWindowMs reset in tests

**What it does:**
On the first round of engine loading after a page refresh, if all requested entities have data in the IndexedDB cache, serves it directly without server validation. Auto-disables after first use.

**Impact:** 6 requests -> 5, eliminated the coalesced RunViewsWithCacheCheckQuery from critical path

### Commit 6: `15596fe` — FastStartupMode for Datasets + Duplicate ResourceTypes Fix
**Files changed:**
- `packages/MJCore/src/generic/providerBase.ts` — FastStartupMode in GetAndCacheDatasetByName
- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts` — Use ResourcePermissionEngine instead of fetching dataset

**What it does:**
Extends FastStartupMode to dataset-type engine configs. Also eliminates a duplicate `GetDatasetByName(ResourceTypes)` call from TabContainerComponent — it now uses ResourcePermissionEngine's already-loaded data.

**Impact:** 5 requests -> 3, all 3 remaining are background/non-blocking

---

## Architecture of the Optimizations

### Request Coalescing (ProviderBase)
```
Engine A calls RunViews([Users, Roles])     ──┐
Engine B calls RunViews([Queries, Models])   ──┤── 10ms coalescing window
Engine C calls RunViews([Permissions])       ──┘
                                                │
                                    ┌───────────┘
                                    v
                    Single mega-batch RunViews([Users, Roles, Queries, Models, Permissions])
                                    │
                                    v
                    Results split back to each caller's promise
```

### FastStartupMode (Warm Load Path)
```
Page Refresh
    │
    v
provider.Config()
    │
    ├── Load metadata from IndexedDB (instant, ~5ms)
    │   └── Background: validate with server
    │
    v
StartupManager.Startup()
    │
    ├── Engine A: RunViews with CacheLocal=true
    │   └── FastStartupMode: serve from IndexedDB (instant)
    ├── Engine B: RunViews with CacheLocal=true
    │   └── FastStartupMode: serve from IndexedDB (instant)
    └── Engine C: Dataset config
        └── FastStartupMode: serve cached dataset (instant)
    │
    v
App Shell Renders (~2 seconds total, zero blocking network calls)
    │
    v
Background: 3 non-blocking validation requests fire
```

### Cold Load Path (First Visit)
```
First Visit / Cleared Cache
    │
    v
provider.Config()
    │
    ├── No cached metadata → full GetAllMetadata from server (~1.5s)
    │
    v
StartupManager.Startup()
    │
    ├── No cached data → RunViews with server validation
    │   └── Coalesced into 1-2 mega-batches (instead of 10+ individual)
    │
    v
App Shell Renders (~2.9 seconds, coalesced network calls)
```

---

## Key Configuration Options

All options are static properties on `ProviderBase`:

| Property | Default | Description |
|----------|---------|-------------|
| `CoalesceWindowMs` | 10 | Milliseconds to accumulate concurrent RunViews before flushing as mega-batch. Set 0 to disable. |
| `FastStartupMode` | true | Trust IndexedDB cache on first engine load after startup. Auto-disables after use. |
| `DedupLingerMs` | 5000 | How long resolved RunViews results linger for instant replay. |

Dataset status coalescing is configured on `GraphQLDataProvider`:

| Property | Default | Description |
|----------|---------|-------------|
| `_datasetStatusCoalesceMs` | 10 | Window for batching GetDatasetStatusByName calls. |

---

## Measurement Methodology

### Tools
- **Playwright CLI** with `--headed --profile` for reproducible browser automation
- **Auth0 headless login** with `da-robot-tester@bluecypress.io` for automated auth
- **Built-in TelemetryManager** for server-side query analysis
- **`performance.now()` markers** in MJAPI serve() for startup waterfall

### TTI Measurement
```javascript
// Playwright run-code script
const startTime = Date.now();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("h1", { timeout: 15000 });
const tti = Date.now() - startTime;
```

TTI = time from navigation/reload to `<h1>` visible (greeting heading on home dashboard) + network idle (no pending requests for 500ms).

### Request Counting
Playwright request interception captures all POST requests to localhost:4001, parsing the GraphQL operation name from each.

### Consistency
All measurements run 3x and averaged. Variance is typically <5%.

---

## Server Startup Waterfall (Baseline)

| Phase | Duration | % of Total |
|-------|----------|------------|
| DB Pool Connect | 40ms | 0.7% |
| **Metadata + Provider Setup** | **4,030ms** | **68.5%** |
| Telemetry + Cache + APIKey Init | 1ms | 0.0% |
| Resolver + Middleware Discovery | 72ms | 1.2% |
| **Schema Build** | **1,678ms** | **28.5%** |
| Apollo + Express Setup | 52ms | 0.9% |
| **Total Startup** | **5,879ms** | 100% |

Server startup was not optimized (client-side TTI was the priority), but the timing instrumentation is in place for future work.

---

## What's Left / Next Steps

### Remaining ~2s TTI Breakdown (Refresh)
- **~500ms**: JavaScript parse + execute (30 MB dev bundle, would be much less in production)
- **~500ms**: Angular bootstrap + module initialization
- **~500ms**: Component rendering (shell, navigation, home dashboard)
- **~500ms**: Auth0 token validation + route processing

### To Hit 50% Target (~1,463ms)
1. **Production build measurement** — Dev server serves 30 MB uncompressed JS. Production with minification + gzip/brotli would cut JS parse from ~500ms to ~150ms. This alone might get us close.
2. **OnPush change detection on Shell/Nav** — Reduce Angular rendering overhead during initial load
3. **Defer home dashboard data** — Load shell first (instant with cached nav items), then load dashboard content
4. **Service Worker** — Cache static assets for zero-network repeat visits
5. **Speculative prefetching** — Start WebSocket connection and background validation during Auth0 redirect (~500ms of dead time)

### Known Limitations
- `FastStartupMode` trusts IndexedDB cache without validation on first load. If server-side data changed between page loads, the UI shows stale data until the background validation completes (~1-2 seconds)
- Cache invalidation via WebSocket subscription handles real-time updates normally after initial load
- Cold loads (first visit, cleared cache) don't benefit from FastStartupMode and still make ~7 coalesced requests

---

## Files Modified (All Changes)

### Core Framework
- `packages/MJCore/src/generic/providerBase.ts` — Coalescing, FastStartupMode, metadata SWR, dataset fast-start
- `packages/MJCore/src/__tests__/providerBase.dedup.test.ts` — Test updates for coalescing

### GraphQL Client
- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` — Dataset status coalescing
- `packages/GraphQLDataProvider/src/config.ts` — Earlier LoggedIn event

### Angular Explorer
- `packages/Angular/Explorer/shared/src/lib/shared.service.ts` — Earlier preWarm, remove duplicate notification
- `packages/Angular/Explorer/auth-services/src/lib/redirect.component.ts` — OnPush NG0100 fix
- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts` — Use engine cache instead of dataset fetch

### Server
- `packages/MJServer/src/index.ts` — Startup timing instrumentation
- `packages/MJServer/src/resolvers/DatasetResolver.ts` — Batch dataset status resolver

### Configuration (gitignored, not in commits)
- `.env` — Auth0 headless tenant credentials
- `packages/MJExplorer/src/environments/environment.ts` — Auth0 config
- `packages/MJExplorer/src/environments/environment.development.ts` — Auth0 config
- `packages/MJAPI/.env` — Symlink to root .env
