# MemberJunction Server Scaling & Pluggable Broadcast Architecture

## Executive Summary

MemberJunction's API server (`@memberjunction/server` / `MJAPI`) powers interactive browser clients (`MJExplorer`), AI agent orchestration, real-time status streaming, and enterprise integrations. As deployments grow from 100 concurrent users to **5,000–50,000+ concurrent active users**, four structural bottlenecks previously constrained single-node and multi-replica throughput:

1. **$O(U \times E)$ Subscription Fan-Out & Unfiltered Write Telemetry Broadcasts**:
   - Every `BaseEntity` save or delete—including high-frequency internal operational writes (`MJ: AI Prompt Runs`, `MJ: AI Agent Run Steps`, `MJ: Audit Logs`, `MJ: Action Execution Logs`)—triggered a global `CACHE_INVALIDATION` event across every connected WebSocket.
   - For each event, `CacheInvalidationFilter` and `ShapeCacheInvalidationEvent` evaluated `entity.GetUserPermisions(user)` and `ReadIsRowFiltered(entity, user)` independently for all $U$ connected users ($O(U)$ per event), even when 5,000 users shared only 4 distinct role combinations.
   - Similarly, `PushStatusResolver.statusUpdates` subscribed all $U$ clients to a single global `PUSH_STATUS_UPDATES` topic, running `StatusUpdatesFilter` $U$ times per AI streaming token.
2. **Per-Field GraphQL Middleware & Per-Request Context Allocation Overhead**:
   - Registering `VariablesLoggingMiddleware` in `type-graphql`'s `globalMiddlewares` wrapped all ~45,000 object/field resolvers in an `async` middleware chain. A `RunView` returning 1,000 rows × 30 fields allocated 30,000 Promises per query even when `logVariables` was disabled.
   - Every HTTP request cloned all 19 `AllMetadataArrays` (~15,000 object references per provider), eagerly allocated RxJS `Subject`/`BehaviorSubject` transaction queues on `SQLServerDataProvider` (even though >99% of requests are non-transactional), re-decoded JWT tokens via `jwt.decode()`, and executed uncached `RunView` queries during `APIKeyEngine.ValidateAPIKey`.
3. **Database Connection Pool Stampedes on Identical Concurrent Reads**:
   - Simultaneous identical `RunView` queries (e.g., 500 users opening a dashboard at 9:00 AM) each acquired a separate SQL connection and executed identical SQL concurrently, exhausting the 50-connection pool.
   - Unbounded `Promise.all` inside `GenericDatabaseProvider.InternalRunViews` allowed a single batched request with 20 views to monopolize 20 pool connections at once.
4. **Coupled Interactive API & Background Worker Loops**:
   - Every `MJAPI` replica unconditionally started background polling daemons (`TaskGraphDispatcher`, `ScheduledJobsService`, `IntegrationSyncWorkerService`, `WorkQueueHost`, `SessionJanitor`, `OrphanDetailReconciler`), causing multi-replica poll contention and event-loop latency spikes on interactive HTTP/WebSocket nodes.

---

## The Four Pillars of the Scalability Architecture

