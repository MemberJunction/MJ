# @memberjunction/redis-provider

Redis-backed implementation of MemberJunction's `ILocalStorageProvider` interface. Enables persistent, shared server-side caching via any Redis-compatible service — self-hosted Redis, Azure Managed Redis, AWS ElastiCache, Redis Cloud, Upstash, or any other Redis-protocol endpoint.

## Why Redis?

MemberJunction's default server-side cache (`InMemoryLocalStorageProvider`) stores data in a plain `Map` inside the Node.js process. This works well for single-server development but has two limitations in production:

| Limitation | Impact |
|-----------|--------|
| **Not shared** | Each MJAPI instance has its own cache — no benefit from horizontal scaling |
| **Not persistent** | Cache is lost on process restart — cold starts hit the database for everything |

A Redis-backed provider solves both problems while remaining a drop-in replacement — no changes to `LocalCacheManager`, `ProviderBase`, or any consumer code.

## Installation

```bash
# Add to the package that configures your data provider (typically MJAPI or your server bootstrap)
# Then run npm install at the repo root
npm install @memberjunction/redis-provider
```

> **Monorepo note:** In the MemberJunction monorepo, add the dependency to the relevant package's `package.json` and run `npm install` at the repo root.

## Quick Start

```typescript
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { Metadata } from '@memberjunction/core';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';

// 1. Create the Redis provider
const redisProvider = new RedisLocalStorageProvider({
    url: 'redis://localhost:6379',
    defaultTTLSeconds: 300,  // 5-minute default TTL
});

// 2. Inject it into the data provider
const provider = Metadata.Provider as GenericDatabaseProvider;
provider.SetLocalStorageProvider(redisProvider);

// That's it! All MJ caching now flows through Redis.
```

## Configuration

The `RedisProviderConfig` object supports the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | Redis connection URL (`redis://` or `rediss://` for TLS). Mutually exclusive with `options`. |
| `options` | `RedisOptions` | — | Full [`ioredis` options](https://github.com/redis/ioredis#connect-to-redis) object. Mutually exclusive with `url`. |
| `keyPrefix` | `string` | `'mj'` | Prefix for all Redis keys. Useful for isolating MJ data in a shared Redis instance. |
| `defaultTTLSeconds` | `number` | `3600` | Default time-to-live for all cached entries. `0` means keys persist until explicitly removed. |
| `maxRetries` | `number` | `10` | Maximum reconnection attempts with exponential backoff before giving up. |
| `enableLogging` | `boolean` | `true` | Whether to log connection events via MJ's `LogStatus`/`LogError`. |

### Connection Examples

#### Local Development (Docker)

```bash
# Start a local Redis container
docker run -d --name mj-redis -p 6379:6379 redis:7-alpine
```

```typescript
const provider = new RedisLocalStorageProvider({
    url: 'redis://localhost:6379',
    defaultTTLSeconds: 300,
});
```

#### Azure Managed Redis

```typescript
const provider = new RedisLocalStorageProvider({
    url: `rediss://default:${process.env.AZURE_REDIS_KEY}@${process.env.AZURE_REDIS_HOST}:6380`,
    defaultTTLSeconds: 600,
});
```

Or using the options object for more control:

```typescript
const provider = new RedisLocalStorageProvider({
    options: {
        host: process.env.AZURE_REDIS_HOST,
        port: 6380,
        password: process.env.AZURE_REDIS_KEY,
        tls: {},  // Required for Azure
        db: 0,
    },
    defaultTTLSeconds: 600,
});
```

#### AWS ElastiCache

```typescript
const provider = new RedisLocalStorageProvider({
    options: {
        host: 'my-cluster.abc123.use1.cache.amazonaws.com',
        port: 6379,
        tls: {},  // Required for encryption in transit
    },
    defaultTTLSeconds: 600,
});
```

#### Redis Cloud / Upstash

```typescript
const provider = new RedisLocalStorageProvider({
    url: process.env.REDIS_URL,  // Provided by the service
    defaultTTLSeconds: 600,
});
```

## Architecture

### How It Fits Into MemberJunction

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  (MJAPI, Angular, React, Custom Apps)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  LocalCacheManager   │   Singleton — LRU eviction, TTL,
              │  (MJCore)            │   stats, category-based isolation
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  ILocalStorageProvider│   Abstract interface (MJCore)
              └──────────┬───────────┘
                         │
            ┌────────────┼────────────────┐
            │            │                │
            ▼            ▼                ▼
    ┌──────────────┐ ┌──────────┐ ┌────────────────┐
    │ InMemory     │ │ Browser  │ │ Redis          │
    │ (default)    │ │ (IDB/LS) │ │ (this package) │
    └──────────────┘ └──────────┘ └────────┬───────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ Redis Server │
                                    │ (any host)   │
                                    └─────────────┘
```

