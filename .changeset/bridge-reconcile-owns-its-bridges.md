---
"@memberjunction/ai-bridge-server": patch
"@memberjunction/server": patch
---

The realtime bridge engine's orphan reconcile closes only the bridges an earlier boot of the same MJAPI left, and no longer other MJAPIs' live bridges (#5310). Before, MJServer never gave the engine its identity, so every MJAPI stamped its bridges `unknown-host:pid:bootId`, and each one's reconcile (15 seconds after startup, then every 10 minutes) marked every other MJAPI's `Connecting` and `Connected` bridges `Disconnected` with reason `Janitor` and finalized their co-agent runs while the calls went on.

- `Serve` gives the engine the identity its agent-session rows carry (`BindBridgeEngineHostInstance`), so bridge rows are stamped `hostname:port:pid:bootId`.
- `IHostInstanceIdentity` has `GetInstancePrefix()` in place of `GetHostNamePrefix()`, and a new `IsPriorBoot(id)`. `ReconcileOrphans` reads the open bridges under the instance prefix and closes those `IsPriorBoot` accepts, checking each id exactly, since a SQL `LIKE` reads a `_` in a host name as any character. MJServer's `HostInstanceIdentity` has both methods; a host that injects its own identity needs them too.
- The engine's `HandleStartup` no longer starts the orphan reconcile. The host starts it (`StartOrphanReconciliation`) once it owns its instance: `Serve` does so after it listens (`StartBridgeOrphanReconciliation`), so an MJAPI started on a port another MJAPI still serves can't close that one's bridges before it fails to bind.
- `DefaultHostInstanceIdentity`, used until a host injects one, names this process alone (`hostname:pid-<pid>:<pid>:<bootId>`), so it never matches another process's bridges.
- Bridge rows stamped `unknown-host:…` before the upgrade belong to no instance, so the reconcile no longer closes them.
