---
"@memberjunction/ai": minor
"@memberjunction/ai-openai": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add OpenAI's decision model, `GPT-6 Luna Decisions`, and `OpenAIDecision`, a driver for OpenAI's Decisions API (`POST https://api.openai.com/v1/decisions`, public beta since DevDay on September 29, 2026). The API serves one model, `gpt-6-luna`.

**The driver.** `OpenAIDecision` is in `@memberjunction/ai-openai` and extends `BaseDecision`. It maps MJ's questions onto OpenAI's own wire format, as typed by OpenAI's Node SDK 7.30.0:
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

`@memberjunction/ai` exports `NormalizeDecisionProbabilities` and `ReadDecisionConfidence` from `BaseSystemOneDecision`, so drivers outside the System One family reuse its renormalisation and confidence rules.

**Metadata.**
- The new `GPT-6 Luna Decisions` model has the `Decision` type, is separate from the `GPT-6 Luna` LLM, and has PowerRank 57: below Jev (60) and Clef (58), because it is unmeasured.
- Its vendor rows are OpenAI as Model Developer, OpenAI as Inference Provider (`OpenAIDecision`, `gpt-6-luna`, priority 2), and OpenRouter as Inference Provider (`OpenRouterDecision`, the pinned `openai/gpt-6-luna-decisions-20261006`, 1,050,000 input tokens, priority 1).
- Both vendors have cost rows at $0.10 per million input tokens, with free output.
- OpenAI documents no per-request limits, so none are set.

The `Default Decision` prompt's bindings are unchanged. As an active `Decision` model, the new model joins the power-matched fallbacks of any Decision prompt that does not require specific models, after the bound models, and only when one of its rows has a credential. An OpenRouter key set for Jev also covers its OpenRouter row.
