# MemberJunction Memory & Resource Leak Audit

**Generated:** 2026-05-03
**Scope:** Full monorepo (69 packages)
**Tooling:** Parallel multi-agent static analysis across five leak categories
**Re-run command:** `/audit-memory-leaks` (see `.claude/commands/audit-memory-leaks.md`)

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

- `LocalCacheManager` — eviction sweep `setInterval` ([packages/MJCore/src/generic/localCacheManager.ts:2237](../../packages/MJCore/src/generic/localCacheManager.ts))
- `SchedulingEngine` — recursive polling `setTimeout` ([packages/Scheduling/engine/src/ScheduledJobEngine.ts:185](../../packages/Scheduling/engine/src/ScheduledJobEngine.ts))
- `ArtifactBuilderService` — 5-minute cleanup `setInterval` ([packages/Actions/CoreActions/src/custom/utilities/artifact-builder-service.ts:444](../../packages/Actions/CoreActions/src/custom/utilities/artifact-builder-service.ts))
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

- Spawn five parallel `Explore` subagents covering the same five categories
- Diff against this baseline report (in `reports/memory-leaks/`)
- Highlight new leak sites and resolved ones
- Update or replace `reports/memory-leaks/MEMORY_LEAK_AUDIT.md`

Run with:

```
/audit-memory-leaks
```

Optional arguments:

```
/audit-memory-leaks summary           # one-page diff vs baseline
/audit-memory-leaks detailed          # full report (default)
/audit-memory-leaks <category>        # one of: rxjs, timers, listeners, caches, connections
/audit-memory-leaks <package-path>    # narrow scope (e.g. packages/AI)
```

The report at `reports/memory-leaks/MEMORY_LEAK_AUDIT.md` is the **baseline**; subsequent runs produce dated snapshots in `reports/memory-leaks/snapshots/YYYY-MM-DD.md` and a diff in `reports/memory-leaks/CHANGES.md`.

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
