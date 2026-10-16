---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The conversations UI's calls check the camera before the agent sees it. The first time the user turns the camera on in a call, a card over the call ("Check your camera") shows it mirrored, with the cameras to choose from. "Turn on camera" lets the agent see it; "Not now", the close button or Escape turns it off, and declines the agent's request when it asked. `mj-camera-check` gains `ShowControls`, no heading when `Heading` is empty, and a way out (`CancelLabel`, `Cancelled`); given cameras only and no microphone level, it checks the camera alone.
