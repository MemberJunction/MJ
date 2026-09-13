---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
---

Event-driven metadata refresh from dataset membership, and an authoritative dataset-status oracle.

**The problem.** A server process never refreshed its own in-memory metadata after a permission-bearing save it itself processed: the only trigger was the periodic `RefreshIfNeeded()` poller, and its staleness check (`GetDatasetStatusByName` Phase 1) derived each MJ_Metadata item's "remote" timestamp from the server's **own cached dataset slots** — a closed loop. A tightened field-security rule was therefore not enforced over the wire until process restart. Clients had no event-driven metadata refresh at all — a browser loaded metadata once per page load.

**The fix, in three parts:**

1. **Dataset-membership-driven refresh (`ProviderBase`).** When a provider loads the MJ_Metadata dataset, it records which entities compose it (`registerMetadataDatasetMembership`; persisted beside the metadata snapshot for warm boots). The existing static write-invalidation fan-out now also routes save/delete/remote-invalidate events to `handleMetadataMemberEntityEvent`: a write to any member entity schedules a refresh of the provider that owns that metadata, gated by a fail-open backend-identity check for multi-provider processes. Membership is the dataset definition itself — adding a `DatasetItem` row extends coverage with no code change, and no entity names are hardcoded anywhere. Scheduling and refresh policy are per-tier: **database providers** debounce briefly (500ms, burst-coalescing, so the enclosing transaction commits first) and hard-`Refresh()` — the writer must not trust any cache for the re-read; **`GraphQLDataProvider`** coalesces into a long randomized window (15–45s, since every browser receives every write broadcast and MJ_Metadata's members include routinely-written entities like dashboards and queries — the window caps each browser at one staleness check and at most one metadata pull per window, jittered so sessions never stampede together) and then runs the staleness check, re-pulling the graph only when genuinely stale. Single-flight guards the reload itself: a refresh request arriving mid-reload queues exactly one follow-up instead of racing a concurrent reload whose older snapshot could win the swap.

2. **The staleness oracle is authoritative.** `GetDatasetStatusByName` no longer derives status from cached dataset slots — status is always the batched SQL MAX/COUNT per item (the cache remains fully in play for the *data* reads in `GetDatasetByName`), and the status query now composes the stored item `WhereClause` with the runtime filter, matching the data read (previously the SQL path ignored the stored clause).

3. **Throttle bypass for event-driven checks.** `CheckToSeeIfRefreshNeeded`/`RefreshIfNeeded` accept an optional `bypassMinCheckInterval`; event-driven callers hold positive evidence a member entity was written, and the 30s min-check throttle would otherwise silently drop the second of two permission changes made inside one window.

Permission changes are now enforced by the server that processed them within ~1–2 seconds (one full metadata reload per debounced burst, in the background — requests keep serving the old graph until the atomic swap) instead of not until process restart. Other server instances converge on their periodic tick, which the oracle fix makes genuinely reliable. Connected browsers converge within the client coalescing window — display freshness only; enforcement is server-side either way.
