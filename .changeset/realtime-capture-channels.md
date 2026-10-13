---
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
---

Two new realtime channels let the agent ask to see the user's camera or screen: **Camera** (`RealtimeCameraChannel`) and **Screen Share** (`RealtimeScreenShareChannel`), with `MJ: AI Agent Channels` rows on the generic `ClientOnlyChannelServer` whose `UIConfig` places their surface in picture-in-picture. Both are opt-in and on demand: the agent opens one with a `reason`, which is the request, and only the user turns the capture on or off. The surface (`mj-realtime-capture-surface`) shows the ask with Turn on camera (or Share your screen) and Not now, then the user's self-view or share preview. The conversations UI brings both channels to its calls (`CONVERSATION_CALL_HOST_CHANNELS`); other hosts get them when their agent or app includes them. A channel's context gains `Captures$`, `StartCapture` and `StopCapture`, so a channel that fronts a capture can follow it and run the user's clicks under the runtime's policy.
