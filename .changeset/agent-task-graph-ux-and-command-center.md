---
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-tasks": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Real-time task graph workflow UX, continuation synthesis with step outputs and artifacts, single-step delegation folding, and a redesigned AI Agent Workflows & Tasks Command Center (#5878).

- **Single-step task graph folding (`@memberjunction/ai-agents`).** `LoopAgentType.DetermineNextStep` automatically folds single-node `Tasks` emissions with no dependencies into an in-turn `Sub-Agent` step (`terminateAfter: false`) so single-agent delegations complete in a single conversation turn without spawning a background task graph, while preserving durable `Tasks` execution for multi-step (`2+` node) workflows. When an orchestrator with `ArtifactCreationMode = 'Never'` or `'System Only'` delegates a folded step to a specialist agent that produces artifacts, `AgentRunner.ProcessAgentArtifacts` resolves the specialist's `DefaultArtifactTypeID` and creation mode so deliverables are persisted and attached to the conversation message.
- **Live task graph telemetry, artifact persistence, and enriched continuation delivery (`@memberjunction/server`, `@memberjunction/conversations-runtime`).** `TaskGraphAgentRunner` resolves the originating `ConversationDetailID` and persists specialist step artifacts on task completion. `TaskGraphContinuationDeliverer` enriches `TaskContinuationParams.Tasks` with structured `OutputPayload` excerpts from `MJ: Tasks`, creates a visible continuation `MJ: Conversation Details` reply row on `Reinvoke`, persists continuation artifacts, and broadcasts `AgentRunCompleted` via `PublishStatusUpdate`. `StartTaskGraphDispatcher` bridges `TaskGraphExecutionBus` frames onto GraphQL PubSub (`TaskGraphProgressEvent`), and `ConversationsRuntime` forwards `TaskGraphProgress` events to the active conversation stream.
- **First-class inline Workflow Execution Card & real-time chat reconciliation (`@memberjunction/ng-conversations`).** `ConversationChatAreaComponent` and `MessageItemComponent` reconcile live `TaskGraphProgress` frames in place, deduplicate parent container tasks from executable step rows, allow expanding any workflow step inline inside the chat bubble to inspect its instructions and output, and automatically append the synthesized continuation reply and attached artifact cards when a multi-step workflow finishes.
- **AI Agent Workflows & Tasks Command Center (`@memberjunction/ng-conversations`, `@memberjunction/ng-tasks`, `@memberjunction/ng-explorer-core`).** Redesigned `TasksFullViewComponent` with a 5-metric KPI telemetry ribbon, instant search and status/agent filters, a **Workflow Cards** DAG view, a second-resolution **Execution Timeline & DAG** waterfall view, and a slide-over **Step Inspector Drawer** with one-click navigation back to the originating conversation.
