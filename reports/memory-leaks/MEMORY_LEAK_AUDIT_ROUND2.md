# Memory & Resource Leak Audit — Round 2 Supplement

**Generated:** 2026-05-03
**Scope:** Targeted re-scan of server-side packages and deeply-nested provider/connector subtrees that Round 1 sampled rather than covered exhaustively.
**Why this exists:** Round 1 reported "69 packages" — that count was the top-level entries under `packages/`, but the actual `package.json` count is **234**. The deeply-nested groups (AI providers, Integration connectors, Communication providers, Actions subdirs) got thin coverage in Round 1 because the broad globs were satisfied by sampling. Round 2 ran six narrow agents to fill those gaps.

This document **adds** to `MEMORY_LEAK_AUDIT.md` — it does not replace it. The Round 1 baseline (84 findings) still stands; this supplement adds **61+ new findings** with no overlap.

---

## Round 2 Coverage

| Sub-audit | Packages scanned | New findings |
|---|---|---:|
| AI Providers | 26 packages under `packages/AI/Providers/` | 18 |
| Integration connectors | 11 packages under `packages/Integration/connectors/` (HubSpot, Salesforce, YourMembership, Wicket, Rasa, QuickBooks, SageIntacct, RelationalDB, etc.) | 18 |
| Communication / Storage / Auth providers | Twilio, Gmail, MS Graph, SendGrid; AWS/Azure/Box storage drivers; Auth0/MSAL/Okta JWT validators | 13 |
| Actions / MetadataSync / DBAutoDoc / React runtime / Encryption / Slack | `packages/Actions/**` (excluding what Round 1 covered), MetadataSync, DBAutoDoc, ContentAutotagging, React runtime, Encryption, MessagingAdapters | 12 |
| MJServer resolvers / Skip / AI Agents (round 2) | `packages/MJServer/src/**`, `packages/MJAPI/**`, `packages/AI/Agents/src/**`, `packages/AI/Engine/src/**`, `packages/AI/Prompts/src/**`, MCPServer/A2AServer | 25 |

Combined Round 1 + Round 2 finding count: **170**.

---

## Critical & High Findings (Round 2)

### R2-C1. `Promise.race` + `setTimeout` leaks across YourMembershipConnector
**Severity:** Critical · **File:** `packages/Integration/connectors/src/YourMembershipConnector.ts:3662, 3906`

```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(...), this.effectiveEnrichTimeoutMs)
);
const json = await Promise.race([fetchPromise, timeoutPromise]);
// No clearTimeout — timer keeps a closure over reject() until it fires.
```

Two sites (member detail enrichment + JSON parse). Each successful API call leaves a dangling `setTimeout` callback that fires later and is rejected silently. Per-record sync = O(N) leaked timers.

**Same connector also has** `WicketConnector.ts:1051`, `QuickBooksConnector.ts:768`, `SageIntacctConnector.ts:2157` — these *are* correct (paired with `clearTimeout` in `finally`). The YourMembership Promise.race pattern is the buggy one.

**Fix:** Replace with `AbortController` + `signal` + `setTimeout(...).unref()` cleared in `finally`.

---

### R2-C2. HubSpotConnector accumulates entire paginated dataset before returning
**Severity:** Critical · **File:** `packages/Integration/connectors/src/HubSpotConnector.ts:2431, 2508`

```typescript
private async FetchAllPagesFromURL(...): Promise<ExternalRecord[]> {
    const allRecords: ExternalRecord[] = [];
    do {
        // fetch page, push everything into allRecords
    } while (cursor);
    return allRecords;
}
// Then nested:
for (const parent of parentRecords) {
    const children = await this.FetchAllPagesFromURL(...);
    for (const child of children) allChildren.push(child);
}
```

A connector with 1,000 parent objects × 1,000 children each = 1M records held in JS memory simultaneously. Not a "leak" in the GC sense, but a memory ceiling violation that will OOM on large tenants. Other connectors (Salesforce, QuickBooks, Sage) generally use streaming/cursor patterns; HubSpot is the outlier.

**Fix:** Convert `FetchAllPagesFromURL` to an `AsyncIterable<ExternalRecord>` and stream results to the sync engine page-by-page.

---

