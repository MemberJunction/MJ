---
"@memberjunction/global": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Unify result expiration, compaction, execution limits, and lazy `ArtifactToolManager` spillover across directly-attached (`AIAgentAction`) and skill-bundled (`AISkillAction`) actions via `Action.Config` (`IActionConfiguration`), preserve external-data trust wrapping across artifact spillover, workspace tools, pipelines, message compaction/recovery, and sub-agent boundaries, defer artifact spillover until compaction/expiry/recovery fires, cap Sage at 20 iterations per run with a 120k context compaction budget, and configure 1-turn result compaction defaults on `Run Ad-hoc Query` and `Run Stored Query` (#6395). Active per-agent `AIAgentAction` rows with `ResultExpirationTurns` configured continue to take precedence over `Action.Config` defaults (set `ResultExpirationMode = 'None'` with `ResultExpirationTurns = 0` to opt a specific agent out), and `ExecuteAgentParams.messageExpirationOverride` (including `expirationMode: 'None'`) overrides both.
