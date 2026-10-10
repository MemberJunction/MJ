---
"@memberjunction/realtime-runtime": patch
---

The realtime runtime carries the agent's video (an avatar) to the host and to channels. `AgentVideo$` (new) holds the video the driver hands over through `OnRemoteVideo`, a live stream or a player that owns the `<video>` element, until the call ends; a newer one replaces it, and a late frame from an ended call is ignored. Channels get it as `AgentVideo$` on their context. The tracks a channel sinks (`GetSunkTracks`) are now requested when the session connects, next to the tracks it sources, so a driver establishes outbound video when the model sends it (and reports it unsupported when it does not). A channel that sinks outbound video counts as used once the agent's video arrives, so the host shows its surface.
