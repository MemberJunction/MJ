---
"@memberjunction/livekit-room-server": patch
---

`RoomAudioHandle` gains `Ended: Promise<RoomAudioEndReason>` and `EndReason`, so callers can tell a clip that played in full (`'Completed'`) from one that was stopped, failed, or disconnected — e.g. start a call recording only after the recording disclosure has been heard. A non-looping playback now waits for the audio already sent ahead of real time to play out before its bot leaves, so the clip's tail is no longer cut off.
