---
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

feat(ai): Gemini Live direct tools support, prompt framing alignment, and change-driven remote browser screencast deduplication

- Declared `SupportsDynamicToolSet = true` on `GeminiRealtime` and its session capabilities so target agent direct action tools are projected into Gemini Live sessions.
- Fixed `hasDirectTools` calculation in `RealtimeClientSessionService` to consider `input.ExtraTools` (whiteboard, browser, media, context tools), ensuring interactive surface tools prevent the negative "do not attempt to do the work yourself" prompt guidance.
- Implemented change-driven screencast frame deduplication in `RemoteBrowserChannel` with a 15-second heartbeat, preserving ~15k tokens/min on static pages while maintaining instant visual push on user interactions.
- Reworded `ResolveGeminiThinkingLevel` fallback warning and added `CompileBrowserDelegationPolicy` doc clarification per PR review feedback.
- Added Node < 23 `CloseEvent` compatibility polyfills in `ai-realtime-client` test suites.
