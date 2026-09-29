---
"@memberjunction/ai-agents": patch
---

Agents can now narrow the actions, sub-agents and skills their prompt lists: set `maxActionsInPrompt` or `maxSubAgentsInPrompt` to a positive number and, once per run, one decision call keeps the items most useful for the opening request, plus any with `MinExecutionsPerRun` and the Find Candidate tools. It is off by default, only hides entries (anything permitted can still be called), and shows the full catalog if the decision fails.
