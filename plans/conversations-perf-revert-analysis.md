# Analysis: Reverted Commit `be1434dd` - PubSub Completion Tracking

> **Reverted By**: `a0a85100a31abdd47ea2d56794fb4f217de4516d`
> **Original Goal**: Eliminate 1-second timer polling that caused 24+ RunView queries per entity
> **Outcome**: Reverted due to three regressions
> **Date**: 2026-01-07

---

## Background and Context

The original commit attempted to solve a significant performance problem in the Conversations UI. Every second, a timer would poll the database to check if any in-progress agent messages had completed. This polling approach worked reliably but generated excessive database queries—telemetry showed 24+ identical RunView calls per entity during a single conversation session. The commit's goal was to replace this inefficient polling with a PubSub-based approach where the server would push completion events to the client via WebSocket, eliminating the need for constant database queries.

The approach was architecturally sound. PubSub completion events are more efficient and provide real-time updates. However, the implementation had gaps that manifested as three user-reported regressions, ultimately requiring a full revert.

---

## Reported Regressions

The following issues were reported after the commit was deployed:

**Artifact Display Regression**: When a user clicked on an artifact, navigated away to do something else, and then returned to the same conversation, the artifact would no longer be visible. This was the most severe regression because it affected core functionality—users rely on artifacts being persistently available in their conversations.

**Refresh Conversations Failure**: A "Refresh List" menu option had been added to the conversation list context menu. After the commit, clicking this option had no visible effect. The conversation list would not update to show new conversations or reflect changes made elsewhere.

**Backend-Started Conversations Invisible**: Conversations created by backend processes (such as the automated testing framework) were not picked up by the UI. Users would only see these conversations after performing a full page refresh, which defeats the purpose of having a dynamic, real-time interface.

---

## File-by-File Analysis

The reverted commit modified four files. This section analyzes each file's changes, identifies what caused the regressions, and evaluates what should be salvaged for a future re-implementation.

---

### Conversation Streaming Service (`conversation-streaming.service.ts`)

This file received the most significant additions. The commit introduced infrastructure for tracking and broadcasting completion events, which was the foundation of the PubSub-based approach.

#### What Was Added

The commit added three new data structures to the service. First, a `recentCompletions` Map that stores completion events with timestamps, keyed by `conversationDetailId`. This was designed to handle the "late-arriving component" scenario—when a user navigates away during agent execution and returns after completion, the component needs to know that completion already happened. The Map stores completions for up to 5 minutes so returning components can check if they missed anything.

Second, a `completionEvents$` Subject was added to provide a reactive stream of completion events. Components can subscribe to this Subject and receive real-time notifications when any agent completes, without needing to poll.

Third, a `agentRunIdToDetailId` Map was added as a reverse lookup mechanism. This was the problematic addition that caused the artifact regression. The intent was to build a mapping from `agentRunId` to `conversationDetailId` during progress updates, so that when completion events arrived (which only contain `agentRunId`), the service could look up the corresponding `conversationDetailId`.

#### The Root Cause of the Artifact Regression

The completion event payload from the backend has a specific structure that the implementation did not fully account for. When an agent completes, the backend publishes a message containing `type: 'complete'`, `agentRunId` (always present), and optionally an `agentRun` object that may or may not contain `ConversationDetailID`. In practice, the `agentRun` object is frequently undefined or incomplete in completion messages—the backend was designed to send minimal payloads for completion events.

The reverted code attempted to resolve `conversationDetailId` through a two-step process: first, check if `agentRun?.ConversationDetailID` exists; if not, fall back to the reverse lookup Map. The problem is that the reverse lookup Map is only populated during *progress* updates, not during agent initialization. This creates several failure scenarios.

If an agent completes very quickly without emitting progress updates (a "fast completion"), the Map is never populated for that agent. If the user's component wasn't mounted during progress updates (because they navigated away), the Map entries are lost when the component destroys. Race conditions can also occur where the completion message arrives before any progress messages. In all these scenarios, the `conversationDetailId` cannot be resolved, the completion event is not broadcast, and the `handleMessageCompletion()` method is never called—which means `reloadArtifactsForMessage()` never executes and artifacts don't load.

#### Evaluation of What to Keep

