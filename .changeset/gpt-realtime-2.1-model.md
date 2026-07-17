---
"@memberjunction/ai": minor
---

Add the **GPT Realtime 2.1** AI model (OpenAI, `gpt-realtime-2.1`) to the model catalog metadata.

OpenAI's July 6, 2026 update to GPT Realtime 2 — a GPT-5-class speech-to-speech voice model served over the (now GA) Realtime API and driven by the existing `OpenAIRealtime` driver (`BaseRealtimeModel`). Registered as a `Realtime`-type model with OpenAI as both Model Developer and Inference Provider, chained via `PriorVersionID` to GPT Realtime 2.

- **Capabilities**: 128K token context (32K max output), five reasoning effort levels (`minimal`/`low`/`medium`/`high`/`xhigh`, default `low`), parallel tool/function calls, streaming full-duplex. Improves on GPT Realtime 2 with better alphanumeric recognition, silence/noise handling, and interruption/barge-in behavior, plus ~25% lower p95 latency from improved caching.
- **Pricing** (multi-channel; canonical row is the text channel): `$4`/1M text input (`$0.40` cached), `$24`/1M text output; audio `$32`/1M in (`$0.40` cached), `$64`/1M out; image input `$5`/1M (`$0.50` cached). Identical to GPT Realtime 2. `CacheReadPricePerUnit` set to the published text cached-input price ($0.40, OpenAI Family B); no cache-write charge.

Delivered as metadata: `.ai-models.json` writeback plus the `V202607171327__v5.49.x__Metadata_Sync` migration (SQL Server + PostgreSQL) — one `spCreateAIModel`, two `spCreateAIModelVendor` (Model Developer + Inference Provider), and one `spCreateAIModelCost`.
