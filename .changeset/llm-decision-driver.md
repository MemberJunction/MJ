---
"@memberjunction/ai-prompts": minor
---

Add `LLMDecision`, a `BaseDecision` driver that answers typed decision questions (Likelihood, Choice, Score) with a chat model through an MJ prompt, and the `LLM Decision` prompt it runs, bound to GPT-OSS-120B on Cerebras and Groq with GPT 5.5 Instant as the fallback. Choice and Score replies are normalised into probability distributions before `BaseDecision` validates them.
