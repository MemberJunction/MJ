---
"@memberjunction/ai-agents": patch
---

Agents no longer fail when several file storage accounts are active and none is configured as the default. The fallback now picks the most recently updated account (ties broken by ID) and logs a warning once per agent naming the candidates and where to set `DefaultStorageAccountID`.
