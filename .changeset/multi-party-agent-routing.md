---
"@memberjunction/core-entities": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-conversations": patch
---

Extend conversation context assembly and Jev decision routing for multi-party, multi-agent conversations (`MentionOnly` / `MentionPeople`). `ConversationEngine.AssembleContextWindow` and `GetAgentContextWindow` now include author/agent/reply fields (`UserID`, `User`, `AgentID`, `Agent`, `ParentID`) and support `speakerAttribution` (`'off' | 'auto' | 'always'`) plus `speakerLabels` so agents can distinguish human and AI speakers without altering single-user/single-agent transcripts. `BuildRoutingQuestions` and `InterpretRoutingAnswers` support `AllowNoAgentOption` (`ROUTING_NO_AGENT = 'no_agent'`) and host-allowed restricted agents (`AllowedAgentIDs`), while `ResolveAgentTurn`, `ShouldRunRoutingDecision`, and `MessageInputComponent` short-circuit human `@Person` mentions and `ParentID` thread replies (`Route: 'ThreadReply'`) and route subsequent untagged turns in active `MentionOnly` chats via Jev decision routing (`Route: 'DecisionRouted'`) while keeping cold conversations silent until an agent is `@`-mentioned.