The `completionEvents$` Subject and the `recentCompletions` Map (along with its helper methods `getRecentCompletion()`, `clearRecentCompletion()`, and `cleanupOldCompletions()`) should be kept. These are well-designed pieces of infrastructure that solve real problems. The Subject provides a clean reactive pattern for completion notifications, and the Map handles the navigation scenario correctly once completions are actually stored in it.

The `agentRunIdToDetailId` reverse lookup Map should be discarded. It was the root cause of the artifact regression and cannot be made reliable with the current backend payload structure. A different approach is needed to resolve `agentRunId` to `conversationDetailId`.

#### Decision: Backend Will Include `conversationDetailId` in Completion Messages

The solution is to fix the root cause: modify the backend to always include `conversationDetailId` in completion messages. This eliminates the need for any client-side lookup or reverse mapping.

**Backend Change** (`RunAIAgentResolver.ts` lines 519-524):

```typescript
// Current (problematic - missing conversationDetailId):
const completeMsg: AgentExecutionStreamMessage = {
    sessionId,
    agentRunId: result.agentRun?.ID || 'unknown',
    type: 'complete',
    timestamp: new Date()
};

// Fixed (includes the ID we need):
const completeMsg: AgentExecutionStreamMessage = {
    sessionId,
    agentRunId: result.agentRun?.ID || 'unknown',
    conversationDetailId: result.agentRun?.ConversationDetailID,  // ← ADD THIS
    type: 'complete',
    timestamp: new Date()
};
```

**Also add the property to the class** (`AgentExecutionStreamMessage` around line 130):

```typescript
// Not a GraphQL field - used internally for completion routing
conversationDetailId?: string;
```

**Client-side** (`conversation-streaming.service.ts`) will read it directly:

```typescript
if (type === 'complete') {
    const agentRunId = statusObj.data?.agentRunId;
    const conversationDetailId = statusObj.data?.conversationDetailId;  // ← READ DIRECTLY
    // Now we can reliably broadcast completion events
}
```

This is the cleanest solution because:
1. The backend already has access to `result.agentRun.ConversationDetailID` at the point where the completion message is constructed
2. No client-side lookup, no race conditions, no reverse mapping needed
3. The client simply uses the data the server provides

---

### Conversation Chat Area Component (`conversation-chat-area.component.ts`)

This component is the main chat UI and contained the timer-based polling logic that the commit attempted to replace. The changes here were substantial—removing approximately 195 lines of timer-related code and adding 102 lines of PubSub-based code.

#### What Was Removed

The commit removed the entire timer infrastructure: the `agentRunUpdateTimer` property that held the interval reference, the `previousMessageStatuses` Map that tracked which messages were in-progress (to detect when they completed), the `startAgentRunUpdateTimer()` method that created a 1-second interval, the `stopAgentRunUpdateTimer()` method that cleared it, and the `detectAndHandleCompletedMessages()` method that ran on each timer tick to check for completions.

The timer-based approach worked by maintaining a Map of message IDs to their last-known status. On each tick, it would reload each in-progress message from the database (`await message.Load(message.ID)`), compare the current status to the previous status, and if a message transitioned from "In-Progress" to "Complete", it would call `reloadArtifactsForMessage()`, `reloadMessagesForActiveConversation()`, and handle the UI updates. This was reliable but expensive—polling every second meant constant database queries.

#### What Was Added

The commit added a subscription to the streaming service's `completionEvents$` Subject. When a completion event arrives, the component finds the corresponding message in its local array and calls a new `handleMessageCompletion()` method. It also added logic in `buildMessagesFromCache()` to check for "missed completions" when the component mounts—if a message is marked as In-Progress but the streaming service has a recent completion for it, the component handles that completion immediately.

The `handleMessageCompletion()` method was extracted from the old `detectAndHandleCompletedMessages()` logic. It reloads the message and agent run from the database, calls `reloadArtifactsForMessage()`, calls `reloadMessagesForActiveConversation()` to discover any delegated agent messages, updates the `inProgressMessageIds` array, auto-opens the artifact panel if the completed message has artifacts, removes the task from the active tasks service, and triggers change detection. This method is well-structured and should be kept.

#### Why Complete Timer Removal Caused Problems (In the Original Implementation)

