# Agent Client SDK & Conversation Data Refactoring Plan

## Problem

The agent client, conversation data, and chat infrastructure have overlapping concerns
spread across too many layers with inconsistent boundaries:

1. **ai-agent-client** (pure TS) has WebSocket transport + tool registry but doesn't use GraphQL at all
2. **ng-agent-client** (Angular) was doing GraphQL subscription work that should be in the core SDK
3. **ng-conversations** has conversation data caching, streaming, and agent execution baked into
   a 3000-line component (`conversation-chat-area`) instead of shared services
4. **GraphQLDataProvider** already has `GraphQLAIClient` with `RunAIAgent`, `RunAIAgentFromConversationDetail`,
   and subscription helpers — but the SDK doesn't wrap it

## Vision: Clean Layer Separation

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 5: Explorer-Specific Components                                  │
│  packages/Angular/Explorer/                                             │
│  - Registers tool handlers (NavigationService.OpenEntityRecord, etc.)   │
│  - Consumes chat overlay + chat workspace components                    │
│  - App-specific event handling                                          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ consumes
┌──────────────────────────────────▼──────────────────────────────────────┐
│  Layer 4: Angular Generic Chat Components                               │
│  packages/Angular/Generic/conversations/                                │
│  - Chat overlay component (floating, collapsible)                       │
│  - Chat workspace component (full-page)                                 │
│  - Message list, input, artifacts UI                                    │
│  - Raises events for navigation, tool execution (no app-specific logic) │
│  - Uses ConversationEngine for all data (no direct RunView calls)       │
│  - Uses AgentClientService for agent communication                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ consumes
┌──────────────────────────────────▼──────────────────────────────────────┐
│  Layer 3: Angular Agent Client Adapter                                  │
│  packages/Angular/Generic/agent-client/ (ng-agent-client)               │
│  - AgentClientService: Angular injectable, RxJS observables             │
│  - Wraps ai-agent-client with Angular DI + reactive patterns            │
│  - ToolRequested$, ToolExecuted$, Error$, SessionActive$                │
│  - Thin adapter only — no business logic                                │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ wraps
┌──────────────────────────────────▼──────────────────────────────────────┐
│  Layer 2: Core Agent Client SDK (Framework-Agnostic)                    │
│  packages/AI/AgentsClient/ (ai-agent-client)                            │
│  - AgentClientSession: manages agent sessions                           │
│  - ClientToolRegistry: tool registration + execution + timeout          │
│  - GraphQL transport: wraps GraphQLAIClient for agent execution,        │
│    tool request subscriptions, tool response mutations                  │
│  - RxJS observables for streaming (RxJS is generic, not Angular-only)   │
│  - Decorator support for runtime tool enrichment                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ wraps
┌──────────────────────────────────▼──────────────────────────────────────┐
│  Layer 1: GraphQL Data Provider                                         │
│  packages/GraphQLDataProvider/                                          │
│  - GraphQLAIClient: RunAIAgent, RunAIAgentFromConversationDetail,       │
│    RunAIPrompt, VectorizeEntity, RunAutotagPipeline                     │
│  - GraphQLDataProvider.subscribe(): raw WebSocket subscription          │
│  - GraphQLDataProvider.ClientToolRequests(): tool request subscription   │
│  - GraphQLDataProvider.PushStatusUpdates(): status subscription          │
│  - Single source of truth for all GraphQL communication                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Shared Data Layer: ConversationEngine (NEW)                            │
│  packages/MJCoreEntities/src/engines/conversations.ts                   │
│  - Extends BaseEngine<ConversationEngine>                               │
│  - Single source of truth for conversation + detail + artifact data     │
│  - Reactive: exposes RxJS observables for state changes                 │
│  - Caches conversation list, details, peripheral data (agent runs,      │
│    artifacts, ratings, avatars)                                         │
│  - All consumers (chat, chat overlay, sidebar, any future UI) use this  │
│  - Replaces: ConversationDataService caching, DataCacheService convo    │
│    portions, component-level conversationDataCache                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Task Breakdown

### TASK 1: ConversationEngine in MJCoreEntities
**Priority: High — foundation for everything else**

Create `packages/MJCoreEntities/src/engines/conversations.ts`:

