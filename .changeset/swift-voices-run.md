---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-ringcentral": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/server": patch
"@memberjunction/templates": patch
---

Optimize realtime voice session control/data planes, AI prompt/agent pre-model scaling, and core/server hot paths:

- **Template engine & voice control-plane (`@memberjunction/templates`, `@memberjunction/ai-agents`, `@memberjunction/ai-vertex`, `@memberjunction/server`)**: Preserve compiled Nunjucks templates and variable analyses across warm `TemplateEngineServer.Config(false)` calls; cache active `MJAIPromptRunEntityExtended` instances in `RealtimeClientSessionService` to avoid per-turn SQL reloads and JSON re-parsing; deduplicate session-start `loadAppAgentSettings` and `assembleMemoryContext` calls; share Vertex OAuth token providers and `GoogleGenAI` Live clients per credential key via `GeminiEnterpriseClientCache`; defer `LoadSessionConversationScope` in `LoadOwnedRealtimeSession` to anonymous callers; and add a positive `MJLruCache` to `SessionRunIDVerifier`.
- **Realtime audio/video data-plane & recording DSP (`@memberjunction/ai-agents`, `@memberjunction/ai-gemini`, `@memberjunction/ai`, `@memberjunction/ai-bridge-base`, `@memberjunction/ai-bridge-ringcentral`, `@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`)**: Cache mixed timelines across `EncodeWav()` and `GetPeaks()`, use bulk little-endian buffer copies and parallel track uploads in `RealtimeRecordingController` / `PersistRealtimeRecording`; evaluate the 65-tap anti-aliasing FIR filter in `StreamingResampler` only at decimated output sample positions; use a 256-entry lookup table in `MuLawToPcm16`; replace `Buffer.concat` on every `RealtimeRtpSender.Enqueue` call with an $O(1)$ chunk queue; and eliminate redundant per-frame `Map` allocations and JSON parses in `GeminiLiveRelayPolicy`, `Fmp4Reader`, `FrameSampler`, `Pcm16ToFloat32`, and `RealtimeSessionRuntime`.
- **AI prompt & agent pre-model scaling (`@memberjunction/ai-prompts`, `@memberjunction/ai-agents`)**: Memoize object/array element byte sizes and fast-path clean UTF-8 strings in `BuildTemplateDataObjectShape`; use `AIEngine.Instance.PromptModelsByPromptID` instead of linear `PromptModels.filter()` scans; and WeakMap-memoize `BaseAgent.messageFingerprint` and `EscapeRuntimeStateTagsInMessage` per `ChatMessage`.
- **Core & user cache foundations (`@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/server`)**: Index `UserCache` by ID, email, exact name, lowercase name, and system user for $O(1)$ lookups; WeakMap-memoize `EntityInfo.GetUserPermisions` and `UserExemptFromRowLevelSecurity` per `(EntityInfo, UserInfo)`; filter `load_started`, `load_complete`, and `new_record` entity events synchronously in `ResolverBase`; and use `WeakRef(this)` + `.unref()` on `ProviderBase` `DedupLingerMs` timers.
