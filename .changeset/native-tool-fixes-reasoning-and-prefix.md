---
"@memberjunction/ai-openai": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/integration-test-suite": patch
---

Native tool calling fixes. The OpenAI driver now handles models that accept function tools on Chat Completions only with reasoning off (such as GPT-6 Luna): when the provider refuses tools because reasoning is on, the driver resends the request once with `reasoning_effort: 'none'`, keeps the tools, and remembers the model so later requests go out right the first time. Before, every native call on such a model failed and fell back to the envelope path. The agent no longer loses its system-prompt-and-tools baseline when a request fails, so the request after a failure on the turn a skill changes the tools still drops thinking made under the old prompt instead of replaying it and being refused. Failover that runs out of candidates now reports the provider's error message instead of "Unknown error" when the driver wrapped the SDK error. Adds tests for the prompt runner's prefix guard and fingerprint wiring, and corrects the docs on when a model override decides the trailing-state mode. A payload change sent with a completion is now applied only if the completion is accepted: Success validation checks the payload with the change applied, and on a refusal the change is discarded and the model is told to send it again with its next completion. Adds integration check NTL14 for this.
