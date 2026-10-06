---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-dashboard-viewer": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/realtime-widget": minor
"@memberjunction/rubrics": minor
"@memberjunction/cli": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Conversation branching: editing an earlier user message or regenerating an AI reply now forks a branch instead of changing the original path. A `< i / n >` switcher at each fork point selects which path is shown and written to. The agent context window, history tools, artifacts, compaction, carry-forward, the transcript window, threads, realtime voice history and Skip read only the active path.

- New entity `MJ: Conversation Branches`; `ConversationDetail.BranchID` and `Conversation.CurrentBranchID` (migration, so `minor`).
- `ConversationEngine` gains `BuildBranchPathFilter`, `LoadBranchesFresh`, `ForkBranch` and `SwitchBranch`; `LoadWindowRowsFresh` and `LoadDetailWindow` take a branch.
- `ExecuteAgentParams.ConversationBranchID` is set from the placeholder row by `RunAIAgentFromConversationDetail`; `AgentRunner.RunAgentInConversation` uses the reply row's branch when the caller sets none.

Message-anchored scope: every reader that shows or feeds one conversation path now reads the messages on that path, not every row of the conversation. `ConversationEngine` owns the scope API (`ConversationScope`, `LoadScope`, `LoadCurrentScope`, `TrunkScope`, `ScopeFilter`, `ScopeSubquery`, `IsInScope`, `FilterToScope`, `ArtifactVersionScopeFilter`), and the readers in conversations, export, pins, agent state, the realtime widget and voice recap, rubrics, Explorer forms and dashboards, and the mobile app use it. Artifact history is path-aware: the viewer takes a `Scope` input and lists only the versions a message on the path links (any direction) or that no message links, labels a gap as `v4 · from v2`, and falls back to the newest visible version with a notice. A reused artifact version gets its own link on the new branch. Search results carry the branch and sequence of each hit, and opening a hit on another branch switches to that branch and scrolls to the message. Switching or forking a branch ends an active realtime session for the conversation first (`RealtimeSessionRuntime.IsActiveFor`). Skip requests carry `conversationBranchID`, so Skip Brain keeps one mirror record per conversation path; model input is unchanged.
