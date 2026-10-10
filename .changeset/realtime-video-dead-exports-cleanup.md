---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ai-agents": patch
"@memberjunction/livekit-room-core": patch
---

A channel's frames sent through its context's `SendVideoFrame` (`RealtimeChannelContext`, `@memberjunction/realtime-runtime`) now go through the session's `VideoSourceArbiter` as the channel's own source, under the id its frame bridge uses (`<channel key>#<instance>`): they reach the model only while the arbiter picks that source, the model is told when it switches, and nothing is sent while the channel's exposure is below pixels. Before, they went straight to the model. The member is deprecated in favour of `ChannelInboundVideoBridge`; the context's `Client` still writes past the arbiter, as does the runtime's own `SendVideoFrame`, whose TSDoc now says so.

Deprecated, with nothing reading them: `RealtimeVideoConfig.provider` and `providers` (`@memberjunction/ai-agents`). The model is chosen with `realtime.modelPreference`, or with `realtime.video.enabled` the first model that shows an avatar; an avatar's settings are its persona binding's `VendorSettings.Avatar`. A session whose configuration sets either key logs one line per agent naming them, and `FindDeprecatedRealtimeVideoKeys` reports them as data. The TSDoc of `enabled` and `avatarId` now says what they do: `enabled` asks for an avatar and does not start the camera, and `avatarId` names one of the model's Video persona bindings.

Also deprecated: `BaseRealtimeModel.SupportsVideo` (`@memberjunction/ai`), which no driver overrides and nothing reads (video is declared by `Capabilities.SupportedInboundTracks` / `SupportedOutboundTracks` and `SupportsAvatarOutput`); `LiveKitAudioMeter` and `LiveKitAudioMeterFrame` (`@memberjunction/livekit-room-core`) in favour of `AudioLevelSmoother`, which gives the same frames with the room's settings (the `AUDIO_METER_*` constants stay); and `CreateCameraCapture` (`@memberjunction/ai-realtime-client`) in favour of `LocalMediaController` and `FrameSampler`.

Removed, since no release shipped it: `ToScreenShareCaptureOptions` from `@memberjunction/livekit-room-core`.
