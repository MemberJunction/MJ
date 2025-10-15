# Agent Memory System: Design & Implementation

**Date:** 2025-10-15
**Status:** Design Phase - To be implemented later
**Issue:** Agents need conditional access to accumulated content without exhausting context
**Scope:** Add "Memory" as a fourth information channel to agent architecture

---

## Executive Summary

**Problem:** Agents rapidly exhaust context when action results (web pages, database queries, search results) are added directly to conversation history.

**Solution:** Add **Memory** as a new information channel alongside Payload, Context, and ConversationMessages. Memory stores full content outside LLM context, accessible via tools.

### Key Design Principles

1. **Minimal Architecture Change** - Respects existing well-designed Payload, Context, and ConversationMessages
2. **Memory as Fourth Channel** - Explicit separation of storage (Memory) from LLM visibility (Conversation)
3. **First-Use Optimization** - Full action result shown ONCE, then compacted for subsequent iterations
4. **Tool-Based Access** - Agent explicitly requests memory via actions (Query/Retrieve/Store)
5. **Plugin or LLM Compaction** - Choice between deterministic plugins (fast) or LLM-based (flexible)
6. **Scoped Sharing** - Memory can be shared with sub-agents or isolated per agent

---

## Architecture Overview

### Current State (Three Channels)

```
┌─────────────────────────────────────────────────────────────┐
│                   ExecuteAgentParams                         │
├─────────────────────────────────────────────────────────────┤
│ - conversationMessages: ChatMessage[]  (LLM dialog)         │
│ - payload: P                           (structured data)    │
│ - context: C                           (app shared state)   │
└─────────────────────────────────────────────────────────────┘
```

**Problem:** Action results (web pages, DB queries) added to `conversationMessages` cause context exhaustion.

### Proposed State (Four Channels)

```
┌─────────────────────────────────────────────────────────────┐
│                   ExecuteAgentParams                         │
├─────────────────────────────────────────────────────────────┤
│ - conversationMessages: ChatMessage[]  (LLM dialog)         │
│ - payload: P                           (structured data)    │
│ - context: C                           (app shared state)   │
│ - memory: M                            (NEW: content store) │
└─────────────────────────────────────────────────────────────┘
```

**Solution:** Memory stores full content, conversation gets compacted citations.

### Channel Responsibilities

| Channel | Purpose | LLM Visibility | Mutability | Scope |
|---------|---------|----------------|------------|-------|
| **ConversationMessages** | LLM dialog history | ✅ Always | Append-only | Agent run |
| **Payload** | Structured data agent produces/consumes | Via template | Full | Agent run |
| **Context** | Shared application state | ❌ Never | Full | Agent hierarchy |
| **Memory** | Content storage with tool access | Via actions | Full | Configurable |

### Memory Characteristics

- **Not automatically in LLM context** - agent must explicitly retrieve
- **Tool-based access** - "Store in Memory", "Retrieve from Memory", "Query Memory" actions
- **Can be shared with sub-agents** - or isolated per agent (configurable)
- **Persisted alongside agent run** - for audit trail and debugging
- **Supports transformations** - full, excerpt, summary, first/last N, filtered

---

## Action Result Flow

**Key Innovation:** Full result shown ONCE, then compacted for subsequent iterations.

```
┌─────────────────────────────────────────────────────────────┐
│            Action Completes (e.g., Web Page Fetch)          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Store FULL result in Memory → Returns memoryId         │
│  2. Determine if FIRST time seeing this type of result      │
└─────────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                     ↓
┌──────────────────┐              ┌──────────────────────┐
│  FIRST TIME      │              │  SUBSEQUENT TIMES    │
│                  │              │                      │
│ Add FULL result  │              │ Add COMPACTED result │
│ to conversation  │              │ to conversation      │
│                  │              │                      │
│ LLM sees all     │              │ LLM sees summary +   │
│ details once     │              │ memoryId reference   │
└──────────────────┘              └──────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        │ If agent needs full content later │
        │ Uses "Retrieve from Memory" action│
        └───────────────────────────────────┘
```

---

## Implementation Design

### 1. Memory Interface

