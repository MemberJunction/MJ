---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/testing-integration": patch
---

Decouple process-local eviction registry behavior (`ILocalStorageProvider.ProcessLocalRegistry`) from multi-server fleet semantics (`SharedAcrossProcesses`) to fix permanent `[CACHE-SCHEMA-STALE]` IndexedDB cache poisoning in browser sessions using `SharedTabKernelStorageProvider`.

- **`@memberjunction/core`**: Add `readonly ProcessLocalRegistry?: boolean` to `ILocalStorageProvider` and check `SharedAcrossProcesses === true || ProcessLocalRegistry === true` in `LocalCacheManager.registryIsProcessLocalOnly()`, while keeping rolling-deploy schema write-holds (`handleSchemaMismatch` / `mayWriteUnderSchemaHold`) and store-managed TTL deferral (`runEvictionSweep`) gated strictly on `SharedAcrossProcesses === true`.
- **`@memberjunction/graphql-dataprovider`**: Update `SharedTabKernelStorageProvider` to set `ProcessLocalRegistry = true` while the SharedWorker kernel is connected/connecting and delegate `SharedAcrossProcesses` to the fallback provider (`false` for browser IndexedDB), so stale post-migration RunView slots are immediately dropped and replaced on first read+write rather than held for 60 seconds and left poisoned across reloads.
- **`@memberjunction/testing-integration`**: Forward `ProcessLocalRegistry` on `InstrumentedLocalStorageProvider`.
