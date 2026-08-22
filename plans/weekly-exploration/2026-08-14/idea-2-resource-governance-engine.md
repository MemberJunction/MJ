# Idea 2: Unified Resource Governance Engine (Budgets, Quotas & Rate Limits)

**Week of 2026-08-14 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

A small association's ED signs up for an MJ-based app expecting predictable costs, then three
months later gets a surprise five-figure AI bill because an agent got stuck in a retry loop
summarizing the same 200-page grant PDF all weekend, or an integration sync hammered a paid API
past its plan's limit and the vendor throttled (or billed overage on) the whole account. Nobody
did anything malicious — nobody did anything at all. The system had no concept of "stop, you're
about to spend more than this org can afford," so it didn't stop.

This is a named, current problem in the AI agent ecosystem, not a hypothetical: 2026 framework
benchmarks now compare LangGraph/CrewAI/AutoGen explicitly on **token-efficiency and per-run
dollar cost** the way databases are benchmarked on latency, and Gartner's 2026 agent Hype Cycle
calls out runaway-spend loops ("tokenmaxxing") as the dominant failure mode among the small
minority of organizations that have shipped agents to production. n8n's governance guidance now
treats **token-budget guardrails and model-cascading cost controls as core infrastructure**, not a
nice-to-have. MJ has the AI-specific half of this problem partially solved; it has no general
answer for API calls, storage, or compute — and, as the codebase reconnaissance below shows, it
has quietly solved the *rate-limiting* slice of this problem six separate times instead of once.

## What already exists (and why this doesn't duplicate it)

- **AI cost tracking is real but AI-only.** `AIPromptRun.TotalCost` and
  `AIAgentRun.TotalCost`/`TotalCostRollup` (the latter explicitly summing sub-agent costs, per its
  field description in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`) already
  capture spend per prompt/agent run, and there's a dedicated `cost-budget` dashboard component
  under `packages/Angular/Explorer/dashboards/src/AI/components/analytics/cost-budget`. This
  proposal does not replace that — it **generalizes the pattern** the AI subsystem already proved
  works (a cost-rollup field + a dashboard) to every other metered resource, and the AI cost
  fields become the first data source the new engine ingests, not a system to rebuild.
- **Rate limiting has been reinvented at least six times**, with no shared interface:
  `packages/AI/MCPClient/src/RateLimiter.ts`, `packages/Integration/engine/src/RateLimiter.ts`,
  `packages/RecordSetProcessor/engine/src/RateLimiter.ts`,
  `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts` (paired with its own
  `RunBudget.ts`), `packages/SearchEngine/src/rerankers/RerankerBudgetGuard.ts`, and an
  action-level limiter inside `CoreActions` (`api-rate-limiter.action.ts`). Each is a
  package-local token-bucket or window-counter with slightly different semantics. This is the
  textbook "pattern proven in N places, never extracted" signal — exactly the situation the
  Dupe engine and VersionHistory were built to *stop* happening for their respective problems.
- **`ScheduledJobEngine`** already provides the periodic-refresh substrate this proposal reuses
  for budget-window resets and alert sweeps (the same substrate Query Materialization and last
  week's Engagement Scoring proposal both lean on) — no new scheduler.
- This is **not** the Approval Gates idea above: an Approval Gate asks "should a human sign off
  before this specific run happens"; a Resource Budget asks "has this identity/integration/agent
  exceeded its allotted spend, regardless of who approved any individual run." A gate can consult
  a budget's remaining headroom as one of its `TriggerCondition` inputs (e.g., "require approval
  once 80% of the monthly AI budget is consumed") — the two compose cleanly, but neither requires
  the other to ship.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Resource Budgets` | A configured quota: Name, ScopeType (`Organization`/`Application`/`AIAgent`/`Integration`/`UserID`), ScopeID, ResourceType (`AITokens`/`AICost`/`APICallCount`/`StorageBytes`/`Custom`), LimitValue, WindowType (`Rolling24h`/`CalendarMonth`/`Lifetime`), OnExceedBehavior (`Block`/`Alert`/`Throttle`), AlertThresholdPercent |
| `MJ: Resource Usage Events` | Append-only metered event: BudgetID (nullable — events post even with no matching budget yet, so history exists before a budget is configured), ResourceType, Quantity, SourceEntityID/SourceRecordID (what generated the spend — an AIPromptRun, an Integration sync, a File upload), OccurredAt |
| `MJ: Resource Usage Rollups` | Materialized per-budget, per-window aggregate (reuses the Query/Entity Materialization substrate from the in-flight `plans/query-entity-materialization.md` work rather than reinventing rollup scheduling): BudgetID, WindowStart/End, TotalQuantity, PercentOfLimit, Status (`Normal`/`Warning`/`Exceeded`) |

### `ResourceGovernanceEngine` (new package `packages/Core/ResourceGovernance`,
`BaseEngine`/`BaseEngineRegistry` pattern)

