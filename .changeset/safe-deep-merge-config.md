---
"@memberjunction/global": patch
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
---

Add `SafeDeepMerge` to `@memberjunction/global` and use it for AI model configuration and realtime co-agent configuration merges, so `__proto__`, `constructor` and `prototype` keys in a configuration layer can no longer write into `Object.prototype` (#5569).
