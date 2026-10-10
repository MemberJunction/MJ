---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-realtime-channels": patch
"@memberjunction/realtime-runtime": patch
---

The realtime overlay's channel surfaces (whiteboard, remote browser, media, interactive component) move onto one stage over the call, so they are no longer destroyed and recreated. Focus mode fills the stage with the focused surface: before, it removed the surface panel along with the whiteboard, leaving the call empty. Collapsing or hiding the panel and switching tabs now only hide a surface, so a board keeps its view and a stream keeps playing. A surface is created the first time it is shown and kept until its channel leaves the session; focus also ends when its channel leaves.

`ng-realtime-media` adds `mj-media-stage` (`MediaStageComponent` with `MediaStageSurfaceDirective`): it shows each surface filling the stage, over a tab slot it follows as the panel resizes or slides, or out of sight, without moving it in the DOM. In `ng-conversations`, a plugin channel's tab pane keeps a slot (`RealtimeSurfaceTabsComponent.ChannelSlotChange`), `RealtimeSurfaceStageModel` decides which surfaces exist and where, and `mj-realtime-channel-pane` follows a new plugin instance by rebinding. The focus pill's exit now restores the panel even for a channel that does not leave focus itself. The channel contract docs in `realtime-runtime` and `ng-realtime-channels` describe the new surface lifecycle.
