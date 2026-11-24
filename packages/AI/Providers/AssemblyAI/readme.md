# @memberjunction/ai-assemblyai

MemberJunction provider package for **AssemblyAI**. It has two realtime (voice) drivers:

- **`AssemblyAIVoiceRealtime`**: AssemblyAI's current stack. Use this one.
- **`AssemblyAIRealtime`**: the Voice Agent API, which AssemblyAI no longer offers to new accounts and retires on
  February 1, 2027.

## AssemblyAI voice (`AssemblyAIVoiceRealtime`)

AssemblyAI sells the parts of a voice agent separately and leaves the conversation between them to the caller. This driver
runs that conversation inside MJAPI, so it needs an AssemblyAI API key and nothing to host:

```
browser mic -> MJAPI -> STT 3.7 Realtime Agent -> LLM Gateway -> TTS-1 -> MJAPI -> browser speaker
```

| Concern | How it works |
| --- | --- |
| Protocol | The pipeline (`src/voice/assemblyAIVoicePipeline.ts`) speaks the OpenAI Realtime protocol, so MJ's shared OpenAI-protocol session and browser client drive it |
| Browser sessions | A one-time ticket for MJAPI's realtime proxy, whose upstream is the pipeline in that process. The prompt, tools and key never reach the browser, a browser `session.update` is ignored, and the prompt is not saved on the session row (`ServerHeldConfig`), so only the MJAPI instance that minted a session can reconnect it |
| Server sessions | The shared session over an in-memory connection |
| Turns | STT decides when the user has finished. A turn that ends in a name or a number is held open longer (up to 1.28 s in `balanced`), in case more of it follows |
| Interruption | Words stop the reply; a listening sound ("mm-hm") does not. History keeps what was heard, estimated from when the audio plays |
| Tools | Streamed from the gateway. A result that arrives after the conversation moved on is brought to the end of the history, marked |
| A failed reply | Spoken about once; the next turn works. A lost voice connection is reopened for the next reply |
| Billing | STT by open time, TTS by character, LLM by token. All are closed when the browser leaves, stops answering, or reaches the time limit. `OnUsage` reports LLM tokens only |

- API key: `AI_VENDOR_API_KEY__AssemblyAIVoiceRealtime`
- `Model` / `APIName` names the speech-to-text model (`assemblyai-stt-3-7-realtime-agent`)
- `Config` keys: `voice` (a library voice's slug, or a voice's UUID), `llmModel` (default `gemma-4-31b`; free accounts cannot
  use every gateway model), `keyterms` (the first 100 are used), `firstMessage`,
  `disableAutoResponse`, and the normalized `turnDetection` (`Eagerness`, `SilenceDurationMs`, `Threshold`)
- A long system prompt slows the first words of every reply, because the LLM reads it each turn

## Voice Agent API (`AssemblyAIRealtime`)

## What this package provides

- **`AssemblyAIRealtime`** — a `BaseRealtimeModel` driver (registered via
  `@RegisterClass(BaseRealtimeModel, 'AssemblyAIRealtime')`) for AssemblyAI's single-websocket
  speech-to-speech stack: Universal-3 Pro streaming ASR, server-side turn detection and
  barge-in, LLM reasoning, JSON-Schema tool calling, and conversational TTS.
- **`AssemblyAIRealtimeSession`** — the `IRealtimeSession` implementation backing the
  server-bridged topology.

The matching **browser-direct client driver** (`AssemblyAIRealtimeClient`, ClassFactory key
`'assemblyai'`) ships in `@memberjunction/ai-realtime-client`.

## Provider characteristics

| Concern | How this provider does it |
| --- | --- |
| Endpoint | One websocket: `wss://agents.assemblyai.com/v1/ws?token=…` |
| Session config | Native per-session `session.update` (prompt, tools, voice, turn detection) — no server-side agent object to manage |
| Audio | PCM16 mono **24 kHz**, base64, both directions (fixed — no negotiation) |
| Tool calling | JSON-Schema `function` tools; `tool.call` arguments arrive parsed; `tool.result` takes a JSON **string** |
| Tools mid-session | **Mutable** — `RegisterTools` re-declares natively via `session.update` |
| Narration (`RequestSpokenUpdate`) | **Native** via `reply.create` instructions |
| Context notes (`SendContextNote`) | Emulated via the **mutable `system_prompt`** ("Background updates" section) |
| Typed text (client `SendText`) | Emulated via `reply.create` instructions (no typed-input wire event) |
| Interruption | `reply.done` `status: 'interrupted'` (authoritative); the client driver also flushes on `input.speech.started` while output is active for snappier barge-in |
| Usage events | **None** — flat hourly session billing ($4.50/hr); `OnUsage` never fires |
| Client-direct | Supported — one-time temp token minted via `GET /v1/token` (Bearer API key) |
| Session end | `Close()`/`Disconnect()` send `session.end` first — skipping it leaves a billable 30-second resume hold |

## Configuration

- API key env alias: `AI_VENDOR_API_KEY__AssemblyAIRealtime`
- `RealtimeSessionParams.Config` passthrough keys: `voice`, `firstMessage` (the driver-neutral
  opening utterance; `greeting` is the legacy alias and still honored, with `firstMessage` winning
  when both appear), `turn_detection` (object), `keyterms` (string array)
- `Model` / `APIName` plays no wire role (single endpoint, no model selection) — the metadata
  row uses `voice-agent`

## Docs

- Product: https://www.assemblyai.com/products/voice-agent-api
- API reference: https://www.assemblyai.com/docs/voice-agents/voice-agent-api
- Token endpoint: `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=…`
- Full MJ realtime architecture (topologies, co-agent model, four-provider capability matrix): [guides/REALTIME_CO_AGENTS_GUIDE.md](../../../../guides/REALTIME_CO_AGENTS_GUIDE.md)