```typescript
export class ConversationEngine extends BaseEngine<ConversationEngine> {
    // Singleton
    public static get Instance(): ConversationEngine;

    // --- Observable State ---
    public Conversations$: BehaviorSubject<MJConversationEntity[]>;
    public ActiveConversationDetails$: BehaviorSubject<MJConversationDetailEntity[]>;

    // --- Conversation List ---
    public async LoadConversations(contextUser?: UserInfo): Promise<void>;
    public async CreateConversation(name: string, ...): Promise<MJConversationEntity>;
    public async DeleteConversation(id: string): Promise<boolean>;
    public async ArchiveConversation(id: string): Promise<boolean>;
    public async PinConversation(id: string, isPinned: boolean): Promise<boolean>;
    public GetConversation(id: string): MJConversationEntity | undefined;

    // --- Conversation Details (Messages) ---
    public async LoadConversationDetails(conversationId: string): Promise<MJConversationDetailEntity[]>;
    public GetCachedDetails(conversationId: string): MJConversationDetailEntity[] | undefined;

    // --- Peripheral Data ---
    public GetAgentRunsForDetail(detailId: string): MJAIAgentRunEntityExtended[];
    public GetArtifactsForDetail(detailId: string): LazyArtifactInfo[];

    // --- Cache Management ---
    public InvalidateConversation(conversationId: string): void;
    public ClearCache(): void;
}
```

Key design decisions:
- Uses `BaseEngine` pattern (singleton, `Config()` for initialization, auto-sync via entity events)
- RxJS `BehaviorSubject` for reactive state (RxJS is already a dependency of MJCore)
- Replaces the caching that currently lives in `ConversationDataService`, `DataCacheService`,
  and `conversation-chat-area.component.ts`
- Works on both client and server (BaseEngine is isomorphic)
- All conversation UI components consume this instead of making their own RunView calls

### TASK 2: Refactor ai-agent-client to Use GraphQLDataProvider
**Priority: High**

The core SDK should encapsulate the network transport so consumers don't need to know
about GraphQL at all.

2.1. Add `@memberjunction/graphql-dataprovider` as a dependency of `ai-agent-client`
2.2. Move the GraphQL subscription/mutation logic from `ng-agent-client`'s `AgentClientService`
     DOWN into `ai-agent-client`'s `AgentClientSession`:
     - `StartSession(sessionId)` → subscribes via `GraphQLDataProvider.ClientToolRequests()`
     - Tool response → sends via `GraphQLDataProvider.ExecuteGQL()` (RespondToClientToolRequest)
     - Tool definitions → sends via `GraphQLDataProvider.ExecuteGQL()` (UpdateClientToolDefinitions)
2.3. Add agent execution methods that wrap `GraphQLAIClient`:
     - `RunAgent(agentId, message, conversationId?)` → wraps `GraphQLAIClient.RunAIAgent()`
     - `RunAgentFromConversationDetail(params)` → wraps `GraphQLAIClient.RunAIAgentFromConversationDetail()`
2.4. Add RxJS observables (RxJS is framework-agnostic, fine in core SDK):
     - `ToolRequested$`, `ToolExecuted$`, `AgentProgress$`, `AgentMessages$`, `Error$`
2.5. Remove `WebSocketTransport` — we're standardizing on GraphQL transport only
     (WebSocket is still used under the hood by GraphQLDataProvider for subscriptions)

After this, `ai-agent-client` is a complete, self-contained SDK:
```typescript
import { AgentClientSession } from '@memberjunction/ai-agent-client';

const session = new AgentClientSession();
session.RegisterTool({ Name: 'NavigateToRecord', Handler: async (p) => ... });
session.StartSession('session-123');
session.RunAgent('sage-agent-id', 'Show me the latest members');
session.ToolRequested$.subscribe(event => console.log('Tool invoked:', event));
```

### TASK 3: Simplify ng-agent-client to Thin Angular Wrapper
**Priority: High**

With the core SDK doing all the heavy lifting, `ng-agent-client` becomes very thin:

3.1. `AgentClientService` becomes:
     - Angular `@Injectable({ providedIn: 'root' })` wrapper
     - Delegates everything to `AgentClientSession` from the core SDK
     - Exposes the same RxJS observables (just passes them through)
     - Adds Angular-specific lifecycle: `ngOnDestroy` cleanup
     - NO GraphQL code — that's in the core SDK now
     - NO tool registration — consuming app does that
     - NO Router, NavigationService, or any app-specific code

3.2. The only value-add of the Angular wrapper:
     - Angular DI (injectable singleton)
     - Lifecycle management (auto-cleanup)
     - Type re-exports for convenience

### TASK 4: Refactor ng-conversations to Use ConversationEngine + AgentClientService
**Priority: Medium**

4.1. `conversation-chat-area.component.ts` stops managing its own data caches:
     - Remove `conversationDataCache` Map — use `ConversationEngine.GetCachedDetails()`
     - Remove `agentRunsByDetailId` Map — use `ConversationEngine.GetAgentRunsForDetail()`
     - Remove `artifactsByDetailId` Map — use `ConversationEngine.GetArtifactsForDetail()`
     - Data loading delegates to `ConversationEngine.LoadConversationDetails()`

