# Agent Artifact Context Passing - Implementation Plan

## Problem Statement

When one agent calls another in a conversation, artifacts from previous messages are NOT being passed in the conversation context. This means subsequent agents cannot access the work products of previous agents, breaking iterative workflows.

### Current Behavior (Broken)
```typescript
// conversation-agent.service.ts lines 177-193
private buildAgentMessages(history: ConversationDetailEntity[]): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const recentHistory = history.slice(-20);

    for (const msg of recentHistory) {
        messages.push({
            role: this.mapRoleToAgentRole(msg.Role) as 'system' | 'user' | 'assistant',
            content: msg.Message || ''  // ❌ Only text, no artifacts!
        });
    }

    return messages;
}
```

### Expected Behavior
When an agent completes and creates an artifact, the conversation message should include the artifact JSON:

```markdown
Research Agent completed

# Artifact
{
  "searchResults": [...],
  "summary": "..."
}
```

This allows subsequent agents to access the artifact content directly from the conversation history.

## Root Cause Analysis

**File**: [conversation-agent.service.ts:177-193](packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts#L177-L193)

The `buildAgentMessages()` method only passes `msg.Message` text content. It does NOT:
- Query for artifacts linked to each message
- Load artifact version content
- Append artifact JSON to message content

## Solution Design

### High-Level Approach
1. Modify `buildAgentMessages()` to be async
2. Batch load all artifact junction records for messages in history
3. Batch load artifact version content
4. Append artifact JSON to message content in format: `\n\n# Artifact\n{JSON}\n`
5. Only include OUTPUT artifacts (not INPUT artifacts from previous messages)

### Performance Considerations
- Use batch loading (RunView with IN clauses) to avoid N+1 queries
- Pattern already established in `conversation-chat-area.component.ts` lines 222-274
- Should add ~2 queries per agent invocation (one for junctions, one for versions)

### Data Flow

```
ConversationDetailEntity (message)
    ↓
ConversationDetailArtifact (junction, Direction='Output')
    ↓
ArtifactVersionEntity (Content field has JSON)
    ↓
Append to message content
```

## Implementation Steps

### Step 1: Make buildAgentMessages() Async
```typescript
private async buildAgentMessages(
    history: ConversationDetailEntity[]
): Promise<ChatMessage[]>
```

### Step 2: Batch Load Artifacts
```typescript
// Get IDs of all messages in history
const messageIds = recentHistory.map(msg => msg.ID);

if (messageIds.length === 0) {
    return messages;
}

// Load all artifact junctions for these messages (OUTPUT only)
const rv = new RunView();
const junctionResult = await rv.RunView<ConversationDetailArtifactEntity>({
    EntityName: 'MJ: Conversation Detail Artifacts',
    ExtraFilter: `ConversationDetailID IN ('${messageIds.join("','")}') AND Direction='Output'`,
    ResultType: 'entity_object'
});

if (!junctionResult.Success || !junctionResult.Results || junctionResult.Results.length === 0) {
    // No artifacts, return messages as-is
    return messages;
}
```

### Step 3: Batch Load Artifact Versions
```typescript
// Collect unique version IDs
const versionIds = new Set<string>();
for (const junction of junctionResult.Results) {
    versionIds.add(junction.ArtifactVersionID);
}

// Batch load all versions
const versionResult = await rv.RunView<ArtifactVersionEntity>({
    EntityName: 'MJ: Artifact Versions',
    ExtraFilter: `ID IN ('${Array.from(versionIds).join("','")}')`,
    ResultType: 'entity_object'
});

if (!versionResult.Success || !versionResult.Results) {
    // Failed to load versions
    return messages;
}

// Create lookup maps for O(1) access
const versionMap = new Map(versionResult.Results.map(v => [v.ID, v]));
const junctionsByDetailId = new Map<string, ConversationDetailArtifactEntity[]>();

for (const junction of junctionResult.Results) {
    const existing = junctionsByDetailId.get(junction.ConversationDetailID) || [];
    existing.push(junction);
    junctionsByDetailId.set(junction.ConversationDetailID, existing);
}
```

### Step 4: Append Artifacts to Message Content
```typescript
for (const msg of recentHistory) {
    let content = msg.Message || '';

    // Check if this message has artifacts
    const junctions = junctionsByDetailId.get(msg.ID);
    if (junctions && junctions.length > 0) {
        // Append artifacts to message content
        for (const junction of junctions) {
            const version = versionMap.get(junction.ArtifactVersionID);
            if (version && version.Content) {
                // Append artifact in the expected format
                content += `\n\n# Artifact\n${version.Content}\n`;
            }
        }
    }

    messages.push({
        role: this.mapRoleToAgentRole(msg.Role) as 'system' | 'user' | 'assistant',
        content: content
    });
}
```

### Step 5: Update Callers to Await
Since `buildAgentMessages()` is now async, update all call sites:

**processMessage() method** (line 136):
```typescript
const conversationMessages = await this.buildAgentMessages(conversationHistory);
```

**invokeSubAgent() method** (line 265):
```typescript
const conversationMessages = await this.buildAgentMessages(conversationHistory);
```

**checkAgentContinuityIntent() method** (line 329):
```typescript
// Build compact conversation history (last 10 messages)
const recentHistory = conversationHistory.slice(-10);
const conversationMessages = await this.buildAgentMessages(recentHistory);

