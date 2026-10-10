---
"@memberjunction/mobile-app": patch
---

The mobile app takes iOS out of the call audio category only when the last open voice call releases the microphone (#5421). The category is shared by the whole app, but each run of the voice screen makes its own realtime runtime and media host, and each releases the microphone on its own. A call abandoned while its microphone was opening releases once the opening returns, which could be after the user had started a newer call, and that release reset the category in the middle of the newer call. `ConfigureVoiceAudioSession` and `ResetVoiceAudioSession` now take the call they are for (the media host passes itself) and count the open calls: the category goes back to normal when the last one releases it, a call counts once however many times it configures or releases, and a release from a call that never set the category, such as one whose microphone permission was refused, does nothing.
