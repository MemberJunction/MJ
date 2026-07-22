# Memory Leak Remediation Plan — Round 6 Follow-Up

**Source:** [`plans/MEMORY_LEAK_AUDIT.md`](./MEMORY_LEAK_AUDIT.md), Part 6 — Round 6 Re-Audit (2026-07-11)
**This document:** what was fixed in the accompanying PR, plus a prioritized, concrete plan for everything that wasn't.

---

## 1. Fixed in this PR

Four Critical-severity leaks, all persisted for 1-2 audit rounds or newly found this round, all with a clear, low-risk, mechanical fix:

### 1.1 `AgentDataPreloader._perRunCache` — dead cleanup hook (persisted 2 rounds)

- **File:** `packages/AI/Agents/src/base-agent.ts` (fix), `packages/AI/Agents/src/AgentDataPreloader.ts` (leak site, unchanged)
- **Problem:** `AgentDataPreloader.clearRunCache(runId)` exists and is documented "should be called when an agent run completes," but had zero callers anywhere in the codebase. Every `PerRun`-cache-policy data source leaked one `Map` entry per agent run for the life of the process.
- **Fix:** `BaseAgent.Execute()`'s existing top-level `finally` block (already responsible for releasing timeout/abort listeners) now also calls `AgentDataPreloader.Instance.clearRunCache(this._agentRun.ID)` when `this._agentRun?.ID` is set. This covers every exit path — success, failure, cancellation — because `Execute()` is the single entry point that both creates `this._agentRun` (Phase 1) and calls `preloadAgentData()` (Phase 2) for a given run.
- **Tests:** the guarded call was extracted into a small private method, `BaseAgent.releasePerRunDataCache()`, called from the `finally` block — the same pattern the existing `getCollectionFromPayload` test uses to exercise a real private method on a real `BaseAgent` instance without standing up the full `Execute()` dependency graph. New `packages/AI/Agents/src/__tests__/base-agent-release-per-run-cache.test.ts` (4 tests): clears the entry when `_agentRun.ID` is set, is a no-op when `_agentRun` is unset or has no `ID`, and an end-to-end check against `AgentDataPreloader`'s real (unmocked) `_perRunCache` Map. Full `ai-agents` suite (1638 tests, up from 1634) green.

### 1.2 `ProviderBase._entityRecordNameCache` — unbounded per-record cache (persisted 2 rounds)

- **File:** `packages/MJCore/src/generic/providerBase.ts`
- **Problem:** Populated after every `Load()`/`Save()`/`LoadFromData()` with no eviction, unlike its bounded siblings `_entityMapByName`/`_entityMapByID` (rebuilt — and thus bounded by entity-definition count — on every metadata refresh). This cache is keyed by **record**, not by entity definition, so it can't use the same "rebuild on refresh" strategy; it needs its own bound.
- **Fix:** Converted `_entityRecordNameCache` from a raw `Map<string, string>` to `MJLruCache<string, string>({ maxSize: 10000, ttlMs: 60 * 60 * 1000 })`. All six call sites (`GetCachedRecordName`, `SetCachedRecordName`, `GetEntityRecordName`, `GetEntityRecordNames` ×2 code paths) updated from `.get()`/`.set()` to `.Get()`/`.Set()` — a direct drop-in since both APIs share the same two-argument shape.
- **Tests:** new `packages/MJCore/src/__tests__/providerBase.entityRecordNameCache.test.ts` (7 tests) — cache hit/miss, `forceRefresh` bypass, batch lookup caching, and two dedicated boundedness tests (overfill past `maxSize` never exceeds it; LRU eviction order is correct). Full `MJCore` suite (1460 tests) still green.

### 1.3 `ExecuteCodeAction` — worker pool forked per invocation, never torn down (persisted 2 rounds)

- **File:** `packages/Actions/CoreActions/src/custom/code-execution/execute-code.action.ts` (call site), new `packages/Actions/CoreActions/src/custom/code-execution/execute-code-service-provider.ts` (fix)
- **Problem:** `InternalRunAction` called `new CodeExecutionService()` on every action run. `CodeExecutionService.execute()` auto-initializes on first use, forking `WorkerPool`'s configured worker count (default 2) as OS child processes — and the action never called `.shutdown()`, so those processes (and their open IPC channels) were never reaped.
- **Fix:** New `ExecuteCodeServiceProvider` — a `BaseSingleton` (mirroring the existing, already-correct `RuntimeActionExecutor` pattern for the same underlying service) that lazily constructs one `CodeExecutionService` shared across every "Execute Code" action run, and implements `IShutdownable` (self-registers with `ShutdownRegistry` in its constructor) so the worker pool is released on process shutdown instead of never. `ExecuteCodeAction` now calls `ExecuteCodeServiceProvider.Instance.GetService()` instead of `new CodeExecutionService()`.
- **Why a shared singleton instead of per-call `shutdown()`:** wrapping the existing per-call pattern in try/finally would also stop the leak, but would fork+kill 2 processes on every single action invocation — a large, unnecessary latency/CPU cost the `RuntimeActionExecutor` precedent already solved correctly for the same underlying service.
- **Tests:** new `execute-code-service-provider.test.ts` (5 tests: singleton identity + registration, lazy single-construction reuse, `Shutdown()` releases and forces fresh construction on next use, idempotency) and `execute-code.action.test.ts` (3 tests, including the key regression assertion — 3 action runs across 2 action instances construct at most 1 `CodeExecutionService`). Full `core-actions` suite (268 tests) green.