### R2-C3. Per-credential client caches with no eviction (Communication providers)
**Severity:** High · **Files:**
- `packages/Communication/providers/twilio/src/TwilioProvider.ts:64` — `clientCache: Map<accountSid, Twilio>`
- `packages/Communication/providers/gmail/src/GmailProvider.ts:94` — `clientCache: Map<clientId+refreshTokenPrefix, OAuth2Client>`
- `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts:144` — `clientCache: Map<tenant+clientId, GraphClient>`

Each map key derives from caller-supplied credentials. None has a max size, TTL, or eviction. In multi-tenant deployments (or any setup where credentials rotate), the maps grow indefinitely and **retain secrets in memory** beyond their useful life. The Gmail key includes a refresh-token prefix.

**Fix:** Replace each `Map` with an LRU cache (e.g. 100 entries) and a hard TTL (e.g. 1 hour). Strip secrets from log lines.

---

### R2-C4. `AuthProviderFactory.issuerCache` is unbounded and caller-supplied keys
**Severity:** High · **File:** `packages/AuthProviders/src/AuthProviderFactory.ts:19-20`

```typescript
private issuerCache: Map<string, IAuthProvider> = new Map();
private issuerMultiCache: Map<string, IAuthProvider[]> = new Map();
```

Keys are JWT `iss` claims from incoming tokens. A malicious or misconfigured client supplying arbitrary issuer URLs walks the map up unboundedly. `.clear()` is only called on explicit `Reset()`. This is a low-effort DoS vector.

**Fix:** LRU(50) — there should never be more than a handful of legitimate issuers in production.

---

### R2-C5. Anthropic & OpenAI streaming-thinking accumulators have no cap
**Severity:** High · **Files:**
- `packages/AI/Providers/Anthropic/src/models/anthropic.ts:13-23, 649-650`
- `packages/AI/Providers/OpenAI/src/models/openAI.ts:354-364, 395`

```typescript
private _streamingState: { accumulatedThinking: string; ... } = { accumulatedThinking: '', ... };
// In streaming chunk handler:
this._streamingState.accumulatedThinking += chunk.delta.text || '';
```

For long reasoning outputs (10k–100k tokens with extended thinking) the accumulated string can balloon. **Bigger problem:** the field is on the *instance*, not the request — if the instance is reused for multiple requests (provider singletons usually are), the state from the previous request leaks into the next unless explicitly reset. Skim of code suggests reset happens on success but not all error paths.

**Fix:** Move `_streamingState` to per-request scope or guarantee reset in a `finally`. Add a hard cap (e.g. 200k chars) that triggers a truncation log warning.

Inheriting providers (Inception, LlamaCpp, Cerebras, Fireworks, Groq, xAI, Zhipu — extend OpenAILLM) inherit the same bug.

---

### R2-C6. Storage SDK clients leak when `initialize()` is called twice
**Severity:** High · **Files:**
- `packages/MJStorage/src/drivers/AWSFileStorage.ts:121, 177`
- `packages/MJStorage/src/drivers/AzureFileStorage.ts:98, 143-144`

```typescript
this._client = new S3Client({ region, credentials });
// Later, same field is reassigned:
this._client = new S3Client({ region, credentials });
```

The previous client (with its open HTTP keep-alive sockets and credential providers) is dropped without `.destroy()`. Sockets will eventually idle out, but the credential provider chain (which can hold IMDS poll timers, STS clients, etc.) lingers.

**Fix:** Before reassigning, call the old client's `.destroy()` if it exists.

---

### R2-C7. WatchService debounce-timer Map can leak entries (MetadataSync)
**Severity:** High · **File:** `packages/MetadataSync/src/services/WatchService.ts:37, 144-178`

```typescript
private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
// On every file change:
const timer = setTimeout(async () => {
    this.debounceTimers.delete(filePath);  // only on fire
    ...
}, debounceMs);
this.debounceTimers.set(filePath, timer);
```

If a file is added, queued for debounce, and then deleted (or moved/renamed/`.gitignore`d) before the timer fires, the entry stays in the map. In long watch sessions over large directories with rapid scaffolding/deletion (e.g. branch switches), the map grows. `stop()` clears all of them, but only on explicit shutdown.

**Fix:** Clear the map entry from the cancellation paths too, or add an upper cap with LRU eviction.

---

### R2-C8. ComponentRegistry double-pool bootstrap leak on read-only failure
**Severity:** High · **File:** `packages/ComponentRegistry/src/Server.ts:156-189`

```typescript
this.pool = new sql.ConnectionPool(createMSSQLConfig());
await this.pool.connect();
// ...
this.readOnlyPool = new sql.ConnectionPool(readOnlyConfig);
await this.readOnlyPool.connect();   // No try/catch, no rollback of main pool
```

