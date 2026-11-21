---
"@memberjunction/ng-conversations": patch
---

Trim the live voice and avatar call UI: the start-call picker folds co-agent, voice model and voice behind one "Voice and avatar" row; the call header shows the agent and its state, with Details beside the gear and the call details ("This call") inside it; the control bar is one bar at every width (mute with its device menu, camera, captions, More, End) with More as a popup menu; the Channels strip is gone. The call no longer promotes users to the full console after three calls, and the gear no longer offers densities: `ShowDensityPicker`, `ShowChannels`, `DensityChanged`, `SetDensity` and the composer's Details inputs are deprecated and have no effect, and `ResolvedRealtimeUi` drops `showDensityPicker` and `showChannelStrip`.