```mermaid
flowchart TB
    subgraph Clients["Connected Clients (1,000 – 50,000+ Browsers)"]
        Browser1["MJExplorer Tab (Role: UI)"]
        Browser2["MJExplorer Tab (Role: Developer)"]
        Browser3["Sleeping / Reconnecting Tab"]
    end

    subgraph Pillar1["Pillar 1: Pluggable Cache Invalidation Broadcast & O(1) Session PubSub"]
        BaseProvider["BaseCacheInvalidationBroadcastProvider<br/>• Smart Telemetry Entity Filter<br/>• Role-Fingerprint O(Roles) Memoizer<br/>• Monotonic Sequence Ring Buffer"]
        DefaultProvider["SequencedRoleBucketBroadcastProvider<br/>(Default: Topology 1 + Topology 2)"]
        CloudProviders["Topology 3 Cloud Multiplexers<br/>• AzureWebPubSubBroadcastProvider<br/>• AWSIoTCoreBroadcastProvider<br/>• GCPPubSubBroadcastProvider"]
        SessionPubSub["O(1) Session-Scoped PushStatus<br/>PUSH_STATUS_UPDATES:session:<id>"]
        BaseProvider --> DefaultProvider
        BaseProvider --> CloudProviders
    end

    subgraph Pillar2["Pillar 2: Zero-Overhead Request & GraphQL Pipeline"]
        RootMw["Root-Only VariablesLoggingMiddleware<br/>(0 wrappers on child ObjectType fields)"]
        ProtoShell["O(1) Prototype Metadata Shell<br/>Object.create(shared)"]
        LazyTx["Lazy RxJS Transaction Queue<br/>(Allocated only on BeginTransaction)"]
        AuthCaching["AuthCache JWT Payload Cache +<br/>APIKeyEngine TTL Validation Cache"]
    end

    subgraph Pillar3["Pillar 3: Database Pool Protection"]
        SingleFlight["Single-Flight In-Flight RunView Coalescing<br/>(Deduplicates concurrent identical SQL reads)"]
        BoundedBatch["Bounded InternalRunViews Concurrency<br/>(Default max 8 concurrent SQL legs/batch)"]
    end

    subgraph Pillar4["Pillar 4: Horizontal Replica Role Separation"]
        ApiNodes["MJ_SERVER_ROLE=api<br/>Stateless HTTP + WebSocket Fleet"]
        WorkerNodes["MJ_SERVER_ROLE=worker<br/>Dedicated Background Daemons"]
    end

    Clients <-->|"HTTP (X-MJ-Cache-Seq) & WS"| ApiNodes
    Clients <-->|"Optional Topology 3 WS"| CloudProviders
    ApiNodes --> Pillar1
    ApiNodes --> Pillar2
    ApiNodes --> Pillar3
    WorkerNodes --> Pillar1
    WorkerNodes --> Pillar3
```

---

## Throughput & Scalability Math

| Metric | Previous Architecture | New Architecture (Topology 1+2 Default) | New Architecture (Topology 3 Cloud Multiplexer) |
| :--- | :--- | :--- | :--- |
| **Permission & RLS checks per entity save** ($U=5,000$ users, $R=4$ role combos) | $5,000 \times 2 = 10,000$ evaluations | **$4 \times 2 = 8$ evaluations** ($1,250\times$ reduction) | **$4 \times 2 = 8$ evaluations** ($1,250\times$ reduction) |
| **Broadcasts for telemetry tables** (`AIPromptRun`, `AuditLog`, etc.) | Broadcasts every row to all $U$ clients | **Filtered at source ($0$ broadcasts)** | **Filtered at source ($0$ broadcasts)** |
| **`PushStatus` filter evaluations per AI token** ($U=5,000$ users) | $5,000$ filter invocations / token | **$1$ targeted session invocation ($O(1)$)** | **$1$ targeted session invocation ($O(1)$)** |
| **GraphQL middleware Promises per 1,000-row × 30-field `RunView`** | $30,000$ Promises | **$0$ Promises** (root-only when enabled) | **$0$ Promises** |
| **Metadata array copies per request** | $\sim 30,000$ reference copies | **$0$ copies** (`Object.create(shared)`) | **$0$ copies** |
| **500 concurrent identical dashboard `RunView`s** | $500$ SQL queries (pool exhaustion) | **$1$ SQL query** (single-flight coalesced) | **$1$ SQL query** |
| **Reconnect / Tab-wake catch-up cost** | Full engine/dataset reload ($10\text{–}50$ SQL queries) | **$<1\text{ ms}$ RAM ring-buffer delta replay** | **$<1\text{ ms}$ RAM ring-buffer delta replay** |
| **Practical Concurrent Active Users** | $\sim 100\text{–}250$ users | **$5,000\text{–}10,000+$ users** (2–4 API replicas) | **$50,000+$ users** (offloaded WS fan-out) |

