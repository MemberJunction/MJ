---
"@memberjunction/ai-agents": patch
---

Loop agents' finishIf gates are now opt-in per agent, through the new `finishIfMode` prompt param: `off` (the default) neither teaches the model finishIf nor evaluates a gate; `shadow` evaluates and records every gate as a Finish check step but never ends the run, so an agent's gates can be measured on real traffic; `on` lets a passing gate end the run, as before. A replay of recorded action rounds found that a gate at the 0.9 threshold would have ended 22% of the rounds where the agent went on to act.
