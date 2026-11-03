---
"@memberjunction/db-auto-doc": patch
---

Fix: the discovery-phase LLM validator now actually calls the model. It created its LLM using the raw provider name (`'gemini'`) as the class key, but drivers are registered under their class name (`'GeminiLLM'`). It got a bare `BaseLLM`, and every validation call failed with `this.nonStreamingChatCompletion is not a function`. It now uses `CreateLLMInstance` like the rest of DBAutoDoc. `CreateLLMInstance` also throws when the provider's driver isn't registered, instead of returning a bare `BaseLLM`. Turning validation on can change discovered keys.