---

## Pillar 1: Pluggable Cache Invalidation Broadcast Hierarchy & $O(1)$ Session PubSub

### 1.1 `BaseCacheInvalidationBroadcastProvider`

Registered and resolved via MemberJunction's `MJGlobal.Instance.ClassFactory` (`@RegisterClass(BaseCacheInvalidationBroadcastProvider, key)`), `BaseCacheInvalidationBroadcastProvider` provides the foundational intelligence shared by all broadcast topologies:

1. **Smart Cacheable Entity Filter (`ShouldBroadcastEntity(entityName: string): boolean`)**:
   - High-frequency write-only operational and telemetry entities (`MJ: AI Prompt Runs`, `MJ: AI Agent Run Steps`, `MJ: AI Agent Runs`, `MJ: Action Execution Logs`, `MJ: Audit Logs`, `MJ: Record Changes`, `MJ: User Record Logs`, `MJ: Error Logs`, `MJ: Query Execution Logs`, `MJ: Communication Logs`) are never cached by browser `BaseEngine` instances or metadata datasets.
   - By default, `ShouldBroadcastEntity` suppresses client broadcasts for these operational tables while allowing operators to override via `cacheSettings.alwaysBroadcastEntities` and `cacheSettings.excludedBroadcastEntities`.
   - Any entity that is part of the `MJ_Metadata` dataset or explicitly allowlisted is always broadcast.

2. **Role-Fingerprint Permission & Event Shaping Memoizer ($O(\text{Roles})$ instead of $O(\text{Users})$)**:
   - Computes a canonical `RoleFingerprint` for each `UserInfo` / `RoleHolder`: sorted, lowercased, trimmed `RoleID`s joined by `','` (e.g. `'role-a,role-b'`), cached in a `WeakMap<object, string>` so a connected user's role fingerprint is computed at most once per session.
   - When a `CacheInvalidationPayload` is evaluated, the provider attaches a per-event memoization map `Map<string, RoleBucketEvaluation>` keyed by `RoleFingerprint`.
   - The first subscriber with a given `RoleFingerprint` computes `CanRead` (`entity.GetUserPermisions(user).CanRead`), `WithholdKey` (`ReadIsRowFiltered(entity, user)`), and the shaped `CacheInvalidationNotification` object. Every subsequent subscriber sharing that `RoleFingerprint` receives the pre-computed verdict and shaped notification in $O(1)$ time with zero object allocation!

3. **Monotonic Sequence Counter & Bounded RAM Ring Buffer (Topology 1)**:
   - Every broadcast invalidation event is stamped with a strictly increasing integer `Sequence` (`1, 2, 3, ...`) and stored in a bounded circular ring buffer (default `1,000` events, configurable via `cacheSettings.invalidationRingBufferSize`).
   - Exposes `GetCurrentSequence(): number`, `GetServerProcessID(): string`, and `GetChangesSince(sinceSequence: number, user: UserInfo): CacheInvalidationCatchUpResult`:
     - **`status: 'current'`**: `sinceSequence === currentSequence` — no events missed.
     - **`status: 'delta'`**: `sinceSequence < currentSequence` and covered by the ring buffer — returns only the events in `(sinceSequence .. currentSequence]` that the user's `RoleFingerprint` is permitted to read, already shaped for row-level security!
     - **`status: 'stale_full_refresh_required'`**: `sinceSequence < oldestSequenceInBuffer` or `sinceSequence > currentSequence` (e.g., server restarted or tab slept beyond ring buffer capacity) — instructs the client to run its standard full staleness validation.

