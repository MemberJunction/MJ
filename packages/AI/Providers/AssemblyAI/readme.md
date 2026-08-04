# @memberjunction/ai-assemblyai

MemberJunction provider package for **AssemblyAI**, currently exposing the **Voice Agent API**
(launched April 2026) as a realtime, full-duplex, tool-calling model.

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
- `RealtimeSessionParams.Config` passthrough keys: `voice`, `greeting`, `turn_detection`
  (object), `keyterms` (string array)
- `Model` / `APIName` plays no wire role (single endpoint, no model selection) — the metadata
  row uses `voice-agent`

## Docs

- Product: https://www.assemblyai.com/products/voice-agent-api
- API reference: https://www.assemblyai.com/docs/voice-agents/voice-agent-api
- Token endpoint: `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=…`
- Full MJ realtime architecture (topologies, co-agent model, four-provider capability matrix): [guides/REALTIME_CO_AGENTS_GUIDE.md](../../../../guides/REALTIME_CO_AGENTS_GUIDE.md)
