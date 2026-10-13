---
"@memberjunction/ai-openai": minor
---

Add `OpenAIDecision`, a `BaseDecision` driver for OpenAI's Decisions API (`POST https://api.openai.com/v1/decisions`, public beta), and the `GPT-6 Luna Decisions` model (type Decision, `gpt-6-luna`, $0.10 per million input tokens, no output charge). OpenAI's wire differs from the System One format the other decision drivers share — questions are an array of named `predicate` / `choice` / `score` items and answers come back as an array keyed by name — so the driver builds that request and maps the answers back into the System One shape, reusing `BaseSystemOneDecision`'s answer mapping, renormalisation and telemetry. A refused question fails the call with a failover-eligible error. The model is not bound to any prompt; add it to `Default Decision` (or another Decision prompt) to route decisions to it.
