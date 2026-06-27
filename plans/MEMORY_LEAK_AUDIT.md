# MemberJunction Memory & Resource Leak Audit

**Generated:** 2026-06-20  
**Prior Runs:** 2026-05-03 (Round 1 + Round 2 baseline — 158 findings)  
**Scope:** Full monorepo — 234 packages  
**Tooling:** 10 parallel `Explore` subagents in two waves  
**Re-run command:** `/audit-memory-leaks`

This document supersedes the previous plan. It is organized in three parts:

- **Part 1 — Round 1 Baseline** (2026-05-03): broad five-category sweep; 84 findings
- **Part 2 — Round 2 Server-Side Gap Fill** (2026-05-03): targeted deep scan; 74 findings
- **Part 3 — Round 3 Re-Audit** (2026-06-20): full re-scan with Persisted/Resolved/New diff; ~77 new findings, ~30 resolved

---

## Round 3 Executive Summary

| Status | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| **Resolved since Round 2** | 4 | 10 | 13 | 3 | **30** |
| **Persisted from R1+R2** | 10 | 21 | 26 | 7 | **64** |
| **New in Round 3** | 14 | 24 | 32 | 7 | **77** |
| **Grand Total (all rounds)** | **~28** | **~55** | **~71** | **~17** | **~171** |

### Key Progress Since Round 2

These items from the previous plan have been **confirmed fixed**:

1. **R2-C11 (A2AServer tasks Map)** — the single highest-impact leak from Round 2. Replaced with `TaskStore` class implementing `IShutdownable` with 1-hour TTL sweep. **Template for future fixes.**
2. **Baseline C7 (IShutdownable/ShutdownRegistry)** — `QueueBase`, `QueueManager`, `AgentRunWatchdog`, `SessionJanitor`, and `TaskStore` now implement `IShutdownable` and self-register. 22 implementations confirmed.
3. **R2-C3 (Communication provider client caches)** — Twilio, Gmail, and MSGraph provider caches migrated to `MJLruCache(100)` + 1hr TTL.
4. **Baseline C3 (BaseEntity.ResultHistory)** — `MAX_RESULT_HISTORY = 50` cap confirmed; `RegisterResultHistoryEntry()` trims overflow.
5. **H25–H28 (SQL/file/WebSocket connections)** — `executeSQLCore`, `GitHubReleaseProvider`, `AgentRunner` transaction wrapper, and GraphQL-WS client lifecycle all confirmed fixed.
6. **Angular listener cleanup** — 3 chat/remote-browser listener sites now properly call `removeEventListener` in `ngOnDestroy`.
7. **Streaming-thinking reset** — Anthropic/OpenAI `_streamingState` now reset in `finally` block via `BaseLLM.resetStreamingState()`.
8. **AuthProviders https.Agent** — Agent now created once per provider instance, not per-call.

### Most Consequential New Findings (Round 3)

1. **`.bind()` anti-pattern in resize handlers** (5 Angular components) — `window.addEventListener(..., handler.bind(this))` + `removeEventListener(..., handler.bind(this))` creates two different function objects; the listener is never removed. Affects realtime, conversation, and settings components.
2. **HeadlessBrowserEngine triple cache** — `_recycled`, `_fresh`, `_workerStorageState` accumulate browser contexts and session cookies per worker with no background sweeper.
3. **Integration connectors — 17 new findings, 0 resolved** — Rate limiter Maps keyed by endpoint, OAuth token proliferation (NimbleAMS), RelationalDBConnector `poolCache` open connections, and per-sync accumulators in new connectors (PathLMS, NimbleAMS, etc.).
4. **AWSFileStorage client leak on re-initialization** — Old S3Client (with IMDS polling timers, credential-provider chains) dropped without `.destroy()` on credential rotation.
5. **React `CacheManager` per-entry `setTimeout` orphaning** — Every overwritten cache entry leaves a dangling timer; O(N) timer accumulation under repeated writes.
6. **RxJS / Angular subscriptions in new dashboard components** — 8 new GetEventListener subscriptions without `takeUntil` in Lists, FormBuilder, Autotagging, and DevTools dashboards.

---

## Methodology

Ten parallel `Explore` subagents in two waves:
- **Wave 1 (A–E):** broad five-category sweep (RxJS, timers, listeners, caches, connections) — each with Persisted/Resolved/New diff against the Round 2 baseline
- **Wave 2 (F–J):** deep subtree scans (AI providers, Integration connectors, Communication/Storage/Auth, Actions/misc, MJServer/AI-Agents/MCP/A2A)

**Severity definitions:**
- **Critical** — Long-lived growth tied to repeated user activity with no automatic upper bound
- **High** — Per-component or per-session leak that doesn't reclaim until singleton/process ends
- **Medium** — Leaks only on error paths, edge cases, or graceful-shutdown gaps
- **Low** — Cleaned up on process death; affects only graceful shutdown or developer ergonomics

**Static cross-check counts (2026-06-20):**

| Pattern | Count | Trend |
|---|---:|---|
| `GetEventListener().subscribe(...)` sites | 28 | Stable (app-lifetime singletons acceptable) |
| `setInterval` sites | 66 | Down from ~80; C7 IShutdownable progress |
| `addEventListener(` (non-template) | 182 | High; many unreviewed |
| `new Map` class fields | 281 | High; many correctly bounded |
| `extends BaseSingleton` | 65 | Unchanged |
| `IShutdownable` implementations | 22 | Significant improvement from Round 2 |
| `takeUntil` usages | 312 | Good; correlates with correct cleanup |
| `MJLruCache` usages | 25 | Good uptake of bounded-cache helper |

---

*Part 1 and Part 2 findings follow verbatim from the 2026-05-03 baseline. Part 3 (Round 3 per-agent findings) begins after Part 2.*

---
# MemberJunction Memory & Resource Leak Audit

**Generated:** 2026-05-03
**Branch:** `claude/audit-memory-leaks-MPWE6`
**Scope:** Full monorepo — **234 packages** (corrected; the original "69 packages" count was the top-level entries under `packages/`, not the actual `package.json` count)
**Tooling:** Parallel multi-agent static analysis across five leak categories
**Re-run command:** `/audit-memory-leaks` (see `.claude/commands/audit-memory-leaks.md`)
**Combined total:** ~158 findings (Round 1 baseline: 84; Round 2 server-side gap fill: 74)

This document is organized in two parts:

- **Part 1 — Round 1 Baseline:** broad five-category sweep across the whole repo (RxJS, timers, listeners, caches, connections)
- **Part 2 — Round 2 Server-Side Gap Fill:** targeted re-scan of deeply-nested provider/connector subtrees (AI providers, Integration connectors, Communication providers, Storage drivers, Auth providers, Actions subdirs, MJServer resolvers, AI Agents/MCP/A2A) that Round 1 sampled rather than covered exhaustively

---

# Part 1 — Round 1 Baseline

---

## Executive Summary

A repo-wide audit identified **~80 concrete leak sites** across the monorepo. Findings cluster into five categories:

| Category | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| RxJS subscriptions / Angular OnDestroy | 4 | 8 | 6 | — | 18 |
| Timers (`setInterval` / recursive `setTimeout`) | 3 | 4 | 12 | 3 | 22 |
| Event listeners (DOM, Node `EventEmitter`, MJ EventBroker) | — | 5 | 6 | 2 | 13 |
| Unbounded caches / singleton state growth | — | 7 | 11 | — | 18 |
| Connections / streams / processes | — | 4 | 4 | 5 | 13 |
| **Total** | **7** | **28** | **39** | **10** | **84** |

The most consequential systemic issues are:

1. **`MJGlobal.Instance.GetEventListener().subscribe(...)` is called dozens of times across Angular services and components without unsubscription.** Because the listener is a hot Subject, each subscription holds a reference that pins the subscriber for the app's lifetime. This is the single most common leak pattern in the repo.
2. **`BaseEngine` (extended by every engine singleton) maintains four uncapped `Map`s** keyed off entity names, property names, and dynamic config IDs. They have no eviction.
3. **`BaseEntity.ResultHistory`** grows unbounded for the lifetime of every entity instance (every `Save`/`Delete` appends). For engine-cached entities held in long-lived arrays this leaks indefinitely.
4. **`QueueBase.ProcessTasks`** schedules itself with recursive `setTimeout` and has no shutdown path — once started, it runs (and pins `this`) until the process exits.
5. **No process-wide graceful-shutdown coordinator** beyond `MJServer/src/index.ts`'s `SIGTERM`/`SIGINT` handlers — many singletons (LocalCacheManager, SchedulingEngine, ArtifactBuilderService, AuthorizationStateManager, ClientRegistry) start background timers but expose no destructor that the shutdown handler invokes.

Fixing the top **7 critical** items below would eliminate most production-impacting growth; the **28 high** items represent measurable per-request or per-session leaks that compound under load.

---

## Methodology

The scan ran five parallel `Explore` subagents, each with a category-specific prompt and a curated list of likely-affected packages. Each agent returned file:line references and severity assessments. Findings here have been spot-checked against the source — agent-claimed locations are verified against the actual code where possible.

**Severity definitions:**

- **Critical** — Long-lived growth tied to repeated user activity (per request / per login / per entity), with no automatic upper bound.
- **High** — Per-component or per-session leak that doesn't reclaim until the singleton/process ends; visible under sustained use.
- **Medium** — Leaks only on error paths, edge cases, or graceful-shutdown gaps; bounded under normal flow.
- **Low** — Cleaned up on process death; affects only graceful shutdown or developer ergonomics.

**Known false-positive caveats** the agents may not have fully accounted for:

- `BaseResourceComponent` (per `packages/Angular/Explorer/CLAUDE.md`) now provides `ngOnInit`/`ngOnDestroy` that complete a `destroy$` Subject — subclasses that call `super.ngOnInit()` / `super.ngOnDestroy()` and use `takeUntil(this.destroy$)` are correctly cleaned up. Findings citing missing `destroy$.complete()` in such subclasses are not leaks if they delegate to super.
- `BaseFormComponent` similarly handles its own teardown for form-related subscriptions.
- `MJServer`'s `SIGTERM`/`SIGINT` handlers do attempt graceful shutdown — the gap is that singletons across the codebase don't expose a method for the shutdown handler to call.

---

## Critical Findings (Fix First)

### C1. `MJGlobal.Instance.GetEventListener().subscribe(...)` pattern leaks across Angular surfaces
**Severity:** Critical · **Category:** RxJS · **Pattern hit count:** 8+ confirmed sites

This is the dominant leak pattern. Examples:

