---
"@memberjunction/ng-whiteboard": patch
"@memberjunction/ng-conversations": patch
---

Realtime agents can now inspect, operate and call actions inside live whiteboard HTML widgets, and widget state persists. Three new tools (`Whiteboard_InspectWidget`, `Whiteboard_OperateWidget`, `Whiteboard_CallWidget`) run over a two-way bridge into the sandboxed iframe (the sandbox stays `allow-scripts` only). Widgets can register actions (`MJWhiteboard.onAction`) and save state (`setState`/`onRestore`); widgets that don't get automatic form state, so answers survive re-mounts, page switches, `UpdateContent` and session resume, while undo never rewinds them and they stay out of `ToJSON` (LiveKit sync and artifacts). Widget submit and interaction events carry an optional `Author` (`'agent'` when an agent's command caused them), and the channel no longer reports an agent's own submit back to it as the user's. Access is controlled by the channel config key `widgetAccess` (`full` | `inspect-only` | `off`), `persistWidgetState`, protected subclass hooks (`MaxWidgetAccess`, `ResolveWidgetAccess()`, `OnBeforeWidgetCommand()`), per-widget opt-outs, and exposure (`ReturnsChannelData: 'state'`).

Note for subclasses of `RealtimeWhiteboardChannel`: `ApplyAgentTool` now returns `string | Promise<string>` (board tools stay synchronous; the three widget tools are async). Code that assigns `super.ApplyAgentTool(...)` to a `string` should route `IsWhiteboardWidgetToolName(toolName)` calls straight to `super`; see the Realtime Channels Guide.