```typescript
// In packages/AI/CorePlus/src/agent.types.ts

/**
 * Agent memory - a queryable/mutable content store
 */
export interface AgentMemory {
    // Core storage
    store(content: MemoryItem): string;  // Returns memory ID
    retrieve(id: string, transform?: MemoryTransform): MemoryItem | null;
    query(criteria: MemoryCriteria): MemoryItem[];

    // Lifecycle
    clear(): void;
    snapshot(): MemorySnapshot;  // For passing to sub-agents
    restore(snapshot: MemorySnapshot): void;
}

export interface MemoryItem {
    id: string;
    type: 'action_result' | 'web_content' | 'database_result' | 'custom';
    content: any;
    metadata: {
        source: string;           // Action name or source
        timestamp: Date;
        size: number;
        tags?: string[];          // For categorization
        relatedTo?: string[];     // Links to other memory items
    };
}

export interface MemoryTransform {
    type: 'full' | 'excerpt' | 'summary' | 'first_n' | 'last_n' | 'filtered';
    params?: Record<string, any>;
}

export interface MemoryCriteria {
    type?: string;
    source?: string;
    tags?: string[];
    timeRange?: { start: Date; end: Date };
    limit?: number;
}
```

### 2. Add Memory to ExecuteAgentParams

```typescript
export interface ExecuteAgentParams<C = any, P = any, M = AgentMemory> {
    agent: AIAgentEntityExtended;
    conversationMessages: ChatMessage[];
    payload?: P;
    context?: C;
    memory?: M;  // NEW: Optional memory instance
    // ... rest of existing fields
}
```

### 3. Memory Actions

```typescript
// Store in Memory
@RegisterClass(BaseAction, "Store in Memory")
export class StoreInMemoryAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const content = this.getParam(params, "content");
        const type = this.getStringParam(params, "type", "custom");
        const tags = this.getStringParam(params, "tags")?.split(',') || [];

        const memory = this.getMemoryFromContext(params);
        const id = memory.store({
            type,
            content,
            metadata: {
                source: 'user',
                timestamp: new Date(),
                size: JSON.stringify(content).length,
                tags
            }
        });

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: `Stored in memory with ID: ${id}`
        };
    }
}

// Retrieve from Memory
@RegisterClass(BaseAction, "Retrieve from Memory")
export class RetrieveFromMemoryAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const id = this.getStringParam(params, "id");
        const transform = this.getStringParam(params, "transform", "full");

        const memory = this.getMemoryFromContext(params);
        const item = memory.retrieve(id, { type: transform as any });

        if (!item) {
            return this.createErrorResult(`Memory item not found: ${id}`);
        }

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(item.content, null, 2)
        };
    }
}

// Query Memory
@RegisterClass(BaseAction, "Query Memory")
export class QueryMemoryAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const type = this.getStringParam(params, "type");
        const source = this.getStringParam(params, "source");
        const tags = this.getStringParam(params, "tags")?.split(',');
        const limit = this.getNumericParam(params, "limit", 10);

        const memory = this.getMemoryFromContext(params);
        const items = memory.query({ type, source, tags, limit });

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(items.map(i => ({
                id: i.id,
                type: i.type,
                source: i.metadata.source,
                timestamp: i.metadata.timestamp,
                size: i.metadata.size,
                tags: i.metadata.tags
            })), null, 2)
        };
    }
}
```

### 4. Modified Action Result Handling

```typescript
// In BaseAgent.handleActionsStep()

protected async handleActionsStep<P>(
    params: ExecuteAgentParams,
    config: AgentConfiguration,
    previousDecision: BaseAgentNextStep<P>
): Promise<BaseAgentNextStep<P>> {
    const actions = previousDecision.actions!;
    const actionResults = await this.executeActions(actions, params);

    // Process each result
    for (const result of actionResults) {
        // Store FULL result in memory
        const memoryId = params.memory?.store({
            type: 'action_result',
            content: result,
            metadata: {
                source: result.action.name,
                timestamp: new Date(),
                size: JSON.stringify(result).length,
                tags: ['action', result.action.name]
            }
        });

        // Determine if this is the FIRST time we're returning results
        const isFirstReturn = !this.hasSeenActionResults(previousDecision);

        if (isFirstReturn) {
            // FIRST TIME: Add full result to conversation
            params.conversationMessages.push({
                role: 'user',
                content: `Action results:\n${JSON.stringify(result, null, 2)}\n\n(Stored in memory as ${memoryId})`
            });
        } else {
            // SUBSEQUENT: Add compacted version
            const compacted = await this.compactActionResult(
                result,
                result.action,
                params.agent,
                memoryId
            );

            params.conversationMessages.push({
                role: 'user',
                content: `Action results (compacted):\n${JSON.stringify(compacted, null, 2)}\n\n(Full result in memory: ${memoryId})`
            });
        }
    }

    return {
        terminate: false,
        step: 'Retry',
        newPayload: finalPayload,
        retryReason: 'Analyzing action results'
    };
}
```

### 5. Compaction Strategies