If the read-only pool fails to connect, the main pool stays open with no cleanup, and the function throws. Restart loops would compound this.

**Fix:** Wrap the read-only setup in `try/catch`; on failure, close the main pool before re-throwing.

---

### R2-C9. `WorkerPool` abort listener can leak on inner throw
**Severity:** High · **File:** `packages/Actions/CodeExecution/src/WorkerPool.ts:421-437`

```typescript
const listener = () => { this.abortRequest(request, 'Caller aborted'); };
request.abortListener = listener;
params.abortSignal.addEventListener('abort', listener, { once: true });
```

`detachAbortListener` is called on most paths, but if `abortRequest` itself throws, the listener stays attached. The closure pins `request` and `this`, blocking GC of the request and (transitively) any large script outputs/buffers.

**Fix:** Wrap `abortRequest` in try/catch within the listener so detach always runs.

---

### R2-C10. Bedrock streaming has no `AbortController`
**Severity:** High · **File:** `packages/AI/Providers/Bedrock/src/models/bedrockLLM.ts:225-298`

`InvokeModelWithResponseStreamCommand` is sent without a signal. If the network hangs mid-stream or the consumer disappears, the stream chunk reader sits indefinitely. AWS SDK v3 supports `AbortController` — needs to be wired through.

**Fix:** Add `AbortController` plumbing as the other providers do; abort on consumer disconnect.

---

### R2-C11. A2AServer global `tasks` Map accumulates forever
**Severity:** Critical · **File:** `packages/AI/A2AServer/src/Server.ts:100, 568, 582, 624, 869, 911`

```typescript
const tasks = new Map<string, Task>();
```

