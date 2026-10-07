---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ai": patch
---

Fix (#5153): realtime voice-session recordings on PCM-playback drivers (Gemini Live, ElevenLabs Agents, AssemblyAI, xAI Grok Voice, HuggingFace) contained only the participant's microphone — the agent's turns were digital silence — because the agent audio played through `RealtimePcmPlayback`'s own AudioContext straight to the speakers and was never exposed as a stream the recorder could mix.

ai-realtime-client: `RealtimePcmPlayback` now also feeds its master gain into a `MediaStreamAudioDestinationNode` exposed by `GetOutputStream()`; every PCM driver publishes it through `GetRemoteMediaStream()` / `OnRemoteMediaStream()`. The remote-stream slot (stream + subscribers + isolated fan-out + per-session reset) moved into `BaseRealtimeClient`, replacing two copies in the OpenAI WebRTC drivers; both methods are now concrete on the base (returning `null` / never firing when a driver has no agent-audio plane), so `?.` call sites keep working.

ng-conversations: `RealtimeAudioRecorder` keeps recording mic-only (with a warning) when the agent stream cannot be connected — e.g. a browser that refuses a cross-sample-rate MediaStream source — instead of losing the whole recording. It also closes its AudioContext, and wires no microphone, when the call ends while the recorder is still starting (the context is resuming or the capture worklet is loading); before, that context was left open.

ai: `RealtimeDiagLog` no longer throws `ReferenceError: process is not defined` in the browser. Gemini Live's transport close and error handlers call it first, so an abnormal provider close or a transport error used to throw before the fatal error was emitted, leaving the call stuck in 'listening'. It now returns silently when there is no `process` (diagnostics stay off), and the handlers surface the error.
