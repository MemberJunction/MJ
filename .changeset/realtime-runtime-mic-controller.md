---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

A realtime call keeps going when the microphone changes. `IRealtimeMediaHost` gains an optional `CreateLocalMediaController()`, and the browser host returns a `LocalMediaController`. When a host offers one, the runtime starts the microphone through it instead of `AcquireMicrophone`, moves the driver and the recorder onto the new track when the controller swaps one in (a device switch, or a lost headset replaced by the default), and disposes it at teardown. A failed start keeps the `getUserMedia` error names (`NotAllowedError`, `NotFoundError`, …), so hosts that tell a denied microphone apart work unchanged. A start the host abandoned while the microphone was opening now unwinds without reporting an error. `/media` exports the `ILocalMediaController` interface, which `LocalMediaController` implements, so other hosts and tests can supply their own.
