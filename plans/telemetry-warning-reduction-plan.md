# Telemetry Warning Reduction Plan

Status: **proposal — awaiting review before tagging any call sites**

## Background

The telemetry system runs optimization/redundancy analyzers over `RunView`/`RunViews` traffic and emits advisory warnings:

- **Duplicate RunView Detected** — identical query (same entity + filter/orderBy) repeated.
- **Entity Already in Engine** — a `RunView` for an entity that a `BaseEngine` already caches.
- **Sequential Queries Could Be Parallelized** — N single `RunView`s in a row that could be one `RunViews` batch.
- **Multiple Queries for Same Entity** — same entity queried ≥3 times with different filters.

Many of these are *true positives* worth fixing. But a meaningful class are **intentional** — deliberate fresh/live-state reads (often `BypassCache: true`), security fail-closed reads, idempotency checks, and memory-bounded sweep/pagination loops — where the analyzer's suggestion ("use the cached engine copy" / "batch these") is wrong or impossible. Those produce recurring noise that forces re-investigation.

## What shipped (the mechanism)

A new opt-in on `RunViewParams`:

```ts
Telemetry?: { Exempt?: boolean; Reason?: string }
```

- `Exempt: true` removes the call from the optimization/redundancy analyzers — it produces no warning **and** is excluded from the analyzer context so it doesn't inflate counts for other queries, and doesn't form/contribute to duplicate-pattern detection. Timing/stat telemetry is still recorded.
- `Reason` is recorded with the telemetry event and printed as a verbose breadcrumb (`💡 [Telemetry] Analysis exempt for RunView "<entity>" — <reason>`) for auditability.
- A `RunViews` batch is treated as exempt only when **every** constituent view opts in (a mixed batch is still analyzed).

Implemented in: `MJCore/src/views/runView.ts`, `MJCore/src/generic/telemetryManager.ts`, `MJCore/src/generic/providerBase.ts`. First consumer (reference): `Scheduling/engine/src/ScheduledJobEngine.ts` `sweepStaleInflightJobs` (live lock-state read).

## Real fixes already done (not exemptions)

- **`AI/Vectors/Sync/src/models/entityVectorSync.ts` `UpsertEntityRecordDocumentBatch`** — the per-group Entity-Record-Document existence checks were a sequential `RunView`-per-group loop. Now batched into a single parallel `RunViews` call. (This was the "Sequential Queries" warning on a clean-DB first full sync.)

## Candidates to tag `Telemetry: { Exempt: true, Reason: '…' }` — FOR REVIEW

Curated from a read-only sweep. **None of these are tagged yet** — opine on each (or by cluster) before we apply. Rule of thumb that emerged: **`BypassCache: true` ⟹ almost always an exempt candidate**, since the author already opted out of caching and the "use cached engine copy" suggestion is nonsensical.

### HIGH confidence (explicit `BypassCache: true` and/or explicit live/fresh-intent comment)

