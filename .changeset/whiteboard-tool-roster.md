---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard: a host-controllable `ToolRoster` that gates the toolbar, the keyboard shortcuts and the canvas context menu together.

`RealtimeWhiteboardHostComponent` gains `@Input() ToolRoster: readonly WhiteboardTool[] | null` (default `null` = all eleven tools, today's rendering). It is threaded to the toolbar (`VisibleTools`, in `Tools` order) and to the board, whose canvas right-click menu offers an "add … here" action only for tools in the roster. The single-letter shortcuts ignore keys for tools outside it, and if the active tool leaves the roster the host moves to the roster's first entry.

Why all three at once: a consumer that hid five toolbar buttons with CSS found the right-click menu still offered "Add widget here" and the `w` key still placed one. A roster that gated only the toolbar would have shipped the same hole as a prop.

Behavior change: none. Every default reproduces today's rendering; `BuildWhiteboardContextMenu(item)` without a roster is unchanged.