### Key Structure

All keys follow the pattern: `{prefix}:{category}:{key}`

- **prefix** — Configurable (default `"mj"`), isolates MJ data in shared Redis instances
- **category** — Maps to MJ cache categories: `RunViewCache`, `Metadata`, `DatasetCache`, `RunQueryCache`, `default`
- **key** — The original key from the calling code

Example Redis keys:
```
mj:RunViewCache:Users|Active=1|Name ASC
mj:Metadata:___MJCore_Metadata_AllMetadata
mj:DatasetCache:MyDataset_items
mj:default:some-arbitrary-key
```

### Index Groups

A write can name an index group (`SetItem(key, value, category, { IndexGroup })`). The key is then
recorded in a Redis Set at `{prefix}:__group__:{category}:{group}`. `LocalCacheManager` passes the
entity name for every RunView cache entry, so any server can find the entries any other server wrote
for an entity:

- **`GetIndexGroupKeys(category, group)`** — returns the group's keys that still exist, and removes
  the ones that have expired from the set.
- The set is kept alive at least as long as its longest-lived member (an atomic Lua script that uses
  only Redis 6-compatible commands).

There is no category-wide set. Expiry never removes set members, so such a set grows without bound
once keys carry a TTL. Category-wide operations use `SCAN` instead:

- **`ClearCategory()`** — deletes every key in the category, its index-group sets, and the
  `{prefix}:__categories__:{category}` set that earlier versions of this provider maintained
- **`GetCategoryKeys()`** — lists every live key in the category (cost grows with the keyspace; meant
  for administration)

### TTL (Time-to-Live)

Redis has native key expiration, so TTL is handled efficiently at the server level:

1. **Config default** — `defaultTTLSeconds` applies to every `SetItem()` call. It defaults to **3600 (one hour)**.
2. **Per-call override** — `SetItem(key, value, category, { TTLSeconds })` (or a bare number) overrides the default
3. **No TTL** — `0`, either as the default or per call, stores the key without expiry

Event-driven invalidation stays the primary freshness mechanism. The TTL bounds how long an entry written by
something that never publishes (direct SQL, another application) can be served, and gives a `volatile-*`
eviction policy something to evict — Redis never evicts a key without an expiry under those policies.

### Error Handling

All Redis operations are wrapped in try/catch. On failure:
- **Reads** return `null` (cache miss, falls through to database)
- **Writes** are silently skipped (data stays in the database, just not cached)
- **Connection errors** are logged via `LogError()` but don't crash the app
- **Reconnection** is automatic via `ioredis` with configurable exponential backoff

This design ensures a Redis outage degrades performance (more database hits) but never causes application downtime.

## API Reference

### `RedisLocalStorageProvider`

#### Constructor

```typescript
new RedisLocalStorageProvider(config?: RedisProviderConfig)
```

Creates a new provider and establishes a Redis connection. The connection is lazy — it happens on the first command, so construction itself does not block.

#### ILocalStorageProvider Methods

The interface is **generic-typed** — `T` flows from caller through to retrieved value:

