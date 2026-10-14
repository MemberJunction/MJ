---
"@memberjunction/ai-engine-base": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-conversations": patch
---

A user who cannot read MJ's AI entities now sees a conversation's messages and its composer. `AIEngineBase` gains `ReadableAgents`: the agents when the user may read them, else none, where `Agents` throws `PermissionConstrainedError`. The mention engine initialises with no agents for such a user instead of throwing, and every agent lookup in the chat area, the message item, the message input, the tasks dropdown, the agent picker, the conversation-agent service and the default-agent resolver reads the agents through it (#5240).
