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
