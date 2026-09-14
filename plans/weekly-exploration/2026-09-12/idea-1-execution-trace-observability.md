# Idea 1: Execution Trace & Observability Layer

**Week of 2026-09-12 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

An association's AI agent drafts a renewal reminder: it reads the member record, checks a
suppression rule, calls a summarization tool, calls an email-send action, and logs a result. When
that flow is slow, or sends the wrong content, or silently fails halfway through, the person who
has to figure out why is very rarely the person who built the agent — it's a one-person "IT and
everything else" admin at a nonprofit, or a vendor's support engineer three time zones away, staring
at a support ticket that says "the renewal emails didn't go out again." Today, answering "what
actually happened, in what order, and where did the time go" means opening several different
screens — an agent run, its steps, an action execution log, maybe a database query log — and
manually reconstructing the story by matching timestamps by eye. There is no single thread that ties
one user-visible event to everything it caused underneath.

This is not a hypothetical gap. The AI-agent-tooling industry spent 2026 converging on exactly this
as the missing piece: production observability platforms (Langfuse, Braintrust, Honeycomb) now treat
a full multi-agent execution as a *graph* — nodes are steps, edges are causal/timing relationships,
rendered as a waterfall so a human can see the whole causal chain in one view, not reconstruct it
from scattered logs. A framework-agnostic trace schema (OpenTelemetry plus native adapters for
LangGraph, CrewAI, Pydantic AI, the Vercel AI SDK) is emerging specifically so that whichever
agent/action framework produced the trace, the tooling downstream doesn't care. MJ's own backlog has
been asking for this since at least issue **#2281** (an OpenTelemetry request that has sat unaddressed).
For a resource-constrained organization that cannot afford a dedicated observability engineer, "one
click, one waterfall, here's exactly what happened and how long each piece took" is the difference
between debugging in five minutes and giving up and re-running the whole thing hoping it works this
time.

## What already exists (and why this doesn't duplicate it)

MJ already captures rich *internal* provenance for a single execution kind — this proposal adds
**zero new logging pipelines** and instead adds the correlation layer that stitches the ones that
already exist into one causal chain:

- **`MJ: AI Agent Runs` / `MJ: AI Agent Run Steps`** — parent-run linkage, per-step timing, params,
  and redaction, produced by `AgentRunner` (`packages/AI/Agents/src/AgentRunner.ts`). Excellent
  *within* one agent's own step tree; it has no concept of a step calling out to an *Action*, and no
  field ties it to whatever caused the agent to run in the first place (a user click, a scheduled
  job, a workflow step).
- **Action execution logging** — every Action run is logged, but independently of any agent run that
  triggered it. There is no shared identifier joining "the agent step that called this action" to
  "the action execution log row it produced." Confirmed by grep: no `TraceID`, `SpanID`, or
  `CorrelationID` field exists anywhere in `MJCoreEntities` today.
