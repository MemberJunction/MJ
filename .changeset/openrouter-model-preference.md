---
"@memberjunction/ai-openrouter": minor
---

OpenRouter requests can carry an ordered model preference. `MJ_OPENROUTER_MODEL_PREFERENCE` (comma-separated, highest first) is sent as OpenRouter's `models` array, which it walks on any error from the model before — downtime, rate limiting, moderation, context-length validation — billing only for the one that answered. The caller's own model is always appended last, so a preference reorders rather than vetoes and a deliberately chosen model stays reachable. Unset changes nothing: the request body is byte-for-byte what it was.
