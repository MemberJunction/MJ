# Idea 1: Execution Blast-Radius Containment Layer

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

> **Status (2026-09-25): In progress** — implementation work has begun. Tracking in a follow-up PR.

## The problem, framed for the world, not the codebase

Picture a two-person nonprofit IT shop the week before its annual gala: renewal reminders are
going out, the donor portal is open for online gifts, and a program officer — trying to be
helpful — asks an AI agent to "clean up stale event registrations." The agent has no iteration
cap, no cost cap, no token cap, because nobody told them those fields existed or that leaving them
blank meant "unlimited." The agent gets stuck re-planning against a condition it can never satisfy,
grows its own conversation history every turn, and a few minutes later the entire server falls
over — not just that one automation, *everyone's* session, mid-gala, mid-donation. The person who
pays for that mistake is never the person who made it: it's the volunteer whose gift didn't record,
the member who couldn't renew, and the ED who now has to explain a system-wide outage caused by one
misconfigured helper.

This is not a hypothetical for MJ. It happened on a development instance in the last week alone
(**#4539**): one agent run with no caps recorded 106 consecutive "Execute Agent Prompt" steps, grew
its serialized payload until V8 could not allocate a string, and `SIGABRT`'d the whole MJAPI
process — dropping every other user's session and orphaning every concurrent run. The industry
converged on a name for this shape of failure in 2025–2026 SaaS/agent literature: the **"noisy
neighbor"** problem, and the fix pattern is not "make the noisy agent smarter," it's **bulkhead
isolation** — the same principle a ship uses so one flooded compartment doesn't sink the whole
hull. One widely-cited 2026 write-up on multi-tenant agent platforms describes a single tenant's
recursive workflow consuming an entire shared quota and taking down agent services for 47 other
customers for three hours. MJ deployments that put many chapters, member orgs, or client accounts
on one shared server are exactly this shape, and today MJ has no bulkhead at all: every agent run
shares one Node heap, one event loop, one process, with no wall between them.

## What already exists (and why this doesn't duplicate it)

- **Per-run guards exist but are opt-in and measured in the wrong unit.** `AIAgent.MaxCostPerRun`,
  `MaxTokensPerRun`, and `MaxIterationsPerRun` are all checked in `base-agent.ts` (~line 5164–5197),
  but every one is nullable with no default, so an agent record that sets none of them runs with no
  bound except `BaseAgent.DEFAULT_ABSOLUTE_MAX_ITERATIONS = 5000` (`base-agent.ts:480`) — a count of
  turns, not bytes. The incident that grounds this proposal died at iteration 106; an iteration
  ceiling cannot catch a failure whose actual currency is heap size, at any value that's also
  useful. This proposal adds the size-based guard that's structurally missing, it does not
  second-guess the cost/token guards that already work when configured.
- **`packages/MJAPI` inherits the V8 default heap** with no `--max-old-space-size` set anywhere in
  its start script, while `packages/MJExplorer` — a single-developer dev server — already sets
  `16384`. The gap is backwards: the shared, multi-tenant, always-on process has *no* explicit
  ceiling, and the single-user process has a generous one.
- **This is not the Resource Governance Engine** (`plans/weekly-exploration/2026-08-14/idea-2-*`,
  in flight as a proposal): that engine answers *"has this identity exceeded its agreed-upon dollar
  or token budget over a billing window"* — an accounting question, evaluated between runs. This
  proposal answers a different, faster question: *"is this single execution, right now, about to
  take the shared process down with it"* — a runtime-safety question, evaluated continuously during
  a run, that has nothing to do with whether the org can afford the spend. A resource budget can be
  fully unexceeded (cheap, few tokens) while a runaway loop still exhausts memory through payload
  growth alone, which is exactly what happened in #4539. The two compose: Resource Governance stops
  a run because it's *too expensive*; this proposal stops a run because it's *about to crash
  everyone else*, and can do so even for a free, local, zero-token operation.
- **This is not the Tenant Isolation Guarantee** (`plans/weekly-exploration/2026-09-12/idea-2-*`):
  that proposal keeps tenant A's *data* from leaking to tenant B through query/cache/vector/job
  paths. This proposal keeps tenant A's *compute* from starving or crashing tenant B's — a data
  question versus a resource-contention question. A deployment can have perfect data isolation and
  still let one tenant's runaway agent take the whole shared process down for everybody.
- **No execution isolation exists anywhere in the agent runtime today.** A repo-wide search for
  `worker_threads`, `child_process`, or a sandboxing library across `packages/AI/Agents` and
  `packages/MJAPI` returns nothing — every agent run, well-behaved or not, executes in the same
  process, same heap, same event loop as every other concurrent run and every other tenant's
  requests.

## Proposed architecture

### Phase 1 — make the limit intentional (small, immediate)

- Set an explicit `--max-old-space-size` on the MJAPI start script, configurable via
  `mj.config.cjs`/environment variable per deployment, so operators choose a ceiling instead of
  inheriting whatever V8's default happens to be on their host.
- Default `MaxIterationsPerRun` to a sane value (10–25, configurable) when an `AIAgent` record
  leaves it `NULL`, so a misconfigured agent fails its own run instead of relying on the 5000-count
  absolute net. This is additive: any agent that already sets an explicit value keeps it unchanged.
- Re-derive `DEFAULT_ABSOLUTE_MAX_ITERATIONS` so it is reachable *before* a default heap ceiling is
  exhausted at typical per-turn payload growth, or state explicitly that it is not a memory
  safety net and stop implying that it is.

### Phase 2 — the guard that actually matches the failure mode

- A new `PayloadSizeGuard` inside the agent execution loop (`base-agent.ts`), checked every
  iteration alongside the existing cost/token/iteration checks: track the serialized size of the
  growing conversation/payload and fail the *single run* — cleanly, with a normal `AIAgentRun`
  failure status and reason, not a process crash — once it crosses a configurable ceiling (bytes,
  not turns). This is the one guard iteration counts structurally cannot provide, because the
  failure in #4539 is measured in bytes and the iteration count that reached it (106) was two
  orders of magnitude below any iteration ceiling anyone would consider safe to set.
- Extend the same `PayloadSizeGuard` pattern to any other long-running loop that accumulates state
  across iterations without a natural iteration cap — batch record-set processing, long
  `RecordSetProcessor` runs, and Flow/Loop agent sub-runs — so the fix is one reusable primitive,
  not an agent-only patch.

### Phase 3 — an actual bulkhead (larger, scoped separately)

- Move agent execution for runs above a configurable risk threshold (no iteration/cost/token caps
  set, or a deployment-wide policy requiring it for all runs) into a `worker_threads` execution
  context with its own heap ceiling, so a single run's OOM terminates that worker — reported back as
  a normal run failure — instead of aborting the host process. This is explicitly the "larger
  change, worth scoping separately" item the grounding issue itself calls out; this proposal frames
  the design question (worker-per-run vs. a bounded worker pool; how `RunView`/DB connections cross
  the boundary) without committing to the implementation, since it changes how every future agent
  run is dispatched.

### UI

An **Execution Guardrails** admin dashboard (Angular, L2, `scaffold-mj-dashboard` pattern):
per-agent-type default ceilings (with a visible "inherited default" vs. "explicit override" state,
so nobody can create an agent believing a blank field means "no limit" without seeing that it
does), a live view of current heap/RSS for the MJAPI process, and a log of runs that were stopped
by a guardrail — with which guardrail fired, so an operator can tell "this agent hit its iteration
cap" apart from "this agent hit the new payload-size guard" apart from "this agent was killed by the
process-wide heap ceiling." Today none of that is visible anywhere; the only signal an operator gets
is the process disappearing.

## Phased rollout

1. **Phase 1** — heap ceiling + default `MaxIterationsPerRun` + re-derived absolute net. Smallest
   change, directly closes the specific incident in #4539, ships in the same release cycle.
2. **Phase 2** — `PayloadSizeGuard` in the agent loop and reused across long-running batch loops,
   plus the Execution Guardrails dashboard so the guard's behavior is visible and configurable.
3. **Phase 3** — worker-thread execution isolation for high-risk runs, scoped and designed as its
   own effort once Phases 1–2 establish the guard semantics it needs to enforce.

## Open questions

- **Default values.** A default `MaxIterationsPerRun` of 10–25 is safe for most agents but too low
  for a legitimately long-running research or multi-step orchestration agent — the default needs to
  be overridable per-agent-type at the metadata level, not just globally, so a deliberately
  long-running agent isn't punished for being long-running.
- **Worker-thread boundary cost.** Every DB connection, `RunView` call, and `UserInfo` context an
  agent touches today assumes it's in-process. Phase 3's design has to answer how those cross a
  worker boundary without becoming its own serialization-size problem — the same class of failure
  this proposal exists to prevent.
- **Multi-instance deployments.** A deployment already running MJAPI behind a process supervisor
  with auto-restart survives an OOM as a blip instead of an outage; this proposal is aimed
  primarily at the (common, for small orgs) single-instance deployment where a crash is a full stop.
  The guardrail dashboard should surface which failure mode a given deployment is actually exposed
  to, so a small org can tell whether Phase 3 matters for their setup.

## Mockup

See [`mockups/execution-guardrails-dashboard.html`](./mockups/execution-guardrails-dashboard.html) —
the Execution Guardrails dashboard showing per-agent-type limit configuration (inherited vs.
override), live process heap usage, and a guardrail-trip history. Screenshot:
[`screenshots/idea-1-execution-guardrails-dashboard.png`](./screenshots/idea-1-execution-guardrails-dashboard.png).

## Sources

- MemberJunction repo issue **#4539** ("A single runaway agent run can exhaust the Node heap and
  abort the whole MJAPI process") — filed 2026-09-16, open, includes the crash report, timeline, and
  guard-by-guard analysis of why none of the existing limits fired. The primary grounding for this
  proposal.
- Internal analysis (this exploration, 2026-09-19): direct reading of
  `packages/AI/Agents/src/base-agent.ts` (guard checks ~line 5129–5197, `DEFAULT_ABSOLUTE_MAX_ITERATIONS`
  at line 480), `packages/MJAPI/package.json` and `packages/MJExplorer/package.json` start scripts,
  and a repo-wide search confirming no `worker_threads`/`child_process`/sandbox usage exists in the
  agent execution path today.
- ["Implementing Bulkhead Isolation Patterns for Multi-Tenant AI Agent Systems"](https://brandonlincolnhendricks.com/research/implementing-bulkhead-isolation-patterns-multi-tenant-ai-agent-systems-google-cloud)
  and ["Multi-Tenant AI Agent Architecture: Design Guide (2026)"](https://fast.io/resources/ai-agent-multi-tenant-architecture/) —
  2026 industry material describing the "noisy neighbor" failure mode and bulkhead isolation as its
  standard fix, including the cited example of one tenant's recursive workflow taking down agent
  services for 47 other customers for three hours.
