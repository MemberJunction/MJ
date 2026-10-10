---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/livekit-room-core": patch
"@memberjunction/ai-realtime-client": patch
---

New package `@memberjunction/ng-realtime-media`: provider-neutral media UI that renders the `/media` models of `@memberjunction/ai-realtime-client`. It holds the participant tile (`mj-media-tile`), the audio meter (`mj-audio-meter`), the agent-state indicator (`mj-agent-state`), the connection overlay (`mj-connection-overlay`) and the device menu (`mj-media-device-menu`), moved out of `ng-livekit-room` so the realtime overlay and the meeting room share one implementation. A tile never plays audio, and text over video stays light in dark mode.

`ng-livekit-room` renders the new components. Each remote voice now plays from a hidden player outside the layouts (`mj-livekit-participant-audio`), so split view and the whiteboard no longer silence participants without a tile. The old `mj-livekit-participant-tile`, `-audio-meter`, `-agent-state`, `-connection-overlay` and `-device-menu` components stay as deprecated wrappers around the new ones, with the same inputs and outputs.

`livekit-room-core` adds `ToMediaParticipant`, `ToMediaDevice` and `ToLiveKitDeviceKind`, which map LiveKit views to the `/media` models (memoized, so a tile never reattaches its video), and exports the meter's `AUDIO_METER_ATTACK` and `AUDIO_METER_DECAY`. The `/media` model gains `MediaAgentState`, `MediaConnectionStatus`, `MediaDisconnectReason`, `MediaConnectionQuality`, `MediaDeviceSelection`, a `speaker` device kind, and the tile's optional participant fields (`PreferredVideo`, `IsMuted`, `ConnectionQuality`, `GetAudioLevel`).
