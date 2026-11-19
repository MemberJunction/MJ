---
"@memberjunction/ng-conversations": patch
---

`ConversationAgentService` reads an agent's output artifact links from `MJ: Conversation Detail Artifacts` with its own `RunView` instead of a subquery over `[__mj].[vwConversationDetailArtifacts]`. MJ 6.2's `ClientClauseScreen` refused that subquery for any user whose read of conversation detail artifacts is row-filtered, so their follow-up turns lost the agent's previous output (`FindLatestAgentOutputVersion`, `FindAgentArtifacts` and the continuity intent check returned nothing). The intent check now calls the public `FindAgentArtifacts`, so a subclass override applies, and `FindArtifactVersionById` escapes its ID.