| File:Line | Entity | What it does | Signal | Analyzer |
|---|---|---|---|---|
| Integration/engine/src/IntegrationEngine.ts:309 | MJ: Company Integration Runs | Resume orphaned in-progress syncs on boot | BypassCache + "resume must see live in-progress runs" | Entity Already in Engine |
| Integration/engine/src/IntegrationEngine.ts:720 | MJ: Company Integrations | Read sync config at start | BypassCache + "stale cache" | Entity Already in Engine |
| Integration/engine/src/IntegrationEngine.ts:727 | MJ: Company Integration Entity Maps | Read sync config at start | BypassCache + "stale cache" | Entity Already in Engine |
| Integration/engine/src/IntegrationEngine.ts:733 | MJ: Integrations | Read sync config at start | BypassCache + "stale cache" | Entity Already in Engine |
| Integration/engine/src/IntegrationEngine.ts:796 | MJ: Company Integration Runs | Full-vs-incremental decision via committed run count | BypassCache | Entity Already in Engine |
| Integration/engine/src/IntegrationEngine.ts:2206 | MJ: Company Integration Record Maps | Load record maps for sync (per entity-map) | BypassCache + "committed record-map state" | Already in Engine / Multiple-Same-Entity |
| Integration/engine/src/IntegrationEngine.ts:2265 | MJ: Company Integration Record Maps | External-id write-back lookup (per-record loop) | BypassCache + "committed external-id mapping" | Multiple Queries Same Entity |
| Integration/engine/src/IntegrationEngine.ts:2568 | MJ: Company Integration Record Maps | Orphan-sweep comparison (per entity-map) | BypassCache + "orphan-sweep committed state" | Multiple Queries Same Entity |
| Integration/engine/src/IntegrationEngine.ts:2673 | MJ: Company Integration Field Maps | LoadFieldMaps (2× per entity-map) | BypassCache + "must see freshly-applied maps" | Already in Engine / Duplicate |
| Integration/engine/src/IntegrationEngine.ts:3818 | MJ: Company Integration Record Maps | Upsert-by-identity (per-record loop); stale miss → dup | BypassCache + "stale miss re-creates duplicate" | Multiple Queries Same Entity |
| Integration/engine/src/WatermarkService.ts:37 | MJ: Company Integration Sync Watermarks | Load-or-create watermark (avoid UNIQUE violation) | BypassCache + "true DB state" | Entity Already in Engine |
| Integration/engine/src/MatchEngine.ts:253 | MJ: Company Integration Record Maps | CREATE-vs-UPDATE per record (Resolve loop) | BypassCache + "cached null would wrongly CREATE" | Multiple Queries Same Entity |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:2950 | MJ: Company Integration Entity Maps | Idempotency: find existing map (per mapDef) | BypassCache + "must read COMMITTED" | Duplicate RunView |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:3498 | MJ: Company Integration Entity Maps | Idempotency in discovery (per object) | BypassCache + "COMMITTED state" | Duplicate RunView |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:4250 | MJ: Company Integration Entity Maps | Operational list for wizard/lifecycle | BypassCache + "must reflect COMMITTED" | Entity Already in Engine |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:4278 | MJ: Company Integration Field Maps | Operational field-map list | BypassCache | Entity Already in Engine |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:4482 | MJ: Company Integration Entity Maps | Live status immediately after toggle (RunViews[0]) | BypassCache + "live state after toggle" | Entity Already in Engine |
| SearchEngine/src/permissions/SearchScopePermissionResolver.ts:207 | MJ: AI Agent Search Scopes | Fail-closed: is scope assigned to agent (security) | BypassCache + "stale cache must never let … reach a scope" | Already in Engine / Duplicate |
| SearchEngine/src/permissions/SearchScopePermissionResolver.ts:234 | MJ: Search Scope Permissions | Fail-closed: load permission rows (security) | BypassCache + "decisions must NEVER read stale cache" | Already in Engine / Duplicate |
| MJCoreEntities/src/engines/UserInfoEngine.ts:1039 | MJ: User Applications | Cache-miss repair: re-read live DB state | BypassCache + cache-miss fallback | Entity Already in Engine |
| MetadataSync/src/lib/sync-engine.ts:706 | (dynamic entity) | Lookup during push must hit DB (correctness) | BypassCache + "lookups during a push must go to DB" | Already in Engine / Duplicate |
| AI/Vectors/Core/src/models/VectorBase.ts:97 | (dynamic entity) | Vectorization sweep: page-by-page bulk read | BypassCache + "fresh DB read" | Duplicate / Already in Engine |
| AI/Vectors/Memory/src/models/SimpleVectorDatabase.ts:167 | (dynamic entity) | In-process vector DB loads all rows on index load | BypassCache + cache-freshness comment | Entity Already in Engine |
| RecordSetProcessor/base/src/sources/sourceUtil.ts:70 | (dynamic entity) | Batch-paging sweep read of entity records | BypassCache + pagination cursor | Entity Already in Engine |
| Actions/CoreActions/.../scheduled-geocoding.action.ts:304 | (dynamic entity) | Keyset-paginated geocoding batch sweep | BypassCache + keyset pagination | Duplicate / Sequential |
| Actions/CoreActions/.../scheduled-geocoding.action.ts:332 | (dynamic entity) | Offset-pagination fallback (composite-key) | BypassCache + pagination | Duplicate / Sequential |
| Actions/CoreActions/.../scheduled-geocoding.action.ts:375 | MJ: Record Geo Codes | Failed-retry sweep `while` loop (StartRow paging) | BypassCache + repeated same-entity loop | Duplicate / Sequential |
| Actions/CoreActions/.../scheduled-geocoding.action.ts:539 | MJ: Record Geo Codes | Orphan-cleanup paging loop | BypassCache + repeated same-entity loop | Duplicate / Sequential |
| Actions/CoreActions/.../scheduled-geocoding.action.ts:777 | MJ: Record Geo Codes | Load existing geocode map for dedup | BypassCache + volatile state | Entity Already in Engine |
| AI/Agents/src/realtime/.../SessionJanitor.ts:260 | MJ: AI Agent Sessions | Janitor keyset-sweeps sessions to close stale orphans | keyset AfterKey + age filter sweep | Sequential Queries |

