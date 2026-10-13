---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

Realtime video, where a channel's surface and a camera or screen share take turns on a model's one video stream:

- **The base channel's visual pump counts only the frames the model gets.** When the video source arbiter refuses a frame (another source has the model's only stream, the channel's source is off, or the frame came too soon), the pump no longer records it as the last picture sent, reports no `frame_pushed` event, and sends no "visual confirmation" note after an agent edit, which used to reach the model without its frame. When the arbiter starts sending the channel again (the camera stopped, the user picked the channel, its source was switched back on), the channel sends its current picture even if it has not changed. `ChannelInboundVideoBridge.OnSourceActivated` tells the bridge's owner when that happens, and `VisualPerceptionPump.Refresh` sends the picture.
- **A channel opened mid-call keeps its video track.** A channel on the base class's visual perception that the agent opens during a call now adds the inbound video track it sources (`AddTrack`) when the call has none, as it would have been given at connect. And a camera or screen share that added the track removes it, once stopped, only when the arbiter has no other source: a channel that started sending on it while the capture was on used to lose it right after the model was told it could see that channel.
- **A host can supply the frame sampler.** `IRealtimeMediaHost.CreateFrameSampler` (optional) creates the sampler for each camera or screen share, so a host without a DOM can take frames its own way; a browser host can leave it out and keep the DOM `FrameSampler`. A capture whose sampler cannot start now fails as `unsupported`, with nothing listed and nothing told to the model, where it used to report on and send no frames.
