---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
---

Realtime voice sessions started from an agent run now resolve their vendor key against the run's API keys, and the Computer Use engine gains a key-resolver seam (not yet wired in MJ).

`ExecuteAgentParams.apiKeys` already reaches every prompt's legacy key tier, and (as of #4611) is offered to every action as `RunActionParams.RuntimeAPIKeyResolver`. Realtime resolved against the environment alone, so a run carrying a customer's key still opened its voice session on the platform's.

- **`@memberjunction/ai`** — `AIAPIKeyResolver` (driver class in, key out) and `MakeAIAPIKeyResolver(apiKeys?)`, which applies `GetAIAPIKey`'s order: the list's key for that driver class, else the platform's. Passing nothing yields the platform lookup. For prompts that order is only the legacy tier (`AIPromptRunner` tries MJ Credentials first), and realtime does not consult MJ Credentials. `RealtimeAPIKeyResolver` becomes an alias of `AIAPIKeyResolver`. `@memberjunction/actions-base` keeps its own identical `RuntimeAPIKeyResolver`, and the prompt runner still takes the key list.
- **`@memberjunction/ai-agents`** — `BaseAgent.resolveRealtimeModel` (the server-run realtime session) resolves against `params.apiKeys`. `PrepareClientSessionInput.APIKeys` carries them into `RealtimeClientSessionService`, and `BaseAgent.StartBridgeRealtimeSession` fills it. There the order is run key, then the service's overridable `getAPIKeyForDriver` seam (by default the environment key), on all three model-selection branches, with vendor selection and the mint sharing that one chain. `CreateBridgeRealtimeSession` (the LiveKit / telephony factory) passes no `apiKeys`, so sessions it opens stay on platform keys, and the browser-initiated session mutation never sets them. `GetRealtimeModelVoices` takes an optional resolver as a seam; its only caller, the voice-picker query, has no run context and passes none.
- **`@memberjunction/computer-use`** — `RunComputerUseParams.APIKeyResolver`: an optional resolver that the engine's direct-LLM funnel (used when the controller and judge models are pinned) asks first, falling back to the platform key. Nothing in MJ sets it yet. `ComputerUseAction` does not forward it, and `MJComputerUseEngine`'s default path runs stored prompts through `AIPromptRunner`, which does not consult it. So browser-agent runs started from MJ are unchanged.

**Vendor selection is affected, deliberately.** Realtime picks the first vendor whose key resolves, so a run that brings a key for a vendor the deployment holds no platform key for now reaches that vendor. That is a routing change, not only a billing one.

No behaviour change for a session with no runtime keys, including one on a service subclass that overrides `getAPIKeyForDriver`.
