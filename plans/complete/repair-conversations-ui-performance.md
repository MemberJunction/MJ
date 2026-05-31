# Repair Conversations UI Performance Regression

## ⚠️ Current Status (January 4, 2026)

**Polling is currently ENABLED** - We re-enabled it to avoid functional regression. The timer-based polling works but is inefficient. This plan documents the proper fix using PubSub.

### What's Been Done
1. **Analysis complete** - Root cause identified (timer-based polling instead of PubSub)
2. **Quick win implemented** - Optimized `restoreFromDatabase()` in `active-tasks.service.ts`:
   - Changed `ResultType` from `'entity_object'` to `'simple'` (no mutation needed)
   - Added `Fields` parameter to only fetch needed columns (avoids JSON blob transfer)
   - This makes the "Initializing..." phase noticeably faster

### What Needs To Be Done
- **Phase 2**: Replace timer polling with proper PubSub completion tracking
- **Phase 3**: Add manual refresh option for conversation list
- **Phase 4** (optional): Eliminate "Initializing..." delay on return navigation

### Key Files to Understand
| File | Purpose |
|------|---------|
| [conversation-chat-area.component.ts](packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts) | Main chat component - has the timer code to remove |
| [conversation-streaming.service.ts](packages/Angular/Generic/conversations/src/lib/services/conversation-streaming.service.ts) | PubSub handler - needs completion tracking added |
| [active-tasks.service.ts](packages/Angular/Generic/conversations/src/lib/services/active-tasks.service.ts) | Task restoration - already optimized |

---

## Quick Win: RunView Optimization Pattern

Before diving into the main fix, here's an important optimization pattern that was applied to `active-tasks.service.ts` and should be used throughout the codebase:

### When to Use `simple` vs `entity_object` ResultType

```typescript
// ❌ BEFORE - Using entity_object when only reading (SLOW)
const result = await rv.RunView<AIAgentRunEntity>({
    EntityName: 'MJ: AI Agent Runs',
    ExtraFilter: `Status='Running' AND UserID='${currentUser.ID}'`,
    ResultType: 'entity_object'  // Creates full BaseEntity objects - expensive!
}, currentUser);

// ✅ AFTER - Using simple with narrow fields (FAST)
const result = await rv.RunView<{ID: string; ConversationID: string; AgentID: string; Agent: string; ConversationDetailID: string}>({
    EntityName: 'MJ: AI Agent Runs',
    Fields: ['ID', 'ConversationID', 'AgentID', 'Agent', 'ConversationDetailID'],  // Only needed columns
    ExtraFilter: `Status='Running' AND UserID='${currentUser.ID}'`,
    ResultType: 'simple'  // Plain objects, no BaseEntity overhead
}, currentUser);
```

**Why this matters:**
- `entity_object` creates full BaseEntity subclass instances with getters/setters, validation, dirty tracking
- `simple` returns plain JavaScript objects - much faster for read-only operations
- `Fields` parameter excludes large columns (JSON blobs, nvarchar(max) fields) from the query

**Rule of thumb:**
- Use `entity_object` only when you need to call `.Save()`, `.Delete()`, or `.Validate()`
- Use `simple` + `Fields` for read-only lookups

