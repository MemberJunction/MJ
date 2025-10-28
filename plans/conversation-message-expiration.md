# Conversation Message Expiration Implementation Plan

## Status: 📋 PLANNED - Ready for Implementation

## Executive Summary

This document proposes extending the MemberJunction agent framework to support intelligent conversation message lifecycle management. The goal is to prevent context bloat by allowing action results to be automatically removed or compacted after a configurable number of turns, while preserving the ability to expand compacted content when needed.

---

## Problem Statement

Currently, all action results persist indefinitely in the `conversationMessages` array throughout an agent run. This causes:

1. **Token Bloat**: Search results with 50+ items consume tokens across all subsequent turns
2. **Cost Escalation**: Each iteration pays for increasingly large conversation histories
3. **Context Dilution**: Irrelevant historical data crowds out current context
4. **No Control**: All-or-nothing message retention with no granular management

---

## Solution Architecture

### 1. Generic ChatMessage Type with Metadata

**Location**: `/packages/AI/Core/src/generic/chat.types.ts`

Make `ChatMessage` generic to allow type-safe metadata while keeping the core package agnostic:

```typescript
/**
 * Defines the shape of an individual chat message with optional generic metadata.
 *
 * @template M - Type of metadata attached to the message. Defaults to any for flexibility.
 *
 * @example
 * // Basic usage without metadata
 * const message: ChatMessage = {
 *   role: 'user',
 *   content: 'Hello'
 * };
 *
 * @example
 * // With typed metadata (e.g., in agent framework)
 * interface AgentMessageMetadata {
 *   messageType: 'action-result';
 *   actionId: string;
 *   turnAdded: number;
 * }
 * const message: ChatMessage<AgentMessageMetadata> = {
 *   role: 'user',
 *   content: 'Search results...',
 *   metadata: {
 *     messageType: 'action-result',
 *     actionId: 'abc-123',
 *     turnAdded: 5
 *   }
 * };
 */
export type ChatMessage<M = any> = {
    /**
     * Role of the message in the conversation.
     */
    role: ChatMessageRole;

    /**
     * Content of the message, can be any string or an array of content blocks.
     */
    content: ChatMessageContent;

    /**
     * Optional metadata for application-specific message tracking and management.
     * Type is generic to allow different applications to define their own metadata structure.
     *
     * Common use cases:
     * - Message lifecycle management (expiration, compaction)
     * - Attribution tracking (which action/agent created the message)
     * - Debugging information (timestamps, step IDs)
     * - Application-specific flags and settings
     */
    metadata?: M;
}
```

**Key Design Benefits:**
- ✅ **Separation of Concerns**: Core package stays agnostic to agent-specific logic
- ✅ **Type Safety**: Applications using typed metadata get full IntelliSense
- ✅ **Backward Compatible**: Existing code works unchanged (metadata is optional)
- ✅ **Flexible**: Any application can define custom metadata structure

---

### 2. Agent-Specific Metadata Type

**Location**: `/packages/AI/CorePlus/src/agent-types.ts` (or new file in Agents package)

Define the metadata structure used by the agent framework:

```typescript
/**
 * Metadata for chat messages in the agent execution framework.
 * Supports message lifecycle management, attribution, and debugging.
 */
export interface AgentChatMessageMetadata {
    /**
     * Type of message for lifecycle categorization
     */
    messageType?: 'action-result' | 'sub-agent-result' | 'user-input' | 'retry-context' | 'system';

    /**
     * ID of the action that generated this result (for action-result messages)
     */
    actionId?: string;

    /**
     * ID of the AIAgentAction that controls expiration settings
     */
    agentActionId?: string;

    /**
     * Turn/iteration number when this message was added
     */
    turnAdded?: number;

    /**
     * Number of turns after which this message should expire (from AIAgentAction config)
     */
    expirationTurns?: number | null;

    /**
     * How to handle expiration: 'None', 'Remove', 'Compact'
     */
    expirationMode?: 'None' | 'Remove' | 'Compact';

    /**
     * How to compact if expirationMode is 'Compact': 'First N Chars', 'AI Summary'
     */
    compactMode?: 'First N Chars' | 'AI Summary';

    /**
     * Character limit for First N Chars compaction
     */
    compactLength?: number;

    /**
     * Prompt ID for AI summarization
     */
    compactPromptId?: string;

    /**
     * Flag indicating this message has been compacted
     */
    wasCompacted?: boolean;

    /**
     * Flag indicating this message has expired and should be removed
     */
    isExpired?: boolean;

    /**
     * Original content before compaction.
     * Preserved to allow agents to request full expansion if needed.
     * Only populated when wasCompacted is true.
     */
    originalContent?: ChatMessageContent;

    /**
     * Original content length before compaction (for metrics)
     */
    originalLength?: number;

    /**
     * Tokens saved by compaction (for metrics)
     */
    tokensSaved?: number;

    /**
     * Timestamp when message was added (for debugging)
     */
    timestamp?: Date;

    /**
     * Agent run step ID that created this message (for debugging)
     */
    stepId?: string;

    /**
     * Flag indicating this message can be expanded to show original content.
     * Set to true when originalContent is preserved.
     */
    canExpand?: boolean;
}

/**
 * Type alias for agent chat messages with proper metadata typing
 */
export type AgentChatMessage = ChatMessage<AgentChatMessageMetadata>;
```

