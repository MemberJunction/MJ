---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-composer": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add persistent Conversation Side Questions with read-only live agent-run context and fork scoping.

- **Schema & Metadata (`Conversation.ParentBranchID` + `SIDE_QUESTION` conversation type)**: Adds optional `ParentBranchID` (`FK_Conversation_ParentBranchID`, `IX_Conversation_ParentBranchID`, `CK_Conversation_ParentLink`) on top of `Conversation.ParentID` so a persistent side-question child thread can scope cleanly to either the parent conversation's Main trunk (`ParentBranchID IS NULL`) or a specific fork branch. Seeds the `SIDE_QUESTION` (`3B81EB3D-92D7-4947-92CE-D250F8928861`) conversation type and documents `_SIDE_QUESTION_MODE` / `<mj-side-question-thread/>` / `<mj-active-runs-snapshot>` in the Loop and Flow agent-type system prompt templates.
- **Core Entities & Server Security**: Preserves PR #6851's strict private-child isolation (`ParentID` never grants cross-user read access on `MJ: Conversations` or `MJ: Conversation Details`) while permitting any user who can read a parent conversation (`UserCanReadConversation`) to create their own private per-user `SIDE_QUESTION` thread (`UserID = caller`) scoped to Main or a parent fork branch. Keeps generic `ParentID` nesting owner-only, forbids nesting inside child conversations or mutating a saved `SIDE_QUESTION` link, and cascades deletion of child side-question threads on both parent conversation delete (`MJConversationEntityServer`) and fork branch delete (`MJConversationBranchEntityServer`). Adds `LoadSideConversations`, `GetOrCreateSideConversation`, `LoadSideConversationDetails`, `GetSideConversationSummary`, and `ClearSideConversation` on `ConversationEngine` plus `UserMayReadConversation`.
- **AI Execution & Live Run Snapshot**: Adds `SideQuestionExecutionContext`, `ActiveAgentRunSnapshotService` (single `RunViews` batch over in-flight and recent parent agent runs/steps/tasks, fork-path filtered), `<mj-active-runs-snapshot>` trailing runtime-state delivery (preserving stable KV prompt prefixes), `<mj-side-question-thread/>` structural transcript boundary in `RunAIAgentResolver` (only for `TypeID = SIDE_QUESTION`), and read-only enforcement in `BaseAgent` (propagated across sub-agents and realtime delegation; blocks mutating actions, artifact creation, memory writes, task graphs, and handoffs).
- **Runtime & Angular UI**: Adds `SideQuestionController` on `ConversationsRuntime` (delegating turn execution to `ConversationAgentRunner`, defaulting to Sage with per-thread persisted `DefaultAgentID`), exposes a generic `[composerFooter]` content-projection slot on `<mj-message-input-box>` (`@memberjunction/ng-composer` stays AI-agnostic), and renders the `Ask a side question…` trigger directly below the composer status row (`"The agent is working"`) opening `<mj-side-question-panel>` above the main composer with single-turn `‹ 1 / N ›` stepper navigation, shared `<mj-conversation-agent-picker>`, `Alt+/` shortcut, and `BeforeSideQuestionTurn` (`CancellableChatEventArgs`) / `AfterSideQuestionTurn` hooks.
