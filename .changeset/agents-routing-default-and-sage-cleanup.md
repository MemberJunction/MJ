---
"@memberjunction/core": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": minor
"@memberjunction/scheduling-engine": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
---

Pre-freeze AI Agents improvements (Epics B, C, D, and post-`#6852` Epic E hardening):

- **Chief of Staff routing parity (Epic B):** Enabled `"enableHandoff": true` on Chief of Staff (`metadata/agents/.chief-of-staff-agent.json`), extracted Section 4 ("Agent Delegation") into a shared `{@include ../_includes/agent-delegation.md}` fragment parameterized by `{{ agentName }}` with zero hard-coded `"Sage"` references, included it in both Sage and Chief of Staff system prompts while keeping each agent's own sub-agents separate, and verified `BaseAgentID` prototype inheritance passes `enableHandoff` cleanly to derived instances.
- **Per-user default agent (Epic C):** Extended `DefaultAgentResolver` (`ResolveWithDetails` + `Resolve`) with per-user `UserInfoEngine` preference (`Conversations.DefaultAgentID`, with read-only fallback to legacy `chat.defaultAgentId`) and automatic primary-instance (`IsPrimaryInstance = 1`) resolution for instantiable org/app default templates, validating `Active` status and full `BaseAgentID` ancestor `CanRun` permissions with graceful fallback and one-time non-blocking user notice. Added a "Default for new chats" toggle in `ConversationAgentPickerComponent` and unified Chat / My Agents default-agent settings and conversation-manager cache invalidation.
- **Remove hard-coded `'Sage'` assumptions (Epic D):** Updated `MemoryManagerAgent`, `LiveKitRoomResourceComponent`, Conversations UI (`conversation-chat-area`, `message-input`, `agent-handoff-card`, `agent-handoff-map`, `agent-turn-routing`, `realtime-*`), and `metadata/prompts/templates/sage/check-intent.template.md` (`{{ conversationManagerName }}`) to use the resolved conversation manager / default agent with neutral `'Assistant'` fallback, keeping `DefaultAgentResolver.FALLBACK_AGENT_NAME = 'Sage'` strictly as the last-resort safety net.
- **Post-`#6852` Agent Instances hardening (Epic E `E1`–`E5`):** Enforced `mj.config.cjs` (`MjConfig`) at the root ceiling of `LimitsConfigResolver` / `ResolveAgentRunLimits` so user policies can only narrow org ceilings unless an authorized admin override applies (`E2`/`F1`); resolved `Required` templates to the user's `IsPrimaryInstance = 1` across `AgentWakeTriggerService.TriggerWakeOnAgentChannelMessage` and `UserRoutineDispatcherDriver` (`E1`); hid `"Set up My Chief of Staff"` / create CTAs in `MyAgentsSectionComponent` when the user lacks `CanCreate` on `MJ: AI Agents` (`E5`); and added unit tests covering `E1`–`E5` including derived-instance `ScopeCommonReach` / `SupportsAudience` enforcement and transitive ancestor `CanRun` validation.
