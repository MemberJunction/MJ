---
"@memberjunction/core": minor
"@memberjunction/ai-agents": minor
---

A run's `actionChanges` that remove every action now leave the run with no actions. Before, `BaseAgent` treated an empty effective action list as "not computed yet" and fell back to the agent's configured actions, so a host that limited an agent to zero actions (for example a space that grants none) gave the agent back all of them, including ones the host meant to withhold. The same applies to sub-agents. Sage's `SearchScopeAccess` is now `Assigned` (it shipped with the Scoped Search action but the column default `None`, so every search was refused): it searches only scopes an application assigns to it, and an installation that assigns none sees no change.