In the original reverted commit, the PubSub mechanism wasn't reliable because of the reverse lookup problem described above. When the client couldn't resolve `agentRunId` to `conversationDetailId`, the completion event was silently dropped—no broadcast, no artifact reload, no UI update. The timer had served as a safety net that would eventually catch these missed completions.

However, this analysis changes now that we're fixing the root cause. With the backend sending `conversationDetailId` directly in completion messages, PubSub becomes reliable. The reverse lookup is no longer needed, so the failure mode that caused the original regression is eliminated.

#### Evaluation of What to Keep

The `handleMessageCompletion()` method should definitely be kept. It's a clean extraction of the completion handling logic and will be needed regardless of how completions are detected. The `completionEvents$` subscription logic should also be kept—it's the correct way to handle PubSub events. The "missed completions" check in `buildMessagesFromCache()` should be kept as well; it correctly handles the navigation scenario.

#### Decision: Full PubSub with No Timer

With the backend fix in place (sending `conversationDetailId` directly), we will go full PubSub with no timer fallback. This achieves the original performance goal completely—eliminating all polling-related database queries.

**Why this is now safe:**

1. **Root cause is fixed**: The original failure was due to unreliable `conversationDetailId` resolution. With the backend sending this value directly, every completion event will have the data we need.

2. **No more reverse lookup**: We're discarding the `agentRunIdToDetailId` Map entirely. The client reads `conversationDetailId` directly from the completion message.

3. **Navigation scenario handled**: The `recentCompletions` Map stores completions for 5 minutes, so if a user navigates away and returns after completion, the component can check for missed completions on mount.

4. **WebSocket reliability**: PubSub runs over a persistent WebSocket connection. If the connection drops, the streaming service already has reconnection logic. And if a completion is truly missed (connection was down during the exact moment of completion), the user can refresh the page as a last resort—this is an edge case, not the common path.

**Code to remove:**

- `agentRunUpdateTimer` property
- `previousMessageStatuses` Map
- `startAgentRunUpdateTimer()` method
- `stopAgentRunUpdateTimer()` method
- `detectAndHandleCompletedMessages()` method
- All calls to `startAgentRunUpdateTimer()` and `stopAgentRunUpdateTimer()`

---

### Agent State Service (`agent-state.service.ts`)

This service manages agent state and provides real-time updates for active agents. It polls the database periodically (every 30 seconds) to check for running agents. The commit added optimization logic to prevent duplicate queries.

#### What Was Added

The commit added two new properties: `currentPollingConversationId` to track which conversation is currently being polled, and `queriedConversationIds` as a Set to track which conversations have already been queried during this session.

The logic in `startPolling()` was modified to check if polling is already active for the requested conversation ID. If so, it returns early—this prevents redundant polling restarts when the component re-renders or the input changes to the same value. This optimization is good and caused no regressions.

However, the commit also added logic to skip the initial `loadActiveAgents()` query if the conversation ID is already in the `queriedConversationIds` Set. The idea was to prevent duplicate queries when a user navigates back to a previously-visited conversation. The problem is that the Set is never cleared, which caused two of the three reported regressions.

#### Why the Cache Caused Regressions

The `queriedConversationIds` Set is populated whenever a conversation's agents are queried, but it's never cleared during the session. This creates problems in several scenarios.

For the "Refresh Conversations" regression: When the user clicks the refresh menu option, `ConversationDataService.refreshConversations()` is called. This method clears its internal cache and reloads conversations from the database. However, `AgentStateService` knows nothing about this refresh. Its `queriedConversationIds` Set still contains all the previously-queried conversation IDs. When the user then navigates to a conversation, the service sees that the conversation ID is in the Set and skips the agent state query—even though the data might have changed.

For the "Backend-Started Conversations" regression: When a backend process (like the testing framework) creates a new conversation, it exists in the database but the client's conversation list is stale. Even if the user somehow navigates to this new conversation (perhaps via a direct link), the agent state service might have the ID in its Set from a previous query that returned no results, and it will skip querying again.

#### Evaluation of What to Keep

The `currentPollingConversationId` check should be kept. It correctly prevents redundant polling restarts and has no negative effects.

The `queriedConversationIds` Set optimization is a good idea but needs a cache invalidation mechanism. Without the ability to clear or expire entries, it causes the regressions we saw. We should either add invalidation or remove the optimization entirely.

