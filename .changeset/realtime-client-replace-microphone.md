---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

Realtime drivers can follow a replaced microphone track mid-call. `BaseRealtimeClient` gains the optional `ReplaceMicrophone(micStream)` (driver obligation #10), and every browser driver implements it: the OpenAI WebRTC drivers move their senders with `replaceTrack`, and the PCM-capture drivers (Gemini, ElevenLabs, AssemblyAI, xAI, Hugging Face) rebind the shared capture through the new `IPcmMicCapture.Rebind`. Each rebuilds its input meter on the new track. `IRealtimePeerConnection.addTrack` now returns the sender (`IRealtimeRtpSender`), as the platform API does. `LocalMediaController` keeps a muted microphone muted across a device switch or a lost device. The session recorder gains an optional `ReplaceMicrophone` on `IRealtimeSessionRecorder`, implemented by the browser recorder. The runtime starts calling these when its microphone moves onto the controller.
