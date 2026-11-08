---
"@memberjunction/ai": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-assemblyai": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-huggingface": minor
"@memberjunction/ai-inworld": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/server": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
---

Generic long-call reconnects, token refresh, and conversation continuity across all realtime voice/video providers (#6460):

- **4-Layer ModelConfiguration & Timing Cascade (`@memberjunction/ai`, `@memberjunction/ai-engine-base`, `@memberjunction/ai-agents`):** Add `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` to `RealtimeConfigurationSettings` (`IAIConfiguration.ts` and `modelConfiguration.ts`), propagate them through `REALTIME_SHARED_CONFIG_KEYS`, `ScrubRealtimeSharedConfigKeys`, `ExtractRealtimeTimingConfig`, `ResolveRealtimeTiming`, and `GetModelCatalogSessionSettings`, and seed realtime models (`Gemini 3.8 Live`, `Gemini 3.8 Live Extended Thinking`, `Gemini 3.1 Flash Live`, `Grok Voice` family, `GPT Realtime` family, `GPT-Live 1`, `ElevenLabs Agents`, `Eleven Realtime`) in `.ai-models.json`.
- **Shared Conversation Memory & Reconnect Controller (`@memberjunction/ai`):** Promote `RealtimeConversationMemory`, `RenderRealtimeMemorySeed`, `RenderRealtimeMemorySeedAsContextNote`, `RenderLateToolResultNote`, `ResumePreamble`, and the unified I/O-free `RealtimeReconnectController` into `@memberjunction/ai` so every server and browser realtime driver shares bounded FIFO turn/tool memory (`MaxSeedChars = 24,000`), soft/hard connection-duration timers, credential refresh scheduling, per-attempt abort signals, native-to-seed fallback, and rapid-reconnect circuit-breaking (`reconnect-loop-breaker`).
- **Server-Side Orchestration, Protected Session Snapshot & Relay Continuity (`@memberjunction/ai`, `@memberjunction/core-entities-server`, `@memberjunction/ai-agents`, `@memberjunction/server`):** Add `CallDurationSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, `TrustsNativeResumption`, proactive timer orchestration, and `ReconnectSession` on `BaseRealtimeModel` / `BaseRealtimeSession`; persist `realtimeMintSnapshot` on `MJ: AI Agent Sessions.Config_` behind `RunWithTrustedSessionConfigWrites` (`PROTECTED_SESSION_CONFIG_KEYS`); add `RealtimeProxyRegistry.Instance.ExtendRelaySession` and timer rescheduling in `RealtimeRelayTunnel` so relayed calls survive past the 30-minute relay lease; wire idle-aware reconnect and pending tool-batch drainage in `RealtimeSessionRunner`; add rate-limited `RefreshRealtimeClientSessionToken` in `RealtimeClientSessionResolver`.
- **Browser Runtime, Client Drivers & Continuous Recording (`@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`):** Add `ApplySessionConfigTiming`, proactive timer arming on `'listening'`, `ScheduleCredentialRefresh`, and `Reconnect(context)` across `BaseRealtimeClient` and all client/server drivers (`Gemini`, `Vertex`, `OpenAI`, `OpenAI Live`, `xAI`, `ElevenLabs`, `Eleven`, `AssemblyAI`, `Inworld`, `HuggingFace`); wire `SetTokenRefreshCallback` in `RealtimeSessionRuntime`; update `RealtimeAudioRecorder.AttachRemoteStream` so WebRTC reconnects rebind replacement remote audio streams into a single continuous recording file without gaps.
