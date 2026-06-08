# Plan: Configurable CORS and Rate Limiting for MJ and Skip

**Date:** June 8, 2026  
**Author:** Jordan Fanapour  
**Status:** Draft — pending review with Robert and Craig  
**Relates to:** Security audit findings 7.3 (CORS allows all origins) and 7.4 (no rate limiting)

---

## 1. Current State

### CORS

| System | Current Config | Location |
|--------|---------------|----------|
| **MJ Server** | `app.use(cors())` — all origins allowed | `MJServer/src/index.ts:932` |
| **Skip API** | `app.use(cors())` — all origins allowed | `Skip-Brain/apps/API/src/app.ts:158` |
| **Skip Component Registry** | Configurable via `COMPONENT_REGISTRY_CORS_ORIGINS` env var | `apps/API/src/services/component-registry.ts:172` |

MJ's CORS is intentionally placed before auth middleware so that 401 responses include CORS headers, allowing the browser to read error codes and trigger token refresh.

### Rate Limiting

| System | Current Config | Notes |
|--------|---------------|-------|
| **MJ Server** | None | No rate limiting middleware, no dependencies |
| **Skip API** | Per-org request queue | Default 3 concurrent requests per org, 5-min queue timeout, 10-min processing timeout. Custom-built, not a traditional rate limiter. |

Skip's queue system is designed for AI workload management (long-running requests), not abuse prevention. It doesn't limit request frequency — only concurrency.

---

## 2. CORS Recommendations

### 2.1 MJ Server — Configurable Allowed Origins

**Approach:** Add a `cors` section to MJ's config schema (`mj.config.cjs`) with an allowed origins list. Default to permissive for backward compatibility, but allow deployments to lock it down.

**Config schema addition** (in `MJServer/src/config.ts`):
```typescript
const corsSchema = z.object({
    allowedOrigins: z.array(z.string()).default(['*']),  // Default: all origins (backward compatible)
    allowCredentials: z.boolean().default(true),
    maxAge: z.number().default(86400),  // Preflight cache: 24 hours
});
```

**Config file example** (`mj.config.cjs`):
```javascript
module.exports = {
    cors: {
        allowedOrigins: [
            'https://explorer.example.com',
            'https://admin.example.com',
            'http://localhost:4200',  // Local Angular dev
        ],
        allowCredentials: true,
    }
};
```

**Implementation** (in `index.ts`, replacing line 932):
```typescript
app.use(cors({
    origin: (origin, callback) => {
        const allowed = configInfo.cors?.allowedOrigins ?? ['*'];
        if (allowed.includes('*') || !origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: configInfo.cors?.allowCredentials ?? true,
    maxAge: configInfo.cors?.maxAge ?? 86400,
}));
```

**Key design decisions:**
- Default `['*']` preserves current behavior — no breaking change on upgrade
- Server-to-server calls (like Skip callbacks) typically don't send an `Origin` header, so they're unaffected by CORS restrictions
- `allowCredentials: true` enables cookie/token-based auth from browsers
- `maxAge: 86400` caches preflight responses for 24 hours, reducing OPTIONS requests

### 2.2 Skip API — Configurable Allowed Origins

**Approach:** Same pattern. Add `SKIP_CORS_ORIGINS` env var (comma-separated), defaulting to `*`.

**Implementation** (in `app.ts`, replacing line 158):
```typescript
const corsOrigins = config.corsOrigins;  // From config.ts, parsed from SKIP_CORS_ORIGINS env var
app.use(cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
}));
```

Skip's API is called server-to-server from client MJAPIs (not from browsers), so CORS is less critical here. But if the Skip Admin portal or any browser-based tool calls the API directly, it should be restricted.

---

## 3. Rate Limiting Recommendations

### 3.1 MJ Server — Layered Rate Limiting

MJ needs rate limiting at two layers:

**Layer 1: Global request rate limit (pre-auth)**

Protects against brute-force attacks and basic DoS before any authentication processing. Uses MJ's existing `BaseServerMiddleware.GetPreAuthMiddleware()` extension point.

**Library:** `express-rate-limit` — the standard Express rate limiting middleware, well-maintained, minimal dependencies.

**Config schema addition:**
```typescript
const rateLimitSchema = z.object({
    enabled: z.boolean().default(false),  // Opt-in, not breaking
    global: z.object({
        windowMs: z.number().default(60000),       // 1 minute window
        maxRequests: z.number().default(300),       // 300 requests per minute per IP
        message: z.string().default('Too many requests, please try again later'),
    }).default({}),
    auth: z.object({
        windowMs: z.number().default(900000),      // 15 minute window
        maxAttempts: z.number().default(15),        // 15 failed auth attempts per 15 min
    }).default({}),
    graphql: z.object({
        windowMs: z.number().default(60000),       // 1 minute window
        maxRequests: z.number().default(100),       // 100 GraphQL ops per minute per IP
    }).default({}),
});
```

**Config file example:**
```javascript
module.exports = {
    rateLimiting: {
        enabled: true,
        global: {
            windowMs: 60000,
            maxRequests: 300,
        },
        auth: {
            windowMs: 900000,
            maxAttempts: 15,
        },
        graphql: {
            windowMs: 60000,
            maxRequests: 100,
        },
    }
};
```

