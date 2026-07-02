---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-agent-client": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-agents": minor
"@memberjunction/ng-core-entity-forms": minor
---

AI Skill permissions (full agent parity) + `/skill` composer invocation. Skills now use the same dedicated-table, **open-by-default** permission model as AI Agents via `MJ: AI Skill Permissions`: a cached runtime helper (`AISkillPermissionHelper`, open-by-default) and a unified-engine provider (`AISkillPermissionProvider`, closed-by-default / Sharing Center), grantee-exclusivity enforced by `MJAISkillPermissionEntityServer`, and a `GetSkillsForAgent(agent, user?)` filter so the model's skill catalog is intersected with the acting user's Run permission. The old `AI Skills` Resource-Type sharing is retired in favor of a skill-scoped permissions grid (`SkillPermissionsPanel`/`Dialog`/`Service`), with the `Can Share Skills` authorization repointed to it. End users invoke a skill for a message by typing `/skill-name` in the conversation composer (mirrors `@agent`/`#entity`; picker filtered by permission, chips use `AISkill.IconClass`/`Color`); selected IDs thread through the client → resolver → runtime chain as `ExecuteAgentParams.requestedSkillIDs` (both the `RunAIAgent` and `RunAIAgentFromConversationDetail` mutations), and `BaseAgent.preActivateRequestedSkills` activates them at run start only if they survive the guard (agent-accepted ∩ user-permitted). Requires the companion Agent Skills migration + CodeGen.
