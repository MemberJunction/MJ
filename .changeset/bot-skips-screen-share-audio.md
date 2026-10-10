---
"@memberjunction/ai-bridge-livekit-native": patch
---

The meeting bot no longer hears a participant's screen-share audio as their speech. It read every audio track it was subscribed to, so the sound of a tab or screen shared from another LiveKit client reached the model, and the room's transcript, as that person's words. A track whose source is `SOURCE_SCREENSHARE_AUDIO` is now unsubscribed as it arrives, with one log line per participant. Microphones are heard as before, and so are tracks published without a source (`SOURCE_UNKNOWN`, which clients on LiveKit's Rust SDK, rtc-node and Python included, report unless they name one). `RtcNodeModule.TrackSource` gains `SOURCE_SCREENSHARE_AUDIO`; a hand-built module, such as a test fake, must now supply it.
