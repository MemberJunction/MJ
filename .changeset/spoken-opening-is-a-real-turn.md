---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

A host's spoken opening is now part of the conversation record (MJ#4591). `RequestSpokenOpening` used to ride the delegation-narration channel (`RequestSpokenUpdate`), whose replies are disposable by contract: never captioned, never relayed, never saved, so the greeting a participant heard was missing from the transcript. The realtime contract gains an optional `RequestSpokenTurn(instructions)` beside `RequestSpokenUpdate`: the same wire mechanics and collision rule in each driver, with the reply tagged `normal`. The Gemini (and Gemini Enterprise), ElevenLabs, AssemblyAI, OpenAI Live and OpenAI Realtime protocol drivers (`OpenAIRealtimeClient` and its WebSocket variant) implement it through the one send helper their spoken update already uses, so the two cannot drift; the runtime's `RequestSpokenOpening` prefers it and falls back to the spoken update on a driver that has not implemented it. Separately, the ElevenLabs driver now resets its response kind when a user turn arrives (MJ#6025): the platform does not always send `agent_response_complete` after a narration response, and without the reset every later agent turn in the call was tagged narration and dropped from the transcript.
