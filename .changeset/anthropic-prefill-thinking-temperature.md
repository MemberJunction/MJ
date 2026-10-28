---
"@memberjunction/ai-anthropic": patch
---

Anthropic driver: stop sending request shapes the API rejects when thinking is enabled or on models that reject sampling parameters outright.

- **Assistant prefill is withheld when thinking is on.** Anthropic returns `This model does not support assistant message prefill` whenever extended thinking is enabled, and on every model from Claude 4.6 onward (adaptive-thinking models) regardless of thinking. Both the non-streaming and streaming paths now resolve thinking first and append the prefill message only when neither condition holds. Known limit: `SupportsPrefill` still reports true, so `AIPromptRunner` keeps its prefill-paired stop sequences; a follow-up should expose prefill support as a function of model and thinking state.
- **Sampling parameters (`temperature`, `top_p`, `top_k`) are sent only where Anthropic accepts them**, through one shared `ResolveSamplingParams` helper used by both paths. Two rules with two different model sets:
  - On Claude Opus 4.7, Opus 4.8, every Claude 5 model and Mythos Preview, a non-default `temperature`, `top_p` or `top_k` is a 400 on every request, with or without a `thinking` block. The driver now drops all three there, keeping only `temperature: 1`; `top_p` is never sent to these models because the docs also reject `temperature` plus `top_p` together even at their defaults.
  - On older models the restriction applies only while thinking is on: `temperature` and `top_k` are dropped, `top_p` is kept only within 0.95 to 1, and `temperature: 1` survives.
  - **Claude Opus 4.6 and Sonnet 4.6 are deliberately not in the always-reject set.** They take adaptive thinking but, per the docs, thinking is off there until requested and they still accept sampling parameters while it is off. The always-reject cutoff therefore lives in its own predicate, `RejectsSamplingParams` (4.7+ plus Mythos Preview), separate from `UsesAdaptiveThinking` (4.6+), and both are pinned per model in unit tests.
- **Streaming `max_tokens` defaults** to 32000 when the caller omits it, matching the non-streaming path. Models with a lower output ceiling (Claude 3 family) should pass an explicit value.

Keeping `temperature: 1` relies on the SDK's pinned `anthropic-version: 2023-06-01`; from API version `2026-10-21` any sampling parameter at any value is rejected on every model, so a version bump must revisit this.

Reference: Anthropic's thinking documentation, "Limits and feature compatibility" (https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility): "Response prefill and forced tool use" and "Sampling parameters".
