---
arguments: 'Optional: scope or category. Examples: "summary", "detailed", "rxjs", "timers", "listeners", "caches", "connections", or a path like "packages/AI"'
---

# Audit Memory & Resource Leaks

You are running a recurring scan for memory and resource leaks across the MemberJunction monorepo. **The single consolidated plan lives at `plans/MEMORY_LEAK_AUDIT.md`** — there is no separate Round 1 / Round 2 file split anymore. The plan is divided into Part 1 (broad sweep) and Part 2 (deep subtree sweep) headed sections within one document.

The repo has **234 packages** (count `package.json` files under `packages/`, excluding `node_modules` and `dist`). Part 1's broad globs satisfy themselves on shallow sampling; Part 2's narrow agents are required to actually cover the nested subtrees.

Your job is to refresh the plan, generate a dated snapshot, and surface what changed since the last run.

### File layout

| Path | Purpose |
|---|---|
| `plans/MEMORY_LEAK_AUDIT.md` | The consolidated plan — single source of truth, rewritten in place on every detailed run |
| `plans/.memory-leak-snapshots/<YYYY-MM-DD>/agent-<X>-<category>.md` | Raw per-agent output for this run (one file per subagent). Used as the inputs for concatenation. **Add `plans/.memory-leak-snapshots/` to `.gitignore` if not already present.** |
| `plans/.memory-leak-snapshots/<YYYY-MM-DD>/CHANGES.md` | Per-run delta showing new vs. resolved leaks since the previous snapshot |

## Parse Arguments

Parse the arguments from: `{{arguments}}`

Recognized values:

- **Output mode** (mutually exclusive):
  - `summary` — one-page diff vs. plan (top criticals + new findings only); does NOT rewrite the plan
  - `detailed` *(default)* — full re-baseline; rewrites `plans/MEMORY_LEAK_AUDIT.md` in place
- **Category filter** (mutually exclusive with each other; combine with output mode):
  - `rxjs` — only RxJS subscription / Angular `OnDestroy` patterns
  - `timers` — only `setInterval` / recursive `setTimeout` patterns
  - `listeners` — only DOM `addEventListener` and Node `EventEmitter` patterns
  - `caches` — only unbounded `Map` / `Array` / singleton state growth
  - `connections` — only DB / HTTP / WebSocket / file / process resources
- **Scope path**: any argument starting with `packages/` narrows the scan to that subtree.

If no argument is provided, run the full `detailed` audit across all five categories on the entire `packages/` tree.

## Purpose

This command:

1. Re-detects the leak categories baselined in `plans/MEMORY_LEAK_AUDIT.md`
2. Spawns parallel `Explore` subagents and writes each one's raw markdown output to a per-agent file under `plans/.memory-leak-snapshots/<YYYY-MM-DD>/`
3. **Concatenates** those per-agent files (with `cat`, via the Bash tool) into the consolidated plan, then patches the joined doc's headers/cross-references — this avoids one giant in-context Write and keeps each subagent's output independently inspectable
4. Diffs new findings against the previous plan
5. Flags resolved leaks (so the team gets credit for fixes)
6. Updates the consolidated plan at `plans/MEMORY_LEAK_AUDIT.md` (only when run in `detailed` mode without a category filter)
7. Writes a per-run delta to `plans/.memory-leak-snapshots/<YYYY-MM-DD>/CHANGES.md`

## Execution Plan

### Phase 0 — Set up the snapshot directory

Compute `SNAPSHOT_DIR=plans/.memory-leak-snapshots/$(date +%Y-%m-%d)` and `mkdir -p` it. If `.gitignore` doesn't already include `plans/.memory-leak-snapshots/`, append it (these are working files, not artifacts to commit).

### Phase 1 — Read the existing plan

Read `plans/MEMORY_LEAK_AUDIT.md` and extract:

- The list of finding IDs (C1–C7, H1–H28, R2-C1–R2-C15, plus medium/low entries)
- The file:line references for each finding
- The severity counts table

