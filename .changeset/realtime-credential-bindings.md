---
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
---

Realtime voice sessions now resolve their key through MJ Credentials the way prompts do: AI Credential Bindings on the model-vendor row, then the vendor, then the vendor's default credential, then the run's `apiKeys`, then `AI_VENDOR_API_KEY__<driver>`. The binding walk moves from `BaseModelRunner` into the shared `ResolvePlatformAICredential` helper (no change for prompts). A `'RuntimeOnly'` credential scope keeps the run's own keys as the whole chain. When no realtime vendor has a key, the server log names each vendor considered and what it needed, and the session error says how to fix it.
