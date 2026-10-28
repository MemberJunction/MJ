---
"@memberjunction/core-entities": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": patch
---

Agents no longer fail when several file storage accounts are active and none is configured as the default. The system fallback now picks the most recently updated account (ties broken by ID) and logs a warning once per agent naming the candidates and where to set `DefaultStorageAccountID`. The logic lives in shared engines so any caller gets the same answer: `FileStorageEngineBase.ActiveAccounts` / `ResolveDefaultAccount()` / `ResolveDefaultAccountID()` pick the system default, and `AIEngineBase.ResolveAgentStorageAccountID()` (delegated from `AIEngine`) runs the full agent → category → agent type → system chain. `BaseAgent.getStorageAccountID` now delegates to it.
