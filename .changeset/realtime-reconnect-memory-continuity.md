---
"@memberjunction/ai": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-assemblyai": minor
"@memberjunction/ai-inworld": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/ai-agents": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
---

Preserve conversation continuity across long-call realtime reconnects and xAI transport drops.

- Separate replaceable ambient state snapshots (`StateKey`, bounded by `MaxStateChars = 4,000`) and wire-only operational status notes (`Ephemeral: true`) from durable spoken turns and tool calls in `RealtimeConversationMemory`, and pin opening user/assistant turns (`MaxPinnedHeadChars = 2,400`) when middle conversation entries must be evicted on ultra-long calls.
- Coalesce and delta-diff live `AppContext$` updates in `ClientContextChannel` via `DiffAppContextSnapshot` (sending compact deltas on the wire while storing only the single latest full screen snapshot under `StateKey: 'app-context'`), and tag interactive channel state snapshots (`BaseRealtimeChannelClient`), video-source transitions (`VideoSourceArbiter`), media-kit summaries (`MediaChannelServer`), and delegation/drop narration (`RealtimeDelegationNarrator`, `RealtimeSessionRunner`) with replaceable `StateKey` or `Ephemeral: true`.
- Default xAI Grok Voice client, server, and model metadata (`Grok Voice`, `Grok Voice Think Fast 2.0`, `Grok Voice 3.0`) to `TrustNativeResumption: false` so every xAI reconnect replays full `RealtimeConversationMemory` instead of relying on lossy `?conversation_id=` resumption; make native-resumption lineage breaks sticky across the session in `RealtimeSessionResumption` and preserve native resumption handles across local offline outages (`IsNetworkOnline`).
- Propagate `RealtimeContextNoteOptions` across all client and server realtime drivers, fixing AssemblyAI mid-reconnect context loss and multi-reconnect `system_prompt` duplication.
