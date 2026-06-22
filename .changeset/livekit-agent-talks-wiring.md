---
"@memberjunction/ai-agents": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/server": patch
---

Wire the realtime-session factory so a LiveKit-bridged agent actually talks. Adds `BaseAgent.StartBridgeRealtimeSession()` — opens a raw `IRealtimeSession` for the agent (reusing the same model resolution + system-prompt/memory assembly as the client-direct realtime path, minus the RealtimeSessionRunner since the bridge engine owns turn-taking) — and `CreateBridgeRealtimeSession`, the provider-agnostic factory that resolves the agent + instantiates its `BaseAgent` and calls it. `RealtimeBridgeResolver` binds the factory onto `LiveKitAgentRoomCoordinator` at module load. The coordinator now threads `NativeModuleSpecifier` (default `@memberjunction/ai-bridge-livekit-native`, overridable via `LIVEKIT_NATIVE_MODULE` env / `SetNativeModuleSpecifier`) into the bridge session Configuration so the native room client loads. Completes the agent-talking path for the LiveKit bridge.
