---
"@memberjunction/ai-prompts": patch
---

The failover loop moves into `BaseModelRunner` as a generic `executeWithFailover`, with no behaviour change. Chat-specific model execution and final error creation are delegated via callbacks.
