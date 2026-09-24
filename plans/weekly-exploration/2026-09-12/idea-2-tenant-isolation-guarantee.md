# Idea 2: Tenant Isolation Guarantee Layer

**Week of 2026-09-12 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

A growing share of MJ deployments are not "one org, one database" — they're a single MJ instance
serving many federated chapters, many client organizations of an association-management vendor, or
many customer accounts of a SaaS product built on MJ. That shape is exactly where a data breach
becomes existential rather than merely embarrassing: it's not "our data leaked," it's "chapter A's
donor list was visible to chapter B," or "customer 1's records showed up in customer 2's dashboard."
Multi-tenant data leakage is a well-documented risk category in SaaS platforms generally, and it is
categorically worse for a mission-driven organization whose entire value proposition to its members
or donors rests on being trusted with their information. This isn't a theoretical concern for MJ
specifically — the repository's own backlog has an open, long-stale issue (**#1963**, filed in the
2024 "Server Modernization" cycle, no activity since) asking for exactly this kind of data
separation, and it never went anywhere.

The uncomfortable finding this week's codebase reconnaissance turned up is that MJ actually has a
genuinely well-built tenant boundary — just not everywhere the data flows. Someone already did the
hard, careful part (fail-closed header validation, a strict tenant-ID allowlist, admin-bypass roles,
platform-correct identifier quoting) and it holds at the one layer they built it for. The risk isn't
that the primitive is weak; it's that three other layers a request's data can flow through today have
no equivalent guarantee at all — which means the *existence* of a solid query-layer filter can create
false confidence that the whole system is tenant-safe when it isn't.

## What already exists (and why this doesn't duplicate it — it closes the gap around it)

`packages/MJServer/src/multiTenancy/index.ts` is the real, working boundary this proposal builds on,
not replaces:

- `createTenantMiddleware` resolves a `TenantContext` from a request header, validated against a
  strict allowlist pattern before it ever touches a query — a malformed or missing header is
  **rejected**, never silently degraded to an unscoped session.
- `createTenantPreRunViewHook` injects a `WHERE TenantColumn = '<tenant>'` predicate into every
  `RunView` for scoped entities, resolving the column through real entity metadata (never a
  hardcoded/interpolated string) and quoting it through the active provider so it's correct on both
  SQL Server and PostgreSQL.
- `createTenantPreSaveHook` validates (or auto-assigns, on create) the tenant column on every write,
  in a configurable `strict`/`log`/`off` mode.

This proposal does not touch any of that logic. It closes three specific places where a
tenant-scoped *query* can still leak tenant-scoped *data* because the surrounding infrastructure
never learned about `TenantContext` at all:

- **Server-side caching** — `packages/MJCore/src/generic/localCacheManager.ts` fingerprints a cached
  `RunView` result by query shape only. `TenantContext` never enters the fingerprint, so two tenants
  issuing the *same query shape* (same entity, same filter text, same sort) against a
  tenant-filtered view could, depending on cache-key collision, be served each other's cached rows —
  the one failure mode the query-layer hook cannot see, because caching sits in front of it.
- **Vector search namespacing** — tenant scoping in the vector layer exists only as a per-provider
  opt-in config knob (`namespaceField` in `packages/AI/Vectors/Database/src/generic/configuration.types.ts`),
  and today only Pinecone actually exercises it. Any other configured vector provider pools all
  tenants' embeddings in one namespace with nothing enforcing otherwise.
- **Scheduled/background jobs** — `packages/Scheduling/engine/src/ScheduledJobEngine.ts` has no
  `TenantID`/`TenantContext` concept anywhere in it. A scheduled job that iterates "all records of
  entity X" today iterates *every* tenant's records, because nothing told it there was more than one.