#### Question: How Should We Handle Cache Invalidation?

The `queriedConversationIds` Set caused regressions because it never clears. There are several ways to fix this.

**Option A** would be to clear the Set when `refreshConversations()` is called. This directly addresses the "Refresh Conversations" regression. We would add a `clearQueryCache()` method to `AgentStateService` and call it from `ConversationDataService.refreshConversations()`. This is simple and targeted.

**Option B** would be to add time-based expiry. Entries in the Set would expire after a certain time (perhaps 5 minutes). This automatically handles staleness without requiring explicit cache invalidation. However, it's more complex to implement and may not align perfectly with user expectations.

**Option C** would be to remove the `queriedConversationIds` optimization entirely. This is the safest approach—we simply query every time. The performance cost is one additional query when navigating to a previously-visited conversation, which is minimal. Sometimes the simplest fix is to remove the optimization that's causing problems.

**Option D** would be to clear the Set on specific events: conversation creation, conversation deletion, or when the conversation list changes. This is more granular but also more complex.

My recommendation is Option A, possibly combined with Option C if we want to be conservative. The optimization provides marginal benefit (saving one query per conversation navigation) but introduces significant complexity and failure modes. What's your preference?

---

### Conversation Message Rating Component (`conversation-message-rating.component.ts`)

This component displays user ratings on conversation messages. The commit made a minor change to how ratings are represented.

#### What Was Changed

The `ratings` property was changed from `RatingJSON[] = []` (initialized to an empty array) to `RatingJSON[] | null = null` (initialized to null). This allows the component to distinguish between "ratings haven't been loaded yet" (null) and "ratings have been loaded but there are none" (empty array).

This is a standard pattern for representing loading states and is unambiguously correct. It allows the UI to show different states—perhaps a loading indicator when ratings are null, versus a "no ratings" message when ratings is an empty array.

#### Evaluation

This change should be kept. It's a small improvement with no regressions. It wasn't related to any of the reported issues.

---

## Summary of Recommendations

Based on this analysis and the decisions made, here is what we will keep, discard, and implement.

### Decisions Made

1. **Backend will send `conversationDetailId` in completion messages** - This fixes the root cause of the artifact regression. No client-side lookup or reverse mapping needed.

2. **Full PubSub with no timer** - With the backend fix in place, PubSub is reliable. We will remove the timer infrastructure entirely, achieving the original performance goal of eliminating polling queries.

### Code to Keep (No Regressions, Valuable)

The `completionEvents$` Subject in the streaming service should be kept. It's a clean reactive pattern that allows components to subscribe to completion events without tight coupling.

The `recentCompletions` Map and its helper methods (`getRecentCompletion()`, `clearRecentCompletion()`, `cleanupOldCompletions()`) should be kept. These correctly handle the navigation scenario where a component mounts after a completion has already occurred.

The `handleMessageCompletion()` method in the chat area component should be kept. It's a well-structured extraction of completion handling logic that will be needed regardless of how completions are detected.

The `currentPollingConversationId` check in the agent state service should be kept. It correctly prevents redundant polling restarts.

The nullable ratings array change should be kept. It's a small improvement with no downsides.

### Code to Discard (Caused Regressions or No Longer Needed)

The `agentRunIdToDetailId` reverse lookup Map should be discarded. It was the root cause of the artifact regression. With the backend now sending `conversationDetailId` directly, this Map is unnecessary.

The timer infrastructure should be removed entirely:
- `agentRunUpdateTimer` property
- `previousMessageStatuses` Map
- `startAgentRunUpdateTimer()` method
- `stopAgentRunUpdateTimer()` method
- `detectAndHandleCompletedMessages()` method

The `queriedConversationIds` Set optimization should be discarded or significantly reworked. Without cache invalidation, it caused the refresh and backend conversation regressions.

### Remaining Question: Cache Invalidation for `queriedConversationIds`

The `queriedConversationIds` Set in `AgentStateService` caused two regressions because it never clears. Options:

**Option A**: Clear the Set when `refreshConversations()` is called (simple, targeted fix)

**Option B**: Add time-based expiry (more complex)

**Option C**: Remove the optimization entirely (safest, marginal performance cost)

**Option D**: Clear on specific events like conversation creation/deletion (more granular, complex)

