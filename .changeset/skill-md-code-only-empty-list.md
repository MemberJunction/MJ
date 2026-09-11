---
"@memberjunction/ai-agents": patch
---

SKILL.md: a known list key in block form with no items (`codeOnlyActions:` with its names deleted) now parses as an explicit empty list instead of an absent key, so removing the last `codeOnlyActions` name and re-importing puts that action back into the agent's run rather than silently carrying the old code-only flag. `codeOnlyActions` warnings now quote the name the author typed instead of the resolved GUID.