This is deliberately distinct from **Field-Level Security** (#3367, merged) and **Row-Level
Security** — both govern *what a permitted user may see within their own data*, a permission
question. This proposal governs the *hard partition between tenants*, upstream of any permission
question — even a user with zero permission problems inside their own tenant should never be able
to receive another tenant's rows through a cache slot, a vector query, or a background job's output.

## Proposed architecture

- **Cache-key fingerprint fix** — extend `localCacheManager`'s fingerprinting function to fold in
  `contextUser.TenantContext.TenantID` when present. Purely additive: a single-tenant deployment
  (where `TenantContext` is always undefined) produces an identical fingerprint to today, so there is
  no behavior change or performance cost for the majority of deployments that don't use multi-tenancy
  at all.
- **`TenantScopedJobContext`** — a nullable `TenantID` on scheduled job definitions/run context, so a
  tenant-scoped job attaches the same `TenantContext` a request-driven `RunView` already gets, and
  runs through the *existing* `createTenantPreRunViewHook` mechanism rather than a new one. A job with
  no `TenantID` behaves exactly as it does today (cross-tenant, for genuinely cross-tenant maintenance
  jobs that need to run that way) — this is opt-in generalization, not a forced migration of every
  existing scheduled job.
- **Mandatory vector namespace enforcement** — promote tenant-aware namespacing from a per-provider
  opt-in to a check every `VectorProviderBase` implementation must satisfy: if a deployment has
  multi-tenancy enabled, any configured vector provider that hasn't wired a namespace field fails
  loudly at startup/configuration time, rather than silently pooling vectors across tenants at query
  time. Fail-closed at configuration, exactly the philosophy the existing header-validation code
  already uses for the request path.
- **`TenantIsolationAuditor`** — a CI-style static check (in the same family as the repo's existing
  `check:ui`/`check:standards`/`check:esm` gates) that scans for RunView/cache/scheduled-job/vector
  code paths reading entity data with no tenant-aware hook in the call chain, plus a runtime
  self-test an operator can run after any deployment or config change: authenticate as tenant A,
  attempt to read a known tenant-B record through each of the four layers, and assert a hard failure
  on every one. This turns "we believe isolation holds" into something an operator can actually
  verify on demand, rather than trusting the design.

### UI

A **Tenant Isolation** admin dashboard (Angular, L2, `scaffold-mj-dashboard` pattern) showing each of
the four layers — Query, Cache, Vector, Scheduled Jobs — with a pass/fail status from the most recent
self-test run and a "run self-test now" action, plus a configuration surface for
`entityColumnMappings`/`scopingStrategy` (config-file-only today) with live validation against real
entity metadata before anything is saved.

### Why this belongs in core, not an app

Every organization running a shared MJ instance for multiple chapters, clients, or customers needs
the *same* four-layer guarantee — this is infrastructure hardening for a primitive MJ already ships,
not a vertical feature. The specific columns and thresholds an org configures are deployment-
specific; the mechanism (a request-scoped context propagated through every subsystem that touches
data, and a way to prove it) is not.

## Phased rollout

1. **Phase 1** — cache-key fingerprint fix (smallest change, closes the highest-severity silent-leak
   path since caching sits in front of the query-layer hook today) plus the `TenantIsolationAuditor`
   static scan and runtime self-test, so the gap is measurable before every layer is fixed.
2. **Phase 2** — `TenantScopedJobContext` propagation through `ScheduledJobEngine`.
3. **Phase 3** — mandatory `VectorProviderBase` namespace enforcement across all providers (not just
   Pinecone), and the Tenant Isolation admin dashboard.

## Open questions

- **Retrofitting existing scheduled jobs.** Any deployment already running scheduled jobs today
  presumably relies on their current (unscoped) behavior for cross-tenant maintenance work — the
  `TenantID` field on job definitions must default to unset/cross-tenant so nothing changes until an
  operator explicitly opts a specific job into tenant scoping.
- **Should the runtime self-test be a CI gate?** Leaning toward "required, but only for deployments
  that have `multiTenancy` enabled in `mj.config.cjs`" — forcing every single-tenant deployment to run
  a tenant-isolation self-test would be pure overhead with nothing to verify.
- **Vector-provider migration path.** Requiring a namespace field on every provider could break an
  existing multi-tenant deployment that configured a non-Pinecone provider without one. Leaning
  toward a loud startup warning in Phase 3's first release and a hard failure only in the following
  one, giving operators one upgrade cycle to add the missing config.

## Mockup

See [`mockups/tenant-isolation-dashboard.html`](./mockups/tenant-isolation-dashboard.html) — the
Tenant Isolation dashboard showing per-layer self-test status, the tenant-scoping configuration
surface, and a simulated cross-tenant self-test result. Screenshot:
[`screenshots/idea-2-tenant-isolation-dashboard.png`](./screenshots/idea-2-tenant-isolation-dashboard.png).

## Sources

- MemberJunction repo issue **#1963** ("Server Modernization... Multi-Tenant Data Separation") —
  filed 2024, still open, no follow-up implementation — confirms this gap has been recognized and
  unaddressed for two years.
- Internal analysis (this exploration, 2026-09-12): direct reading of
  `packages/MJServer/src/multiTenancy/index.ts`, `packages/MJCore/src/generic/localCacheManager.ts`,
  `packages/AI/Vectors/Database/src/generic/configuration.types.ts`, and
  `packages/Scheduling/engine/src/ScheduledJobEngine.ts` — the query-layer hook's completeness is
  what makes the absence of an equivalent in the other three layers concrete rather than
  speculative; this is a codebase finding, not an externally sourced statistic.
