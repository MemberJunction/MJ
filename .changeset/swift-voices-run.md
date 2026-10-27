---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-ringcentral": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/global": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/server": patch
"@memberjunction/templates": patch
---

Optimize realtime voice session control/data planes, AI prompt/agent pre-model scaling, and core/server hot paths:

- **Template engine & voice control-plane (`@memberjunction/templates`, `@memberjunction/ai-agents`, `@memberjunction/ai-vertex`, `@memberjunction/server`)**: Preserve compiled Nunjucks templates and variable analyses across warm `TemplateEngineServer.Config(false)` calls; deduplicate session-start `loadAppAgentSettings` and `assembleMemoryContext` calls in `RealtimeClientSessionService`; share `VertexGoogleAuth` instances across sessions inside `GeminiEnterpriseRealtime.CreateGoogleAuth` keyed by a SHA-256 credential hash; and skip the conversation scope database read inside `LoadSessionConversationScope` for unscoped named users.
- **Realtime session usage accumulation fix (`@memberjunction/ai-agents`)**: Preserve `VideoTokens` and `VideoSeconds` modality detail fields when `RealtimeSessionRunner` merges incremental `RealtimeUsage` updates in `mergeModalityDetail`, and accumulate modality details in place instead of cloning the full usage tree on every frame.
- **Realtime audio/video data-plane & recording DSP (`@memberjunction/global`, `@memberjunction/ai-agents`, `@memberjunction/ai-bridge-base`, `@memberjunction/ai-bridge-ringcentral`, `@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`)**: Export `IS_LITTLE_ENDIAN` from `@memberjunction/global` and share it across audio/recording codecs; cache mixed timelines across `EncodeWav()` and `GetPeaks()` in `RealtimeRecordingCapture`; evaluate the 65-tap anti-aliasing FIR filter in `StreamingResampler` only at decimated output sample positions; use a 256-entry lookup table in `MuLawToPcm16`; replace `Buffer.concat` on every `RealtimeRtpSender.Enqueue` call with an $O(1)$ chunk queue; and eliminate redundant per-frame allocations and double `JSON.parse` passes in `FrameSampler`, `Pcm16ToFloat32`, and `RealtimeSessionRuntime`.
- **AI prompt & agent pre-model scaling (`@memberjunction/ai-prompts`, `@memberjunction/ai-agents`)**: Fast-path clean UTF-8 strings in `BuildTemplateDataObjectShape`; use `AIEngine.Instance.PromptModelsByPromptID` via a single `getPromptModelsForPromptId` helper instead of linear `PromptModels.filter()` scans; and fast-path `EscapeRuntimeStateTags` when message text contains no `<` character.
- **Core & user cache foundations (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**: Maintain `Map` indexes at write time in `UserCache` for $O(1)$ user lookups by ID, email, exact name, lowercase name, and system user; and consolidate `ProviderBase` `DedupLingerMs` expiry timers into a single `WeakRef(this)` + `.unref()` helper.