**Key Features:**
- ✅ **Preserves Original**: `originalContent` allows expansion after compaction
- ✅ **Expandable Flag**: `canExpand` tells agents they can request full content
- ✅ **Metrics Tracking**: Token savings, original length, timestamps
- ✅ **Attribution**: Links to actions, steps, and agent actions

---

### 3. Agent Expand Action

Agents can request expansion of compacted messages during their next decision:

```typescript
/**
 * Next step request type for expanding compacted messages
 */
export interface ExpandMessageRequest {
    step: 'ExpandMessage';
    messageIndex: number;      // Index in conversationMessages array
    reason?: string;           // Why the agent needs full content
}
```

**Agent Decision Flow:**
```typescript
// In agent's next step decision
{
    "step": "ExpandMessage",
    "messageIndex": 5,
    "reason": "Need full search results to answer user's detailed question about item #47"
}
```

**BaseAgent Handling:**
```typescript
protected async executeExpandMessageStep(
    request: ExpandMessageRequest,
    params: ExecuteAgentParams
): Promise<NextStepRequest> {
    const message = params.conversationMessages[request.messageIndex] as AgentChatMessage;

    // Validate can expand
    if (!message.metadata?.canExpand || !message.metadata.originalContent) {
        throw new Error(`Message at index ${request.messageIndex} cannot be expanded`);
    }

    // Restore original content
    message.content = message.metadata.originalContent;
    message.metadata.wasCompacted = false;
    message.metadata.canExpand = false;
    delete message.metadata.originalContent;

    // Add notification to conversation
    params.conversationMessages.push({
        role: 'user',
        content: `[Expanded message ${request.messageIndex} to full content at agent's request]`
    } as AgentChatMessage);

    // Continue to next step
    return { step: 'Continue' };
}
```

---

### 4. Extended ExecuteAgentParams

**Location**: `/packages/AI/CorePlus/src/agent-types.ts`

Add global expiration overrides to `ExecuteAgentParams`:

```typescript
export type ExecuteAgentParams<TContext = any, P = any> = {
    // ... existing fields ...

    /**
     * Optional runtime overrides for message expiration behavior.
     * When specified, these settings override AIAgentAction expiration configuration
     * for all actions executed during this agent run.
     *
     * Use cases:
     * - Testing agents with aggressive message pruning
     * - Running agents in low-token environments
     * - Debugging by disabling expiration entirely
     * - Cost control by forcing all actions to compact results
     *
     * Precedence (highest to lowest):
     * 1. Runtime override (this parameter)
     * 2. AIAgentAction expiration configuration
     * 3. No expiration (default behavior)
     */
    messageExpirationOverride?: {
        /**
         * Override ResultExpirationTurns for all actions.
         * null = use action config, number = override for all actions
         */
        expirationTurns?: number | null;

        /**
         * Override ResultExpirationMode for all actions.
         * null = use action config, value = override for all actions
         */
        expirationMode?: 'None' | 'Remove' | 'Compact' | null;

        /**
         * Override CompactMode for all actions (when expirationMode is Compact).
         * null = use action config, value = override for all actions
         */
        compactMode?: 'First N Chars' | 'AI Summary' | null;

        /**
         * Override CompactLength for First N Chars mode.
         * null = use action config, number = override for all actions
         */
        compactLength?: number | null;

        /**
         * Override CompactPromptID for AI Summary mode.
         * null = use action/system default, string = override for all actions
         */
        compactPromptId?: string | null;

        /**
         * Disable all expiration regardless of action configuration.
         * When true, all messages persist for entire agent run (current behavior).
         */
        disableExpiration?: boolean;

        /**
         * Whether to preserve original content when compacting messages.
         * When true, originalContent is stored in metadata allowing expansion.
         * When false, original content is discarded (saves memory).
         * Default: true (allow expansion)
         */
        preserveOriginalContent?: boolean;
    };

    /**
     * Optional callback for message lifecycle events.
     * Useful for debugging, testing, and monitoring token savings.
     */
    onMessageLifecycle?: (event: MessageLifecycleEvent) => void;
};

/**
 * Event emitted during message lifecycle operations
 */
export interface MessageLifecycleEvent {
    type: 'message-added' | 'message-expired' | 'message-compacted' | 'message-removed' | 'message-expanded';
    turn: number;
    messageIndex: number;
    message: AgentChatMessage;
    reason?: string;
    tokensSaved?: number;
}
```

---

### 5. BaseAgent Implementation Changes

**Location**: `/packages/AI/Agents/src/base-agent.ts`

#### 5.1 Use Existing Step Tracking for Turn Counter

**IMPORTANT**: BaseAgent already tracks steps via `stepCount` variable in `executeAgentInternal()` and `StepNumber` on step entities. We will reuse this existing tracking rather than adding a new `_currentTurn` variable.

**Current Implementation** (lines 507-552 in base-agent.ts):
```typescript
protected async executeAgentInternal<P = any>(
    params: ExecuteAgentParams,
    config: AgentConfiguration
): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
    let stepCount = 0; // <-- Existing counter we'll use

    while (continueExecution) {
        stepCount++; // Incremented each iteration

        // Execute step...
    }

    return { finalStep: currentNextStep, stepCount };
}
```

**Our Modification**: Use `stepCount` directly for message expiration instead of adding new variable.

#### 5.2 Add Message Lifecycle Callback Storage

```typescript
export abstract class BaseAgent<
    TContext = any,
    P extends Record<string, any> = Record<string, any>,
    R extends Record<string, any> = Record<string, any>
