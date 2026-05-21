---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-app": patch
---

Make the floating chat-agents overlay bubble user-draggable (mouse, touch, or pen) so it can be moved out of the way of underlying app buttons it would otherwise occlude. Position persists per-user; the expanded panel anchors to the bubble's location and clamps so the chat interface always stays visible. MJExplorer passes its shell-header height as a top boundary so the bubble cannot be dragged into the header.
