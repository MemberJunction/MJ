---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The avatar's tile says what the agent is doing. `mj-media-tile` gains `Status`, a short status it shows as a chip after its own labels. The Avatar channel's surface sets it from the call's state (Speaking, Thinking, Listening, Connecting, Connection error), and frames the tile with a ring while the agent speaks, which follows the agent's voice where the call overlay meters it. While the avatar presents in the hero, the hero's own name and state line give way to the tile, and the hero's live region keeps the state for screen readers.
