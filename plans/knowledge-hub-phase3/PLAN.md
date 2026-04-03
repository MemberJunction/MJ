# Knowledge Hub Phase 3 — Agent Integration, Merge UX, and Polish

## Branch: `TBD` (cut from `next` after Phase 2 merges)

## Context

Phase 1 built the core infrastructure: vector sync, RRF search, configuration dashboard.
Phase 2 wired autotagging + duplicate detection end-to-end, added direct vectorization
for content items, and built the client tool invocation system for BaseAgent.

Phase 3 focuses on three themes:
1. **Knowledge Agent** — a real agent that uses the Knowledge Hub search and client tools
2. **Duplicate merge UX** — side-by-side comparison and field-level resolution
3. **Polish** — filling the remaining gaps for a production-quality experience

---

## Tasks

### THEME 1: Knowledge Agent + Chat Overlay

#### Task 1: Knowledge Agent as a Real BaseAgent Subclass
**Priority: High**

The KnowledgeAgent class exists but is a utility class, not a proper BaseAgent subclass.
It needs to be a registered agent that can run in the agent loop with access to Actions,
Client Tools, and Chat.

1.1. Refactor `KnowledgeAgent` to extend `BaseAgent`
1.2. Add `@RegisterClass(BaseAgent, 'KnowledgeAgent')` decorator
1.3. Create agent metadata in the DB (via metadata files, not migration):
     - Agent entity record with Name, Description, AgentTypeID (Loop)
     - Agent Actions: SearchKnowledge, RunAutotagPipeline, GetRecordDuplicates
     - Agent Client Tools: NavigateToRecord, SwitchDashboardTab, ShowSearchResults
1.4. The agent's system prompt should describe it as a knowledge assistant that can:
     - Search across all indexed content (vector + FTS + RRF)
     - Navigate the user to specific records
     - Trigger autotagging or duplicate detection pipelines
     - Answer questions about the data in the knowledge base
1.5. Create an AI Prompt entity for the agent's system prompt (metadata-driven)
1.6. Test via RunAIAgent GraphQL mutation

#### Task 2: Floating Chat Overlay Component
**Priority: High**

Build a floating chat panel that appears in the bottom-right corner of MJExplorer,
connected to the Knowledge Agent.

2.1. Create `mj-chat-agents-overlay` component in `ng-shared` or `ng-conversations`
2.2. Wire to `ConversationBridgeService` (already exists)
2.3. Show/hide via `IsChatOverlayReady` flag (already in explorer-app component)
2.4. Connect to KnowledgeAgent via `RunAIAgent` mutation
2.5. Subscribe to `ClientToolRequest` — when agent says "NavigateToRecord",
     the overlay's registered handler navigates the user
2.6. Stream agent responses in real-time
2.7. Support conversation history (load from Conversations entity)
2.8. The "Ask Knowledge Agent" CTA in the search tab should open this overlay
     with the search query pre-filled

#### Task 3: Register Default Client Tool Handlers in Angular
**Priority: High**

The client tool SDK is built but no Angular component registers handlers.

3.1. Create a global `ClientToolService` (Angular service, providedIn: root)
3.2. On app init, subscribe to `ClientToolRequests(sessionID)` via GraphQLDataProvider
3.3. Register handlers for default tools:
     - `NavigateToRecord` → NavigationService.OpenEntityRecord()
     - `SwitchDashboardTab` → WorkspaceStateManager tab switching
     - `ShowSearchResults` → Navigate to Knowledge Hub search with query param
     - `ShowEntityView` → Navigate to entity view
3.4. Register decorators for dynamic tools:
     - `ShowEntityForm` decorated with available entities from Metadata
     - `SwitchDashboardTab` decorated with current app's available tabs
3.5. Wire up the `AgentClientSession` decorator context on app init and when user
     navigates between apps

---

### THEME 2: Duplicate Merge UX

#### Task 4: Merge Preview Panel
**Priority: Medium**

When a user approves a duplicate group, they should see a side-by-side comparison
before the merge executes.

