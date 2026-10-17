---
"@memberjunction/ai": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-huggingface": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/ai-agents": minor
---

Grok Voice 3.0 (xAI, released October 14, 2026) in the model catalog, and the Grok Voice features the realtime driver had gated off. The catalog gains **Grok Voice 3.0** (`grok-voice-3.0`, `GrokRealtime`, $0.08/min, prior version Think Fast 2.0); Think Fast 2.0's description notes xAI's deprecation. The model runs on the existing driver; no new API was needed.

The xAI profile now sends `voice` and `turn_detection` at the session top level (Grok Voice's shape, confirmed against the LiveKit, Pipecat and Pydantic AI xAI integrations) and turns on: reasoning effort (`reasoning.effort` `high`/`none`, mapped by `MapEffortLevelToGrokRealtime`), output voices (26 built-in, listed in `XAI_REALTIME_VOICES`, plus custom voice IDs), voice speed (0.7–1.5), `grok-transcribe` user transcription with a `language_hint` and up to 100 `keyterms`, the server-VAD idle timeout, remote MCP tools, and xAI-hosted tools (`web_search`, `x_search`, `file_search`). A hosted tool whose function names an MJ tool already uses is dropped, because xAI fails the turn on that collision. The server and browser drivers handle xAI's streamed caption snapshots (`input_audio_transcription.updated`) as one in-place caption.

Shared OpenAI-protocol changes: profiles gain `audioControlsPlacement`, `supportsIdleTimeout`, `voiceSpeedRange`, `supportsTranscriptionLanguageHint`, `transcriptionKeyterms` and `providerToolReservedNames`; OpenAI gets the idle timeout and `audio.output.speed` (0.25–1.5). `RegisterTools` now re-sends the session's MCP and hosted tools instead of dropping them when it replaces the function tools, and `Reconfigure` re-sends the whole transcription block. New neutral config keys `voiceSpeed`, `transcriptionKeyterms` and `providerTools` (in `realtime.session` and `REALTIME_SHARED_CONFIG_KEYS`, so other drivers scrub them), and `IdleTimeoutMs` on the normalized turn-detection settings.
