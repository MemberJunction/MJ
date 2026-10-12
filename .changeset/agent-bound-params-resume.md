---
"@memberjunction/ai-agents": patch
"@memberjunction/integration-test-suite": patch
---

A run's bound action parameters are stored on its `MJ: AI Agent Runs` row, and a run that continues another (`lastRunId`, including a resume after `ask_user`) applies that run's bindings when its caller passes none. Before, a resumed or continued run started unbound, so the model could see and set the parameters its original caller hid. Reading the earlier run fails the new run rather than starting it unbound.
