---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The call's orb stands in for the agent's video. The hero's orb becomes a component, `mj-realtime-agent-orb` (the orb, its sound-wave rings, its turn states and its reactions to the overlay's audio meter, sized by `--mj-realtime-orb-size`), and the hero renders it as before. `mj-media-tile` takes content marked `mjMediaTilePlaceholder` in place of the participant's picture or initials. The Avatar channel's surface puts the orb there, so until the agent's video sends its first frame, and after a second without one, the tile shows the orb, sized to the tile and following the agent's turn. A channel's context gains `ConnectionState$` (the call's state), which the Avatar channel passes to its surface.