**Implementation approach:**

Create a new `RateLimitMiddleware` class extending `BaseServerMiddleware`:

```typescript
@RegisterClass(BaseServerMiddleware, 'RateLimitMiddleware')
export class RateLimitMiddleware extends BaseServerMiddleware {
    GetPreAuthMiddleware(): RequestHandler[] {
        if (!configInfo.rateLimiting?.enabled) return [];
        
        return [
            // Global rate limit — all requests
            rateLimit({
                windowMs: configInfo.rateLimiting.global.windowMs,
                max: configInfo.rateLimiting.global.maxRequests,
                standardHeaders: true,  // Return rate limit info in headers
                legacyHeaders: false,
            }),
        ];
    }
}
```

**Recommended defaults by deployment type:**

| Setting | Development | Production (Internal) | Production (Public-Facing) |
|---------|------------|----------------------|---------------------------|
| Global max/min | 1000 | 300 | 100 |
| Auth attempts/15min | 100 | 15 | 5 |
| GraphQL ops/min | 500 | 100 | 50 |

**Layer 2: Per-user or per-API-key rate limit (post-auth)**

For authenticated users, rate limit by user identity or API key rather than IP. This prevents a single user from monopolizing server resources.

This layer is more complex and can be a Phase 2 item. It would use the `GetPostAuthMiddleware()` extension point and key on `userPayload.email` or `userPayload.apiKeyHash`.

### 3.2 Skip API — Request Frequency Limiting

Skip already has per-org concurrency limiting via its queue system. What it lacks is **request frequency limiting** — preventing a flood of requests from overwhelming the queue itself.

**Approach:** Add `express-rate-limit` before the auth middleware in `app.ts`:

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit by API key (extracted from header before full auth)
const skipRateLimit = rateLimit({
    windowMs: 60000,       // 1 minute
    max: 30,               // 30 requests per minute per key
    keyGenerator: (req) => {
        return req.headers['x-api-key'] as string || req.ip;
    },
    standardHeaders: true,
});

app.use('/api', skipRateLimit);
```

Skip's existing queue system handles concurrency (how many run at once). The rate limiter handles frequency (how fast requests arrive). They complement each other:

| Concern | Mechanism | Default |
|---------|-----------|---------|
| Request frequency | `express-rate-limit` (new) | 30/min per API key |
| Processing concurrency | Per-org RequestQueue (existing) | 3 concurrent per org |
| Queue timeout | RequestQueue (existing) | 5 min max wait |
| Processing timeout | RequestQueue (existing) | 10 min max processing |

---

## 4. Implementation Phases

### Phase 1: CORS Configuration (low effort, high value)
1. Add `cors` config schema to MJ's `config.ts`
2. Update `index.ts` to use configurable origins
3. Add `SKIP_CORS_ORIGINS` to Skip API config
4. Update `app.ts` to use configurable origins
5. Document in deployment guides

**Effort:** ~1 day  
**Risk:** Low — defaults preserve current behavior

### Phase 2: MJ Global Rate Limiting (medium effort, high value)
1. Add `express-rate-limit` dependency to MJServer
2. Add `rateLimiting` config schema
3. Create `RateLimitMiddleware` extending `BaseServerMiddleware`
4. Register in pre-auth middleware pipeline
5. Add standard rate limit response headers

**Effort:** ~2 days  
**Risk:** Low — opt-in via config, disabled by default

### Phase 3: Skip Request Frequency Limiting (low effort, medium value)
1. Add `express-rate-limit` dependency to Skip API
2. Add rate limit config to Skip's `config.ts`
3. Apply before auth middleware, keyed on API key or IP

**Effort:** ~0.5 day  
**Risk:** Low — complements existing queue system

### Phase 4: Per-User Rate Limiting in MJ (medium effort, medium value)
1. Add post-auth rate limiting keyed on user identity
2. Configurable per-user limits
3. Different limits for API key users vs interactive users

**Effort:** ~2 days  
**Risk:** Medium — needs careful tuning to avoid blocking legitimate use

---

## 5. Monitoring and Headers

Both MJ and Skip should return standard rate limit headers so clients can self-regulate:

```
RateLimit-Limit: 100        # Max requests in window
RateLimit-Remaining: 47     # Remaining in current window
RateLimit-Reset: 1717856400 # Window reset timestamp
Retry-After: 30             # Seconds to wait (only on 429 response)
```

`express-rate-limit` provides these automatically with `standardHeaders: true`.

---

## 6. What This Does NOT Cover

- **Query complexity limiting** — preventing expensive GraphQL queries (e.g., deeply nested, large result sets). This is a separate concern typically addressed with Apollo Server plugins like `graphql-depth-limit` or `graphql-query-complexity`.
- **DDoS protection** — application-level rate limiting doesn't protect against network-layer attacks. That requires infrastructure-level solutions (CDN, WAF, load balancer rules).
- **Per-entity rate limiting** — restricting how often specific entities can be queried. Could be a future extension of the API key scope system.
