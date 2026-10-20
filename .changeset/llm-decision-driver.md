---
"@memberjunction/ai-prompts": minor
---

Add `LLMDecision`, a `BaseDecision` driver that answers typed decision questions (Likelihood, Choice, Score) with a chat model through an MJ prompt, and the `LLM Decision` prompt it runs, bound to GPT-OSS-120B on Cerebras and Groq with GPT 5.5 Instant as the fallback. Choice and Score replies are normalised into probability distributions before `BaseDecision` validates them. A missing option or level counts as 0, but a value the model wrote that is not a usable number (such as `"80%"`, `null`, a negative, or a Likelihood of `85`) fails the decision instead of being guessed at.
