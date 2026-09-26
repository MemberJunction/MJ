---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
---

Realtime voice sessions and the browser agent now run on the run's API key, and MJ gains one canonical shape for handing out a scoped key-resolution capability.

`ExecuteAgentParams.apiKeys` has always reached every prompt, and (as of the actions fix) every action. Realtime resolved against the environment alone — so a run on a customer's credential still opened its voice session, the most expensive call in the product, on the platform's.

- **`@memberjunction/ai`** — `AIAPIKeyResolver` (driver class in, key out) and `MakeAIAPIKeyResolver(apiKeys?)`, which applies exactly `GetAIAPIKey`'s precedence: the run's key for that driver class, else the platform's. Passing nothing yields the platform lookup, so no caller special-cases "this run has no keys". This is the shared shape the prompt, action and realtime paths now all use; `RealtimeAPIKeyResolver` becomes an alias of it.
- **`@memberjunction/ai-agents`** — `BaseAgent.resolveRealtimeModel` (the bridge path) resolves against `params.apiKeys`; `PrepareClientSessionInput.APIKeys` carries them into the client-direct path, threaded through all three model-selection branches so selection and mint cannot disagree about which credentials a session may use. `BaseAgent` supplies them when it builds a bridge prep input. `GetRealtimeModelVoices` accepts a resolver so a customer-keyed vendor lists its own voices.

- **Computer Use** — `RunComputerUseParams.APIKeys` carries the run's keys to the one funnel both the controller and judge LLMs pass through, so a run on a customer's credential drives the browser on that credential too, not just its prompts.

**Vendor selection is affected, deliberately.** Realtime picks the first vendor whose key resolves, so an organization that brings a credential for a vendor the deployment holds no platform key for now reaches that vendor. That is what bringing your own key means, but it is a routing change, not only a billing one.

No behaviour change for a session with no runtime keys.