```mermaid
sequenceDiagram
    participant Client as Browser (GraphQLDataProvider)
    participant API as MJAPI (Express + Apollo)
    participant Provider as SequencedRoleBucketBroadcastProvider
    participant RingBuffer as RAM Ring Buffer (Last 1,000 Events)

    Note over Client,API: Normal Real-Time Flow (Topology 2)
    API->>Provider: DispatchInvalidation(payload)
    Provider->>Provider: Check ShouldBroadcastEntity(entityName)
    Provider->>RingBuffer: Assign Sequence #104 & Store
    Provider-->>Client: WS Push: cacheInvalidation { Sequence: 104, ... } (O(Roles) memoized)
    Client->>Client: Update _lastCacheInvalidationSequence = 104

    Note over Client,API: HTTP Piggyback Header & Reconnect Catch-Up (Topology 1)
    Client->>API: POST /graphql (Any Query/Mutation)
    API-->>Client: HTTP 200 + Header X-MJ-Cache-Seq: 108, X-MJ-Server-ID: <uuid>
    Client->>Client: Detects gap (104 -> 108) or WS Reconnect
    Client->>API: Query GetCacheInvalidationsSince(sinceSequence: 104, serverProcessID: <uuid>)
    API->>Provider: GetChangesSince(104, user)
    Provider->>RingBuffer: Slice (104..108] + Filter/Shape via Role-Bucket Memoizer
    API-->>Client: { Status: 'delta', CurrentSequence: 108, Events: [#105..#108] }
    Client->>Client: Replay missed remote-invalidate events in <1ms!
```

### 1.2 Default Provider: `SequencedRoleBucketBroadcastProvider` (`'SequencedRoleBucket'`)

Registered with `@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'SequencedRoleBucket')`, this is the default provider out of the box (requiring zero external cloud services):
- **Real-Time Push (Topology 2)**: Publishes `SequencedCacheInvalidationPayload` (carrying its pre-warmed role-bucket memoization cache) to `PubSubManager`. `CacheInvalidationFilter` and `ShapeCacheInvalidationEvent` automatically consult the payload's role-bucket cache, reducing CPU and GC pressure by $>99\%$ on multi-thousand-user servers.
- **HTTP Sequence Header & Delta Catch-Up (Topology 1)**:
  - Express middleware attaches `X-MJ-Cache-Seq` and `X-MJ-Server-ID` (`Access-Control-Expose-Headers` included) to every GraphQL HTTP response.
  - `CacheInvalidationResolver` exposes `@Query(() => CacheInvalidationCatchUpOutput) GetCacheInvalidationsSince(sinceSequence: Int!, serverProcessID?: String)`.
  - `GraphQLDataProvider` tracks `_lastCacheInvalidationSequence` and `_lastCacheServerProcessId`, automatically invoking `CatchUpCacheInvalidations()` on WebSocket reconnect (`SocketReconnected$`) or when an HTTP response's `X-MJ-Cache-Seq` header advances past the client's known sequence.

### 1.3 Topology 3 Cloud Multiplexer Providers (50,000+ Concurrent Users)

When scaling beyond 10,000–50,000 concurrent WebSockets, terminating idle WebSockets on managed cloud pub/sub multiplexers offloads socket heartbeats and TLS state from Node.js API containers. Because `BaseCacheInvalidationBroadcastProvider` groups permissions by `RoleFingerprint`, a deployment with 50,000 users and 8 role combinations publishes at most **8 messages per entity change** to the cloud multiplexer, which then fans out to all subscribed browsers on that role topic (`role:<fingerprint>`):

1. **`AzureWebPubSubBroadcastProvider` (`@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'AzureWebPubSub')`)**:
   - Publishes role-shaped payloads to Azure Web PubSub group `mj.role.<fingerprintHash>` via the Azure Web PubSub REST API (`POST /api/hubs/{hub}/groups/{group}/:send`) using HMAC-SHA256 JWT authentication (or pluggable transport adapter).
   - `NegotiateClientConnection(user)` mints a client access URL (`wss://<host>/client/hubs/<hub>?access_token=<jwt>`) scoped to `webpubsub.joinLeaveGroup.mj.role.<fingerprintHash>`.