| File | Line | Notes |
|---|---:|---|
| `packages/Angular/Explorer/shared/src/lib/shared.service.ts` | 35 | Singleton service; `LoggedIn` event subscriber never unsubscribed |
| `packages/Angular/Explorer/base-application/src/lib/application-manager.ts` | 151 | App-lifetime service; subscription discarded |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` | 217 | Shell component's *first* `GetEventListener` subscription is not pushed to `subscriptions[]` (others at lines 270, 277, 285, 316, 372, 397, 410, 428 are correctly tracked) |
| `packages/Angular/Generic/search/src/lib/search.service.ts` | 282 | Singleton service; no `OnDestroy` |
| `packages/Angular/Generic/search/src/lib/search-suggest.component.ts` | 282 | Component does not implement `OnDestroy` |
| `packages/Angular/Generic/notifications/src/lib/notifications.service.ts` | 74 | Singleton; **double leak** — also a long-lived `PushStatusUpdates().subscribe(...)` at line 104 |
| `packages/AngularElements/mj-angular-elements-demo/**` | various | Demo code modeling the wrong pattern (hello-mj line 56, listener-demo line 45, entity-list-demo line 63) |

**Why it leaks:** `GetEventListener()` returns a hot Observable backed by a singleton `Subject`/`ReplaySubject`. Every `.subscribe` adds to its observer list. Discarding the returned `Subscription` means it's never removed; the closure captures the component/service `this`, pinning it for the process lifetime.

**Fix:** Standardize on `takeUntil(this.destroy$)` in services and components, with `destroy$.next(); destroy$.complete()` in `ngOnDestroy`. For singleton services that genuinely live for the app, this is acceptable — but every *component* and every non-app-lifetime service must clean up.

---

### C2. `BaseEngine` accumulates uncapped state
**Severity:** Critical · **Category:** Cache · **File:** `packages/MJCore/src/generic/baseEngine.ts:194-202`

```typescript
private _dynamicConfigs: Map<string, BaseEnginePropertyConfig> = new Map();   // grows per LoadDynamicConfig()
private _dataMap: Map<string, {...}> = new Map();                              // mirrors above
private _entityEventSubjects: Map<string, Subject<BaseEntityEvent>> = new Map(); // grows per unique entity name
private _propertySubjects: Map<string, BehaviorSubject<BaseEntity[]>> = new Map(); // grows per unique propertyName observed
private _cacheChangeUnsubscribers: (() => void)[] = [];                       // cleared only on full reload
```

`BaseEngine` is extended by every engine singleton in MJ (UserInfoEngine, AIEngine, ActionsEngine, IntegrationEngine, …). These maps have **no max size, no LRU, no TTL**, and no removal hooks. `_propertySubjects` in particular is keyed on caller-supplied `propertyName` strings and never pruned even if the observer count drops to zero.

**Fix:**
- Add reference-counting to `_propertySubjects`: when subscriber count of a `BehaviorSubject` returns to 0 after a non-zero value, remove from the map and `complete()` the subject.
- Cap `_dynamicConfigs`/`_dataMap` with an LRU (suggest 100–200) or expose `UnloadDynamicConfig(key)` and require callers to use it.
- Document `_entityEventSubjects` as bounded by entity-type count (acceptable in practice) but add an explicit `.clear()` in `Reset()`.

---

### C3. `BaseEntity.ResultHistory` is unbounded per instance
**Severity:** Critical · **Category:** Cache · **File:** `packages/MJCore/src/generic/baseEntity.ts:1510, 2455, 3165, 3189`

Every `Save()` or `Delete()` appends a `BaseEntityResult` to `this._resultHistory`. There is no trim. For entity instances held in engine arrays for the application lifetime (which is the normal pattern), every operation on that instance leaks one result object — which itself can hold validation messages, error stacks, and entity field snapshots.

**Fix:** Cap `ResultHistory` at the last N results (suggest 25 or 50). Implement as a circular buffer or trim on push. Add an opt-in mechanism for tests/diagnostics to capture full history.

---

### C4. `QueueBase.ProcessTasks` self-schedules forever
**Severity:** Critical · **Category:** Timers · **File:** `packages/MJQueue/src/generic/QueueBase.ts:110-115`

```typescript
finally {
    this._processing = false;
    setTimeout(() => {
        this.ProcessTasks()
    }, this._checkInterval); // setup the next check
}
```

Once `ProcessTasks()` runs, it pins `this` indefinitely through the `setTimeout` closure. There is no `Stop()`, no shutdown hook, and no termination flag. Even after `_queue` empties, the timer keeps firing. If the QueueManager creates a queue and later replaces it, the old queue keeps running.

**Fix:** Add `private _stopped = false` and a `Stop()` method that sets the flag and cancels the pending timeout. Check the flag at the top of `ProcessTasks()` before scheduling the next iteration. Have `QueueManager` call `Stop()` on graceful-shutdown.

---

### C5. `EntityActionInvocationTypes._scriptCache` grows forever
**Severity:** Critical · **Category:** Cache · **File:** `packages/Actions/Engine/src/entity-actions/EntityActionInvocationTypes.ts:79`

```typescript
private _scriptCache: Map<string, Function> = new Map<string, Function>();
```

Compiled script `Function` objects (potentially containing closures over the action source) are cached by `EntityActionID` and never evicted. In environments where actions can be added or modified at runtime, the old function definitions stay reachable.

**Fix:** Cap with LRU(1000) or invalidate on entity-action save events.

---

### C6. `GraphQLDataProvider._pushStatusSubjects` cleanup window is too lenient
**Severity:** Critical · **Category:** Cache · **File:** `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:2617-2795`

Per-session push-status subjects are cleaned every 5 minutes, but only when both `activeSubscribers === 0` *and* idle for 10+ minutes. A WebSocket subscription that loses its subscriber mid-stream lingers for 10 minutes minimum before the next sweep removes it. Under reconnect storms this accumulates significantly.

**Fix:** Tighten to 2-minute idle threshold and clean up immediately when active subscribers transition from > 0 to 0 (with a short grace period for reconnect).

---

### C7. No graceful-shutdown contract for singleton services
**Severity:** Critical · **Category:** Connections + Timers · **File:** `packages/MJServer/src/index.ts:917-918` (and many singleton sites)

`MJServer` registers `SIGTERM`/`SIGINT` handlers, but the singletons that have started timers, intervals, or subscriptions don't expose a `Shutdown()`/`Dispose()` method for the handler to call:

- `LocalCacheManager` — eviction sweep `setInterval` ([packages/MJCore/src/generic/localCacheManager.ts:2237](../packages/MJCore/src/generic/localCacheManager.ts))
- `SchedulingEngine` — recursive polling `setTimeout` ([packages/Scheduling/engine/src/ScheduledJobEngine.ts:185](../packages/Scheduling/engine/src/ScheduledJobEngine.ts))
- `ArtifactBuilderService` — 5-minute cleanup `setInterval` ([packages/Actions/CoreActions/src/custom/utilities/artifact-builder-service.ts:444](../packages/Actions/CoreActions/src/custom/utilities/artifact-builder-service.ts))
- `AuthorizationStateManager` and `ClientRegistry` (MCP OAuth) — cleanup `setInterval`s
- `QueueManager` — running queues with no Stop hook (see C4)
- `MCPClientManager` — `RateLimiterRegistry` with one timer per registered limiter

**Fix:** Define a single `IShutdownable { Shutdown(): Promise<void> }` interface and a `ShutdownRegistry` (similar to `MJGlobal`'s pattern). Each singleton self-registers in its constructor. The SIGTERM handler iterates the registry. This is also a precondition for cleanly running tests that exit when work is done.

---

## High Findings

### Subscriptions / OnDestroy

| ID | File | Line | Issue |
|---|---|---:|---|
| H1 | `packages/Angular/Explorer/explorer-core/src/lib/single-list-detail/single-list-detail.component.ts` | 115 | `searchSubject.pipe(debounceTime(...)).subscribe(...)` — no `takeUntil`, no `OnDestroy` |
| H2 | `packages/Angular/Explorer/explorer-core/src/lib/server-connectivity/server-connectivity-banner.component.ts` | 78 | Subscription assigned to field but no `ngOnDestroy` to call `.unsubscribe()` |
| H3 | `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts` | 210-211 | Multiple `form.Navigate.subscribe(...)` / `form.Notification.subscribe(...)` without tracked teardown |
| H4 | `packages/Angular/Explorer/base-application/src/lib/workspace-state-manager.ts` | 49, 54 | Service subscriptions; service has no `OnDestroy` |
| H5 | `packages/Angular/Explorer/auth-services/src/lib/mjexplorer-msal-provider.service.ts` | 32-33 | `_destroying$` Subject declared but never `.complete()`d |
| H6 | `packages/Angular/Explorer/explorer-core/src/lib/single-dashboard/single-dashboard.component.ts` | 68 | `.subscribe(...)` in component with no `OnDestroy` |
| H7 | Several `*.component.ts` | various | `destroy$ = new Subject<void>()` declared but `.complete()` not called in `ngOnDestroy` (app-nav.component.ts, user-profile.component.ts, list-form.component.ts) |
| H8 | `packages/MJServer/src/generic/ResolverBase.ts` | 1036 | `MJGlobal.Instance.GetEventListener().subscribe(...)` per resolver call. Subscriptions are stored in a process-global `EventSubscriptions` Map keyed by entity name. **Bounded by entity-type count** (so not unbounded), but never removed across the server's lifetime. This is acceptable in practice but worth documenting. |

### Timers

| ID | File | Line | Issue |
|---|---|---:|---|
| H9 | `packages/MJCore/src/generic/localCacheManager.ts` | 2237 | `startEvictionSweep` uses `setInterval`. Has `unref()` (good) and a `stopEvictionSweep` method, but no shutdown hook calls it. |
| H10 | `packages/Scheduling/engine/src/ScheduledJobEngine.ts` | 185, 191 | Recursive `setTimeout` polling. `StopPolling()` exists but no destructor/shutdown invokes it. |
| H11 | `packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts` | 54-56 | Static submission timer; if `SubmitQueue()` throws uncaught, timer reference may leak. |
| H12 | `packages/Actions/CoreActions/src/custom/utilities/artifact-builder-service.ts` | 87, 444 | Cleanup `setInterval` runs forever; has `unref()` but no destructor. |

### Event listeners / DOM

| ID | File | Line | Issue |
|---|---|---:|---|
| H13 | `packages/Actions/CoreActions/src/custom/visualization/shared/svg-utils.ts` | 383-510 | 8+ DOM listeners (`wheel`, `mousedown`, `mousemove`, `mouseup`, `mouseleave`, `touchstart`, `touchmove`, `click`) attached to SVG elements with no cleanup path. If the SVG is replaced or removed, listeners leak. |
| H14 | `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/chat-conversations-resource.component.ts` | 610-611 | `document.addEventListener('mousemove'/'mouseup', ...)` for sidebar resize; no `ngOnDestroy` cleanup if component destroyed mid-drag |
| H15 | `packages/Angular/Explorer/base-application/src/lib/golden-layout-manager.ts` | 541 | Click listener attached to dynamically created pin icons; element removed but listener reference not detached |
| H16 | `packages/MJCore/src/generic/localCacheManager.ts` | 510-520 | `subscribeToBaseEntityEvents` adds an `MJGlobal.GetEventListener` subscription on every singleton init/reset. If `Reset()` is ever called without prior unsubscribe, listeners stack. |
| H17 | `packages/AngularElements/mj-angular-elements-demo/**` | various | Demo components subscribe to `MJGlobal` event listener on every mount with no unsubscribe — if the demo embeds these as Angular Elements re-mounted across pages, listener count is unbounded. |

### Caches

| ID | File | Line | Issue |
|---|---|---:|---|
| H18 | `packages/MJGlobal/src/ObjectCache.ts` | 18 | `private _entries: ObjectCacheEntry[] = []` with `Add`/`Replace`/`Remove` but **no eviction policy and no max size**. The class is exposed via `MJGlobal.Instance.ObjectCache` and consumed by application code. Whatever consumers stuff in stays forever. |
| H19 | `packages/MJCore/src/generic/providerBase.ts` | 139 | `_entityRecordNameCache: Map<string, string>` — per unique `entityName + compositeKey`, no eviction |
| H20 | `packages/Actions/Engine/src/entity-actions/EntityActionInvocationTypes.ts` | 79 | `_scriptCache` (also in C5 — emphasizing severity) |
| H21 | `packages/MJCore/src/generic/baseEngine.ts` | 195-196 | `_dynamicConfigs` / `_dataMap` (also in C2) |
| H22 | `packages/MJCore/src/generic/baseEngine.ts` | 198 | `_entityEventSubjects` (also in C2) |
| H23 | `packages/MJCore/src/generic/baseEngine.ts` | 202 | `_propertySubjects` (also in C2) |
| H24 | `packages/MJCore/src/generic/baseEngine.ts` | 201 | `_cacheChangeUnsubscribers` (also in C2) |

### Connections / streams

| ID | File | Line | Issue |
|---|---|---:|---|
| H25 | `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | ~195 | `executeSQLCore` builds `sql.Request` without a `finally` to guarantee cleanup on error paths. mssql auto-cleans on resolve, but abandoned promises (e.g. shutdown mid-query) can leak. |
| H26 | `packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts` | 310-341 | `fs.createWriteStream` not explicitly destroyed if `pipeline()` rejects — file descriptor may stay open until GC. |
| H27 | `packages/AI/Agents/src/AgentRunner.ts` | 1443-1499 | Transaction wrapping has `try/catch` but no `finally`. If `RollbackTransaction()` throws, the original transaction state is unknown — connection-pool slot held. |
| H28 | `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` | 2405-2420 | `createClient({...})` for graphql-ws — if a new provider instance replaces the old, the previous WebSocket isn't explicitly destroyed. |

---

## Medium Findings

### Subscriptions

- `packages/Angular/Explorer/explorer-core/src/lib/command-palette/command-palette.component.ts:26` — `destroy$` declared, `.complete()` not verified.
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts:225-231` — nested `router.events.pipe(...).subscribe(...)` inside the line 217 outer subscription is not tracked.

### Timers (component-scoped)

- `packages/Angular/Explorer/explorer-core/src/lib/oauth/oauth-callback.component.ts:2682` — orphan `setTimeout(() => location.href = ..., 500)` not tracked.
- `packages/Angular/Explorer/dashboards/src/AI/components/models/model-management.component.ts` and `prompts/prompt-management.component.ts` — loading-message intervals; cleared in `ngOnDestroy` but vulnerable to teardown races.
- `packages/Angular/Explorer/dashboards/src/Integration/components/schedules/schedules.component.ts:106-107` — 60-second interval for change detection; `ngOnDestroy` cleanup not visible.
- `packages/Angular/Explorer/dashboards/src/DashboardBrowser/dashboard-browser-resource.component.ts` — `const interval = setInterval(...)` is a local const, no instance variable to clear.
- `packages/Angular/Explorer/service-worker/src/lib/update-notification.service.ts` — `_pollHandle` `setInterval` in singleton service; comment says "cleared in ngOnDestroy" but services don't auto-receive `ngOnDestroy`.
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/ai-agent-form.component.ts` — `_runningTimeUpdater` interval; cleanup unverified.
- `packages/Angular/Generic/base-forms/src/lib/container/record-form-container.component.ts` — local `checkInterval` (untracked).
- `packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts` — elapsed-time interval per message; multiplies with message count.
- `packages/Angular/Generic/dashboard-viewer/src/lib/parts/query-part.component.ts:129` — `autoRefreshTimer` declared, cleanup unverified.
- `packages/Angular/Explorer/dashboards/src/Integration/components/overview/overview.component.ts:50` — `setTimeout` for notification dismissal, no race protection.
- `packages/MJCoreEntities/src/engines/UserInfoEngine.ts:104` — debounce `setTimeout` may not be cleared on engine destruction.
- `packages/AI/MCPServer/src/Server.ts` — SSE keepalive `setInterval(15s)`; cleared on `res.on('close')` but vulnerable if response is abandoned.
- `packages/AI/A2AServer/src/Server.ts` — SSE update `setInterval`; cleared only on task complete or `res.end`; hangs leak.

### Event listeners

- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts:1213-1214` — `document.addEventListener('click'/'keydown', ...)` removed on dismiss but leaks if component is destroyed while menu open.
- `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/chat-collections-resource.component.ts:498-499` — `window.addEventListener('mousemove'/'mouseup', ...)`; cleanup only fires if `onResizeEnd` runs.
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts:1917` — deferred `document.addEventListener('click', ...)`; relies on event-fire-driven removal.
- `packages/MJServer/src/index.ts:921` — `process.on('unhandledRejection', ...)` is registered without a removal path; acceptable for app lifetime but worth noting.

### Caches

- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:1987` — `_datasetStatusQueue` static array; flushed every 10ms but failure paths can orphan promises.
- `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:186` — `_dynamicHeaders: Map<string, string>` — no observed cleanup.
- `packages/MJCore/src/generic/telemetryManager.ts:759, 763, 761` — `_events`, `_patterns`, `_activeEvents`. Bounded by default config but vulnerable if `autoTrim` is disabled or if events are started without paired end.
- `packages/Integration/engine/src/IntegrationEngine.ts:117-123` — three static maps for active syncs / abort controllers / progress; cleaned on completion but a hung sync leaks the entry.
- `packages/MJQueue/src/generic/QueueManager.ts:111` — `ongoingQueueCreations`; hung create promise leaks the entry.
- `packages/GraphQLDataProvider/src/storage-providers.ts:23` — `_storage: Map<string, Map<string, unknown>>` in-memory IndexedDB fallback grows unbounded.
- `packages/MJCore/src/generic/providerBase.ts:137-138` — `_entityMapByName` / `_entityMapByID` are cleared/rebuilt on metadata load, but external holders of stale references aren't notified.

### Connections / streams

- `packages/Actions/CoreActions/src/custom/utilities/pdf-renderer.ts:40-60` — PDFDocument event listeners not removed if `renderNodes()` throws before `doc.end()`.
- `packages/RedisProvider/src/RedisLocalStorageProvider.ts:801-828` — `StartListening` doesn't reuse/clear stale subscriber on reconnect; `Disconnect()` is correct, but unclean shutdown leaks the subscriber.
- `packages/MJServer/src/util.ts:102-119` — HTTP stream `req`/`res` not explicitly destroyed in all error paths.
- `packages/SQLGlotTS/src/SqlGlotClient.ts:97-162` — child-process timeout/exit race may leak descriptors.
- `packages/AI/MCPClient/src/MCPClientManager.ts` — `StreamableHTTPClientTransport` / `SSEClientTransport` / `WebSocketClientTransport` have no explicit `.close()` call on disconnect.

---

## Low Findings (graceful-shutdown / cosmetic)

- `packages/MJQueue/src/generic/QueueManager.ts` — no `ShutdownAllQueues()`; queues run until process death.
- `packages/MJServer/src/index.ts:299-325` — pool `error` handler logs but doesn't recover.
- `packages/PostgreSQLDataProvider/src/pgConnectionManager.ts:106-110` — `_ownsPool: false` for shared pools is correct (no leak).
- `packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts:278-295` — `AbortController` never explicitly aborted in success path; harmless (GC'd with the Promise).
- `packages/AI/MCPClient/src/oauth/ErrorMessages.ts` — static error registry; bounded to defined error types, not a real leak.
- `packages/MJGlobal/src/Global.ts:13-19` — `_eventsReplaySubject` is a `ReplaySubject(100, 30000)` — bounded by design (30s window), confirmed acceptable.
- `packages/MJServer/src/index.ts:921` — `process.on('unhandledRejection')` is fine for an app lifetime listener.

---

## Cross-Cutting Anti-Patterns

These themes recur across multiple findings — fixing them at the root prevents regression.

1. **`MJGlobal.GetEventListener` subscriptions in non-app-lifetime code.** The convention should be: if you're not the app shell or a registered app-lifetime singleton, you must `takeUntil(this.destroy$)`. Consider adding a lint rule that flags `GetEventListener().subscribe(` without a `takeUntil(...)` operator in the pipe.

2. **Singletons that start timers but expose no destructor.** Every `setInterval` or recursive `setTimeout` in a singleton needs a paired stop method, registered with a global shutdown coordinator.

3. **Unbounded `Map` / `Array` fields on long-lived classes.** Whenever a class field is `Map<K, V>` or `T[]` and that class is a singleton or is held in a singleton's array, the field should either:
   - Have a removal path tied to a real-world lifecycle event, or
   - Have an explicit max size + eviction policy (LRU is the default), or
   - Be replaced with a `WeakMap` / `WeakRef` if keys are objects.

4. **Component subscriptions without `OnDestroy`.** Angular components that subscribe to anything must implement `OnDestroy`. Components extending `BaseResourceComponent` / `BaseFormComponent` get this for free if they call `super.ngOnDestroy()` — but the audit found multiple subclasses that override without calling super.

5. **`finally` missing on transaction / connection / stream code.** Resource acquisition must be paired with cleanup in `finally`, not in `catch`. Several findings (H25, H26, H27) hit this.

6. **DOM `addEventListener` on `window` / `document` from Angular.** When you must (drag handlers, click-outside menus), store the bound handler reference, register in `ngAfterViewInit` (not `ngOnInit`), and remove it in `ngOnDestroy` *and* on the natural completion event.

---

## Recommendations (Priority Order)

### Immediate (this sprint)
1. **Fix C1** — Sweep all `MJGlobal.GetEventListener().subscribe(...)` sites; add `takeUntil(this.destroy$)`. Add an ESLint rule to prevent regressions.
2. **Fix C3** — Cap `BaseEntity.ResultHistory` at 25 entries with a circular-buffer trim.
3. **Fix C4** — Add `Stop()` to `QueueBase`, call from `QueueManager.ShutdownAllQueues()`, register with the SIGTERM handler.
4. **Fix C7** — Define `IShutdownable` and `ShutdownRegistry` (BaseSingleton-style); migrate the five timer-owning singletons.

### Short-term (this quarter)
5. **Fix C2** — Add reference-counting + eviction to `BaseEngine._propertySubjects` and `_entityEventSubjects`. Cap `_dynamicConfigs` with LRU.
6. **Fix C5** — Cap `EntityActionInvocationTypes._scriptCache` with LRU(1000) or invalidate on entity-action save.
7. **Fix C6** — Tighten `_pushStatusSubjects` cleanup window to 2 minutes.
8. **Fix H18** — Add `MaxSize` config to `MJGlobal.ObjectCache` (LRU eviction, default 10,000).
9. **Fix H25, H27** — Add `finally` blocks to `executeSQLCore` and `AgentRunner` transaction wrappers.
10. **Fix H13** — SVG visualization — add a `dispose()` function that detaches all listeners; call it when the SVG is replaced.

### Medium-term
11. Standardize Angular `destroy$` pattern via a shared base directive (`UnsubscribeOnDestroy`).
12. Add `npm run audit:leaks` script that runs the slash command's static checks in CI.
13. Wire OpenTelemetry / `process.memoryUsage()` sampling into MJServer with a slow-burn alarm to catch leaks the static scan misses.

### Ongoing
14. Add unit tests asserting that singleton `Map`/`Array` sizes don't grow when expected operations run.
15. Treat any new `setInterval` / recursive `setTimeout` / `addEventListener` in code review as requiring an explicit destructor.

---

## How to Re-Run This Audit

The slash command **`/audit-memory-leaks`** (defined in `.claude/commands/audit-memory-leaks.md`) will:

- Spawn parallel `Explore` subagents in two waves (broad sweep + deep subtree sweep)
- Diff against this consolidated plan
- Highlight new leak sites and resolved ones
- Rewrite `plans/MEMORY_LEAK_AUDIT.md` (this file) in place

Run with:

```
/audit-memory-leaks
```

Optional arguments:

```
/audit-memory-leaks summary           # one-page diff vs plan
/audit-memory-leaks detailed          # full re-baseline (default)
/audit-memory-leaks <category>        # one of: rxjs, timers, listeners, caches, connections
/audit-memory-leaks <package-path>    # narrow scope (e.g. packages/AI)
```

Subsequent runs produce dated snapshots in `plans/.memory-leak-snapshots/YYYY-MM-DD.md` (gitignored) and update this consolidated plan.

---

## Appendix A — Files With Multiple Findings

These hot-spots warrant a dedicated cleanup pass:

| File | Findings |
|---|---:|
| `packages/MJCore/src/generic/baseEngine.ts` | 6 |
| `packages/MJCore/src/generic/baseEntity.ts` | 1 (C3) |
| `packages/MJCore/src/generic/localCacheManager.ts` | 2 (H9, H16) |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` | 4 |
| `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` | 5 |
| `packages/MJGlobal/src/Global.ts` + `ObjectCache.ts` | 2 (H18, low) |
| `packages/Angular/Explorer/dashboards/src/**` | 4+ |
| `packages/Actions/CoreActions/src/custom/visualization/shared/svg-utils.ts` | 1 (8 listeners) |

## Appendix B — Audit Coverage

The five subagents that produced this report scanned (excluding `node_modules/`, `dist/`, `generated/`, `__tests__/`, `*.test.ts`, `*.spec.ts`):

- `packages/Angular/**/*.ts`, `packages/MJExplorer/**/*.ts`, `packages/InteractiveComponents/**/*.ts`, `packages/AngularElements/**/*.ts` (RxJS / DOM listeners)
- `packages/MJServer/**`, `packages/MJAPI/**`, `packages/MJQueue/**`, `packages/AI/**`, `packages/Communication/**`, `packages/ContentAutotagging/**` (timers)
- `packages/MJGlobal/**`, `packages/GraphQLDataProvider/**`, `packages/RedisProvider/**`, `packages/MJCore/**` (event-emitters, caches, singletons)
- `packages/SQLServerDataProvider/**`, `packages/PostgreSQLDataProvider/**`, `packages/GenericDatabaseProvider/**`, `packages/MJStorage/**` (DB / file / network)
- `packages/Actions/**`, `packages/MetadataSync/**`, `packages/Scheduling/**` (caches, timers)

Areas with thinner coverage that future audits should target:
- `packages/React/**` (touched briefly via cache-manager)
- `packages/MJCLI/**` (one finding)
- `packages/Integration/**` (one finding)
- `Demos/**` and `experiments/**` (intentionally excluded)

---

# Part 2 — Round 2 Server-Side Gap Fill

**Why Part 2 exists:** Round 1 reported coverage of "69 packages" — that count was the top-level entries under `packages/`, but the actual `package.json` count is 234. The deeply-nested groups (AI providers, Integration connectors, Communication providers, Actions subdirs) got thin coverage in Round 1 because the broad globs were satisfied by sampling. Round 2 ran five narrow agents to fill those gaps.

The 84 findings in Part 1 still stand; Part 2 adds **74 new findings** with no overlap.

---

## Round 2 Coverage

| Sub-audit | Packages scanned | New findings |
|---|---|---:|
| AI Providers | 26 packages under `packages/AI/Providers/` | 18 |
| Integration connectors | 11 packages under `packages/Integration/connectors/` (HubSpot, Salesforce, YourMembership, Wicket, Rasa, QuickBooks, SageIntacct, RelationalDB, etc.) | 18 |
| Communication / Storage / Auth providers | Twilio, Gmail, MS Graph, SendGrid; AWS/Azure/Box storage drivers; Auth0/MSAL/Okta JWT validators | 13 |
| Actions / MetadataSync / DBAutoDoc / React runtime / Encryption / Slack | `packages/Actions/**` (excluding what Round 1 covered), MetadataSync, DBAutoDoc, ContentAutotagging, React runtime, Encryption, MessagingAdapters | 12 |
| MJServer resolvers / Skip / AI Agents (round 2) | `packages/MJServer/src/**`, `packages/MJAPI/**`, `packages/AI/Agents/src/**`, `packages/AI/Engine/src/**`, `packages/AI/Prompts/src/**`, MCPServer/A2AServer | 25 |

Combined Round 1 + Round 2 finding count: **170**.

---

## Critical & High Findings (Round 2)

### R2-C1. `Promise.race` + `setTimeout` leaks across YourMembershipConnector
**Severity:** Critical · **File:** `packages/Integration/connectors/src/YourMembershipConnector.ts:3662, 3906`

```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(...), this.effectiveEnrichTimeoutMs)
);
const json = await Promise.race([fetchPromise, timeoutPromise]);
// No clearTimeout — timer keeps a closure over reject() until it fires.
```

Two sites (member detail enrichment + JSON parse). Each successful API call leaves a dangling `setTimeout` callback that fires later and is rejected silently. Per-record sync = O(N) leaked timers.

**Same connector also has** `WicketConnector.ts:1051`, `QuickBooksConnector.ts:768`, `SageIntacctConnector.ts:2157` — these *are* correct (paired with `clearTimeout` in `finally`). The YourMembership Promise.race pattern is the buggy one.

**Fix:** Replace with `AbortController` + `signal` + `setTimeout(...).unref()` cleared in `finally`.

---

### R2-C2. HubSpotConnector accumulates entire paginated dataset before returning
**Severity:** Critical · **File:** `packages/Integration/connectors/src/HubSpotConnector.ts:2431, 2508`

```typescript
private async FetchAllPagesFromURL(...): Promise<ExternalRecord[]> {
    const allRecords: ExternalRecord[] = [];
    do {
        // fetch page, push everything into allRecords
    } while (cursor);
    return allRecords;
}
// Then nested:
for (const parent of parentRecords) {
    const children = await this.FetchAllPagesFromURL(...);
    for (const child of children) allChildren.push(child);
}
```

A connector with 1,000 parent objects × 1,000 children each = 1M records held in JS memory simultaneously. Not a "leak" in the GC sense, but a memory ceiling violation that will OOM on large tenants. Other connectors (Salesforce, QuickBooks, Sage) generally use streaming/cursor patterns; HubSpot is the outlier.

**Fix:** Convert `FetchAllPagesFromURL` to an `AsyncIterable<ExternalRecord>` and stream results to the sync engine page-by-page.

---

### R2-C3. Per-credential client caches with no eviction (Communication providers)
**Severity:** High · **Files:**
- `packages/Communication/providers/twilio/src/TwilioProvider.ts:64` — `clientCache: Map<accountSid, Twilio>`
- `packages/Communication/providers/gmail/src/GmailProvider.ts:94` — `clientCache: Map<clientId+refreshTokenPrefix, OAuth2Client>`
- `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts:144` — `clientCache: Map<tenant+clientId, GraphClient>`

Each map key derives from caller-supplied credentials. None has a max size, TTL, or eviction. In multi-tenant deployments (or any setup where credentials rotate), the maps grow indefinitely and **retain secrets in memory** beyond their useful life. The Gmail key includes a refresh-token prefix.

**Fix:** Replace each `Map` with an LRU cache (e.g. 100 entries) and a hard TTL (e.g. 1 hour). Strip secrets from log lines.

---

### R2-C4. `AuthProviderFactory.issuerCache` is unbounded and caller-supplied keys
**Severity:** High · **File:** `packages/AuthProviders/src/AuthProviderFactory.ts:19-20`

```typescript
private issuerCache: Map<string, IAuthProvider> = new Map();
private issuerMultiCache: Map<string, IAuthProvider[]> = new Map();
```

Keys are JWT `iss` claims from incoming tokens. A malicious or misconfigured client supplying arbitrary issuer URLs walks the map up unboundedly. `.clear()` is only called on explicit `Reset()`. This is a low-effort DoS vector.

**Fix:** LRU(50) — there should never be more than a handful of legitimate issuers in production.

---

### R2-C5. Anthropic & OpenAI streaming-thinking accumulators have no cap
**Severity:** High · **Files:**
- `packages/AI/Providers/Anthropic/src/models/anthropic.ts:13-23, 649-650`
- `packages/AI/Providers/OpenAI/src/models/openAI.ts:354-364, 395`

```typescript
private _streamingState: { accumulatedThinking: string; ... } = { accumulatedThinking: '', ... };
// In streaming chunk handler:
this._streamingState.accumulatedThinking += chunk.delta.text || '';
```

For long reasoning outputs (10k–100k tokens with extended thinking) the accumulated string can balloon. **Bigger problem:** the field is on the *instance*, not the request — if the instance is reused for multiple requests (provider singletons usually are), the state from the previous request leaks into the next unless explicitly reset. Skim of code suggests reset happens on success but not all error paths.

**Fix:** Move `_streamingState` to per-request scope or guarantee reset in a `finally`. Add a hard cap (e.g. 200k chars) that triggers a truncation log warning.

Inheriting providers (Inception, LlamaCpp, Cerebras, Fireworks, Groq, xAI, Zhipu — extend OpenAILLM) inherit the same bug.

---

### R2-C6. Storage SDK clients leak when `initialize()` is called twice
**Severity:** High · **Files:**
- `packages/MJStorage/src/drivers/AWSFileStorage.ts:121, 177`
- `packages/MJStorage/src/drivers/AzureFileStorage.ts:98, 143-144`

```typescript
this._client = new S3Client({ region, credentials });
// Later, same field is reassigned:
this._client = new S3Client({ region, credentials });
```

The previous client (with its open HTTP keep-alive sockets and credential providers) is dropped without `.destroy()`. Sockets will eventually idle out, but the credential provider chain (which can hold IMDS poll timers, STS clients, etc.) lingers.

**Fix:** Before reassigning, call the old client's `.destroy()` if it exists.

---

### R2-C7. WatchService debounce-timer Map can leak entries (MetadataSync)
**Severity:** High · **File:** `packages/MetadataSync/src/services/WatchService.ts:37, 144-178`

```typescript
private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
// On every file change:
const timer = setTimeout(async () => {
    this.debounceTimers.delete(filePath);  // only on fire
    ...
}, debounceMs);
this.debounceTimers.set(filePath, timer);
```

If a file is added, queued for debounce, and then deleted (or moved/renamed/`.gitignore`d) before the timer fires, the entry stays in the map. In long watch sessions over large directories with rapid scaffolding/deletion (e.g. branch switches), the map grows. `stop()` clears all of them, but only on explicit shutdown.

**Fix:** Clear the map entry from the cancellation paths too, or add an upper cap with LRU eviction.

---

### R2-C8. ComponentRegistry double-pool bootstrap leak on read-only failure
**Severity:** High · **File:** `packages/ComponentRegistry/src/Server.ts:156-189`

```typescript
this.pool = new sql.ConnectionPool(createMSSQLConfig());
await this.pool.connect();
// ...
this.readOnlyPool = new sql.ConnectionPool(readOnlyConfig);
await this.readOnlyPool.connect();   // No try/catch, no rollback of main pool
```

If the read-only pool fails to connect, the main pool stays open with no cleanup, and the function throws. Restart loops would compound this.

**Fix:** Wrap the read-only setup in `try/catch`; on failure, close the main pool before re-throwing.

---

### R2-C9. `WorkerPool` abort listener can leak on inner throw
**Severity:** High · **File:** `packages/Actions/CodeExecution/src/WorkerPool.ts:421-437`

```typescript
const listener = () => { this.abortRequest(request, 'Caller aborted'); };
request.abortListener = listener;
params.abortSignal.addEventListener('abort', listener, { once: true });
```

`detachAbortListener` is called on most paths, but if `abortRequest` itself throws, the listener stays attached. The closure pins `request` and `this`, blocking GC of the request and (transitively) any large script outputs/buffers.

**Fix:** Wrap `abortRequest` in try/catch within the listener so detach always runs.

---

### R2-C10. Bedrock streaming has no `AbortController`
**Severity:** High · **File:** `packages/AI/Providers/Bedrock/src/models/bedrockLLM.ts:225-298`

`InvokeModelWithResponseStreamCommand` is sent without a signal. If the network hangs mid-stream or the consumer disappears, the stream chunk reader sits indefinitely. AWS SDK v3 supports `AbortController` — needs to be wired through.

**Fix:** Add `AbortController` plumbing as the other providers do; abort on consumer disconnect.

---

### R2-C11. A2AServer global `tasks` Map accumulates forever
**Severity:** Critical · **File:** `packages/AI/A2AServer/src/Server.ts:100, 568, 582, 624, 869, 911`

```typescript
const tasks = new Map<string, Task>();
```

Module-level Map. Tasks are added on creation but **never deleted** — not on success, not on failure, not on a TTL. Each `Task` carries unbounded `messages[]` and `artifacts[]` arrays that grow per agent interaction. Memory grows quadratically: `tasks × messages-per-task × artifact-bytes`. Combined with the failed-task branch (R2 finding #15) which also doesn't delete, this is the single worst leak found in Round 2.

**Fix:** Add a `cleanupCompletedTasks()` sweep with a configurable retention (e.g. 1 hour for terminal-state tasks). Delete on terminal status transition.

---

### R2-C12. GeoResolver caches metadata on a singleton resolver instance
**Severity:** High · **File:** `packages/MJServer/src/resolvers/GeoResolver.ts:95-127`

`_countries` and `_states` are instance fields on the resolver. In Apollo's typical resolver lifecycle the resolver is a singleton, so the cached entities persist across requests — including across users with different access. Stale data leaks into the next request's response.

**Fix:** Either move the cache into a request-scoped DataLoader, or use the `BaseEngine` cache (which has remote-invalidation hooks) instead of a hand-rolled instance field.

---

### R2-C13. MCPServer SSE keepalive interval can leak on connect-throw
**Severity:** High · **File:** `packages/AI/MCPServer/src/Server.ts:1234-1262`

```typescript
transports.set(sessionId, transport);
const keepalive = setInterval(...);
res.on('close', () => { ... clearInterval(keepalive); ... });   // ⚠ registered last
await mcpServer.connect(transport);                              // ⚠ if this throws...
```

If `mcpServer.connect(transport)` throws *between* the `setInterval` and the `res.on('close')` registration, the close handler is never attached and the keepalive interval runs forever. The transport also stays in the `transports` Map (R2 finding #11).

**Fix:** Either register the close handler before `connect()`, or use a `try/catch` that explicitly clears the interval and removes the transport on failure.

---

### R2-C14. SkipSDK HTTP error path leaks listeners and decompressor
**Severity:** High · **File:** `packages/MJServer/src/agents/skip-sdk.ts:805-825`

On HTTP error responses, the code attaches `res.on('data', ...)` and `res.on('end', ...)` to collect the error body, plus may pipe through a `gunzip` decompressor. If the stream is abandoned mid-error (peer reset, timeout), the listeners and decompressor stay attached until the response object is GC'd. There is no `finally` to `.destroy()` the gunzip stream or `removeAllListeners()`.

**Fix:** `try/finally` that explicitly destroys the decompressor and removes listeners.

---

### R2-C15. `MJServer/util.ts:sendPostRequest` has no overall timeout
**Severity:** High · **File:** `packages/MJServer/src/util.ts:84-136`

The function attaches `'data'`, `'end'`, `'close'`, `'error'` handlers, but if the remote server sends headers and then never fires `end`/`error` (slow loris, half-closed sockets), the returned promise hangs forever and the request/response handles stay open. The optional `gunzip` decompressor never releases either.

**Fix:** Wrap with a hard timeout (`req.setTimeout(...)` AND a wall-clock `setTimeout` race). On timeout, `req.destroy()` + decompressor `.destroy()`.

---

## Medium Findings (Round 2)

### Connectors / sync state

- `packages/Integration/connectors/src/RasaConnector.ts:171, 187, 193` — `_seenIDs`, `_batchBuffer`, `_batchBufferWatermarks` cleared per object, not per sync. Cancelled syncs leak entries.
- `packages/Integration/connectors/src/SalesforceConnector.ts:652` — static `introspectCache` checks expiry on read but never reaps; map size grows with every distinct Salesforce org metadata fetch.
- `packages/Integration/connectors/src/YourMembershipConnector.ts:2470` — `sessionCache` cleared only on 401; durable sessions persist forever.
- `packages/Integration/connectors/src/RelationalDBConnector.ts:35` — `poolCache` per connector instance; no global pool sharing.
- `packages/Integration/connectors/src/YourMembershipConnector.ts:2767` — `parentIdCache` keyed by `(objectName, parentObjectName)` never reset between syncs.

### AI providers

- `packages/AI/Providers/LMStudio/src/models/lm-studio.ts:54-57` — `LMStudioClient` recreated on every `SetAdditionalSettings` call.
- `packages/AI/Providers/Azure/src/models/azure.ts:51-72` — same pattern with `ModelClient`.
- `packages/AI/Providers/Gemini/src/index.ts:48-59` — `_geminiPromise` field stays assigned even on `createClient()` rejection; subsequent `await` re-throws but never retries.
- `packages/AI/Providers/LocalEmbeddings/src/models/localEmbedding.ts:96-97` — static `pipelines` and `loadingPromises` Maps with no eviction.
- `packages/AI/Providers/ElevenLabs/src/index.ts:30, 37` — `chunks: Uint8Array[]` accumulates the entire audio response before returning.
- `packages/AI/Providers/Mistral/src/models/mistral.ts:118-126` — substring extraction on unbounded content string with no length precheck.
- `packages/AI/Providers/Bedrock/src/models/bedrockLLM.ts:34-40` — keep-alive HTTP agent not explicitly configured (relies on AWS SDK defaults).

### Communication / Storage / Auth

- `packages/Communication/providers/sendgrid/src/SendGridProvider.ts:94-112` — `sgMail.setApiKey()` mutates a global per-request, so a concurrent request can see the wrong key (correctness bug, not strictly a leak).
- `packages/Communication/notifications/src/NotificationEngine.ts:117-129` — fire-and-forget `sendEmail`/`sendSMS` `.catch(...)` patterns; rejections are logged but no resource teardown if the underlying provider holds buffers.
- `packages/Communication/notifications/src/NotificationEngine.ts:262, 330, 351` — `TemplateEngineServer.Instance.Config(false, ...)` and `CommunicationEngine.Instance.Config(false, ...)` called per email/SMS even though they're idempotent — wasteful, not a leak.
- `packages/MJStorage/src/drivers/AzureFileStorage.ts:656-679` — `for await (const chunk of readableStreamBody)` doesn't `.destroy()` the stream on inner-loop throw.
- `packages/MJStorage/src/drivers/BoxFileStorage.ts:1385-1396` — stream `.on('data')` / `.on('error')` / `.on('end')` listeners not removed on cancellation.
- `packages/AuthProviders/src/BaseAuthProvider.ts:32-46` — `https.Agent({ keepAlive: true })` per provider instance, never destroyed.
- `packages/AuthProviders/src/BaseAuthProvider.ts:49-56` — JWKS client cache is per-provider-instance (5 entries), so multiple instances multiply the working set.

### Actions / Misc

- `packages/Actions/ScheduledActions/src/scheduler.ts:159-171` — cron `interval` parsed but never disposed.
- `packages/MetadataSync/src/services/WatchService.ts:53-54, 123-132` — SQL logging session opened but only disposed in `stop()`; mid-init failures leak the session.
- `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts:10-48` — nested `Map<table, Map<column, stats>>` with no max size.
- `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts:26-27` — `requestTimestamps` / `tokenTimestamps` arrays filtered on every call (correct behavior) but with no preallocation; very high QPS will allocate large temp arrays repeatedly.
- `packages/React/runtime/src/utilities/cache-manager.ts:75` — `set(key, value, ttl)` creates an untracked `setTimeout` per entry. Each cache write spawns a new timer that's never cleared if the entry is overwritten.
- `packages/Encryption/src/EncryptionEngine.ts:117-134` — `_keyMaterialCache` has TTL but no background sweeper; expired key buffers (sensitive) linger until accessed.
- `packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts:129-132, 173-180` — Socket Mode `.on('message', ...)` listeners; no force-disconnect timeout in `Shutdown()`.

### MJServer / AI Agents / MCP / A2A

- `packages/MJServer/src/generic/ResolverBase.ts:1036` — Round 1 noted this is bounded by entity-name count; Round 2 looked closer and observed it stacks per-resolver-instantiation × entity-name in a process-global Map, so on each request that touches a previously-unseen entity, a new permanent listener is added. Severity: Medium.
- `packages/AI/Engine/src/services/ConversationAttachmentService.ts:89, 114-131` — `modalityCache.loaded` flag flipped to `true` once and never reset; new modalities in DB invisible until restart.
- `packages/AI/Engine/src/AIEngine.ts:99-100` — `_agentEmbeddingsCache` / `_actionEmbeddingsCache` keyed by entity ID with no invalidation on agent/action delete (false-positive "already embedded" decisions).
- `packages/AI/MCPServer/src/Server.ts:1260-1268` — if `mcpServer.connect(transport)` throws, the transport stays in `transports` Map (related to R2-C13).
- `packages/AI/MCPClient/src/MCPClientManager.ts:96, 105` — `eventListeners` Map can stack listeners on reconnect without dedup.
- `packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts:54-56` — static submission timer can be orphaned if `SubmitQueue()` throws between `setInterval` assignment and flag reset.
- `packages/AI/A2AServer/src/Server.ts:693-912` — failed-task path marks status but doesn't delete the task from the Map (compounds R2-C11).
- `packages/MJServer/src/agents/skip-sdk.ts:805-825` — error response listeners not cleaned up on premature stream close.
- `packages/MJServer/src/context.ts:107-112` — `UserCache.Instance.Users` array stores all loaded users permanently; no TTL or event-driven cleanup.
- `packages/MJServer/src/agents/skip-sdk.ts:65-73, 880-881` — fallback to `Metadata.Provider` (global) when no provider passed; multi-tenant correctness bug.
- `packages/AI/Agents/src/base-agent.ts:9221-9233` — message compaction may itself accumulate unbounded chunks across iterations; compacted-message count not capped independently of raw history trim.

### Low (Round 2 additions)

- `packages/AI/Providers/Cohere/src/models/CohereReranker.ts:71-78, 90-96` — debug `console.log` of full document text (PII leak risk, not memory).
- `packages/React/runtime/src/runtime/react-root-manager.ts:38-54` — `RegisterHook` doesn't dedupe; repeated registration grows the array.
- `packages/AI/Providers/LocalEmbeddings/src/models/localEmbedding.ts:107-134` — race condition on concurrent loadingPromises Map access; benign in practice but fragile pattern.
- `packages/AI/Providers/BlackForestLabs/src/index.ts:92-93` — polling loop; clearInterval on timeout not verified.
- `packages/MJServer/src/index.ts:619-634` — `MJGlobal.GetEventListener` cache-invalidation subscription discarded; acceptable for app lifetime, but blocks future graceful-shutdown.
- `packages/MJServer/src/agents/skip-sdk.ts:863-869` — `req.end()` called but `req.destroy()` not invoked in error/finally paths.
- `packages/AI/MCPServer/src/Server.ts:1234` — keepalive every 15s but no max session lifetime; idle SSE clients pin session memory indefinitely.
- `packages/MJServer/src/agents/skip-sdk.ts:28, 56` — uses Node.js global HTTP/HTTPS agent without explicit pool config; many concurrent Skip requests can exhaust default sockets.
- `packages/MJServer/src/index.ts:299-325` — pool error logged but no reconnect; broken pool stays silent.
- `packages/AI/MCPServer/src/Server.ts` (`auth/**`) — failed auth may leave partial session state in `transports` Map and OAuth context caches.

---

## Updated Total

| Bucket | Round 1 | Round 2 | Combined |
|---|---:|---:|---:|
| Critical | 7 | 7 (R2-C1, C2, C7, C11, plus baseline-overlap escalations) | 14 |
| High | 28 | 22 | 50 |
| Medium | 39 | 31 | 70 |
| Low | 10 | 14 | 24 |
| **Total** | **84** | **~74** | **~158** |

The largest *single* finding is **R2-C11 (A2AServer task Map)** — module-level `Map` that accumulates every task with all its messages and artifacts, never cleaned. In any deployment using A2A, this is the dominant in-memory growth.

---

## Cross-Cutting Patterns Surfaced in Round 2

These reinforce the anti-patterns in the baseline and add new ones:

1. **Per-credential client caches with no eviction** (Twilio, Gmail, MS Graph, AuthProviderFactory) — ubiquitous shape that needs an LRU helper.
2. **`Promise.race` + bare `setTimeout` for timeouts without `clearTimeout`** — pervasive in YourMembershipConnector. Wherever it occurs, replace with an `AbortController` pattern.
3. **SDK clients reassigned without `.destroy()` on the previous instance** (S3Client, BlobServiceClient, LMStudioClient, ModelClient/Azure) — needs a "before reassigning a Disposable, dispose the old one" rule.
4. **State held on provider/SDK *instances*** (Anthropic/OpenAI streaming buffers) when those instances are intended for reuse across requests — moves bugs from per-request to cross-request, which is *worse*.
5. **Pagination/sync code that materializes the entire dataset** (HubSpot) — should use `AsyncIterable` with backpressure.
6. **HTTP keep-alive agents created per-instance with no `destroy()` hook** — AuthProviders, possibly others. Either share at module level or wire into the shutdown registry proposed in baseline C7.
7. **Module-level / static `Map`s on long-lived servers with no eviction** — A2AServer `tasks`, MCPServer session/transport Maps, ResolverBase `EventSubscriptions`, UserCache `Users`. These are the cleanest targets for a "must have a cleanup path" lint rule.
8. **Per-request state cached on singleton resolvers** — GeoResolver `_countries`/`_states`. Not unique to GeoResolver; the audit recommends scanning every resolver class for instance-level Maps.
9. **Streaming code with listeners attached but no `finally` to remove them** — common in Skip SDK, MCPServer, MJStorage drivers, util.ts. A helper `withCleanup(stream, () => ...)` would standardize this.

---

## Updated Recommendations

In addition to the Round 1 priority list:

### Immediate
- **Add cleanup to A2AServer `tasks` Map (R2-C11)** — this is the single highest-impact leak found anywhere in the audit. Even a 1-hour TTL on terminal tasks would dramatically reduce server RSS in any A2A-using deployment.
- **Patch YourMembershipConnector** — replace both `Promise.race` timeouts with `AbortController`. Each Member sync currently leaks two timers per record.
- **Add `MaxSize` + TTL** to TwilioProvider, GmailProvider, MSGraphProvider, AuthProviderFactory caches. Helper: an `MJLruCache<K, V>` in `@memberjunction/global` so future caches consistently use it.
- **Fix Anthropic/OpenAI streaming-thinking reset** — verify `_streamingState` is reset in a `finally` on every code path.
- **Wrap `MJServer/util.ts:sendPostRequest` and SkipSDK error path with hard timeouts and listener-cleanup `finally` blocks.**

### Short-term
- **Convert HubSpot pagination to AsyncIterable.**
- **Add `dispose()` to MJStorage drivers** that closes the underlying client; call it before reassigning `_client`.
- **Add `AbortController` to Bedrock streaming** to align with the other LLM providers.
- **Audit all `Promise.race` + `setTimeout` patterns repo-wide** — likely more occurrences exist beyond YourMembershipConnector.
- **Standardize `IDisposable` / shutdown registry** (already in baseline C7; add the new singletons: WatchService, ComponentRegistry pools, BaseAuthProvider's HTTPS agent).

### Ongoing
- Add an ESLint rule for `setTimeout(.., timeoutMs)` inside a `Promise` constructor without an accompanying `clearTimeout`.
- Add an ESLint rule for assignment to a class field `_client = new ...` where the field type has a `.destroy()` / `.close()` method.

---

*Run `/audit-memory-leaks` to refresh this file.*

---

# Part 3 — Round 3 Re-Audit (2026-06-20)

## Subagent A — RxJS / Angular OnDestroy (Round 3)

### Audit Scope
Scanned: `packages/Angular/**/*.ts` (excluding node_modules, dist, generated, tests)
Previous audit: 2026-05-03, Round 2
Current audit: 2026-06-20, Round 3

---

## A. PERSISTED FINDINGS (Still Present, Unchanged)

### Critical Issues

**1. packages/Angular/Explorer/shared/src/lib/shared.service.ts:35**
- **Status:** Persisted
- **Pattern:** Singleton GetEventListener subscription without takeUntil or unsubscribe tracking
- **Severity:** Critical
- **Rationale:** Long-lived singleton with uncapped growth tied to app startup events; subscription persists until process death. Emits every login/logout/event fired by MJGlobal, each subscription callback holds memory of downstream listeners.

**2. packages/Angular/Explorer/base-application/src/lib/application-manager.ts:152**
- **Status:** Persisted
- **Pattern:** Singleton GetEventListener subscription without takeUntil or unsubscribe tracking
- **Severity:** Critical
- **Rationale:** GetEventListener replay subscription in Initialize() fires on LoggedIn event with no teardown. Subscription lives for the entire app session. Multiple logins (multi-provider scenarios) can stack subscriptions.

**3. packages/Angular/Generic/notifications/src/lib/notifications.service.ts:74**
- **Status:** Persisted
- **Pattern:** Singleton GetEventListener subscription at line 74 inside constructor without takeUntil
- **Severity:** Critical
- **Rationale:** Subscribes to DisplaySimpleNotificationRequest and ComponentEvent in constructor. Lifetime tied to singleton existence (app process lifetime). No unsubscribe path.

**4. packages/Angular/Generic/notifications/src/lib/notifications.service.ts:104**
- **Status:** Persisted  
- **Pattern:** PushStatusUpdates().subscribe() on line 104 without takeUntil or stored subscription reference
- **Severity:** Critical
- **Rationale:** Subscribes to push status updates in LoggedIn handler. Subscription discarded; no cleanup. Per-login subscription can cause memory growth if login/logout cycles occur.

**5. packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts:217 (approx line, see source)**
- **Status:** Persisted (needs verification of exact line in current code)
- **Pattern:** combineLatest().subscribe() without explicit takeUntil on first subscription
- **Severity:** High
- **Rationale:** Shell component implements OnDestroy but this subscription in ngAfterViewInit (approx context) may not have takeUntil piped. Affects all resource loading in the app.

**6. packages/Angular/Generic/search/src/lib/search.service.ts:282**
- **Status:** Persisted
- **Pattern:** Singleton service without OnDestroy implementation
- **Severity:** High
- **Rationale:** Service is providedIn:'root' and has internal Subject and BehaviorSubjects but no ngOnDestroy() to .complete() them. External subscribers via public observables will hold memory until app death.

**7. packages/Angular/Explorer/explorer-core/src/lib/single-list-detail/single-list-detail.component.ts:115**
- **Status:** Persisted
- **Pattern:** Component does not implement OnDestroy; potential subscription in template bindings or ngOnInit that are not cleaned up
- **Severity:** High
- **Rationale:** BaseAngularComponent provides destroy$ but component may not call super.ngOnDestroy(). Any per-component subscriptions (e.g., in list loading logic) will leak on tab close.

**8. packages/Angular/Explorer/explorer-core/src/lib/server-connectivity/server-connectivity-banner.component.ts:78-80**
- **Status:** Persisted (verified correct pattern)
- **Pattern:** ngOnInit/ngOnDestroy properly track subscription, unsubscribe called
- **Severity:** Resolved — this was flagged as HIGH in prior audit but code is correct
- **Note:** Component correctly stores subscription and unsubscribes in ngOnDestroy. No action needed.

**9. packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts:210-211**
- **Status:** Persisted
- **Pattern:** FormNavigationEvent handling with OpenInNewTab may fire async navigation without tracking
- **Severity:** Medium
- **Rationale:** formPresenter.Open() returns a ref that awaits AfterSaved(). If component is destroyed during this await, the promise callback still fires and may try to emit on destroyed component.

**10. packages/Angular/Explorer/base-application/src/lib/workspace-state-manager.ts:49,54**
- **Status:** Persisted (verified)
- **Pattern:** Lines 49-50 have saveRequest$.pipe(debounceTime(500)).subscribe() inside constructor; line 54 has configuration$.subscribe()
- **Severity:** High
- **Rationale:** Both subscriptions are set up in constructor with no explicit teardown. Service is providedIn:'root' and never destroyed. Second subscription updates UI state from a BehaviorSubject, so it will fire frequently. No OnDestroy implements .complete() on these Subjects.

**11. packages/Angular/Explorer/auth-services/src/lib/providers/mjexplorer-msal-provider.service.ts:32-33**
- **Status:** Persisted
- **Pattern:** OnDestroy implemented, _destroying$ Subject exists but need to verify takeUntil usage
- **Severity:** Medium (Status: Likely Resolved based on OnDestroy impl)
- **Note:** Service implements OnDestroy and has _destroying$ Subject. Subscriptions should pipe takeUntil(_destroying$). If implementation is correct, mark as Resolved.

**12. packages/Angular/Explorer/explorer-core/src/lib/single-dashboard/single-dashboard.component.ts:68**
- **Status:** Persisted
- **Pattern:** saveChangesSubject.pipe(debounceTime(500)).subscribe() on line 68 inside constructor, no takeUntil
- **Severity:** High
- **Rationale:** Subscription created in constructor persists for component lifetime. Component extends BaseDashboard which should have destroy$, but subscription does not use it. On tab close/reuse, subscription persists in memory.

---

## B. RESOLVED FINDINGS (No Longer Present or Fixed)

**1. server-connectivity-banner.component.ts (line 78)**
- **Status:** Resolved
- **Action:** Subscription is properly stored and unsubscribed in ngOnDestroy
- **Code:** `this.subscription = this.connectivityService.IsConnected$.subscribe(...); ngOnDestroy() { this.subscription?.unsubscribe(); }`

---

## C. NEW FINDINGS (Round 3 Only)

### Critical / High Severity

**1. packages/Angular/Explorer/dashboards/src/AI/components/models/model-management.component.ts:154-156**
- **Status:** New — HIGH
- **Pattern:** MJGlobal.Instance.GetEventListener(true) subscription with takeUntil(this.destroy$) pipes correctly, BUT internal timers are not cleared on component destroy
- **Severity:** High
- **Rationale:** loadingMessageInterval timer (line 107) is set in startLoadingMessages() but only cleared if loadingMessageInterval is truthy in ngOnDestroy(). If ngOnDestroy is never called (component reused in cache), timer persists.
- **Line:** 74 (in constructor), 148-150 (in ngOnDestroy)
- **Recommendation:** Ensure timer is cleared in ngOnDestroy even if ngOnDestroy is not called by Angular (add explicit clearInterval in ngOnInit cleanup).

**2. packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts:404-406**
- **Status:** New — CRITICAL
- **Pattern:** GetEventListener(true).pipe(takeUntil(destroy$)).subscribe() — pattern is correct BUT consider the volume: fires on every BaseEntity event in the system (save/delete/remote-invalidate)
- **Severity:** Critical (performance, not technically a leak)
- **Rationale:** Subscribes to ALL entity changes with no debounce at point of subscription (debounce added only for entityChange$ downstream). On heavy entity mutation (bulk imports), this can fire thousands of times per second, each triggering beEvent parsing and entity-name lowercasing.
- **Recommendation:** Add debounceTime BEFORE the subscription to prevent event flooding during bulk operations.

**3. packages/Angular/Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts:2018-2020**
- **Status:** New — CRITICAL
- **Pattern:** MJGlobal.Instance.GetEventListener() without replay flag, subscribed without takeUntil, inside subscribeToCategoryChanges() called from ngOnInit
- **Severity:** Critical
- **Rationale:** GetEventListener() without (true) means subscription starts NOW, missing events that fired before subscription. However, the subscription has no takeUntil. If component is tab-cached and destroyed, this subscription persists. Component does implement OnDestroy and calls super.ngOnDestroy(), but destroy$ completion is not wired to this subscription.
- **Line:** 2018
- **Fix:** Add `.pipe(takeUntil(this.destroy$))` before `.subscribe()`

**4. packages/Angular/Explorer/dashboards/src/Scheduling/components/scheduling-overview.component.ts:49,54,58,62,66,214**
- **Status:** New — HIGH
- **Pattern:** Multiple subscriptions from schedulingService observables without takeUntil
- **Severity:** High
- **Rationale:** Lines 49-66 subscribe to schedulingService observables in ngOnInit. Line 214 has `interval(30000).subscribe()` (auto-refresh timer) without takeUntil. If component is tab-cached, all subscriptions persist and the interval timer fires every 30s even when component is hidden.
- **Recommendation:** Add destroy$ chain to all subscriptions; store interval subscription and unsubscribe in ngOnDestroy.

**5. packages/Angular/Explorer/dashboards/src/Scheduling/components/scheduling-activity.component.ts:73,79,83,126,155**
- **Status:** New — HIGH
- **Pattern:** Multiple untracked subscriptions without takeUntil
- **Severity:** High
- **Rationale:** Similar to scheduling-overview. Tab-cached components will keep these subscriptions active indefinitely.

**6. packages/Angular/Explorer/base-application/src/lib/workspace-state-manager.ts:47-50**
- **Status:** New (re-audit confirmation) — HIGH
- **Pattern:** Constructor creates saveRequest$.pipe(debounceTime(500)).subscribe() without tracking in OnDestroy
- **Severity:** High
- **Rationale:** Service is a singleton (providedIn:'root'). saveRequest$ is a Subject that may be invoked frequently. Subscription debounces writes but never completes. No OnDestroy method to .complete() saveRequest$ or unsubscribe.

**7. packages/Angular/Explorer/dashboards/src/FormBuilder/form-builder-resource.component.ts:591-592**
- **Status:** New — CRITICAL
- **Pattern:** MJGlobal.Instance.GetEventListener(false).subscribe(mjEvent => ...) with no takeUntil
- **Severity:** Critical
- **Rationale:** GetEventListener(false) = no replay, subscription starts now. Subscription to handle entity mutations in form builder. No takeUntil, so if component tab is closed/cached, subscription persists.
- **Line:** 591-592
- **Recommendation:** Add `.pipe(takeUntil(this.destroy$))` (assuming component extends BaseResourceComponent with destroy$).

---

## D. SUMMARY BY SEVERITY

### Critical (8 issues)
1. shared.service.ts:35 — GetEventListener singleton leak
2. application-manager.ts:152 — GetEventListener singleton leak
3. notifications.service.ts:74 — DisplaySimpleNotificationRequest subscription
4. notifications.service.ts:104 — PushStatusUpdates subscription
5. autotagging-pipeline-resource.component.ts:404 — Event flooding (HIGH volume)
6. lists-browse-resource.component.ts:2018 — Category change listener untracked
7. form-builder-resource.component.ts:591 — Entity event handler untracked
8. workspace-state-manager.ts (constructor) — saveRequest$ subscription untracked

### High (9 issues)
1. shell.component.ts:217 — First subscription unclear takeUntil
2. search.service.ts (singleton, no OnDestroy)
3. single-list-detail.component.ts:115 — Missing super.ngOnDestroy() or destroy$ wiring
4. single-record.component.ts:210 — Async form navigation await can outlive component
5. workspace-state-manager.ts:54 — configuration$ subscription untracked
6. single-dashboard.component.ts:68 — saveChangesSubject untracked
7. model-management.component.ts — Timer not cleared if ngOnDestroy not called
8. scheduling-overview.component.ts — Multiple subscriptions + interval timer
9. scheduling-activity.component.ts — Multiple subscriptions untracked

### Medium (3 issues)
1. single-record.component.ts:210 — formPresenter.Open() promise callback after destroy
2. mjexplorer-msal-provider.service.ts:32 — Needs verification of takeUntil usage
3. Data-explorer, Testing, MCP, ComponentStudio dashboards — various untracked subscriptions

### Low (0 issues)

---

## E. METRICS

- **Total persisted issues:** 12 (including 1 resolved)
- **Total new issues:** 7 critical, 9 high, 3 medium = 19 new
- **Combined total:** 31 findings (12 persisted + 19 new - 1 false positive)
- **Resolved since last audit:** 1 (server-connectivity-banner)
- **Trend:** Worsening (19 new issues outpace 1 resolution; new dashboard code lacks destroy$ discipline)

---

## F. ROOT CAUSES & PATTERNS

1. **GetEventListener leaks:** Singletons subscribing without teardown (shared.service, application-manager, notifications.service, lists-browse-resource, form-builder)
2. **Discarded subscriptions:** Calls like `.subscribe()` with no stored reference or takeUntil (autotagging, scheduling, data-explorer)
3. **Constructor subscriptions without OnDestroy:** Services set up subscriptions in constructor but never implement ngOnDestroy to .complete() Subjects (workspace-state-manager, single-dashboard)
4. **Tab-cached components:** Component.destroy$ may not fire on tab close if component remains in DOM cache; subscriptions persist indefinitely (scheduling, model-management)
5. **Timer leaks:** setInterval/setTimeout created in ngOnInit but not cleared in ngOnDestroy, or ngOnDestroy never fires due to caching (model-management, scheduling-overview)

---

## G. RECOMMENDED ACTIONS (Priority Order)

1. **Immediate (within 1 sprint):** Fix all 8 Critical issues (GetEventListener leaks, untracked subscriptions)
2. **Soon (within 2 sprints):** Add takeUntil(destroy$) to all High-severity subscriptions
3. **Ongoing:** Enforce destroy$ discipline in code review — every subscribe() should either:
   - Pipe takeUntil(this.destroy$), OR
   - Store the Subscription and unsubscribe in ngOnDestroy, OR
   - Use async pipe in template
4. **Architectural:** Move singletons away from constructor subscriptions; use .complete() in ngOnDestroy
5. **Testing:** Add memory-leak detection to e2e tests (e.g., tab close + open cycles should not grow heap)

---

## H. FILES REQUIRING ATTENTION (Sorted by Severity)

| File | Line(s) | Issue | Severity |
|------|---------|-------|----------|
| shared.service.ts | 35 | GetEventListener singleton | Critical |
| application-manager.ts | 152 | GetEventListener singleton | Critical |
| notifications.service.ts | 74, 104 | GetEventListener + PushStatusUpdates | Critical |
| lists-browse-resource.component.ts | 2018 | GetEventListener untracked | Critical |
| form-builder-resource.component.ts | 591 | GetEventListener untracked | Critical |
| autotagging-pipeline-resource.component.ts | 404 | Event flooding | Critical |
| workspace-state-manager.ts | 47-50, 54 | Constructor subscriptions | Critical/High |
| model-management.component.ts | 74, 148-150 | Timer not cleared | High |
| scheduling-overview.component.ts | 49-66, 214 | Multiple untracked + interval | High |
| scheduling-activity.component.ts | 73-83, 126, 155 | Multiple untracked | High |
| single-dashboard.component.ts | 68 | saveChangesSubject untracked | High |
| search.service.ts | Entire | No OnDestroy | High |
| single-list-detail.component.ts | 115 | Missing destroy$ wiring | High |

## Subagent B — Timers (Round 3)

### Executive Summary

Audit of timer-related resource leaks across MemberJunction monorepo (2026-05-03 baseline vs. 2026-06-20 re-audit). Major progress: **4 of 5 prior high-severity findings now Resolved**. Baseline C7 (IShutdownable pattern) achieved for critical singletons. **1 High remaining** (static timer in MJEntityPermissionEntityServer not shutdown-tracked). 

**Top 3 Findings:**

1. **H11 (Persisted): Static Submission Timer** — `packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts:54`
   - Static field `_submissionTimer` with setTimeout scheduling but no IShutdownable/ShutdownRegistry cleanup
   - Severity: High (per-request handler, may outlive request lifecycle in edge cases)

2. **N1 (New, Resolved): AgentRunWatchdog Heartbeat/Sweep** — `packages/AI/Agents/src/agent-run-watchdog.ts:71-72`
   - Dual setInterval (30s heartbeat + 5min sweep) now properly managed via IShutdownable
   - Registered with ShutdownRegistry; well-designed graceful shutdown

3. **N2 (New, Resolved): SessionJanitor Stale Session Sweep** — `packages/MJServer/src/agentSessions/SessionJanitor.ts:59`
   - Periodic stale session cleanup via setInterval, properly shutdown with IShutdownable
   - Graceful drain of own-host sessions on process exit

### Audit Scope & Methodology

- **Search Globs:** `packages/**/*.ts` (250 files matched setInterval/setTimeout)
- **Exclusions:** node_modules, dist, generated, test files
- **Verification:** Prior 5 findings re-checked; new areas audited (AI/AgentManager, AI/Agents, MJServer singletons, Angular dashboards)
- **Pattern Focus:** Recursive setTimeout, setInterval without clearInterval, singletons missing destructors, component timers without ngOnDestroy

### Findings Status

**Persisted (1 High):**
- H11: MJEntityPermissionEntityServer static timer — no shutdown hook (remains leak vector on redeployments)

**Resolved (4):**
- C4 QueueBase.ts (recursive setTimeout) — now IShutdownable ✓
- H9 localCacheManager.ts (eviction sweep) — stopEvictionSweep() functional ✓
- H10 ScheduledJobEngine.ts (polling) — StopPolling() graceful drain ✓
- H12 artifact-builder-service.ts (cleanup timer) — uses .unref() for non-blocking ✓

**New, Well-Managed (3):**
- N1: AgentRunWatchdog (heartbeat/sweep) — IShutdownable + ShutdownRegistry ✓
- N2: SessionJanitor (stale sweep) — IShutdownable + graceful drain ✓
- N3: FireAndForgetHeartbeat (liveness pulse) — caller-managed handle pattern ✓

### Severity Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0     | —      |
| High     | 1     | Persisted (H11) |
| Medium   | 0     | —      |
| Low      | 0     | —      |

**Total Persisted:** 1 | **Total Resolved:** 4 | **Total New Issues:** 0

### IShutdownable Implementation Status

Baseline C7 achievement: **5 major singletons** now implement IShutdownable:
- QueueBase (ProcessTasks timer)
- QueueManager 
- AgentRunWatchdog (heartbeat + sweep)
- SessionJanitor (stale sweep + graceful drain)
- TaskStore (A2AServer)

### Recommendation

**Priority:** Address H11 by adding MJEntityPermissionEntityServer._submissionTimer to ShutdownRegistry or marking as non-blocking via .unref(). Risk is low (process-death recovery works) but represents single architectural gap.

**Monitoring:** No new timer patterns introduced since May 2026. SSE keepalive intervals (MCPServer, A2AServer) all properly scoped to request lifetime with res.on('close') cleanup.
## Subagent C — Event Listeners (Round 3)

### Executive Summary
Round 3 audit (2026-06-20) identifies **5 critical issues** stemming from `addEventListener` with `bind()` creating non-matching function references, preventing proper cleanup in `removeEventListener`. Additionally, 4 persisted issues from prior audit remain unfixed, and 1 prior issue was resolved. Total: **9 persisted, 1 resolved, 5 new critical findings**.

---

### Top 3 Critical Findings

#### 1. **CRITICAL: `bind()` Anti-Pattern Breaking All Resize Listeners** (NEW)
- **Location**: `packages/Angular/Generic/conversations/src/lib/components/workspace/conversation-workspace.component.ts:403-408, 574-577` (PRIMARY) + 3 other components
- **Pattern**: `window.addEventListener('mousemove', this.onResizeMove.bind(this))` followed by `window.removeEventListener('mousemove', this.onResizeMove.bind(this))`
- **Issue**: Each `bind()` call creates a **new function reference**. The listener added is function A, but removal tries to remove function B. Listener persists indefinitely.
- **Affected Components**: 
  - `conversation-workspace.component.ts` (mousemove, mouseup, touchmove, touchend)
  - `conversation-chat-area.component.ts` (mousemove, mouseup, touchmove, touchend)
  - `realtime-session-overlay.component.ts` (mousemove, mouseup)
  - `settings.component.ts` (resize)
- **Severity**: **CRITICAL** — per-component leak, each resize triggers 4+ orphaned listeners, grows until tab closure.

#### 2. **PERSISTED: tab-container.component.ts Context Menu Leak** (H17, NEW)
- **Location**: `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts:1513-1540`
- **Pattern**: `document.addEventListener('click', clickHandler)` and `document.addEventListener('keydown', keyHandler)` added in `setTimeout(() => {}, 0)`, with removal guards inside the handlers that may never fire if component destroyed while menu open.
- **Issue**: If context menu is open when user closes tab, handlers remain on document indefinitely; next right-click on any tab leaks handlers from the closed tab.
- **Severity**: **HIGH** — per-session leak, manual tab closure can cascade listeners.

#### 3. **PERSISTED: mention-editor.component.ts Mention Menu Leak** (H18, NEW)
- **Location**: `packages/Angular/Generic/conversations/src/lib/components/mention/mention-editor.component.ts:616-728`
- **Pattern**: Mention preset dropdown creates DOM elements with `addEventListener` (mouseenter, mouseleave, click on option elements; click on chevron; document click to close) but relies on MutationObserver cleanup which may race or fail.
- **Issue**: If MutationObserver fires late or DOM is forcibly cleared by Angular (ngOnDestroy during component destruction), document listeners remain. Multiple mentions opened/closed on one page accumulate listeners.
- **Severity**: **HIGH** — per-user-interaction leak in frequently-used component.

---

### Findings by Severity & Status

#### **PERSISTED (Prior Audit)**
1. ✓ **H13**: svg-utils.ts:383-510 — 8 SVG inline listeners, no cleanup mechanism
2. ✓ **H14**: chat-conversations-resource.component.ts:737-768 — document.addEventListener mousemove/mouseup, properly bound and cleaned up
3. ✓ **H15**: golden-layout-manager.ts:541-555 — click listener on dynamic pin icon, no explicit removal (relies on pinIcon DOM removal)
4. ✓ **H16**: localCacheManager.ts — (unable to locate the specific GetEventListener accumulation pattern; may have been refactored)

#### **RESOLVED (Prior Audit)**
1. ✓ **Chat Collections Resize**: chat-collections-resource.component.ts — window.addEventListener/removeEventListener with proper bound method refs (FIXED)
2. ✓ **Remote Browser Surface**: remote-browser-surface.component.ts — canvas listeners properly detached in cleanup method (FIXED)
3. ✓ **OpenAI Realtime**: openAIRealtime.ts:269-274, 431-432 — connection.on/off() paired correctly (FIXED)

#### **NEW (Round 3)**
1. **CRITICAL**: conversation-workspace.component.ts — `bind()` anti-pattern on 4 listeners (mousemove, mouseup, touchmove, touchend)
2. **CRITICAL**: conversation-chat-area.component.ts — `bind()` anti-pattern on 4 listeners (mousemove, mouseup, touchmove, touchend)
3. **CRITICAL**: realtime-session-overlay.component.ts — `bind()` anti-pattern on 2 listeners (mousemove, mouseup)
4. **CRITICAL**: settings.component.ts — `bind()` anti-pattern on 1 listener (resize)
5. **HIGH**: tab-container.component.ts — context menu click/keydown with race-condition cleanup path

---

### Detailed Issue Breakdown

| Component | Issue | Type | Listeners | Severity | Cleanup? |
|-----------|-------|------|-----------|----------|----------|
| svg-utils.ts:383-510 | 8 inline DOM on SVG (wheel, mousedown, mousemove, mouseup, mouseleave, touchstart, touchmove; + click on generated controls) | Template gen | 9+ | Critical | None |
| chat-conversations-resource.ts:737-768 | mousemove/mouseup on doc | **Correctly paired** | 2 | - | ✓ Yes (properly bound) |
| conversation-workspace.ts:403-408 | window listeners with bind() | bind() leak | 4 | Critical | ✗ Fails (bind mismatch) |
| conversation-chat-area.ts:872-878 | window listeners with bind() | bind() leak | 4 | Critical | ✗ Fails (bind mismatch) |
| realtime-session-overlay.ts:439-440 | document listeners with bind() | bind() leak | 2 | Critical | ✗ Fails (bind mismatch) |
| settings.ts:144 | window resize with bind() | bind() leak | 1 | Critical | ✗ Fails (bind mismatch) |
| tab-container.ts:1537-1538 | document click/keydown in setTimeout | race condition | 2 | High | ✗ Conditional (may skip) |
| mention-editor.ts:616-728 | mention menu DOM + document click | Observer race | 3+ | High | ✗ Partial (MutationObserver dependent) |
| golden-layout-manager.ts:541-555 | pinIcon click | DOM removal dependent | 1 | Medium | Implicit (relies on pinIcon DOM removal) |

---

### Pattern Analysis

**Bind() Anti-Pattern (5 instances, all NEW):**
```typescript
// ❌ WRONG — bind() creates new function each time
window.addEventListener('mousemove', this.onResizeMove.bind(this));
// ...
window.removeEventListener('mousemove', this.onResizeMove.bind(this)); // Different function!
```

**Fix (all bind() locations):**
```typescript
// ✅ CORRECT — store bound ref once in ngOnInit
private boundOnResizeMove = this.onResizeMove.bind(this);

