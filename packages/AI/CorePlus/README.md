# @memberjunction/ai-core-plus

Core type definitions and shared interfaces for MemberJunction's AI subsystem. This package provides enhanced types that extend the base AI functionality with advanced features for agents and prompts.

## Key Types

### AIPromptRunResult

The `AIPromptRunResult<T>` interface represents the result of executing an AI prompt with comprehensive tracking and debugging information.

#### Model Selection Information (v2.78+)

The `modelSelectionInfo` property provides detailed insights into how models were selected for execution:

```typescript
modelSelectionInfo?: {
  // The AI Configuration entity that was used
  aiConfiguration?: AIConfigurationEntity;
  
  // All models that were considered during selection
  modelsConsidered: Array<{
    model: AIModelEntityExtended;    // Full model entity
    vendor?: AIVendorEntity;         // Vendor entity if specific vendor was used
    priority: number;                // Priority ranking
    available: boolean;              // Whether API key was available
    unavailableReason?: string;      // Why model wasn't available
  }>;
  
  // The selected model and vendor
  modelSelected: AIModelEntityExtended;
  vendorSelected?: AIVendorEntity;
  
  // Selection details
  selectionReason: string;           // Human-readable selection reason
  fallbackUsed: boolean;             // Whether a fallback model was used
  selectionStrategy?: 'Default' | 'Specific' | 'ByPower';
}
```

#### Execution Status

The `status` field uses the `ExecutionStatus` type with values:
- `'Pending'` - Execution not yet started
- `'Running'` - Currently executing
- `'Completed'` - Successfully completed
- `'Failed'` - Execution failed
- `'Cancelled'` - Execution was cancelled

#### Token Usage

Token tracking includes both individual and hierarchical (combined) usage:
- `promptTokens` / `completionTokens` - Tokens for this execution
- `combinedPromptTokens` / `combinedCompletionTokens` - Total including child prompts

## Agent Types

### ExecuteAgentParams

Parameters for executing AI agents with support for:
- Hierarchical agent execution
- Configuration-based model selection
- Conversation context
- Progress and streaming callbacks
- Cancellation support
- **Effort level control** - Override agent and prompt effort levels

### ExecuteAgentResult

Result of agent execution including:
- Success/failure status
- Agent run tracking entity
- Execution metadata
- Error information

### Iteration Types (v2.112+)

Support for ForEach and While loops in both Flow and Loop agents:

#### ForEachOperation
```typescript
interface ForEachOperation {
    collectionPath: string;        // Path to array in payload
    itemVariable?: string;         // Variable name (default: "item")
    indexVariable?: string;        // Index variable (default: "index")
    maxIterations?: number;        // Limit (undefined=1000, 0=unlimited)
    continueOnError?: boolean;     // Continue if iteration fails
    action?: { name: string; params: Record<string, unknown> };
    subAgent?: { name: string; message: string; templateParameters?: Record<string, unknown> };
}
```

#### WhileOperation
```typescript
interface WhileOperation {
    condition: string;             // Boolean expression
    itemVariable?: string;         // Variable name (default: "attempt")
    maxIterations?: number;        // Limit (undefined=100, 0=unlimited)
    continueOnError?: boolean;     // Continue if iteration fails
    action?: { name: string; params: Record<string, unknown> };
    subAgent?: { name: string; message: string; templateParameters?: Record<string, unknown> };
}
```

**See:** [@memberjunction/ai-agents Guide](../Agents/guide-to-iterative-operations-in-agents.md) for complete documentation and examples.

## Effort Level Control

MemberJunction supports granular control over AI model reasoning effort through a 1-100 integer scale. Higher values request more thorough reasoning and analysis from AI models that support effort levels.

### Effort Level Hierarchy

The effort level is resolved using the following precedence (highest to lowest priority):

1. **`ExecuteAgentParams.effortLevel`** - Runtime override (highest priority)
2. **`AIAgent.DefaultPromptEffortLevel`** - Agent default setting
3. **`AIPrompt.EffortLevel`** - Individual prompt setting
4. **Provider default** - Model's natural behavior (lowest priority)

### Provider Support

Different AI providers map the 1-100 scale to their specific parameters:

- **OpenAI**: Maps to `reasoning_effort` (1-33=low, 34-66=medium, 67-100=high)
- **Anthropic**: Maps to thinking mode with token budgets (1-100 → 25K-2M tokens)
- **Groq**: Maps to experimental `reasoning_effort` parameter
- **Gemini**: Controls reasoning mode intensity