### 1.4 `APIRateLimiterManager.limiters` — unbounded Map + leaked RxJS subscription per key (new this round)

- **File:** `packages/Actions/CoreActions/src/custom/integration/api-rate-limiter.action.ts`
- **Problem:** `limiters` was a raw `Map<string, APIRateLimiter>` keyed by the caller-supplied `RateLimitKey` action parameter — an unbounded key space, since any workflow using a dynamic key (per-record/tenant/timestamp) grows it forever. Each `APIRateLimiter` also held a `concatMap().subscribe()` RxJS subscription whose return value was discarded, so even a bounded key space would leak subscriptions.
- **Fix:** `limiters` is now `MJLruCache<string, APIRateLimiter>({ maxSize: 200, ttlMs: 60 * 60 * 1000 })`. `APIRateLimiter` gained a `dispose()` method that unsubscribes the stored `queueSubscription` and completes the queue `Subject`; the cache's `onEvict` hook calls it. TTL-based recreation of a rate limiter after an hour of inactivity is harmless — the limiter's internal state (request count, time window) is a soft in-memory counter, not a source of truth.
- **Tests:** new `api-rate-limiter.action.test.ts` (5 tests: `dispose()` correctness on the RxJS primitives directly, same-key reuse, distinct-key isolation, LRU-overflow eviction + disposal + correct recreation, and TTL-expiry eviction + disposal via `vi.useFakeTimers`).

### Build/test verification for all four fixes

```
npx turbo build --filter="@memberjunction/core-actions"   # 97/97 tasks succeeded (full dependency chain incl. ai-agents, MJCore)
cd packages/MJCore && npm run test                          # 1460/1460 passed
cd packages/Actions/CoreActions && npm run test              # 268/268 passed
```

---

## 2. Prioritized backlog — not fixed in this PR

Ordered by severity, then by how directly it's reachable from normal production traffic. File:line references and full agent rationale are in `plans/MEMORY_LEAK_AUDIT.md` Part 6.

### P0 — Critical, high production impact

#### 2.1 Telephony call-media registries orphan entries on incomplete calls

