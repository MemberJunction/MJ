# @memberjunction/ai-bridge-livekit-native

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-bridge-livekit@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ai-bridge-livekit@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai-bridge-livekit@5.45.1
- @memberjunction/core@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-bridge-livekit@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/ai-bridge-livekit@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-bridge-livekit@5.43.0

## 5.42.0

### Patch Changes

- 08c016c: Add `@memberjunction/ai-bridge-livekit-native` — the real native LiveKit room client that wraps `@livekit/rtc-node` behind the `NativeRoomModule` contract `LiveKitNativeMeetingSdk` expects, giving the agent two-way audio (publish the agent's voice + subscribe to per-participant audio for diarized hearing) in a live LiveKit room. `@livekit/rtc-node` is an optionalDependency loaded lazily, so the package builds/tests with no addon (fake-module tests). Also regenerates the pre-built class-registration manifests to include `LoopbackBridge` from `@memberjunction/ai-bridge-server`.
- Updated dependencies [9b9b484]
- Updated dependencies [8c896c4]
- Updated dependencies [4b9361b]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-bridge-livekit@5.42.0
