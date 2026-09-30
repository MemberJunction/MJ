---
"@memberjunction/ai-prompts": minor
"@memberjunction/core-actions": minor
---

Image generation now runs through a new `AIImageGenerationRunner`, which records every call as an AI Prompt Run and fails over between the image models that the new `Default Image Generation` prompt binds. Each run records the images it returned, so the models' existing `Per Image` cost rows price it. Run rows also record the calling agent. The Generate Image action uses the runner. With no Model named, the prompt's bindings choose; their first choice is the model the action picked before, and failover can reach the other vendor with the run's own key. A named Model is pinned, and fails over only between its own vendors. The action's key now ranks as it does for chat prompts: a credential binding, or a default credential of the vendor's credential type, wins over it. A call with no key the action can resolve now reaches the runner, where a binding may still apply. If none does, it fails with `GENERATION_FAILED` instead of `ACTION_FAILED`.
