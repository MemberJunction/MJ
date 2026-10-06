---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

A realtime session's camera and screen share now follow the channel that fronts each of them (a channel whose new `CaptureKind` is `camera` or `screen`). `StartCamera` and `StartScreenShare` refuse, with the new `policy` failure and a message for the user, when that channel is not in the call or the server's policy keeps pixels from the agent (the agent's configuration, a zero-data-retention rule); nothing is opened or added first. An on-demand channel is opened when its capture starts, and an open one counts as used, so the host shows its surface. The capture's video source belongs to the channel: the user's "agent can see" choice for it hides the frames from the agent without stopping the capture. `VideoSourceArbiter.RegisterSource` takes `Enabled`, so such a source can register hidden without the model being told about it.
