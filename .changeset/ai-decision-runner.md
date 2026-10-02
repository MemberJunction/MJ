---
"@memberjunction/ai-prompts": minor
---

Add `AIDecisionRunner`, which runs typed decisions (Likelihood, Choice, Score) on `Decision`-type models with model selection, failover, model limits and prompt-run telemetry, together with the `LLM Decision` model (under the `MemberJunction` vendor) and the `Default Decision` prompt. A higher-priority model skipped for lack of a credential is logged once per process, naming the `AI_VENDOR_API_KEY__<DRIVERCLASS>` variable that would enable it.