> {
    // ... existing properties ...

    /**
     * Message lifecycle event callback (new)
     */
    protected _messageLifecycleCallback?: (event: MessageLifecycleEvent) => void;
}
```

#### 5.3 Modify executeAgentInternal() to Prune Messages

```typescript
protected async executeAgentInternal<P = any>(
    params: ExecuteAgentParams,
    config: AgentConfiguration
): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
    // Store lifecycle callback
    this._messageLifecycleCallback = params.onMessageLifecycle;

    let continueExecution = true;
    let currentNextStep: BaseAgentNextStep<P> | null = null;
    let stepCount = 0; // Existing counter

    while (continueExecution) {
        stepCount++; // Existing increment

        // NEW: Prune expired messages BEFORE executing next step
        // Pass stepCount as currentTurn parameter
        await this.pruneAndCompactExpiredMessages(params, stepCount);

        // Execute the next step (existing code)
        const nextStep = await this.executeNextStep<P>(params, config, currentNextStep);

        // ... rest of existing loop logic ...
    }

    return { finalStep: currentNextStep, stepCount };
}
```

#### 5.4 Tag Action Result Messages

Modify the section in `executeActionsStep()` where messages are added (around line 3721):

```typescript
// Create results message
const resultsMessage = (failedActions.length > 0
    ? `${failedActions.length} of ${actionSummaries.length} failed:`
    : `Action results:`) + `\n${JSON.stringify(actionSummaries, null, 2)}`;

// Build metadata for action results (pass current stepCount)
const actionMetadata = await this.buildActionResultMetadata(
    actionResults,
    params,
    stepCount  // Current iteration number
);

// Add user message with tagged metadata
const actionResultMessage: AgentChatMessage = {
    role: 'user',
    content: resultsMessage,
    metadata: actionMetadata
};

params.conversationMessages.push(actionResultMessage);

// Emit lifecycle event
this.emitMessageLifecycleEvent({
    type: 'message-added',
    turn: stepCount,
    messageIndex: params.conversationMessages.length - 1,
    message: actionResultMessage,
    reason: `Action results from ${actionResults.length} action(s)`
});
```

#### 5.5 Build Action Result Metadata

```typescript
/**
 * Builds metadata for action result messages, applying expiration config
 * from AIAgentAction with runtime overrides from ExecuteAgentParams.
 *
 * When multiple actions execute in one step, uses the most aggressive
 * expiration settings (earliest expiration, most compaction).
 */
protected async buildActionResultMetadata(
    actionResults: Array<{
        success: boolean;
        result: ActionResult;
        action: AgentAction;
        actionEntity: ActionEntity;
        agentAction: AIAgentActionEntity;
        stepEntity: AIAgentRunStepEntityExtended;
    }>,
    params: ExecuteAgentParams
): Promise<AgentChatMessageMetadata> {
    // Collect expiration configs from all actions in this batch
    const configs = actionResults.map(result => {
        const agentAction = result.agentAction;
        const action = result.actionEntity;
        const override = params.messageExpirationOverride;

        // Check if expiration is globally disabled
        if (override?.disableExpiration) {
            return {
                expirationTurns: null,
                expirationMode: 'None' as const,
                compactMode: null,
                compactLength: null,
                compactPromptId: null
            };
        }

        // Apply override hierarchy: runtime > agentAction
        const expirationTurns = override?.expirationTurns !== undefined
            ? override.expirationTurns
            : agentAction.ResultExpirationTurns;

        const expirationMode = override?.expirationMode !== undefined
            ? override.expirationMode
            : agentAction.ResultExpirationMode;

        const compactMode = override?.compactMode !== undefined
            ? override.compactMode
            : agentAction.CompactMode;

        const compactLength = override?.compactLength !== undefined
            ? override.compactLength
            : agentAction.CompactLength;

        // For CompactPromptID: override > agentAction > action default
        let compactPromptId: string | null = null;
        if (expirationMode === 'Compact' && compactMode === 'AI Summary') {
            compactPromptId = override?.compactPromptId !== undefined
                ? override.compactPromptId
                : (agentAction.CompactPromptID || action.DefaultCompactPromptID || null);
        }

        return {
            expirationTurns,
            expirationMode,
            compactMode,
            compactLength,
            compactPromptId,
            actionId: action.ID,
            agentActionId: agentAction.ID
        };
    });

    // For multi-action batches, use most aggressive expiration
    const mostAggressive = this.selectMostAggressiveExpiration(configs);

    return {
        messageType: 'action-result',
        turnAdded: this._currentTurn,
        timestamp: new Date(),
        stepId: actionResults[0]?.stepEntity?.ID,
        ...mostAggressive
    };
}
```

#### 5.6 Prune and Compact Expired Messages (with Functional Decomposition)

**Method Name**: `pruneAndCompactExpiredMessages()` (renamed for clarity)

**Design**: Use functional decomposition to keep methods focused and readable (<30-40 lines each).

```typescript
/**
 * Prunes and compacts expired messages from conversation history before executing next step.
 *
 * CRITICAL INVARIANT: This method ONLY modifies params.conversationMessages
 * (the in-memory conversation). It NEVER touches AIAgentRunStep.OutputData,
 * which is our permanent record in the database.
 *
 * Processing phases:
 * 1. Identify expired messages based on turn count
 * 2. Compact messages that need summarization (may call LLM)
 * 3. Remove messages marked for deletion
 * 4. Update metrics and emit lifecycle events
 *
 * @param params - Agent execution parameters
 * @param currentTurn - Current step/turn number from stepCount
 */
