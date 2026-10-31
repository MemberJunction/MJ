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

Every realtime driver now declares static `DriverFacts` (such as `ProviderMaxSessionSeconds`), readable before a session exists. A minted `ClientRealtimeSessionConfig` carries `MaxSessionSeconds`, the effective session cap: the smaller of the driver's provider cap and the host's cap, positive integers only. `PrepareClientSession` passes it through unchanged. The MJAPI relay uses the same cap rule (one shared implementation), so a fractional or invalid cap counts as unset. ElevenLabs Agents sends its native max duration only when the host set a cap, and reports `MaxSessionSeconds` only then (without a host cap the agent keeps its own setting, 600 s on a new agent, which the driver does not know); Eleven Realtime reports the same clamped value it puts on the wire. Gemini client-direct sessions now reach their 30-minute cap: Gemini ends a Live connection after about 10 minutes and counts the browser's resume as a new session, so the minted token now opens one connection per 10 minutes of the session cap plus 3 for resumes, until the cap plus 60 s (at most 6 connections and 30 minutes); it was single-use with a 10-minute window, so the first resume was refused and the call ended at about 10 minutes. A shorter host cap gives a shorter-lived token, so the browser's credential never outlasts the session's deadline.
