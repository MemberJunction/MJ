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

The agent-vision button says what the consent covers: every agent in the room. Its label reads "Let agents see me" / "Hide from agents", its name "Let agents in this room see your camera and screen", and a failure "Couldn't change what agents see" (#5502).
