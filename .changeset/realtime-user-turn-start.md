---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

Recorded realtime sessions on drivers that send the user's speech only as one final transcript (OpenAI Realtime, HuggingFace, xAI, ElevenLabs) no longer store `UtteranceStartMs = 0` as a placeholder. `BaseRealtimeClient` gains `OnUserSpeechStart`, raised on every OpenAI-protocol `input_audio_buffer.speech_started` frame, and the realtime runtime relays that onset as the user turn's start. A turn whose start was not measured (for example every ElevenLabs turn after the first) is now stored as NULL instead of 0, and readers fall back to the turn's creation time.
