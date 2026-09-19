---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions-base": patch
---

Actions inside an agent run now receive the run's runtime API keys, so a run on a customer's key generates its images on that key too.

`ExecuteAgentParams.apiKeys` already reaches every prompt (`AIPromptRunner` → `GetAIAPIKey(driverClass, apiKeys)`), but `BaseAgent` never handed it to actions, and `Generate Image` called `GetAIAPIKey(driverClass)` with no second argument — so a run whose prompts used a customer's OpenAI key still generated images on the platform's.

- `BaseAgent.ExecuteSingleAction` stamps `Context.apiKeys` alongside `AgentID` / `ActiveSkillIDs` when the run has runtime keys. Absent when it does not, so no action has to special-case it Non-enumerable, so the keys never ride into serialized context (sub-agent params, run records).
- `Generate Image` resolves its key with `GetAIAPIKey(driverClass, Context.apiKeys)`, falling back per driver class exactly as prompts do. Also fixes the vendor-name fallback, which found a key and then passed the empty one to the generator.
- `RunActionParams.Context` documents the well-known keys BaseAgent stamps.

No behaviour change for a run with no runtime keys.
