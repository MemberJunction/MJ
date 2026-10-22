---
'@memberjunction/ng-conversations': patch
'@memberjunction/conversations-runtime': patch
'@memberjunction/graphql-dataprovider': patch
'@memberjunction/ai-agent-client': patch
'@memberjunction/server': patch
'@memberjunction/core-entities': patch
'@memberjunction/ai-core-plus': patch
'@memberjunction/ai-agents': patch
---

feat(conversations): host rules for chats with several people

`mj-conversation-chat-area` gains opt-in inputs, one reworked event, a hook and a slot, so a host can run a chat between several people without forking the chat area. Every default keeps today's behavior.

**Inputs — `ng-conversations`.** Set on `mj-conversation-chat-area` (and on `mj-message-input` directly):

- `AgentReplyMode` — `'Always'` (default) answers every message; `'MentionOnly'` answers only a message that tags an agent and posts any other message with no turn at all: no reply row, no placeholder, no turn events.
- `AllowedAgentIDs` — the agents that may answer. Narrows the composer's `@` list, every route (tagged agent, continuity, pinned and host default agents, the conversation manager), the manager's delegation — including each agent step of a workflow it plans — and the pin and voice pickers. Null allows every agent; an empty list allows none.
- `MentionPeople` — the people the `@` list offers (today it offers only the current user). Each composer keeps its own list: two composers on one page never see each other's.
- `AgentHistoryFrom` — the first moment of the conversation an agent turn may read (see below).
- `AgentTurnHandler` — an async hook that runs the turn on the host's server instead of MJ's path, once per turn, before any reply row exists. The chat area shows the rows it reports.
- `AutoNameConversation` — turns MJ's auto-naming of a new conversation off (text and voice).

**Behavior change: `BeforeAgentTurn`.** It now fires once per turn on every route, before any row exists, and carries the resolved `AgentId`, `AgentName`, `Route` and `UserMessageId`. A listener can cancel the turn or send it to another allowed agent with `RedirectAgentId`. Canceling now leaves nothing behind. Previously the event fired only on the conversation manager's route, after that route's placeholder row was saved, and a cancel left the row behind, marked "Turn canceled before agent invocation". `AfterAgentTurn` now fires on every route too.

**Slot.** `composerExtra` renders host UI directly above the composer, wherever the chat area shows one, with an `IMJChatComposerExtraContext`.

**History floor — `server`, `core-entities`, `ai-core-plus`, `ai-agents`, clients.** `RunAIAgentFromConversationDetail` takes a new nullable `agentHistoryFrom` argument (ISO-8601). The server loads the agent's history from that moment and uses no summary of earlier messages; an unreadable value fails the request. The run carries it as `ExecuteAgentParams.ConversationHistoryFrom`, so the conversation-history tools, the conversation's artifacts, cross-turn compaction (skipped) and the carried-forward tool results of the previous turn (not carried) hold it too. `ConversationEngine.LoadWindowRowsFresh` and `AssembleContextWindow` accept the floor, and `ConversationEngine.HistoryFromFilter` writes it. The GraphQL client names the argument only when a floor is set, so a client that sets none keeps working against an older MJAPI.

**Runtime — `conversations-runtime`.** `MentionAutocomplete.GetSuggestions` takes an optional per-call `MentionSuggestionScope`; `ConversationAgentRunner.processMessage` takes `AllowedAgentIDs` (narrows the manager's `ALL_AVAILABLE_AGENTS`) and `AgentHistoryFrom`.
