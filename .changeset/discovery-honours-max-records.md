---
"@memberjunction/integration-engine": patch
---

Discovery now honours the `discoveryMaxRecords` setting it already exposed.

`DiscoverFieldsViaFetch` resolves three budgets from per-connection Configuration, falling back to env then a default. Two of them read Configuration. `maxRecords` did not — the read was simply absent from the line:

```ts
timeBudgetMs = opts ?? cfgInt(cfg.discoveryTimeBudgetMs) ?? env ?? default   // wired
batchSize    = opts ?? cfgInt(cfg.discoveryBatchSize)    ?? env ?? default   // wired
maxRecords   = opts ??              (nothing)            ?? env ?? default   // not wired
```

Everything around it worked: `discoveryMaxRecords` is declared in the config type, documented in the comment directly above as a per-connection knob, accepted and persisted by `IntegrationSetSyncConfig`, returned by `IntegrationGetSyncConfig`, and surfaced in the product as a "Max records" settings field. The value saved and was read back correctly — nothing ever used it.

The effect was that the one discovery budget an operator actually wants to lower for a slow source was the only one that could not be changed without an app setting and a process restart, while its two siblings were settable from the UI.

Precedence now matches the other two: explicit opts > per-connection Configuration > operator env > default. No default changed.