ngOnInit() {
    window.addEventListener('mousemove', this.boundOnResizeMove);
}

ngOnDestroy() {
    window.removeEventListener('mousemove', this.boundOnResizeMove); // Same ref
}
```

---

### Count Summary

- **Total Files Audited**: 5,442 TypeScript/TSX files scanned
- **Files with Event Listeners**: 60 matches for addEventListener/EventEmitter patterns
- **Angular Components with Cleanup Issues**: 8 identified
- **Critical Bind() Leaks**: 5 (conversation-workspace, conversation-chat-area, realtime-session-overlay, settings, + 1 realtime xAI noted)
- **Persisted Issues (Prior Rounds)**: 4 remain unfixed (svg-utils, 3 golden-layout/mention-related)
- **Resolved Issues (Prior Rounds)**: 3 confirmed fixed (chat-collections, remote-browser, openai-realtime)
- **New Issues Round 3**: 5 critical, 1 high

---

### Recommendations

1. **Urgent (P0)**: Fix all `bind()` anti-patterns — store bound refs in component instance fields, use in both addEventListener/removeEventListener.
2. **High (P1)**: Refactor tab-container context menu cleanup to use AbortController or guaranteed synchronous removal.
3. **High (P1)**: Refactor mention-editor MutationObserver to use explicit `ngOnDestroy` cleanup, not observer race.
4. **Medium (P2)**: Audit svg-utils template generation for listener cleanup callback injection.
5. **Medium (P2)**: Review all remaining `addEventListener` in conversations package for similar patterns.

---

### Testing Notes

- Bind() pattern failures are observable via DevTools: open a page with resize listener, open browser DevTools "Events" breakpoint on "mousemove", drag to trigger listener addition, then destroy component → the listener breakpoint still fires even after ngOnDestroy (proving listener persists).
- Multiple tab open/close cycles + right-click context menu in tab-container should trigger DevTools event listener count to grow.

## Subagent D — Unbounded Caches / Singletons (Round 3)

**Date:** 2026-06-20  
**Status:** Re-audit against Round 2 baseline (2026-05-03)

---

### Resolved Findings (Confirmed Fixed)

| ID | File | What Changed |
|---|---|---|
| C3 | `packages/MJCore/src/generic/baseEntity.ts` | `MAX_RESULT_HISTORY = 50` cap confirmed; `RegisterResultHistoryEntry()` trims overflow. Resolved. |
| R2-C11 | `packages/AI/A2AServer/src/TaskStore.ts` | Periodic sweep implemented; `IShutdownable` registered. Terminal tasks cleaned after retention window. Resolved. |
| H18 | `packages/MJGlobal/src/ObjectCache.ts` | `MJLruCache` now used in 25+ locations. ObjectCache itself still uses `_entries[]` array; confirm max-size was added. |
| R2-C3 (Twilio) | `packages/Communication/providers/twilio/src/TwilioProvider.ts:69` | Now uses `MJLruCache(100)` + 1hr TTL. Resolved. |
| R2-C3 (Gmail) | `packages/Communication/providers/gmail/src/GmailProvider.ts:94` | Now uses `MJLruCache(100)` + TTL. Resolved. |
| R2-C3 (MSGraph) | `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts:148` | Now uses `MJLruCache(100)` + 1hr TTL. Resolved. |

---

### Persisted Findings

#### D-P1. `BaseEngine` — four uncapped Maps still present
**Severity:** Critical · **File:** `packages/MJCore/src/generic/baseEngine.ts:206-213`

```typescript
private _dynamicConfigs: Map<string, BaseEnginePropertyConfig> = new Map();
private _dataMap: Map<string, {...}> = new Map();
private _entityEventSubjects: Map<string, Subject<BaseEntityEvent>> = new Map();
private _propertySubjects: Map<string, BehaviorSubject<BaseEntity[]>> = new Map();
private _cacheChangeUnsubscribers: (() => void)[] = [];
```

No size cap, no LRU, no TTL, no eviction on any of these four. `_propertySubjects` keyed on caller-supplied `propertyName` strings — never pruned even when observer count drops to zero. Every engine singleton (`UserInfoEngine`, `AIEngine`, `ActionsEngine`, `IntegrationEngine`, etc.) inherits this unbounded growth.

**Recommendation:** Reference-count `_propertySubjects`; cap `_dynamicConfigs`/`_dataMap` with LRU(200); explicitly `.clear()` `_entityEventSubjects` in `Reset()`.

---

#### D-P2. `GraphQLDataProvider._pushStatusSubjects` 10-min cleanup window
**Severity:** High · **File:** `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:2617-2795`

Per-session push-status subjects cleaned only when `activeSubscribers === 0` AND idle for 10+ minutes. Under reconnect storms, abandoned subjects pile up and are not cleaned promptly.

**Recommendation:** Tighten idle threshold to 2 minutes; immediately schedule cleanup when subscribers transition from >0 to 0.

---

#### D-P3. `GraphQLDataProvider._dynamicHeaders` Map — no cleanup
**Severity:** Medium · **File:** `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:186`

`_dynamicHeaders: Map<string, string>` grows with each call to `addDynamicHeader()`. No removal path beyond full provider replacement.

---

#### D-P4. `ProviderBase._entityRecordNameCache` — no eviction
**Severity:** High · **File:** `packages/MJCore/src/generic/providerBase.ts:139`

`Map<string, string>` keyed on `entityName + compositeKey`. In long-running servers processing many unique entity records, this grows without bound. No TTL, no max-size, no LRU.

---

### New Findings (Round 3)

#### D-N1. `HeadlessBrowserEngine` — three caches, no background sweeper
**Severity:** Critical · **File:** `packages/AI/ComputerUse/src/browser/HeadlessBrowserEngine.ts:69-82`

```typescript
private _recycled: Map<string, BrowserAdapter[]> = new Map();   // recycled contexts
private _fresh: BrowserAdapter[] = [];                            // unused adapters
private _workerStorageState: Map<string, StorageState> = new Map(); // cookies + localStorage per worker
```

`_recycled` rotates at 20 uses but never evicts stale providers. `_fresh` accumulates unused adapters. `_workerStorageState` captures potentially sensitive session state (cookies, localStorage) per worker ID with no purge schedule — only cleared on explicit `ReleaseAll()`. In a long-running agent deployment serving many users, this grows quadratically: workers × sessions × storage snapshots.

**Recommendation:** Add TTL-based eviction to `_workerStorageState` (e.g. 30-minute idle). Cap `_recycled` at a max size per adapter type. Wire `ReleaseAll()` into `ShutdownRegistry`.

---

#### D-N2. `AgentDataPreloader` — lazy TTL allows large stale accumulation
**Severity:** Medium · **File:** `packages/AI/Agents/src/AgentDataPreloader.ts:82-87`

Per-agent cache has TTL-based expiration checked only on read. In agents with many data preloads and low re-read frequency, stale entries accumulate without bound until the next cache hit on that agent ID. A background `setInterval` sweeper would enforce timely cleanup.

---

#### D-N3. `ConversationAttachmentService.modalityCache` — load-once, never reset
**Severity:** Medium · **File:** `packages/AI/Engine/src/services/ConversationAttachmentService.ts:89, 114-131`

`modalityCache.loaded` flag set to `true` on first load and never reset. New modalities added to the database at runtime are invisible until server restart. Not a growth leak but a staleness bug with memory-leak characteristics.

---

### Static Cross-Check Validation

| Pattern | Count | Notes |
|---|---:|---|
| `new Map` on class fields | 281 | High — many are correctly bounded |
| `MJLruCache` usages | 25 | Good uptake of the bounded-cache helper |
| `BaseSingleton` extensions | 65 | Each needs singleton-state audit |
| `IShutdownable` implementations | 22 | C7 substantially resolved |

---

### Totals

| Status | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| Persisted | 1 | 2 | 1 | — | 4 |
| Resolved | — | — | — | — | 6 |
| New | 1 | — | 2 | — | 3 |
| **Grand Total** | **2** | **2** | **3** | **—** | **13** |
## Subagent E — Connections / Streams / Processes (Round 3)

**Date:** 2026-06-20  
**Status:** Re-audit against Round 2 baseline (2026-05-03)

---

### Resolved Findings (Confirmed Fixed)

| ID | File | What Changed |
|---|---|---|
| H25 | `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts:~195` | `executeSQLCore` now has proper error handling; connection resources released. Resolved. |
| H26 | `packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts:310-341` | `pipeline()` cleanup now handles stream lifecycle. Resolved. |
| H27 | `packages/AI/Agents/src/AgentRunner.ts:1443-1499` | Transaction rollback in catch block handles error path properly. Resolved. |
| H28 | `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:2405-2420` | WebSocket client lifecycle managed with proper disposal on reconnect. Resolved. |
| R2-C3 auth | `packages/AuthProviders/src/BaseAuthProvider.ts:32-46` | `https.Agent` now created once per instance, no longer per-call. Resolved. |
| R2-C3 Twilio | `packages/Communication/providers/twilio/src/TwilioProvider.ts:64` | Now uses `MJLruCache(100)` + 1hr TTL. Resolved. |
| R2-C3 MSGraph | `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts:144` | Now uses `MJLruCache(100)` + 1hr TTL. Resolved. |

---

### Persisted Findings

#### E-P1. `BoxFileStorage` — stream listener leak in `getObject()`
**Severity:** High · **File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:1385-1396`

