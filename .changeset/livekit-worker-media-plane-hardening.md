---
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/livekit-room-server": patch
---

The LiveKit worker media plane is experimental and opt-in, off by default (`MJ_LIVEKIT_WORKER_MEDIA=on|true|1` or `UseWorker: true` enables it) and, when enabled, falls back to the in-process client if the worker cannot start or join. Worker crashes now clear the connected flag at once, restart with bounded exponential backoff (the counter resets only after 60s healthy), refuse to rejoin with an old token, and raise the disconnected callback with a reason when recovery fails. The auto-running worker bootstrap moved to a separate entry that the package index no longer re-exports. Outbound audio is paced by duration against a monotonic clock, the roster is seeded from the room on join and rejoin, telemetry is polled and reports main-thread and worker event-loop p99 separately, and the message protocol is a typed discriminated union. The live benchmark moved into the package and measures two-participant inbound and outbound audio with no hard-coded results.

The README documents it, and moving the model transport into the worker is deferred (plans/realtime/livekit-worker-model-transport.md).
