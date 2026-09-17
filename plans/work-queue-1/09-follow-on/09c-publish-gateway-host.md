# 09c — Lightweight Publish Gateway Host — Fast Follow

## Summary

A slim, stateless, horizontally scaled server process that hosts **only** the `@memberjunction/work-queue-server`
Server Extension (the REST publish route — Revision 2 has no REST operator routes; operators use remote operations on MJAPI). It takes webhook-scale publish traffic out of MJAPI, so a
campaign burst no longer competes with GraphQL and UI traffic (D9). The extension code is unchanged; only its
host differs.

## Motivation

Phase 1 hosts the publish API inside MJAPI to simplify development (D9). At email-event volume, MJAPI would
become the ingestion ceiling:
- A full MJAPI boot loads every engine, resolver and background service, so it scales slowly and costs more
  per instance.
- A deploy or incident in MJAPI would 5xx the webhooks.

## Verified starting point

`@memberjunction/server-bootstrap-lite` (`packages/ServerBootstrapLite/src/index.ts`) is **only a class-registration
manifest** (`CLASS_REGISTRATIONS`, …) for CLI, CodeGen, MCP and A2A processes. It excludes communication,
storage and bizapps providers. It does **not** start a server. So the gateway needs:
- a new minimal host that uses the lite manifest for registrations, and
- its own HTTP bootstrap borrowing the pieces MJServer uses:
  - DB pool + `StartupManager`
  - `ServerExtensionLoader` (`packages/ServerExtensionsCore`)
  - API-key authentication (`APIKeyEngine`, `packages/APIKeys/Engine/src/APIKeyEngine.ts`)
  - optional Redis cache sync (`packages/RedisProvider`)

## Scope / Non-goals

**In scope:** new deployable `packages/WorkQueue/gateway` (`@memberjunction/work-queue-gateway`), container
image, health endpoints, auth, topology cache invalidation, metrics, and a scaling guide.

**Non-goals:**
- GraphQL.
- Browser auth flows (OAuth / magic link).
- Consumer workers. The gateway never claims work, although the same image could run workers later.
- Removing the extension from MJAPI (both hosts stay supported).

## Design

### Process composition

```
work-queue-gateway (Node, Express)
 ├─ import '@memberjunction/server-bootstrap-lite'          class registrations (entities, core)
 ├─ import '@memberjunction/work-queue-server'              extension + engine + DB driver registration
 ├─ import '@memberjunction/work-queue-aws' (optional)      only if AWS topics are served (driver manifest)
 ├─ loadMJConfig()  → db, workQueue, serverExtensions, gateway sections (packages/Config)
 ├─ DB pool + SQLServerDataProvider / PostgreSQLDataProvider setup
 ├─ StartupManager.Startup  (restricted: UserCache, APIKeyEngine, WorkQueueEngine only — see Open questions)
 ├─ Redis LocalStorageProvider if REDIS_URL → cache-change subscription
 ├─ auth middleware: X-API-Key only → APIKeyEngine.ValidateAPIKey + Authorize(workqueue:publish, topic)
 ├─ ServerExtensionLoader → mounts work-queue-server at /work-queue
 ├─ /health/live, /health/ready
 └─ ShutdownRegistry-driven graceful drain
```

**Refactor enabler (small, in MJServer).** Extract the extension-loading plus unified API-key middleware
wiring (`packages/MJServer/src/index.ts`, roughly the extension phase and auth phase) into reusable functions
in `ServerExtensionsCore` or a new `server-host-core` module. Both `serve()` and the gateway call these, so the
auth semantics can't drift. Parity tests guard this (below).

### Why not reuse `serve()` with flags?

| Option | Verdict |
|---|---|
| `serve({ mode: 'extensions-only' })` | ❌ `serve()` is a ~2k-line composition that imports GraphQL, all background services and the full bootstrap. Flags hide rather than remove weight, and cold start stays slow. |
| **New slim host + extracted shared wiring** | ✅ small import graph, fast cold start, explicit dependency surface |

### Request path budget

The target is p99 < 150 ms (AWS transport) at 100 messages per request:
- Auth: API-key hash lookup cached in memory (verify that `APIKeyEngine` caches validated keys; add an
  LRU with a 60 s TTL if not).
- Validation: `ValidatePublishRequest` from core (03 §1.1, adopted) — pure CPU; plus the topic's `AllowExternalPublish` check.
- Topology: `WorkQueueEngine` in-memory cache (BaseEngine).
- Transport: SNS `PublishBatch` in chunks of 10, run in parallel (bounded to 10 concurrent).
- Cloud-transport topics: no DB writes **except** the deduplication ledger (03 §2.1) for requests that carry a
  `DeduplicationKey` — one `Reserve` before and one `Confirm`/`Release` after the send, batched per request.
  Producers that don't need key-based dedup (e.g. email events keyed by a stable `MessageID`) incur no DB writes.
  DB-transport topics still insert rows (volume there is "slow" by definition, D1).

