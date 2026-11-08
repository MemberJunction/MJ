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
"@memberjunction/ai-bridge-zoom": patch
---

Generic long-call reconnects, token refresh, and conversation continuity across all realtime voice/video providers (#6460):

- **4-Layer ModelConfiguration & Timing Cascade (`@memberjunction/ai`, `@memberjunction/ai-engine-base`, `@memberjunction/ai-agents`):** Add `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` to `RealtimeConfigurationSettings` (`IAIConfiguration.ts` and `modelConfiguration.ts`), propagate them through `REALTIME_SHARED_CONFIG_KEYS` and `GetModelCatalogSessionSettings`, and seed realtime models (`Gemini 3.8 Live`, `Gemini 3.8 Live Extended Thinking`, `Gemini 3.1 Flash Live`, `Grok Voice` family, `GPT Realtime` family, `GPT-Live 1`, `ElevenLabs Agents`, `Eleven Realtime`) in `.ai-models.json`.
- **Shared Conversation Memory (`@memberjunction/ai`):** Promote `RealtimeConversationMemory`, `RenderRealtimeMemorySeed`, `RenderRealtimeMemorySeedAsContextNote`, and `ResumePreamble` into `@memberjunction/ai` so every server and browser realtime driver shares bounded FIFO turn/tool memory with bracket-escaped prompt-injection defense.
- **Server-Side Orchestration & Relay Continuity (`@memberjunction/ai`, `@memberjunction/ai-agents`, `@memberjunction/server`):** Add `CallDurationSeconds`, `ReconnectBufferSeconds`, `TrustsNativeResumption`, proactive timer orchestration, and `ReconnectSession` on `BaseRealtimeModel` / `BaseRealtimeSession`; add `RealtimeProxyRegistry.Instance.ExtendRelaySession` and timer reset in `RealtimeRelayTunnel` so relayed calls survive past the 30-minute relay lease; wire idle-aware reconnect and pending tool-batch drainage in `RealtimeSessionRunner`; enforce server-authoritative `ClampCallDeadlineMs` and `RefreshRealtimeClientSession` token minting in `RealtimeClientSessionResolver`.
- **Browser Runtime, Client Drivers & Continuous Recording (`@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`):** Add `ApplySessionConfigTiming`, proactive timer arming on `'listening'`, `Reconnect(context)`, and `SetVoice` across `BaseRealtimeClient` and all client/server drivers (`Gemini`, `Vertex`, `OpenAI`, `OpenAI Live`, `xAI`, `ElevenLabs`, `Eleven`, `AssemblyAI`, `Inworld`, `HuggingFace`); add `RefreshToken` orchestration and `AudioOutTrackReplaced` hot-swapping in `RealtimeSessionRuntime`; add `ReplaceAssistantTrack(newTrack)` on `RealtimeAudioRecorderService` so reconnects produce a single continuous recording artifact without gaps.
