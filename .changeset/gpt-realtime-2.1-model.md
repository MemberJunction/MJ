---
"@memberjunction/ai": minor
---

Add the **GPT Realtime 2.1** AI model (OpenAI, `gpt-realtime-2.1`) to the model catalog metadata.

OpenAI's July 6, 2026 update to GPT Realtime 2 — a GPT-5-class speech-to-speech voice model served over the (now GA) Realtime API and driven by the existing `OpenAIRealtime` driver (`BaseRealtimeModel`). Registered as a `Realtime`-type model with OpenAI as both Model Developer and Inference Provider, chained via `PriorVersionID` to GPT Realtime 2.

- **Capabilities**: 128K token context (32K max output), five reasoning effort levels (`minimal`/`low`/`medium`/`high`/`xhigh`, default `low`), parallel tool/function calls, streaming full-duplex. Improves on GPT Realtime 2 with better alphanumeric recognition, silence/noise handling, and interruption/barge-in behavior, plus ~25% lower p95 latency from improved caching.
- **Pricing** (multi-channel; canonical row is the text channel): `$4`/1M text input (`$0.40` cached), `$24`/1M text output; audio `$32`/1M in (`$0.40` cached), `$64`/1M out; image input `$5`/1M (`$0.50` cached). Identical to GPT Realtime 2. `CacheReadPricePerUnit` set to the published text cached-input price ($0.40, OpenAI Family B); no cache-write charge.

Also adds the **GPT Realtime 2.1-mini** variant (`gpt-realtime-2.1-mini`) — the same reasoning realtime stack at a cost-optimized tier: `$0.60`/1M text input (`$0.06` cached), `$2.40`/1M text output; audio `$10`/1M in (`$0.30` cached), `$20`/1M out; image `$0.80`/1M (`$0.08` cached).

Delivered as declarative metadata only (`.ai-models.json`: 2 models + 4 vendor rows + 2 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push` against a clean last-release DB, per the release workflow now documented in `metadata/CLAUDE.md`.
