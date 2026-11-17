---
"@memberjunction/ai-agent-harness": patch
---

Support `model` and `effort` in `HarnessAgentBase` `TypeConfiguration` (with fallback from `AIPromptParams.effortLevel` / `AIPrompt.EffortLevel`), forwarding `SetEffort(...)` to adapters such as `AntigravityCliAdapter`. Add `Gemini 4 Hydrogen (Medium)` and `Gemini 4 Hydrogen (High)` to the AI model catalog and point `Google Antigravity (CLI)` at `Gemini 4 Hydrogen (High)` (`gemini-4-hydrogen-high`).
