# ADR: a watchdog primitive for in-flight work registries

- **Status:** Proposed
- **Date:** 2026-08-25
- **Scope:** `@memberjunction/global` (the primitive), `@memberjunction/ai-agents` (`AgentRunWatchdog`), `@memberjunction/integration-engine` (`DiscoveryWatchdog`), and `@memberjunction/scheduling-engine` (the optional driver layer).

> Proposed, not accepted. Nothing here has been built. This records a shape and the reasoning for it so the shape can be argued with before any code moves.

## Context

MJ has grown two watchdogs independently:

- **`AgentRunWatchdog`** (`packages/AI/Agents/src/agent-run-watchdog.ts`) — tracks agent runs this process owns, stamps liveness heartbeats, and force-fails runs whose heartbeat has gone stale.
- **`DiscoveryWatchdog`** (`packages/Integration/engine/src/DiscoveryWatchdog.ts`) — tracks in-flight discovery samples and periodically names what is still running, because a hung sample and a busy one are otherwise indistinguishable from outside the process.

They do different jobs. One **acts** on what it finds, the other only **reports**. But they arrived at the same eight structural invariants by separate routes:

| invariant | `AgentRunWatchdog` | `DiscoveryWatchdog` |
| --- | --- | --- |
| process-wide identity | `BaseSingleton` | hand-rolled `static _instance`, corrected to `BaseSingleton` under review |
| a registry of in-flight work | `Set<string>` | `Map<string, Entry>` |
| register / deregister pair | `Track` / `Untrack` | `Start` / `End` |
| timer starts lazily on the first item | `ensureStarted()` | `ensureTicker()` |
| timer stops when the registry empties | yes | yes |
| `unref()` so it never holds the event loop open | yes | yes |
| registered with `ShutdownRegistry`, stops on drain | yes | **missing until review** |
| the periodic body must never throw | explicit | implicit |

`BaseSingleton` speaks to exactly one row of that table — identity. It resolves an instance through the Global Object Store so that a package loaded twice in a process still shares one instance. It says nothing about registries, timer lifecycle, `unref` discipline, shutdown, or the never-throw rule.

**The evidence that this is worth codifying is the last two rows.** The second watchdog was written after the first, by the same hand, and still shipped without shutdown registration and without an explicit never-throw contract. Both were found by review, not by tests, and a missed `unref` or a throwing timer body is precisely the class of defect that surfaces as an unrelated symptom weeks later — a process that will not exit, or a diagnostic that silently stops after its first error.

Two implementations is the conventional threshold for hesitating about an abstraction, and that hesitation is recorded here deliberately (see *Consequences*). The argument for acting now is not code reuse — the two bodies share almost no logic — it is that the **invariants** are easy to get subtly wrong and currently exist only as convention.

## Decision 1 — introduce `BaseWatchdog<TEntry, TConfig>` in `@memberjunction/global`

**A watchdog is a process-wide registry of in-flight work with lazily-started, self-stopping, `unref`'d periodic actions over it, that shuts down cleanly; that shape becomes a base class rather than a convention.**

**Context.** The eight invariants above are the whole of what is shared. Placing them in a base class makes them inherited rather than remembered, and makes a missing one a compile-time or review-time absence rather than an invisible one. `@memberjunction/global` is the right home: it already owns `BaseSingleton`, `ShutdownRegistry` and `IShutdownable`, which the primitive composes, and it is a dependency both watchdogs already carry.

**Shape.** The base extends `BaseSingleton` and implements `IShutdownable`. It owns the registry (`Map<string, TEntry>`), the register/deregister pair, timer lifecycle, `unref` discipline, shutdown registration, and a `Configure(Partial<TConfig>)` seam. Subclasses supply only the periodic body.

**Consequences.**
- A new watchdog inherits correct lifecycle by construction. The failure mode becomes "did not override the tick", which is loud, rather than "forgot to `unref`", which is silent.
- `Reset()` (drop registry, stop timers) belongs on the base — both implementations need it for tests, and one for shutdown.
- The base must not assume the registry is the only state. `AgentRunWatchdog` holds a provider and a context user alongside it; those stay subclass fields.

## Decision 2 — periodic actions are a named set, not a single tick

