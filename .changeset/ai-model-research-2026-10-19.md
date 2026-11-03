---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-10-19).

- Applies **OpenAI's 2026-10-23 shutdown wave** to the five affected first-party routes: `o1`, `o1-pro`, `o3-mini`, `o4-mini` and `gpt-image-1` go `Inactive` on the OpenAI Inference Provider row, with their OpenAI cost rows `Expired` at the 2026-10-23 sunset. `o1-pro` and **GPT-4o Image 1.0** also drop to `IsActive: false`, OpenAI being their only inference provider. The Azure and OpenRouter routes for the o-series are deliberately untouched — those platforms run their own lifecycles (Azure retires `o1`/`o3-mini` on 2026-11-19). `o3` is **not** in the wave and is unchanged.
- Rolls **Mistral Large 4** off its two-week launch promotion: the $0.68/$2.09 row is expired at 2026-10-20 and replaced by the standard $1.36 input / $0.14 cached / $4.18 output rate.
- Corrects **Claude Sonnet 5.5** cache-read pricing on the **Amazon Bedrock** and **OpenRouter** routes ($0.20 → $0.10). Anthropic prices Sonnet 5.5 cache hits at 0.05× base input, not the standard 0.1×, and MJ already applied that exception to Opus 5.5 on the same two vendors.
- Adds the missing **Claude Haiku 5.5** OpenRouter route (`anthropic/claude-haiku-5.5`, $0.10/$0.50 per 1M).
- Adds **Grok Voice 3.0** (`grok-voice-3.0`, $0.08/minute), xAI's third-generation speech-to-speech model, superseding Grok Voice Think Fast 2.0 on the `grok-voice-latest` alias.
- Adds **Muse Spark Open** (`meta/muse-spark-open` via OpenRouter, $1.25/$4.25 per 1M), Meta's 816B/42B-active open-weight multimodal MoE — MJ's first Meta inference route.
