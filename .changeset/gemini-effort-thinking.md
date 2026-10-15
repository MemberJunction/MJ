---
"@memberjunction/ai-gemini": patch
---

`effortLevel` now controls how much Gemini and Vertex models think (#5171, and the Gemini part of #5530).

**Behavior change:** prompts, prompt-model rows and agents that already set an effort level on a Gemini model will start thinking at that level. Until now the value never reached Google, so every Gemini prompt ran at the model's default. A prompt at effort 10 on a model whose default is high becomes faster and cheaper and may answer worse; re-evaluate such prompts after upgrading. Prompts with no effort level are unchanged.

- **The thinking setting is sent with each request**, on streaming and non-streaming calls, for `GeminiLLM` and `VertexLLM`.
- **Gemini 3 and later**, and unversioned ids such as `gemini-flash-latest`, get `thinkingLevel`. Effort 1–33 is `LOW`, 34–66 `MEDIUM`, 67–100 `HIGH`, the same bands the OpenAI, Groq and Cerebras drivers use. A number never maps to `MINIMAL`, which several models reject (Gemini 3.8 Flash among them); a named effort (`minimal`, `low`, `medium`, `high`, and other vendors' `none` / `xhigh` / `max`) is sent as that level.
- **Gemini 2.5** gets `thinkingBudget`: 1024, 8192 or 24576 tokens by band, 512 for `minimal`. Earlier models and Gemma get no thinking setting, with a one-time warning when an effort is set.
- **A level the model rejects does not fail the request.** On a 400 the request is sent once more: a rejected `MINIMAL` with `LOW` (Gemini 3.8 Flash accepts only low, medium and high), any other setting without one. If that succeeds, the replacement is used for that setting on that driver and model for the rest of the process, with a one-time warning; other levels are still sent as asked.
- **Thought summaries are requested** whenever a thinking setting is sent, and every thought part is kept (non-streaming kept only the first).
- **Thinking tokens count as completion tokens.** Google bills `thoughtsTokenCount` as output, but it was left out of `ModelUsage.completionTokens`, so reported tokens and cost for thinking Gemini models were too low and now rise to match the bill.