protected async pruneAndCompactExpiredMessages(
    params: ExecuteAgentParams,
    currentTurn: number
): Promise<void> {
    const messagesToRemove: number[] = [];
    const messagesToCompact: Array<{
        index: number;
        message: AgentChatMessage;
        metadata: Required<Pick<AgentChatMessageMetadata,
            'compactMode' | 'compactLength' | 'compactPromptId' | 'originalLength'
        >>;
    }> = [];

    // Phase 1: Identify expired messages
    for (let i = 0; i < params.conversationMessages.length; i++) {
        const msg = params.conversationMessages[i] as AgentChatMessage;

        // Skip messages without expiration metadata
        if (!msg.metadata?.expirationTurns && msg.metadata?.expirationTurns !== 0) {
            continue;
        }

        // Skip if expiration mode is None
        if (msg.metadata.expirationMode === 'None') {
            continue;
        }

        // Calculate age in turns
        const turnAdded = msg.metadata.turnAdded || 0;
        const turnsAlive = currentTurn - turnAdded;

        // Check if expired
        if (turnsAlive > msg.metadata.expirationTurns) {
            msg.metadata.isExpired = true;

            if (msg.metadata.expirationMode === 'Remove') {
                messagesToRemove.push(i);

                this.emitMessageLifecycleEvent({
                    type: 'message-expired',
                    turn: currentTurn,
                    messageIndex: i,
                    message: msg,
                    reason: `Expired after ${turnsAlive} turns (limit: ${msg.metadata.expirationTurns})`
                });
            } else if (msg.metadata.expirationMode === 'Compact') {
                // Ensure we have compact config
                if (msg.metadata.compactMode) {
                    messagesToCompact.push({
                        index: i,
                        message: msg,
                        metadata: {
                            compactMode: msg.metadata.compactMode,
                            compactLength: msg.metadata.compactLength || 500,
                            compactPromptId: msg.metadata.compactPromptId || '',
                            originalLength: typeof msg.content === 'string'
                                ? msg.content.length
                                : JSON.stringify(msg.content).length
                        }
                    });
                }
            }
        }
    }

    // Phase 2: Compact messages (may involve async LLM calls)
    const preserveOriginal = params.messageExpirationOverride?.preserveOriginalContent !== false;

    for (const item of messagesToCompact) {
        const originalContent = item.message.content;
        const compacted = await this.compactMessage(
            item.message,
            item.metadata,
            params
        );

        // Calculate token savings
        const originalTokens = this.estimateTokens(originalContent);
        const compactedTokens = this.estimateTokens(compacted);
        const tokensSaved = originalTokens - compactedTokens;

        // Update message in place
        params.conversationMessages[item.index] = {
            ...item.message,
            content: compacted,
            metadata: {
                ...item.message.metadata,
                wasCompacted: true,
                originalContent: preserveOriginal ? originalContent : undefined,
                originalLength: item.metadata.originalLength,
                tokensSaved,
                canExpand: preserveOriginal
            }
        };

        this.emitMessageLifecycleEvent({
            type: 'message-compacted',
            turn: currentTurn,
            messageIndex: item.index,
            message: params.conversationMessages[item.index] as AgentChatMessage,
            reason: `Compacted using ${item.metadata.compactMode} (saved ${tokensSaved} tokens)`,
            tokensSaved
        });
    }

    // Phase 3: Remove expired messages (reverse order to preserve indices)
    for (let i = messagesToRemove.length - 1; i >= 0; i--) {
        const index = messagesToRemove[i];
        const removed = params.conversationMessages.splice(index, 1)[0];

        this.emitMessageLifecycleEvent({
            type: 'message-removed',
            turn: currentTurn,
            messageIndex: index,
            message: removed as AgentChatMessage,
            reason: 'Removed due to expiration'
        });
    }

    // Log summary if verbose
    if (params.verbose && (messagesToCompact.length > 0 || messagesToRemove.length > 0)) {
        const totalSaved = messagesToCompact.reduce((sum, item) => {
            const msg = params.conversationMessages[item.index] as AgentChatMessage;
            return sum + (msg.metadata?.tokensSaved || 0);
        }, 0);

        console.log(`[Turn ${currentTurn}] Message pruning: ` +
            `${messagesToCompact.length} compacted (saved ~${totalSaved} tokens), ` +
            `${messagesToRemove.length} removed`);
    }
}
```

#### 5.6 Compact Message

```typescript
/**
 * Compacts a message using configured compaction mode.
 *
 * @param message - The message to compact
 * @param metadata - Compaction configuration
 * @param params - Agent execution parameters for context
 * @returns Compacted content string
 */