### Usage Examples

```typescript
// Agent execution with effort level override
const params: ExecuteAgentParams = {
  agent: myAgent,
  conversationMessages: messages,
  effortLevel: 85, // High effort for thorough analysis
  contextUser: user
};

// Prompt execution with effort level
const promptParams = new AIPromptParams();
promptParams.prompt = myPrompt;
promptParams.effortLevel = 50; // Medium effort level
```

## System Placeholders

The `SystemPlaceholderManager` provides built-in placeholders for templates:
- `{{CURRENT_DATE}}` - Current date in ISO format
- `{{CURRENT_USER}}` - Current user's name
- `{{CURRENT_USER_EMAIL}}` - Current user's email
- Custom placeholder support

## Usage

```typescript
import { 
  AIPromptRunResult, 
  ExecuteAgentParams,
  ExecutionStatus 
} from '@memberjunction/ai-core-plus';

// Access model selection information
if (result.modelSelectionInfo) {
  console.log(`Selected: ${result.modelSelectionInfo.modelSelected.Name}`);
  console.log(`Strategy: ${result.modelSelectionInfo.selectionStrategy}`);
  console.log(`Considered ${result.modelSelectionInfo.modelsConsidered.length} models`);
}

// Check execution status
if (result.status === 'Completed') {
  // Handle success
} else if (result.status === 'Failed') {
  console.error(result.errorMessage);
}
```

## Agent Message Lifecycle Types

### AgentChatMessage and Metadata

The package provides specialized types for agent conversation message lifecycle management:

```typescript
// Typed metadata for agent messages
type AgentChatMessageMetadata = {
  // Expiration tracking
  turnAdded?: number;
  expirationTurns?: number;
  expirationMode?: 'None' | 'Remove' | 'Compact';

  // Compaction configuration
  compactMode?: 'First N Chars' | 'AI Summary';
  compactLength?: number;
  compactPromptId?: string;

  // Compaction state
  wasCompacted?: boolean;
  originalContent?: ChatMessage['content'];
  originalLength?: number;
  tokensSaved?: number;
  canExpand?: boolean;
  isExpired?: boolean;

  // Classification
  messageType?: 'action-result' | 'sub-agent-result' | 'chat' | 'system' | 'user';
}

// Agent message with typed metadata
type AgentChatMessage = ChatMessage<AgentChatMessageMetadata>;
```

### Message Lifecycle Events

Track message expiration, compaction, removal, and expansion:

```typescript
type MessageLifecycleEventType =
  | 'message-expired'
  | 'message-compacted'
  | 'message-removed'
  | 'message-expanded';

type MessageLifecycleEvent = {
  type: MessageLifecycleEventType;
  turn: number;
  messageIndex: number;
  message: AgentChatMessage;
  reason: string;
  tokensSaved?: number; // For compaction events
}

type MessageLifecycleCallback = (event: MessageLifecycleEvent) => void;
```

### Runtime Overrides

Configure message expiration behavior at runtime:

```typescript
type MessageExpirationOverride = {
  expirationTurns?: number;
  expirationMode?: 'None' | 'Remove' | 'Compact';
  compactMode?: 'First N Chars' | 'AI Summary';
  compactLength?: number;
  compactPromptId?: string;
  preserveOriginalContent?: boolean; // Default: true
}

// Use in ExecuteAgentParams
const params: ExecuteAgentParams = {
  agent: myAgent,
  conversationMessages: messages,
  contextUser: user,
  messageExpirationOverride: {
    expirationTurns: 2,
    expirationMode: 'Compact',
    compactMode: 'First N Chars',
    compactLength: 500
  },
  onMessageLifecycle: (event) => {
    console.log(`[Turn ${event.turn}] ${event.type}: ${event.reason}`);
  }
};
```

### Message Expansion

Agents can request expansion of compacted messages:

```typescript
// In BaseAgentNextStep
type BaseAgentNextStep = {
  step: 'Retry' | 'Actions' | 'Chat' | ...,
  messageIndex?: number,    // Index of message to expand
  expandReason?: string,    // Why expansion is needed
  // ... other fields
}

// Request expansion before retry
{
  "step": "Retry",
  "messageIndex": 5,
  "expandReason": "Need full search results to answer user's question"
}
```

## Version History

- **2.108.0** - Added message lifecycle management types and expiration configuration
- **2.78.0** - Added enhanced model selection tracking with entity objects
- **2.77.0** - Added execution status enums and cancellation support
- **2.50.0** - Initial release with core types