See [CLAUDE.md - RunView ResultType and Fields Optimization](../CLAUDE.md#runview-resulttype-and-fields-optimization) for complete documentation.

---

## Problem Summary

A performance regression was introduced in the Conversations UI that causes excessive database queries when navigating between conversations. The in-app telemetry shows repeated RunView calls to entities like `MJ: AI Agent Run Steps`, `MJ: AI Agent Runs`, `MJ: Conversation Detail Attachments`, and `MJ: Conversation Detail Ratings` - sometimes 24+ queries with 15+ different filter combinations for a single entity.

**Root Cause**: A 1-second polling timer was introduced that repeatedly queries the database to detect message completion, instead of leveraging the existing PubSub/WebSocket infrastructure that already delivers these events in real-time.

---

## Commit History Analysis

### Original Introduction (November 6, 2025)

**Commit `9797e89f8`** by EL-BC:
```
"Agent completion detection and timer fix when user navigate away and back to an active conversation"
```

This commit introduced:
- `agentRunUpdateTimer` - a `setInterval` running every 1 second
- `previousMessageStatuses` Map - tracking message states
- `detectAndHandleCompletedMessages()` - polling logic

**The intent was valid**: Handle the scenario where a user navigates away from a conversation with an in-progress agent, and returns after it completes.

**The approach was problematic**: Instead of leveraging the existing PubSub infrastructure, a polling timer was introduced that queries the database every second.

### Recent Commits Making It Worse (December 29, 2025 - January 2, 2026)

**Commit `24ef32413`** - "Fix(conversations): reload in-progress messages from DB to detect completion after navigation"
- Added database reloads inside the timer loop
- Every in-progress message now triggers `message.Load(message.ID)` every second

**Commit `98937b11d`** - "Fix(conversations): invalidate cache when new message is added"
- Cache invalidation causing more reloads

**Commit `da0ed81fd`** - "perf: Optimize conversation data loading and task restoration"
- Ironically labeled "perf" but added more complexity to the timer-based approach

---

## Why This Approach Is Wrong

### 1. MemberJunction Already Has Real-Time PubSub

The codebase has a complete real-time event system:

```
GraphQLDataProvider.PushStatusUpdates()
    → WebSocket subscription
    → ConversationStreamingService.handlePushStatusUpdate()
    → Routes to registered callbacks
```

The backend sends `type: 'complete'` messages when agents finish. This infrastructure was already in place and working.

### 2. Session ID Persists Across Browser Refresh

`GraphQLDataProvider` stores the session UUID in localStorage ([graphQLDataProvider.ts:187-227](packages/GraphQLDataProvider/src/graphQLDataProvider.ts#L187-L227)):

```typescript
public async GetStoredSessionID(): Promise<string> {
    const ls = this.LocalStorageProvider;
    if (ls) {
        const key = this.LocalStoragePrefix + "sessionId";
        const storedSession = await ls.GetItem(key);
        return storedSession;
    }
    return null;
}
```

This means after browser refresh, the client reconnects with the **same session UUID** and receives all PubSub messages for in-progress operations. No polling needed.

### 3. Polling Creates Exponential Load

The current implementation:
- Runs every 1 second
- For **every** message that was ever "In-Progress", calls `message.Load()`
- Each load triggers RunView calls for related data
- The `previousMessageStatuses` map keeps entries, so the timer never stops properly
- Navigating between conversations compounds the problem

This is why telemetry shows 24+ queries for a single entity with 15+ different filter combinations.

### 4. The Real Problem Was Simpler

The actual issue: When navigating away, component callbacks are unregistered. When returning, if the agent completed while away, the UI doesn't reflect the final state.

**Correct solution**: Track completions at the service level (which persists across component lifecycle), not poll the database.

---

## The Fix

### Phase 1: Disable Timer Hack (Verification)

**Goal**: Confirm that disabling the timer resolves the performance regression before implementing the proper fix.

**Changes**:
1. In `conversation-chat-area.component.ts`:
   - Stub out `startAgentRunUpdateTimer()` to return immediately
   - This disables all timer-based polling

**Expected Result**:
- Dramatic reduction in RunView calls
- Faster navigation between conversations
- Temporary regression: Messages that complete while navigated away won't auto-update until page refresh

**Files Modified**:
- `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts`

### Phase 2: Implement Proper PubSub-Based Completion Tracking

**Goal**: Use the existing WebSocket infrastructure to track completions properly.

**Changes to `conversation-streaming.service.ts`**:
1. Add `completionEvents$` Subject for broadcasting completion events
2. Add `recentCompletions` Map to track completions for late-arriving components
3. In `routeAgentProgress()`, when `type === 'complete'`:
   - Store in `recentCompletions` with timestamp
   - Broadcast via `completionEvents$`
   - Auto-cleanup after 5 minutes
4. Add `getRecentCompletion()` method for components to check missed completions
5. Add `clearRecentCompletion()` method for cleanup after handling

**Changes to `conversation-chat-area.component.ts`**:
1. Remove all timer-related code:
   - `agentRunUpdateTimer` property
   - `previousMessageStatuses` Map
   - `startAgentRunUpdateTimer()` method
   - `stopAgentRunUpdateTimer()` method
   - `detectAndHandleCompletedMessages()` method
2. Subscribe to `streamingService.completions$` in `ngOnInit()`
3. Add `handleMessageCompletion()` method (extracted from timer logic)
4. In `buildMessagesFromCacheData()`, check for missed completions via `getRecentCompletion()`

### Phase 3: Add Refresh Conversations Feature

**Goal**: Allow users to manually refresh the conversation list when needed.

**Changes to `conversation-list.component.ts`**:
1. Add "Refresh List" option to the header dropdown menu (the "..." menu)
2. Implement `refreshConversationList()` method

**Changes to `conversation-data.service.ts`**:
1. Add `invalidateConversationsCache()` method

---

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `conversation-chat-area.component.ts` | 1 | Stub timer to verify fix |
| `conversation-chat-area.component.ts` | 2 | Remove timer, add completion subscription |
| `conversation-streaming.service.ts` | 2 | Add completion tracking |
| `conversation-list.component.ts` | 3 | Add refresh menu item |
| `conversation-data.service.ts` | 3 | Add cache invalidation |

---

## Testing Plan

### Phase 1 Testing
1. Navigate to Conversations UI
2. Open browser DevTools console
3. Navigate between conversations multiple times
4. **Verify**: No repeated RunView telemetry warnings
5. **Verify**: Navigation feels snappy
6. **Accept temporary regression**: Completions while away won't auto-update

### Phase 2 Testing
1. Start an agent task in Conversation A
2. Navigate to Conversation B while agent is running
3. Wait for agent to complete (monitor network tab for completion WebSocket message)
4. Navigate back to Conversation A
5. **Verify**: Message shows as complete with final content
6. **Verify**: Artifacts load correctly
7. **Verify**: No timer-based polling in network tab

### Phase 3 Testing
1. Have another user/session create a new conversation
2. Current UI won't show it (expected - cache)
3. Click "..." menu → "Refresh List"
4. **Verify**: New conversation appears

---

## Learning Resources

The following resources will help build understanding of the architectural patterns used in MemberJunction and modern web development:

### Real-Time Communication Patterns

1. **WebSockets vs Polling**
   - [WebSockets for Beginners](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
   - [Why WebSockets Beat Polling](https://ably.com/topic/websockets-vs-long-polling)
   - Key insight: Polling creates load proportional to frequency × clients. WebSockets push only when there's data.

2. **GraphQL Subscriptions**
   - [GraphQL Subscriptions Explained](https://www.apollographql.com/docs/react/data/subscriptions/)
   - This is exactly what `PushStatusUpdates()` uses under the hood.

### RxJS and Reactive Patterns

3. **RxJS Subjects and Observables**
   - [RxJS Subject Guide](https://rxjs.dev/guide/subject)
   - [Hot vs Cold Observables](https://benlesh.medium.com/hot-vs-cold-observables-f8094ed53339)
   - Understanding these is critical for Angular services that share data across components.

4. **Service-Level State Management**
   - [Angular Services as Singletons](https://angular.io/guide/singleton-services)
   - Services outlive components - use them to maintain state across navigation.

### Angular Component Lifecycle

5. **Component Lifecycle Hooks**
   - [Angular Lifecycle Hooks](https://angular.io/guide/lifecycle-hooks)
   - Understanding when components are created/destroyed helps design proper state management.

6. **Change Detection**
   - [Angular Change Detection Explained](https://blog.angular-university.io/how-does-angular-2-change-detection-really-work/)
   - The timer was also forcing change detection every second - very expensive.

### Performance Debugging

7. **Chrome DevTools Performance Tab**
   - [Analyze Runtime Performance](https://developer.chrome.com/docs/devtools/performance/)
   - Learn to identify excessive function calls and long tasks.

8. **Network Tab Analysis**
   - [Inspect Network Activity](https://developer.chrome.com/docs/devtools/network/)
   - Watch for repeated identical requests - a sign of polling or cache misses.

### Architecture Principles

9. **Push vs Pull Architecture**
   - When data changes on the server, prefer **push** (server tells client) over **pull** (client asks server repeatedly).
   - The existing `ConversationStreamingService` is a push architecture. The timer hack converted it to pull.

10. **Separation of Concerns**
    - Components handle UI rendering
    - Services handle data and state
    - The timer hack mixed data-fetching concerns into a UI component

---

## Summary

The performance regression was caused by introducing database polling where real-time PubSub already existed. This is a common mistake when developers aren't fully aware of the existing infrastructure.

The fix is straightforward:
1. Remove the polling timer
2. Track completion events at the service level
3. Components check for missed completions when they initialize

This maintains all existing functionality while eliminating the performance problem at its source.

---

## Additional Performance Concerns (Discovered Post-Phase 1)

After disabling the timer-based polling, the "Initializing..." spinner still causes noticeable delay when navigating back to the Conversations component. This section documents additional issues discovered during analysis.

### What Happens During "Initializing..." (Deep Dive)

When a user navigates to the Conversations component, the `ChatConversationsResource` shows "Initializing..." while blocking on `initializeEngines()`. Here's the exact execution flow:

#### Step 1: Component Initialization
```
ngOnInit() starts
├── Get current user from Metadata
├── Check mobile view state
├── Load sidebar state (async, non-blocking)
└── await initializeEngines()  ← BLOCKING - This is where "Initializing..." shows
```

#### Step 2: initializeEngines() - The Blocking Call
```typescript
// [chat-conversations-resource.component.ts:314-335]
await Promise.all([
    AIEngineBase.Instance.Config(false),           // ← HEAVY: 30+ entity queries
    this.conversationData.loadConversations(...),  // ← 1 query (with cache check)
    this.mentionAutocompleteService.initialize(...) // ← Calls AIEngineBase.Config again
]);
await this.activeTasksService.restoreFromDatabase(...); // ← 1 query for running agents
```

#### Step 3: AIEngineBase.Config() - The Real Bottleneck

`AIEngineBase.Config(false)` is the most expensive operation. It loads **30+ entities** in a single batched `RunViews()` call:

| Entity Name | Purpose |
|-------------|---------|
| AI Models | All available AI models |
| AI Model Types | Model type classifications |
| AI Prompts | All prompt templates |
| MJ: AI Prompt Models | Prompt-to-model mappings |
| AI Prompt Types | Prompt type classifications |
| AI Prompt Categories | Prompt category hierarchy |
| Vector Databases | Vector DB configurations |
| AI Agent Actions | Agent action definitions |
| AI Agent Note Types | Note type classifications |
| AI Agent Notes | Agent notes |
| MJ: AI Agent Examples | Agent example data |
| AI Agents | All agent definitions |
| MJ: AI Agent Relationships | Agent hierarchy |
| MJ: AI Agent Types | Agent type classifications |
| MJ: Artifact Types | Artifact type definitions |
| MJ: AI Vendor Type Definitions | Vendor type defs |
| MJ: AI Vendors | Vendor configurations |
| MJ: AI Model Vendors | Model-vendor mappings |
| MJ: AI Agent Prompts | Agent-prompt mappings |
| MJ: AI Model Costs | Model cost data |
| MJ: AI Model Price Types | Price type classifications |
| MJ: AI Model Price Unit Types | Price unit types |
| MJ: AI Configurations | AI configurations |
| MJ: AI Configuration Params | Configuration parameters |
| MJ: AI Agent Steps | Agent step definitions |
| MJ: AI Agent Step Paths | Step path configurations |
| MJ: AI Agent Permissions | Agent permissions |
| MJ: AI Agent Data Sources | Data source configs |
| MJ: AI Agent Configurations | Agent-specific configs |
| MJ: AI Credential Bindings | Credential mappings |
| MJ: AI Modalities | Modality definitions |
| MJ: AI Agent Modalities | Agent-modality mappings |
| MJ: AI Model Modalities | Model-modality mappings |

**Additionally**, `AIEngineBase.Config()` internally calls `TemplateEngineBase.Instance.Config(false)` which loads:
- Templates
- Template Categories
- Template Content Types
- Template Params
- Template Contents

#### Step 4: Why It's Slow on Return Navigation

The `Config(false)` parameter means "don't force refresh if already loaded." The `BaseEngine.Load()` method has this check:

```typescript
// [baseEngine.ts:306]
if (!this._loaded || forceRefresh) {
    // ... do all the loading ...
}
```

**Problem**: The AIEngineBase singleton **persists** across navigation, so it should only load once. However, testing shows the "Initializing..." still appears every time.

**Root Causes**:
1. **Component recreation**: `ChatConversationsResource` is destroyed when navigating away, and `ngOnInit()` runs again on return
2. **Async/await blocking**: Even though `AIEngineBase.Config()` returns quickly on subsequent calls (data is cached), the `await` still blocks rendering
3. **`isReady` flag reset**: Each component instance starts with `isReady = false`, showing the spinner until all awaits complete

#### Step 5: Other Operations During Initialization

After AIEngineBase loads, these additional operations run:

1. **`conversationData.loadConversations()`** - Has cache check: `if (this.conversations.length > 0) return;`
2. **`mentionAutocompleteService.initialize()`** - Has cache check AND calls `AIEngineBase.Instance.Config(false)` again (redundant but cached)
3. **`streamingService.initialize()`** - Quick, just sets up WebSocket subscription
4. **`activeTasksService.restoreFromDatabase()`** - **Always queries database** for running agent runs

### Performance Issues Summary Table

| Issue | Location | Trigger | Impact | Fix Priority |
|-------|----------|---------|--------|--------------|
| AIEngineBase loads 30+ entities | [BaseAIEngine.ts:115-289](packages/AI/BaseAIEngine/src/BaseAIEngine.ts#L115-L289) | First load only | HIGH on first load | LOW (working as designed) |
| `isReady` blocks rendering | [chat-conversations-resource.component.ts:186](packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/chat-conversations-resource.component.ts#L186) | Every navigation | MEDIUM | HIGH |
| `restoreFromDatabase()` always queries | [active-tasks.service.ts:212-271](packages/Angular/Generic/conversations/src/lib/services/active-tasks.service.ts#L212-L271) | Every navigation | MEDIUM | HIGH |
| Duplicate AIEngineBase.Config calls | mentionAutocompleteService + initializeEngines | Every navigation | LOW (cached) | LOW |

### Proposed Improvements (Future Phases)

#### Phase 4: Eliminate "Initializing..." Delay on Return Navigation

**Goal**: Remove the visible "Initializing..." spinner when returning to Conversations (after first successful load).

**Approach 1: Track Global Initialization State**
```typescript
// In a shared service or static property
private static _globallyInitialized: boolean = false;

async ngOnInit() {
    if (ChatConversationsResource._globallyInitialized) {
        // Skip all async waits, render immediately
        this.isReady = true;
        return;
    }
    // ... existing initialization ...
    ChatConversationsResource._globallyInitialized = true;
}
```

**Approach 2: Make `restoreFromDatabase()` Session-Aware**
```typescript
// In ActiveTasksService
private _hasRestoredThisSession: boolean = false;

async restoreFromDatabase(currentUser: UserInfo): Promise<void> {
    if (this._hasRestoredThisSession) {
        return; // Only restore once per browser session
    }
    this._hasRestoredThisSession = true;
    // ... existing code ...
}
```

**Approach 3: Non-Blocking Initialization**
- Set `isReady = true` immediately for return visits
- Run initialization in background without blocking render
- Show subtle loading indicator only if data is stale

### Files Involved in Initialization

| File | Role |
|------|------|
| [chat-conversations-resource.component.ts](packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/chat-conversations-resource.component.ts) | Parent component, owns `isReady` flag |
| [BaseAIEngine.ts](packages/AI/BaseAIEngine/src/BaseAIEngine.ts) | Loads 30+ AI-related entities |
| [baseEngine.ts](packages/MJCore/src/generic/baseEngine.ts) | Base class with `Load()` method |
| [active-tasks.service.ts](packages/Angular/Generic/conversations/src/lib/services/active-tasks.service.ts) | Restores running tasks from DB |
| [conversation-data.service.ts](packages/Angular/Generic/conversations/src/lib/services/conversation-data.service.ts) | Loads conversation list |
| [mention-autocomplete.service.ts](packages/Angular/Generic/conversations/src/lib/services/mention-autocomplete.service.ts) | Initializes @mention data |
| [conversation-streaming.service.ts](packages/Angular/Generic/conversations/src/lib/services/conversation-streaming.service.ts) | Sets up WebSocket |

---

## Implementation Hints for Phase 2

### Step-by-Step Guide

1. **Start with `conversation-streaming.service.ts`**
   - Search for `routeAgentProgress` method - this is where completion events arrive
   - Look for `type === 'complete'` handling
   - Add a `BehaviorSubject` or `Subject` to broadcast completions
   - Add a `Map<string, {messageId: string, timestamp: Date}>` to track recent completions

2. **Then modify `conversation-chat-area.component.ts`**
   - Search for `startAgentRunUpdateTimer` - this is the timer to remove
   - Search for `previousMessageStatuses` - this Map tracks message states for polling
   - In `ngOnInit`, subscribe to the new completion events from streaming service
   - In `ngOnDestroy`, unsubscribe

3. **Key insight**: The streaming service is a singleton that persists across navigation. The component is destroyed/recreated. Put state that needs to survive navigation in the service.

### Code Pattern for Completion Tracking

```typescript
// In conversation-streaming.service.ts
private recentCompletions = new Map<string, { messageId: string; timestamp: Date }>();
public completionEvents$ = new Subject<{ messageId: string; agentRunId: string }>();

// In routeAgentProgress(), when type === 'complete':
this.recentCompletions.set(messageId, { messageId, timestamp: new Date() });
this.completionEvents$.next({ messageId, agentRunId });

// Cleanup old completions (call periodically or on new completion)
private cleanupOldCompletions() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of this.recentCompletions) {
    if (data.timestamp.getTime() < fiveMinutesAgo) {
      this.recentCompletions.delete(id);
    }
  }
}

// Method for components to check missed completions
public getRecentCompletion(messageId: string) {
  return this.recentCompletions.get(messageId);
}
```

### Testing Tips

1. Use Chrome DevTools Network tab to watch for WebSocket messages
2. Filter by "WS" to see only WebSocket traffic
3. Look for messages with `type: 'complete'` in the payload
4. The telemetry warnings in console will tell you if polling is still happening

---

*Plan created: January 4, 2026*
*Updated: January 4, 2026 - Added current status, optimization pattern, and implementation hints*
*Author: Claude (AI Assistant)*
*For review by: Project Lead*
