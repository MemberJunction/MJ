# @memberjunction/redis-provider

## 6.2.0-edge.2

### Patch Changes

- e9bdb16: CI now runs RedisProvider's integration suites against a real Redis, and fails when they skip.

  Those files are gated `describe.skipIf(!REDIS_URL)`, which in CI did not report a gap — it reported
  success: every test skipped, the file passed, and the summary looked identical to a real run. The
  shared-cache behaviour they pin (index-group pruning, per-category TTL, the key lock, leases) had no
  CI coverage as a result.

  The unit shards now start a `redis:7-alpine` service with a health check and a per-run key prefix, and
  the shard that draws this package runs `.github/scripts/check-redis-suites-ran.mjs`, which re-runs the
  gated files and requires a non-zero passed count and zero skipped. The guard discovers the files by
  naming convention rather than listing them, so it neither breaks on a file that has not landed yet nor
  silently ignores one that has.

  No runtime behaviour changes.

- ea4080e: fix: an agent completion reaches the conversation even when the WebSocket dies without closing (MJ#4222)

  On an unstable connection, sending a message to an agent left the message spinning forever: status updates stopped, the elapsed timer counted up with no ceiling, and no error appeared. The agent ran fine and its answer persisted; only a refresh revealed it.

  The cause was not a missing timeout but a single point of failure. Five recovery mechanisms — graphql-ws `retryAttempts`, `GraphQLDataProvider._socketStateSubject`, Explorer's `ServerConnectivityService`, `ConversationStreaming.scheduleReconnection()` and `FireAndForgetHelper.onStreamEnd` — were all triggered by the socket `closed` event, and the failure mode is precisely "the socket never closes". They failed together. graphql-ws re-arms its keepalive only on pong receipt, so a half-open socket gets one ping and then permanent silence; its own JSDoc says nothing happens automatically if the server never responds.

  **Transport.** `getOrCreateWSClient()` now arms a pong watchdog on each ping it sends and calls `client.terminate()` if no pong returns, producing a real `4499` close that the existing retry apparatus can act on. Each client owns its own pong timer, and a close from a client that has already been replaced is ignored, so one socket can never terminate or disarm its replacement. `connectionAckWaitTimeout` is set, and `keepAlive` drops to 10s, making detection ~14s in practice instead of never. MJServer passes its `useServer` keepAlive explicitly rather than relying on an invisible library default.

  **Recovery triggers.** New `ConversationLiveness` (L0, no Angular) aggregates socket reconnect, stream re-subscribe, tab-visible and browser-online into one coalesced reconciliation request, throttled leading-edge at 500ms. `ng-conversations` adds a root-provided DOM bridge and `ReconcileNow()`, which refreshes agent runs **before** comparing status — without that the comparison reads the stale in-memory map the outage froze and silently no-ops. The reconciliation path runs over HTTP, so it repairs a message while the socket is still dead.

  **Durable read model.** New `TailConversationEvents` query over existing `AIAgentRunStep` rows — no table, no migration. The cursor never rewinds, events are capped at 200, authorization is delegated to `RunView` as the calling user through the request's read-only provider, and not-found and not-authorized are indistinguishable. Only the columns an event carries are read, never the step's input, output or payload columns. A run `Paused` on a still-running workflow reports `IsInFlight: true`, and a failed call does too, because it knows nothing about the run. `FinalPayload` falls back to the conversation detail's message because `AIAgentRun.Result` is agent-dependent and null on many successful runs; callers must decide terminality from `IsInFlight`/`DetailStatus`, never from its presence. `GraphQLConversationClient` and `ConversationTail` hold a per-message cursor that advances only on a successful read. When the tail call fails, for example a new client against an older server, the client completes a message from its run list as it did before.

  **Cross-instance delivery.** Push-status updates now carry `SourceServerId` and fan out over Redis through a generic `PublishMessage`/`SubscribeToChannel` pair on `RedisLocalStorageProvider`, closing the case where the mutation lands on one replica and the browser's socket on another. Inbound messages are type-checked, then republish onto the local topic and still pass the identity filter, so a replica never decides who sees what. Streaming deltas are deliberately not replicated. Measured: 5 push frames delivered cross-replica with Redis, 0 without — and the message still completed without it, so fan-out is a latency optimization rather than a requirement.

  **Deployment order.** A client deployed before the server gets a failed tail call on every reconcile and falls back to the run list, which cannot see the conversation detail's own status. The liveness pulse (`DEFAULT_PULSE_INTERVAL_MS`, 5 min → 60 s in MJServer) and the client's idle window (`DEFAULT_IDLE_TIMEOUT_MS`, 12 min → 3 min in GraphQLDataProvider) are a matched pair in separate packages. Ship the server first or with the client: a client on the 3-minute window against a server still pulsing every 5 minutes times out on every pulse gap. `DEFAULT_MAX_STALL_RECONCILES` stays at 6, so the give-up horizon moves from roughly 72 minutes to roughly 18.

  **Honest UI.** The message time pill degrades `live → checking → stalled`, with thresholds anchored to the agent watchdog's own 30s heartbeat and 5-minute stale threshold rather than invented values. Silence is measured from the last push frame the browser received for the run or the message, including the server's 60s liveness pulse, and from the run's database timestamps when the run was re-read. Progress frames carry the server's in-memory run, whose timestamps do not move until the run ends, so they cannot be the only signal. A row with no MJ agent run, such as one written by a host's own turn handler, stays live while frames that name it arrive. The database timestamp is bounded by how long the component has been watching, so browser-versus-database clock skew cannot invent a stall. While HTTP works, a dead socket alone does not degrade the pill: each reconcile re-reads the run and its fresh heartbeat. The connectivity banner reports the socket. The pill's one-second timer stops whenever nothing is in flight.

  A quiet pill's request for a re-check goes through the same 500ms coalescing trigger as the transport signals, and only one reconcile pass runs at a time. A request that arrives during a pass shares it and schedules one follow-up, so no request is lost and no message is completed twice.

  Also fixes three defects found by manual testing that unit tests missed, each an instance of the same pattern as the original bug — a mechanism wired to a signal the failure mode suppresses: liveness was computed only in `ngDoCheck`, which `detectChanges()` does not re-invoke; `agentRunMap` was absent from `message-list`'s `ngOnChanges`, so a refreshed heartbeat never reached the rendered bubble; and the reconnection backoff reset on every re-subscribe, which succeeds against a dead socket, pinning the delay at its base value and leaving the escalation inert. The backoff escalates to a 60s ceiling and retries for the life of the page; it has no attempt cap, because no host calls `initialize()` outside `ngOnInit`, so a stream that stopped retrying would stay stopped until a reload. Up to 20% is taken off each delay at random so tabs do not retry in lockstep, and the backoff clears when the socket reports `connected`, which follows the server's acknowledgement, so a quiet healthy stream does not start its next outage at the ceiling.

  Two further defects this surfaced, both fixed here. Explorer's connectivity warning cleared on an HTTP 200 from `/healthcheck`, before the socket was back — reachable over HTTP and able to carry frames are different properties, and a half-open socket satisfies the first while dropping every push. The warning now clears when the socket itself reports `connected`, and a `degraded` flag makes that sticky so the transient `unknown` emitted by the service's own `ForceSocketReconnect()` cannot read as recovery. The one exception is a screen with no active subscription: no socket exists there, so no `connected` can arrive, and an HTTP 200 clears the warning. A subscription opened later against a socket that is still down raises it again.

  And a new `OrphanedConversationDetailReconciler` closes conversation details left `In-Progress` by a run that is already over. `AgentRunner` closes the detail as a run's final step, so a process that dies mid-run never reaches it; the agent-run watchdog repairs the run but nothing repaired the detail, which is the row the chat renders from. It runs at boot and every five minutes, asks only for details that have a finished run so stuck rows cannot fill its 200-row window, waits a grace period so it cannot race a normal completion, skips a detail that something else closed after it was listed, and writes as the conversation's OWNER — `MJConversationDetailEntityExtended.Save()` refuses a non-owner without a resource grant, so a maintenance pass running as the system user is silently rejected, returning false with no `LatestResult` to read. Verified against five real orphaned details aged 42 to 246 minutes: all five closed, none left.

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

- Updated dependencies [834f8d7]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c42c0e8]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- 17b8087: no migration but marking as minor due to cache bump stuff added here, good practice, but we're on a minor bump anyway

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- de34786: Add `GetItems<T>(keys, category?)` batched read to `ILocalStorageProvider`. IndexedDB implementation uses a single read transaction with N parallel `get()` calls; Redis uses one `MGET` command. Used internally by `LocalCacheManager.GetRunViewResults` to batch the smart-cache-check warm-load reads (eliminating ~85 sequential per-key IDB transactions per coalesced engine bundle), the dataset-cache load (eliminating 3 redundant data-key reads per cached dataset access), and the metadata-snapshot bootstrap (3 keys → 1 batched read). Also fixes `IsDatasetCached` to probe via the tiny `_date` key instead of pulling the multi-MB dataset blob just for an existence check. No on-disk schema change; no version bump needed for the IDB schema. 28 new unit tests cover generic contract behavior, IDB single-transaction verification, and Redis MGET semantics including per-key error tolerance and deduplication.
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