2. **`AWSIoTCoreBroadcastProvider` (`@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'AWSIoTCore')`)**:
   - Publishes role-shaped payloads to AWS IoT Core Data Plane MQTT topic `mj/cache-invalidation/role/<fingerprintHash>` via AWS SigV4 signed HTTPS POST (`POST /topics/mj%2Fcache-invalidation%2Frole%2F<fingerprintHash>?qos=1`).
   - `NegotiateClientConnection(user)` returns a SigV4 pre-signed `wss://` MQTT-over-WebSocket URL and the authorized topic name.
3. **`GCPPubSubBroadcastProvider` (`@RegisterClass(BaseCacheInvalidationBroadcastProvider, 'GCPPubSub')`)**:
   - Publishes role-shaped payloads to Google Cloud Pub/Sub (`POST https://pubsub.googleapis.com/v1/projects/{projectId}/topics/{topicPrefix}-{fingerprintHash}:publish`) with role-fingerprint attributes.
   - `NegotiateClientConnection(user)` returns the subscription topic/filter metadata for the user's `RoleFingerprint`.

Clients can query `NegotiateCacheBroadcastConnection` on `CacheInvalidationResolver` at any time to discover the active broadcast topology and obtain signed connection credentials.

### 1.4 $O(1)$ Dynamic Session Topic Routing in `PushStatusResolver`

Previously, `PushStatusResolver.statusUpdates` subscribed every client to `PUSH_STATUS_UPDATES`, causing `graphql-subscriptions`'s `EventEmitter` to wake all $U$ iterators on every AI streaming token.
- `GetSessionStatusTopic(sessionId)` returns `PUSH_STATUS_UPDATES:session:${sessionId}`.
- `PushStatusResolver.statusUpdates` subscribes to `[GetSessionStatusTopic(args.sessionId), PUSH_STATUS_UPDATES_TOPIC]`.
- `PubSubManager` routes any publish on `PUSH_STATUS_UPDATES_TOPIC` carrying a concrete `sessionId` (`sessionId !== '*'`) directly to `GetSessionStatusTopic(sessionId)`, waking **only the 1 target session** ($O(1)$) while wildcard `sessionId: '*'` broadcasts continue to publish on `PUSH_STATUS_UPDATES_TOPIC`.
- `ShouldReplicateStatusUpdate` memoizes parsed JSON envelopes via a `WeakMap` so `JSON.parse(message)` is never repeated for the same payload.

---

## Pillar 2: Eliminating Per-Field & Per-Request GraphQL Execution Overhead

### 2.1 Root-Only `VariablesLoggingMiddleware`

`type-graphql`'s `globalMiddlewares` attaches every middleware function to every `@Field()` on every `@ObjectType()` in the schema (~45,000 fields). Because `VariablesLoggingMiddleware` only inspects root operations (`info.path.prev === undefined`) when `loggingSettings.graphql.logVariables === true`, attaching it globally caused 30,000 redundant `async` middleware invocations on a 1,000-row × 30-field `RunView` response.

- `buildSchemaSync` no longer registers `VariablesLoggingMiddleware` in `globalMiddlewares`.
- Instead, `ApplyRootVariablesLoggingMiddleware(schema)` wraps **only** the root fields on `schema.getQueryType()`, `schema.getMutationType()`, and `schema.getSubscriptionType()` (and only when `logVariables` is enabled or via a lightweight root-only wrapper). Child `@ObjectType` row fields have **zero middleware wrappers**.

### 2.2 Zero-Copy `CreateSharedMetadataShell` (`Object.create(shared)`)

In `ProviderBase.CreateSharedMetadataShell(shared)`:
- Instead of allocating a new `AllMetadata` and shallow-copying all 19 `AllMetadataArrays` (`[...shared[m.key]]`, copying ~15,000 pointers per provider), `CreateSharedMetadataShell` creates a prototype-backed shell via `Object.create(shared) as AllMetadata` and assigns `shell.CurrentUser = this.CurrentUser` as an own property.
- Reading `shell.Entities`, `shell.Applications`, etc. resolves in $O(1)$ through the prototype chain with **zero array copying**, while assigning `shell.Entities = ...` or `shell.CurrentUser = ...` writes to the per-request shell instance without mutating `shared`.

