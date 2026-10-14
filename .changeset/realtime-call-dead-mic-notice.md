---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

A realtime call says when no microphone works, and a pick in the device menu brings the microphone back (#5406). When the microphone in use fails and the fallback to the default fails too, or the last microphone goes away, `Microphone$` now carries a `Failure` (`RealtimeMicrophoneState.Failure`, the controller's reason) until a microphone is on again. `SwitchMicrophone` then opens the picked microphone instead of doing nothing: the runtime follows the controller's current microphone stream, so the driver and the call's recording move to the new stream, which keeps the call's mute and becomes the stream that mute and teardown act on. While the call has no microphone track, `ToggleMute` changes nothing and returns the call's mute instead of `false`. The call overlay shows a warning under the banner while no microphone works (the agent can't hear the user; connect a microphone or choose one from the arrow next to the microphone button, or allow it first when the browser blocked it), and it goes once a microphone is on.
