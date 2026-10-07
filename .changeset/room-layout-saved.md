---
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-mj-livekit-room": patch
---

The meeting room's layout is saved per user, for every room. `mj-livekit-room` takes the user's moves and boxes as `TileMoves` and `PipRects` and reports them through `TileMovesChange` and `PipRectsChange` (two-way bindable) as the user moves a tile, moves or resizes a box, or resets the layout; Reset layout now also forgets the boxes' positions, as the realtime call's does. `mj-livekit-agent-room` loads and saves them with the shared `MediaLayoutPrefs`, under `mj.livekit.placement.v1` and `mj.livekit.pip.v1` (`LIVEKIT_PLACEMENT_PREF_KEY`, `LIVEKIT_PIP_PREF_KEY`), in its provider's `UserInfoEngine` once that has loaded and the global one otherwise. The binding gets its first DOM spec.
