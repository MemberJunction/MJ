# @memberjunction/ai-bridge-slack

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-bridge-base@5.43.0

## 5.42.0

### Patch Changes

- 4b9361b: Add native two-way SDK bindings for all realtime-bridge providers. Each provider package gains a native send-capable SDK binding (the adapter that drives bidirectional audio + host/call controls over a real platform SDK, behind an injectable native-module loader and tested against fake modules). Adds a `BridgeNativeSdkRegistry` (in ai-bridge-base) keyed by `DriverClass` so the engine auto-binds the correct native factory at `StartBridgeSession`, with a per-session `BindSdk` override for choosing a non-default binding (e.g. Zoom RTMS receive-only) or injecting a fake. This is the MJ-side adapter + wiring layer; the platform-specific native media client (e.g. Teams ACS media streaming) and the session-start harness are the remaining work.
- Updated dependencies [9b9b484]
- Updated dependencies [4b9361b]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-bridge-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/ai-bridge-base@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/global@5.41.0
