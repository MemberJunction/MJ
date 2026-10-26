---
"@memberjunction/ai-anthropic": patch
---

Anthropic driver: stop sending request shapes the API rejects when thinking is enabled.

- **Assistant prefill is withheld when thinking is on.** Anthropic returns `This model does not support assistant message prefill` whenever extended thinking is enabled, and on models that use adaptive thinking (Claude 4.6+, all of Claude 5). Both the non-streaming and streaming paths now resolve thinking first and append the prefill message only when neither condition holds. Known limit: `SupportsPrefill` still reports true, so `AIPromptRunner` keeps its prefill-paired stop sequences; a follow-up should expose prefill support as a function of model and thinking state.
- **Temperature is dropped when thinking is on.** The API requires temperature to be 1 or omitted with extended or adaptive thinking. The previous check only covered `claude-opus-4-5`; both paths now drop any non-1 temperature whenever thinking resolves.
- **Streaming `max_tokens` defaults** to 32000 when the caller omits it, matching the non-streaming path. Models with a lower output ceiling (Claude 3 family) should pass an explicit value.

Reference: Anthropic's thinking documentation, "Limits and feature compatibility" (https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility): "Response prefill and forced tool use" and "Sampling parameters".
