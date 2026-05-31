# Concurrent Agent Progress Update Bug - Root Cause Analysis

## Problem Statement

When 2+ agents are running concurrently, streaming progress messages are incorrectly applied to ALL pending agent conversation details instead of just the one associated with the specific agent run. This causes cross-contamination where Agent A's progress messages appear in Agent B's message, and vice versa.

## User Report

> "When we have 2+ agents running at same time and we get streaming messages back, we don't associate them properly with JUST the convo detail they're related to, we update all pending agent convo details."

## Root Cause Analysis

### The Flow

1. **Client creates progress callback** for each agent invocation
   - Location: [message-input.component.ts:600-660](packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts#L600-L660)
   - Each callback is associated with a specific `ConversationDetailEntity`

2. **GraphQL client subscribes to PubSub**
   - Location: [graphQLAIClient.ts:308-343](packages/GraphQLDataProvider/src/graphQLAIClient.ts#L308-L343)
   - **PROBLEM**: All concurrent agents share the SAME PubSub subscription
   - Subscription filters for `RunAIAgentResolver` messages
   - ALL progress messages are forwarded to ALL active callbacks

3. **Server publishes progress with agentRunId**
   - Location: [RunAIAgentResolver.ts:222-236](packages/MJServer/src/resolvers/RunAIAgentResolver.ts#L222-L236)
   - Each progress message includes `agentRunId` field
   - This uniquely identifies which agent run the progress belongs to

4. **Client callback receives agentRunId but doesn't filter**
   - Location: [message-input.component.ts:606](packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts#L606)
   - Code extracts `progressAgentRunId` from metadata
   - **CRITICAL BUG**: The agentRunId is logged but NEVER used to filter
   - Comment says "Filters by agentRunId" but no filtering actually happens!

### The Bug

```typescript
// message-input.component.ts lines 600-660
private createProgressCallback(
    conversationDetail: ConversationDetailEntity,
    agentName: string
): AgentExecutionProgressCallback {
    return async (progress) => {
        // Extract agentRunId from progress metadata
        const progressAgentRunId = progress.metadata?.agentRunId as string | undefined;

        // ❌ BUG: No filtering! This callback processes ALL progress messages,
        // even those meant for other concurrent agents

        // Update the ConversationDetail message
        if (conversationDetail.Status === 'In-Progress') {
            conversationDetail.Message = progressText;  // ❌ Wrong agent's message!
            await this.safeSaveConversationDetail(conversationDetail, `Progress:${agentName}`);
            this.messageSent.emit(conversationDetail);  // ❌ Emits wrong message!
        }
    };
}
```

### Why It Happens

When Agent A and Agent B run concurrently:

1. Both agent invocations subscribe to the SAME PubSub topic
2. Agent A's progress callback is invoked for BOTH Agent A and Agent B messages
3. Agent B's progress callback is invoked for BOTH Agent A and Agent B messages
4. Each callback updates its own `ConversationDetailEntity` with whichever progress message arrives
5. Result: Agent A's message shows Agent B's progress, and vice versa

### Visual Example

```
Timeline:
---------
t0: User asks "Research AI" (Agent A starts, creates ConversationDetail A)
t1: User asks "Analyze data" (Agent B starts, creates ConversationDetail B)

Progress Messages:
t2: Agent A publishes: { agentRunId: 'A123', message: 'Searching Google...' }
    → Agent A's callback: Updates ConversationDetail A ✅ CORRECT
    → Agent B's callback: Updates ConversationDetail B ❌ WRONG! (should be ignored)

t3: Agent B publishes: { agentRunId: 'B456', message: 'Querying database...' }
    → Agent A's callback: Updates ConversationDetail A ❌ WRONG! (should be ignored)
    → Agent B's callback: Updates ConversationDetail B ✅ CORRECT

Result:
- ConversationDetail A shows: "Querying database..." (from Agent B)
- ConversationDetail B shows: "Searching Google..." (from Agent A)
```

## Solution Design

### Option 1: Filter in Progress Callback (Recommended)

Store the expected `agentRunId` when creating the callback, then filter messages.

**Pros:**
- Minimal changes
- Fixes the root cause directly
- Maintains existing architecture

**Cons:**
- None

### Option 2: Separate Subscriptions Per Agent

Create separate PubSub subscriptions filtered by `agentRunId`.

**Pros:**
- Cleaner separation
- Server-side filtering

**Cons:**
- Requires GraphQL subscription filter support
- More complex implementation
- May not be supported by current infrastructure

### Option 3: Store Agent Run Mapping

Track which `conversationDetailId` maps to which `agentRunId`.

**Pros:**
- Centralized mapping
- Easy to debug

**Cons:**
- Additional state management
- More complex

## Recommended Solution: Option 1

### Implementation Steps

#### Step 1: Track Expected Agent Run ID

When agent execution starts, emit the `agentRunId` and store it for filtering.

**Location**: [message-input.component.ts:600](packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts#L600)

Add a property to track the expected agent run ID:
```typescript
private createProgressCallback(
    conversationDetail: ConversationDetailEntity,
    agentName: string,
    expectedAgentRunId: string | null = null  // NEW parameter
): AgentExecutionProgressCallback
```

#### Step 2: Filter Progress Messages

Add filtering logic to skip messages from other agents:
```typescript
return async (progress) => {
    const progressAgentRunId = progress.metadata?.agentRunId as string | undefined;

    // NEW: Filter out progress messages from other agents
    if (expectedAgentRunId && progressAgentRunId && progressAgentRunId !== expectedAgentRunId) {
        console.log(`[${agentName}] 🚫 Ignoring progress from different agent run: ${progressAgentRunId} (expected: ${expectedAgentRunId})`);
        return; // Skip this progress update
    }

    // NEW: If we don't have expectedAgentRunId yet, capture it from first message
    if (!expectedAgentRunId && progressAgentRunId) {
        expectedAgentRunId = progressAgentRunId;
        console.log(`[${agentName}] 📌 Captured agent run ID: ${expectedAgentRunId}`);
    }

    // Rest of the existing logic...
};
```

#### Step 3: Capture Agent Run ID Early

Modify the callback to capture and store the agent run ID:
```typescript
private createProgressCallback(
    conversationDetail: ConversationDetailEntity,
    agentName: string
): AgentExecutionProgressCallback {
    // Use closure to maintain state
    let capturedAgentRunId: string | null = null;

    return async (progress) => {
        const progressAgentRunId = progress.metadata?.agentRunId as string | undefined;

        // Capture the agent run ID from the first progress message
        if (!capturedAgentRunId && progressAgentRunId) {
            capturedAgentRunId = progressAgentRunId;
            console.log(`[${agentName}] 📌 Captured agent run ID: ${capturedAgentRunId} for conversation detail: ${conversationDetail.ID}`);
        }

        // Filter out messages from other agents
        if (capturedAgentRunId && progressAgentRunId && progressAgentRunId !== capturedAgentRunId) {
            console.log(`[${agentName}] 🚫 Ignoring progress from different agent (expected: ${capturedAgentRunId}, got: ${progressAgentRunId})`);
            return;
        }

        // Existing progress update logic...
    };
}
```

## Alternative: Use Conversation Detail ID Mapping

The code already emits `agentRunDetected` events (line 635-638):
```typescript
if (progressAgentRunId) {
    this.agentRunDetected.emit({
        conversationDetailId: conversationDetail.ID,
        agentRunId: progressAgentRunId
    });
}
```

We could use this to build a mapping:
```typescript
private agentRunMapping = new Map<string, string>(); // agentRunId -> conversationDetailId

// In agentRunDetected handler:
this.agentRunMapping.set(agentRunId, conversationDetailId);

// In progress callback:
const expectedDetailId = this.agentRunMapping.get(progressAgentRunId);
if (expectedDetailId !== conversationDetail.ID) {
    return; // Skip - this message is for a different conversation detail
}
```

## Testing Strategy

### Test Case 1: Sequential Agents (Baseline)
1. Run Agent A, wait for completion
2. Run Agent B
3. Verify: Each agent shows only its own progress

### Test Case 2: Concurrent Agents (Bug Reproduction)
1. Start Agent A (Research Agent)
2. Immediately start Agent B (Analysis Agent)
3. **Before Fix**: Both messages show mixed progress
4. **After Fix**: Each message shows only its own progress

### Test Case 3: Three Concurrent Agents
1. Start Agent A, B, and C simultaneously
2. Verify: Each shows only its own progress
3. Verify: No cross-contamination

### Test Case 4: Agent Run ID Not Present
1. Older agents that don't send agentRunId
2. Verify: Graceful fallback (accept all messages for that agent)

## Expected Results

### Before Fix
```
ConversationDetail A (Research Agent):
  "⏳ Querying database..." ❌ (from Agent B)

ConversationDetail B (Analysis Agent):
  "⏳ Searching Google..." ❌ (from Agent A)
```

### After Fix
```
ConversationDetail A (Research Agent):
  "⏳ Searching Google..." ✅ (from Agent A only)

ConversationDetail B (Analysis Agent):
  "⏳ Querying database..." ✅ (from Agent B only)
```

## Files to Modify

1. **Primary Fix**:
   - [message-input.component.ts:600-660](packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts#L600-L660)
     - Add agent run ID capture in closure
     - Add filtering logic

2. **Optional Enhancement**:
   - Consider removing misleading comment on line 598 that says "Filters by agentRunId" when it doesn't actually filter

## Implementation Priority

**Priority**: CRITICAL - Breaks user experience when multiple agents run concurrently

**Estimated Effort**: 30 minutes - 1 hour

**Risk**: LOW - Simple filtering logic, won't affect single-agent scenarios

## Related Code

The comment on line 598 is misleading:
```typescript
/**
 * Create a progress callback for agent execution
 * This callback updates both the active task and the ConversationDetail message
 * IMPORTANT: Filters by agentRunId to prevent cross-contamination when multiple agents run in parallel
 */
```

This comment was likely written with good intentions but the filtering was never actually implemented!