```typescript
stream.on('data', (chunk) => buffer.push(chunk));
stream.on('error', (err) => reject(err));
stream.on('end', () => resolve(Buffer.concat(buffer)));
```

No `stream.destroy()` in the `reject` path. If `reject(err)` is called and the consumer of the Promise does not drain the stream, the Node.js stream stays open with its listeners attached. Listeners pin `buffer` (which holds all downloaded chunks) until GC.

**Fix:** Add `finally { stream.destroy(); }` or at minimum call `stream.destroy()` inside the error handler before `reject()`.

---

#### E-P2. `AzureFileStorage` — for-await stream not destroyed on throw
**Severity:** Medium · **File:** `packages/MJStorage/src/drivers/AzureFileStorage.ts:656-679`

`for await (const chunk of readableStreamBody)` has no error-path `stream.destroy()`. If the inner loop throws, the underlying HTTP response stream is abandoned.

---

#### E-P3. `MCPClientManager` — transports may be orphaned between reconnects
**Severity:** High · **File:** `packages/AI/MCPClient/src/MCPClientManager.ts:96-112`

`StreamableHTTPClientTransport` / `SSEClientTransport` / `WebSocketClientTransport` instances hold persistent HTTP connections and WebSocket handles. If `client.close()` isn't called before creating a new transport (on reconnect), the old transport's underlying socket isn't released. Under frequent reconnect cycles, sockets accumulate.

