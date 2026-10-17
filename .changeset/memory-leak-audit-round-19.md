---
"@memberjunction/ai-ollama": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/core-actions": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-dashboards": patch
---

Memory-leak audit round 19 fixes.

- **Ollama**: a request carrying a cancellation token no longer leaves abort listeners on that (long-lived) token. Each request adds one listener, removed when the call or stream ends.
- **Client tools**: `ClientToolRequestManager` session tool definitions are now an LRU with a 6 h idle TTL, capped at 1,000 sessions and 200 tools per session. The map is keyed by a client-supplied session ID, and nothing called `ClearSession`.
- **MCP client**: a failed `connect` now closes the transport it created, so a stdio server's child process or an SSE/HTTP stream is no longer orphaned.
- **Timers**: `ParallelExecuteAction` and the conversation-naming helper clear their timeout timer when the work finishes first.
- **Dev Tools**: `EventMonitorComponent` calls `super.ngOnInit()` / `super.ngOnDestroy()`.