protected async compactMessage(
    message: AgentChatMessage,
    metadata: {
        compactMode: 'First N Chars' | 'AI Summary';
        compactLength: number;
        compactPromptId: string;
        originalLength: number;
    },
    params: ExecuteAgentParams
): Promise<string> {
    const originalContent = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);

    switch (metadata.compactMode) {
        case 'First N Chars': {
            const length = metadata.compactLength;

            if (originalContent.length <= length) {
                return originalContent; // Already short enough
            }

            const truncated = originalContent.substring(0, length);
            return `${truncated}...\n\n[Compacted: showing first ${length} of ${originalContent.length} characters. Agent can request expansion if needed.]`;
        }

        case 'AI Summary': {
            try {
                // Get prompt for summarization with lookup hierarchy:
                // 1. Runtime override (metadata.compactPromptId from messageExpirationOverride)
                // 2. AIAgentAction.CompactPromptID
                // 3. Action.DefaultCompactPromptID
                // 4. System default compact prompt
                const promptId = metadata.compactPromptId || this.getSystemDefaultCompactPromptId();
                const prompt = AIEngine.Instance.Prompts.find(p => p.ID === promptId);

                if (!prompt) {
                    // Fallback to First N Chars if prompt not found
                    console.warn(`Compact prompt ${promptId} not found, falling back to First N Chars`);
                    return this.compactMessage(message,
                        { ...metadata, compactMode: 'First N Chars' },
                        params
                    );
                }

                // Execute summarization prompt
                const promptParams = new AIPromptParams();
                promptParams.prompt = prompt;
                promptParams.data = {
                    originalContent,
                    originalLength: metadata.originalLength,
                    targetLength: metadata.compactLength || 500,
                    messageType: message.metadata?.messageType || 'unknown',
                    turnAdded: message.metadata?.turnAdded || 0
                    // Note: currentTurn is not needed in prompt data
                };
                promptParams.contextUser = params.contextUser;

                const runner = new AIPromptRunner();
                const result = await runner.ExecutePrompt<{ summary: string }>(promptParams);

                if (!result.success || !result.result?.summary) {
                    // Fallback to First N Chars on failure
                    console.warn('AI summary failed, falling back to First N Chars');
                    return this.compactMessage(message,
                        { ...metadata, compactMode: 'First N Chars' },
                        params
                    );
                }

                return `[AI Summary of ${metadata.originalLength} chars. Agent can request full expansion if needed.]\n\n${result.result.summary}`;

            } catch (error) {
                console.error('Error during AI summary:', error);
                // Fallback to First N Chars
                return this.compactMessage(message,
                    { ...metadata, compactMode: 'First N Chars' },
                    params
                );
            }
        }

        default:
            return originalContent;
    }
}

/**
 * Returns the system default prompt ID for message compaction.
 * Override this method to provide custom default summarization.
 */
protected getSystemDefaultCompactPromptId(): string {
    // TODO: Create system prompt for generic message summarization
    // For now, use a reasonable default
    return '00000000-0000-0000-0000-000000000000'; // Placeholder
}

/**
 * Estimates token count from content (rough approximation).
 * Uses 4 chars per token heuristic (conservative estimate).
 */
protected estimateTokens(content: ChatMessageContent): number {
    const text = typeof content === 'string'
        ? content
        : JSON.stringify(content);
    return Math.ceil(text.length / 4);
}
```

#### 5.7 Emit Lifecycle Event

```typescript
/**
 * Emits message lifecycle event if callback is registered
 */
protected emitMessageLifecycleEvent(event: MessageLifecycleEvent): void {
    if (this._messageLifecycleCallback) {
        this._messageLifecycleCallback(event);
    }
}
```

#### 5.8 Create System Default Compact Prompt

Create the system default compact prompt in `/metadata/prompts/` with appropriate metadata and template.

**File: `/metadata/prompts/.compact-message-prompt.json`**

```json
{
  "fields": {
    "Name": "Compact Agent Message",
    "TypeID": "@lookup:AI Prompt Types.Name=Chat",
    "TemplateText": "@file:templates/system/compact-message.template.md",
    "ResponseFormat": "JSON",
    "CategoryID": "@lookup:AI Prompt Categories.Name=MJ: System",
    "Description": "System prompt for compacting agent conversation messages to reduce token usage while preserving key information."
  },
  "relatedEntities": {
    "MJ: AI Prompt Models": [
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=GPT 4.1-mini",
          "Priority": 1
        }
      },
      {
        "fields": {
          "PromptID": "@parent:ID",
          "ModelID": "@lookup:AI Models.Name=Claude 4 Haiku",
          "Priority": 2
        }
      }
    ]
  }
}
```

**File: `/metadata/prompts/templates/system/compact-message.template.md`**

```markdown
You are a message compaction specialist. Your job is to create concise summaries of agent conversation messages while preserving all critical information.

# Input

**Original Content** ({{ originalLength }} characters):
```
{{ originalContent }}
```

**Context**:
- Message Type: {{ messageType }}
- Turn Added: {{ turnAdded }}
- Target Length: ~{{ targetLength }} characters

# Task

Create a compact summary that:
1. Preserves all key information and data points
2. Maintains factual accuracy
3. Stays within the target length (~{{ targetLength }} chars)
4. Is clear and readable
5. Omits verbose formatting, repetition, or unnecessary details

# Output Format

Return ONLY valid JSON:
```json
{
  "summary": "your compact summary here"
}
```

