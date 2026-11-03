---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-core-entity-forms": patch
---

System placeholders now resolve in scoped prompt parts. After `BaseAgent.InjectScopedPromptParts` adds the parts (including from a subclass override), the agent passes the added messages to the new `SystemPlaceholderManager.ReplaceAvailablePlaceholders`, which replaces each bare token such as `{{ _CURRENT_DATE }}` with its value. Part text is not rendered as a template: every other character, including other `{{ ... }}` text, filters and tags, is sent as written, and so is a token that cannot be resolved before the prompt runs (prompt and Execution Context placeholders, or a user one without a context user). System placeholders declare what they need with the new optional `requires` field; one without it resolves only through `ResolveAllPlaceholders`, as before. Code that assembles parts itself with `PromptComponentResolver.AssembleMessages` can pass the result to `ReplaceAvailablePlaceholders` to get the same behavior.