If the file is missing, treat this as the first run and skip the diff phase.

### Phase 2 — Spawn parallel audit subagents

The audit runs in **two waves**, each with subagents launched in parallel (single message, multiple Agent tool calls). Use `subagent_type: Explore` for everything. Skip waves/agents the user's filter excludes.

**Wave 1 (broad five-category sweep)** — Subagents A–E below; targets the whole `packages/` tree. Coverage is shallow on deeply-nested subtrees but catches the dominant patterns.

**Wave 2 (deep subtree sweep)** — Subagents F–J below; narrow scope per agent so each can actually read the files. Run only after Wave 1 finishes (its findings inform what's already covered).

Each subagent's prompt should:

- State the category and the specific anti-patterns to find
- Specify file globs and exclude `node_modules/`, `dist/`, `generated/`, `__tests__/`, `*.test.ts`, `*.spec.ts`
- Demand file:line references for every finding
- Demand a severity tag (Critical / High / Medium / Low) using the definitions in the consolidated plan
- Aim for 15–40 concrete findings per category
- For Wave 2 agents, instruct them to first read `plans/MEMORY_LEAK_AUDIT.md` and skip findings already documented
- **Critical:** instruct the agent to **write its full findings as a markdown section directly to `plans/.memory-leak-snapshots/<YYYY-MM-DD>/agent-<X>-<category>.md`** (using the Write tool — the agent has access to it). The agent should then return only a brief summary (under 200 words) — top 3 findings + total count — to the orchestrator. This keeps the bulk of agent output out of the orchestrator's context window so we can run all ten agents without context bloat.

The agent's written file should start with an H2 heading (e.g. `## Subagent A — RxJS / Angular OnDestroy`) since it will be concatenated into the consolidated plan as a section.

Use the prompts below as templates. Each is self-contained; the subagent has no memory of this conversation.

**Boilerplate to append to every subagent prompt** (substitute `<X>`, `<category>`, and `<YYYY-MM-DD>`):

> When you finish, write your full findings to `/home/user/MJ/plans/.memory-leak-snapshots/<YYYY-MM-DD>/agent-<X>-<category>.md` using the Write tool. Start the file with an H2 heading (e.g. `## Subagent <X> — <category>`). Then return to me only a brief summary (under 200 words) — top 3 findings + total counts by severity. Do not paste the full findings into your response — the orchestrator will read them from the file you wrote.

#### Subagent A — RxJS / Angular `OnDestroy`

> Audit the MemberJunction monorepo at /home/user/MJ for RxJS subscription leaks and Angular OnDestroy issues. Focus on:
>
> 1. `MJGlobal.Instance.GetEventListener(...).subscribe(...)` calls without `takeUntil` and without storing the subscription for `unsubscribe()`. This is the dominant leak in the repo.
> 2. Subscriptions in components/services where the return value is discarded
> 3. Components that don't implement `OnDestroy` or override it without calling `super.ngOnDestroy()` (note: `BaseResourceComponent` and `BaseFormComponent` provide `destroy$` teardown — subclasses that delegate to `super` are correct)
> 4. `Subject` / `BehaviorSubject` instances declared as `destroy$` that never get `.complete()`d
> 5. `MJEventBroker` / EventBroker subscriptions in singletons that have no removal path
>
> Search globs: `packages/Angular/**/*.ts`, `packages/MJExplorer/**/*.ts`, `packages/InteractiveComponents/**/*.ts`, `packages/AngularElements/**/*.ts`. Exclude node_modules, dist, generated, test files.
>
> Report file:line references with severity tags (Critical / High / Medium / Low) and a 1-sentence rationale per finding. Group by package. Under 2000 words.

#### Subagent B — Timers

> Audit the MemberJunction monorepo at /home/user/MJ for `setInterval` / `setTimeout` resource leaks. Focus on:
>
> 1. `setInterval` without `clearInterval` (handle stored or not)
> 2. Recursive `setTimeout` patterns without termination logic (e.g. `QueueBase.ProcessTasks`)
> 3. Singleton classes (extend `BaseSingleton` or have `static _instance`) that own timers but expose no destructor / shutdown method
> 4. Component-scoped timers without paired `ngOnDestroy` cleanup
> 5. Per-request handlers that schedule `setTimeout` that may outlive the request
>
> Search globs: `packages/**/*.ts`, `packages/**/*.tsx`. Exclude node_modules, dist, generated, test files.
>
> Pay special attention to: `packages/MJServer`, `packages/MJAPI`, `packages/MJQueue`, `packages/AI/**`, `packages/Communication`, `packages/Scheduling`, `packages/MJCore/src/generic/localCacheManager.ts`, `packages/Actions`. Report file:line references with severity tags. Under 1500 words.

#### Subagent C — Event listeners

> Audit the MemberJunction monorepo at /home/user/MJ for event-listener and EventEmitter leaks. Focus on:
>
> 1. DOM `window.addEventListener` / `document.addEventListener` / `element.addEventListener` without paired `removeEventListener` in `ngOnDestroy`
> 2. Node `EventEmitter.on(...)` calls in singletons or modules with no `.off(...)` path
> 3. WebSocket / SSE `EventSource` not closed in cleanup
> 4. `MJGlobal.Instance.GetGlobalObjectStore()` listener arrays appended to but never trimmed
> 5. **Skip** Angular `(click)` template handlers and `@HostListener` (Angular handles these correctly)
>
> Search globs: `packages/**/*.ts`, `packages/**/*.tsx`. Exclude node_modules, dist, generated, test files.
>
> Pay special attention to: `packages/MJGlobal`, `packages/GraphQLDataProvider`, `packages/MJServer`, `packages/MJAPI`, `packages/RedisProvider`, `packages/MJCore`, `packages/AI`, `packages/Actions/CoreActions/src/custom/visualization`. Report file:line references with severity tags. Under 1500 words.

#### Subagent D — Unbounded caches / singletons

> Audit the MemberJunction monorepo at /home/user/MJ for unbounded cache and singleton state growth. Focus on:
>
> 1. Class fields `private \w+ = new Map(...)` or `private \w+: Record<...>` that have add operations but no eviction (no LRU, no TTL, no max-size)
> 2. Arrays accumulating with `.push(...)` that have no trim logic (especially `_history`, `_logs`, `_events`)
> 3. Singletons (extend `BaseSingleton` or have `static _instance`) where state grows per request / per session / per entity
> 4. GraphQL / metadata caches with no invalidation
> 5. Promise-result caches that never expire
> 6. AI agent state, conversation accumulators, run-step buffers
>
> Search globs: `packages/**/*.ts`. Exclude node_modules, dist, generated, test files.
>
> Pay special attention to: `packages/MJGlobal/src/ObjectCache.ts`, `packages/MJCore/src/generic/{baseEngine,baseEntity,providerBase,localCacheManager,telemetryManager}.ts`, `packages/SQLServerDataProvider`, `packages/PostgreSQLDataProvider`, `packages/GraphQLDataProvider`, `packages/AI/Engine`, `packages/AI/Core`, `packages/MJServer`, `packages/Actions/Engine/src/entity-actions`, `packages/Communication/Engine`, `packages/MJQueue`, `packages/Integration/engine`. Report file:line references with severity tags. Under 2000 words.

#### Subagent E — Connections / streams / processes

> Audit the MemberJunction monorepo at /home/user/MJ for connection-pool, network-socket, file-handle, stream, and child-process leaks. Focus on:
>
> 1. SQL Server (`mssql`) `Request` / `Transaction` / `ConnectionPool` not released on error paths — missing `finally` blocks
> 2. PostgreSQL (`pg`) `Pool`/`Client` not released back to the pool
> 3. HTTP keep-alive agents created per-call instead of reused
> 4. `fs.createReadStream` / `fs.createWriteStream` not destroyed on error
> 5. `child_process.spawn` / `exec` / `fork` not killed on shutdown
> 6. WebSocket / SSE / GraphQL subscription transports without close paths
> 7. Redis `createClient()` without paired `.quit()` / `.disconnect()`
> 8. `AbortController` instances pinned by closures
> 9. External SDK clients (LLM providers, S3, Azure, GCS) instantiated per-call
>
> Search globs: `packages/**/*.ts`. Exclude node_modules, dist, generated, test files.
>
> Pay special attention to: `packages/SQLServerDataProvider`, `packages/PostgreSQLDataProvider`, `packages/MJServer`, `packages/MJAPI`, `packages/MJStorage`, `packages/AI/**`, `packages/Communication`, `packages/MJQueue`, `packages/RedisProvider`, `packages/MJInstaller`, `packages/Actions/CoreActions/src/custom/utilities`. Report file:line references with severity tags. Under 2000 words.

#### Subagent F (Wave 2) — AI Providers deep scan

> Audit `/home/user/MJ/packages/AI/Providers/**` (26 provider directories: Anthropic, Azure, Bedrock, BettyBot, BlackForestLabs, Bundle, Cerebras, Cohere, ElevenLabs, Fireworks, Gemini, Groq, HeyGen, Inception, LMStudio, LlamaCpp, LocalEmbeddings, MiniMax, Mistral, Ollama, OpenAI, OpenRouter, Recommendations-Rex, Vertex, Zhipu, xAI).
>
> Read `reports/memory-leaks/MEMORY_LEAK_AUDIT_ROUND2.md` first to skip already-flagged findings (Anthropic/OpenAI streaming-thinking accumulators, LMStudio/Azure client recreation, LocalEmbeddings static cache, ElevenLabs chunk accumulation, Bedrock missing AbortController, Gemini lazy-init promise leak).
>
> Look for NEW issues: HTTP keep-alive agent reuse vs per-request creation, AbortController plumbing on streaming, EventEmitter listeners on streams not cleaned, audio/image/video binary buffers held in instance fields, SDK-client per-request instantiation in hot paths, OAuth token refresh timers without shutdown.
>
> Severity definitions per the baseline. Aim for 10–25 NEW findings. Group by provider. Under 1800 words.

#### Subagent G (Wave 2) — Integration connectors deep scan

> Audit `/home/user/MJ/packages/Integration/connectors/src/**` (HubSpot, Salesforce, YourMembership, Wicket, Rasa, QuickBooks, SageIntacct, RelationalDB, etc.).
>
> Read `reports/memory-leaks/MEMORY_LEAK_AUDIT_ROUND2.md` first to skip already-flagged findings (YourMembership Promise.race timeouts, HubSpot pagination accumulation, Rasa/Salesforce/YourMembership cache patterns, RelationalDB pool cache).
>
> Look for NEW issues: webhook subscription registration without unregister, OAuth token refresh timers without shutdown, rate limiter Maps keyed by endpoint, per-sync state on long-lived connector singletons, AbortController signals pinned by closures, streaming uploads of files without destroy on error, additional `Promise.race` + `setTimeout` patterns elsewhere in connectors.
>
> Aim for 10–20 NEW findings. Under 1500 words.

#### Subagent H (Wave 2) — Communication, Storage, Auth providers deep scan

> Audit `/home/user/MJ/packages/Communication/providers/**`, `/home/user/MJ/packages/Communication/engine/src/**`, `/home/user/MJ/packages/Communication/notifications/src/**`, `/home/user/MJ/packages/MJStorage/src/**`, `/home/user/MJ/packages/AuthProviders/src/**`.
>
> Read `reports/memory-leaks/MEMORY_LEAK_AUDIT_ROUND2.md` first to skip already-flagged findings (Twilio/Gmail/MSGraph client caches, AuthProviderFactory issuer caches, BaseAuthProvider HTTPS agent + JWKS cache, S3Client/BlobServiceClient reassignment, Box/Azure stream cleanup gaps, SendGrid global-state mutation, NotificationEngine fire-and-forget).
>
> Look for NEW issues: SMTP transport pooling, Twilio/Slack webhook listeners, MS Graph delta query state, signed-URL caches without TTL, multipart upload buffer retention, JWKS sub-cache patterns in specific provider implementations (Auth0/MSAL/Okta), session token refresh timers, additional providers in Communication/providers/* not yet covered.
>
> Aim for 10–20 NEW findings. Under 1500 words.

#### Subagent I (Wave 2) — Actions / MetadataSync / React runtime / misc deep scan

> Audit `/home/user/MJ/packages/Actions/**`, `/home/user/MJ/packages/MetadataSync/**`, `/home/user/MJ/packages/React/runtime/**`, `/home/user/MJ/packages/Encryption/**`, `/home/user/MJ/packages/Credentials/**`, `/home/user/MJ/packages/APIKeys/**`, `/home/user/MJ/packages/MessagingAdapters/**`, `/home/user/MJ/packages/ContentAutotagging/**`, `/home/user/MJ/packages/DBAutoDoc/**`, `/home/user/MJ/packages/DocUtils/**`, `/home/user/MJ/packages/InteractiveComponents/**`, `/home/user/MJ/packages/ComponentRegistry/**`, `/home/user/MJ/packages/Archiving/**`, `/home/user/MJ/packages/MJDataContext*/**`, `/home/user/MJ/packages/Scheduling/**`, `/home/user/MJ/packages/MJExportEngine/**`.
>
> Read `reports/memory-leaks/MEMORY_LEAK_AUDIT_ROUND2.md` first to skip already-flagged findings (EntityActionInvocationTypes._scriptCache, WorkerPool abort listener, WatchService debounce timers, ComponentRegistry pool, DBAutoDoc cache, ContentAutotagging RateLimiter arrays, React CacheManager per-entry timeouts, EncryptionEngine key cache, Slack Socket Mode listeners).
>
> Look for NEW issues across these packages: child process / worker thread leaks, vm context retention on script error, file watcher leaks (chokidar/fs.watch), PowerShell/shell-out child processes, sensitive Buffers not zeroed, retry queues with no max size.
>
> Aim for 10–20 NEW findings. Under 1500 words.

#### Subagent J (Wave 2) — MJServer / AI Agents / MCP / A2A deep scan

> Audit `/home/user/MJ/packages/MJServer/src/**`, `/home/user/MJ/packages/MJAPI/src/**`, `/home/user/MJ/packages/MJCoreEntitiesServer/src/**`, `/home/user/MJ/packages/AI/MCPServer/src/**`, `/home/user/MJ/packages/AI/A2AServer/src/**`, `/home/user/MJ/packages/AI/Agents/src/**`, `/home/user/MJ/packages/AI/Engine/src/**`, `/home/user/MJ/packages/AI/Prompts/src/**`, `/home/user/MJ/packages/AI/AgentManager/**`, `/home/user/MJ/packages/QueryGen/src/**`, `/home/user/MJ/packages/QueryProcessor/src/**`, `/home/user/MJ/packages/SQLConverter/src/**`.
>
> Read `reports/memory-leaks/MEMORY_LEAK_AUDIT_ROUND2.md` first to skip already-flagged findings (A2AServer tasks Map, GeoResolver instance cache, MCPServer keepalive race, SkipSDK error path, util.ts sendPostRequest timeout, ConversationAttachmentService modalityCache, AIEngine embeddings caches, ResolverBase EventSubscriptions, MCPClientManager listener stacking, MJEntityPermissionEntityServer timer race, BaseAgent compaction).
>
> Look for NEW issues: GraphQL subscription resolver teardown, agent run-step accumulators, conversation/run state on long-lived objects, file upload streams in resolvers, DataLoader scoping, generators that hold state when consumer hangs up, agent tool call history without bounds, prompt cache without TTL, Skip per-request HTTP agent.
>
> Aim for 10–25 NEW findings. Under 2000 words.

### Phase 3 — Static cross-checks

While the subagents run, run these `Bash` greps in parallel for hard verification (the agents sample but these are exhaustive):

```bash
# 1. Every MJGlobal.GetEventListener subscription site
grep -rn "MJGlobal.*GetEventListener" packages/ --include="*.ts" \
  | grep -v -E "(node_modules|dist|/generated/|test\.ts|\.spec\.ts|__tests__)"

# 2. setInterval call sites
grep -rn "setInterval" packages/ --include="*.ts" \
  | grep -v -E "(node_modules|dist|/generated/|test\.ts|\.spec\.ts|__tests__)"

# 3. addEventListener call sites
grep -rn "\.addEventListener\(" packages/ --include="*.ts" \
  | grep -v -E "(node_modules|dist|/generated/|test\.ts|\.spec\.ts|__tests__)"

# 4. Class fields that are Maps (broad — many false positives, useful for verification)
grep -rn "private \w\+\s*[:=].*new Map" packages/ --include="*.ts" \
  | grep -v -E "(node_modules|dist|/generated/|test\.ts)"

# 5. Singletons (extend BaseSingleton)
grep -rn "extends BaseSingleton" packages/ --include="*.ts" \
  | grep -v -E "(node_modules|dist|/generated/|test\.ts)"
```

Use these counts to validate the subagents' coverage. If a subagent reported far fewer findings than the grep count suggests, ask it to follow up (via `SendMessage`) — but only if the gap is large and the category is in scope.

### Phase 4 — Diff against the previous plan

Compare the new findings against `plans/MEMORY_LEAK_AUDIT.md`:

- **New** — file:line not present in plan
- **Resolved** — plan finding's file:line no longer matches the pattern (use `Read` to verify the file changed in a way that addresses the issue)
- **Persisted** — same finding still present
- **Moved** — same conceptual finding but file path or line shifted (best-effort match by surrounding code)

A finding is "resolved" only if you can read the file and confirm the cleanup pattern was added (e.g. `takeUntil(this.destroy$)`, `clearInterval` call, `finally` block, eviction logic). Don't claim resolved status based purely on absence — files get refactored.

### Phase 5 — Concatenate per-agent files into the consolidated plan

Each subagent already wrote its findings to `$SNAPSHOT_DIR/agent-<X>-<category>.md`. The orchestrator's job in this phase is **just to concatenate them** with `cat` (via the Bash tool) — *not* to re-paste their content with the Write tool. This avoids dragging the entire ~700-line report through the orchestrator's context.

Suggested flow:

1. **Author the framing prelude** (executive summary, methodology, severity definitions, totals table) using the Write tool — this is the only fresh prose you produce. Save to `$SNAPSHOT_DIR/00-prelude.md`. Compute the totals table from the brief summaries each agent returned (their top-line counts).
2. **Author the framing postlude** (cross-cutting anti-patterns, recommendations, appendices) using the Write tool, computed from the brief summaries. Save to `$SNAPSHOT_DIR/99-postlude.md`.
3. **Concatenate** with a single Bash call:

   ```bash
   cat $SNAPSHOT_DIR/00-prelude.md \
       $SNAPSHOT_DIR/agent-A-rxjs.md \
       $SNAPSHOT_DIR/agent-B-timers.md \
       $SNAPSHOT_DIR/agent-C-listeners.md \
       $SNAPSHOT_DIR/agent-D-caches.md \
       $SNAPSHOT_DIR/agent-E-connections.md \
       $SNAPSHOT_DIR/agent-F-ai-providers.md \
       $SNAPSHOT_DIR/agent-G-connectors.md \
       $SNAPSHOT_DIR/agent-H-comm-storage-auth.md \
       $SNAPSHOT_DIR/agent-I-actions-misc.md \
       $SNAPSHOT_DIR/agent-J-mjserver-agents.md \
       $SNAPSHOT_DIR/99-postlude.md \
       > plans/MEMORY_LEAK_AUDIT.md
   ```

   Skip any agent files that don't exist (because the user filtered to a category or path).

4. **Patch headers** with a few targeted Edit calls — fix things like duplicate "Round 1 / Round 2" titles, broken cross-references between agent sections, or finding-ID renumbering. Keep edits minimal — the per-agent files are the source of truth for findings.

5. **Write the delta**: `$SNAPSHOT_DIR/CHANGES.md` with three sections:
   - **New leaks since last run** (file:line, category, severity, 1-sentence rationale)
   - **Resolved leaks** (which finding ID, what file:line, how confirmed)
   - **Still outstanding** (count by severity)

If the user ran `summary` mode, skip the prelude/postlude/concatenation/patch steps — only write `$SNAPSHOT_DIR/CHANGES.md` and the chat summary.

If the user filtered by category, only the matching agent files exist; concatenate those, but **do not overwrite `plans/MEMORY_LEAK_AUDIT.md`** in category-filter mode — instead write to `$SNAPSHOT_DIR/PARTIAL_<category>.md` and let the user choose to merge later.

### Phase 6 — Report to user

Output a concise summary to the user (this is what they see in the chat — keep it tight, no emojis unless the user has them turned on):

```
Memory Leak Audit complete.

Findings: <N> total (<C> Critical, <H> High, <M> Medium, <L> Low)
New since last run: <N>
Resolved since last run: <N>
Top 3 new criticals:
  1. <file:line> — <one-line description>
  2. <file:line> — <one-line description>
  3. <file:line> — <one-line description>

Files updated:
  - plans/MEMORY_LEAK_AUDIT.md (consolidated plan) [detailed mode only]
  - plans/.memory-leak-snapshots/YYYY-MM-DD/CHANGES.md (delta)
  - plans/.memory-leak-snapshots/YYYY-MM-DD/agent-*.md (per-agent raw findings)
```

## Severity Definitions

Use these consistently in subagent prompts and in the report:

- **Critical** — Long-lived growth tied to repeated user activity (per request / per login / per entity), with no automatic upper bound. Visible in production memory graphs over hours.
- **High** — Per-component or per-session leak that doesn't reclaim until the singleton/process ends; visible under sustained use over a working day.
- **Medium** — Leaks only on error paths, edge cases, or graceful-shutdown gaps; bounded under normal flow.
- **Low** — Cleaned up on process death; affects only graceful shutdown or developer ergonomics.

## Known False-Positive Patterns

Don't flag these in the report:

- **`BaseResourceComponent` / `BaseFormComponent` subclasses** that don't implement `ngOnDestroy` themselves — the base class handles `destroy$` teardown. Verify by checking the subclass calls `super.ngOnInit()` / `super.ngOnDestroy()` if it overrides those.
- **`BaseSingleton` subclasses with bounded state** — e.g. `_entityMapByName` in `ProviderBase` is rebuilt on metadata refresh and bounded by entity count. Acceptable.
- **`MJGlobal._eventsReplaySubject`** — explicitly bounded by `ReplaySubject(100, 30000)`. Acceptable by design.
- **`process.on('SIGTERM' | 'SIGINT' | 'unhandledRejection', ...)`** registered once at app startup — acceptable for app lifetime.
- **Angular `(click)` / `(change)` / `@HostListener`** — Angular auto-cleans these.
- **EventEmitter `.once(...)` listeners** — auto-detach after firing.
- **`AbortController` whose signal is consumed by `fetch`** — GC'd with the resolved promise.
- **Generated entity files** under `**/generated/**` — out of scope.
- **`Demos/`, `experiments/`, `tests/`, `unit-testing/`** — out of scope unless explicitly requested.
- **`MJLruCache` instances** (in `@memberjunction/global`) — bounded by `maxSize` and (optionally) TTL by construction. Acceptable.
- **Singletons that implement `IShutdownable` and self-register with `ShutdownRegistry.Instance.Register(this)`** — graceful-shutdown contract is in place. Acceptable.
- **`BaseEntity._resultHistory`** — now capped at `BaseEntity.MAX_RESULT_HISTORY` (50). Pushes route through `RegisterResultHistoryEntry`, which trims overflow. Acceptable.
- **`A2AServer.TaskStore`** — replaces the old module-level `Map<string, Task>`. Periodic sweep drops terminal-state tasks past the retention window; implements `IShutdownable`. Acceptable.
- **`BaseLLM.handleStreamingChatCompletion`** — calls `resetStreamingState()` at start AND in `finally`, so per-request streaming buffers (Anthropic / OpenAI thinking accumulators) don't bleed across requests. Acceptable.

## Recommended Remediation Patterns

When proposing fixes in a new audit, point reviewers at the established helpers — re-implementing them per-cache makes the codebase harder to audit:

- **Bounded credential / SDK-client caches** → use `new MJLruCache<K, V>({ maxSize, ttlMs, onEvict })` from `@memberjunction/global`. Standard config for credential caches: `maxSize: 100, ttlMs: 60 * 60 * 1000`. The `onEvict` callback is the right place to call `.destroy()` / `.close()` on disposable values.
- **Singletons with timers / intervals / sockets / subscriptions** → implement `IShutdownable` and call `ShutdownRegistry.Instance.Register(this)` in the constructor. The MJServer SIGTERM handler already drains the registry; you don't need to wire a separate hook.
- **Streaming providers with instance-level accumulators** → override `BaseLLM.resetStreamingState()` (it's called both at request start and in `finally`).
- **Component RxJS subscriptions** → pipe through `takeUntil(this.destroy$)`. The `no-restricted-syntax` ESLint rule in `.eslintrc` flags any `MJGlobal.Instance.GetEventListener(...).subscribe(...)` that doesn't have an intervening `.pipe()`.

## Useful Files for Context

If the subagent needs to understand MJ-specific patterns, point it at:

- `packages/MJGlobal/src/Global.ts` — central `MJGlobal.Instance` and `GetEventListener`
- `packages/MJGlobal/src/BaseSingleton.ts` — singleton base
- `packages/MJGlobal/src/MJLruCache.ts` — bounded LRU + TTL cache (use this for credential / SDK-client caches)
- `packages/MJGlobal/src/ShutdownRegistry.ts` — `IShutdownable` interface + process-wide registry; wired to MJServer SIGTERM/SIGINT
- `packages/MJCore/src/generic/baseEngine.ts` — every engine extends this
- `packages/MJCore/src/generic/baseEntity.ts` — every entity extends this; `_resultHistory` is bounded via `RegisterResultHistoryEntry` + `MAX_RESULT_HISTORY`
- `packages/AI/Core/src/generic/baseLLM.ts` — `handleStreamingChatCompletion` calls `resetStreamingState()` at start and in `finally` (override the hook in providers that hold streaming buffers)
- `packages/MJQueue/src/generic/QueueBase.ts` — pattern for `IShutdownable` queues with self-scheduling timers
- `packages/AI/A2AServer/src/TaskStore.ts` — pattern for bounded task stores with periodic terminal-state cleanup
- `packages/Angular/Explorer/shared/src/lib/base-resource-component.ts` (if it exists) — provides `destroy$` for resource components
- `CLAUDE.md` (root) — has a section on `BaseSingleton` usage rules and event-driven invalidation patterns

## Output

Provide:

1. The dated snapshot file
2. The `CHANGES.md` delta
3. (In `detailed` mode) the updated baseline
4. The chat summary described in Phase 6

Do not commit any of these files to git unless the user explicitly asks for a commit.
