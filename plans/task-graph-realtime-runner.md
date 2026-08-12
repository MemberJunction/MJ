# Workflow Run Console — realtime runner & debugger for task graphs

**Status:** Implemented on this branch (RT-1 through RT-4 v1) — see §4 notes per phase
**Date:** 2026-08-12
**Origin:** Study of the task-graph program (PR [#3456](https://github.com/MemberJunction/MJ/pull/3456) plan v8, merged; hardening round 2, PR [#3749](https://github.com/MemberJunction/MJ/pull/3749)) plus the flow-agent realtime pipeline as shipped on `next`
**Companion mockup:** [`mockups/workflow-ux/run-console-v1.html`](../mockups/workflow-ux/run-console-v1.html) — extends the committed Phase 5 design contract (`mockups/workflow-ux/phase5-overview-v1.html`)

---

## 1. What this is

A **realtime runner/debugger at the task-graph level** — the same "press Run and watch it live" experience the agent harness gives a Loop agent, but for the durable dispatcher that now executes every workflow. Since the Track C.1 cutover (#3692), a Flow agent *is* a task graph at runtime: it compiles its steps and submit-and-detaches to `TaskGraphDispatcher`. That means the place to run, watch, and debug a workflow is no longer the agent run — it is the graph.

Three capabilities, layered:

1. **Realtime** — the run view goes from 3-second polling to live frames, and a running Agent node drills into its child run's existing live stream.
2. **Runner** — press ▶ Run on a workflow from the editor or the Workflows app and land in a live console; pause, resume, cancel.
3. **Debugger** — breakpoints, single-stepping, payload inspection/editing at step boundaries, edge-verdict visibility ("why did this branch run / why is this held"), claim visibility, stall diagnosis, and a what-if preview.

This is not a new subsystem. It is the **completion of two committed debts** — the 5b UI debt ("the Workflows dashboard consumer stays with the 5b UI debt", `plans/flow-agent-taskgraph-unification.md` §5.11) and the R4 repurposing of the restored Workflows app as *the* run-review surface — plus the **observability counterpart to the hardening program**: every headline defect class in round 2 (#3749) shares the signature "the graph looks fine while a run strands silently." A live console makes that class of failure visible instead of forensic.

## 2. Why the substrate is already 80% there (verified)

**Server-side realtime is complete and client-absent.** `TaskGraphFrameResolver` (`packages/MJServer/src/resolvers/TaskGraphFrameResolver.ts`) publishes seven semantic frame kinds — `TaskStarted`, `TaskCompleted`, `TaskFailed`, `TaskBlocked`, `TaskSkipped`, `TaskAwaitingHuman`, `GraphSettled` — over the `taskGraphFrames(parentTaskId)` GraphQL subscription, with fail-closed owner filtering (`taskGraphFrameFilter` requires graph match **and** connection identity == frame owner). Repo-wide grep: **zero client consumers**. Every UI surface polls instead: `task-graph-run-view.component.ts` re-runs `MJ: Tasks` + `MJ: Task Dependencies` with `BypassCache: true` every 3 s.

**The client transport pattern exists and is mature.** `GraphQLDataProvider.PushStatusUpdates(sessionId)` (`graphQLDataProvider.ts:3135-3260`) already does refcounted shared subjects per key, idle reaping, reconnect, and token-expiry re-subscribe over `graphql-ws`. The frames client is the same shape keyed by `parentTaskId`.

**The node-level live stream exists.** A dispatcher Agent node starts a brand-new root `AIAgentRun`; that run streams through the mature Pipeline A (`RunAIAgentResolver.createProgressCallback` → `PUSH_STATUS_UPDATES` → ai-test-harness live monitor / conversations). The console's "drill into a running step" is a *join* of two shipped pipelines, not new machinery.

**The debugger's data is already computed every pass.** `loadGraphState` (`TaskGraphDispatcher.ts:1914`) resolves every conditional edge into keep/drop/hold and every exclusive group into winner/losers; `findClaimableTasks` computes `holdTaskIDs`, `skipSeedTaskIDs`, `unreachableTaskIDs`; the claim store knows `ClaimedBy`/heartbeat/`ClaimExpiresAt`; `IsGraphStalled` already detects wedges. Today all of that is **logged, not emitted**. The debugger is largely "emit what you already know."

**The control-plane pattern is settled.** Standing rule since #3576: every task-graph control verb ships as a Remote Operation (`TaskGraph.Submit/.Cancel/.RetryTask/.GetStatus`, plus `.CompleteTask` from C1.3). The debug verbs join that family.

**Replay machinery exists.** The agent-run flow view (`agent-run-flow.component.ts`) already owns a master clock — scrub/play/speed — over projected run trees. Post-settle time travel reuses that pattern over Task rows + frames.

## 3. Design

### 3.1 Layer 1 — transport: wire the frames (the 5b debt)

- **Client:** `GraphQLDataProvider.TaskGraphFrames(parentTaskId): Observable<TaskGraphFrameNotification>`, mirroring `PushStatusUpdates` (shared subject per graph, refcount, reconnect re-subscribe).
- **Host service** (Explorer/conversations layer, not the widget): `TaskGraphLiveService` subscribes and feeds `BuildRuntimeStatus` (`task-graph-runtime-source.ts`) — the mapper is pure and already row-shaped; a frame carries everything a `{ID, Name, Status}` row needs. The widget keeps receiving `RuntimeStatus` as an `@Input()` per the widgets-layer rule (a Generic component cannot own a data subscription).
- **Doctrine — frames are advisory, rows are truth.** Frames are fire-and-forget commentary ("a frame is commentary on work, never a step of it") and, today, in-process PubSub only — a multi-node MJAPI drops frames for clients attached to the other node. So the console treats a frame as a *trigger to render*, and reconciles from rows: one row poll on attach, on websocket reconnect, and on `GraphSettled`. The existing 3 s poll degrades to a slow (30 s) safety-net reconcile while frames are flowing, and disappears entirely when the graph settles. Getting frames onto the Redis channel (the cache-invalidation precedent in `CACHING_AND_PUBSUB_GUIDE.md`) is a later, separable hardening item.

### 3.2 Layer 2 — new frame kinds: emit what the dispatcher already computes

Additions to `TaskGraphFrameKind` (all data already in hand at the emission site; no new computation):

| Frame | Emitted from | Carries | Why |
|---|---|---|---|
| `GateDecision` | `loadGraphState` edge resolution | edge (from/to), verdict `satisfied \| false \| hold`, condition text, hold reason, exclusive-group winner/losers | "Why did this branch run?" is the single most-asked debugging question; also makes the R2-3 hold class visible the moment it happens |
| `ClaimChanged` | `TryClaim` / `Heartbeat` / `CompleteClaimed` / reclamation | taskId, claimedBy, expiresAt, event (`claimed \| heartbeat \| released \| expired \| reclaimed`) | Makes the R2-1 wedge class (expired claim nobody reclaims) visible as a red badge instead of a forensic query |
| `PassCompleted` | end of `pollOnce` | pass counter, eligible/held/claimed/in-flight counts, settle outcome (`settled \| deferred \| refused:<reason>`) | The engine's heartbeat — the console's bottom strip; a run that stops ticking or keeps deferring settlement is visibly stuck (R2-2, R2-11, R2-12 classes) |
| `GraphPaused` / `GraphResumed` / `BreakpointHit` | debug verbs + claim filter | parentTaskId, taskId (for breakpoint), by whom | Console state sync across observers |
| `NodeProgress` | already specified in C.1 §5.11 | taskId, message, percentage | Runner→dispatcher progress bridge; the console renders it inline on the node |

Frame volume note: `GateDecision`/`ClaimChanged` are per-transition, not per-poll — the once-per-edge dedup discipline that already exists for unevaluable-condition logging (`logUnevaluableConditionOnce`) applies to emission as well.

### 3.3 Layer 3 — control plane: debugging as claim gating

The deep insight this design leans on: **because execution is durable and claim-based, every debugger control is a gate on *claiming*, never on *running*.** No new execution machinery; no touching live claims.

- **`TaskGraph.Pause(parentTaskId)`** — writes a `debug.paused` flag into the parent's metadata bag (the `JSON_MODIFY`-only discipline that already protects the continuation marker; two-writer rule preserved). `findClaimableTasks` excludes children of paused graphs. In-flight claimed tasks finish naturally and their completions land; nothing new becomes claimed. This deliberately answers the question the program deferred ("pausing a claimed task means deciding what happens to its claim" — #3576 amendment): *pause gates claiming and never decides claim fate*, so there is nothing to decide.
- **`TaskGraph.Resume(parentTaskId)`** — clears the flag.
- **`TaskGraph.Step(parentTaskId, { taskId? })`** — while paused, permits exactly one claim (a named task if given and eligible, else the next eligible by wave order); the graph returns to paused once that task reaches a terminal status. "Step wave" variant releases the current frontier. Implemented as a one-shot allowance in the same metadata bag, consumed CAS-style by the claim filter.
- **Breakpoints** — `debug.breakpoints: [taskId…]` in the metadata bag. When the claim filter finds an eligible task on the list, it flips the graph to paused *before* claiming and emits `BreakpointHit`. Breakpoints are authored holds — the exact mechanism `holdTaskIDs` already implements for unevaluable conditions, driven by user intent instead of a broken guard.
- **Intervention verbs** (paused or on a terminal node; all CAS-guarded, all owner-or-elevated, all through the RO family so D20's "legitimate verbs go through the mutations" discipline holds):
  - `TaskGraph.RetryTask(taskId, { inputPayload? })` — extends the existing Retry with an optional edited input (the "edit payload and re-run this step" move).
  - `TaskGraph.ForceCompleteTask(taskId, outputPayload)` — mark Complete with a supplied output; downstream edges evaluate against it. The escape hatch for a wedged or externally-resolved step. (Shares plumbing with `CompleteTask`; differs in authorization intent and audit.)
  - `TaskGraph.SkipTask(taskId)` — declare a branch not-taken; ordinary skip cascade runs.
  - `TaskGraph.ReleaseHold(taskId, { verdict: 'false' })` — resolve an unevaluable condition by declaring it false (drop the edge, cascade skips). The operator-grade mitigation for the R2-3 class until the classification fix lands — and still useful after it, for genuinely broken guards.
- **Sweep interplay:** a paused graph is a *legitimate parked shape* — the reconciliation sweep must treat `debug.paused` the way it treats human tasks (exempt from anomaly normalization) while still reclaiming expired claims on its in-flight stragglers. Pause also suspends the graph's `DueAt`-style escalations but not claim TTL.
- **Storage:** everything lives in the parent metadata bag — **no migration**. If round-trip pressure appears (sweep predicates wanting SQL-visible pause state), a single nullable `DebugState` column is the fallback; not proposed now.
- **Debug-run entry:** "▶ Run" on a workflow (editor toolbar, Workflows app) calls the existing submit path — for a Flow agent, exactly what chat invocation does — optionally with `debug.paused` pre-set ("start paused") or breakpoints pre-loaded. The runner is the normal engine; the console never gets a special execution mode that could drift from production behavior.

### 3.4 The console UX

One surface, in the restored **Workflows app** (its R4 charter — run review — is this console; three of the five run producers have no agent run and are visible nowhere else). Same canvas component (`ng-task-graph-editor` run view), same runtime overlay, D18 vocabulary throughout (step, path, plan — never node/DAG/claim on end-user text; "claim" appears only in the engine strip, which is a builder surface).

- **Toolbar:** Run ▶ / Pause ⏸ / Step ⏭ / Run-to-breakpoint, progress, elapsed, Cancel.
- **Canvas:** live per-step status (frames), breakpoint dots on step corners, **edge verdicts rendered on the paths** — satisfied (solid green + condition label ✓), not-taken (grey dashed), held (amber pulse + reason), exclusive winner badge (`1/2`, already shipped as the rank chip).
- **Running Agent step drill-in:** the node expands with the child run's live progress (current step, message, elapsed) from Pipeline A; "Open live monitor" jumps to the existing agent-run form, which already goes live via BaseEntity events when `Status === 'Running'`.
- **Inspector (right panel, on selection):** status + timing; claim card (instance, heartbeat age, expiry — red when expired); input payload vs. merged dependency payload (the exact seam the `{}`-render bug hid in); output payload; incoming/outgoing edge verdicts with condition text; step-level actions (retry-with-edits, force complete, skip).
- **Engine strip (bottom):** the `PassCompleted` ticker — one tick per dispatcher pass with claimed/held/in-flight counts and settle outcome. A stalled run is a strip that keeps ticking with nothing moving, plus a stall banner naming *why* (held on condition X; claim expired on step Y) with jump-to-step.
- **What-if preview:** while paused (or pre-run), "if this step fails →" ghost-overlays the block/skip consequence using the pure algorithms (`ComputeTasksToBlock`, `ComputeSkipCascade` from `ai-core-plus`) — client-side, zero server cost, and by construction the same code the dispatcher runs.
- **Replay:** on a settled run the same canvas scrubs through time (master-clock pattern from `agent-run-flow.component.ts`) reconstructed from row timestamps + the run's frame log.
- **HITL:** a waiting-on-human step shows assignee/due/nudge, and — when the viewer is the assignee — completes inline via `CompleteTask`.

Entry points: Workflows app run list → console; editor toolbar ▶ Run → console; chat plan card "View" → console (the plan card itself stays the compact checklist).

## 4. Phasing

| # | Ships | Exit criterion |
|---|---|---|
| RT-1 | Frames client in `GraphQLDataProvider` + `TaskGraphLiveService`; run view frame-driven with row reconcile; `NodeProgress` emission | A chat-launched workflow renders step transitions < 1 s after the frame, with polling reduced to the safety net; reload re-attaches |
| RT-2 | New frame kinds (`GateDecision`, `ClaimChanged`, `PassCompleted`); console v1 in the Workflows app: inspector, edge verdicts, engine strip, stall banner; agent-node drill-in | The IT74 stall fixtures (hold, expired claim) each produce a visible, named diagnosis in the console with no DB spelunking |
| RT-3 | Debug ROs: Pause/Resume/Step/breakpoints + intervention verbs (`RetryTask` payload edits, `ForceCompleteTask`, `SkipTask`, `ReleaseHold`); "start paused" run entry; sweep exemption | Set a breakpoint, run from the editor, hit it, inspect and edit the payload, step through, resume to settle — on a live dispatcher, two-instance safe (IT74 extension) |
| RT-4 | What-if ghost overlay; post-settle replay scrub | "If this fails" preview matches dispatcher behavior on the differential fixtures; a settled run replays |

RT-1 is small and independently valuable; each phase is its own PR citing this plan. Frame-over-Redis (multi-node push) is deliberately out of scope and tracked as a separable item.

## 5. Hardening synergy (#3749)

The console is the observability half of the hardening program — each R2 headline class becomes visible the moment it occurs:

| Defect class | Today | In the console |
|---|---|---|
| R2-1 wedged claim (crashed prompt task) | invisible; graph `In Progress` forever, zero diagnostics | `ClaimChanged: expired` with no reclaim → red claim badge + stall banner naming the step |
| R2-2 settle stall (run `Paused` forever) | invisible | engine strip shows `settle: deferred/refused` ticking with reason |
| R2-3 permanent hold (data absence read as broken guard) | one log line, then silence | amber held edge + verdict card ("origin produced no output"), `ReleaseHold` as the operator escape |
| R2-4 / R2-8 wrong branch under failure/skip | silent wrong execution | `GateDecision` frames show which edge decided and why, live and in replay |

The debugger does not *replace* the fixes — it makes the next ring of seams discoverable in minutes instead of a four-track adversarial review.

## 6. Risks & open questions

- **Frame volume on wide graphs** — per-transition emission with dedup should hold; if not, `GateDecision` batches per pass. Measure in RT-2.
- **Pause vs. loop bodies** — a paused graph with an in-flight `ForEach` finishes the whole loop task (claims gate at task granularity). Acceptable for v1; per-iteration gating would need the loop executor to consult the flag — deferred.
- **Step semantics with parallel waves** — "step" releases one task, which may unblock several; the wave-step variant is the honest unit. Mockup shows both; pick one as default in review.
- **`ForceCompleteTask` audit** — needs a durable "completed by operator" marker (Record Changes covers the row history; the frame log covers the narrative). Confirm that's sufficient vs. a dedicated column.
- **D18 boundary** — the engine strip speaks engine vocabulary (claims, passes). Ruling wanted: is the console an end-user surface (strict D18) or a builder surface (engine strip allowed, collapsed by default)? Mockup assumes builder-surface-with-collapse.
- **Multi-node push** — out of scope here; until frames ride Redis, the reconcile poll is the cross-node guarantee.

## 7. What this deliberately is not

- Not a new execution mode — debug runs are ordinary dispatcher runs with claim gating.
- Not a scheduler/trigger surface — WHEN stays in the trigger layer (Track D/E).
- Not the in-run agent debugger — Loop-agent internals stay in the agent-run form; this console owns the graph level and *links into* the run level.
- No PostgreSQL work — toolchain territory per repo policy.