**CRITICAL**: The summary field must contain plain text (not nested JSON). If the original content was JSON, extract and summarize the key data points as readable text.
```

**Update getSystemDefaultCompactPromptId() method:**

The method should look up the prompt by name instead of returning a placeholder:

```typescript
protected getSystemDefaultCompactPromptId(): string {
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Compact Agent Message');
    if (!prompt) {
        console.warn('System default compact prompt not found. Ensure "Compact Agent Message" prompt exists.');
        return '';
    }
    return prompt.ID;
}
```

#### 5.9 Add ExpandMessage to BaseAgentNextStep Type

Update the `BaseAgentNextStep` type in `/packages/AI/CorePlus/src/agent-types.ts` to support message expansion.

**Current type:**

```typescript
export type BaseAgentNextStep<P = any, TContext = any> = {
    terminate: boolean;
    step: AIAgentRunEntityExtended['FinalStep'];
    // ... other fields
}
```

**Add new step type to AIAgentRun FinalStep:**

The `FinalStep` field supports: `'success'`, `'failed'`, `'retry'`, `'sub-agent'`, `'actions'`, `'chat'`

**Add:** `'expand-message'`

**Create new interface for ExpandMessage step:**

```typescript
/**
 * Request to expand a compacted message to its original content
 */
export interface ExpandMessageRequest {
    step: 'expand-message';
    messageIndex: number;
    reason?: string;
}
```

**Update BaseAgentNextStep to include ExpandMessage:**

```typescript
export type BaseAgentNextStep<P = any, TContext = any> =
    | { terminate: boolean; step: 'success'; /* ... */ }
    | { terminate: boolean; step: 'failed'; /* ... */ }
    | { terminate: boolean; step: 'retry'; /* ... */ }
    | { terminate: boolean; step: 'sub-agent'; /* ... */ }
    | { terminate: boolean; step: 'actions'; /* ... */ }
    | { terminate: boolean; step: 'chat'; /* ... */ }
    | { terminate: boolean; step: 'expand-message'; messageIndex: number; reason?: string; };
```

**Implement handler in BaseAgent:**

```typescript
/**
 * Expands a previously compacted message to its original content
 */
protected executeExpandMessageStep(
    request: ExpandMessageRequest,
    params: ExecuteAgentParams,
    currentTurn: number
): void {
    const { messageIndex, reason } = request;

    if (messageIndex < 0 || messageIndex >= params.conversationMessages.length) {
        console.warn(`Cannot expand message: index ${messageIndex} out of bounds`);
        return;
    }

    const message = params.conversationMessages[messageIndex] as AgentChatMessage;

    if (!message.metadata?.canExpand || !message.metadata?.originalContent) {
        console.warn(`Cannot expand message at index ${messageIndex}: not expandable or no original content`);
        return;
    }

    // Restore original content
    message.content = message.metadata.originalContent;
    message.metadata.wasCompacted = false;
    message.metadata.canExpand = false;
    delete message.metadata.originalContent;

    // Emit lifecycle event
    this.emitMessageLifecycleEvent({
        type: 'message-expanded',
        turn: currentTurn,
        messageIndex,
        message,
        reason: reason || 'Agent requested expansion'
    });

    if (params.verbose) {
        console.log(`[Turn ${currentTurn}] Expanded message at index ${messageIndex}`);
    }
}
```

**Update executeAgentInternal to handle expand-message step:**

In the main execution loop, add a case for handling expand-message:

```typescript
// In executeAgentInternal's step handling
if (currentNextStep.step === 'expand-message') {
    this.executeExpandMessageStep(
        currentNextStep as ExpandMessageRequest,
        params,
        stepCount
    );
    // Continue execution after expansion
    continue;
}
```

#### 5.10 Update Loop Agent System Prompt Template

Update `/metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` to teach agents about message expansion capability.

**Add to the "Execution Pattern" section:**

```markdown
## Execution Pattern
Each iteration:
1. Assess progress toward goal
2. Identify remaining work
3. Choose next step:
   - Continue reasoning
   {% if subAgentCount > 0 %}- Invoke sub-agent{% endif %}
   {% if actionCount > 0 %}- Execute action(s){% endif %}
   - **Expand compacted message** (if you need full details from a prior result)
4. Loop until done or blocked
```

**Add new section after "Key Rules":**

```markdown
## Message Expansion

Some action results may be **compacted** to save tokens. Compacted messages show:
- `[Compacted: ...]` or `[AI Summary of N chars...]` annotations
- Key information preserved but details omitted

**When to expand:**
- You need specific details from a prior result
- User asks about information that was in a compacted message
- You need to reference exact data points

**How to expand:**
```json
{
  "taskComplete": false,
  "nextStep": {
    "type": "expand-message",
    "messageIndex": 5,
    "reason": "Need full search results to answer user's question about item #47"
  }
}
```

**After expansion:** The message is restored to full content and you can access all details.
```

**Add to response format documentation:**

In the JSON schema section where nextStep types are documented, add:

```markdown
### Next Step Types