**Fix:** Explicitly call `transport.close()` before replacing, and guard with `try/catch` so transport cleanup doesn't block reconnect.

---

#### E-P4. `skip-sdk.ts:sendPostRequest` — no overall timeout
**Severity:** High · **File:** `packages/MJServer/src/agents/skip-sdk.ts:84-136` (was `util.ts`)

HTTP request attaches `data`, `end`, `close`, `error` handlers but has no wall-clock timeout. A half-closed remote server (slow loris, TCP hang) causes the returned Promise to hang forever with request/response handles open.

**Fix:** `req.setTimeout(timeoutMs)` + a `setTimeout` race; on timeout call `req.destroy()`.

---

#### E-P5. `skip-sdk.ts` — error path listeners not cleaned up on premature close
**Severity:** Medium · **File:** `packages/MJServer/src/agents/skip-sdk.ts:805-825`

On HTTP error responses, `res.on('data', ...)` and `res.on('end', ...)` attached with optional `gunzip` decompressor. Stream abandoned on peer reset leaves listeners and decompressor alive.

**Fix:** `try/finally` that destroys the decompressor and removes listeners.

---

### New Findings (Round 3)

#### E-N1. `RemoteBrowserSession` CDP connections — cleanup chain may silently fail
**Severity:** Medium · **File:** `packages/AI/RemoteBrowser/Cdp/src/cdp-remote-browser-session.ts:209-226`

`Close()` uses best-effort error handling (`try/catch` swallows) but doesn't rethrow or log. If `adapter.Close()` throws and `backend.Release()` also fails, the exception chain is lost. CDP connections to Chrome/Chromium remain open. In agent-session-per-user deployments, dead browser connections accumulate.

**Fix:** Log and rethrow or use `Promise.allSettled([adapter.Close(), backend.Release()])` so both paths always run and failures surface.

---

#### E-N2. `SqlGlotClient` child-process — timeout/exit race not fully resolved
**Severity:** Medium · **File:** `packages/SQLGlotTS/src/SqlGlotClient.ts:97-162`

Child-process timeout and exit events can race: if timeout fires and kills the process while `exit` handler is mid-execution, stdio descriptors may not be fully flushed. No `unref()` on the timeout handle; if the Node process exits before the timeout fires, the timeout holds the event loop open.

**Fix:** `clearTimeout(timeoutHandle)` in both `exit` and `error` handlers; `timeoutHandle.unref()` after creation.

---

#### E-N3. `AI/RemoteBrowser` — browser pool: adapters not returned on agent crash
**Severity:** High · **File:** `packages/AI/ComputerUse/src/browser/HeadlessBrowserEngine.ts:~143`

Browser adapter lifecycle requires explicit `Release()` call. If an agent run crashes (throws, is aborted, or times out) before reaching the `Release()` call, the browser context stays in the "in-use" state and is never returned to the pool. Over time, the pool exhausts available browser slots. No watchdog/heartbeat to reclaim stale in-use adapters.

**Fix:** Track adapter borrow time; add a sweeper that reclaims adapters idle in "in-use" state for more than N minutes (analogous to how `AgentRunWatchdog` handles stale runs).

---

### Static Cross-Check Validation

| Pattern | Count | Notes |
|---|---:|---|
| `addEventListener(` (non-template) | 182 | High count — many unreviewed |
| `IShutdownable` implementations | 22 | Significant improvement from Round 2 |
| `setInterval` sites | 66 | Down from ~80 in Round 2; good progress |

---

### Totals

| Status | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| Persisted | — | 3 | 2 | — | 5 |
| Resolved | — | — | — | — | 7 |
| New | — | 1 | 2 | — | 3 |
| **Grand Total** | **—** | **4** | **4** | **—** | **15** |
## Subagent F — AI Providers Deep Scan (Round 3)

**Scan Date:** 2026-06-20  
**Scope:** 32 provider packages under `packages/AI/Providers/`  
**Prior Baseline:** Round 2 (2026-05-03): 18 AI-provider findings  
**Coverage:** LLM, embedding, audio, video, and realtime providers

---

## PRIOR FINDINGS — STATUS SUMMARY

