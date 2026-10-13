---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions-base": patch
---

Actions inside an agent run now receive the run's runtime API keys, so a run on a customer's key generates its images on that key too.

`ExecuteAgentParams.apiKeys` already reaches every prompt (`AIPromptRunner` → `GetAIAPIKey(driverClass, apiKeys)`), but `BaseAgent` never handed it to actions, and `Generate Image` called `GetAIAPIKey(driverClass)` with no second argument — so a run whose prompts used a customer's OpenAI key still generated images on the platform's.

- `BaseAgent.ExecuteSingleAction` hands each action a SCOPED RESOLVER on the new `RunActionParams.RuntimeAPIKeyResolver` (a `RuntimeAPIKeyResolver` from `@memberjunction/actions-base`) when the run has runtime keys — one driver class in, one key out. Per dispatch, not on `Context`: the context is one object shared by every action in the run and copied into sub-agent runs, so the resolver is bound to the action it was handed to even under parallel dispatch. The key list itself is never handed to an action, so none can enumerate the run's credentials; a new `actionMayUseRuntimeAPIKey(action, driverClass, params)` hook (default: allow) lets an agent refuse a class to an action, a refusal being the platform key, not an error. Every resolution is logged by action and driver class (never the key). Absent when the run has no keys, so no action has to special-case it.
- `Generate Image` asks the resolver for its own driver class and falls back to `GetAIAPIKey(driverClass)` — per driver class, exactly as prompts do. Also fixes the vendor-name fallback, which found a key and then passed the empty one to the generator.
- `@memberjunction/actions-base`: `RunActionParams.RuntimeAPIKeyResolver` + the `RuntimeAPIKeyResolver` type; `RunActionParams.Context` documents the well-known keys BaseAgent stamps.

No behaviour change for a run with no runtime keys.
