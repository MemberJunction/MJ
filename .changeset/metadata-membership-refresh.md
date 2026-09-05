---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
---

Event-driven metadata refresh from dataset membership, and an authoritative dataset-status oracle.

**The problem.** A server process never refreshed its own in-memory metadata after a permission-bearing save it itself processed: the only trigger was the periodic `RefreshIfNeeded()` poller, and its staleness check (`GetDatasetStatusByName` Phase 1) derived each MJ_Metadata item's "remote" timestamp from the server's **own cached dataset slots** — a closed loop. A tightened field-security rule was therefore not enforced over the wire until process restart. On the client, the equivalent refresh hung off a hardcoded entity-name list.

**The fix, in three parts:**

1. **Dataset-membership-driven refresh (`ProviderBase`).** When a provider loads the MJ_Metadata dataset, it records which entities compose it (`registerMetadataDatasetMembership`; persisted beside the metadata snapshot for warm boots). The existing static write-invalidation fan-out now also routes save/delete/remote-invalidate events to `handleMetadataMemberEntityEvent`: a write to any member entity schedules a debounced (500ms, burst-coalescing) refresh of the provider that owns that metadata, gated by a fail-open backend-identity check for multi-provider processes. Membership is the dataset definition itself — adding a `DatasetItem` row extends coverage with no code change, and no entity names are hardcoded anywhere. The refresh policy is overridable (`RefreshAfterMetadataMemberChange`): database providers hard-`Refresh()` (the writer must not trust any cache for the re-read); `GraphQLDataProvider` overrides with a staleness check so browsers only re-pull the graph when genuinely stale.

2. **The staleness oracle is authoritative.** `GetDatasetStatusByName` no longer derives status from cached dataset slots — status is always the batched SQL MAX/COUNT per item (the cache remains fully in play for the *data* reads in `GetDatasetByName`), and the status query now composes the stored item `WhereClause` with the runtime filter, matching the data read (previously the SQL path ignored the stored clause).

3. **Throttle bypass for event-driven checks.** `CheckToSeeIfRefreshNeeded`/`RefreshIfNeeded` accept an optional `bypassMinCheckInterval`; event-driven callers hold positive evidence a member entity was written, and the 30s min-check throttle would otherwise silently drop the second of two permission changes made inside one window.

Permission changes now propagate in ~1–2 seconds (one full metadata reload per debounced burst, in the background — requests keep serving the old graph until the atomic swap) instead of "never until restart" on the server and "hardcoded list" on the client.