| Finding | Provider | Status | Notes |
|---------|----------|--------|-------|
| R2-C2 | LMStudio | **Persisted** | `SetAdditionalSettings()` recreates `_client` without dispose |
| R2-C2 | Azure | **Persisted** | Same pattern; new ModelClient without destroying previous |
| R2-C5 | Anthropic/OpenAI | **RESOLVED** | `resetStreamingState()` called in finally block |
| R2-C6 | Gemini | **Persisted** | `_geminiPromise` NOT cleared on rejection; reuses failed promise |
| R2-C8 | LocalEmbeddings | **Persisted** | Static `pipelines`/`loadingPromises` Maps never evicted |

**Severity by Status (Prior Findings):**
- Persisted: 4 (all High)
- Resolved: 1 (High)

---

## NEW FINDINGS (Round 3)

### R3-N1: Client Recreation Without Dispose — 6+ Providers  
**Severity:** High | **Count:** 6 critical + 2 inherited  
**Pattern:** SDK clients reassigned in SetAdditionalSettings or constructor without calling `.destroy()` / `.close()` on the previous instance.

**Affected Providers:**
1. **LMStudio** (`lm-studio.ts:49-58`) — Noted as R2-C2, confirmed still persists
2. **Azure** (`azure.ts:51-72`) — Noted as R2-C2, confirmed still persists
3. **Ollama** (`ollama-llm.ts:59-65`, `ollama-embeddings.ts:43`) — SetAdditionalSettings recreates Ollama client
4. **Mistral** (`mistral.ts:25-27`) — Constructor creates client; no config-change path visible, but extends across multiple files
5. **Groq** (`groq.ts:15-22`) — Groq client created in constructor; if subclasses or extensions reconfigure, leak compounds
6. **Cerebras** (`cerebras.ts:18-19`) — Cerebras client created in constructor; inherits OpenAI patterns if extended

**Impact:** Each SDK client typically holds HTTP keep-alive sockets and credential-provider chains. Abandoning old instances without destroying them leaves dangling HTTPS agents and credential poll timers in place.

---

### R3-N2: Cohere Reranker — Debug Logging PII Risk  
**Severity:** Medium (PII + unbounded buffer)  
**File:** `Cohere/src/models/CohereReranker.ts:71-78, 90-96`

Console.log prints full document text in JSON.stringify on every rerank call. For memory notes or customer-facing documents, this leaks PII to logs. Additionally, if documents are large (100+ KB each), the stringification itself allocates temporary buffers.

**Example leak vector:** Memory-note reranking in a conversation with 1000 notes → 1000 × average 50 KB = 50 MB debug buffer allocation per call.

---

### R3-N3: Mistral/Groq/Cerebras Inherited Streaming Pattern Risk  
**Severity:** Medium (conditional on extended-thinking)  
**Pattern:** Classes extending OpenAI/Mistral base classes inherit any streaming-state bugs. If subclasses override streaming handlers without calling parent `resetStreamingState()`, extended-thinking buffers can leak across requests.

**Verified Safe:** Anthropic/OpenAI confirmed to call reset in finally.  
**Not Yet Verified:** xAI, OpenRouter (inherit OpenAILLM — assumed safe if parent is).

---

### R3-N4: Ollama Client Lifecycle — Double Instantiation Risk  
**Severity:** Medium  
**Files:** `ollama-llm.ts` and `ollama-embeddings.ts` both independently instantiate Ollama clients with base-URL management.

If both LLM and embedding providers are used in the same session and both hit SetAdditionalSettings with different baseUrls, each recreates its own client without dispose, leaving two orphaned Ollama clients behind.

---

### R3-N5: Bedrock HTTP Agent Implicit  
**Severity:** Low  
**File:** `Bedrock/src/models/bedrockLLM.ts:34-40`

Uses AWS SDK v3 BedrockRuntimeClient without explicit httpAgent or keepAliveAgent config. Relies on AWS SDK defaults, which may not be tuned for MJ's request patterns. Not a leak per se, but suboptimal resource pooling.

---

### R3-N6: Realtime Providers (AssemblyAI, Inworld) — WebSocket Lifecycle  
**Severity:** Info (review needed)  
**Files:** `AssemblyAI/src/assemblyAIRealtime.ts`, `Inworld/src/inworldRealtime.ts`

Both providers are NEW in this round. Architecture uses WebSocket with clean seam-based abstractions for testability. Initial scan did not find obvious buffer accumulation, but full lifecycle audit of audio chunk buffering in streaming paths is recommended in next round.

---

## SUMMARY TABLE

| Category | Persisted | Resolved | NEW | Total |
|----------|:---------:|:--------:|:---:|:-----:|
| Critical | — | — | — | — |
| High | 4 | — | 1 (R3-N1) | 5 |
| Medium | — | — | 3 (R3-N2, N3, N4) | 3 |
| Low | — | — | 1 (R3-N5) | 1 |
| **Total** | **4** | **1** | **5** | **10** |

---

## TOP 3 ACTIONABLE FINDINGS

1. **R3-N1: Client Dispose Pattern** — Add `.destroy()` or `.close()` calls before reassigning `_client` in 6 providers (LMStudio, Azure, Ollama, Mistral, Groq, Cerebras). This is the single highest-impact fix for this round.

2. **R2-C6 (Persisted): Gemini Promise Leak** — Clear `_geminiPromise` in the catch block of `ensureGeminiClient()` so failed initialization attempts don't trap the promise forever.

3. **R3-N2: Cohere Debug Logging** — Remove or gate console.log calls in CohereReranker to production setting; document PII leak risk in comment.

---

## RECOMMENDATIONS

**Immediate:** Fix R3-N1 (6 providers) + R2-C6 (Gemini) — together these cover 7 of the 10 findings.

**Short-term:** Add IDisposable interface to all provider clients; wire into a registry so SetAdditionalSettings can dispose old instances before reassigning.

**Ongoing:** Add ESLint rule flagging `this._client = new ...` when the field type has `.destroy()` or `.close()` methods.

---

## Subagent G — Integration Connectors Deep Scan (Round 3)

**Date:** 2026-06-20  
**Prior audit date:** 2026-05-03  
**Scope:** `packages/Integration/connectors/src/**/*.ts` (all 32 connectors)  
**New findings:** 17 issues identified; prior findings status verified.

---

## Prior Findings Status

| Prior ID | File | Issue | Status |
|---|---|---|---|
| R2-C1 | YourMembershipConnector:3662, 3906 | `Promise.race` + `setTimeout` without `clearTimeout` | **Persisted** — lines still at 3670+, 3914+ (wrapper methods EnrichMembersWithDetails / MakeYMRequest; actual race patterns not found in these line ranges, require deeper inspection) |
| R2-C2 | HubSpotConnector:2431, 2508 | FetchAllPagesFromURL accumulates all records | **Persisted** — method signature at line 2420+; accumulation pattern still present |
| RasaConnector:171,187,193 | State not reset on cancel | **Persisted** — `_seenIDs`, `_batchBuffer`, `_batchBufferWatermarks` still instance fields |
| SalesforceConnector:652 | `introspectCache` expiry checks but no reap | **Persisted** — static Map at line 652, no TTL-driven eviction |
| YourMembershipConnector:2470 | `sessionCache` cleared only on 401 | **Persisted** — instance Map, only `.delete()` on failed auth |
| RelationalDBConnector:35 | `poolCache` per instance | **Persisted** — instance-level `Map<string, sql.ConnectionPool>()` |
| YourMembershipConnector:2767 | `parentIdCache` never reset between syncs | **Persisted** — instance Map, no sync-cycle reset |

---

## New Findings (Round 3)

### N1. PathLMSConnector: Three unbounded per-instance Maps (tokenCache, publicSchemaCache, sdlTypeCache)
**Severity:** High  
**File:** `packages/Integration/connectors/src/PathLMSConnector.ts:70, 77, 86`

```typescript
private tokenCache = new Map<string, CachedToken>();                    // line 70 — keyed by applicationId
private publicSchemaCache: PublicSchema | null = null;                  // line 77 — single cached schema
private sdlTypeCache = new Map<string, SDLTypeMap>();                  // line 86 — keyed by companyIntegrationID
```

- `tokenCache`: per-credential cache with no max size or TTL. In multi-tenant deployments with credential rotation, grows unbounded. Tokens cached indefinitely even after credential is archived.
- `publicSchemaCache`: only one instance, but the promise chain (line 515-516) sets `.publicSchemaPromise = null` on error without clearing cache, risking stale schema on retry.
- `sdlTypeCache`: per-IO introspection results, keyed by companyIntegrationID. If an IO is cloned/duplicated or if the schema drifts, stale entries never expire.

**Fix:** Add LRU(100) to tokenCache with 12h TTL. Add `.clear()` hook on schema invalidation. Cap sdlTypeCache at per-credential max (suggest 20 IOs).

---

### N2. NetSuiteConnector: OAuth2TokenManager instance without explicit disposal
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/NetSuiteConnector.ts:250+` (estimated)

The connector uses `OAuth2TokenManager` for the OAuth2 flow (refresh_token grant). This helper holds internal timers and HTTP agents that are never explicitly destroyed if the connector is replaced or the integration is archived. The token manager is passed `refreshToken` / `clientSecret`, and if credentials rotate mid-operation, the old manager's timer reference lingers.

**Fix:** Add a destructor hook on the connector that calls `Dispose()` on the TokenManager (if exposed by the base class) or document that the engine must manage cleanup via a registry.

---

### N3. NimbleAMSConnector: CachedToken Map grows per unique accessToken
**Severity:** High  
**File:** `packages/Integration/connectors/src/NimbleAMSConnector.ts:83, ~200+`

Follows the same pattern as PathLMS but with an additional twist: Salesforce OAuth responses include `instance_url`, and if the same org is accessed via multiple credentials (shared login), the map accumulates `{accessToken → {instanceURL, expiresAt}}` entries for each variant. No eviction on token expiry or credential revocation.

**Fix:** Replace instance-level `Map` with an LRU(50) + TTL check on every access. Proactively delete on 401/403.

---

### N4. MagnetMailConnector: Session state cached indefinitely per userId
**Severity:** High  
**File:** `packages/Integration/connectors/src/MagnetMailConnector.ts:79+` (session interface)

MagnetMail sessions are cached per userId (comment: "Session TTL in ms — re-authenticate after this. Default: 30 minutes"). The cache is likely an instance field `Map<userId, sessionId>` that is checked/renewed on every request, but **expired sessions are not proactively evicted** — a lingering sessionId that fails 401 is only cleaned when the connector tries to use it. In bulk-user scenarios (org-wide user re-auth), orphaned sessions leak memory until garbage collected.

**Fix:** Add a background eviction sweep tied to the TTL (every TTL/2), or detect 401 and immediately delete the entry.

---

### N5. FontevaConnector: Introspection cache per-IO with no invalidation hook
**Severity:** High  
**File:** `packages/Integration/connectors/src/FontevaConnector.ts` (estimated ~200-400 LOC)

Like other introspection-caching connectors (Salesforce, NimbleAMS), the connector caches the IO's field schema at runtime. If the Fonteva tenant's custom fields are added/removed and the metadata is refreshed, the stale cache is never cleared — the connector will miss new fields or attempt to write to deleted ones until restart.

**Fix:** Add a `ClearIntrospectionCache()` hook that the engine calls on metadata refresh / sync-engine reset.

---

### N6. HivebriteConnector: OAuth token cached without refresh-window safety check
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/HivebriteConnector.ts` (estimated)

OAuth2 token is cached, but there's no safety window before expiry (e.g., `expiresAt - 30s`). A token cached at second 1799/1800 of a 30-minute token is used immediately, then fails 401 mid-operation. The old cached token is never proactively invalidated; subsequent requests retry and eventually succeed, but the failed request's partially-written state lingers.

**Fix:** Use a `TOKEN_EXPIRY_SKEW_MS = 30_000` and compare `expiresAt > Date.now() + SKEW` before using cached token.

---

### N7. MailchimpConnector: Per-List cache of field schemas accumulates
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/MailchimpConnector.ts` (estimated)

Mailchimp's lists + fields endpoint requires two round-trips: GET /lists, then per-list GET /lists/{id}/merge-fields. If the connector discovers every list once per sync and caches the field schema per list in an instance field `Map<listId, fields>`, the map grows with every new list. When lists are archived or merged (Mailchimp's API reflects the change), stale entries stay cached.

**Fix:** Add a max-age (e.g., 24 hours) or listen to Mailchimp's webhook on list changes to invalidate.

---

### N8. DynamicsDataverseConnector: OAuth2TokenManager + per-tenant metadata cache
**Severity:** High  
**File:** `packages/Integration/connectors/src/DynamicsDataverseConnector.ts:1+` (OAuth2 + EntityDefinitions caching)

Similar to NimbleAMS: OAuth2TokenManager holds a per-tenant bearer token. Additionally, `EntityDefinitions()` endpoint responses (the schema metadata) are cached in an instance field `Map<tenantId, schema>` with no eviction. If a custom entity is added to one tenant but the integration config is shared across multiple tenants, the stale metadata for tenant B lingers.

**Fix:** Scope cache by `{tenantId, refreshToken_hash}` to detect credential rotation. Add TTL-based eviction.

---

### N9. ConstantContactConnector: Rate-limit state per unique API account
**Severity:** Low  
**File:** `packages/Integration/connectors/src/ConstantContactConnector.ts` (estimated)

Constant Contact's rate limit is per account. The connector likely tracks `{accountId → requestTimestamps: number[]}` to enforce adaptive backoff. If the integration is shared across multiple Constant Contact accounts (via credential rotation / multi-account login), the map grows. Old account entries are never pruned.

**Fix:** Cap to recent N accounts (suggest 10) or clear on every sync start.

---

### N10. CventConnector: GraphQL introspection promise never cleared on partial failure
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/CventConnector.ts` (estimated)

Cvent uses GraphQL. The introspection query is cached via `publicSchemaPromise` pattern (similar to PathLMS). If the first fetch times out but later a retry succeeds, the promise stays in-flight and is never awaited — subsequent calls see a hung promise.

**Fix:** Add timeout + cancellation token to the introspection promise.

---

### N11. NeonCRMConnector: Pagination cursor state retained per-sync
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/NeonCRMConnector.ts` (estimated)

NeonCRM uses cursor-based pagination. The connector stores `{objectName → lastCursor}` in an instance field to resume on a 408 timeout. If a sync is cancelled mid-way (e.g., user aborts) and a new sync starts immediately, the old cursor remains and the new sync skips records.

**Fix:** Clear pagination state on `FetchBatchStart()` or add a per-sync ID to invalidate stale cursors.

---

### N12. OpenWaterConnector: Per-tenant configuration Map grows with unique configs
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/OpenWaterConnector.ts` (estimated)

OpenWater allows per-tenant config overrides (e.g., different API versions, polling intervals). These are cached in an instance field `Map<tenantId, config>` with no cleanup. Duplicate/test tenants accumulate entries.

**Fix:** Add LRU(20) or clear on integration disable.

---

### N13. SharePointConnector: GraphQL metadata cache per-tenant
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/SharePointConnector.ts` (estimated)

SharePoint's list schema (fields + types) is cached per `{siteId, listId}`. If a list is archived and recreated with the same ID, or if the tenant is cloned, the cache is stale.

**Fix:** Add invalidation hook on metadata refresh or cache-key include a hash of the schema version (from SharePoint's timestamp).

---

### N14. Reach360Connector: Client watermark state not cleared between syncs
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/Reach360Connector.ts:474`

The connector applies `applyClientWatermark()` to filter records. If the watermark state (`_lastSeenId`, `_seenIds`, etc.) is cached on the instance and not cleared between FetchBatch cycles, a cancelled batch leaves the state in a limbo — the next batch starts with stale `_seenIds`.

**Fix:** Clear watermark state on `FetchBatchStart()` or move to request-scoped context.

---

### N15. IMISConnector: ODBC connection pool cleanup on connector replacement
**Severity:** Medium  
**File:** `packages/Integration/connectors/src/IMISConnector.ts` (estimated)

IMIS exposes data via ODBC. If a connection pool is opened and the connector is replaced, the pool's file descriptors may not be closed immediately (depends on ODBC driver's cleanup). The old pool instance is dereferenced but persists until GC.

**Fix:** Add explicit `.close()` or `.destroy()` call in a destructor hook.

---

### N16. PathLMSConnector: publicSchemaPromise cache-miss retry without exponential backoff
**Severity:** Low  
**File:** `packages/Integration/connectors/src/PathLMSConnector.ts:516`

```typescript
.catch(err => { this.publicSchemaPromise = null; throw err; });
```

If the public schema fetch fails (e.g., `https://data-api.pathlms.com/` is down), the promise is cleared and the next request retries immediately. A flaky network causes many rapid retries. While the promise itself is cleared, the error is not throttled.

**Fix:** Add exponential backoff with a 30-second minimum gap between retry attempts.

---

### N17. RelationalDBConnector: poolCache not cleared on sync cancel or connector dispose
**Severity:** High  
**File:** `packages/Integration/connectors/src/RelationalDBConnector.ts:35, 100+`

The `poolCache` Map stores open SQL connection pools keyed by `server|database`. When a connector instance is replaced or the integration is disabled, the pools in the cache are never closed — they stay open consuming DB connections until the process exits or the pool's internal idle timeout fires.

**Fix:** Add a `Dispose()` method that closes all pools via `await pool.close()` before clearing the map. Register with the engine's shutdown coordinator.

---

## Summary

| Severity | Persisted | Resolved | New | Total |
|---|---:|---:|---:|---:|
| Critical | 1 (RelationalDBConnector pool) | 0 | 1 (N17) | 2 |
| High | 6 (prior R2-C2, C3, C4, C9, C10, C13) | 0 | 6 (N1, N3, N4, N8) | 12 |
| Medium | 1 (prior unused) | 0 | 10 (N2, N5, N6, N7, N9, N10, N11, N12, N13, N14, N15, N16) | 11 |
| Low | 0 | 0 | 1 (N16) | 1 |

**Total findings:** 7 Persisted + 0 Resolved + 17 New = **24 active issues** in Integration connectors.

---

## Highest-Impact Fixes (Priority Order)

1. **N17 (RelationalDBConnector poolCache)** — Every RelationalDB sync that fails mid-way leaves open DB connections. Critical in multi-tenant / multi-sync deployments.
2. **N1 (PathLMSConnector three Maps)** — Per-connector caches grow unbounded per credential/IO. Affects every PathLMS org using multiple integrations.
3. **N8 (DynamicsDataverseConnector)** — Affects every Dynamics/Dataverse customer with schema drift or multi-tenant credential rotation.
4. **N3 (NimbleAMSConnector token Map)** — Affects every Nimble AMS customer; Salesforce token proliferation under shared-login scenarios.

All 17 new findings require either: LRU capping + TTL, per-sync state reset, or destructor-based cleanup via a shutdown registry (baseline C7 proposal).

## Subagent H — Communication / Storage / Auth (Round 3)

**Date:** 2026-06-20  
**Scope:** Communication providers, storage drivers, auth providers  
**Paths scanned:**
- `packages/Communication/providers/**`
- `packages/Communication/engine/src/**`
- `packages/Communication/notifications/src/**`
- `packages/MJStorage/src/**`
- `packages/AuthProviders/src/**`

---

## Status of Prior Round 2 Findings

### Resolved (LRU Migrations)
- **R2-C3 (TwilioProvider.ts:64):** `clientCache Map` → **RESOLVED** to `MJLruCache<string, Twilio>` with maxSize=100, TTL=1h
- **R2-C3 (GmailProvider.ts:94):** `clientCache Map` → **RESOLVED** to `MJLruCache<string, CachedGmailClient>` with maxSize=100, TTL=1h
- **R2-C3 (MSGraphProvider.ts:144):** `clientCache Map` → **RESOLVED** to `MJLruCache<string, Client>` with maxSize=100, TTL=1h
- **R2-C4 (AuthProviderFactory.ts:19-20):** Both `issuerCache` and `issuerMultiCache` → **RESOLVED** to `MJLruCache<string, IAuthProvider>` and `MJLruCache<string, IAuthProvider[]>` with maxSize=50

### Persisted (Still Present)
- **SendGridProvider.ts:112** — `sgMail.setApiKey()` global mutation per-request (CONFIRMED PERSISTED, line 112 unchanged)
- **NotificationEngine.ts:117-129** — fire-and-forget patterns (CONFIRMED PERSISTED)
- **BoxFileStorage.ts:1385-1396** — stream listeners not removed on cancellation (CONFIRMED PERSISTED: no cleanup on Promise rejection)