What's your preference for handling this?

---

## Appendix: Code Reference

For reference, here is the key code that should be salvaged from the reverted commit.

### Streaming Service Infrastructure

```typescript
// Properties to add to ConversationStreamingService
private recentCompletions = new Map<string, {
  conversationDetailId: string;
  agentRunId: string;
  timestamp: Date;
}>();

public completionEvents$ = new Subject<{
  conversationDetailId: string;
  agentRunId: string;
}>();

// Methods to add
public getRecentCompletion(conversationDetailId: string): { agentRunId: string } | undefined {
  const completion = this.recentCompletions.get(conversationDetailId);
  return completion ? { agentRunId: completion.agentRunId } : undefined;
}

public clearRecentCompletion(conversationDetailId: string): void {
  this.recentCompletions.delete(conversationDetailId);
}

private cleanupOldCompletions(): void {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of this.recentCompletions) {
    if (data.timestamp.getTime() < fiveMinutesAgo) {
      this.recentCompletions.delete(id);
    }
  }
}
```

### Completion Handler Method

```typescript
// Method to add to ConversationChatAreaComponent
private async handleMessageCompletion(
  message: ConversationDetailEntity,
  agentRunId: string
): Promise<void> {
  // Reload message from database to get final content
  await message.Load(message.ID);

  // Reload agent run to get final status
  const agentRun = this.agentRunsByDetailId.get(message.ID);
  if (agentRun?.ID) {
    await agentRun.Load(agentRun.ID);
  }

  // Reload artifacts for this message
  await this.reloadArtifactsForMessage(message.ID);

  // Reload messages to discover any delegated agents
  await this.reloadMessagesForActiveConversation();

  // Update in-progress tracking
  this.inProgressMessageIds = this.messages
    .filter(m => m.Status === 'In-Progress')
    .map(m => m.ID);

  // Auto-open artifact panel if message has artifacts
  if (this.artifactsByDetailId.has(message.ID) && !this.showArtifactPanel) {
    const artifacts = this.artifactsByDetailId.get(message.ID);
    if (artifacts?.length) {
      this.selectedArtifactId = artifacts[artifacts.length - 1].artifactId;
      this.showArtifactPanel = true;
      await this.loadArtifactPermissions(this.selectedArtifactId);
    }
  }

  // Remove from active tasks
  const task = this.activeTasks.getByConversationDetailId(message.ID);
  if (task) {
    this.activeTasks.remove(task.id);
  }

  // Trigger re-render
  this.messages = [...this.messages];
  this.cdr.detectChanges();
}
```

---

## New Issue Found: ConversationDetail.Status Race Condition

> **Discovered**: 2026-01-08
> **Severity**: High - causes permanent data inconsistency
> **Symptom**: When browser refreshes during agent execution, ConversationDetail.Status stays 'In-Progress' even after agent completes

### The Problem

During testing of the PubSub implementation, we discovered that 1 in 4 agent runs resulted in the ConversationDetail record having `Status='In-Progress'` even though the AIAgentRun record showed `Status='Completed'`. The UI timer would spin forever because it checks ConversationDetail.Status.

### Investigation Findings

**Server logs showed:**
```
{operationName: 'UpdateMJConversationDetail', variables: {…}}
Status = 'In-Progress'   ← Progress update saving In-Progress
...
Updating agent response detail with final result
Updated agent response detail 0E8F453E-... with final status: Complete
```

The server logged "Updated ... with final status: Complete" but the database had `Status='In-Progress'`. Critically, we only saw ONE `UpdateMJConversationDetail` mutation (the progress update), not a second one for the final status update.

### Root Cause Analysis

The issue is a **client-server race condition** in progress persistence:

**Current Architecture (Inconsistent):**

| Flow Type | Who Saves Progress? | Who Saves Final Status? |
|-----------|---------------------|-------------------------|
| Server-created conversation | Server (AgentRunner.ts) | Server (AgentRunner.ts) |
| UI-initiated conversation | **Client** (message-input.component.ts) | Server (AgentRunner.ts) |

For UI-initiated flows:
1. Client creates ConversationDetail with `Status='In-Progress'`
2. Server executes agent, streams progress via PubSub
3. **Client receives progress, saves entire entity** including `Status='In-Progress'`
4. Server finishes, tries to save `Status='Complete'`
5. **Client's late progress save OVERWRITES server's status**

