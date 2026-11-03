---
"@memberjunction/ai-agents": patch
---

fix(ai-agents): eliminate redundant agent names and awkward spliced phrases in streaming progress messages

- Added `BaseAgent.buildPromptProgressMessage` so prompt re-execution progress messages use `previousDecision.retryReason` (or `retryInstructions`) directly instead of splicing complete sentences inside `"Running <Agent> with context from ..."`.
- Omitted redundant agent names in initial prompt, initialization, and fallback progress messages when `_depth > 0`, since `formatHierarchicalMessage` already prefixes the sub-agent breadcrumb (`Query Strategist: Running initial prompt...` instead of `Query Strategist: Running Query Strategist's initial prompt...`).
- Added descriptive `retryReason` strings when child, parallel, or related sub-agents complete (`Reviewing results from <SubAgent>`), and pluralized `1 completed action` vs `N completed actions` cleanly.
