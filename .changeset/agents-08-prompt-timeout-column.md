---
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/codegen-lib": minor
---

Add `AIPrompt.TimeoutMS`, a per-prompt bound on each model call (#3064, #3133).

- New nullable `TimeoutMS` column on `MJ: AI Prompts` (migration + CodeGen: entity, GraphQL and form field). It must be positive; NULL means the prompt sets no bound.
- The runner resolves the timeout as the caller's `AIPromptParams.timeoutMS`, then the prompt's `TimeoutMS`, then the runner's `DefaultPromptTimeoutMS`. A caller passing `0` opts that call out of any bound.
- The parallel coordinator applies the prompt's `TimeoutMS` to each task in place of its default backstop.
- `getEffectiveTimeoutMS` now takes the prompt as its first argument; a subclass that calls or overrides it must pass the prompt.
