---
"@memberjunction/integration-test-suite": patch
---

Fix the `performance-benchmark` deterministic agent runs (PB7–PB9): the harness now sets `TrustReservedRunData`, so its `decisionsEnabled: false` override reaches the agent. Without it `BaseAgent.Execute` dropped the override, Sage's decision discovery ran and consumed the first scripted reply, and PB7 counted 3 prompt steps instead of 4.