// Then build compact history from the messages for display
const compactHistory = conversationMessages.map((msg, idx) => {
    const role = msg.role === 'user' ? 'User' : 'Agent';
    const content = msg.content || '';
    return `${idx + 1}. ${role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
}).join('\n');
```

## Files to Modify

### Primary File
- [conversation-agent.service.ts](packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts)
  - Line 177: Change signature to `async` and return `Promise<ChatMessage[]>`
  - Lines 177-193: Implement batch loading and artifact appending
  - Lines 136, 265, 329: Add `await` to all callers

## Testing Strategy

### Test Case 1: Research Agent → Analysis
1. User asks: "Research MemberJunction architecture"
2. Research Agent completes with artifact containing search results
3. User asks: "Analyze the results"
4. Verify: Second agent receives artifact JSON in conversation context

### Test Case 2: Multiple Artifacts
1. Agent creates report with artifact
2. User refines: "Add more details"
3. Agent creates new version
4. Verify: Agent receives previous artifact in context

### Test Case 3: No Artifacts
1. User has simple conversation with no artifacts
2. Verify: No errors, works as before

## Expected Results

### Before (Current)
```
Conversation messages to agent:
[
  { role: 'user', content: 'Research MemberJunction' },
  { role: 'assistant', content: 'Research Agent completed' },  // ❌ No artifact!
  { role: 'user', content: 'Analyze the results' }
]
```

### After (Fixed)
```
Conversation messages to agent:
[
  { role: 'user', content: 'Research MemberJunction' },
  {
    role: 'assistant',
    content: 'Research Agent completed\n\n# Artifact\n{"searchResults":[...], "summary":"..."}\n'
  },
  { role: 'user', content: 'Analyze the results' }
]
```

## Performance Impact

- **Additional Queries**: +2 per agent invocation (junctions + versions)
- **Mitigation**: Uses batch loading (IN clauses) to avoid N+1 queries
- **Estimated Impact**: ~100-200ms additional latency per agent call
- **Benefit**: Enables iterative agent workflows that were previously broken

## Implementation Priority

**Priority**: HIGH - This is blocking iterative agent workflows

**Estimated Effort**: 1-2 hours

**Risk**: LOW - Well-established pattern from conversation-chat-area.component.ts

## Related Work

- Recently fixed N+1 query problem in conversation loading using same batch pattern
- This solution follows the same performance-optimized approach
