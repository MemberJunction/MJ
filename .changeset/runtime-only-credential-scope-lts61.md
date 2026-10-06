---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions-base": patch
"@memberjunction/core-actions": patch
---

A run can now be restricted to the credentials its caller supplied, so a customer's work never silently runs on the platform's AI keys. Hand port of #5063 to the 6.1 line.

Key resolution fell back to the platform for any driver class the run did not key. When a customer's Google key was rejected, failover moved to Vertex, found no customer key, and finished the run on the platform's account — reporting success. Internal prompts that dropped `apiKeys` reached the platform key the same way with no failover at all.

- **`CredentialScope: 'Any' | 'RuntimeOnly'`** (`AICredentialScope` in `@memberjunction/ai`) on `ExecuteAgentParams` and `AIPromptParams`. Omitting the parameter means `'Any'`, which resolves keys as before (the fixes below change some defaults regardless). `'RuntimeOnly'` allows only `apiKeys` and a per-request `credentialId`: credential bindings, the vendor's default credential and `AI_VENDOR_API_KEY__*` are skipped.
- Every scope decision goes through `CredentialScopeAllows(scope, source)`; its exhaustive switch makes a new scope value a compile error, and an unknown value at runtime throws rather than falling back to the platform.
- Enforced in `AIPromptRunner`'s candidate check and credential resolution, so failover stays on vendors the caller keyed and a run they do not cover fails with "No suitable model found … credential scope is RuntimeOnly". A driver is never constructed without a key under that scope (the OpenAI and Anthropic SDKs read `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` themselves when handed none).
- `BaseAgent` carries the scope to every prompt, sub-agent and the realtime delegate. JSON repair, the parallel result-selector judge, the summarize-range and message-compaction sub-calls, conversation compaction and conversation naming run under the run's scope (`PickPromptExecutionScope` / `AIPromptExecutionScope`), so they spend the run's keys and configuration instead of the platform's — whatever the scope.
- **On this line actions and realtime sessions are never handed the run's keys**, so under `'RuntimeOnly'` they fail rather than spend the platform's: `RunActionParams.CredentialScope` reaches every action; Summarize Content, Run Ad-hoc Query, Execute AI Prompt and Execute Agent forward it to the prompt or agent they run; Generate Image and bridged realtime sessions refuse.
- `ErrorAnalyzer` classifies Google's invalid-key and expired-key responses (`API_KEY_INVALID`, `API_KEY_EXPIRED`, HTTP 400) as `Authentication`, so the run stops instead of failing over.
- **A failed streaming call keeps its driver's classification.** `BaseLLM` rejects a failed stream with its `ChatResult`, which the runner re-analyzed as `Unknown`/`Transient` with no message: failover continued onto the same dead key, agents retried up to their consecutive-failure limit, and every run recorded "Unknown error". `ErrorAnalyzer` now returns an `errorInfo` the value already carries, and the runner records a rejected value as an `Error` with its real message and classification.
- Not covered by the scope: retrieval reranking and embeddings outside a prompt run, and agent-harness credential grants.
