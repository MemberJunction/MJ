---
"@memberjunction/ai": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-systemone": minor
"@memberjunction/ai-inception": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add three decision models: OpenAI's `GPT-6 Luna Decisions`, Subquadratic's `SubQ Snap` and Inception's `Mercury Decide`, with a driver for each vendor's own API: `OpenAIDecision`, `SubQDecision` and `InceptionDecision`. All three models are unmeasured in MJ, and their raw probabilities are not calibrated to MJ's data.

## GPT-6 Luna Decisions (`OpenAIDecision`, `@memberjunction/ai-openai`)

`OpenAIDecision` is a driver for OpenAI's Decisions API (`POST https://api.openai.com/v1/decisions`, public beta since DevDay on September 29, 2026). The API serves one model, `gpt-6-luna`.

**The driver.** It extends `BaseDecision` and maps MJ's questions onto OpenAI's own wire format, as typed by OpenAI's Node SDK 7.30.0:
- The questions go as an ordered array named by question key: a `predicate`, a `choice` with `choices: [{ value, description }]`, or a `score` with `levels: [{ label }]`. The state is sent as `input`.
- Answers are matched by name, and by position only when an answer has no name.
- A Choice's array probabilities are keyed by option value, and a Score's by level label; both are renormalised. A Score's `score` is mapped onto MJ's level positions through each level's `value`.
- A `refusal` answer fails the result with an error that names the question and allows failover.

It calls the endpoint with `fetch`, because the package's `openai` SDK (6.18.0) has no `decisions` resource. Its `SendRequest` is the one network call.

**Credentials and errors.**
- It reads its key with `ParseSystemOneCredential`, so a bound AI Credential sends its `apiKey`, not its JSON.
- A missing key, or a key that starts with `{` but is not valid JSON, fails before any request with a `NoCredentials` error that allows failover.
- A non-2xx response carries the HTTP status and OpenAI's `error.message`, with the key redacted: a 429 or 5xx fails over, and a 401 stops the loop.
- The endpoint can be overridden by a constructor argument or a credential's `endpoint`.

`@memberjunction/ai` exports `NormalizeDecisionProbabilities` and `ReadDecisionConfidence` from `baseSystemOneDecision.ts`, so drivers outside the System One family reuse its renormalisation and confidence rules.

**Metadata.**
- The `GPT-6 Luna Decisions` model has the `Decision` type, is separate from the `GPT-6 Luna` LLM, and has PowerRank 57.
- Its vendor rows are OpenAI as Model Developer, OpenAI as Inference Provider (`OpenAIDecision`, `gpt-6-luna`, priority 2), and OpenRouter as Inference Provider (`OpenRouterDecision`, the pinned `openai/gpt-6-luna-decisions-20261006`, 1,050,000 input tokens, priority 1).
- Both vendors have cost rows at $0.10 per million input tokens, with free output.
- OpenAI documents no per-request limits, so none are set.

## SubQ Snap (`SubQDecision`, `@memberjunction/ai-systemone`)

`SubQDecision` calls Subquadratic's SubQ Decisions API (`POST https://api.subq.ai/v1/systemone`), which speaks System One exactly, so it extends `BaseSystemOneDecision`. SubQ Snap was announced on October 12, 2026 and is in public preview as `subq-snap-preview`; that ID will change at general availability, so it lives in the row's `APIName`.

- The endpoint can be overridden by a constructor argument or a credential's `endpoint`. A missing key fails before any request with a `NoCredentials` error that allows failover.
- Error messages name SubQ's `detail.error_type` and `detail.message`.
- A 402 (no credits) is a `NoCredit` error, and a 403 (the key cannot use the model) or a 422 (a request SubQ rejects) a `ModelError`, all allowing failover whatever SubQ's message says. A 401 stays a fatal `Authentication` error; a 429 or 503 fails over.
- SubQ's optional image input is not sent: `DecisionParams` has no field for it.