- **AI cost/performance analytics** (`packages/Angular/Explorer/dashboards/src/AI/components/analytics/{cost-budget,model-performance}`, and the in-flight **PR #4402**, "AI usage analytics foundation") — flat, leaderboard-style aggregates: total spend by model, average latency by prompt. This
  proposal is explicitly **not** a cost or usage-analytics dashboard and does not compete with #4402
  — it answers "what happened, in what causal order, for *this one* run," not "how much did we spend
  this month." The two are complementary: a trace and a cost rollup can eventually be joined by a
  shared identifier, but neither requires the other to ship.
- **Unified Resource Governance Engine** (2026-08-14 idea 2, unimplemented) — budgets/quotas on
  spend, a policy question ("are we about to exceed budget"), not a causality question ("why did
  this take 9 seconds and which of these six calls was the slow one"). Different axis entirely.

## Proposed architecture

### Additive correlation, not a new logging subsystem

- **`ExecutionTraceID` / `SpanID` / `ParentSpanID`** — three small, nullable, indexed columns added
  to the execution-tracking entities that already exist and already have start/end timestamps:
  `MJ: AI Agent Runs`, `MJ: AI Agent Run Steps`, and the Action execution log entity. Nullable and
  additive: a deployment that never enables tracing sees no behavior change and no migration risk.
- **An ambient trace context**, propagated the same way `contextUser` already propagates through
  `AgentRunner` and the Action execution pipeline — a `TraceID` generated once at the top of a
  user-visible operation (a chat turn, a scheduled job tick, a workflow run) and threaded down through
  every nested agent step and action call as a `ParentSpanID` reference. This is a parameter-passing
  change, not a new interception layer, and it is the same "generalize a pattern already proven
  narrowly" move this exercise has used for hierarchy roll-ups and suppression checks in prior weeks.

### `MJ: Execution Trace Spans` — a thin, denormalized index (Phase 2)

One row per span, referencing whichever native entity actually produced it (`SourceEntityName` +
`SourceRecordID` — never a duplicate copy of the underlying data) plus `TraceID`, `SpanID`,
`ParentSpanID`, `SpanType` (`AgentRun` / `AgentStep` / `ToolCall` / `Action` / `ExternalCall` /
`Query`), `StartedAt`/`EndedAt`, and `Status`. This table exists purely so "show me every span in
trace X" is one indexed query instead of a fan-out across four entity types — the underlying detail
always lives in, and is only ever read from, the entity that already owns it.

### `TraceExplorer` dashboard (Angular, L1/L2 per the UI layering guide)

A waterfall view for one trace: nested bars sized by duration, colored by `SpanType`, clickable
through to the real underlying record (the actual `AI Agent Run Step` or Action execution log row) —
never a second copy of that detail rendered in the trace view itself. A search/filter surface finds
traces by user, time range, or "slower than Nms" / "ended in error."

### An optional OpenTelemetry (OTLP) exporter (Phase 3)

For organizations that already run Honeycomb, Datadog, or Jaeger, an `ExecutionTraceOtelExporter`
maps `Execution Trace Spans` rows onto the OTLP span schema — the same convergence the external
research above documents the wider agent-tooling industry standardizing on. This makes MJ's trace
data portable into tools an org already pays for, rather than asking every deployment to adopt a new
observability product just to get this.

### Why this belongs in core, not an app

Every serious application built on MJ — a membership renewal flow, a grant-review workflow, a
customer-support agent — eventually needs to answer "why did this specific run behave the way it
did," and the causal-chain mechanics (correlation IDs threaded through nested execution, a waterfall
UI, an optional OTLP bridge) are completely domain-agnostic. Nothing here is specific to
associations, nonprofits, or any other vertical; the sourced pain point (support burden falling on
under-resourced admins) is the motivating lens, not the scope.

## Phased rollout

1. **Phase 1** — additive `TraceID`/`SpanID`/`ParentSpanID` columns on the three existing
   execution-tracking entities; ambient trace-context propagation through `AgentRunner` and the
   Action execution pipeline; a simple "find everything with this TraceID" query utility (CLI/API,
   no dashboard yet) — independently useful for anyone currently grepping logs by hand.
2. **Phase 2** — `MJ: Execution Trace Spans` index entity, populated from the same write paths, and
   the `TraceExplorer` waterfall dashboard.
3. **Phase 3** — `ExecutionTraceOtelExporter` for OTLP-compatible export; span retention/pruning
   policy so trace data doesn't grow unbounded, following the same lifecycle pattern MJ's other
   append-only logs already use.

## Open questions

- **Sampling.** High-volume deployments (thousands of agent runs/day) may not want every run traced
  at full fidelity forever. Leaning toward tracing every run by default (spans are small and cheap)
  but making retention duration configurable, rather than sampling at capture time and permanently
  losing the one trace an admin later needs — deferred to Phase 1 implementation detail.
- **Depth into external calls.** Tracing an `ExternalCall` span for every outbound HTTP/DB round trip
  could add meaningful overhead at high concurrency. Leaning toward instrumenting the small number of
  shared choke points (the database provider's query execution path, the shared HTTP client used by
  Actions) rather than asking every Action author to manually instrument their own external calls —
  flagged for the architecture-review stage.
- **Join with cost data.** Once both this and the in-flight AI usage analytics work (#4402) exist, a
  natural Phase 4 is "this trace cost $X and took Yms" by joining on a shared identifier — explicitly
  not required for either to ship independently.

## Mockup

See [`mockups/execution-trace-observability.html`](./mockups/execution-trace-observability.html) —
the Trace Explorer waterfall view for one multi-agent run, with the causal chain from a user's chat
message through nested agent steps, a tool call, and an Action execution, plus the span detail panel
linking back to the underlying native record. Screenshot:
[`screenshots/idea-1-execution-trace-observability.png`](./screenshots/idea-1-execution-trace-observability.png).

## Sources

- [Braintrust, "The Complete Guide to AI Agent Observability" (2026)](https://www.braintrust.dev/articles/agent-observability-complete-guide-2026) —
  online + offline eval pairing, production traces feeding eval-case creation.
- [Latitude, "15 AI Agent Observability Platforms for 2026"](https://latitude.so/blog/15-ai-agent-observability-platforms-2026-agentic-complexity) —
  survey of the current observability-platform landscape and its graph/waterfall UX convention.
- [Langfuse blog, "AI Agent Observability with Langfuse"](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse) —
  nested multi-agent tracing rendered as a graph.
- [Confident AI, "Best AI Agent Observability Tools 2026"](https://www.confident-ai.com/knowledge-base/compare/best-ai-agent-observability-tools-2026) —
  framework-agnostic trace-schema convergence (OpenTelemetry plus native adapters).
