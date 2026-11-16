---
"@memberjunction/global": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Unify result expiration, compaction, execution limits, and `ArtifactToolManager` history tool registration across directly-attached (`AIAgentAction`) and skill-bundled (`AISkillAction`) actions via `Action.Config` (`IActionConfiguration`), preserve external-data trust wrapping across artifact spillover/pipeline/carry-forward boundaries, use lazy KV-cache-preserving artifact spillover triggered on compaction/expiry/recovery, cap Sage at 20 iterations per run with a 120k context compaction budget, and configure 1-turn result compaction on `Run Ad-hoc Query` and `Run Stored Query` (#6395).