**The Race Condition Timeline:**
```
t=0: Client creates entity (Status='In-Progress')
t=1: Server starts execution, streams progress
t=2: Client receives progress, saves (Status='In-Progress') ✓
t=3: Server finishes, saves (Status='Complete') ✓
t=4: Late/queued progress update arrives at client
t=5: Client's entity still has Status='In-Progress' in memory
     safeSaveConversationDetail checks in-memory value → passes
t=6: Client saves (Status='In-Progress') → OVERWRITES server's 'Complete' ✗
```

**Why `safeSaveConversationDetail` doesn't prevent this:**

```typescript
// message-input.component.ts:814-825
private async safeSaveConversationDetail(
  detail: ConversationDetailEntity,
  context: string
): Promise<boolean> {
  // Checks CLIENT'S in-memory value, not database value!
  if (detail.Status === 'Complete' || detail.Status === 'Error') {
    return false;
  }
  await detail.Save();  // Saves entire entity including stale Status
  return true;
}
```

The check uses the client's cached entity value, which is stale. The client never reloads the entity before saving, so it doesn't know the server already updated the status.

### The Architectural Question

**Why is the client persisting progress updates at all?**

Looking at `AgentRunner.ts` lines 309-321:
```typescript
const wrappedOnProgress = serverCreatedAgentResponse && agentResponseDetail
    ? async (progress: any) => {
        agentResponseDetail.Message = progress.message;
        await agentResponseDetail.Save();  // Server saves for server-created flows
    }
    : originalOnProgress;  // Just passes through for UI flows
```

The server only saves progress for server-created conversations. For UI-initiated flows, progress persistence is delegated to the client via the streaming callback. This design choice has several implications:

**Arguments for client-side persistence:**
- Client has the entity already loaded
- Reduces server load
- Progress is saved immediately as it streams

**Arguments against (why this is problematic):**
- Creates race conditions with server's final status update
- Client saves the entire entity, including stale fields
- Inconsistent behavior between server-created and UI-initiated flows
- Client can overwrite server's authoritative data

### Potential Solutions

**Option A: Server Persists ALL Progress (Recommended)**

Make the server responsible for ALL ConversationDetail persistence, regardless of flow type:

```typescript
// AgentRunner.ts - Remove the serverCreatedAgentResponse check
const wrappedOnProgress = agentResponseDetail
    ? async (progress: any) => {
        agentResponseDetail.Message = progress.message;
        await agentResponseDetail.Save();
    }
    : originalOnProgress;
```

Client-side streaming callback would ONLY update UI display, never call `Save()`:

```typescript
// message-input.component.ts - Remove save from streaming callback
private createMessageProgressCallback(messageId: string) {
  return async (progress: MessageProgressUpdate) => {
    const message = await this.dataCache.getConversationDetail(messageId);
    if (!message || message.Status !== 'In-Progress') return;

    // Update display only - don't persist
    message.Message = progress.message;
    this.messageSent.emit(message);  // Trigger UI update
    this.activeTasks.updateStatusByConversationDetailId(message.ID, progress.message);
    // NO Save() call!
  };
}
```

**Pros:**
- Clean separation: Server owns data, client owns display
- No race conditions - server is single source of truth
- Consistent behavior for all flow types

**Cons:**
- More server-side save calls
- If server save fails, progress is lost (but final message still saves)

**Option B: Client Only Saves Message Field**

Modify `safeSaveConversationDetail` to only save the `Message` field, not the entire entity:

```typescript
// Would require MemberJunction to support partial updates
await detail.SaveFields(['Message']);  // Hypothetical API
```

**Pros:**
- Client can still persist progress
- Won't overwrite server's Status updates

**Cons:**
- Requires framework changes (partial saves)
- Still inconsistent architecture

**Option C: Client Reloads Before Save**

Before saving, client checks current database state:

```typescript
private async safeSaveConversationDetail(detail, context) {
  // Reload to get current DB state
  const currentStatus = await this.checkStatusFromDB(detail.ID);
  if (currentStatus === 'Complete' || currentStatus === 'Error') {
    return false;  // Server already finalized
  }
  await detail.Save();
  return true;
}
```

**Pros:**
- Works with current architecture

