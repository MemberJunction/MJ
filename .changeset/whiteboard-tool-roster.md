---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard: a host-controllable `ToolRoster` that gates the toolbar, the keyboard shortcuts and the canvas context menu together.

`RealtimeWhiteboardHostComponent` gains `@Input() ToolRoster: readonly WhiteboardTool[] | null` (default `null` = all eleven tools, today's rendering). It governs which tools are AVAILABLE, and closes every door to a tool it leaves out: the toolbar button, the single-letter shortcut, and the canvas right-click "add … here" action.

The invariant is enforced where the tool is written rather than at each place it is read: the host's `Tool` is a setter that ignores a disallowed write, so a shortcut or gesture added later cannot reintroduce a hole by forgetting a guard. If the tool you are holding leaves the roster, the host moves to `select`, or to the roster's first known entry when `select` is not on it — never to whatever the host happened to list first.

The roster is deliberately NOT a content policy. It does not restrict what already exists on the board, what the agent places, or authoring actions on existing items: Restyle, Duplicate and pasting an image are unaffected. Read-only is a separate axis and a separate input.

Why all three at once: a consumer that hid five toolbar buttons with CSS found the right-click menu still offered "Add widget here" and the `w` key still placed one. A roster that gated only the toolbar would have shipped the same hole as a prop.

Behavior change: none. Every default reproduces today's rendering; `BuildWhiteboardContextMenu(item)` without a roster is unchanged.
