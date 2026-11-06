---
"@memberjunction/core": minor
"@memberjunction/ai": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Price a realtime run's audio tokens at their own rates. `Realtime.Pricing.AudioInput` / `AudioOutput` (per 1M tokens) in the model configuration price each direction's audio tokens on an `Audio` cost line, taken out of the default line; without an audio price the default line keeps today's figure and is marked `Blended`. The OpenAI-protocol and OpenAI Live browser clients now report the per-modality token split, through a shared `MapRealtimeUsageModalityDetail` in `@memberjunction/ai`. Cached input is priced at the cost row's cache-read rate: the record keeps `CachedAudioTokens` (OpenAI's `cached_tokens_details.audio_tokens`), the audio input line prices only the uncached audio, and an audio line never prices more tokens than left the default line.
