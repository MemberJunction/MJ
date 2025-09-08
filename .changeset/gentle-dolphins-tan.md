---
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ai-agents": minor
---

feat(ai-agents): Add ChatHandlingOption for flexible Chat step
   handling

  - Add ChatHandlingOption field to AIAgent table with values:
  Success, Failed, Retry
  - Implement Chat step remapping in
  BaseAgent.validateChatNextStep() based on agent configuration
  - Fix executeChatStep to mark Chat steps as successful
  (they're valid terminal states for user interaction)
  - Remove complex sub-agent Chat handling from FlowAgentType in
   favor of agent-level configuration
  - Enables agents like Requirements Expert to request user
  clarification without breaking parent flows
  - Parent agents can control whether Chat steps should continue
   (Success), fail (Failed), or retry (Retry)