| Method | Description |
|--------|-------------|
| `GetItem<T>(key, category?)` | Retrieves a cached value. **JSON-deserializes internally** — returns the typed object. Returns `null` on miss, corrupt entry, or Redis unavailability. |
| `GetItems<T>(keys, category?)` | **Batched read via Redis `MGET`** — one command, one network round-trip, N values. Returns `Map<string, T \| null>`. Missing/corrupt entries map to `null` per-key without failing the batch. ~N× faster than individual `GetItem` calls which each pay full RTT. |
| `SetItem<T>(key, value, category?, options?)` | Stores a value. `options` is `{ TTLSeconds?, IndexGroup? }` or a bare TTL number. **JSON-serializes internally** — pass plain objects/arrays/primitives. One pipeline for the write and the index-group update. |
| `Remove(key, category?)` | Deletes a key. Index-group membership is pruned the next time the group is read. |
| `ClearCategory(category)` | Deletes all keys in a category (found with `SCAN`) and the category's index-group sets. |
| `GetCategoryKeys(category)` | Returns all live key names in a category (`SCAN`). |
| `GetIndexGroupKeys(category, group)` | Returns the live keys written with that index group, pruning expired members. |

**Internal serialization**: Redis stores strings, so `SetItem` calls `JSON.stringify(value)` and `GetItem` calls `JSON.parse(raw)` automatically. Callers see a typed object interface — no manual `JSON.parse`/`JSON.stringify` needed.

**Type fidelity caveats** (JSON limitations apply):

- `Date` instances become ISO strings on round-trip (caller must re-wrap with `new Date(value)` if a Date is needed)
- `Map`/`Set` become plain objects/arrays
- Functions are silently dropped
- Circular references throw — the provider catches and logs; the failed `SetItem` call resolves without throwing, but the value is not stored

For a richer storage model that preserves `Date`/`Map`/`Set`/typed arrays natively, use `BrowserIndexedDBStorageProvider` (browser-side) which leverages IndexedDB's structured clone algorithm.

#### Example: typed round-trip

```typescript
interface CachedSession { userId: string; expiresAt: string; permissions: string[]; }

await provider.SetItem<CachedSession>('session:abc', {
  userId: 'u-1',
  expiresAt: '2026-06-01T00:00:00Z',
  permissions: ['read', 'write']
}, 'Sessions', 3600);  // 1-hour TTL

const session = await provider.GetItem<CachedSession>('session:abc', 'Sessions');
//      ^^^^^^^ typed as CachedSession | null
if (session) {
  console.log(session.permissions);  // already typed
}
```

#### Additional Methods

