---
"@memberjunction/core": minor
"@memberjunction/global": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Unify result expiration, compaction, execution limits, and `ArtifactToolManager` history tool registration across directly-attached (`AIAgentAction`) and skill-bundled (`AISkillAction`) actions via `Action.Config` (`IActionConfiguration`), preserve external-data trust wrapping across artifact spillover/pipeline/carry-forward boundaries, avoid KV-cache-busting manifest spillover on compact-only tiny lookups, cap Sage at 20 iterations per run, and configure 1-turn result compaction on `Run Ad-hoc Query` and `Run Stored Query` (#6395).
