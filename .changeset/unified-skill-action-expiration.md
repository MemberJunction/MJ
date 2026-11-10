---
"@memberjunction/core-entities": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

Unify result expiration, compaction, execution limits, and `ArtifactToolManager` history tool registration across directly-attached (`AIAgentAction`) and skill-bundled (`AISkillAction`) actions via `Action.Config` (`IActionConfiguration`), cap Sage at 20 iterations per run, and configure 1-turn result compaction on `Run Ad-hoc Query` and `Run Stored Query` (#6395).
