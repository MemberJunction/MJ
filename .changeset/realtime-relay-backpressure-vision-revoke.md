---
"@memberjunction/server": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-realtime-media": patch
---

The realtime relay caps what it holds while the upstream opens at 8 MiB as well as 512 frames, and closes a tunnel whose upstream stops reading once 16 MiB is queued for it (1013 to the browser, 1001 upstream), as it already did for a browser that falls behind (#5499).

Withdrawing agent vision (`SetLiveKitAgentVision` with `Allow: false`) no longer goes through room authorization, so a cancelled meeting or a failed lookup cannot keep an agent watching (#5500).

The mint fallback for a server without the relay fields matches `field "RelayUrl"`, not any message that names RelayUrl.

The agent-vision button says what the consent covers: in a room with more than one agent, every agent in the room. Its label there reads "Let agents see me" / "Hide from agents" and its name "Let agents in this room see your camera and screen"; with one agent, "Let the agent see me" / "Hide from the agent" and "Let the agent see your camera and screen". A failure says "Couldn't change what agents see" (#5502).
