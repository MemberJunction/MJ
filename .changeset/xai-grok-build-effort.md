---
"@memberjunction/ai-xai": minor
---

Grok Build 0.1 no longer fails when a prompt or agent sets an effort level. Metadata only, no code change.

xAI rejects `reasoning_effort` for this model with a 400 (`Model grok-build-0.1 does not support parameter reasoningEffort.`), but its x.ai rows were flagged `SupportsEffortLevel`, so `AIPromptRunner` sent the effort level and every such run failed. Both x.ai rows (model developer and inference provider) are now `SupportsEffortLevel: false`; the runner drops the effort level for the model and logs that it is ignored, and the call succeeds. Verified live against xAI: Grok 4.5, 4.6 and 4.7 accept `reasoning_effort` and keep the flag. The OpenRouter row is unchanged: OpenRouter's handling of the parameter for this model was not verified.