- `"Actions"`: Execute one or more actions
- `"Sub-Agent"`: Invoke a sub-agent
- `"Chat"`: Send message to user
- `"expand-message"`: Restore full content of a compacted message (use `messageIndex` to specify which message)
```

---

## Usage Examples

### Example 1: Google Search with Quick Truncation

```typescript
// In AIAgentAction configuration
const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions');
agentAction.AgentID = sageAgentId;
agentAction.ActionID = googleSearchActionId;
agentAction.ResultExpirationTurns = 2;           // Expire after 2 turns
agentAction.ResultExpirationMode = 'Compact';    // Compact instead of remove
agentAction.CompactMode = 'First N Chars';       // Simple truncation
agentAction.CompactLength = 500;                 // Keep first 500 chars
agentAction.CompactPromptID = null;              // N/A for First N Chars
await agentAction.Save();

// Result:
// Turn 1: Action executes, 5000 char result added to conversation
// Turn 2: Result still in conversation (turn 1, limit 2)
// Turn 3: Result still in conversation (turn 2, limit 2)
// Turn 4: Result compacted to 500 chars (turn 3 > limit 2)
//         Original preserved in metadata.originalContent
// Turn 5: Agent can request expansion if needed
```

### Example 2: Agent Expands Compacted Message

```typescript
// Agent detects compacted message has needed information
const agentDecision = {
    "step": "ExpandMessage",
    "messageIndex": 5,
    "reason": "User asked about search result #47 which was in the original results"
};

// BaseAgent automatically restores original content
// Conversation now shows full search results for that message
```

### Example 3: Runtime Override for Testing

```typescript
// Test agent with aggressive pruning
const result = await runner.RunAgent({
    agent: researchAgent,
    conversationMessages: [],
    contextUser: testUser,
    messageExpirationOverride: {
        expirationTurns: 1,          // Expire everything after 1 turn
        expirationMode: 'Compact',
        compactMode: 'First N Chars',
        compactLength: 200,
        preserveOriginalContent: true  // Keep originals for expansion
    }
});
```

### Example 4: Cost Control with AI Summary

```typescript
// In Action entity for "Query Database"
const action = await md.GetEntityObject<ActionEntity>('Actions');
action.DefaultCompactPromptID = databaseQuerySummaryPromptId;
await action.Save();

// In AIAgentAction for Research Agent
const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions');
agentAction.ResultExpirationTurns = 3;
agentAction.ResultExpirationMode = 'Compact';
agentAction.CompactMode = 'AI Summary';        // Use AI to summarize
agentAction.CompactPromptID = null;            // Use action's default
await agentAction.Save();
```

### Example 5: Lifecycle Monitoring

```typescript
// Track message lifecycle for debugging/metrics
const tokenSavings: number[] = [];
const compactionLog: string[] = [];

const result = await runner.RunAgent({
    agent: myAgent,
    conversationMessages: [],
    contextUser: user,
    onMessageLifecycle: (event) => {
        compactionLog.push(`[Turn ${event.turn}] ${event.type}: ${event.reason}`);
        if (event.tokensSaved) {
            tokenSavings.push(event.tokensSaved);
        }
        if (event.type === 'message-compacted') {
            const canExpand = (event.message.metadata as AgentChatMessageMetadata)?.canExpand;
            console.log(`  Can expand: ${canExpand}`);
        }
    }
});

