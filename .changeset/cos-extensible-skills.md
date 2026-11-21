---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/standards": minor
---

Add the extensible Chief of Staff skills platform, typed core actions, offered rhythms, suggestions, and Agent Channels (`V202611201630`):

- **Schema & CodeGen (`V202611201630`)**: Add `AISkillAction.Role` (`Tool` | `Briefing` | `Both`), `AIAgentSkill.AllowMetadataSyncUpdate`, `RowLevelSecurityFilter.PlatformVariants` (SQL Server + PostgreSQL dialect RLS), `MJ: AI Agent Rhythm Templates`, `MJ: AI Agent Suggestions`, `ConversationType` `AGENT_CHANNEL`, `MJ: Agent Channels` (IS-A `MJ: Conversations`), and `MJ: Agent Channel Participants`.
- **Policy & Briefing Engine**: Introduce `TypedActionPolicyGuard` in `@memberjunction/ai-core-plus` with sub-agent policy ceiling propagation across `BaseAgent` and `AgentUserPolicyEngine`, plus `AIEngine.GetBriefingActionsForAgent` / `GetSkillBriefingActionIDs` for dynamic cross-app briefing fan-out.
- **Core Typed Actions & Agent Channels**: Replace all raw SQL / generic CRUD actions on Chief of Staff with 13 scoped typed actions (including `Assemble My Briefing`, Offered Rhythms, Suggestions, Memory, and Agent Channel actions), add `AgentChannelConversationDriver` with loop-guard and hourly wake rate limits, and enforce recurring routine confirmation in `Schedule Next Agent Wake`.
- **Inbound Utility Mailbox Adapter**: Add `InboundUtilityMailboxIngestionService` and `EmailUtilityMailboxExtension` (`BaseServerExtension`) in `@memberjunction/messaging-adapters`.
- **Governance, Standards & UI**: Add `agent-skill-governance` repo standard, `ChiefOfStaffAgentChannelsComponent` and Governance `InstructionsOverride` size monitor in `@memberjunction/ng-dashboards`, and `IT157` (`COS9–COS12`) integration checks.
