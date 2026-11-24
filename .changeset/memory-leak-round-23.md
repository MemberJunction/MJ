---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-agent-harness": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-shared": patch
"@memberjunction/server": patch
---

Memory-leak audit Round 23 fixes.

- `ArtifactCollaborationServer` keeps its per-room server watermarks in a bounded `ServerWatermarkStore` (512 rooms, 32M characters of base-version text). Each watermark holds an artifact's full text and none was ever removed, so the server kept the content of every collaboratively edited artifact until restart.
- The artifact suggestion store shared by the document, spreadsheet and slide-deck tool libraries is an `MJLruCache` (500 keys, 2 h TTL) instead of a process-global `Map` that gained a key per artifact and per accepted suggestion.
- `ConversationEngine` caches the details of at most 50 conversations (`MAX_CACHED_CONVERSATION_DETAILS`), least recently used first out. On MJAPI the agent conversation tools filled this process-wide cache with the full history of every conversation they read.
- `BaseResourceComponent` replaces `destroy$` with an already-fired notifier on destroy, so a `takeUntil(this.destroy$)` attached after an `await` in a component that was destroyed meanwhile ends immediately instead of living for the session.
- `DataExplorerDashboardComponent`, `FormBuilderResourceComponent`, `QueryPartComponent`, `ArtifactTypePluginViewerComponent`, and `PdfArtifactViewerComponent` guard post-`await` timers, subscriptions, plugin instantiations, and PDF document/blob-URL resources when destroyed mid-load.
- The MCP server closes Streamable HTTP sessions that idle for 24 hours and keeps at most 1,000, instead of holding an `McpServer` forever for every client that left without an HTTP DELETE. It also sets the transport's `onclose` before `connect()` so the SDK's own close handling runs, and releases a session whose first request fails.
- `CloudDetachedSessionRegistry` is an `MJLruCache` (500 sessions, 24 h TTL) instead of an unbounded `Map`.
