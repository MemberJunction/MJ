# @memberjunction/ai-huggingface

Self-hosted **HuggingFace speech-to-speech** realtime (voice) driver for MemberJunction — a `BaseRealtimeModel` implementation that lets an on-prem, OpenAI-Realtime-compatible voice pipeline sit side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with **no host changes**.

## What it is

[HuggingFace's speech-to-speech stack](https://github.com/huggingface/speech-to-speech) is an open-source, cascaded **VAD → STT → LLM → TTS** pipeline (Silero VAD, Parakeet/Whisper ASR, any OpenAI-compatible or local LLM, Qwen3-TTS/Kokoro/ChatTTS) that can expose an **OpenAI-Realtime-compatible `/v1/realtime` websocket**. This package treats that endpoint as a MemberJunction `Realtime` model.

Why it's a differentiated 5th provider: it is **private-by-design** (audio never leaves infrastructure you own), **cost-free** (no per-minute cloud billing), and **component-swappable** (choose your own ASR/LLM/TTS). Ideal for regulated / air-gapped deployments.

## How it reaches the browser — the MJAPI realtime proxy

Because the endpoint is self-hosted, "client-direct" would otherwise require exposing the internal box to browsers. Instead, this driver uses **MJAPI's realtime proxy**:

1. `CreateClientSession` mints a one-time **proxy ticket** (in the shared `RealtimeProxyRegistry` in `@memberjunction/ai`) pointing at the internal endpoint, and returns `EphemeralToken = wss://<mjapi-public>/realtime-proxy?ticket=…`.
2. The browser (`HuggingFaceRealtimeClient`, `@memberjunction/ai-realtime-client`, provider key `'huggingface'`) connects to that URL.
3. MJAPI's `RealtimeProxyServer` consumes the ticket, opens the authenticated upstream leg (injecting any auth **server-side**), and pumps frames transparently.

The internal endpoint + auth **never reach the browser**, and the box needs **no browser-facing ingress** — MJAPI stays the single ingress point. The overhead is one internal relay hop (negligible when co-located).

`StartSession` (server-bridged topology) connects directly to the endpoint, no proxy.

## Configuration

All deployment config — no `mj.config.cjs` changes required:

| Setting | Source | Default |
|---|---|---|
| Upstream endpoint | `params.Config.endpoint` → `HUGGINGFACE_REALTIME_URL` env | `ws://localhost:8000/v1/realtime` |
| Upstream auth | `AI_VENDOR_API_KEY__HuggingFaceRealtime` env | none (sentinels `none`/`self-hosted`/`local`/`n/a` ⇒ unauthenticated) |
| Browser proxy origin | `params.Config.proxyBaseUrl` → `MJAPI_PUBLIC_URL` → `GRAPHQL_BASE_URL`+`GRAPHQL_PORT` | `http://localhost:4000` |
| PCM sample rate | `params.Config.sampleRate` | 24000 (HuggingFace's cascade is natively 16 kHz — override if needed) |

> The realtime resolver requires a *resolvable* API key for a model to be selectable, so a keyless endpoint should set `AI_VENDOR_API_KEY__HuggingFaceRealtime=none`.

## Metadata

Seeded as the `HuggingFace Speech-to-Speech` model (`MJ: AI Models`, type `Realtime`) under the `Hugging Face` vendor, `DriverClass: HuggingFaceRealtime`. Its `PowerRank` is intentionally low so it is **opt-in**, never the default realtime provider.

## Capability notes

- **Transcripts**: both roles (the pipeline's STT stage transcribes the user).
- **`SendContextNote` / `RequestSpokenUpdate`**: native (system-role item / `response.create`).
- **`OnUsage`**: best-effort — fires only if the compat endpoint reports a `response.done` usage block (self-hosted has no billing meter).
- **Tools**: native OpenAI function tools, so `invoke-target-agent` delegation works.

See the [Real-Time Co-Agents Guide](../../../../guides/REALTIME_CO_AGENTS_GUIDE.md) for the full realtime architecture.
