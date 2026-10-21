---
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/server": patch
---

Fixes the Meet "could not load the native LiveKit room module at '@memberjunction/ai-bridge-livekit-native'" failure: `@memberjunction/ai-bridge-livekit` now keeps a process-wide registry of native room modules (`RegisterNativeRoomModule`) that `DefaultNativeLoader` checks before falling back to `import()`, and `@memberjunction/livekit-room-server`, which declares the native wrapper, registers it at load (no dependency cycle). `LIVEKIT_NATIVE_MODULE` overrides still go through `import()`. The native room client's `onDisconnected` callback now receives the LiveKit disconnect reason. The handoff offer registry no longer logs "User not found in metadata and no contextUser" every 15 seconds: the server now supplies the system user lazily, and queries are skipped (in-memory expiry still runs) when no user is available.