console.log(`Total tokens saved: ${tokenSavings.reduce((a, b) => a + b, 0)}`);
console.log('Compaction log:', compactionLog.join('\n'));
```

---

## Database Schema

**Migration**: `V202510170800__v2.108.x__Add_Message_Expiration_To_AIAgentAction_And_Action.sql`

### AIAgentAction Table

```sql
ResultExpirationTurns INT NULL              -- Number of turns before expiration
ResultExpirationMode NVARCHAR(20) NOT NULL  -- 'None', 'Remove', 'Compact'
CompactMode NVARCHAR(20) NULL               -- 'First N Chars', 'AI Summary'
CompactLength INT NULL                      -- Character limit for First N Chars
CompactPromptID UNIQUEIDENTIFIER NULL       -- FK to AI Prompts
```

### Action Table

```sql
DefaultCompactPromptID UNIQUEIDENTIFIER NULL  -- FK to AI Prompts
```

---

## Migration Path

### Phase 1: Database Schema ✅
- Migration file created and run
- Columns added with proper constraints

### Phase 2: Entity Generation
- Run CodeGen to generate updated entity classes
- AIAgentActionEntity gains expiration fields
- ActionEntity gains DefaultCompactPromptID

### Phase 3: Type Extensions
- Make ChatMessage generic: `ChatMessage<M = any>`
- Define AgentChatMessageMetadata type
- Extend ExecuteAgentParams with overrides
- Add MessageLifecycleEvent type

### Phase 4: BaseAgent Implementation
- Use existing stepCount for turn tracking (no new variables needed)
- Implement pruneAndCompactExpiredMessages() with functional decomposition
- Implement compactMessage() with proper prompt lookup hierarchy
- Tag action result messages with metadata
- Store originalContent when compacting
- Wire up lifecycle callbacks
- Add executeExpandMessageStep()
- Create system default compact prompt in /metadata/prompts
- Update loop agent system prompt template with expansion instructions

### Phase 5: Testing & Rollout
- Unit tests for compaction logic
- Integration tests for expiration
- Test message expansion
- Test with real agents (Sage, Research Agent)
- Monitor token savings in production

---

## Testing Strategy

### Unit Tests

```typescript
describe('Message Expiration', () => {
    it('should compact message using First N Chars', async () => {
        const message = createActionResultMessage(5000); // 5000 chars
        const compacted = await agent.compactMessage(message, {
            compactMode: 'First N Chars',
            compactLength: 500,
            compactPromptId: '',
            originalLength: 5000
        }, params);

        expect(compacted.length).toBeLessThan(600); // 500 + annotation
        expect(compacted).toContain('[Compacted:');
        expect(compacted).toContain('Agent can request expansion');
    });

    it('should preserve original content when compacting', async () => {
        const originalContent = 'Very long search results...';
        const message: AgentChatMessage = {
            role: 'user',
            content: originalContent,
            metadata: {
                messageType: 'action-result',
                expirationTurns: 1,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 50
            }
        };

        await agent.pruneAndCompactExpiredMessages({ conversationMessages: [message] }, 2);

        expect(message.metadata?.wasCompacted).toBe(true);
        expect(message.metadata?.originalContent).toBe(originalContent);
        expect(message.metadata?.canExpand).toBe(true);
    });

    it('should expand compacted message on request', async () => {
        const original = 'Full content here...';
        const message: AgentChatMessage = {
            role: 'user',
            content: 'Compacted...',
            metadata: {
                wasCompacted: true,
                originalContent: original,
                canExpand: true
            }
        };

        const request: ExpandMessageRequest = {
            step: 'ExpandMessage',
            messageIndex: 0,
            reason: 'Need full details'
        };

        await agent.executeExpandMessageStep(request, {
            conversationMessages: [message]
        });

        expect(message.content).toBe(original);
        expect(message.metadata?.wasCompacted).toBe(false);
        expect(message.metadata?.canExpand).toBe(false);
    });
});
```

---

## Performance Considerations

### Token Estimation
- Simple heuristic: 4 chars per token
- Good enough for deciding when to compact
- Not used for billing (actual tokens from LLM provider)

### AI Summary Cost
- Each AI Summary compaction = 1 LLM call
- Use fast/cheap models (GPT-4o-mini, Claude Haiku)
- Fallback to First N Chars on error
- Consider caching summaries per content hash

### Memory Impact
- Metadata adds ~300-400 bytes per message when compacted
- originalContent doubles message size when preserved
- Trade-off: Memory vs. expansion capability
- Can disable with `preserveOriginalContent: false`

**Memory Calculation Example:**
- Original message: 5000 chars (~5KB)
- Compacted to 500 chars: ~0.5KB
- With original preserved: ~5.5KB (500 + 5000 + metadata)
- Without original: ~0.5KB (500 + metadata)
- Savings: 10x without preservation, break-even with preservation
- **Net benefit**: Context window savings (tokens) far exceeds memory cost

---

## Future Enhancements

### 1. Smart Expansion Hints
```typescript
// Agent can ask "what's in this message?" without full expansion
metadata: {
    summary: 'Search results for "MemberJunction agent framework"',
    itemCount: 47,
    canExpand: true
}
```

### 2. Partial Expansion
```typescript
// Expand just a portion of the content
{
    "step": "ExpandMessage",
    "messageIndex": 5,
    "itemRange": [40, 50]  // Just items 40-50 from search results
}
```

### 3. Content-Based Expiration
```typescript
// Expire based on relevance, not just age
metadata: {
    expirationStrategy: 'turn-based' | 'relevance-based',
    relevanceThreshold: 0.3
}
```

### 4. Semantic Deduplication
```typescript
// Remove duplicate action results
if (semanticSimilarity(newResult, previousResult) > 0.9) {
    removeMessage(previousResult);
}
```

---

## Backward Compatibility

### 100% Backward Compatible
- ✅ ChatMessage generic defaults to `any` for metadata
- ✅ `metadata` is optional on ChatMessage
- ✅ Existing code works unchanged
- ✅ No expiration by default (ResultExpirationMode = 'None')
- ✅ Opt-in per action via AIAgentAction configuration

### Migration for Existing Agents
1. All existing AIAgentAction records get `ResultExpirationMode = 'None'` (default)
2. No changes to existing agent behavior
3. Gradually configure expiration for high-volume actions (search, database queries)
4. Monitor token savings and adjust configurations

---

## Summary

This implementation provides:

1. ✅ **Generic Metadata**: Clean separation of concerns with `ChatMessage<M>`
2. ✅ **Expandable Content**: Agents can request full content when compacted
3. ✅ **Granular Control**: Per-action expiration configuration
4. ✅ **Flexible Compaction**: First N Chars (fast) or AI Summary (smart)
5. ✅ **Runtime Overrides**: Test and debug with custom expiration
6. ✅ **Permanent Records**: Database records never affected
7. ✅ **Token Savings**: Measurable cost reduction
8. ✅ **Backward Compatible**: Opt-in, no breaking changes
9. ✅ **Extensible**: Easy to add new compaction modes and features
10. ✅ **Observable**: Lifecycle events for monitoring

The key insights are:
- **Conversation messages are transient** (cleared after each run)
- **AIAgentRunStep.OutputData is permanent** (preserved in database)
- **Original content preservation** allows intelligent expansion on demand
- **Generic metadata** keeps core types clean while enabling type safety

This allows aggressive conversation management without losing audit trail or agent intelligence.
