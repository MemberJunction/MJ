---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

Speaker mute for realtime voice agents. A new speaker toggle beside the mic mute silences what
the listener hears of the agent without touching the call: the model keeps listening, speaking
and calling tools, `IsAudioPlaying` and the output meter stay honest, and no frame is ever sent
to the provider, so muting can never interrupt the agent (the demo-call control).

- `BaseRealtimeClient.SetOutputMuted` / `IsOutputMuted` (driver obligation #10) with an
  `applyOutputMute` hook implemented by all seven drivers; a mute requested before `Connect`
  sticks. `RealtimePcmPlayback.SetMuted` adds an output gain stage downstream of the meter tap.
- `RealtimeSessionRuntime.SetOutputMuted` / `ToggleOutputMute` / `IsOutputMuted`, per session.
- Composer speaker control in all three dock shapes, focus-pill button, overlay
  `SetOutputMuted` / `ToggleOutputMute`, `(OutputMuteChanged)` output, `ControlInvoked('speaker')`.
