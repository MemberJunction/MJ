---
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
---

Adds ElevenLabs' **Eleven Realtime** speech-to-speech models, `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`, as realtime models for voice co-agents, on both the server-bridged and the browser-direct topology.

- **Server driver `ElevenRealtime`** (`@memberjunction/ai-elevenlabs`). Eleven Realtime follows the OpenAI Realtime spec over a WebSocket, so the driver subclasses the shared `OpenAIRealtime` implementation the way the Grok Voice driver does, with its own provider profile. It differs from OpenAI in two places. ElevenLabs takes its API key as `xi-api-key`, not as a bearer token, so client secrets are minted from `/v1/convai/realtime/client_secrets` with that header, and the server-bridged session mints a secret before opening its socket instead of sending the API key on it. And ElevenLabs' turn eagerness is `low` / `medium` / `high`, so MJ's `auto` is sent as `medium`.
- **What the profile turns on**, read from the session ElevenLabs echoes back: MCP tools and an output voice (ElevenLabs voice ids) are on. Reasoning effort and parallel tool calls are off: ElevenLabs accepts both fields but does not keep them, and Max's reasoning is not a session setting. No input-transcription model is sent, because the cascade transcribes the user itself.
- **Browser client `ElevenRealtimeClient`** (`@memberjunction/ai-realtime-client`, provider key `eleven-realtime`): a WebSocket client that authenticates with the minted secret in the `openai-insecure-api-key.` subprotocol, as the `openai` SDK does. It is loaded wherever the other realtime clients are.
- **Catalog** (metadata): **Eleven Realtime v1 Max** and **Eleven Realtime v1 Mini**, each with Eleven Labs as model developer and as inference provider through `ElevenRealtime`. No cost rows: ElevenLabs published no API pricing at launch.
- This is a separate product from the ElevenLabs Agents Platform model (`ElevenLabsRealtime`), which is unchanged; its premade voice list now comes from a shared `ElevenLabsPremadeVoices()`.