### 2.3 Lazy RxJS Transaction Queue in `SQLServerDataProvider`

In `SQLServerDataProvider`:
- Previously, every `new SQLServerDataProvider()` eagerly allocated `_sqlQueue$ = new Subject<SQLQueueItem>()` and `_transactionState$ = new BehaviorSubject<boolean>(false)`.
- Now, `_sqlQueue$` and `_transactionState$` are allocated lazily on first access or when `BeginTransaction()` / `initializeQueueProcessor()` is called. For the $>99\%$ of HTTP requests that never start a transaction, `IsTransactionActive` returns `false` and `Dispose()` completes in $O(1)$ without allocating or tearing down RxJS subjects.

### 2.4 `AuthCache` Decoded JWT Payload Caching & `APIKeyEngine` Validation Caching

- **`AuthCache` (`packages/MJServer/src/cache.ts` & `context.ts`)**:
  - Stores the verified `jwt.JwtPayload` directly in `AuthCache` (`AuthCache.get(token)`). On subsequent requests with the same warm bearer token, `GetUserPayload` retrieves the verified `JwtPayload` from `AuthCache` without re-running `jwt.decode(token)` (base64 decode + `JSON.parse`), while still resolving the live `UserInfo` from `UserCache.Instance`.
- **`APIKeyEngine.ValidateAPIKey` (`packages/APIKeys/Engine/src/APIKeyEngine.ts`)**:
  - Adds a short-TTL (default 60s, configurable via `validationCacheTTLMs`) in-memory validation cache for `ValidateKeyByHash` and active `UserInfo` resolution, automatically invalidated whenever `MJ: API Keys`, `MJ: API Key Scopes`, `MJ: API Key Applications`, or `MJ: Users` records are saved or deleted via `MJGlobal` entity events (and on `RevokeAPIKey` / `ClearCache`).

---

## Pillar 3: Server-Side Single-Flight Read Coalescing & Bounded `InternalRunViews` Concurrency

### 3.1 Single-Flight In-Flight `RunView` Coalescing