> Client-transport `BypassCache` reads (`GraphQLDataProvider/.../graphQLAIClient.ts:678`, `graphQLTestingClient.ts:362`) run on the client path, not a server loop — unlikely to trip analyzers; noted, not tabled.

### MEDIUM confidence (intent likely; one-shot, or no explicit comment, or conditional trip)

| File:Line | Entity | What it does | Signal |
|---|---|---|---|
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:2980 | MJ: Company Integration Field Maps | Idempotency field-map check (inner loop) | BypassCache |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:3556 | MJ: Company Integration Field Maps | Idempotency field-map check | BypassCache |
| MJServer/src/resolvers/IntegrationDiscoveryResolver.ts:4491 | MJ: Company Integration Runs | Last-run query alongside live status (RunViews[1]) | BypassCache (no inline comment) |
| AI/Vectors/Sync/src/models/entityVectorSync.ts:598 | (dynamic entity) | Vectorization keyset pagination loop | sequential paging sweep |
| MJServer/src/agentSessions/SessionManager.ts:381 | MJ: AI Agent Session Channels | On close, load all live non-Disconnected channels | session-scoped volatile state |
| AI/Agents/src/realtime/realtime-client-session-service.ts:873 | MJ: AI Agent Runs | Finalize orphaned Running co-agent runs for a session | fresh session-scoped read |
| AI/Agents/src/realtime/realtime-client-session-service.ts:902 | MJ: AI Prompt Runs / Agent Run Steps | Find child runs to finalize (batched RunViews) | fresh, session-scoped |
| AI/RealtimeBridge/Server/src/calendar-watcher.ts:317 | MJ: AI Agent Session Bridges | Dedup check (idempotent, fail-safe) | transaction-like dedup read |
| AI/RealtimeBridge/Server/src/scheduled-bridge-runner.ts:172 | MJ: AI Agent Session Bridges | Poll for due bridges (Status='Scheduled' + time) | recurring poll/sweep |
| APIKeys/Engine/src/APIKeyEngine.ts:~700 | MJ: API Keys | Per-request API-key hash validation (point query) | non-batchable security lookup |
| MJServer/src/auth/magicLink/MagicLinkService.ts:~212 | MJ: Magic Link Invites | Single-use invite redemption by token hash | single redemption gate |
| AI/Agents/src/memory-manager-agent.ts:588 | MJ: AI Agent Runs | Last-run timestamp, narrow projection | scoping projection |
| AI/Agents/src/memory-manager-agent.ts:785 | MJ: AI Agent Runs | High-value artifact runs, narrow projection | design comment |
| MJServer/src/resolvers/AutotagPipelineResolver.ts:~168 | MJ: Content Sources | First-available content source (MaxRows:1) | single lookup |

### LOW confidence (review, lean against tagging)

| File:Line | Entity | Why low |
|---|---|---|
| AI/Agents/src/agent-pre-execution-rag.ts:~421 | MJ: Templates / Template Contents | Fallback-only path on engine cache miss; rarely hot |
| MJQueue/src/generic/QueueManager.ts:~78 | MJ: Queue Types | One-time startup init, not a loop |
| MJServer/src/services/TaskOrchestrator.ts:~72 | MJ: Task Types | One-time cached lookup |

## Patterns / recommendation

- **Cluster #1 — Integration sync/discovery (~20 sites, all High).** Every site already carries a justification comment for the fresh read. Best bulk-tag opportunity. Consider a shared helper/wrapper so the exemption rides along with `BypassCache: true` consistently across the subsystem (avoids per-call boilerplate).
- **Cluster #2 — security fail-closed reads** (SearchScope permissions, API keys, magic-link): deliberately uncached for correctness.
- **Cluster #3 — sweeps/janitors/pollers** (geocoding, vector sweeps, session/bridge janitors): loop-shaped fresh reads of volatile state — exactly the Sequential/Duplicate false-positive the flag targets.

## Open question for review

Should we add a convenience so `BypassCache: true` *implies* telemetry exemption by default (with an explicit `Reason` still encouraged), rather than tagging ~35 sites individually? That would collapse Cluster #1–#3 automatically and keep new bypass-cache reads quiet by construction. Trade-off: it couples two concerns (cache control vs. telemetry) — some may want a bypassed read still analyzed. Leaning toward **keep them separate but offer a one-liner helper**; decide here.
