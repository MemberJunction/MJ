---
"@memberjunction/task-graph": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
---

Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

**BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the *durability* problem — nothing awaits a whole workflow inside one request anymore — but left the *reachability* problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

**The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

**The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.
