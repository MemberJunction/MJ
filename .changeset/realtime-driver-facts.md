---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-xai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-vertex": patch
"@memberjunction/ai-elevenlabs": patch
"@memberjunction/ai-huggingface": patch
"@memberjunction/ai-assemblyai": patch
"@memberjunction/ai-inworld": patch
"@memberjunction/ai-provider-bundle": patch
---

Every realtime driver now declares static `DriverFacts` (such as `ProviderMaxSessionSeconds`), readable before a session exists. A minted `ClientRealtimeSessionConfig` carries `MaxSessionSeconds`, the effective session cap: the smaller of the driver's provider cap and the host's cap, positive integers only. `PrepareClientSession` passes it through unchanged. The MJAPI relay uses the same cap rule (one shared implementation), so a fractional or invalid cap counts as unset. ElevenLabs sends its native max duration only when the host set a cap; Eleven Realtime reports the same clamped value it puts on the wire.