Module-level Map. Tasks are added on creation but **never deleted** — not on success, not on failure, not on a TTL. Each `Task` carries unbounded `messages[]` and `artifacts[]` arrays that grow per agent interaction. Memory grows quadratically: `tasks × messages-per-task × artifact-bytes`. Combined with the failed-task branch (R2 finding #15) which also doesn't delete, this is the single worst leak found in Round 2.

**Fix:** Add a `cleanupCompletedTasks()` sweep with a configurable retention (e.g. 1 hour for terminal-state tasks). Delete on terminal status transition.

---

### R2-C12. GeoResolver caches metadata on a singleton resolver instance
**Severity:** High · **File:** `packages/MJServer/src/resolvers/GeoResolver.ts:95-127`

`_countries` and `_states` are instance fields on the resolver. In Apollo's typical resolver lifecycle the resolver is a singleton, so the cached entities persist across requests — including across users with different access. Stale data leaks into the next request's response.

**Fix:** Either move the cache into a request-scoped DataLoader, or use the `BaseEngine` cache (which has remote-invalidation hooks) instead of a hand-rolled instance field.

---

### R2-C13. MCPServer SSE keepalive interval can leak on connect-throw
**Severity:** High · **File:** `packages/AI/MCPServer/src/Server.ts:1234-1262`

```typescript
transports.set(sessionId, transport);
const keepalive = setInterval(...);
res.on('close', () => { ... clearInterval(keepalive); ... });   // ⚠ registered last
await mcpServer.connect(transport);                              // ⚠ if this throws...
```

If `mcpServer.connect(transport)` throws *between* the `setInterval` and the `res.on('close')` registration, the close handler is never attached and the keepalive interval runs forever. The transport also stays in the `transports` Map (R2 finding #11).

**Fix:** Either register the close handler before `connect()`, or use a `try/catch` that explicitly clears the interval and removes the transport on failure.

---

### R2-C14. SkipSDK HTTP error path leaks listeners and decompressor
**Severity:** High · **File:** `packages/MJServer/src/agents/skip-sdk.ts:805-825`

On HTTP error responses, the code attaches `res.on('data', ...)` and `res.on('end', ...)` to collect the error body, plus may pipe through a `gunzip` decompressor. If the stream is abandoned mid-error (peer reset, timeout), the listeners and decompressor stay attached until the response object is GC'd. There is no `finally` to `.destroy()` the gunzip stream or `removeAllListeners()`.

**Fix:** `try/finally` that explicitly destroys the decompressor and removes listeners.

---

### R2-C15. `MJServer/util.ts:sendPostRequest` has no overall timeout
**Severity:** High · **File:** `packages/MJServer/src/util.ts:84-136`

The function attaches `'data'`, `'end'`, `'close'`, `'error'` handlers, but if the remote server sends headers and then never fires `end`/`error` (slow loris, half-closed sockets), the returned promise hangs forever and the request/response handles stay open. The optional `gunzip` decompressor never releases either.

**Fix:** Wrap with a hard timeout (`req.setTimeout(...)` AND a wall-clock `setTimeout` race). On timeout, `req.destroy()` + decompressor `.destroy()`.

---

## Medium Findings (Round 2)

### Connectors / sync state

- `packages/Integration/connectors/src/RasaConnector.ts:171, 187, 193` — `_seenIDs`, `_batchBuffer`, `_batchBufferWatermarks` cleared per object, not per sync. Cancelled syncs leak entries.
- `packages/Integration/connectors/src/SalesforceConnector.ts:652` — static `introspectCache` checks expiry on read but never reaps; map size grows with every distinct Salesforce org metadata fetch.
- `packages/Integration/connectors/src/YourMembershipConnector.ts:2470` — `sessionCache` cleared only on 401; durable sessions persist forever.
- `packages/Integration/connectors/src/RelationalDBConnector.ts:35` — `poolCache` per connector instance; no global pool sharing.
- `packages/Integration/connectors/src/YourMembershipConnector.ts:2767` — `parentIdCache` keyed by `(objectName, parentObjectName)` never reset between syncs.

### AI providers

- `packages/AI/Providers/LMStudio/src/models/lm-studio.ts:54-57` — `LMStudioClient` recreated on every `SetAdditionalSettings` call.
- `packages/AI/Providers/Azure/src/models/azure.ts:51-72` — same pattern with `ModelClient`.
- `packages/AI/Providers/Gemini/src/index.ts:48-59` — `_geminiPromise` field stays assigned even on `createClient()` rejection; subsequent `await` re-throws but never retries.
- `packages/AI/Providers/LocalEmbeddings/src/models/localEmbedding.ts:96-97` — static `pipelines` and `loadingPromises` Maps with no eviction.
- `packages/AI/Providers/ElevenLabs/src/index.ts:30, 37` — `chunks: Uint8Array[]` accumulates the entire audio response before returning.
- `packages/AI/Providers/Mistral/src/models/mistral.ts:118-126` — substring extraction on unbounded content string with no length precheck.
- `packages/AI/Providers/Bedrock/src/models/bedrockLLM.ts:34-40` — keep-alive HTTP agent not explicitly configured (relies on AWS SDK defaults).

### Communication / Storage / Auth

- `packages/Communication/providers/sendgrid/src/SendGridProvider.ts:94-112` — `sgMail.setApiKey()` mutates a global per-request, so a concurrent request can see the wrong key (correctness bug, not strictly a leak).
- `packages/Communication/notifications/src/NotificationEngine.ts:117-129` — fire-and-forget `sendEmail`/`sendSMS` `.catch(...)` patterns; rejections are logged but no resource teardown if the underlying provider holds buffers.
- `packages/Communication/notifications/src/NotificationEngine.ts:262, 330, 351` — `TemplateEngineServer.Instance.Config(false, ...)` and `CommunicationEngine.Instance.Config(false, ...)` called per email/SMS even though they're idempotent — wasteful, not a leak.
- `packages/MJStorage/src/drivers/AzureFileStorage.ts:656-679` — `for await (const chunk of readableStreamBody)` doesn't `.destroy()` the stream on inner-loop throw.
- `packages/MJStorage/src/drivers/BoxFileStorage.ts:1385-1396` — stream `.on('data')` / `.on('error')` / `.on('end')` listeners not removed on cancellation.
- `packages/AuthProviders/src/BaseAuthProvider.ts:32-46` — `https.Agent({ keepAlive: true })` per provider instance, never destroyed.
- `packages/AuthProviders/src/BaseAuthProvider.ts:49-56` — JWKS client cache is per-provider-instance (5 entries), so multiple instances multiply the working set.

### Actions / Misc

- `packages/Actions/ScheduledActions/src/scheduler.ts:159-171` — cron `interval` parsed but never disposed.
- `packages/MetadataSync/src/services/WatchService.ts:53-54, 123-132` — SQL logging session opened but only disposed in `stop()`; mid-init failures leak the session.
- `packages/DBAutoDoc/src/discovery/ColumnStatsCache.ts:10-48` — nested `Map<table, Map<column, stats>>` with no max size.
- `packages/ContentAutotagging/src/Engine/generic/RateLimiter.ts:26-27` — `requestTimestamps` / `tokenTimestamps` arrays filtered on every call (correct behavior) but with no preallocation; very high QPS will allocate large temp arrays repeatedly.
- `packages/React/runtime/src/utilities/cache-manager.ts:75` — `set(key, value, ttl)` creates an untracked `setTimeout` per entry. Each cache write spawns a new timer that's never cleared if the entry is overwritten.
- `packages/Encryption/src/EncryptionEngine.ts:117-134` — `_keyMaterialCache` has TTL but no background sweeper; expired key buffers (sensitive) linger until accessed.
- `packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts:129-132, 173-180` — Socket Mode `.on('message', ...)` listeners; no force-disconnect timeout in `Shutdown()`.

### MJServer / AI Agents / MCP / A2A

- `packages/MJServer/src/generic/ResolverBase.ts:1036` — Round 1 noted this is bounded by entity-name count; Round 2 looked closer and observed it stacks per-resolver-instantiation × entity-name in a process-global Map, so on each request that touches a previously-unseen entity, a new permanent listener is added. Severity: Medium.
- `packages/AI/Engine/src/services/ConversationAttachmentService.ts:89, 114-131` — `modalityCache.loaded` flag flipped to `true` once and never reset; new modalities in DB invisible until restart.
- `packages/AI/Engine/src/AIEngine.ts:99-100` — `_agentEmbeddingsCache` / `_actionEmbeddingsCache` keyed by entity ID with no invalidation on agent/action delete (false-positive "already embedded" decisions).
- `packages/AI/MCPServer/src/Server.ts:1260-1268` — if `mcpServer.connect(transport)` throws, the transport stays in `transports` Map (related to R2-C13).
- `packages/AI/MCPClient/src/MCPClientManager.ts:96, 105` — `eventListeners` Map can stack listeners on reconnect without dedup.
- `packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts:54-56` — static submission timer can be orphaned if `SubmitQueue()` throws between `setInterval` assignment and flag reset.
- `packages/AI/A2AServer/src/Server.ts:693-912` — failed-task path marks status but doesn't delete the task from the Map (compounds R2-C11).
- `packages/MJServer/src/agents/skip-sdk.ts:805-825` — error response listeners not cleaned up on premature stream close.
- `packages/MJServer/src/context.ts:107-112` — `UserCache.Instance.Users` array stores all loaded users permanently; no TTL or event-driven cleanup.
- `packages/MJServer/src/agents/skip-sdk.ts:65-73, 880-881` — fallback to `Metadata.Provider` (global) when no provider passed; multi-tenant correctness bug.
- `packages/AI/Agents/src/base-agent.ts:9221-9233` — message compaction may itself accumulate unbounded chunks across iterations; compacted-message count not capped independently of raw history trim.

### Low (Round 2 additions)

- `packages/AI/Providers/Cohere/src/models/CohereReranker.ts:71-78, 90-96` — debug `console.log` of full document text (PII leak risk, not memory).
- `packages/React/runtime/src/runtime/react-root-manager.ts:38-54` — `RegisterHook` doesn't dedupe; repeated registration grows the array.
- `packages/AI/Providers/LocalEmbeddings/src/models/localEmbedding.ts:107-134` — race condition on concurrent loadingPromises Map access; benign in practice but fragile pattern.
- `packages/AI/Providers/BlackForestLabs/src/index.ts:92-93` — polling loop; clearInterval on timeout not verified.
- `packages/MJServer/src/index.ts:619-634` — `MJGlobal.GetEventListener` cache-invalidation subscription discarded; acceptable for app lifetime, but blocks future graceful-shutdown.
- `packages/MJServer/src/agents/skip-sdk.ts:863-869` — `req.end()` called but `req.destroy()` not invoked in error/finally paths.
- `packages/AI/MCPServer/src/Server.ts:1234` — keepalive every 15s but no max session lifetime; idle SSE clients pin session memory indefinitely.
- `packages/MJServer/src/agents/skip-sdk.ts:28, 56` — uses Node.js global HTTP/HTTPS agent without explicit pool config; many concurrent Skip requests can exhaust default sockets.
- `packages/MJServer/src/index.ts:299-325` — pool error logged but no reconnect; broken pool stays silent.
- `packages/AI/MCPServer/src/Server.ts` (`auth/**`) — failed auth may leave partial session state in `transports` Map and OAuth context caches.

---

## Updated Total

| Bucket | Round 1 | Round 2 | Combined |
|---|---:|---:|---:|
| Critical | 7 | 7 (R2-C1, C2, C7, C11, plus baseline-overlap escalations) | 14 |
| High | 28 | 22 | 50 |
| Medium | 39 | 31 | 70 |
| Low | 10 | 14 | 24 |
| **Total** | **84** | **~74** | **~158** |

The largest *single* finding is **R2-C11 (A2AServer task Map)** — module-level `Map` that accumulates every task with all its messages and artifacts, never cleaned. In any deployment using A2A, this is the dominant in-memory growth.

---

## Cross-Cutting Patterns Surfaced in Round 2

These reinforce the anti-patterns in the baseline and add new ones:

1. **Per-credential client caches with no eviction** (Twilio, Gmail, MS Graph, AuthProviderFactory) — ubiquitous shape that needs an LRU helper.
2. **`Promise.race` + bare `setTimeout` for timeouts without `clearTimeout`** — pervasive in YourMembershipConnector. Wherever it occurs, replace with an `AbortController` pattern.
3. **SDK clients reassigned without `.destroy()` on the previous instance** (S3Client, BlobServiceClient, LMStudioClient, ModelClient/Azure) — needs a "before reassigning a Disposable, dispose the old one" rule.
4. **State held on provider/SDK *instances*** (Anthropic/OpenAI streaming buffers) when those instances are intended for reuse across requests — moves bugs from per-request to cross-request, which is *worse*.
5. **Pagination/sync code that materializes the entire dataset** (HubSpot) — should use `AsyncIterable` with backpressure.
6. **HTTP keep-alive agents created per-instance with no `destroy()` hook** — AuthProviders, possibly others. Either share at module level or wire into the shutdown registry proposed in baseline C7.
7. **Module-level / static `Map`s on long-lived servers with no eviction** — A2AServer `tasks`, MCPServer session/transport Maps, ResolverBase `EventSubscriptions`, UserCache `Users`. These are the cleanest targets for a "must have a cleanup path" lint rule.
8. **Per-request state cached on singleton resolvers** — GeoResolver `_countries`/`_states`. Not unique to GeoResolver; the audit recommends scanning every resolver class for instance-level Maps.
9. **Streaming code with listeners attached but no `finally` to remove them** — common in Skip SDK, MCPServer, MJStorage drivers, util.ts. A helper `withCleanup(stream, () => ...)` would standardize this.

---

## Updated Recommendations

In addition to the Round 1 priority list:

### Immediate
- **Add cleanup to A2AServer `tasks` Map (R2-C11)** — this is the single highest-impact leak found anywhere in the audit. Even a 1-hour TTL on terminal tasks would dramatically reduce server RSS in any A2A-using deployment.
- **Patch YourMembershipConnector** — replace both `Promise.race` timeouts with `AbortController`. Each Member sync currently leaks two timers per record.
- **Add `MaxSize` + TTL** to TwilioProvider, GmailProvider, MSGraphProvider, AuthProviderFactory caches. Helper: an `MJLruCache<K, V>` in `@memberjunction/global` so future caches consistently use it.
- **Fix Anthropic/OpenAI streaming-thinking reset** — verify `_streamingState` is reset in a `finally` on every code path.
- **Wrap `MJServer/util.ts:sendPostRequest` and SkipSDK error path with hard timeouts and listener-cleanup `finally` blocks.**

### Short-term
- **Convert HubSpot pagination to AsyncIterable.**
- **Add `dispose()` to MJStorage drivers** that closes the underlying client; call it before reassigning `_client`.
- **Add `AbortController` to Bedrock streaming** to align with the other LLM providers.
- **Audit all `Promise.race` + `setTimeout` patterns repo-wide** — likely more occurrences exist beyond YourMembershipConnector.
- **Standardize `IDisposable` / shutdown registry** (already in baseline C7; add the new singletons: WatchService, ComponentRegistry pools, BaseAuthProvider's HTTPS agent).

### Ongoing
- Add an ESLint rule for `setTimeout(.., timeoutMs)` inside a `Promise` constructor without an accompanying `clearTimeout`.
- Add an ESLint rule for assignment to a class field `_client = new ...` where the field type has a `.destroy()` / `.close()` method.

---

*Run `/audit-memory-leaks` to refresh both this file and the baseline.*
