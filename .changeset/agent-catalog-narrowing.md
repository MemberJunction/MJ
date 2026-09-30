---
"@memberjunction/ai-agents": patch
---

Agents can now narrow the actions, sub-agents and skills their prompt describes: set `maxActionsInPrompt` or `maxSubAgentsInPrompt` to a positive number and, once per run, one decision call keeps the items most useful for the opening request, plus any with `MinExecutionsPerRun` and the Find Candidate tools. Each narrowed list starts with a line saying how many items it hides and how to reach them: hidden sub-agents and skills are named, and hidden actions are found with Find Candidate Actions, so actions are narrowed only when the agent has that action. It is off by default, only hides entries (anything permitted can still be called, and the counts stay whole), and shows the full catalog if the decision fails.