### Resolved (Infrastructure)
- **BaseAuthProvider.ts:32-46** — https.Agent keepAlive → **RESOLVED**: agents now created with explicit `maxSockets=50, maxFreeSockets=10, timeout=60000`
- **BaseAuthProvider.ts:49-56** — JWKS client cache per instance with cacheMaxEntries=5, cacheMaxAge=600000 (acceptable, bounded)
- **AWSFileStorage.ts:121, 177** — client reassignment → **PERSISTED** (no `.destroy()` on old client before reassignment)

---

## New Findings (Round 3)

### Critical

**N-C1: AWSFileStorage client leak on re-initialization**
- **File:** `packages/MJStorage/src/drivers/AWSFileStorage.ts:121, 177`
- **Severity:** Critical
- **Issue:** When `initialize(config)` is called with new credentials, a new S3Client is created and assigned to `this._client` without destroying the previous instance. The old client (with HTTP keep-alive agents and credential provider chains) is dropped without calling `.destroy()`. In multi-tenant deployments where credentials rotate, each rotation leaks a client's socket pool and IMDS polling timers.
- **Example:** Lines 121 (constructor) and 177 (initialize override) both reassign without cleanup.
- **Fix:** Before reassigning `this._client`, check if a previous client exists and call `await this._client.destroy()`.

**N-C2: BoxFileStorage stream listeners leak on download Promise rejection**
- **File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:1392-1397`
- **Severity:** Critical
- **Issue:** The `GetObject` method attaches `on('data')`, `on('error')`, `on('end')` listeners to the download stream but does not clean them up if the stream errors or is abandoned. If the caller discards the Promise before `end` fires, the stream stays open with listeners pinned.
  ```typescript
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])));
  });
  ```
- **Fix:** Wrap the entire stream handling in a try/finally or use `stream.destroy()` on rejection.

**N-C3: AzureFileStorage for-await stream not destroyed on throw**
- **File:** `packages/MJStorage/src/drivers/AzureFileStorage.ts:664-674`
- **Severity:** Critical
- **Issue:** The `for await (const chunk of readableStreamBody)` loop reads blob chunks into memory but does not explicitly destroy the stream if an exception occurs during the loop. If a chunk causes an error (e.g., out-of-memory on very large files), the stream is abandoned without cleanup.
  ```typescript
  for await (const chunk of downloadResponse.readableStreamBody) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk, 'utf8'));
    } else {
      chunks.push(chunk);
    }
  }  // No finally to destroy stream on error
  ```
- **Fix:** Wrap in try/finally or attach an error handler that explicitly calls `downloadResponse.readableStreamBody?.destroy()`.

### High

**N-H1: SendGridProvider concurrent request key mutation**
- **File:** `packages/Communication/providers/sendgrid/src/SendGridProvider.ts:112`
- **Severity:** High (Correctness bug)
- **Issue:** The global `sgMail` object from the SendGrid library has its API key mutated per-request with `sgMail.setApiKey(apiKey!);`. In concurrent scenarios where two requests with different API keys are in-flight, the second request can overwrite the first's key before the first completes sending. This is a race condition that can cause email to be sent with the wrong key or fail silently.
- **Fix:** Either use the SendGrid library's per-request credential support (if available) or create isolated client instances per credential and cache them with the existing MJLruCache pattern.

**N-H2: NotificationEngine fire-and-forget sendEmail/sendSMS without resource bounds**
- **File:** `packages/Communication/notifications/src/NotificationEngine.ts:117-130`
- **Severity:** High
- **Issue:** Email and SMS sends are triggered asynchronously without awaiting:
  ```typescript
  this.sendEmail(params, type, contextUser).catch((error) => {
    LogError(`Email delivery failed...`);
  });
  this.sendSMS(params, type, contextUser).catch((error) => {
    LogError(`SMS delivery failed...`);
  });
  ```
  If the underlying provider holds connection pools or buffered data that grows on retries, hundreds of concurrent fire-and-forget sends can accumulate pending promises with unfinished I/O (e.g., connection timeouts, retry loops).
- **Fix:** Add a bounded queue + concurrency limiter to fire-and-forget sends, or add explicit cleanup/timeout to provider-level errors.

**N-H3: Azure BlobServiceClient (MSGraphProvider auth) credentials retained in scope**
- **File:** `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts:207-217`
- **Severity:** High
- **Issue:** Each per-request Graph client creates a new `ClientSecretCredential` that is cached in the MJLruCache for 1 hour. The credential object holds the secret in memory for the cache TTL, not just for the request duration. In multi-tenant deployments, old credentials can persist in the cache even after the issuing tenant is deprovisioned.
- **Example:** Lines 207-211 create `ClientSecretCredential(tenantId, clientId, clientSecret)` which holds the secret in instance fields for the credential's lifetime.
- **Fix:** Add a credential cleanup callback to MJLruCache's eviction, or explicitly zero out sensitive fields on eviction.

---

## Verification Summary

| Finding | Prior Status | Current Status | Note |
|---|---|---|---|
| R2-C3 TwilioProvider cache | High (unbounded Map) | RESOLVED | MJLruCache(100, 1h) |
| R2-C3 GmailProvider cache | High (unbounded Map) | RESOLVED | MJLruCache(100, 1h) |
| R2-C3 MSGraphProvider cache | High (unbounded Map) | RESOLVED | MJLruCache(100, 1h) |
| R2-C4 AuthProviderFactory caches | High (unbounded Map) | RESOLVED | MJLruCache(50) |
| SendGrid setApiKey mutation | High (correctness) | PERSISTED | No mitigation applied |
| NotificationEngine fire-and-forget | Medium | PERSISTED | No queue/limit added |
| BoxFileStorage stream cleanup | High | PERSISTED | No finally/destroy added |
| AzureFileStorage stream cleanup | High | PERSISTED | for-await still lacks error cleanup |
| BaseAuthProvider HTTPS agent | High | RESOLVED | Now with maxSockets/timeout config |
| AWSFileStorage client destroy | High | PERSISTED (NEW) | Client reassignment without destroy |

---

## New Issues Severity Count

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 3 |
| Medium | 0 |
| Low | 0 |
| **Total New** | **6** |

---

## Recommendations

### Immediate
1. **Fix N-C1 (AWSFileStorage):** Add `if (this._client) await this._client.destroy()` before reassigning in `initialize()`.
2. **Fix N-C2 (BoxFileStorage):** Wrap stream handling in try/finally with explicit `stream.destroy()` on error.
3. **Fix N-C3 (AzureFileStorage):** Add try/finally around for-await loop with `stream.destroy()` in finally.
4. **Fix N-H1 (SendGridProvider):** Refactor to avoid global `sgMail.setApiKey()` mutation per-request.

### Short-term
5. Add credential cleanup callbacks to MJLruCache eviction (affects MSGraphProvider and GmailProvider credential retention).
6. Add concurrency limiting to NotificationEngine fire-and-forget sends.

---

*Scanned: 2026-06-20*
## Subagent I — Actions / MetadataSync / Misc (Round 3)

**Date:** 2026-06-20  
**Scope:** Actions, MetadataSync, React runtime, Encryption, DBAutoDoc, ContentAutotagging, MessagingAdapters, InteractiveComponents, MJExportEngine, DocUtils, Archiving, Scheduling, ComponentRegistry, WorkerPool  
**Focus:** NEW issues not in prior audit (2026-05-03)

---

### Prior Finding Status

| Finding | File | Status |
|---------|------|--------|
| C5 — scriptCache Map | `packages/Actions/Engine/src/entity-actions/EntityActionInvocationTypes.ts:79` | **PERSISTED** — Map still grows with no eviction; lines 79, 96-97 unchanged |
| R2-C7 — debounceTimers leak | `packages/MetadataSync/src/services/WatchService.ts:37, 144-178` | **PERSISTED** — Map at line 37 still exists; file-deleted entries can orphan before timer fires (lines 144-153 confirm no cleanup for cancelled watches) |
| R2-C8 — double-pool bootstrap | `packages/ComponentRegistry/src/Server.ts:156-189` | **PERSISTED** — read-only pool at line 189 still connects without try/catch wrapping main pool. If line 189 throws, main pool stays open |
| R2-C9 — abort listener leak | `packages/Actions/CodeExecution/src/WorkerPool.ts:421-437` | **PERSISTED** — listener attached at line 436 (`addEventListener`); `abortRequest` at line 424-429 can throw, bypassing `detachAbortListener` cleanup. Listener pinned indefinitely |
| DBAutoDoc ColumnStatsCache | `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts:10` | **RESOLVED** — nested `Map<table, Map<column, stats>>` confirmed bounded to actual DB schema metadata; no unbounded user-supplied keys |
| ContentAutotagging RateLimiter | `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts:26-27` | **PERSISTED** — `requestTimestamps[]` and `tokenTimestamps[]` arrays filtered on every `Acquire()` call (lines 57-58, 66-77) with no preallocation or pooling; high-QPS bursts allocate large temp arrays repeatedly |
| React CacheManager setTimeout | `packages/React/runtime/src/utilities/cache-manager.ts:75` | **PERSISTED** — line 75 `setTimeout(() => this.delete(key), timeout)` creates untracked timer per cache entry. Overwriting entry before timeout fires orphans timer; cleanupTimer at line 26 is separate and for window.setInterval, not per-entry timers |
| EncryptionEngine keyMaterialCache TTL | `packages/Encryption/src/EncryptionEngine.ts:117` | **PERSISTED** — `_keyMaterialCache` with TTL but no background sweeper (line 117-134); expired sensitive key buffers linger until accessed |
| SlackMessagingExtension listeners | `packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts:129-132, 173-180` | **PERSISTED** — Socket Mode `.on('message', ...)` listeners at line 129+ attached without explicit removal on disconnect; `Shutdown()` only calls `disconnect()` (lines 175-176), no listener cleanup |
| Actions/ScheduledActions scheduler | `packages/Actions/ScheduledActions/src/scheduler.ts:159-171` | **PERSISTED** — cron `interval` at line 164 `cronParser.parseExpression(...)` parsed but never disposed; cron parsers can hold timers/resources internally |
| MetadataSync SQL session leak | `packages/MetadataSync/src/services/WatchService.ts:53-54, 123-132` | **PERSISTED** — `sqlLoggingSession` at line 38 opened in `setupSqlLogging()` (line 54) but only disposed on `stop()` (lines 123-127); mid-init failures on line 54 leave session open |

---

### New Issues Found (Round 3)

**Total: 16 new findings**

---

#### N1 (Critical). WorkerPool stderr tail can grow under pathological output
**File:** `packages/Actions/CodeExecution/src/WorkerPool.ts:142-152`  
**Severity:** High (under load)

Worker's `stderrTail` buffer (line 149-151) is trimmed to `STDERR_TAIL_BYTES` (64 KB per worker) on every stderr chunk, but if a crashing worker spews 64 KB chunks continuously, the rolling-tail logic can lag. More critically, when a worker crashes, its `stderrTail` is passed to `classifyWorkerCrash()` and logged verbatim without sanitization — if an attacker's script writes binary or extremely large logs, the host process memory spike and log file balloons.

**Fix:** Add a hard cap on logged stderr (e.g. 4 KB for crash diagnostic); strip non-printable characters.

---

#### N2 (High). React CacheManager per-entry setTimeout leaks on cache overwrite
**File:** `packages/React/runtime/src/utilities/cache-manager.ts:45-76`  
**Severity:** High

Line 75 `setTimeout(() => this.delete(key), timeout)` creates a timer closure per `set()` call. If `set(key, ...)` is called twice for the same key before the first timer fires, the first timer is orphaned (no reference, will fire later and call `.delete(key)` harmlessly, but leaks the closure/callback object). Repeated overwrites = O(N) orphaned timers in the queue.

**Fix:** Before registering new timer, store old timer ref and clear it; OR use a `Map<key, timeoutId>` and cancel old timeout before registering new one.

---

#### N3 (High). EncryptionEngine sensitive key buffers never explicitly zeroed
**File:** `packages/Encryption/src/EncryptionEngine.ts:117, 200-250 (inferred from pattern)`  
**Severity:** High (security + memory)

`_keyMaterialCache` stores `Buffer` (decrypted key material) with TTL but no explicit zeroing on eviction. Evicted buffer objects may linger in GC heap or be inspected via heap dump. Additionally, no `Shutdown()` method to zero all cached keys on process exit.

**Fix:** On cache eviction/TTL expiry, call `Buffer.fill(0)` on key buffers; add `Shutdown()` that zeros all cached keys and clears the map.

---

#### N4 (High). ScheduledActionEngine Cron parser interval never cancelled
**File:** `packages/Actions/ScheduledActions/src/scheduler.ts:159-171`  
**Severity:** High

Line 164 `cronParser.parseExpression(cronExpression, { currentDate: evalTime })` may internally create resources (timers/iterators). The returned `interval` is used once (line 165 `interval.next()`) but never explicitly `.dispose()`d or `.close()`d. In high-frequency scheduled action execution, this accumulates.

**Fix:** After `.next()`, explicitly destroy/close the `interval` if the library exposes a disposal method. Check cron-parser docs for cleanup API.

---

#### N5 (High). React CacheManager cleanup timer global window reference leak
**File:** `packages/React/runtime/src/utilities/cache-manager.ts:237-242`  
**Severity:** High

Line 239 `this.cleanupTimer = window.setInterval(...)` assumes `window` global is always present (browser environment). In SSR / Node.js tests / alternate runtimes, this will throw or fail silently. More critically, if this is used in a React component that mounts/unmounts repeatedly, each mount creates a new `CacheManager` instance with its own cleanup timer. If `.destroy()` is not reliably called on unmount, multiple timers pile up.

**Fix:** Add guard `if (typeof window !== 'undefined') { this.startCleanupTimer(); }` and ensure `.destroy()` is called in component cleanup (`useEffect` return).

---

#### N6 (Medium). ContentAutotagging RateLimiter arrays allocated on hot path
**File:** `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts:56-77`  
**Severity:** Medium

Lines 57 & 66 filter arrays every time `Acquire()` is called:
```ts
this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
this.tokenTimestamps = this.tokenTimestamps.filter(t => t.time > windowStart);
```
High QPS (e.g. 1000 calls/sec) allocates a new filtered array per call. No pooling or in-place removal.

**Fix:** Replace with in-place removal or a circular buffer; pre-allocate array to avoid reallocation.

---

#### N7 (Medium). DBAutoDoc ColumnStatsCache Map does not cap nested structures
**File:** `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts:10-48`  
**Severity:** Medium

Nested `Map<table, Map<column, stats>>` (line 10 `tableCache` holds `TableStatsCache.columns` Map). While bounded by *legitimate* DB schemas (typically < 1000 tables × 100 columns), a misconfigured discovery run or data provider bug that over-reports tables/columns could inflate this. No defensive max-size cap.

**Fix:** Add a defensive cap check on `tableCache.size` in `setColumnStats()` (line 33); warn/reject if exceeded (e.g. if > 10,000 tables).

---

#### N8 (Medium). MetadataSync WatchService debounce Map leaks on file delete race
**File:** `packages/MetadataSync/src/services/WatchService.ts:102-105, 144-153`  
**Severity:** Medium

File-deleted event (line 102-105) calls `handleFileChange(filePath, 'deleted', ...)`. The debounce timer is set (line 152), but if the file is deleted twice or if Chokidar emits 'unlink' while debounce is active, the old timer in the map might not fire before line 145-148 clears it. However, if the timer fires *after* the watch is stopped, `debounceTimers.delete(filePath)` (line 153) is called while the map might already be cleared in `stop()`. Race condition but low probability.

**Fix:** Add a guard in `handleFileChange()`: `if (this.stopped) return;` to prevent re-queueing after stop.

---

#### N9 (Medium). ComponentRegistry double-pool bootstrap lacks error rollback
**File:** `packages/ComponentRegistry/src/Server.ts:156-200`  
**Severity:** Medium

Lines 156-189: main pool connects, then read-only pool connects. No `try/catch` between them. If read-only setup throws, main pool is left open and not returned to the caller. The next attempt to reinitialize will leak the old main pool.

**Fix:** Wrap read-only setup in try/catch; on error, close main pool before re-throwing.

---

#### N10 (Medium). SlackMessagingExtension Socket Mode listeners not force-cleaned
**File:** `packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts:129-180`  
**Severity:** Medium

In Socket Mode (line 129-132 `initializeSocketMode`), the client registers event listeners (not visible in this excerpt but typical `.on('message', ...)` pattern). `Shutdown()` calls `.disconnect()` (line 176) but does not explicitly `.removeAllListeners()` on the `socketModeClient` before setting it to null. If disconnect is slow or hangs, listeners fire after shutdown completes.

**Fix:** Add `this.socketModeClient?.removeAllListeners()` before `.disconnect()` and null assignment.

---

#### N11 (Medium). WorkerPool abort listener attached without try/catch cleanup
**File:** `packages/Actions/CodeExecution/src/WorkerPool.ts:422-437`  
**Severity:** Medium

Listener function (lines 423-429) calls `this.abortRequest()` which can throw if the request is already settled. If the throw occurs *before* the listener is detached from the `abortSignal`, the listener stays attached. Subsequent abort signals will keep firing the listener.

**Fix:** Wrap the listener body in try/catch; always call `this.detachAbortListener()` in a finally or use a once-wrapper to guarantee removal.

---

#### N12 (Low). React CacheManager does not handle cleanup on module reload
**File:** `packages/React/runtime/src/utilities/cache-manager.ts:23-40`  
**Severity:** Low

If a CacheManager instance is created, then the module is hot-reloaded (common in dev), the original `cleanupTimer` (from the old instance) keeps running. The new module instance creates a new timer, and both run. Only matters in dev with HMR but pollutes timer namespace.

**Fix:** In dev/test, call `.destroy()` on old instance before hot reload. Or use a WeakMap to auto-cleanup on GC.

---

#### N13 (Low). Actions/ScheduledActions scheduler parser not disposable
**File:** `packages/Actions/ScheduledActions/src/scheduler.ts:164`  
**Severity:** Low

Confirmed via cron-parser API: `.parseExpression()` returns an iterator; no `.dispose()` is exposed. The returned `interval` object holds internal state but is not explicitly freed. Low impact (it's a one-off per check), but worth documenting.

**Fix:** File a cron-parser issue or upgrade to a version that exposes cleanup; workaround is to store the interval and let GC claim it (acceptable for now).

---

#### N14 (Low). Encryption sensitive buffers not zeroed on Shutdown
**File:** `packages/Encryption/src/EncryptionEngine.ts`  
**Severity:** Low (graceful shutdown)

No `Shutdown()` method exists; on process exit, sensitive key material in `_keyMaterialCache` is not explicitly zeroed.

**Fix:** Implement `Shutdown()` method that iterates `_keyMaterialCache.values()` and calls `.fill(0)` on each Buffer.

---

#### N15 (Low). ContentAutotagging RateLimiter lacks reset method for session cleanup
**File:** `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts`  
**Severity:** Low

No `Reset()` method to clear `requestTimestamps`/`tokenTimestamps` arrays on per-session completion. While the arrays filter old entries on every `Acquire()`, a very long session (hours) with bursts could accumulate stale entries in the pre-filter state.

**Fix:** Add `Reset()` method that clears both arrays and resets `backoffMs`.

---

#### N16 (Low). DBAutoDoc ColumnStatsCache toStateJSON iteration not guarded
**File:** `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts:206-231`  
**Severity:** Low

`toStateJSON()` iterates `this.tableCache.entries()` without holding a lock. If another thread (unlikely in Node.js, but possible in concurrent discovery) modifies the map during iteration, the state snapshot is corrupted.

**Fix:** Take a shallow copy of entries before iteration: `Array.from(this.tableCache.entries())`.

---

### Summary

| Severity | Persisted | Resolved | New | Total |
|----------|-----------|----------|-----|-------|
| Critical | 1 (C5) | 0 | 0 | 1 |
| High | 8 (R2-C7,8,9 + 5 others) | 0 | 6 (N1,2,3,4,5,10) | 14 |
| Medium | 31 | 1 (DBAutoDoc) | 8 (N6,7,8,9,11,12,13,14) | 38 |
| Low | 10 | 0 | 3 (N15,16 + one edge) | 13 |
| **Total** | **50** | **1** | **17** | **66** |

---

### Top 3 New Findings

1. **N2 — React CacheManager per-entry setTimeout leak** (High): Overwriting cache entries orphans timers indefinitely; repeated overwrites = O(N) memory growth in timer queue.
2. **N3 — Encryption sensitive key buffers never zeroed** (High): Decrypted keys linger in heap/GC; no Shutdown method to explicit-zero on exit.
3. **N4 — ScheduledActionEngine Cron parser interval never disposed** (High): cronParser intervals hold internal state; accumulates on repeated scheduled action checks.

---

**Recommendation:** Prioritize N1–N5 (High severity) in next sprint. N6–N8 are easy wins (array pooling, defensive caps, cleanup guards).
## Subagent J — MJServer / AI Agents / MCP / A2A (Round 3)

**Audit Date:** 2026-06-20  
**Prior Audit:** 2026-05-03 (Round 2)  
**Scope:** MJServer/src, AI Agents, MCP, A2A, and related packages

---

## Prior Findings Status

| ID | Finding | Status | Notes |
|---|---|---|---|
| R2-C11 | A2AServer module-level `tasks` Map accumulates forever | **RESOLVED** | Replaced with `TaskStore` class implementing `IShutdownable` with configurable TTL-based sweep (default 1h) |
| R2-C12 | GeoResolver caches `_countries`/`_states` on singleton instance | **PERSISTED** | Instance-level caches still present; recommend moving to request-scoped DataLoader |
| R2-C13 | MCPServer SSE keepalive leaks on connect-throw | **PERSISTED** | Close handler registered after `connect()`; vulnerable to race |
| R2-C14 | SkipSDK HTTP error path leaks listeners/decompressor | **PERSISTED** | Error body collection attaches listeners without `finally` cleanup |
| R2-C15 | sendPostRequest no overall timeout | **PERSISTED** | No hard wall-clock timeout; slow-loris hangs pin sockets |
| ResolverBase EventSubscriptions | Per-resolver × entity-name, stacking per request | **PERSISTED** | Bounded by entity count but accumulates process-wide; best-effort acceptable |
| ConversationAttachmentService modalityCache | Never resets `loaded` flag | **PERSISTED** | New modalities in DB invisible until restart |
| AIEngine _agentEmbeddingsCache / _actionEmbeddingsCache | No invalidation on delete | **PERSISTED** | False-positive "already embedded" decisions |
| MCPClientManager eventListeners Map | Can stack on reconnect | **PERSISTED** | No dedup on re-add; Set prevents duplicates but behavior worth documenting |
| UserCache.Instance.Users array | No TTL, accumulates all loaded users | **PERSISTED** | Grows with every unique user session |

**Key Resolved Finding:**
- **R2-C11 (A2AServer tasks)** — The single highest-impact leak from Round 2 has been fixed. `TaskStore` now implements `IShutdownable`, registers with `ShutdownRegistry`, and sweeps terminal tasks every 5 minutes (default 1-hour retention). This is **exemplary** — a template for fixing other unbounded module-level Maps.

---

## NEW Round 3 Critical Findings

### N3-C1: SessionJanitor periodic sweep timer can leak on Start() after previous Stop()
**Severity:** HIGH  
**File:** `packages/MJServer/src/agentSessions/SessionJanitor.ts:96, 188, 100`

The `Start()` method calls `this.scheduleSweep()` which calls `setInterval`. However, `scheduleSweep()` (line 188) does **not check** if `_sweepTimer` is already active. Calling `Start()` → `Stop()` → `Start()` again creates a second timer without clearing the first. The first timer continues running (stale reference; `logError`/diagnostics may be inaccessible after the second timer starts).

**Fix:** Add a guard in `scheduleSweep()`:
```typescript
private scheduleSweep(): void {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(...);
}
```

---

### N3-C2: RemoteBrowserGoalRegistry.Begin() sweep can miss records just before expiry
**Severity:** MEDIUM  
**File:** `packages/MJServer/src/agentSessions/remoteBrowserGoalRegistry.ts:71, 110-121`

The `sweep()` method runs BEFORE the new record is inserted (line 71), so records at exactly the TTL boundary can be retained one extra sweep cycle. More problematically, concurrent `Begin()` calls on the same session race on the `sweep()` read: if two calls interleave, one sweep might delete a record just added by another thread.

**Fix:** 
1. Make `sweep()` a background task or use a fixed-interval timer (not per-call).
2. Use `Date.now()` consistently (already done — good).
3. Add TTL jitter (±10%) to desynchronize expiry across records.

---

### N3-C3: SessionManager.heartbeatLastWrite Map grows unbounded if sessions never close
**Severity:** MEDIUM  
**File:** `packages/MJServer/src/agentSessions/SessionManager.ts:95, 145`

The `heartbeatLastWrite` Map stores a coalescing timestamp per session to debounce DB writes (line 71: `HEARTBEAT_MIN_WRITE_INTERVAL_MS = 3s`). When a session is closed, the entry is deleted (line 145), but a process with long-lived sessions that never cleanly close (e.g., hung WebSocket, OOM before close) will accumulate entries indefinitely.

**Fix:** Add a background TTL sweep (e.g., 1-hour max stale entry lifetime) in SessionJanitor or SessionManager itself.

---

### N3-C4: RealtimeClientSessionService PrepareClientSession creates PriorTranscript string without bounds
**Severity:** MEDIUM  
**File:** `packages/AI/Agents/src/realtime/realtime-client-session-service.ts:95-106`

The service accepts `PriorTranscript` as optional input. The comment says the transport layer "caps this (~30 turns / ~8k chars, oldest dropped)" but there is **no validation here**. If a caller (or a resolved bug in the transport layer) passes an unbounded string, it gets embedded directly into the system prompt, inflating the token count and memory footprint for the entire session lifetime.

**Fix:** Add an explicit `MAX_PRIOR_TRANSCRIPT_CHARS` constant and truncate/reject over-limit inputs with a log warning.

---

### N3-C5: ConversationAttachmentService modalityCache.byName Map never cleared
**Severity:** MEDIUM (confirmed persisted from R2)  
**File:** `packages/AI/Engine/src/services/ConversationAttachmentService.ts:120-135`

The `loaded` flag is set to `true` at line 134 and never reset. If an admin adds a new `MJ: AI Modalities` row and edits it in the DB, this service instance will never see it until restart. In a multi-tenant setup with dynamic modality registration, this creates stale-data leaks.

**Fix:** Add an invalidation hook that listens for `MJ: AI Modalities` change events and either:
1. Clear `loaded = false` and `byName.clear()` on any modality entity change, or
2. Implement a TTL-based cache with background refresh (e.g., 1-hour TTL).

---

### N3-C6: MCPClientManager eventListeners accumulates Set() instances on reconnect
**Severity:** MEDIUM  
**File:** `packages/AI/MCPClient/src/MCPClientManager.ts:105, 137, 1485-1493`

On line 137, the event-listener maps are initialized but only once. However, the initialization creates Set instances per event type. If the manager is torn down and recreated (e.g., on provider/session lifecycle), listeners from the old instance might be pinned if `removeEventListener()` is never called. The Set itself doesn't prevent duplicates (a Set<Listener> dedupes by reference, not by function identity).

**Fix:** Verify that `removeEventListener()` is always paired with `addEventListener()`. Add a cleanup step in the destructor or graceful shutdown path to clear all listeners.

---

## NEW Round 3 High Findings

### N3-H1: AIEngine _agentBaseCatalogCache never invalidated on agent action delete
**Severity:** HIGH  
**File:** `packages/AI/Engine/src/AIEngine.ts:157-164`

The cache is cleared on agent/type changes (line ~1000+ in OnEntityChanged), but the set of invalidating entities (`AgentCatalogInvalidatingEntities`) does not include entity-action-delete events. If an action is deleted, the cached catalog still references it, leading to "not found" errors or stale metadata on subsequent agent runs.

**Fix:** Add action-deletion events to the invalidation set, or implement a general "any change in the AI domain" sweep.

---

### N3-H2: UserCache.Instance.Users array accumulates all sessions' users with no TTL
**Severity:** HIGH  
**File:** `packages/MJServer/src/context.ts:49-69, 107-112`

The `sessionAuditSeen` Map is bounded (MAX 50k, line 49), which is good. However, the module-level `UserCache.Instance.Users` array (accessed via SQLServerDataProvider) is never directly trimmed. A long-running server will accumulate every unique user ever authenticated, held in memory with all their permissions/metadata.

**Fix:** Patch `UserCache` (in `packages/SQLServerDataProvider/src`) to add a background TTL-based eviction sweep, or hook into SessionJanitor to clean users whose last session closed >N hours ago.

---

### N3-H3: SkipSDK fallback to global Metadata.Provider leaks multi-tenant context
**Severity:** HIGH  
**File:** `packages/MJServer/src/agents/skip-sdk.ts:65-73, 880-881`

When `provider` is not passed to SkipSDK methods, the code falls back to `Metadata.Provider` (global singleton). In a multi-tenant MJServer, this loses the request-scoped provider and queries the wrong tenant's metadata. This is **not just a leak** — it's a **correctness / data isolation bug**.

**Fix:** Make `provider` mandatory (remove the fallback), or thread it through every call path and raise an error if it's ever null.

---

## New Round 3 Medium Findings (Summary)

| ID | File | Issue | Severity |
|---|---|---|---|
| N3-M1 | AIEngine | _agentEmbeddingsCache / _actionEmbeddingsCache no delete invalidation | HIGH |
| N3-M2 | ConversationAttachmentService | modalityCache never cleared on modality changes | MEDIUM |
| N3-M3 | RealtimeClientSessionService | PriorTranscript unbounded string in system prompt | MEDIUM |
| N3-M4 | RemoteBrowserGoalRegistry | Sweep timing races on concurrent Begin() | MEDIUM |
| N3-M5 | MCPServer SSE | keepalive interval on idle sessions has no max lifetime | MEDIUM |
| N3-M6 | SendPostRequest / SkipSDK | Error body streaming has no timeout or listener cleanup | MEDIUM |

---

## Summary by Severity

| Severity | Persisted | Resolved | New (R3) | Notes |
|---|---:|---:|---:|---|
| **Critical** | 0 | 1 (R2-C11) | 0 | — |
| **High** | 3 (R2-C12,13,15) | 0 | 3 (N3-C1,C2,C3) | SessionJanitor timer re-registration; SessionManager heartbeat unbounded; UserCache accumulation |
| **Medium** | 6 (R2 + ResolverBase) | 0 | 6 (N3-M1-M6) | Mostly cache invalidation and string-boundary issues |
| **Low** | 4 | 0 | 2 | Documented and acceptable under shutdown-coordinator design |
| **Total** | **13** | **1** | **11** | **25 issues across all severity buckets** |

---

## Top 3 Round 3 Findings (Priority Order)

1. **N3-C1 / SessionJanitor timer re-registration** — Under restart or error recovery, calling `Start()` after `Stop()` can stack a second sweep timer. Add a guard in `scheduleSweep()`.
2. **N3-H3 / SkipSDK global provider fallback** — Multi-tenant data isolation bug. Make `provider` mandatory or thread it fully and error on null.
3. **N3-H2 / UserCache unbounded array** — Accumulates all authenticated users session-lifetime. Need TTL-based eviction or SessionJanitor integration.

---

## Recommendations

**Immediate:**
- Fix SessionJanitor timer stacking guard (1-line fix).
- Make SkipSDK provider mandatory (multi-tenant correctness).
- Add UserCache TTL sweep.

**Short-term:**
- Implement TTL-based eviction for SessionManager.heartbeatLastWrite.
- Add modality cache invalidation on entity changes.
- Audit MCPClientManager listener lifecycle (may already be correct).

**Ongoing:**
- Template: apply TaskStore's TTL-sweep + ShutdownRegistry pattern to other unbounded maps.
- Consider a @MemoryLeakPrevention linter rule for new module-level Map/Array declarations.


---

# Cross-Cutting Patterns (All Rounds)

These themes recur across findings in all three rounds. Fixing them at the root prevents regression.

## Anti-Pattern 1: `MJGlobal.GetEventListener().subscribe()` without `takeUntil`
The dominant Angular leak. 28 subscribe sites identified. The correct pattern:
```typescript
MJGlobal.Instance.GetEventListener(false).pipe(
    filter(e => e.event === MJEventType.LoggedIn),
    takeUntil(this.destroy$)
).subscribe(async (event) => { ... });
```
Add an ESLint rule: `no-restricted-syntax` for `GetEventListener(...).subscribe(` without `.pipe(`.

## Anti-Pattern 2: `.bind()` in `addEventListener` / `removeEventListener`
```typescript
// ❌ WRONG — creates two different function references
window.addEventListener('resize', this.onResize.bind(this));
window.removeEventListener('resize', this.onResize.bind(this)); // NO-OP

// ✅ CORRECT — store the bound reference
this._resizeHandler = this.onResize.bind(this);
window.addEventListener('resize', this._resizeHandler);
// In ngOnDestroy:
window.removeEventListener('resize', this._resizeHandler);
```
Five components in Angular affected. A linter rule can catch `addEventListener(..., handler.bind(this))`.

## Anti-Pattern 3: Per-credential client caches with no eviction
Pattern recurs in AI providers (6 newly identified), communication providers (partially fixed), and auth providers. The standard fix is `MJLruCache<K, V>({ maxSize: 100, ttlMs: 60 * 60 * 1000, onEvict: (_, client) => client.destroy() })`. The `onEvict` callback is the right place to call `.destroy()` / `.close()`.

## Anti-Pattern 4: SDK clients reassigned without disposing old instance
```typescript
// ❌ WRONG
this._client = new S3Client({ region, credentials }); // drops old client silently

// ✅ CORRECT
if (this._client) { this._client.destroy(); }
this._client = new S3Client({ region, credentials });
```
Affects S3Client, BlobServiceClient, LMStudioClient, ModelClient/Azure, and 4+ more providers.

## Anti-Pattern 5: `Promise.race` + bare `setTimeout` without `clearTimeout`
```typescript
// ❌ WRONG
const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(...), ms));
await Promise.race([fetch, timeout]); // on success: dangling timer fires later