- **Files:** `packages/MJServer/src/telephony/vonageMediaRegistry.ts:68,166`, `twilioMediaRegistry.ts:50,111`, `teamsAcsMediaRegistry.ts`, `TeamsMeetingsService.ts:61`
- **Root cause:** `RegisterCall()` fires before `startBridge()`/the media socket connects; cleanup only runs from the media WebSocket's `'close'` event (Vonage/Twilio) or a Microsoft Graph "call ended" webhook (Teams/ACS). A rejected/dropped/short call, or any synchronous exception in `startBridge()`, permanently strands the `channels` Map entry (or `graphClientsByCall` entry for Teams). No TTL sweep exists anywhere in `telephony/*.ts`.
- **Proposed fix:**
  1. Wrap the register→bridge sequence in try/finally at the call site that invokes `RegisterCall()` + `startBridge()`, so a synchronous throw immediately unregisters the just-added entry.
  2. Independently, add a periodic sweep (mirroring `A2AServer.TaskStore`'s pattern — periodic sweep of terminal/stale entries, `IShutdownable`) that drops any registry entry whose call was registered more than N minutes ago without ever transitioning to "media connected" state. This covers the case where the socket silently never opens (no close event, no exception) — try/finally alone can't catch that.
  3. For Teams/ACS specifically, don't rely solely on the Graph webhook — apply the same TTL sweep, since webhook delivery is not guaranteed.
- **Suggested owner:** whoever owns `packages/MJServer/src/telephony/` — this needs live-call testing (a mocked WebSocket that never opens, a call that Graph never reports "ended" for) that's easier to validate with the telephony team's existing test harness than to fabricate from scratch here.
- **Risk of NOT fixing soon:** every misconfigured/rejected telephony integration or client-side network hiccup leaks one Map entry per bad call, unconditionally — this is the highest-volume, most "normal traffic reachable" Critical finding this round.

#### 2.2 `RelationalDBConnector.CloseAllPools()` is dead code in production

- **File:** `packages/Integration/connectors/src/RelationalDBConnector.ts:299-306` (disposal method, correct but unreachable), `IntegrationEngine.ts` (orchestration, missing the call)
- **Root cause:** `CloseAllPools()` is only invoked from test files. `IntegrationEngine`'s sync orchestration constructs a fresh connector per scheduled run but never disposes it afterward, so every sync leaks one full `mssql.ConnectionPool` (open sockets + idle timers) — unconditionally, not just on the previously-known `GetPool()` concurrent-race path.
- **Proposed fix:** In `IntegrationEngine`'s sync-completion path (wherever the connector instance currently falls out of scope after a run — likely a `finally` around the per-integration sync loop), add `await connector.CloseAllPools()` (or the more generic disposal method if the connector base class has one). If `RelationalDBConnector` doesn't already implement `IShutdownable`, that's a reasonable alternative/complementary fix — register it and have `ShutdownRegistry` catch any pool that somehow survives a run boundary.
- **Also fix while in this file:** the previously-known `GetPool()` race condition (`RelationalDBConnector.ts:78-99`) — two concurrent callers with a cold cache both `new sql.ConnectionPool()` + `connect()`, second write silently orphans the first. A simple in-flight-promise cache (`Map<string, Promise<ConnectionPool>>` instead of `Map<string, ConnectionPool>`, so concurrent callers await the same in-progress connect) fixes both the race and keeps the dead-code fix's disposal path simple (one pool per key, always).

#### 2.3 `APIRateLimiterManager`-style user-supplied cache keys — done (this PR); apply the same audit elsewhere

Not a remaining item, but a **process recommendation**: grep the codebase for other `Map` fields keyed directly by a caller-supplied action/resolver parameter with no allow-list. This pattern (any external caller can pick the cache key) is what turned an otherwise-bounded-looking cache into an unbounded one in 2.1/1.4. Worth a follow-up sweep, not a single fix.

### P1 — High, moderate production impact

#### 2.4 `NeonCRMConnector.listAllViaGet`/`.listAllViaPost` ignore `ctx.BatchSize`

- **File:** `packages/Integration/connectors/src/NeonCRMConnector.ts:970-1020`
- **Proposed fix:** Thread `ctx.BatchSize` through both pagination loops the same way `MemberSuiteConnector`/`OpenWaterConnector`/`Reach360Connector`/`PathLMSConnector` already do — stop paginating and return `HasMore: true` once the accumulated batch reaches `ctx.BatchSize`, instead of always exhausting the remote dataset and returning `HasMore: false`. This is a scoped, mechanical fix once you're looking at the four sibling connectors as the reference implementation.

#### 2.5 `CommunicationEngine.GetProvider()` rebuilds a fresh provider on every send

- **File:** `packages/Communication/engine/src/Engine.ts:64,145,221`
- **Root cause:** `GetProvider()` calls `ClassFactory.CreateInstance` unconditionally. The provider-level credential caches (`envTwilioClient`, per-tenant `MJLruCache`s) are correct in isolation but never get a chance to pay off because the provider object holding them is itself rebuilt every call.
- **Proposed fix:** Cache constructed providers on `CommunicationEngine` itself, keyed by whatever `GetProvider()` currently takes as input (provider name + delivery-type, most likely) — an `MJLruCache<string, ProviderInstance>` with a modest `maxSize` (provider count is small and enumerable, so this could even be a plain `Map` with no eviction, since the key space is bounded by configured providers, not user input). Add a regression test asserting `GetProvider()` returns `===` the same instance across two calls with identical inputs.

#### 2.6 `MJStorage` cross-account search bypasses the driver cache

- **File:** `packages/MJStorage/src/util.ts:884,1088` (`searchAcrossProviders`/`searchAcrossAccounts`)
- **Proposed fix:** Route both functions through `FileStorageEngine._driverCache` the same way single-account operations already do, instead of constructing a driver directly. If the reason they bypass the cache is that the same account can appear in multiple concurrent searches with a different provider list per call, that's an argument for fixing the cache key/lookup, not for skipping the cache.

#### 2.7 `ivm` sandbox console-log capture runs outside the isolate memory limit

- **File:** `packages/Actions/CodeExecution/src/worker.ts:158,166-169,414`
- **Root cause:** The `logs.push(...)` callback that captures sandboxed `console.log` output runs in the **host** worker process via an `ivm.Reference`, so its accumulated string data isn't counted against `memoryLimitMB` — a script that spams large `console.log` payloads can grow host memory until the wall-clock timeout fires, independent of the documented sandbox memory guarantee.
- **Proposed fix:** Cap the accumulated `logs` buffer size (e.g., total bytes or entry count) inside the host-side callback itself, truncating with a `"...output truncated"` marker once exceeded — mirroring how most log-capture sandboxes bound captured output independent of the isolate's own memory accounting. This is a small, contained change to `worker.ts`'s log-capture callback; no isolate-side change needed.

#### 2.8 Realtime provider `Close()` never nulls handler closures — OpenAI + xAI (persisted, both this round and prior)

- **Files:** `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:473-478`, `packages/AI/Providers/xAI/src/models/xaiRealtime.ts:437-442`
- **Proposed fix:** Add the same `clearHandlers()` pattern ElevenLabs' realtime driver already implements correctly — after unregistering SDK listeners and closing the socket, explicitly set each of the 6 handler fields (`outputHandler`, `transcriptHandler`, `toolCallHandler`, `interruptionHandler`, `usageHandler`, `errorHandler`, `closeHandler`) to `undefined`/`null`. Since ElevenLabs is the reference implementation already in the codebase, this is a direct copy-adapt, not new design.

#### 2.9 `MCPResolver.ts:637,646` listener add/remove not wrapped in try/finally

- **File:** `packages/MJServer/src/resolvers/MCPResolver.ts`
- **Proposed fix:** Wrap the `manager.addEventListener('toolsSynced', ...)` / `removeEventListener` pair around `syncTools()` in try/finally, so a throw from `syncTools()` still detaches the listener from the process-wide `MCPClientManager` singleton.

### P2 — Medium/Low — see audit doc for full list

The remaining ~35 Medium and ~15 Low findings from Round 6 (Gemini `meetingResponseWatchdog`, Vertex's inherited rejected-promise cache bug, storage driver disposal inconsistency [Dropbox/Google Drive/SharePoint — reclassified Low this round since the underlying SDKs don't expose a disposable dedicated-agent], `TelemetryManager._activeEvents`/`_patterns`, `SQLServerDataProvider` commit/rollback transaction-release reliance on driver behavior, `PathLMSConnector`/`YourMembershipConnector` per-instance caches, `ComponentRegistry/src/Server.ts` failed-restart pool leak, `SlackMessagingExtension` re-entrant `Initialize()`, and the ~30 persisted items carried from Rounds 1-5) are lower urgency — either error-path-bounded, dev-hygiene-only, or already-small in practice. Full file:line references, severity rationale, and the individual audit agents' write-ups are in `plans/MEMORY_LEAK_AUDIT.md` Part 6 (and the per-agent snapshot files under `plans/.memory-leak-snapshots/2026-07-11/` for this run specifically).