| Method | Description |
|--------|-------------|
| `Exists(key, category?)` | Checks key existence without transferring the value (more efficient than `GetItem`). |
| `GetTTL(key, category?)` | Returns remaining TTL in seconds (`-1` = no expiry, `-2` = key doesn't exist). |
| `Ping()` | Health check — returns `true` if Redis responds with `PONG`. |
| `Disconnect()` | Graceful shutdown — sends `QUIT` and waits for pending replies. |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `IsConnected` | `boolean` | Whether the client has an active connection (transient — auto-reconnects). |
| `IsPubSubEnabled` | `boolean` | Whether the provider was created with `enablePubSub`. When `false`, the channel methods below do nothing. |
| `Client` | `Redis` | The underlying `ioredis` client, for commands the provider does not wrap (streams, etc.). Use the channel methods below for pub/sub. |

#### Named Channels (Application Pub/Sub)

Besides cache invalidation, the provider carries messages on channels you name. They use the provider's existing publisher and subscriber connections, so an application needs no Redis clients of its own.

| Method | Description |
|--------|-------------|
| `PublishMessage(channel, payload)` | Fire-and-forget. A failure is logged, never raised. |
| `PublishMessageAndWait(channel, payload)` | Resolves to the number of subscribers that received the message (`0` = nobody listening). Rejects if pub/sub is disabled or Redis rejects the publish. While disconnected it waits for the connection, so race it against a timeout if you need a deadline. |
| `SubscribeToChannel(channel, handler)` | Registers a handler (sync or async) and returns an unsubscribe function. Removing a channel's last handler unsubscribes it in Redis. |

```typescript
const redis = new RedisLocalStorageProvider({ url: process.env.REDIS_URL, keyPrefix: 'myapp', enablePubSub: true });
await redis.StartListening();

// Every replica listens; the one that owns the request acts on it.
const stop = await redis.SubscribeToChannel('abort', (raw) => {
    const { requestId, origin } = JSON.parse(raw) as { requestId: string; origin: string };
    if (origin !== replicaId) abortLocally(requestId);
});

// Any replica can ask, and learns whether anyone heard it.
const receivers = await redis.PublishMessageAndWait('abort', JSON.stringify({ requestId, origin: replicaId }));
```

Things to know:

- **Channels are prefixed.** `'abort'` becomes `myapp:abort`, so applications sharing one Redis under different key prefixes do not hear each other. The name `__pubsub__` is reserved for cache invalidation and is refused.
- **No echo suppression.** A process subscribed to a channel receives its own messages. Stamp an origin on the payload and check it, as above.
- **No replay.** Messages published while a subscriber is disconnected are never delivered to it.

## Testing

### Unit Tests (No Redis Required)

The package includes comprehensive unit tests with mocked Redis:

```bash
cd packages/RedisProvider
npm run test
```

### Integration Testing with Local Redis

For end-to-end testing with a real Redis instance:

```bash
# Start Redis
docker run -d --name mj-redis -p 6379:6379 redis:7-alpine

# Verify connectivity
docker exec mj-redis redis-cli ping
# → PONG

# Run your MJAPI with Redis configured
REDIS_URL=redis://localhost:6379 npm run start:api

# Monitor Redis activity in real time
docker exec mj-redis redis-cli monitor

# Clean up
docker stop mj-redis && docker rm mj-redis
```

### Monitoring Redis Usage

```bash
# See all MJ keys
docker exec mj-redis redis-cli KEYS "mj:*"

# Check memory usage
docker exec mj-redis redis-cli INFO memory

# See cache hit/miss stats
docker exec mj-redis redis-cli INFO stats | grep keyspace
```

## Production Recommendations

### TTL Strategy

| Category | Recommended TTL | Rationale |
|----------|----------------|-----------|
| `Metadata` | 30–60 minutes | Entity schema changes infrequently |
| `RunViewCache` | 2–5 minutes | Balance freshness vs. database load |
| `RunQueryCache` | 2–5 minutes | Same as RunViewCache |
| `DatasetCache` | 5–10 minutes | Datasets are typically larger, change less often |

### Memory Management

- Set `maxmemory` and `maxmemory-policy allkeys-lru` in your Redis configuration so Redis automatically evicts least-recently-used keys when memory is full
- Monitor with `INFO memory` and set alerts on `used_memory_peak`
- Use `defaultTTLSeconds` to ensure keys don't accumulate indefinitely

### High Availability

- **Azure Managed Redis**: Use Standard or Premium tier for replication
- **AWS ElastiCache**: Enable Multi-AZ with automatic failover
- **Self-hosted**: Use Redis Sentinel or Redis Cluster for HA

### Security

- Always use TLS (`rediss://` URL scheme or `tls: {}` in options) for cloud-hosted Redis
- Use strong passwords and rotate them regularly
- Restrict network access to Redis (VNet/VPC peering, security groups)
- Never expose Redis ports to the public internet

## Dependencies

- [`ioredis`](https://github.com/redis/ioredis) — Feature-rich Redis client for Node.js
- `@memberjunction/core` — `ILocalStorageProvider` interface and logging utilities
- `@memberjunction/global` — Global object store utilities

## Related Packages

- [`@memberjunction/core`](../MJCore/) — Defines `ILocalStorageProvider`, `LocalCacheManager`, and `InMemoryLocalStorageProvider`
- [`@memberjunction/generic-database-provider`](../GenericDatabaseProvider/) — Where `LocalStorageProvider` is wired into the data provider chain
- [`@memberjunction/sqlserver-dataprovider`](../SQLServerDataProvider/) — SQL Server provider (inherits caching from GenericDatabaseProvider)
- [`@memberjunction/postgresql-dataprovider`](../PostgreSQLDataProvider/) — PostgreSQL provider (inherits caching from GenericDatabaseProvider)
- [**Caching & Pub/Sub Guide**](../../guides/CACHING_AND_PUBSUB_GUIDE.md) — Comprehensive architecture guide covering Redis cross-server sync, GraphQL cache invalidation, deployment topologies, and troubleshooting