4.1. Create `DuplicateMergePreviewComponent` (dialog or slide-in panel)
4.2. Load both records as entity objects
4.3. Show field-by-field comparison with diff highlighting
4.4. Let user pick "surviving record" (which record keeps its ID)
4.5. Let user pick winning field values (per-field, not all-or-nothing)
4.6. Show a summary of what will happen: "Record A keeps ID, fields X/Y/Z from Record B"
4.7. On confirm, call `MergeRecords` GraphQL mutation
4.8. On success, update Kanban board (remove merged group, refresh counts)

#### Task 5: Run Detection End-to-End Fix
**Priority: Medium**

The Run Detection button exists but needs a `SourceListID` to work.

5.1. Add a "Create Detection List" option that auto-creates a List entity
     containing all records of the selected entity
5.2. Or: modify DuplicateRecordDetector to work without a list (detect against
     all records in the entity, paginated)
5.3. Wire the full flow: click Run Detection → progress bar → new results in Kanban

---

### THEME 3: Polish & Gaps

#### Task 6: Content Source CRUD in Autotagging Dashboard
**Priority: Medium**

6.1. Add "Add Source" button to the Content Sources panel
6.2. Create dialog for configuring a new content source:
     - Source type picker (RSS Feed, Website, Local File System)
     - URL/path input
     - Content type selector (with AI model)
     - Source-specific parameters (RSS: none, Website: MaxDepth/URLPattern, LocalFS: directory)
6.3. Edit existing sources (click on source in sidebar → edit dialog)
6.4. Delete source with confirmation
6.5. Save via MJ entity system (ContentSource, ContentSourceParam entities)

#### Task 7: Search Result Paging
**Priority: Low**

7.1. Add "Load More" button or infinite scroll to search results
7.2. Server already supports `maxResults` — add offset/cursor support
7.3. Client tracks page state and appends results

#### Task 8: Incremental Vector Sync
**Priority: Low**

8.1. Add scheduling configuration to EntityDocumentConfiguration
     (already defined in the types: `EntityDocumentSchedulingConfig`)
8.2. Create a scheduled job that checks for records modified since last sync
8.3. Only vectorize changed records (use `__mj_UpdatedAt` as change marker)
8.4. Wire into MJ's existing scheduling infrastructure

#### Task 9: Sync Button Completion Fix
**Priority: Low**

9.1. Investigate why PipelineProgress subscription events drop at ~29%
9.2. The idle-timer fallback works but the root cause should be fixed
9.3. May be PubSub backpressure or WebSocket buffering under load

---

## Regression Checklist

### Knowledge Agent
- [ ] Agent starts via RunAIAgent mutation
- [ ] Agent uses SearchKnowledge for queries
- [ ] Agent invokes NavigateToRecord client tool
- [ ] Agent conversation persists across sessions
- [ ] Chat overlay opens/closes correctly
- [ ] "Ask Knowledge Agent" CTA opens overlay with query

### Duplicate Merge
- [ ] Merge preview shows side-by-side comparison
- [ ] User can pick surviving record
- [ ] User can pick winning field values
- [ ] Merge executes and Kanban updates
- [ ] Run Detection creates results from scratch

### Autotagging
- [ ] Content source CRUD from dashboard
- [ ] New RSS source → Run Pipeline → items tagged + vectorized
- [ ] Search finds autotagged content

### Search
- [ ] Load More / paging works
- [ ] Results render with scores and entity icons
- [ ] Open Record navigates correctly

### Client Tools
- [ ] Angular handlers registered on app init
- [ ] Agent invokes NavigateToRecord → browser navigates
- [ ] Agent invokes SwitchDashboardTab → tab switches
- [ ] Decorator enriches ShowEntityForm with entity list

---

## Estimated Effort

| Theme | Tasks | Effort |
|-------|-------|--------|
| Knowledge Agent + Chat | Tasks 1-3 | Large (2-3 days) |
| Duplicate Merge UX | Tasks 4-5 | Medium (1-2 days) |
| Polish & Gaps | Tasks 6-9 | Medium (1-2 days) |
| **Total** | **9 tasks** | **~5-7 days** |
