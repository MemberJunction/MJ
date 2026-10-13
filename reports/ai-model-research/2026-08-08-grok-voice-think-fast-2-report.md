# AI Model Research Report — Grok Voice Think Fast 2.0 (Focused)
**Generated**: 2026-08-08
**Scope**: Single-model addition — off-cadence, focused PR (not the weekly sweep)
**Base Branch**: `next`
**Working Branch**: `claude/add-grok-model-catalog-s1amt7`

## Executive Summary

xAI announced **Grok Voice Think Fast 2.0** on **July 29, 2026**
([x.ai/news/grok-voice-think-fast-2](https://x.ai/news/grok-voice-think-fast-2)). The
announcement fell inside the 2026-07-31 off-cadence report's window, but that report was a
v5.51.0 release refresh and only noted in passing that *"MJ tracks speech models unevenly
(`Grok Voice` is present; dedicated STT is generally [not])"*. The 2026-08-03 weekly report's
3-day window opened after the announcement and focused on the OpenAI GPT-5.6 price cuts. This
focused report closes that gap: **1 new model added**, **1 description-text edit**, **0 new
vendors**.

The addition matters operationally, not just for inventory completeness: xAI's
`grok-voice-latest` alias **flipped to Think Fast 2.0 on August 5, 2026** — three days before
this report — so any MJ deployment routing voice traffic through the alias is already on the
new generation, while the catalog still only described the old one.

## Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 178 | 179 | +1 |
| Active models | 151 | 152 | +1 |
| Vendors | 30 | 30 | 0 |
| Realtime-type models | 9 | 10 | +1 |

## New Model — Grok Voice Think Fast 2.0 (xAI, July 29, 2026)

Second-generation speech-to-speech realtime voice model; successor to the catalog's existing
`Grok Voice` entry (`PriorVersionID` set accordingly — a genuine version lineage, since the
`grok-voice-latest` alias now resolves to 2.0).

### Specs as modeled

| Field | Value | Basis |
|---|---|---|
| Model type | Realtime | Speech-to-speech over WebSocket, same family as `Grok Voice` / `GPT Realtime 2.1` |
| API name | `grok-voice-think-fast-2.0` | Production model ID per Vercel AI Gateway and BLACKBOX AI model listings |
| DriverClass | `GrokRealtime` | 2.0 keeps OpenAI-Realtime-API compatibility at `wss://api.x.ai/v1/realtime`, so the existing driver works unchanged |
| Vendor rows | x.ai Model Developer + x.ai Inference Provider | Matches the newest realtime precedent (GPT Realtime 2.1); the older `Grok Voice` entry predates the two-row convention |
| MaxInputTokens | 128,000 | **Carried from the `Grok Voice` predecessor row** — xAI does not publish a token-denominated context figure for the voice models in available coverage. Weakest fact in this addition; flagged below |
| SupportsEffortLevel | false | Reasoning is always-on-while-speaking; no documented `reasoning_effort`-style parameter. Conservative default per skill guidance |
| SupportsStreaming | true | Full-duplex realtime streaming is the product |
| PowerRank | 12 | One above `Grok Voice` and `GPT Realtime 2.1` (both 11): xAI reports benchmark wins over OpenAI and Google voice models, plus Starlink A/B gains in conversion and support containment |
| SpeedRank | 9 | ~0.70s time-to-first-audio and reasons-while-speaking (no thinking pause); one above `GPT Realtime 2.1` (8) |
| CostRank | 4 | $0.08/min ≈ $4.80/hr of audio — under typical realtime-voice spend on the token-priced OpenAI realtime models at conversational audio rates |

### Capabilities recorded in Description

- Reasons **while speaking** rather than pausing to think; ~60% fewer reasoning tokens than
  Think Fast 1.0 at ~0.70s time-to-first-audio.
- Transcription WER **1.5–2.0× better** than dedicated STT (Deepgram Nova 3, ElevenLabs
  Scribe v2) on xAI's 24-language eval; gap widens to **~10×** in noisy environments.
- 20+ languages with automatic language detection.
- Custom function tools plus xAI built-ins: web search, X search, collections search, and
  remote MCP tools.

### Cost row — first use of Minutes / Per Minute

xAI prices the raw Voice API at **$0.08 per minute of audio** — not per token. The catalog
has had a `Minutes` price type (baseline seed) and a `Per Minute` unit type (added
2026-06-16, self-describedly for realtime voice) with **zero rows using them** until now.

Encoding decision: the $0.08 blended session rate goes in `InputPricePerUnit` with
`OutputPricePerUnit: 0`, so a consumer computing `minutes × rate` counts elapsed minutes
once instead of double-counting a directionless rate stored in both columns. The cost row's
`Comments` states this convention explicitly for the next per-minute model to follow. Both
cache columns are `null` — cache pricing has no meaning for per-minute audio billing.

The **Grok Voice Agent Builder** product lists $0.05/min; that is a separate managed SKU,
not the raw realtime API, and is deliberately not modeled.

### Description-only edit — `Grok Voice`

Appended a supersession note: Think Fast 2.0 announced July 29, 2026; `grok-voice-latest`
resolves to it as of August 5, 2026; the entry's pinned `grok-voice` API name continues to
serve the prior generation. `IsActive` stays `true` — no retirement announced, matching repo
precedent of deactivating only at actual retirement.

## Confidence Caveats

1. **MaxInputTokens 128,000** is inherited from the predecessor entry, not from a
   first-party 2.0 spec sheet (x.ai and docs.x.ai are unreachable from this environment's
   egress policy; secondary coverage does not state a token context figure). If docs.x.ai
   publishes a figure, correct in a follow-up weekly report.
2. **$0.08/min** is corroborated across multiple independent secondary sources but not
   verified against docs.x.ai directly, for the same egress reason.
3. New-record UUIDs were generated with Python `uuid.uuid4()` (uppercased) because the
   `uuidgen` binary is not present in this container — same RFC-4122 v4 generation the CLI
   rule intends; no UUIDs were invented or inferred.

## Sources

- [Introducing Grok Voice Think Fast 2.0 — x.ai](https://x.ai/news/grok-voice-think-fast-2)
- [Grok Voice Think Fast 1.0 — x.ai](https://x.ai/news/grok-voice-think-fast-1)
- [Speech to Speech — xAI Docs](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech)
- [Grok Voice Think Fast 2.0 API & Pricing — Vercel AI Gateway](https://vercel.com/ai-gateway/models/grok-voice-think-fast-2.0)
- [Grok Voice Think Fast 2.0 — BLACKBOX AI model listing](https://www.blackbox.ai/models/blackboxai/xai/grok-voice-think-fast-2.0)
- [Grok Voice Think Fast 2.0 API — explainx.ai](https://www.explainx.ai/blog/grok-voice-think-fast-2-speech-to-speech-july-2026)
- [All About Grok Voice Think Fast 2.0 — bleap.finance](https://www.bleap.finance/en-us/blog/all-about-grok-voice-think-fast-2-0)
- [xAI upgrades Grok Voice with faster Think Fast 2 mode — YourStory](https://yourstory.com/ai-story/xai-grok-voice-think-fast-2)
- [xAI Unveils Grok Voice Think Fast 2.0 — BigGo Finance](https://finance.biggo.com/news/4bf16f12-1046-46f1-8d01-aa9649230336)
- [xAI releases Grok Voice Think Fast 2.0 — AIbase](https://www.aibase.com/news/30002)
- [Grok Voice 2.0 and the State of Speech-to-Speech Agents — Digital Applied](https://www.digitalapplied.com/blog/grok-voice-think-fast-2-speech-to-speech-agents-2026)
- [xAI Voice Agent (Realtime API) — LiteLLM docs](https://docs.litellm.ai/docs/providers/xai_realtime)
