---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-explorer-service-worker": patch
---

Add cross-tab `SharedWorker` kernel (`SharedTabKernelClient`, `SharedTabKernelHost`, `SharedTabKernelStorageProvider`) multiplexing a single origin `graphql-ws` WebSocket across open tabs for `cacheInvalidation`, per-session `PushStatusUpdates`, generic `Subscribe`, sequence catch-up, and single-flight JWT refresh sync, alongside a shared Worker L1 `RunView`/`RunViews` coalescing cache and single-owner IndexedDB L1 + write deduplication layer with automatic `BroadcastChannel` + Web Locks fallback when `SharedWorker` is unavailable. Wire the worker into `MJExplorer`, update service-worker `ngsw-config.json` and `verify-sw-cache-shape.js` for `worker-*.js` bundles, and add `performance-benchmark.PB22`.
