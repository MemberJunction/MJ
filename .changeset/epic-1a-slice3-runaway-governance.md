---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

Add multi-scope `BudgetEnforcementGuard` (dollar USD and wall-clock time across `PerRun`, `PerRoutine`, and `PerUserPerDay`), 6-signal `DeterministicProgressDetector`, sub-200ms `FastConvergenceJudge` (`Ambiguous`-only), and non-destructive pause/checkpoint/notification/resume (`RunawayCheckpointManager` and `BaseAgent` integration).
