---
"@memberjunction/core": patch
"@memberjunction/redis-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/mobile-app": patch
"@memberjunction/testing-integration": patch
---

Stop serializing the whole metadata graph into a store nothing can read it back from

`ProviderBase.SaveLocalMetadataToStorage()` ran `JSON.stringify` over the entire metadata graph on
every metadata reload, then copied it into a `Blob`, gzipped it, and base64-encoded it one byte at a
time. The snapshot exists so a cold process can start from a cached copy instead of querying — which
only works if the store outlives the writer. On a server with no `REDIS_URL` the store is an
in-process `Map`, so the only possible reader is the heap that already holds the live objects, and
the whole round trip buys nothing.

Measured on a 791-entity tenant: 131.5M characters per stringify, ~10s and ~1.2GB of transient heap
per refresh against a 2.2GB steady state, and the final flatten of that string needs one contiguous
~500MB allocation. Saved queries are metadata members, so an agent writing them marks metadata stale
and triggers a refresh roughly every 30 seconds; two overlapping refreshes exhausted the heap and
MJAPI died with `Reached heap limit Allocation failed` inside `String::SlowFlatten`.

`ILocalStorageProvider` gains an optional `SupportsCrossProcessPersistence`. `ProviderBase` skips
both the save and the load when it is `false`, logging the reason once per process. A provider that
does not declare it is treated as persistent, so Redis and browser behaviour is unchanged — the
conservative direction, since a pointless save only wastes work while wrongly skipping a necessary
one would leave a cache that never populates. Every in-repo provider now declares it, including the
instrumented test wrapper, which delegates to the store it wraps.

`arrayBufferToBase64` / `base64ToArrayBuffer` use Node's native codec when `Buffer` exists, falling
back to the existing loops in the browser. The byte-at-a-time encoder built a rope the size of the
payload and then forced a flatten, measured at 3702ms for an 8.6MB buffer under heap pressure
against 191ms cold.

`TelemetryManager.trimIfNeeded()` only ever trimmed `_events`. Three collections derived from it were
never released for the life of the process: `_insights` grew by one entry per emitted warning,
`_patterns` by one per distinct fingerprint (every new filter combination is a new fingerprint, so it
grew with query variety), and `_insightDedupeWindow` by one per dedupe key. All three are now bound
on the same schedule as the events they come from — `maxInsights` defaults to 1000, and the two map
sweeps are O(n) so they run at most once a minute rather than on every recorded event.

After the equivalent patch on a live tenant: the refresh cycle went from 10019/9372/8994 ms to
330/214/298 ms, heap peak from 3597/3171/3171 MB to 1576/1575/1575 MB, the per-refresh transient
spike from +1.0-1.2 GB to 0, and the retained baseline from 2204 MB to 1575 MB.
