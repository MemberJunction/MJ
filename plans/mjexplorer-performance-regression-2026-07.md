# MJExplorer Performance & Regression Investigation — July 2026

**Status:** COMPLETE — static analysis + live workbench testing done; quick wins implemented on `perf/explorer-quick-wins-2026-07`.
**Branch under test:** `next` @ `86acdbf466` (v5.46.x)
**Method:** (1) parallel static analysis of ~857 commits in the last 6 weeks touching Explorer/Angular/core; (2) live testing in a clean Docker workbench (fresh SQL Server, migrated to latest `next`, real GraphQL + engines) driven via Playwright with network/console/timing instrumentation.

---

## Executive summary

The last 6 weeks added a large amount of feature surface (omnibar/command palette, agent streaming render, skills/plan-mode, realtime, predictive studio). Most performance-tagged commits in the window are genuine **improvements** (Lists overhaul #3145, forms collapse-panel gating, metadata-shell wins, warm-load fast-start). However, a small number of **real regressions** were introduced, concentrated in two areas:

1. **Conversations/agent chat streaming render** — the single biggest regression. Every streamed token rebuilds the entire message timeline against non-OnPush components and re-parses the full markdown bubble. Scales O(N messages × M tokens). This is the most likely source of "agents feel slow / Explorer janky" complaints.
2. **Omnibar `#` jump-to-record** — fires a live `RunView` per keystroke (no debounce/min-length/cancel), flooding MJAPI while typing.

Plus one **standing cost that grew in-window**: `AIEngineBase.Config()` (pre-warmed on every login) added ~9 entities and still loads embedding-bearing tables as full `entity_object`.

Severity legend: 🔴 High · 🟠 Medium · 🟡 Low.

---

## Findings

### 🔴 R1 — Streaming tokens rebuild the entire chat timeline per token *(NEW regression, `d5e5996b68`, Jul 8)*

**Where:**
- `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts:874-878` — the `progress.streaming` branch emits `messageSent` on **every content delta (token)**.
- `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts:1690-1696` — `onMessageSent` replaces `this.messages` with a **new array** each emit → new `[messages]` input reference; then `:1735` calls `cdr.detectChanges()`.
- `packages/Angular/Generic/conversations/src/lib/components/message/message-list.component.ts:204-206, 274, 298, 419-445` — the new reference triggers `ngOnChanges` → `updateMessages()` → `BuildConversationTimeline(ALL messages)` and re-runs `updateMessageItemInstance` for **every** message (re-reads maps, re-applies artifacts), not just the growing one.

**Why it hurts:** Pre-streaming, `onMessageSent` fired only on coarse step transitions (a few per run). The streaming commit made it per-token, so an O(N-messages) timeline rebuild + full re-instantiation now runs at token cadence. In a 50-message thread, every token walks all 50 message components.

**Fix:** Add a dedicated streaming fast-path — mutate the active message's text in place and `markForCheck()` only its `ComponentRef` (already held in `_renderedMessages`), skipping `BuildConversationTimeline` / array replacement. `updateStreamingMessage(id, text)`.

**Effort:** Medium. **Confidence:** High.

### 🔴 R2 — Chat message components are not actually OnPush (despite comments claiming so) *(pre-existing, made load-bearing by R1)*

**Where:** `packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts` — no `changeDetection: ChangeDetectionStrategy.OnPush`, yet `message-list.component.ts:441` comments call it "the OnPush dynamic child." `message-list` and `conversation-chat-area` are also default CD.

**Why it hurts:** Each per-token `detectChanges()` (R1) dirty-checks the full subtree of every message item (avatars, artifact cards, footers, rating widgets). This is the multiplier that turns R1 from "noticeable" into "janky on long threads."

**Fix:** Add `OnPush` to `MessageItemComponent` (and ideally list + chat-area); pair with R1's targeted `markForCheck()`. The dynamic-component renderer already marks children explicitly, so OnPush is compatible.

**Effort:** Medium (needs testing for missed CD). **Confidence:** High.

### 🟠 R3 — Streaming markdown re-parses the entire bubble per token *(inherent to `d5e5996b68`)*

**Where:** `message-item.component.html:74` binds `<mj-markdown [data]="displayMessage">`; streaming assigns the full accumulated text each token. `packages/Angular/Generic/markdown/src/lib/components/markdown.component.ts:199-222, 274` re-parses whenever `data` changes → O(len²) over a stream.

**Why it hurts:** A 2,000-token reply re-parses ~2,000 progressively-longer markdown strings on the main thread. Mitigated by `mj-markdown` being OnPush (scoped to one bubble), hence Medium.

**Fix:** Coalesce token updates (~60–100ms via a small buffer / `requestAnimationFrame`), or render streamed text as plain/pre and run full markdown parse only on the completion chunk.

**Effort:** Low–Medium. **Confidence:** High.

### 🟠 R4 — Omnibar `#` jump-to-record fires a `RunView` on every keystroke *(NEW regression, `9b357d22d3`, Jul 4)*

**Where:**
- `packages/Angular/Explorer/explorer-core/src/lib/omnibar/omnibar-palette.component.ts:493-495` — trigger mode calls `fire()` immediately, **no debounce** ("warm caches — no debounce"), while free-text mode debounces 300ms (`:498`).
- `packages/Angular/Explorer/explorer-core/src/lib/omnibar/providers/omnibar-record.provider.ts:141-155` — runs a `RunView` with `LIKE '%term%'` against the matched entity **per keystroke**.
- `omnibar-palette.component.ts:511-513` — the `generation` guard discards stale *results* but does **not cancel** the in-flight query, so fast typing after `#accounts ` fires N concurrent DB round-trips.

**Why it hurts:** Every character typed after an entity match hits the database, flooding MJAPI/GraphQL during a typing burst.

**Fix:** Apply the same 300ms debounce to trigger-mode fires that hit a backend (or at minimum to the record-provider RunView phase); gate the RunView behind a ≥2-char record term. Keep the in-memory `matchEntities` un-debounced (cheap/synchronous).

**Effort:** Low. **Confidence:** High.

### 🟠 R5 — `AIEngineBase.Config()` grew ~9 entities and loads embedding tables as full `entity_object` *(mix: growth is NEW, entity_object is pre-existing)*

**Where:** `packages/AI/BaseAIEngine/src/BaseAIEngine.ts:165-415` — Config issues **45** RunViews in one batch; pre-warmed on every client login via `packages/Angular/Explorer/shared/src/lib/shared.service.ts:85`. In-window additions: AI Skills / Skill Actions / Skill Sub Agents / Agent Skills / Skill Permissions, Agent Channels, Agent Co Agents, Scoped Prompt Parts/Configs. Separately, `:209-212` (`MJ: AI Agent Notes`) and `:226-229` (`MJ: AI Agent Examples`) load unfiltered, no `Fields`, default `entity_object` — which **ignores `Fields` and pulls every column, including persisted embedding vectors**.

**Why it hurts:** It's fire-and-forget (not TTI-blocking), but it's more round-trips + more process-wide cached arrays on every login, and the Notes/Examples payload grows unbounded with embeddings the client never needs.

**Fix (two parts):** (a) Load Notes/Examples as `ResultType: 'simple'` with an explicit `Fields` list excluding the embedding column (or filter to active/injectable). (b) Consider splitting AIEngineBase into a "core metadata" tier (always warmed) and a "skills/realtime" tier loaded lazily on first Conversations/Skills use.

**Effort:** (a) Low, (b) Medium. **Confidence:** High (a) / Medium (b).

### 🟡 R6 — `simple-record-list` loads full `entity_object`, no field narrowing, no row cap *(pre-existing)*

**Where:** `packages/Angular/Explorer/simple-record-list/src/lib/simple-record-list/simple-record-list.component.ts:116-120` — read-only list (values via `.Get()`, emitted on click, never saved) uses `ResultType: 'entity_object'`, ignores the narrow `Columns` it already computes (`:106-112`), and has no `MaxRows`. Also `:103` uses `md.Entities.find(...)` instead of `EntityByName`.

**Fix:** `ResultType: 'simple'`, `Fields: this.Columns`, add `MaxRows`; switch `.Get()`/sort to plain-object access; use `EntityByName`.

**Effort:** Low. **Confidence:** High.

### 🟡 R7 — `single-list-detail` "Add from views" runs a RunView per selected view (N+1) *(pre-existing)*

**Where:** `packages/Angular/Explorer/explorer-core/src/lib/single-list-detail/single-list-detail.component.ts:1380-1391` — sequential `RunView` per selected view.

**Fix:** Collect into one `rv.RunViews([...])` batch, union the ID sets. (User-triggered admin action, low frequency — hence Low.)

**Effort:** Low. **Confidence:** High.

### 🟡 R8 — Knowledge Hub Analytics loads 6 full tables for a 30-day view *(pre-existing, pre-window: `98027869f6`, Apr 6)*

**Where:** `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/analytics/analytics-resource.component.ts:849` — one `RunViews` batch (good) but each query pulls an entire table (`ExtraFilter: ''`, no `MaxRows`, no `Fields`), including the highest-cardinality `Content Item Tags` and `Content Process Run Details`. The 30-day `ActiveDateRange` is applied client-side *after* full load.

**Fix:** Push the date range into `ExtraFilter` on time-bounded entities; add `MaxRows` guards; consider server-side aggregation via a stored query.

**Effort:** Medium. **Confidence:** High.

---

## Confirmed NON-issues (checked and cleared)

- **Lists overhaul (#3145, `bda123ad49`)** — collapsed ~1,000 requests/list-open to ~3; batched `count_only`; keyset pagination + composite index. **Improvement.**
- **Entity-forms collapsed related-entity grids** — now correctly gated `[AllowLoad]="IsSectionExpanded(...)"` (default false) + `DeferLoadUntilVisible` IntersectionObserver (`abcba90806`, `1f320baace`). No eager fetch.
- **Metadata payload shape** — `AllMetadataArrays` unchanged in 8 weeks; bootstrap `GetAllMetadata` not larger.
- **Forms-as-tabs/dialogs/slide-ins refactor (`3b29882b84`)** — single-record host load, no redundant loads, no post-save view reload.
- **Search overlay / unified GraphQL search** — healthy, 400ms debounce, not regressed.
- **Agent mention picker** — session-cached (`MentionAutocompleteService`), synchronous. Not regressed.
- **StartupManager** — parallelizes same-priority engines, fires deferred fire-and-forget. Good.
- **Grid hot path (`EntityDataGridComponent`)** — `simple` + narrow fields, promise-dedup, param-equality gate, client-side sort/filter. Well-engineered.

---

## Remediation plan

### Quick wins — IMPLEMENTED on branch `perf/explorer-quick-wins-2026-07` (compiles; explorer-core 76/76 + simple-record-list 13/13 tests pass)
1. **R4 ✅** — omnibar `#` trigger mode now debounces (`TRIGGER_DEBOUNCE_MS = 150ms`) instead of firing a RunView on every keystroke. Kept the intentional empty-term "browse top 5" behavior (bounded, cheap). Files: `omnibar-palette.component.ts`.
2. **R7 ✅** — `single-list-detail` add-from-views converted from a sequential per-view `RunView` loop to a single `RunViews` batch (N round-trips → 1). File: `single-list-detail.component.ts`.
3. **R6 (partial) ✅** — `simple-record-list` now uses `EntityByName` instead of the O(N) case-sensitive `Entities.find`. The full `simple`+`Fields`+`MaxRows` change was **deliberately deferred** — it would break consumers that call `.Get()` on the returned `BaseEntity[]` and the `RecordSelected` output type; that needs the template + output-type changes too (see below).

### Deferred — need broader changes or E2E verification (documented, not attempted blind)
4. **R1 + R2 (HIGHEST user-visible impact)** — chat streaming fast-path: on the streaming branch, mutate the active message in place and `markForCheck()` only its `ComponentRef` (skip `BuildConversationTimeline` / array replacement), and add real `OnPush` to `MessageItemComponent`. Needs careful change-detection testing + a long-thread before/after profile. **Do as a focused PR.**
5. **R3** — coalesce the streaming markdown re-parse (~60–100ms buffer). Pairs with R1; do together.
6. **R5a** — `AIEngineBase` Notes/Examples → `simple` + `Fields` excluding embeddings. Deferred because these cached arrays are consumed as `BaseEntity` instances in places; changing `ResultType` needs a consumer audit first.
7. **R6 (full)** — `simple-record-list` → `simple` + `Fields` + `MaxRows`, plus template `.Get()` → plain-object access and `RecordSelected` output-type change.
8. **R5b** — split `AIEngineBase` into core vs. skills/realtime tiers with lazy load.
9. **R8** — server-side date filtering / aggregation for KH Analytics.

### Infra follow-up (found during this investigation)
10. **Workbench `db-bootstrap`** — update `docker/workbench/db-bootstrap.sh` to call `mj migrate` (Skyway) instead of the obsolete raw `flyway` CLI, which fails on `${...}` template content in current migrations.

---

## Live workbench test results

**Setup:** clean Docker workbench, fresh SQL Server migrated to latest `next` via Skyway (v5.46, 379 entities), MJAPI + MJExplorer running, Auth0 headless login, driven by in-container Playwright. Instrumentation: injected client-side GraphQL-request counter + `PerformanceObserver` long-task monitor, plus MJAPI's own redundancy telemetry (Duplicate-RunView / Multiple-Queries warnings) diffed per action.

**Headline: the Explorer baseline is healthy.** Every surface exercised loaded quickly with no main-thread jank. The recent feature additions did **not** introduce gross baseline slowdowns; the real regressions are specific and **scale-dependent** (they surface as conversations/data grow), which is consistent with "users complain in heavy use."

| Action | GraphQL reqs | Long tasks | Redundancy telemetry |
|---|---|---|---|
| Home → Data Explorer | 6 (120ms) | 0 | none |
| Open Entities grid (379 rows) | 10 (237ms) | 1 (73ms) | `Application Entities` queried 3× (minor) |
| Global search — type 7 chars | **1** (debounced ✅) | 0 | none |
| Open Chat app | 10 (163ms) | 0 | none |
| Sage streaming reply (N=1 msg) | 20 fetch (orchestration) | **0** | none |
| Open Lists app | 5 (78ms) | 0 | none |

**Confirmations:**
- **Search is properly debounced** — 7 keystrokes → 1 GraphQL request. (R4's regression is specifically the omnibar `#` *trigger* mode, which the code bypasses this debounce for — confirmed by code; the free-text path is healthy.)
- **Grid / viewing system is healthy** — 379-row grid loaded with one 73ms long task; AG-Grid virtualizes rows.
- **Lists app is efficient** — confirms the #3145 overhaul is a real improvement.
- **Agent chat works and streams smoothly at small conversation size (0 long tasks)** — this is *consistent* with R1, not contrary to it: R1's cost is O(N messages) per token, so jank only appears as a thread grows. Static analysis remains the evidence for R1's scaling; a long-thread reproduction is the recommended follow-up to quantify it.

**Live-discovered items (not in the static pass):**
- **`MJ: Application Entities` queried 3× with different filters** when opening the Data Explorer entity browser — a small, real redundancy (candidate for a single batched load). Severity 🟡.
- **`MJ: User Routines` flagged "queried up to 52× with distinct filters"** by MJAPI telemetry — **investigated and largely a false positive.** It's the `UserRoutineDispatcherDriver` scheduled sweep (every 1 min, 12–19ms each) whose filter embeds `now.toISOString()`, so every sweep is a unique filter string the redundancy heuristic counts as "different." It is correct, cheap, background behavior — **not an Explorer regression.** Minor cosmetic opportunity: the sweep could set `BypassCache: true` (it needs fresh due-rows anyway) so it stops polluting cache-fingerprint stats. Severity 🟢 (cosmetic).
- **Agent robustness:** one Sage follow-up run logged `Agent terminated after 10 consecutive failed steps` alongside a `[ModelExecution]` error on `Claude Haiku 4.5`. This is almost certainly the workbench's model/vendor configuration (only an Anthropic key was wired), **not a perf regression** — flagged for awareness only.

**Net:** No emergency-level baseline regression in Explorer. Prioritize the **chat streaming render path (R1/R2/R3)** — the one genuinely user-visible regression that worsens with conversation length — followed by the omnibar `#` debounce (R4) and the small pre-existing cleanups.

---

## Appendix: methodology notes

- Workbench's bundled `db-bootstrap` uses the **obsolete raw Flyway CLI**, which fails on migration SQL containing literal `${...}` template content (`No value provided for placeholder`). MJ has since moved to its own **Skyway** engine (`mj migrate`), which correctly leaves unknown `${...}` literal. **Action item:** update `docker/workbench/db-bootstrap.sh` to call `mj migrate` instead of raw `flyway` (or the workbench can't bootstrap current `next`).