**Metadata.** A new `Subquadratic` vendor (credential type `API Key`), and the `SubQ Snap` model (PowerRank 43): Subquadratic as Model Developer and as Inference Provider (`SubQDecision`, `subq-snap-preview`); $0.05 per million input tokens, output free; the documented Choice (255 options) and Score (10 levels) limits.

## Mercury Decide (`InceptionDecision`, `@memberjunction/ai-inception`)

`InceptionDecision` calls Inception's Decisions API (`POST https://api.inceptionlabs.ai/v1/decisions`, model `mercury-decide`, released September 30, 2026), which speaks System One exactly, so it extends `BaseSystemOneDecision`. It takes the same Inception API key as Mercury 2.

- The endpoint can be overridden by a constructor argument or a credential's `endpoint`. A missing key fails before any request with a `NoCredentials` error that allows failover.
- Error messages name Inception's `error.message`, or a 422's FastAPI `detail[].msg`.
- A 402 (billing) is a `NoCredit` error and a 422 a `ModelError`, both allowing failover; a 404, 413, 429 or 5xx fails over as `ErrorAnalyzer` reads it, and a 401 stays fatal.

**Metadata.** The `Mercury Decide` model (PowerRank 44): Inception Labs as Model Developer; Inception Labs as Inference Provider (`InceptionDecision`, `mercury-decide`, priority 2); OpenRouter as Inference Provider (`OpenRouterDecision`, the pinned `inception/mercury-decide-20260930`, 65,536 input tokens, priority 1). Both vendors have cost rows at $0.02 per million input tokens, Inception's promotional price (50% off the regular $0.04), with free output; the documented Choice (255) and Score (10) limits. OpenRouter's `:free` variant is not added.

## Shared code (`@memberjunction/ai`)

- `ReadSystemOneErrorMessage` reads a vendor's message from an error body: FastAPI's `detail` (a string or a list of `{ msg }`), SubQ's `detail` object (`error_type: message`), or an OpenAI-style `error.message`. `SystemOneDecision` and `PerplexityDecision` now use it. Every body they read before gives the same message, unless it carries both a `detail` and an `error`, when `detail` now wins. They also read shapes they did not: `SystemOneDecision` SubQ's `detail` object, and `PerplexityDecision` any `detail` and a plain-string `error`.
- `BaseSystemOneDecision.GetHTTPErrorType` is a new protected hook: a driver returns an error type for a status whose `ErrorAnalyzer` reading is wrong for its API, and the error carries it as a `Retriable` classification that allows failover. The default changes nothing.

## Default Decision

The `Default Decision` prompt's bindings are unchanged. Every active `Decision` model joins the power-matched fallbacks of any Decision prompt that does not require specific models, after the bound models, sorted by distance from the prompt's target rank, and is tried only when one of its rows has a credential. `Default Decision`'s target rank is 57, the priority-weighted mean of Jev (60) and `LLM Decision` (50).

- GPT-6 Luna Decisions, at 57, is exactly that target, so its two rows become the first fallbacks, ahead of Clef and Kev-27B.
- Mercury Decide (44) and SubQ Snap (43) are farther from it than every other shipped Decision model, Kev-0.8B (45) included, so their rows are the last fallbacks: Mercury Decide on Inception, then on OpenRouter, then SubQ Snap.

Existing credentials can be enough to reach them:
- An OpenRouter key set for Jev covers the GPT-6 Luna Decisions and Mercury Decide OpenRouter rows.
- A credential bound to the OpenAI vendor (for OpenAI's LLMs, say) covers GPT-6 Luna Decisions' OpenAI row, and one bound to the Inception Labs vendor (for Mercury 2) covers Mercury Decide's Inception row.
- A default `API Key` credential covers every one of these rows, SubQ Snap's included.

On such a host, `Default Decision` can now fail over to these vendors' APIs, two of them in beta or preview, sending them the decision's state. To prevent that for a model, set its row's `Status` to `Inactive`.
