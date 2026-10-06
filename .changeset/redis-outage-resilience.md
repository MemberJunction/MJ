---
"@memberjunction/redis-provider": patch
"@memberjunction/core": patch
---

Survive a Redis outage: reconnect without giving up, fail fast, say so, and come back correct

`RedisLocalStorageProvider` could not survive an outage longer than ~11 seconds, and if it could it
would have come back with a cache it believed was valid and wasn't. Found operationally: an Azure
Cache for Redis instance was unreachable for ~25 minutes and every server already running went
permanently cache-blind without saying so.

**Reconnection no longer surrenders.** `retryStrategy` returned `null` past `maxRetries` (default 10),
and `null` tells ioredis to stop reconnecting for the life of the client — no recovery short of a
process restart. The backoff was `times * 200`, linear despite a comment claiming otherwise, so ten
attempts was ~11 seconds of tolerance: shorter than a Redis restart, an ElastiCache failover or a pod
reschedule. The ceiling now sits on the delay between attempts (`maxRetryDelayMs`, default 30s) rather
than on the attempt count, and `maxRetries` becomes an opt-in for short-lived scripts that genuinely
should fail rather than wait.

**Reconnecting is no longer mistaken for being correct.** Pub/sub has no replay, so a subscriber that
was away receives nothing published during the gap — it resumes holding entries its siblings
invalidated minutes ago. The failure is symmetric: invalidations this process published while
disconnected never reached its siblings either. A fleet-wide epoch counter, incremented once per
mutation and carried on every `CacheChangedEvent`, is compared on reconnect: unchanged means nothing
was invalidated anywhere and the local cache is **kept**; advanced means everything local is dropped;
a process that mutated while disconnected bumps the epoch so its siblings flush too; and a counter
that cannot be read flushes, because an unestablished correctness claim should cost the expensive
answer. Keeping the cache when nothing changed is the point — a blind flush-on-reconnect is also
correct but discards a valid cache on every connection blip.

**Commands fail fast instead of accumulating.** With `maxRetriesPerRequest: null` and ioredis's
default offline queue, a multi-minute outage queued commands whose promises never settled — unbounded
memory plus awaits that hung for the duration. Once a connection has been established and then lost,
reads return a miss and writes no-op, both of which are correct and merely slower. Startup is
deliberately exempt: before the first connection a brief queue is the difference between a warm cache
and a cold one, and nothing can be stale because nothing is cached.

**The failure is now observable.** Every lifecycle handler was gated behind `enableLogging` and logged
via `LogStatus`, which is suppressed when `GetProductionStatus()` is true — so a dead cache client
produced no output at all in production. Connection loss and recovery are now public events
(`OnConnectionLost`, `OnConnectionRestored`, `OnReconciliationRequired`) so a consumer can degrade
deliberately and report health, with error-channel logging as the production-visible fallback.

`CacheChangedEvent` gains an optional `Epoch`. Transports that do not implement the counter omit it
and consumers that do not care about recovery can ignore it. The post-reconnect guarantee is
documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`.
