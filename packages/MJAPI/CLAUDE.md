# MJAPI — server runtime configuration

Runtime configuration for the MJ API server: connection pooling, startup mode, and the public-URL
callback setting. CodeGen's separate, short-lived pool is configured elsewhere — see
[`packages/CodeGenLib/CLAUDE.md`](../CodeGenLib/CLAUDE.md).

## Running locally

MJAPI runs on port **4001** (set by `GRAPHQL_PORT=4001` in `.env`); MJExplorer runs on **4201**.
Start from this directory with `npm run start`, or from the repo root with `npm run start:api`.

Run both as background processes so you can restart them after code changes. After rebuilding a
server-side package, **restart MJAPI** to pick up the change. After rebuilding an Angular library,
MJExplorer's Vite dev server auto-reloads — no restart needed.

---

## SQL Server Connection Pooling

Configure the runtime pool via `mj.config.cjs` at the repository root:

```javascript
module.exports = {
  databaseSettings: {
    connectionPool: {
      max: 50,                     // Maximum connections (default: 50)
      min: 5,                      // Minimum connections (default: 5)
      idleTimeoutMillis: 30000,    // Idle timeout in ms (default: 30000)
      acquireTimeoutMillis: 30000  // Acquire timeout in ms (default: 30000)
    }
  }
};
```

### Recommended settings

- **Development**: `max: 10`, `min: 2`
- **Production standard**: `max: 50`, `min: 5`
- **Production high load**: `max: 100`, `min: 10`

Monitor SQL Server wait types (`RESOURCE_SEMAPHORE`, `THREADPOOL`) to tune pool size. The pool is
created once at server startup and reused for the application lifetime.

---

## Startup Mode (`startup.mode` / `MJ_STARTUP_MODE`)

Every server-side MJ process boots through `StartupManager.Instance.Startup()`, which by default
pre-warms every imported `@RegisterForStartup` engine. The **startup mode** makes that configurable
so short-lived CLI/script processes skip the pre-warm tax:

| Mode | Behavior | Default for |
|---|---|---|
| `full` | All registered engines run at boot — sync engines awaited in priority groups, then deferred engines fire (pre-change behavior, byte-for-byte) | MJAPI (SQL Server and PG paths) |
| `task` | **No** registered engines execute (sync or deferred); every engine lazy-loads on first touch via its own `Config()`/`EnsureLoaded()` call. `LocalCacheManager` init still runs | MJCLI, mj-sync (`initializeProvider`), CodeGen |

Skipping pre-warm is safe by construction: MJ's convention is that every engine consumer calls
`await Engine.Instance.Config(false, user, provider)` at entry, which no-ops if loaded and loads on
demand otherwise. Startup registration is an optimization, not a correctness requirement.

### Mode resolution precedence (highest wins)

1. **`MJ_STARTUP_MODE` env var** — per-invocation override, e.g. `MJ_STARTUP_MODE=full pnpm mj sync push`. Invalid values warn and fall through (never crash).
2. **Programmatic option** passed by the entry point (e.g. `setupSQLServerClient(cfg, { mode: 'task' })`).
3. **`mj.config.cjs` → `startup.mode`** — note this file is shared by every process in a repo, which is why the env var and programmatic levels outrank it.
4. **Entry-point default** — `full` for MJAPI, `task` for CLI-style processes.

Resolution lives in ONE shared helper — `ResolveStartupMode()` in `@memberjunction/core` — so every
entry point behaves identically. It returns `{ mode, source }` and logs the outcome (non-verbose
when an env/config override won, so a server silently switched to task mode by a shared config is
visible at boot).

```javascript
// mj.config.cjs
module.exports = {
  startup: {
    mode: 'task',   // 'full' | 'task' — omit to use each entry point's default
  },
};
```

### Trade-offs to know

- **Fail-fast validators don't run in `task` mode.** `EncryptionStartupValidator` (priority 200, severity `error`) is a boot-time misconfiguration check, not a cache — in `task` mode encryption misconfiguration surfaces at first use instead of at startup. `full` mode (servers) keeps the fail-fast guarantee.
- **First touch pays the load.** A `task`-mode process's first AI call absorbs the deferred cost — including the ~50MB local-embeddings model download/load on the first `FindSimilar*`-style call (`AIEngine.ensureEmbeddingsGenerated`). The boot log line `MJ startup: task mode — engine pre-warm skipped (N engine(s) deferred to first use)` makes this discoverable.
- **Opt-up escape hatch**: a process booted in `task` mode can later run `StartupManager.Instance.Startup(true, user, provider, { mode: 'full' })` (`forceRefresh` bypasses the cached result). Client-side startup (`GraphQLDataProvider`, Angular shell) passes no options and always gets `full`.

---

## MJAPI Public URL Configuration

When MJAPI needs to communicate with remote services (like Skip API), it sends a callback URL so
the remote service can make requests back to MJAPI. By default this URL is constructed from
`baseUrl`, `graphqlPort`, and `graphqlRootPath` (e.g., `http://localhost:4000/`).

For development scenarios where MJAPI runs locally but must be reachable by remote services,
configure a public URL.

### Configuration methods

**1. Environment variable (recommended for development)**

```bash
# Using ngrok
ngrok http 4000
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:4000

# Set the environment variable (include the full path if graphqlRootPath is not '/')
export MJAPI_PUBLIC_URL=https://abc123.ngrok.io
# OR if graphqlRootPath is '/graphql'
export MJAPI_PUBLIC_URL=https://abc123.ngrok.io/graphql

# Start MJAPI
npm run start:api
```

**2. Configuration file** — add to `mj.config.cjs` or `.mjrc`:

```javascript
module.exports = {
  publicUrl: 'https://your-public-url.com',  // Include full path if needed
  // ... other configuration
};
```

### How it works

- When `publicUrl` is configured, MJAPI uses it as the `callingServerURL` when communicating with remote services
- If `publicUrl` is not set, MJAPI constructs the URL as `${baseUrl}:${graphqlPort}${graphqlRootPath}`
- `publicUrl` should include the complete path including any root path (e.g. `/graphql`)
- This preserves backward compatibility while enabling hybrid development scenarios

### Use cases

- **Local development with remote services**: test local MJAPI changes against production Skip API
- **Webhook testing**: receive callbacks from remote services during development
- **Hybrid deployments**: mix local and cloud services during development/testing

---

## Switching database platforms (SQL Server ↔ PostgreSQL)

When developing against both SQL Server and PostgreSQL on the same URL/port (e.g.
`localhost:4000`), **clear your browser cache** after switching backends. `GraphQLDataProvider`
caches entity metadata and query results in the browser. SQL Server returns UUIDs uppercase and
PostgreSQL lowercase, so stale cached data from one platform causes subtle mismatches on the other.
Clear the cache (or use an incognito window) whenever you switch the backend behind the same
endpoint.

## Related

- **CodeGen's separate pool + env vars** — [`packages/CodeGenLib/CLAUDE.md`](../CodeGenLib/CLAUDE.md)
- **Caching architecture** — [`guides/CACHING_AND_PUBSUB_GUIDE.md`](../../guides/CACHING_AND_PUBSUB_GUIDE.md)
- **Transport layer (resolvers, GraphQL clients)** — [`guides/TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md`](../../guides/TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md)
- **Docker containers** — [`docker/CLAUDE.md`](../../docker/CLAUDE.md)