4.2. `ConversationAgentService` uses `AgentClientService` for agent execution:
     - Replace direct `GraphQLAIClient.RunAIAgentFromConversationDetail()` calls
       with `AgentClientService.RunAgentFromConversationDetail()`
     - This automatically gets tool request handling for free

4.3. `ConversationStreamingService` simplifies:
     - The progress routing still lives here (it's conversation-UI-specific)
     - But completion detection can use `AgentClientService.AgentCompleted$`

4.4. `ConversationDataService` simplifies:
     - Delegates to `ConversationEngine` for data
     - Keeps conversation-UI-specific filtering/sorting logic

### TASK 5: Chat Overlay Component
**Priority: Medium**

5.1. Create a floating chat overlay component in `ng-conversations`:
     - Collapsible panel (bottom-right corner)
     - Uses same `conversation-chat-area` internally
     - Raises events (no app-specific behavior)
     - Uses `ConversationBridgeService` to coordinate with full workspace

5.2. The overlay is a **generic** component — it doesn't know about NavigationService,
     Knowledge Hub, or any Explorer-specific concepts. It just raises events:
     - `ToolExecuted` event → Explorer wraps this and calls NavigationService
     - `ConversationSwitched` event → Explorer updates its state
     - `OverlayToggled` event → Explorer shows/hides

### TASK 6: Explorer Integration
**Priority: Medium**

6.1. In MJExplorer (or an explorer-level service):
     - Register client tool handlers using NavigationService:
       ```typescript
       agentClient.RegisterTool({
           Name: 'NavigateToRecord',
           Handler: async (params) => {
               nav.OpenEntityRecord(params.EntityName, CompositeKey.FromID(params.RecordID));
               return { Success: true };
           }
       });
       ```
     - Set decorator context with available entities, current app, tabs
     - Handle overlay events (tool executed → show notification, etc.)

6.2. Wire `IsChatOverlayReady` flag — set to true after metadata loads

---

## What Gets Deleted/Replaced

| Current | Replaced By |
|---------|------------|
| `WebSocketTransport` in ai-agent-client | GraphQL subscription via GraphQLDataProvider |
| GraphQL code in `AgentClientService` (ng-agent-client) | Moved down to `AgentClientSession` (ai-agent-client) |
| `conversationDataCache` in chat-area component | `ConversationEngine` |
| `agentRunsByDetailId` in chat-area component | `ConversationEngine.GetAgentRunsForDetail()` |
| `artifactsByDetailId` in chat-area component | `ConversationEngine.GetArtifactsForDetail()` |
| Direct `GraphQLAIClient` calls in `ConversationAgentService` | `AgentClientService.RunAgentFromConversationDetail()` |
| Hardcoded navigation tools in agent-client | Registered by consuming app (Explorer) |
| `default-client-tools.ts` in CorePlus | Metadata-driven, registered at runtime by consuming app |

## What Stays

| Current | Why It Stays |
|---------|-------------|
| `GraphQLAIClient` in GraphQLDataProvider | Source of truth for all GraphQL AI calls |
| `ClientToolRegistry` in ai-agent-client | Tool registration + execution is correct at this level |
| `ConversationStreamingService` | Conversation-UI-specific progress routing |
| `ConversationBridgeService` | Overlay ↔ workspace coordination |
| `ActiveTasksService` | Cross-conversation task tracking |
| `ArtifactMetadataEngine` | Artifact caching (separate concern from conversations) |
| `ClientToolRequestManager` on server | Server-side publish/await/resolve for tool requests |

---

## Implementation Order

1. **ConversationEngine** — foundation, no dependencies on other changes
2. **ai-agent-client refactor** — add GraphQL transport, RxJS observables, remove WebSocket
3. **ng-agent-client simplification** — thin wrapper only
4. **ng-conversations refactor** — use ConversationEngine + AgentClientService
5. **Chat overlay component** — generic floating panel
6. **Explorer integration** — register tools, wire overlay

Tasks 1-3 can be done in parallel (different packages). Task 4 depends on 1+3. Task 5 depends on 4. Task 6 depends on 3+5.

---

## Estimated Effort

| Task | Effort | Depends On |
|------|--------|------------|
| 1. ConversationEngine | Large (1-2 days) | None |
| 2. ai-agent-client refactor | Medium (1 day) | None |
| 3. ng-agent-client simplification | Small (2-3 hours) | Task 2 |
| 4. ng-conversations refactor | Large (2-3 days) | Tasks 1, 3 |
| 5. Chat overlay component | Medium (1 day) | Task 4 |
| 6. Explorer integration | Small (half day) | Tasks 3, 5 |
| **Total** | **~7-10 days** | |
