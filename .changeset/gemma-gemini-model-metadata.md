---
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

The Gemma 4 Vertex vendor rows now match what Vertex actually serves, and Gemini 3 Pro's cost rows are closed out. Metadata only. Checked on 2026-10-06 with live calls (the Vertex model ids) and Google's published pricing, model and deprecation pages.

- **Gemma 4 26B A4B on Vertex** now uses `gemma-4-26b-a4b-it-maas`, the serverless Model Garden id served from the `global` location only (launch stage: Experimental). Deployments whose Vertex credentials use another location, or none (the driver defaults to `us-central1`), get a 404 for it. The old `gemma-4-26b-a4b-it` returned 404 in both `global` and `us-central1`. Its Vertex cost row is corrected to Google's published MaaS price: $0.15/M input, $0.60/M output, $0.015/M cache hit (was an unverified $0.08/$0.35 with no cache price).
- **Gemma 4 31B on Vertex** is marked `Inactive`, and its Vertex cost row is `Expired`. Vertex offers 31B only as a self-deployed endpoint, and its pricing page lists no Gemma 4 31B MaaS price: `gemma-4-31b-it` and `gemma-4-31b-it-maas` both return 404 as hosted models. Its existing OpenRouter vendor row is unchanged (not re-tested here). No Gemini API (`GeminiLLM`) rows were added: Google offers Gemma 4 on the Gemini API on the free tier only, with no paid tier, and free-tier content is used to improve Google's products (https://ai.google.dev/gemini-api/docs/pricing#gemma-4).
- **Gemini 3 Pro:** both cost rows are `Expired` as of 2026-03-09, when Google shut down `gemini-3-pro-preview`. The model and its inference vendors were already inactive.
