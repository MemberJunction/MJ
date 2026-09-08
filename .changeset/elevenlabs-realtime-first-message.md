---
"@memberjunction/ai": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-assemblyai": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-inworld": minor
"@memberjunction/ai-agents": minor
---

Realtime voice agents can now **speak first**.

Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).

- **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
- **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
- **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.

- **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto *whichever* driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

Drivers without a provider-native opening utterance ignore the key and open silently, as before.