- `RecordUsage(resourceType, quantity, scopeContext, sourceRef)` — the one call site every metered
  subsystem posts to. `AIPromptRun`/`AIAgentRun` completion, `Integration` API-call completion,
  `MJStorage` writes, and Action executions all call this instead of (or as well as, during
  migration) their own local counters.
- `CheckBudget(resourceType, scopeContext, projectedQuantity)` — called **before** an expensive
  operation starts (an AI call, an API request, a bulk sync batch) to get a `Proceed` /
  `ProceedWithWarning` / `Block` verdict, replacing each package's bespoke `RateLimiter.tryAcquire()`
  with one shared, better-tested implementation. Existing package-local rate limiters migrate to
  become thin wrappers calling this engine, retiring their independent logic over time — not a
  breaking change on day one.
- Alert sweep (via `ScheduledJobEngine`) evaluates `AlertThresholdPercent` crossings and raises a
  notification through the existing `@memberjunction/notifications` `NotificationEngine` — no new
  notification-delivery mechanism, just a new event type feeding the one that exists.

### UI (Angular, L1/L2 per the UI layering guide)

- **Budget & Usage Governance dashboard** — spend-over-time charts and current-window gauges
  broken out by scope (org / app / agent / integration) and resource type, a "what's consuming
  this budget" drill-down listing the `Resource Usage Events` that make up the current window, and
  inline budget authoring (set a limit, pick a window, pick a behavior) without touching config
  files.
- **`ng-budget-gauge` widget** — a compact, embeddable remaining-headroom gauge, usable on an AI
  Agent's own configuration form or an Integration's detail form, the same "embed a generic widget
  on any relevant entity form" pattern idea 1 from 2026-08-07 used for its engagement widget.

### Why this belongs in core, not an app

Every organization that puts real usage behind an MJ-built app — AI-heavy or not — eventually
needs to answer "what is this costing us, and can we cap it before it surprises us." The mechanism
(post metered events against a scope, evaluate against a configured limit, alert or block) has
nothing to do with what the organization does; only the specific budgets an admin configures are
domain-specific, and that's metadata, not code.

## Phased rollout

1. **Phase 1** — `Resource Budgets` + `Resource Usage Events` entities, `ResourceGovernanceEngine`
   with `RecordUsage`/`CheckBudget`, wired first to the AI subsystem (mapping existing
   `AIPromptRun.TotalCost` writes into `RecordUsage` calls — the lowest-risk, already-instrumented
   integration point) and the Budget & Usage dashboard (AI scope only).
2. **Phase 2** — Migrate the six existing package-local rate limiters to call `CheckBudget()`
   instead of their own logic, one package at a time, starting with `Integration/engine` (the
   heaviest external-API user). `Resource Usage Rollups` + alerting via `NotificationEngine`.
3. **Phase 3** — Storage and Action-execution metering, `ng-budget-gauge` embeds, and an
   org-wide "cost forecast" projection (linear trend off `Resource Usage Rollups`) surfaced on the
   dashboard so an ED sees a budget overrun coming weeks before it happens, not after the invoice.

## Open questions

- `OnExceedBehavior = Block` for a live AI Agent mid-conversation needs a graceful degradation
  path (fail the tool call with a clear message the agent can react to, not a raw exception) —
  flagged for Phase 1 detailed design, since a hard block that just crashes the agent run would be
  worse than no governance at all.
- Should `Resource Usage Events` be retained indefinitely for audit purposes, or rolled up and
  pruned after N months? Leaning toward configurable retention mirroring how Record Changes
  handles long-term audit volume, deferred to Phase 1.

## Mockup

See [`mockups/resource-governance-dashboard.html`](./mockups/resource-governance-dashboard.html) —
the Budget & Usage Governance dashboard showing AI, API, and storage spend against configured
budgets, a drill-down into what's consuming an over-threshold budget, and the budget-authoring
panel. Screenshot:
[`screenshots/idea-2-resource-governance-dashboard.png`](./screenshots/idea-2-resource-governance-dashboard.png).
