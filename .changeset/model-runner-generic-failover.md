---
"@memberjunction/ai-prompts": patch
---

The failover loop moves into `BaseModelRunner` as a generic `ExecuteWithFailover` for prompt-based runners, with no behaviour change. The runner supplies the model call on each candidate and the final error result as callbacks; `AIPromptRunner.executeModelWithFailover` keeps its signature and delegates to it. `processFailoverError`, `updatePromptRunWithFailoverFailure` and `createFailoverErrorResult` are `private` again, as they were before `BaseModelRunner`.
