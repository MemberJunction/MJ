---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-agent-harness": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-shared": patch
"@memberjunction/server": patch
---

Memory-leak audit Round 23 fixes.

- `ArtifactCollaborationServer` omits full `BaseVersionText` document bodies from server watermarks whenever a room's working state matches its persisted base version (`Working === Base`), retaining `BaseVersionText` only while uncompacted working-state edits exist and dropping it immediately on compaction — eliminating duplicate multi-MB artifact strings across closed rooms without an arbitrary watermark count cap.
- `ConversationToolManager` loads conversation history fresh per agent run via `ConversationEngine.LoadWindowRowsFresh` (memoized on the per-run manager instance and cleared in `BaseAgent.endRun`), preventing server-side agent runs from populating `ConversationEngine`'s process-global UI detail cache.
- The fallback artifact suggestion store shared by the document, spreadsheet and slide-deck tool libraries deletes superseded ephemeral content-hash keys when standalone suggestions are accepted and expires idle keys after 2 hours without an arbitrary count cap.
- `BaseResourceComponent` replaces `destroy$` with an already-fired notifier on destroy, so a `takeUntil(this.destroy$)` attached after an `await` in a component that was destroyed meanwhile ends immediately instead of living for the session.
- `DataExplorerDashboardComponent`, `FormBuilderResourceComponent`, `QueryPartComponent`, `ArtifactTypePluginViewerComponent`, and `PdfArtifactViewerComponent` guard post-`await` timers, subscriptions, plugin instantiations, and PDF document/blob-URL resources when destroyed mid-load.
- The MCP server closes Streamable HTTP sessions once idle past `mcpServerSettings.sessionIdleTtlMs` (default 24 hours, swept every `sessionSweepIntervalMs`) without evicting active sessions under a hard count cap, sets `transport.onclose` before `connect()` so the SDK's own close handling runs, and releases sessions whose first request fails.
- `CloudDetachedSessionRegistry` clears detached sessions deterministically on terminal turn completion or non-detached `EndSession()` teardown and expires abandoned sessions after their 24-hour idle TTL without an arbitrary count cap.
