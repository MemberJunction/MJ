---
"@memberjunction/task-graph": patch
"@memberjunction/integration-test-suite": minor
---

**IT74 executes task graphs for real, and fixes the three production bugs that found.**

IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

**The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee *is* the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

**A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal *children*, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A *failing* graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

**A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by *dropping* the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when *every* route in was cut.

Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

`TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.
