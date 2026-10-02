---
"@memberjunction/core": patch
---

Stop the per-request `ProviderBase` event-bus subscription leak (backport of f028133b from v6.1.0 to the 5.x line).

`ProviderBase.ensureInflightViewInvalidation()` subscribed to `MJGlobal`'s process-wide event `Subject` once per provider instance and never unsubscribed. `MJServer` mints a fresh provider on every GraphQL request (two on PostgreSQL), so each request that ran a `RunViews` call permanently pinned that provider's object graph, including its metadata arrays, on the bus. Whenever a metadata member entity (for example a Query) was saved, the resulting reload also stranded the previous metadata graph, because the pinned providers still referenced it. On a large tenant this retained hundreds of MB per Skip run and ended in pm2 memory-guard kills.

The subscription is now a single static, per-bus subscription that fans events out to live provider instances through `WeakRef`, so creating providers no longer adds subscribers and short-lived providers become collectable as soon as their request ends. The 5.x metadata-member refresh (`handleMetadataMemberEntityEvent`) is preserved in the fan-out. Adds the upstream regression test, which fails against the previous implementation (21 providers added 22 bus subscriptions) and passes against this one.
