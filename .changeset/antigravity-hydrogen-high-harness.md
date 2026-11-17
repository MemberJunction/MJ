---
"@memberjunction/ai-agent-harness": minor
"@memberjunction/core-actions": patch
---

Support `model` and `effort` in `HarnessAgentBase` `TypeConfiguration` (with fallback from `AIPromptParams.effortLevel` / `AIPrompt.EffortLevel`), persist `EffortLevel` and accurate `configuredModel` attribution, forward `SetEffort(...)` to `AntigravityCliAdapter` and `AntigravityCloudAdapter`, add `Gemini 4 Hydrogen (Medium)` and `Gemini 4 Hydrogen (High)` to the AI model catalog with proper rank calibration and cost metadata, and point `Google Antigravity (CLI)` and `(Cloud)` at `Gemini 4 Hydrogen (High)`. Also add Git Blob API (`> 1 MiB`) and PR file pagination support in `GitHubRestClient`.