---

## 3. Suggested sequencing for follow-up PRs

1. **PR 2 (telephony):** §2.1 — needs telephony-team review/testing, isolate as its own PR.
2. **PR 3 (connectors):** §2.2 (RelationalDBConnector dispose + race fix) + §2.4 (NeonCRM batching) — same package family, can land together.
3. **PR 4 (comms/storage):** §2.5 (CommunicationEngine provider cache) + §2.6 (MJStorage cross-account search cache).
4. **PR 5 (sandbox hardening):** §2.7 (ivm log-capture bound) — small, isolated, good candidate for a quick follow-up.
5. **PR 6 (realtime + MCP cleanup sweep):** §2.8 (OpenAI/xAI handler nulling) + §2.9 (MCPResolver try/finally) — both are the same "copy an already-correct sibling pattern" shape, can land together.

## 4. Process follow-up (not code)

- `base-agent.ts` (`packages/AI/Agents/src`) still has no dedicated unit-test file for `Execute()`'s **full** top-level lifecycle (timeout/abort cleanup + `releasePerRunDataCache()` all firing together on all three exit paths — success/failure/cancel). This PR added direct unit coverage for the new `releasePerRunDataCache()` method in isolation (extracted specifically to make that possible without a full `Execute()` harness), but a future PR should still add a focused `base-agent.execute-lifecycle.test.ts` that drives `Execute()` itself (with engines/providers mocked) to assert every `finally`-block cleanup call fires together on each exit path — today that combined guarantee is covered by the live integration suite (`packages/MJServer/integration-test-scripts/`) and end-to-end agent runs, not a fast unit test.
- Per the audit's Cross-Cutting Recommendations (`plans/MEMORY_LEAK_AUDIT.md`, Round 6 section): consider an ESLint rule flagging bare `new Map()`/`new Array()` class-field declarations with no accompanying eviction/trim call in the same class, to catch the next `APIRateLimiterManager`-shaped bug at write time instead of the next audit cycle.
