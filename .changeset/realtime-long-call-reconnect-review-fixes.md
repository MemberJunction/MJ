---
'@memberjunction/ai': patch
'@memberjunction/ai-realtime-client': patch
'@memberjunction/server': patch
'@memberjunction/realtime-runtime': patch
---

Realtime long-call reconnect review fixes: a failed planned move goes back to live on the old connection until the next boundary; a hung credential refresh no longer ends a recoverable call; the native handle survives a failed refresh; OpenAI/xAI keep the call through a connection loss during a tool call and deliver tool results sent during a reconnect; the response counters reset at a swap; OpenAI Live ignores its first data channel during a move; seed order kept for continued utterances; refresh mints capped on the server; overlapping `CloseSession` calls share one close. A host that closes the session on `pagehide` itself (for example a widget that sends its own close beacon) should set `RealtimeSessionRuntime.ClosesSessionOnPageHide = false`, because the runtime's own page-close beacon would send a second `CloseAgentSession` for the same session.
