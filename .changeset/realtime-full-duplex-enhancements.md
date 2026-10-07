---
"@memberjunction/ai": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/livekit-room-core": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/telephony-adapters": patch
---

Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:

- **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
- **Coordinator turn-taking tools**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex.
- **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
- **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
- **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`), and speech-to-audio latency logging.
- **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
- **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.
