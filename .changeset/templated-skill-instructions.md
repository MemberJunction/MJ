---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/core-actions": patch
"@memberjunction/integration-test-suite": patch
---

AI Skill instructions can be a Nunjucks template. Instructions that start with `{# mj:template #}` are rendered when the skill activates, with `params.data`, the payload (`_CURRENT_PAYLOAD`), `agentName` / `agentDescription`, and the system placeholders that need only the acting user (`_CURRENT_DATE`, `_USER_NAME`, …). Unmarked instructions are used exactly as stored, and a render error falls back to the stored text (the template engine logs the error, and a warning names the skill). New protected hooks `resolveSkillInstructions` and `buildSkillTemplateData` on `BaseAgent`; `buildSkillActivationMessage` takes an optional map of resolved text per skill. `Get Skill Details` adds `InstructionsAreTemplate`. New `SystemPlaceholderManager.ResolveAvailablePlaceholders` returns the placeholders resolvable outside a prompt run. New integration check AS22 (ai-skills bundle) covers rendering through the real activation path and template engine.