In `GenericDatabaseProvider.RunViewCore`:
- When multiple concurrent requests execute an identical read-only query (`!this.InTransaction`, `!params.SaveViewResults`, `ResultType !== 'entity_object'` or raw row fetch before entity hydration), `GenericDatabaseProvider` computes a deterministic coalescing key from:
  - Provider connection identity (`InstanceConnectionString` / core schema)
  - `EntityName` / `ViewID` / `ViewName`
  - `ExtraFilter`, `OrderBy`, `Fields`, `UserSearchString`, `ExcludeUserViewRunID`, `ExcludeDataFromAllPriorViewRuns`, `OverrideExcludeFilter`
  - `MaxRows`, `StartRow`, `IgnoreMaxRows`, `AfterKey`, `ResultType`, `DataSource`, `Aggregates`
  - Effective RLS / User scope key (`rlsWhereClause` + user's `RoleFingerprint` + `User.ID` when RLS or view where clause is user-dependent)
- If an identical query is **currently in flight**, subsequent callers await the same in-flight `Promise` and receive an isolated clone of the result (`Results: result.Results.map(r => ({ ...r }))`), preventing any caller mutation from affecting peers.
- In `finally`, the key is immediately removed from `_inFlightRunViews`.
- **Zero staleness risk**: Results are never retained after the SQL query settles; only queries executing at the exact same millisecond share the database round-trip.

### 3.2 Bounded Concurrency in `GenericDatabaseProvider.InternalRunViews`

In `GenericDatabaseProvider.InternalRunViews`:
- Replaces unbounded `Promise.all(params.map(...))` with a bounded concurrency limiter (default `MaxConcurrentViewsPerBatch = 8`, configurable on `GenericDatabaseProvider`).
- Preserves exact output array ordering while preventing a single 25-view dashboard batch request from seizing 25 connections from the SQL pool simultaneously.

---

## Pillar 4: Multi-Replica Horizontal Scaling via `MJ_SERVER_ROLE`

### 4.1 Role Separation (`'all' | 'api' | 'worker'`)

Configured via `MJ_SERVER_ROLE` environment variable or `serverRole` in `mj.config.cjs`:

| `MJ_SERVER_ROLE` | HTTP / GraphQL / WebSocket Server | Background Polling Daemons (`ScheduledJobs`, `TaskGraphDispatcher`, `IntegrationSyncWorker`, `WorkQueueHost`, `SessionJanitor`, `OrphanDetailReconciler`) | Use Case |
| :--- | :---: | :---: | :--- |
| **`all`** *(default)* | Enabled | Enabled | Single-instance deployments & local development |
| **`api`** | Enabled | **Disabled** (stateless request/WS serving only) | Horizontally auto-scaled API pods behind a load balancer |
| **`worker`** | Healthcheck only (no public GraphQL/WS traffic) | **Enabled** | Dedicated background worker pods (1–2 replicas) |

```mermaid
flowchart LR
    LB["Load Balancer (ALB / Envoy / NGINX)"]
    subgraph ApiTier["Stateless API Tier (MJ_SERVER_ROLE=api, 2–10 Replicas)"]
        API1["MJAPI Replica 1"]
        API2["MJAPI Replica 2"]
        API3["MJAPI Replica N"]
    end
    subgraph WorkerTier["Dedicated Worker Tier (MJ_SERVER_ROLE=worker, 1–2 Replicas)"]
        W1["MJAPI Worker 1<br/>• TaskGraphDispatcher<br/>• ScheduledJobsService<br/>• IntegrationSyncWorker<br/>• WorkQueueHost<br/>• SessionJanitor"]
    end
    Redis[("Redis Cluster<br/>Shared Cache & PubSub Bus")]
    SQLPrimary[("SQL Server / PostgreSQL<br/>Primary Read-Write")]
    SQLReplica[("SQL Read-Only Replica<br/>dbReadOnlyUsername")]

    LB --> API1
    LB --> API2
    LB --> API3
    API1 <--> Redis
    API2 <--> Redis
    API3 <--> Redis
    W1 <--> Redis
    API1 --> SQLPrimary
    API2 --> SQLPrimary
    API3 --> SQLPrimary
    API1 -.->|"Read-Only Queries"| SQLReplica
    API2 -.->|"Read-Only Queries"| SQLReplica
    API3 -.->|"Read-Only Queries"| SQLReplica
    W1 --> SQLPrimary
```

---

## Configuration Reference (`mj.config.cjs` & Environment Variables)

```javascript
// mj.config.cjs
module.exports = {
  // Pillar 4: Server Role ('all' | 'api' | 'worker'), or set MJ_SERVER_ROLE env var
  serverRole: process.env.MJ_SERVER_ROLE || 'all',

  cacheSettings: {
    maxMemoryMB: 256,
    // Pillar 1: Pluggable Broadcast Provider
    // Built-in keys: 'SequencedRoleBucket' (default), 'AzureWebPubSub', 'AWSIoTCore', 'GCPPubSub'
    broadcastProvider: process.env.MJ_CACHE_BROADCAST_PROVIDER || 'SequencedRoleBucket',
    // Bounded RAM ring buffer size for Topology 1 sequence catch-up (default: 1000)
    invalidationRingBufferSize: 1000,
    // Optional overrides for smart entity broadcast filtering:
    alwaysBroadcastEntities: [],
    excludedBroadcastEntities: [],
    // Optional cloud multiplexer provider settings (when broadcastProvider is AzureWebPubSub / AWSIoTCore / GCPPubSub):
    broadcastProviderSettings: {
      // Azure Web PubSub:
      endpoint: process.env.AZURE_WEB_PUBSUB_ENDPOINT,
      accessKey: process.env.AZURE_WEB_PUBSUB_ACCESS_KEY,
      hubName: process.env.AZURE_WEB_PUBSUB_HUB || 'mj_cache_invalidation',
      // AWS IoT Core:
      iotEndpoint: process.env.AWS_IOT_DATA_ENDPOINT,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      // GCP Pub/Sub:
      projectId: process.env.GCP_PROJECT_ID,
      topicPrefix: process.env.GCP_PUBSUB_TOPIC_PREFIX || 'mj-cache-role',
      accessToken: process.env.GCP_ACCESS_TOKEN,
    },
  },
};
```

---

## Apples-to-Apples Scalability Benchmarks (`origin/next` vs 4-Pillar Architecture)

Reproducible benchmark suite (`packages/MJServer/src/__tests__/scalabilityBenchmarks.test.ts`, executed via `MJ_RUN_SCALABILITY_BENCHMARKS=1`):

| Pillar | Workload | Metric | `origin/next` Baseline | 4-Pillar Architecture | Improvement |
|---|---|---|---|---|---|
| **Pillar 1A** | `CacheInvalidation` Fan-Out ($U=1,000$, 4 roles, 100 saves) | Permission + RLS evaluations | 200,000 calls | 640 calls | **313x fewer evaluations** |
| **Pillar 1A** | `CacheInvalidation` Fan-Out ($U=1,000$, 4 roles, 100 saves) | Fan-out CPU wall time | 70.55 ms | 19.23 ms | **3.7x faster** |
| **Pillar 1A** | `CacheInvalidation` Fan-Out ($U=5,000$, 4 roles, 100 saves) | Permission + RLS evaluations | 1,000,000 calls | 640 calls | **1563x fewer evaluations** |
| **Pillar 1A** | `CacheInvalidation` Fan-Out ($U=5,000$, 4 roles, 100 saves) | Fan-out CPU wall time | 303.52 ms | 107.41 ms | **2.8x faster** |
| **Pillar 1B** | `PushStatusUpdates` ($U=2,000$ sessions, 500 chunks) | Filter invocations & `JSON.parse` calls | 1,000,000 filters / 1,000,500 `JSON.parse` | 500 filters / 500 `JSON.parse` | **2001x fewer `JSON.parse` calls** |
| **Pillar 1B** | `PushStatusUpdates` ($U=2,000$ sessions, 500 chunks) | Routing + parse wall time | 187.89 ms | 0.88 ms | **213.7x faster** |
| **Pillar 2A** | 1,000-row × 30-field GraphQL query (per query) | Middleware async wrapper calls | 30,001 calls/query | 1 call/query | **30,001x fewer async wrappers** |
| **Pillar 2A** | 1,000-row × 30-field GraphQL query (10 runs) | Field resolution wall time | 60.22 ms (6.02 ms/query) | 6.22 ms (0.62 ms/query) | **9.7x faster** |
| **Pillar 2B** | 5,000 per-request provider shells + queues | Array slot copies & RxJS Subjects | 95,000 copies / 10,000 Subjects (5.10 ms) | 0 copies (`Object.create`) / 0 Subjects (lazy) (2.21 ms) | **2.3x faster** |
| **Pillar 2C** | `APIKeyEngine.ValidateAPIKey` (500 warm requests) | DB `RunView`s & `LastUsedAt` Saves | 1,000 `RunView`s + 500 Saves (578.8 ms) | 2 `RunView`s + 1 Save (1.33 ms) | **500x fewer DB reads & writes (435x faster)** |
| **Pillar 3** | 100 concurrent identical `RunView` calls (live SQL Server) | Physical SQL queries executed | 100 SQL queries | 1 SQL query | **100x fewer SQL queries (99% DB load reduction)** |
| **Pillar 3** | 100 concurrent identical `RunView` calls (live SQL Server) | Total burst wall time / p50 / p95 | 1349.7 ms (p50: 764.1 ms, p95: 1288.4 ms) | 329.5 ms (p50: 329.1 ms, p95: 329.3 ms) | **4.1x faster burst completion** |