**Cons:**
- Extra DB round-trip per progress update
- Still has tiny race window between check and save

**Option D: Unregister Callback on Completion**

When completion event arrives, immediately unregister the streaming callback before any late updates can trigger:

```typescript
// In completion handler
this.streamingService.unregisterMessageCallback(messageId, callback);
// Then handle completion
```

**Pros:**
- Simple fix

**Cons:**
- Race condition still exists if late update arrives before completion event
- Doesn't address architectural inconsistency

### Recommendation

**Option A (Server Persists ALL Progress)** is the cleanest solution because:

1. **Single source of truth**: Server owns all data persistence
2. **No race conditions**: Client can't overwrite server data
3. **Consistent architecture**: Same flow for all conversation types
4. **Simpler client code**: Streaming callback just updates UI

The downside (more server saves) is minimal - progress updates are already happening server-side for PubSub streaming; we're just adding a database save. And if the server-side save fails, the final completion save will still work (it reloads the entity first).

### Implementation: Option A Selected and Implemented

**Decision Date:** 2026-01-08

After analyzing all options, **Option A (Server Persists ALL Progress)** was implemented as it provides the cleanest architectural solution.

#### Changes Made

**1. Server-side (AgentRunner.ts)**

Removed the `serverCreatedAgentResponse` check so the server ALWAYS saves progress:

```typescript
// BEFORE (lines 307-321):
const wrappedOnProgress = serverCreatedAgentResponse && agentResponseDetail
    ? async (progress: any) => { ... }
    : originalOnProgress;

// AFTER:
const wrappedOnProgress = agentResponseDetail
    ? async (progress: any) => {
        // Update the agent response detail with progress message
        if (agentResponseDetail && progress.message) {
            agentResponseDetail.Message = progress.message;
            await agentResponseDetail.Save();
        }
        // Call original callback if provided
        if (originalOnProgress) {
            await originalOnProgress(progress);
        }
    }
    : originalOnProgress;
```

Also removed the now-unused `serverCreatedAgentResponse` variable declaration and assignment.

**2. Client-side (message-input.component.ts)**

Removed `Save()` calls from BOTH progress callbacks:

**In `createMessageProgressCallback`** (PubSub streaming callback, around line 288):
```typescript
// BEFORE:
const saved = await this.safeSaveConversationDetail(message, `StreamingProgress:${progress.taskName || 'Agent'}`);
if (saved) {
  this.messageSent.emit(message);
  this.activeTasks.updateStatusByConversationDetailId(message.ID, progress.message);
}

// AFTER:
// Server now saves progress - client only updates in-memory and emits for UI
this.messageSent.emit(message);
this.activeTasks.updateStatusByConversationDetailId(message.ID, progress.message);
```

**In `createProgressCallback`** (direct agent execution callback, around line 893):
```typescript
// BEFORE:
const saved = await this.safeSaveConversationDetail(conversationDetail, `Progress:${agentName}`);
if (saved) {
  this.messageSent.emit(conversationDetail);
}

// AFTER:
// Server now saves progress - client only updates in-memory and emits for UI
this.messageSent.emit(conversationDetail);
```

**Also removed the now-unused `safeSaveConversationDetail` method** (lines 805-823).

#### Benefits of This Implementation

1. **No more race conditions**: Server is the single source of truth for ConversationDetail persistence
2. **Consistent architecture**: Same flow for all conversation types (server-created and UI-initiated)
3. **Simpler client code**: Streaming callbacks only update UI, don't persist data
4. **Clean separation of concerns**: Server owns data, client owns display

#### Files Modified

| File | Change |
|------|--------|
| `packages/AI/Agents/src/AgentRunner.ts` | Removed `serverCreatedAgentResponse` check, always save progress server-side |
| `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts` | Removed `Save()` calls from progress callbacks, removed unused `safeSaveConversationDetail` method |

#### Additional Fix: Late Progress Callback Race Condition

**Discovered:** 2026-01-08 (during testing)

**Problem:** Even with server-side progress saves, the ConversationDetail.Status was still sometimes stuck at 'In-Progress'. The issue was that progress callbacks fire asynchronously from the agent and may not be awaited by the agent's internal code. This means a progress callback could complete AFTER the agent returns and AFTER the final status save, overwriting Status='Complete' back to 'In-Progress'.