**Option A: Plugin-based (Deterministic, Fast)**

```typescript
interface CompactionPlugin {
    compact(
        actionResult: ActionResult,
        action: AgentAction,
        context: CompactionContext
    ): CompactedResult;
}

// Example for Web Page Content
class WebPageCompactionPlugin implements CompactionPlugin {
    compact(result, action, context) {
        const content = JSON.parse(result.Message);
        return {
            actionName: 'Web Page Content',
            url: content.url,
            title: content.metadata?.title,
            excerpt: content.content?.substring(0, 500) + '...',
            contentLength: content.content?.length,
            memoryId: context.memoryId,
            retrieveWith: `Retrieve from Memory with id="${context.memoryId}"`
        };
    }
}
```

**Option B: LLM-based (Flexible, Goal-aware)**

```typescript
private async compactWithLLM(
    result: ActionResult,
    action: AgentAction,
    agent: AIAgentEntityExtended,
    memoryId: string
): Promise<CompactedResult> {
    const summaryPrompt = `
You are compacting an action result for an agent working on: "${this.extractGoalFromPayload(agent)}"

Action: ${action.name}
Result: ${JSON.stringify(result).substring(0, 5000)}

Extract ONLY information relevant to the goal. Provide:
1. 2-3 sentence summary
2. 3-5 key facts relevant to the goal
3. Memory ID for full retrieval: ${memoryId}

Format as JSON.
    `;

    const summary = await this.executeSummaryPrompt(summaryPrompt);
    return summary;
}
```

### 6. Agent Configuration

Add to `AIAgentEntity`:

```typescript
/**
 * Enable memory-based content management
 */
EnableMemory: boolean = false;

/**
 * Share memory with sub-agents
 */
ShareMemoryWithSubAgents: boolean = true;

/**
 * Use LLM for compaction (vs plugins)
 */
UseCompactionLLM: boolean = false;

/**
 * Compaction prompt ID (if UseCompactionLLM = true)
 */
CompactionPromptID?: string;
```

---

## Benefits

### Token Savings Example

**Before (Current):**
```
Iteration 1: Google Search (8KB) + 3 Web Pages (150KB) = 158KB in conversation
Iteration 2: 158KB + DB Query (50KB) + 2 Pages (100KB) = 308KB in conversation
Iteration 3: Context exhausted ❌
```

**After (With Memory):**
```
Iteration 1: Search (8KB) + 3 Citations (1.5KB) = 9.5KB in conversation
Iteration 2: 9.5KB + Summary (2KB) + 2 Citations (1KB) = 12.5KB in conversation
Iteration 3: 12.5KB + Excerpt (1KB) = 13.5KB in conversation
...
Iteration 20+: Still under 50KB ✅
```

**Result:** 99% reduction in conversation tokens, 10x+ more iterations possible

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)
- AgentMemory interface and implementation
- Add memory to ExecuteAgentParams
- Basic store/retrieve functionality

### Phase 2: Action Integration (Week 2)
- Modify handleActionsStep() for memory storage
- Implement "first time vs subsequent" logic
- Create Memory actions (Store/Retrieve/Query)

### Phase 3: Compaction (Week 3)
- Plugin registry and built-in plugins
- LLM-based compaction option
- Agent configuration fields

### Phase 4: Testing & Documentation (Week 4)
- Test with Research Agent
- Measure token savings
- Document usage patterns
- Migration guide

---

## Open Questions

1. **First-time Detection**: How do we detect "first time seeing action results"?
   - Track step numbers?
   - Check if action was executed before in this run?
   - Flag in previousDecision?

2. **Default Strategy**: Plugin-based (fast) or LLM-based (flexible)?
   - Recommend: Plugin with LLM fallback

3. **Memory Persistence**: In-memory only or persist to database?
   - Recommend: Persist to AIAgentRunStep.Memory field for audit trail

4. **Memory in Prompts**: Inject memory summary into templates, or purely tool-based?
   - Recommend: Tool-based only (agent decides when to access)

---

## Next Steps

1. Finish implementing Research Agent
2. Observe context usage patterns
3. Return to this design with real-world requirements
4. Implement Phase 1 when ready

---

## Conclusion

Memory system provides:
- ✅ Minimal architecture changes
- ✅ Respects existing design decisions
- ✅ 99% token reduction for content-heavy agents
- ✅ 10x+ increase in possible iterations
- ✅ Full audit trail preserved
- ✅ Flexible compaction strategies
- ✅ Sub-agent memory scoping

**Key Insight:** Agents need **access** to information, not **storage** in context. Memory separates these concerns cleanly.
