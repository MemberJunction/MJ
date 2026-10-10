---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

Realtime channels now hear when their surface goes out of sight and comes back, so they can pause work nobody sees. `BaseRealtimeChannelClient.OnSurfaceVisibilityChange(visible)` is a new optional hook (a no-op by default): the host calls it right after `BindSurface` with the surface's current visibility, then on every change. In the realtime overlay a surface is out of sight when the panel is collapsed or hidden, another tab is active, or the call is minimized.

`mj-media-stage` gives each surface's template whether it is on screen (`Visible` in `MediaStageSurfaceContext`), and counts every surface out of sight while the stage itself has no size. `mj-realtime-channel-pane` takes `Visible` and tells its plugin. The remote browser is the first user: its snapshot poll pauses out of sight and polls again at once when shown, while the pushed screencast and the audio keep running.
