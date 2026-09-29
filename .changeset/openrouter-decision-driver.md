---
"@memberjunction/ai-openrouter": minor
---

Add `OpenRouterDecision`, a `BaseDecision` driver for OpenRouter's Decisions API, which serves TypeSafe's Jev typed-decision model, together with the `Jev` model (pinned to `typesafe/jev-1.13-20260917`, with its cost and decision limits) and its binding as the first choice of the `Default Decision` prompt. An unmappable response fails over to the next decision model. The legacy key variable is `AI_VENDOR_API_KEY__OPENROUTERDECISION`.