### Topology cache invalidation

| Deployment | Mechanism |
|---|---|
| Redis present (`REDIS_URL`) | BaseEngine / LocalCacheManager cache-change events over the existing `${prefix}:__pubsub__` channel (`packages/RedisProvider/src/RedisLocalStorageProvider.ts`) reload topics/subscriptions when those entities change |
| No Redis | Poll every `gateway.topologyRefreshSeconds` (default 30) with a cheap version probe: `SELECT MAX(__mj_UpdatedAt), COUNT(*)` over Transport/Topic/Subscription; reload on change |
| Publish error indicating a binding mismatch (e.g. SNS `NotFound`, missing `MessageGroupId`) | force a reload, then retry that chunk once |

A topic changed to `Disabled` stops being accepted within one refresh interval. The operator runbook says so.

### Health

| Endpoint | Meaning | Used by |
|---|---|---|
| `/health/live` | event loop responsive | container liveness |
| `/health/ready` | DB reachable, topology loaded, API-key engine loaded, last `ValidateBindings` for served transports had no `Error` issues (cached ≤ 5 min), not draining | load balancer target health |
| `/health/extensions` | existing extension `HealthCheck()` output | diagnostics |

### Scaling & deployment

- **Stateless.** Any instance serves any request. No sticky sessions.
- **Container image** published alongside the MJAPI image (same base, smaller layer set). Runs on ECS
  Fargate / App Runner (AWS), Container Apps (Azure) or Kubernetes.
- **Autoscale** on CPU (target 60%) and on request count per target. Min 2 instances across AZs.
- **Load balancer** routes only `/work-queue/topics/*/messages` and `/health/*` publicly. The operator surface
  (remote operations over GraphQL) stays on MJAPI; the gateway never hosts it.
- **Graceful shutdown:** stop accepting (ready → 503), finish in-flight requests up to 20 s, exit. Partial
  batches are never acknowledged, because the response is sent only after the transport settles.
- **Rate limiting:** per API key token bucket, in memory per instance (config `gateway.rateLimit`). A
  Redis-backed global limit is optional later.

### Configuration (`mj.config.cjs`)

```js
gateway: {
  port: 4100,
  topologyRefreshSeconds: 30,
  maxMessagesPerRequest: 100,
  rateLimit: { requestsPerSecond: 200, burst: 400 },   // per API key
}
```

### Observability

- Structured logs: requestId, apiKeyId, topic, accepted/duplicate/rejected counts, latency.
- Metrics (OpenTelemetry or EMF): `wq_publish_requests`, `wq_publish_messages{status}`,
  `wq_publish_latency_ms`, `wq_transport_errors{transport}`, `wq_topology_reloads`.
- `X-Request-Id` is echoed in responses.

## Interfaces / schema changes

- No schema changes.
- None to the contract: `ValidatePublishRequest` / `BuildWorkMessage` are already in core (03 §1.1), so the
  extension, gateway and 09d share validation.
- Refactor: extract the extension and API-key auth wiring from `serve()` into shared host functions.

## Dependencies on Phase 1

- `work-queue-server` extension written host-agnostic: it takes its config from extension `Settings` and never
  reaches into MJServer globals.
- `WorkQueueEngine` cache, and the driver factory registration pattern.

## Testing

| Tier | What |
|---|---|
| Parity | the same REST contract test suite runs against MJAPI-hosted and gateway-hosted extensions (auth failures, scope denial, `TopicNotExternallyPublishable`, validation errors, dedup `duplicate` results, partial results) |
| Integration | gateway + DB transport on the deterministic tier; gateway + LocalStack SNS on the opt-in AWS job |
| Load | k6 script: 2,000 req/s × 100 msgs to an AWS topic; assert p99 and zero lost/unacknowledged messages (compare SQS counts) |
| Chaos | kill instances mid-request; the client (webhook ingress) retries with the same MessageIDs → counts reconcile |

## Work breakdown

| Item | Size |
|---|---|
| Extract shared extension + API-key auth wiring from MJServer | M |
| Gateway host package + config + health + shutdown | M |
| Topology invalidation (Redis + probe) | S |
| Rate limiting + metrics | S |
| Container image + deployment docs (ECS/App Runner, Container Apps) | M |
| Parity + load tests | M |

## Open questions

1. What is the minimal `StartupManager` set? Today `@RegisterForStartup` engines load globally; the gateway may need an allow-list mechanism so unrelated engines don't boot.
2. Does the gateway need user-context authorization beyond API-key scopes (e.g. topic-level entity permissions of the key's owner)?
3. Should the gateway also terminate provider webhooks directly (e.g. host the 09f SendGrid ingress extension), removing the Lambda hop on AWS deployments?
