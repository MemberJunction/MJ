# @memberjunction/mobile-app

## 5.51.4

### Patch Changes

- 3e25fab: Stop serializing the whole metadata graph into a store nothing can read it back from

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

- Updated dependencies [4349a70]
- Updated dependencies [4fe6b23]
- Updated dependencies [ecb32fd]
- Updated dependencies [5326958]
- Updated dependencies [3e25fab]
- Updated dependencies [6901aaa]
- Updated dependencies [c3ab75e]
- Updated dependencies [75e94d7]
- Updated dependencies [612f08e]
- Updated dependencies [05a3b17]
- Updated dependencies [bd01671]
- Updated dependencies [e9a5530]
- Updated dependencies [3fa4b09]
- Updated dependencies [f324af2]
  - @memberjunction/core@5.51.4
  - @memberjunction/core-entities@5.51.4
  - @memberjunction/ai-realtime-client@5.51.4
  - @memberjunction/graphql-dataprovider@5.51.4
  - @memberjunction/global@5.51.4
  - @memberjunction/react-runtime@5.51.4
  - @memberjunction/ai@5.51.4
  - @memberjunction/markdown-core@5.51.4

## 5.51.3

### Patch Changes

- Updated dependencies [391fa16]
- Updated dependencies [ca2021c]
- Updated dependencies [ebe2f88]
- Updated dependencies [849fea1]
  - @memberjunction/core@5.51.3
  - @memberjunction/global@5.51.3
  - @memberjunction/graphql-dataprovider@5.51.3
  - @memberjunction/core-entities@5.51.3
  - @memberjunction/react-runtime@5.51.3
  - @memberjunction/ai@5.51.3
  - @memberjunction/ai-realtime-client@5.51.3
  - @memberjunction/markdown-core@5.51.3

## 5.51.2

### Patch Changes

- Updated dependencies [f560edc]
- Updated dependencies [0130b53]
  - @memberjunction/global@5.51.2
  - @memberjunction/core@5.51.2
  - @memberjunction/core-entities@5.51.2
  - @memberjunction/ai@5.51.2
  - @memberjunction/ai-realtime-client@5.51.2
  - @memberjunction/graphql-dataprovider@5.51.2
  - @memberjunction/react-runtime@5.51.2
  - @memberjunction/markdown-core@5.51.2

## 5.51.1

### Patch Changes

- Updated dependencies [cc6f321]
- Updated dependencies [e10a71f]
  - @memberjunction/global@5.51.1
  - @memberjunction/core@5.51.1
  - @memberjunction/ai@5.51.1
  - @memberjunction/ai-realtime-client@5.51.1
  - @memberjunction/graphql-dataprovider@5.51.1
  - @memberjunction/core-entities@5.51.1
  - @memberjunction/react-runtime@5.51.1
  - @memberjunction/markdown-core@5.51.1

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/react-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/markdown-core@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/react-runtime@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/markdown-core@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/react-runtime@5.49.0
  - @memberjunction/markdown-core@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [a101255]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/markdown-core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/react-runtime@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/react-runtime@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0
  - @memberjunction/global@5.47.0
  - @memberjunction/markdown-core@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/react-runtime@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/markdown-core@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/react-runtime@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/ai-realtime-client@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/markdown-core@5.45.1

## 5.45.0

### Patch Changes

- 1c4e0bb: Add repository.url to MobileApp package.json to satisfy the validate-package-repository CI gate, which was failing on every PR since the package landed without it
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/react-runtime@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0
  - @memberjunction/markdown-core@5.45.0