**Timeline of the race:**
```
t=0: Agent emits final progress, wrappedOnProgress starts async
t=1: Agent returns result
t=2: Main code sets agentExecutionCompleted=true
t=3: Main code does final save with Status='Complete'
t=4: Late wrappedOnProgress (from t=0) completes, saves Status='In-Progress' ← OVERWRITES!
```

**Fix Applied:**

Added `agentExecutionCompleted` flag that prevents progress saves after agent returns:

```typescript
let agentExecutionCompleted = false;

const wrappedOnProgress = agentResponseDetail
    ? async (progress: any) => {
        // Skip DB save if agent already completed
        if (agentExecutionCompleted) {
            // Still call original callback for PubSub streaming
            if (originalOnProgress) {
                await originalOnProgress(progress);
            }
            return;
        }
        // ... save progress ...
    }
    : originalOnProgress;

const agentResult = await this.RunAgent(modifiedParams);

// Mark execution as completed to stop progress saves
agentExecutionCompleted = true;

// Brief delay to let any in-flight progress saves complete
await new Promise(resolve => setTimeout(resolve, 100));

// Now do final save...
```

This prevents the race by:
1. Setting `agentExecutionCompleted=true` immediately after agent returns
2. Late progress callbacks check this flag and skip the DB save
3. 100ms delay before final save lets any in-flight saves complete
4. Final save runs with no risk of being overwritten

#### Testing Required

- [ ] UI-initiated agent execution: Verify progress updates appear in UI
- [ ] UI-initiated agent execution: Verify ConversationDetail.Status is 'Complete' after agent finishes
- [ ] Browser refresh during agent execution: Verify returning shows completed message (not spinning)
- [ ] Server-initiated agent execution: Verify behavior unchanged
- [ ] Multiple concurrent agents: Verify no cross-contamination of progress updates
- [ ] Rapid agent completion: Verify Status='Complete' even when agent finishes very fast

---

## Final Implementation Review

**Date:** 2026-01-08

### Changes Summary

| File | Changes | Impact |
|------|---------|--------|
| `AgentRunner.ts` | 1. Removed `serverCreatedAgentResponse` check<br>2. Added `agentExecutionCompleted` flag<br>3. Added 100ms delay before final save | Server now saves progress for ALL flows, preventing client race conditions |
| `message-input.component.ts` | 1. Removed `Save()` from both progress callbacks<br>2. Removed unused `safeSaveConversationDetail` method | Client only updates UI, no DB saves during progress |

### Impact Analysis

**No Breaking Changes:**
- ✅ Progress updates still visible in UI (in-memory updates + event emissions preserved)
- ✅ Server-initiated flows unaffected (same behavior, unified code path)
- ✅ Error handling unchanged (catch blocks work as before)
- ✅ PubSub streaming still works (original callback still called even after completion)

**Minor Performance Impact:**
- 100ms delay added before final save (once per agent execution)
- This is a reasonable tradeoff for race condition prevention

**Architecture Improvements:**
- Clean separation: Server owns data persistence, client owns UI display
- Single source of truth: Server always sets final Status
- No more race conditions between client/server saves

### Root Causes Fixed

1. **Original Issue (reverted commit)**: Client's `safeSaveConversationDetail` was saving entire entity including stale Status, overwriting server's final Status='Complete'

2. **Second Race Condition**: Progress callbacks fire asynchronously and could complete AFTER agent returns, overwriting final Status even when server does all saves

### How the Fixes Work Together

```
Timeline WITHOUT fixes:
t=0: Client saves progress (Status='In-Progress')
t=1: Server saves final (Status='Complete')
t=2: Late client save (Status='In-Progress') ← OVERWROTE!

Timeline WITH Option A fix (server saves all):
t=0: Server saves progress (Status='In-Progress')
t=1: Server saves final (Status='Complete')
t=2: Client would save... but we removed Save() ✓

Timeline WITH both fixes (complete solution):
t=0: Server saves progress (Status='In-Progress')
t=1: Agent returns, agentExecutionCompleted=true
t=2: Late progress callback checks flag, skips DB save ✓
t=3: 100ms delay for any in-flight saves
t=4: Server reloads entity
t=5: Server saves final (Status='Complete') ✓
```
