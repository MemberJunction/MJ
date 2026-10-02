---
"@memberjunction/ai": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ai-gemini": patch
---

fix(ai-realtime): OpenAI Live planning model fallback, tool barrier synchronization, and remote video bridge

- **OpenAI Live Default Planning Model**: Exported `DEFAULT_OPENAI_LIVE_PLANNING_MODEL = 'gpt-5.6-terra'` and warned with `console.warn` whenever `Reasoning.Remote.Ref` is undefined instead of falling back to legacy `gpt-4o`.
- **Delegation Policy & Tool Framing**: Added `CompileBrowserDelegationPolicy` which omits the spoken holding phrase clause for browser-direct sessions. Guarded against appending delegation policy instructions when the session prompt already contains tool framing or interactive-surface execution rules.
- **SendText Barrier Guard**: Prevented premature `response.create` emissions during `SendText` when background tool batches are in-flight (`!this.toolBatchBarrier.IsEmpty`). The creation is safely deferred until the tool batch completes via `SendToolResult`.
- **Dedupe & Tool Barrier Lifetimes**: Maintained tool deduplication (`emittedToolCallIds`) throughout the lifetime of active tool batches, preventing duplicate execution from redelivered events when `response.completed` arrives before tool outputs. Cleared deduplication state upon batch completion and barrier timeout flushes.
- **Remote Browser Video Bridge**: Wired `ChannelInboundVideoBridge` with client-getter support and hooked `OnSessionStarted` into active channels after WebRTC track negotiation so screencast frames stream reliably to the live model.
- **Full-Duplex Barge-in Unblock**: Removed premature state gate in `GeminiRealtimeClient.sendMicChunk` so mic streaming and barge-in remain uninterrupted while the model is speaking or in extended thinking.
- **Track Descriptors**: Added `Required?: boolean` to `RealtimeTrackDescriptor` so optional and channel-sourced media tracks are cleanly negotiated without breaking the session.
