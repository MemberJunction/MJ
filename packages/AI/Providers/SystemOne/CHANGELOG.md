# @memberjunction/ai-systemone

## 6.2.0-edge.4

### Minor Changes

- 10c2311: Add the Clef and Kev decision models and two drivers to reach them. `CloudflareDecision`, in the new `@memberjunction/ai-cloudflare` package, calls Cloudflare's Clef and Clef-flash on Workers AI (`@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`); its account ID comes from a `<accountId>:<apiToken>` key, a credential's `accountId`, or `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_WORKERS_AI_BASE_URL` or a credential's `endpoint` routes it through an AI Gateway. `SystemOneDecision`, in the new `@memberjunction/ai-systemone` package, calls any server with a `/v1/systemone` route (Kev's own server, llama.cpp's `llama-server`, TypeSafe), with the endpoint from an `API Key with Endpoint` credential or `SYSTEMONE_BASE_URL` and an optional bearer token. The System One wire mapping that Jev, Kev and Clef share moves out of `OpenRouterDecision` into a new `BaseSystemOneDecision` in `@memberjunction/ai`; `OpenRouterDecision` keeps its behaviour, statics and constructor, except that a key resolved from an AI Credential binding now sends the credential's `apiKey` as the bearer token instead of the credential's JSON, and a key that starts with `{` but is not valid JSON now fails before any request instead of being sent whole as the token. Metadata adds the `Cloudflare` and `System One Endpoint` vendors, the `Clef` and `Clef-flash` models, and `Kev-0.8B`, `Kev-4B`, `Kev-9B` and `Kev-27B` (Kev-4B also on OpenRouter, as `jaredpalmer/kev-4b-20260924`), with their limits and prices. The `Default Decision` prompt's bindings are unchanged. The one change in default behaviour: as active `Decision` models, the new models join the power-matched fallback candidates of any Decision prompt that does not require specific models, after its bound models, and only when their credentials resolve. `Default Decision` fails over across models (its `FailoverStrategy` is the column default, `SameModelDifferentVendor`, which `AIDecisionRunner` treats as the whole candidate list), so a call reaches one of them when every credentialed candidate ahead of it (Jev, when its key is set, and `LLM Decision`) has failed with an error that allows failover. Kev-4B on OpenRouter resolves with the OpenRouter key Jev already uses. A missing account ID, token or endpoint, or an API key that starts with `{` but is not valid JSON (a legacy `AI_VENDOR_API_KEY__*` value or runtime `apiKeys` entry; bound AI Credentials always arrive as valid JSON), fails a call before any request with a `NoCredentials` error that allows failover, so a misconfigured fallback does not stop the failover loop and a malformed key's text is never sent as a token.

  `BaseModelRunner` in `@memberjunction/ai-prompts` now finds a `ModelVendor` credential binding on any Active row of a model on a vendor, Inference Provider rows first, both when it checks whether a candidate has a credential and when it resolves one. It used to read only the first Active row, so for any model with both a Model Developer row and an Inference Provider row on one vendor (Clef and Clef-flash on Cloudflare, and many existing models, such as Claude 4.5 Opus on Anthropic, Grok 4 on x.ai, Gemini 3 Flash on Google and the OpenAI embedding models), a credential bound to the Inference Provider row was found only when that row happened to load first, which depends on the rows' keys. A binding on another model's row still does not apply. The fix applies to every runner built on `BaseModelRunner` (prompts and agents, embeddings, rerankers, image and media generation, and decisions), not only to decisions.

- 7dc604e: Add Perplexity's `pplx-decider-v1-27b` as a Decision model. `PerplexityDecision`, in `@memberjunction/ai-systemone`, calls Perplexity's Decisions API (`POST https://api.perplexity.ai/v1/decisions`, the model's only managed host) with a Perplexity API key as the bearer token; the endpoint can be overridden by the constructor or a credential's `endpoint`, and a missing key fails before any request with a `NoCredentials` error that allows failover. Metadata adds the `Perplexity` vendor (credential type `API Key`) and the `Perplexity Decider v1 27B` model, with Perplexity's limits (128 questions, 255 options, 10 levels, 262,144 input tokens) and price ($0.04 per million input tokens, output free). The `Default Decision` prompt's bindings are unchanged; as an active Decision model the Decider joins its power-matched fallbacks, after Jev and `LLM Decision`, once its key resolves.

### Patch Changes

- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
