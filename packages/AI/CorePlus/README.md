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

### ExecuteAgentResult

Result of agent execution including:
- Success/failure status
- Agent run tracking entity
- Execution metadata
- Error information

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

## Version History

- **2.78.0** - Added enhanced model selection tracking with entity objects
- **2.77.0** - Added execution status enums and cancellation support
- **2.50.0** - Initial release with core types