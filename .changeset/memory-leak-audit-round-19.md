---
"@memberjunction/ai-ollama": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/core-actions": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-dashboards": patch
---

Memory-leak audit round 19 fixes.

- **Ollama**: a request carrying a cancellation token no longer leaves abort listeners on that (long-lived) token. Each request adds one listener, removed when the call or stream ends, and early stream termination safely invokes `iterator.return()` without masking stream errors.
- **Client tools & Realtime session signals**: `ClientToolRequestManager` session tool definitions are now an LRU with a 6 h idle TTL, capped at 1,000 sessions and 200 tools per session. `RealtimeClientSessionService.combineSignals` now pairs its combined `AbortSignal` with a `Dispose` callback called in `finally` so reused caller signals do not accumulate abort listeners across relayed tool calls.
- **MCP client**: a failed `connect` now closes the transport it created (falling back to `transport.close()` directly if the client has no attached transport), so a stdio server's child process or an SSE/HTTP stream is no longer orphaned.
- **Timers**: `ParallelExecuteAction` and the conversation-naming helper clear their timeout timer when the work finishes first.
- **Dev Tools**: `EventMonitorComponent` and the 7 sibling DevTools `BaseResourceComponent` subclasses call `super.ngOnInit()` / `super.ngOnDestroy()`.
