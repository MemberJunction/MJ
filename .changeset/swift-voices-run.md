---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-ringcentral": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/core": patch
"@memberjunction/global": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/server": patch
"@memberjunction/templates": patch
---

Optimize realtime voice session control/data planes, AI prompt/agent pre-model scaling, and core/server hot paths:

- **Template engine & voice control-plane (`@memberjunction/templates`, `@memberjunction/ai-agents`, `@memberjunction/ai-vertex`, `@memberjunction/server`)**: Preserve compiled Nunjucks templates across warm `TemplateEngineServer.Config(false)` calls (variable analyses still reset on every `Config()`, since they follow embedded templates by name); assemble the session-start memory context once instead of twice in `RealtimeClientSessionService`; share `VertexGoogleAuth` instances across sessions inside `GeminiEnterpriseRealtime.CreateGoogleAuth` keyed by a SHA-256 credential hash (inline service-account keys only; a key file or ADC is re-read per session so a rotated key takes effect); and skip the conversation read in the realtime session-access check for a named owner without a scope, through a new `AuthorizeLoadedSession` beside `AuthorizeSessionAccess` (`LoadSessionConversationScope` still always reads).
- **Realtime session usage accumulation fix (`@memberjunction/ai-agents`)**: Preserve `VideoTokens` and `VideoSeconds` modality detail fields when `RealtimeSessionRunner` merges incremental `RealtimeUsage` updates in `sumModalityDetail`, and compute each direction's modality detail once per update instead of twice.
- **Realtime audio/video data-plane & recording DSP (`@memberjunction/global`, `@memberjunction/ai-agents`, `@memberjunction/ai-bridge-base`, `@memberjunction/ai-bridge-ringcentral`, `@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`)**: Export `IS_LITTLE_ENDIAN` from `@memberjunction/global` and share it across audio/recording codecs; cache mixed timelines across `EncodeWav()` and `GetPeaks()` in `RealtimeRecordingCapture`; evaluate the 65-tap anti-aliasing FIR filter in `StreamingResampler` only at decimated output sample positions; use a 256-entry lookup table in `MuLawToPcm16`; replace the full-buffer concatenation on every `RealtimeRtpSender.Enqueue` call with an $O(1)$ chunk queue; and eliminate redundant per-frame allocations and double `JSON.parse` passes in `FrameSampler`, `Pcm16ToFloat32`, and `RealtimeSessionRuntime`.
- **AI prompt & agent pre-model scaling (`@memberjunction/ai-prompts`, `@memberjunction/ai-agents`)**: Fast-path clean UTF-8 strings in `BuildTemplateDataObjectShape`; use `AIEngine.Instance.PromptModelsByPromptID` via a single `getPromptModelsForPromptId` helper instead of linear `PromptModels.filter()` scans (`@memberjunction/ai-engine-base`: the index now raises the same `PermissionConstrainedError` as `PromptModels` instead of returning an empty map); and fast-path `EscapeRuntimeStateTags` when message text contains no `<` character.
- **Core foundations (`@memberjunction/core`)**: Consolidate `ProviderBase` `DedupLingerMs` expiry timers into a single `WeakRef(this)` + `.unref()` helper.
