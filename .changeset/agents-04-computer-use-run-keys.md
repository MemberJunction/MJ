---
'@memberjunction/ai-core-plus': patch
'@memberjunction/ai-prompts': patch
'@memberjunction/computer-use': patch
'@memberjunction/computer-use-engine': patch
---

Computer Use runs on the agent run's API keys (#4807): `ComputerUseAction` passes the run's `RuntimeAPIKeyResolver` and `CredentialScope` to the engine, which hands them to its controller, judge and heal prompts. `AIPromptParams.APIKeyResolver` is consulted in the legacy key tier after explicit `apiKeys` and before environment keys, and is inherited by internal prompts with the rest of the execution scope.
