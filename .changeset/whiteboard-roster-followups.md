---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard: roster follow-ups — Restyle follows the text tool, an empty roster lands on Select, and the host gains `ReadOnly`.

Four corrections to the `ToolRoster` work, raised in review.

**Restyle… now follows the `text` tool.** It is the one item-menu action that is also a door to a tool: it opens the toolbar's text style flyout, which only exists because the text tool's button renders it. Under a roster without `text` the entry was present and did nothing. The rest of the item menu stays deliberately roster-blind — Edit, Duplicate, z-order and Delete are authoring on what already exists, not tool selection.

**An empty or all-typo roster now clamps the active tool to `select`.** It previously left the current tool alone, on the reasoning that the board must always hold something. It must — but holding the tool the roster just revoked was the one answer that kept a *creating* tool live with no toolbar to see it and no key to change it: `Tool = 'html'` followed by `ToolRoster = []` went on placing widgets. An empty roster still does not make the board read-only.

**`RealtimeWhiteboardHostComponent` gains `@Input() ReadOnly` (default `false`).** The board component has had it all along; the host had no passthrough, so the documented advice to "use `ReadOnly` for that axis" was an `NG8002` for anyone who followed it. The host now binds it to the board and adds the chrome only it owns: no floating toolbar (matching `WhiteboardSnapshotComponent`), no Undo on the agent toast, and a keyboard handler that returns before any key can act — `Escape` included, because "the keyboard does nothing here" is a rule a user can hold and "does nothing except Escape" is one they have to be told. Pan and zoom stay live. `ReadOnly` does not reset `Tool`; the board ignores edits regardless.

The two axes are not substitutes: the roster answers *which tools are offered*, `ReadOnly` answers *whether anything mutates*.

**`ToolRoster` tolerates a non-array and re-clamps on content change.** A static attribute (`ToolRoster="select,pan"`, a plausible slip for the binding) set a string, which reached the roster helpers as an accidental substring matcher and rendered a garbage palette — or threw outright, when the string did not contain the held tool's name and the clamp's `.filter` ran on a `String`. Non-arrays now read as no roster. The kept value is a frozen copy compared by content rather than by identity, which was wrong in both directions: a bound array literal is a new reference every change-detection pass (re-clamping forever, fighting the user for the active tool), and an array mutated in place keeps its reference (never re-clamping, leaving a revoked tool held).

Corrections to the previous release's notes, which described the shipped behaviour of that release accurately and are now superseded: Restyle is no longer "unaffected" by the roster, and an empty roster no longer leaves the current tool in place.

Behavior change: `ReadOnly` defaults to `false` and every roster default still reproduces today's rendering. Consumers already passing a roster that omits `text` lose the Restyle entry on sticky and text items — that entry did nothing for them.
