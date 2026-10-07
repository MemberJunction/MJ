---
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

The Gemma 4 Vertex vendor rows now match what Vertex actually serves, and the cost and vendor rows of two retired Gemini models are closed out. Metadata only. Every change was checked with live calls on 2026-10-06.

- **Gemma 4 26B A4B on Vertex** now uses `gemma-4-26b-a4b-it-maas`, the serverless Model Garden id served from the `global` location. The old `gemma-4-26b-a4b-it` returned 404 in both `global` and `us-central1`. Its Vertex cost row is corrected to Google's published MaaS price: $0.15/M input, $0.60/M output, $0.015/M cache hit (was an unverified $0.08/$0.35 with no cache price).
- **Gemma 4 31B on Vertex** is marked `Inactive`, and its Vertex cost row is `Expired`. Vertex offers 31B only as a self-deployed endpoint, and its pricing page lists no Gemma 4 31B MaaS price: `gemma-4-31b-it` and `gemma-4-31b-it-maas` both return 404 as hosted models. Its existing OpenRouter vendor row is unchanged (not re-tested here). No Gemini API (`GeminiLLM`) rows were added: Google offers Gemma 4 on the Gemini API on the free tier only, with no paid tier, and free-tier content is used to improve Google's products (https://ai.google.dev/gemini-api/docs/pricing#gemma-4).
- **Gemini 3 Pro:** both cost rows are `Expired` as of 2026-03-09, when Google shut down `gemini-3-pro-preview`. The model and its inference vendors were already inactive.
- **Gemini 2.5 Flash-Lite:** the `GeminiLLM` vendor is `Inactive` and its Google cost row is `Expired` as of 2026-07-28. The Gemini API returns 404 ("no longer available to new users"). The model was already inactive. Its Vertex vendor still works, but it is left as is.
