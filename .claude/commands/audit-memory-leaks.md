---
arguments: 'Optional: scope or category. Examples: "summary", "detailed", "rxjs", "timers", "listeners", "caches", "connections", or a path like "packages/AI"'
---

# Audit Memory & Resource Leaks

You are running a recurring scan for memory and resource leaks across the MemberJunction monorepo. The baseline report lives at `reports/memory-leaks/MEMORY_LEAK_AUDIT.md` — your job is to refresh that baseline, generate a dated snapshot, and surface what changed since the last run.

## Parse Arguments

Parse the arguments from: `{{arguments}}`

Recognized values:

- **Output mode** (mutually exclusive):
  - `summary` — one-page diff vs. baseline (top criticals + new findings only)
  - `detailed` *(default)* — full report, replaces the baseline
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

1. Re-detects the leak categories baselined in `reports/memory-leaks/MEMORY_LEAK_AUDIT.md`
2. Diffs new findings against existing ones
3. Flags resolved leaks (so the team gets credit for fixes)
4. Produces a dated snapshot in `reports/memory-leaks/snapshots/`
5. Updates the baseline at `reports/memory-leaks/MEMORY_LEAK_AUDIT.md` (only when run in `detailed` mode without a category filter)
6. Writes a per-run delta to `reports/memory-leaks/CHANGES.md`

## Execution Plan

### Phase 1 — Read the baseline

Read `reports/memory-leaks/MEMORY_LEAK_AUDIT.md` and extract:

- The list of finding IDs (C1–C7, H1–H28, plus medium/low entries)
- The file:line references for each finding
- The severity counts table

If the file is missing, treat this as the first run and skip the diff phase.

### Phase 2 — Spawn parallel audit subagents

Launch the audit subagents **in parallel** (single message, multiple Agent tool calls). Skip categories the user filtered out. Use `subagent_type: Explore`.

Each subagent's prompt should:

- State the category and the specific anti-patterns to find
- Specify file globs and exclude `node_modules/`, `dist/`, `generated/`, `__tests__/`, `*.test.ts`, `*.spec.ts`
- Demand file:line references for every finding
- Demand a severity tag (Critical / High / Medium / Low) using the definitions in the baseline report
- Ask for under 1500–2000 words
- Aim for 15–40 concrete findings per category

Use the prompts below as templates. Each is self-contained; the subagent has no memory of this conversation.

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

### Phase 4 — Diff against baseline

Compare the new findings against the existing `reports/memory-leaks/MEMORY_LEAK_AUDIT.md`:

- **New** — file:line not present in baseline
- **Resolved** — baseline finding's file:line no longer matches the pattern (use `Read` to verify the file changed in a way that addresses the issue)
- **Persisted** — same finding still present
- **Moved** — same conceptual finding but file path or line shifted (best-effort match by surrounding code)

A finding is "resolved" only if you can read the file and confirm the cleanup pattern was added (e.g. `takeUntil(this.destroy$)`, `clearInterval` call, `finally` block, eviction logic). Don't claim resolved status based purely on absence — files get refactored.

### Phase 5 — Write outputs

Write three files (relative to `/home/user/MJ`):

1. **`reports/memory-leaks/snapshots/YYYY-MM-DD.md`** — a dated, immutable snapshot of this run's findings (always created)
2. **`reports/memory-leaks/CHANGES.md`** — a delta document with three sections:
   - **New leaks since last run** (file:line, category, severity, 1-sentence rationale)
   - **Resolved leaks** (which finding ID, what file:line, how confirmed)
   - **Still outstanding** (count by severity)
3. **`reports/memory-leaks/MEMORY_LEAK_AUDIT.md`** — only updated when run in `detailed` mode without a category filter (full re-baseline). Preserve the structure of the existing baseline (Executive Summary → Methodology → Critical → High → Medium → Low → Anti-Patterns → Recommendations → Appendices).

### Phase 6 — Report to user

Output a concise summary to the user (this is what they see in the chat — keep it tight):

```
Memory Leak Audit complete.

📊 Findings: <N> total (<C> Critical, <H> High, <M> Medium, <L> Low)
🆕 New since last run: <N>
✅ Resolved since last run: <N>
📌 Top 3 new criticals:
  1. <file:line> — <one-line description>
  2. <file:line> — <one-line description>
  3. <file:line> — <one-line description>

Reports updated:
  - reports/memory-leaks/snapshots/YYYY-MM-DD.md (snapshot)
  - reports/memory-leaks/CHANGES.md (delta)
  - reports/memory-leaks/MEMORY_LEAK_AUDIT.md (baseline) [if detailed mode]
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

## Useful Files for Context

If the subagent needs to understand MJ-specific patterns, point it at:

- `packages/MJGlobal/src/Global.ts` — central `MJGlobal.Instance` and `GetEventListener`
- `packages/MJGlobal/src/BaseSingleton.ts` — singleton base
- `packages/MJCore/src/generic/baseEngine.ts` — every engine extends this
- `packages/MJCore/src/generic/baseEntity.ts` — every entity extends this
- `packages/Angular/Explorer/shared/src/lib/base-resource-component.ts` (if it exists) — provides `destroy$` for resource components
- `CLAUDE.md` (root) — has a section on `BaseSingleton` usage rules and event-driven invalidation patterns

## Output

Provide:

1. The dated snapshot file
2. The `CHANGES.md` delta
3. (In `detailed` mode) the updated baseline
4. The chat summary described in Phase 6

Do not commit any of these files to git unless the user explicitly asks for a commit.
