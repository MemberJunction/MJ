---
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Gemma 4 model vendors now point at model ids Google actually serves, and the cost and vendor rows of two retired Gemini models are closed out. Metadata only. Every change was checked with live calls on 2026-10-06.

- **Gemma 4 26B A4B on Vertex** now uses `gemma-4-26b-a4b-it-maas`, the serverless Model Garden id served from the `global` location. The old `gemma-4-26b-a4b-it` returned 404 in both `global` and `us-central1`.
- **Gemma 4 31B on Vertex** is marked `Inactive`, and its Vertex cost row is `Expired`. Vertex offers 31B only as a self-deployed endpoint: `gemma-4-31b-it` and `gemma-4-31b-it-maas` both return 404 as hosted models.
- **New Gemini API (`GeminiLLM`) vendor rows for both Gemma 4 models** (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`), verified with regular, streaming and JSON requests. This makes 31B usable without OpenRouter. No Gemini API cost rows are added, because the price was not verified.
- **Gemini 3 Pro:** both cost rows are `Expired` as of 2026-03-09, when Google shut down `gemini-3-pro-preview`. The model and its inference vendors were already inactive.
- **Gemini 2.5 Flash-Lite:** the `GeminiLLM` vendor is `Inactive` and its Google cost row is `Expired` as of 2026-07-28. The Gemini API returns 404 ("no longer available to new users"). The model was already inactive. Its Vertex vendor still works, but it is left as is.