**A watchdog declares zero or more named periodic tasks, each with its own interval, rather than one `Tick()`.**

**Context.** `AgentRunWatchdog` already runs two timers at different cadences — a heartbeat and an orphan sweep — and they are not variations of one action. A single-tick base would force it to hand-roll the second timer, reintroducing exactly the lifecycle code the primitive exists to remove.

**Consequences.**
- `DiscoveryWatchdog` declares one task; `AgentRunWatchdog` declares two. Neither is a special case.
- Each task is individually startable/stoppable, so "stop the reporting tick but keep the safety sweep" is expressible.
- The base wraps every task body in a catch that logs and continues. The never-throw rule stops being a convention each author must remember.

## Decision 3 — the periodic body is an idempotent public method; the timer is the floor, a scheduled job is an optional layer

**Each periodic action is exposed as an idempotent public method that anything may call; the in-process timer is the reliability floor, and an MJ Scheduled Job driver is an optional observability layer on top of the same method — never the only caller.**

**Context.** This is not new; it is an existing decision being promoted from one implementation to the primitive. `AgentRunSweepScheduledJobDriver` (`packages/Scheduling/engine/src/drivers/`) already wraps `AgentRunWatchdog.SweepOrphanedRuns` and documents itself as an *"audit/observability layer"*. The reasoning is recorded in `AgentRunWatchdog.ensureStarted()`: `ScheduledJobsService` is gated by `scheduledJobs.enabled`, so moving a safety net there would silently disable it in any deployment running with scheduled jobs off — exactly where the net still needs to work.

**Consequences.**
- The primitive's contract is that a periodic body is safe to invoke concurrently with its own timer, and safe to invoke from a process that owns nothing.
- A watchdog that wants scheduled-job visibility adds a `BaseScheduledJob` driver; it never moves the work there.
- This is the first row of the table that is a *product* decision rather than a mechanical one, and it is the one most likely to be got wrong by a future author, which is why it belongs in the base's documented contract.

## Decision 4 — an optional emission seam, with per-run correlation as its precondition

**The base offers an optional emission seam so a watchdog's periodic output can become run events rather than only log lines — conditional on entries carrying a correlation id.**

**Context.** Today `DiscoveryWatchdog` writes to `console.log` and `AgentRunWatchdog` writes to the database and the log. Neither goes through `IntegrationProgressEmitter`, so the richest live signal MJ has about a running discovery — per-object `stage`, `pages`, `records`, time-to-deadline — is visible only to someone reading server logs. The same data routed through the emitter would land in the run-event stream, where `IntegrationTailRunEvents` already exposes it and two wizards already narrate it. A discovery progress indicator would follow with no new server surface.

**The precondition is the hard part, and it is why this is a separate decision.** A watchdog is process-wide; run events are per-run. A tick iterating the registry cannot emit anywhere until each entry knows which run it belongs to. So the seam is only usable by a watchdog whose `TEntry` carries a correlation id, and the base must treat emission as optional rather than assumed.

**Consequences.**
- `DiscoveryWatchdog` entries would gain a run/company-integration id at `Start()`. That is a real change to its callers, not a free upgrade.
- Emission must be best-effort and non-fatal: a diagnostic that fails a run because it could not report is worse than one that goes quiet.
- Rate matters. A 15s ticker writing per-object rows into an append-only event stream is a different cost profile from a log line, and the interval that suits an operator tailing logs may not suit an event store.

## Consequences overall

- **Two implementations is thin ground for an abstraction, and this ADR does not pretend otherwise.** The case rests on the invariants, not on shared code — the two tick bodies have nothing in common. If the reviewer's judgement is that convention plus review is sufficient, the honest alternative is to document the eight invariants as a checklist and close this.
- **Migration is incremental and low-risk.** `DiscoveryWatchdog` is new and has one consumer; `AgentRunWatchdog` is load-bearing and should move second, or not at all until the primitive has proven itself on the smaller one.
- **Decisions 1–3 stand alone.** Decision 4 depends on correlation ids reaching the registry and can be deferred without blocking the rest.
- **A third watchdog is the real test.** If the next in-flight-work tracker written against this base needs no lifecycle code of its own, the abstraction earned its place. If it needs escape hatches, it did not.
