---
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-livekit-native": patch
---

The meeting bot's only video out is the agent's avatar. The native room client's `publishVideo` and `publishScreen` no-ops are removed, from `LiveKitRtcNodeRoomClient`, `LiveKitWorkerRoomClient`, the media worker protocol (`MediaWorkerCommand`) and session, and the `NativeRoomClient` interface; `ILiveKitRoomSdk` and `LiveKitNativeMeetingSdk` lose `publishVideoFrame` and `publishScreenFrame`, which only forwarded to them. `LiveKitBridge.SendMedia` sends `video/mp4` frames on `video-out` to the avatar publisher as before, and drops any other `video-out` frame and every `screen-out` frame, logging the first of each per session when the provider allows that track.
