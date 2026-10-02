---
"@memberjunction/ai-systemone": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add Perplexity's `pplx-decider-v1-27b` as a Decision model. `PerplexityDecision`, in `@memberjunction/ai-systemone`, calls Perplexity's Decisions API (`POST https://api.perplexity.ai/v1/decisions`, the model's only managed host) with a Perplexity API key as the bearer token; the endpoint can be overridden by the constructor or a credential's `endpoint`, and a missing key fails before any request with a `NoCredentials` error that allows failover. Metadata adds the `Perplexity` vendor (credential type `API Key`) and the `Perplexity Decider v1 27B` model, with Perplexity's limits (128 questions, 255 options, 10 levels, 262,144 input tokens) and price ($0.04 per million input tokens, output free). The `Default Decision` prompt's bindings are unchanged; as an active Decision model the Decider joins its power-matched fallbacks, after Jev and `LLM Decision`, once its key resolves. Also fixes `BaseModelRunner`'s `ModelVendor` credential lookup, which read only the first Active row of a model on a vendor: for a vendor that both develops and serves a model, that could be the Model Developer row, so a credential bound to the Inference Provider row was missed. It now checks every Active row of the pair, Inference Provider rows first.