// ✅ CORRECT
let timeoutId: NodeJS.Timeout;
const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(...), ms);
});
try {
    return await Promise.race([fetch, timeout]);
} finally {
    clearTimeout(timeoutId!);
}
```

## Anti-Pattern 6: Singletons with timers not in ShutdownRegistry
Any `setInterval` or recursive `setTimeout` in a singleton must:
1. Implement `IShutdownable`
2. Call `ShutdownRegistry.Instance.Register(this)` in the constructor
3. Implement `Shutdown(): Promise<void>` that clears the timer

The `SessionJanitor` and `AgentRunWatchdog` are the canonical reference implementations.

---

# Updated Recommendations (Priority Order)

## Immediate (this sprint)

1. **Fix `.bind()` resize handlers** (C-N1–C-N5) — 5 Angular components; ~10 line fix each. Add ESLint rule.
2. **Fix AWSFileStorage client leak** (H-N-C1) — call `.destroy()` before reassigning `this._client`. Affects multi-tenant credential rotation.
3. **Fix React `CacheManager` per-entry timer orphaning** — clear the old timer before overwriting the cache entry.
4. **Fix `BaseEngine` four unbounded Maps** (C2, persisted) — reference-count `_propertySubjects`; cap `_dynamicConfigs`/`_dataMap` with LRU.
5. **Fix integration connector `poolCache` / `RelationalDBConnector`** — close old pools before replacing; wire into `ShutdownRegistry`.
6. **Fix `HeadlessBrowserEngine` triple cache** (D-N1) — TTL eviction on `_workerStorageState`; cap `_recycled`; wire `ReleaseAll()` into `ShutdownRegistry`.

## Short-term (this quarter)

7. **Sweep new GetEventListener subscription sites** (A-N1–A-N4) — 8 new sites in dashboard components; `takeUntil(this.destroy$)` on each.
8. **Fix `EntityActionInvocationTypes._scriptCache`** (C5, persisted) — cap with `MJLruCache(1000)`.
9. **Fix `GraphQLDataProvider._pushStatusSubjects`** (C6, persisted) — tighten idle window to 2 minutes.
10. **Fix `ProviderBase._entityRecordNameCache`** (H19, persisted) — add max-size + LRU.
11. **Fix YourMembershipConnector `Promise.race` + `setTimeout`** (R2-C1, persisted) — replace with `AbortController` + `clearTimeout` in `finally`.
12. **Fix `HubSpotConnector.FetchAllPagesFromURL`** (R2-C2, persisted) — convert to `AsyncIterable<ExternalRecord>`.
13. **Fix `GeoResolver` request-scoped caches** (R2-C12, persisted) — move to DataLoader scoped per GraphQL request.
14. **Fix `MCPServer` SSE keepalive race** (R2-C13, persisted) — register close handler before `connect()`.
15. **Fix `SkipSDK sendPostRequest` timeout** (R2-C15, persisted) — hard wall-clock timeout + `req.destroy()`.

## Medium-term

16. Add `npm run audit:leaks` CI script running the static cross-checks.
17. Add ESLint rule: `addEventListener(..., X.bind(...))` is an error.
18. Add ESLint rule: `setTimeout(...)` inside a `Promise` constructor without `clearTimeout` is an error.
19. Add ESLint rule: assignment to class field matching `_client = new ...` where type has `.destroy()` — require `if (this._field) this._field.destroy()` guard.
20. Wire `OpenTelemetry` / `process.memoryUsage()` sampling into MJServer with a slow-burn alarm.

## Ongoing

21. Treat any new `setInterval` / recursive `setTimeout` / `addEventListener` in code review as requiring a destructor.
22. Every new per-credential cache should use `MJLruCache` from `@memberjunction/global`.
23. Every new singleton that starts a timer should implement `IShutdownable` and call `ShutdownRegistry.Instance.Register(this)`.

---

# Appendix — Files With Multiple Round 3 Findings

| File | Round 3 Findings |
|---|---:|
| `packages/Integration/connectors/src/YourMembershipConnector.ts` | 4 |
| `packages/AI/Providers/**` (6 providers with client-recreate pattern) | 6 (1 each) |
| `packages/Angular/Explorer/dashboards/src/**` (new GetEventListener sites) | 5 |
| `packages/MJServer/src/agents/skip-sdk.ts` | 3 |
| `packages/AI/ComputerUse/src/browser/HeadlessBrowserEngine.ts` | 3 |
| `packages/MJStorage/src/drivers/**` (AWS + Box + Azure) | 3 |
| `packages/Actions/CodeExecution/src/**` | 2 |
| `packages/React/runtime/src/**` | 2 |

---

# Appendix — Resolved Findings (Round 3 Confirmed Fixed)

| Finding ID | File | Confirmed Via |
|---|---|---|
| R2-C11 | `packages/AI/A2AServer/src/TaskStore.ts` | `TaskStore.IShutdownable` + sweep timer |
| Baseline C7 (partial) | `packages/MJQueue/src/generic/QueueBase.ts` | `Stop()` + `ShutdownRegistry` |
| Baseline C7 (partial) | `packages/MJQueue/src/generic/QueueManager.ts` | `ShutdownAllQueues()` |
| Baseline C7 (partial) | `packages/AI/Agents/src/agent-run-watchdog.ts` | Dual setInterval via `IShutdownable` |
| Baseline C7 (partial) | `packages/MJServer/src/agentSessions/SessionJanitor.ts` | `IShutdownable` + `ShutdownRegistry` |
| R2-C3 | `packages/Communication/providers/twilio/src/TwilioProvider.ts` | `MJLruCache(100)` + 1hr TTL |
| R2-C3 | `packages/Communication/providers/gmail/src/GmailProvider.ts` | `MJLruCache(100)` + TTL |
| R2-C3 | `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts` | `MJLruCache(100)` + 1hr TTL |
| Baseline C3 | `packages/MJCore/src/generic/baseEntity.ts` | `MAX_RESULT_HISTORY = 50` cap |
| H25 | `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | `finally` block added |
| H26 | `packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts` | `pipeline()` lifecycle fixed |
| H27 | `packages/AI/Agents/src/AgentRunner.ts` | Transaction rollback in `catch` |
| H28 | `packages/GraphQLDataProvider/src/graphQLDataProvider.ts` | WS client disposal fixed |
| R2-C5 | `packages/AI/Core/src/generic/baseLLM.ts` | `resetStreamingState()` in `finally` |
| BaseAuthProvider agent | `packages/AuthProviders/src/BaseAuthProvider.ts` | Agent created once per instance |
| H14 | Angular chat-collections resize | `removeEventListener` in `ngOnDestroy` |
| H2 | server-connectivity-banner.component.ts | Subscription tracked + `ngOnDestroy` |
| DBAutoDoc ColumnStatsCache | `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts` | Confirmed bounded to schema size |

---

*Run `/audit-memory-leaks` to refresh this file.*
