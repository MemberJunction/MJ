# @memberjunction/aiengine

The MemberJunction AI Engine package provides a comprehensive framework for AI-powered operations within the MemberJunction ecosystem. It serves as the central orchestration layer for AI model management, prompt execution, agent coordination, and intelligent caching with advanced parallel processing capabilities.

## Features

- **🤖 AI Agents**: Intelligent agents with specialized capabilities and context management
- **📝 AI Prompts**: Advanced prompt system with template rendering and parallel execution
- **⚡ Parallel Processing**: Sophisticated parallel execution with multiple models and result selection
- **🧠 Model Management**: Registry of AI models with automatic selection and load balancing
- **💾 Result Caching**: Intelligent caching with vector similarity matching and TTL management
- **🔄 Template Integration**: Dynamic prompt generation with MemberJunction template system
- **📊 Performance Monitoring**: Comprehensive metrics, token usage tracking, and execution analytics
- **🔗 Entity Integration**: Seamless integration with MemberJunction entity system

## Installation

```bash
npm install @memberjunction/aiengine
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- At least one AI model provider (e.g., `@memberjunction/ai-openai`)

## Core Architecture

### AI Agents

**AI Agents** are the primary interface for interacting with AI capabilities. Each agent has:

- **Specialized Purpose**: Domain-specific knowledge and capabilities
- **Model Configuration**: Associated AI models for different tasks
- **Context Management**: Maintains conversation context and state
- **Action Library**: Predefined actions the agent can perform
- **Note System**: Learning and memory capabilities

```typescript
import { AIEngine } from '@memberjunction/aiengine';

// Initialize the engine
await AIEngine.Instance.Config(false, currentUser);

// Get available agents
const agents = AIEngine.Instance.Agents;
const dataAnalysisAgent = agents.find(a => a.Name === 'Data Analysis Agent');

// Agents are configured through the MemberJunction metadata system
console.log(`Agent: ${dataAnalysisAgent.Name}`);
console.log(`Purpose: ${dataAnalysisAgent.Purpose}`);
console.log(`Available Actions: ${dataAnalysisAgent.Actions.length}`);
```

### AI Prompts & Parallel Execution

**AI Prompts** provide sophisticated prompt management with parallel execution capabilities:

#### Basic Prompt Execution

```typescript
import { AIPromptRunner, AIPromptParams } from '@memberjunction/aiengine';

// Get a prompt from the system
const prompts = AIEngine.Instance.Prompts;
const summaryPrompt = prompts.find(p => p.Name === 'Document Summarization');

// Execute the prompt
const params: AIPromptParams = {
    prompt: summaryPrompt,
    data: { 
        documentText: "Long document content here...",
        targetLength: "2 paragraphs" 
    },
    contextUser: currentUser
};

const runner = new AIPromptRunner();
const result = await runner.RunPrompt(params);

if (result.success) {
    console.log("Summary:", result.result);
} else {
    console.error("Error:", result.error);
}
```

#### Advanced Parallel Execution

The AI Engine supports sophisticated parallel execution strategies:

```typescript
// Prompts can be configured for parallel execution:
// - ParallelizationMode: 'None', 'StaticCount', 'ConfigParam', 'ModelSpecific'
// - ParallelCount: Number of parallel executions
// - ExecutionGroups: Sequential group execution with parallel tasks within groups

// Example: Execute the same prompt across multiple models in parallel
const multiModelPrompt = prompts.find(p => p.ParallelizationMode === 'ModelSpecific');

const result = await runner.RunPrompt({
    prompt: multiModelPrompt,
    data: { query: "Analyze this data pattern" },
    contextUser: currentUser
});

// Result contains aggregated outputs from all models
console.log(`Executed across ${result.executionResults?.length} models`);
console.log(`Selected result: ${result.result}`);
console.log(`All results available: ${result.allResults?.length}`);
```

#### Result Selection Strategies

```typescript
// The engine supports multiple result selection methods:
// - 'First': Use the first successful result
// - 'Random': Randomly select from successful results  
// - 'PromptSelector': Use AI to select the best result
// - 'Consensus': Select result with highest agreement

// Result selector prompts can be configured to intelligently choose
// the best result from parallel executions
```

### Template Integration

Prompts integrate with the MemberJunction template system for dynamic content:

```typescript
// Prompt templates support dynamic data substitution
const templatePrompt = {
    UserMessage: `Analyze the {{entity.EntityType}} record for {{entity.Name}}. 
                 Focus on {{analysisType}} and provide insights about {{entity.Description}}.`
};

// Data context provides template variables
const result = await runner.RunPrompt({
    prompt: templatePrompt,
    data: {
        entity: {
            EntityType: "Customer",
            Name: "Acme Corp",
            Description: "Enterprise software company"
        },
        analysisType: "growth opportunities"
    },
    contextUser: currentUser
});
```

### Intelligent Caching

The engine provides sophisticated caching with vector similarity matching:

```typescript
// Caching is automatically handled based on prompt configuration:
// - EnableCaching: Whether to use caching for this prompt
// - CacheMatchType: 'Exact' or 'Vector' similarity matching
// - CacheTTLSeconds: Time-to-live for cached results
// - CacheMustMatchModel/Vendor/Agent: Cache constraint options

// Vector similarity allows reusing results for semantically similar prompts
// even if the exact text differs
```

### Model Management

The engine maintains a comprehensive registry of AI models:

```typescript
// Get all available models
const allModels = AIEngine.Instance.Models;
const llmModels = AIEngine.Instance.LanguageModels;

// Get the most powerful model for a specific vendor
const bestOpenAI = await AIEngine.Instance.GetHighestPowerLLM('OpenAI', currentUser);
const bestModel = await AIEngine.Instance.GetHighestPowerModel(null, 'LLM', currentUser);

// Models are automatically selected based on:
// - PowerRank: Relative capability ranking
// - ModelType: LLM, Vision, Audio, etc.
// - Vendor: OpenAI, Anthropic, Google, etc.
// - Cost and performance characteristics
```

### Simple LLM Completions

For quick AI tasks without the full prompt system:

```typescript
// Simple completion with automatic model selection
const response = await AIEngine.Instance.SimpleLLMCompletion(
    "Explain the benefits of TypeScript over JavaScript",
    currentUser,
    "You are a helpful programming tutor who explains concepts clearly."
);

console.log("AI Response:", response);

// With specific model
const specificModel = allModels.find(m => m.Name === 'GPT-4');
const response2 = await AIEngine.Instance.SimpleLLMCompletion(
    "Analyze this code for potential issues",
    currentUser,
    "You are an expert code reviewer",
    specificModel
);
```

### Performance Monitoring & Analytics

The engine provides comprehensive tracking and analytics:

```typescript
// Execution results include detailed metrics
const result = await runner.RunPrompt(params);

console.log(`Execution time: ${result.executionTimeMS}ms`);
console.log(`Tokens used: ${result.totalTokensUsed}`);
console.log(`Cost estimate: $${result.estimatedCost}`);
console.log(`Cache hit: ${result.cacheHit}`);

// For parallel executions
if (result.executionResults) {
    result.executionResults.forEach((execResult, index) => {
        console.log(`Model ${index}: ${execResult.model.Name}`);
        console.log(`  Tokens: ${execResult.totalTokensUsed}`);
        console.log(`  Time: ${execResult.executionTimeMS}ms`);
        console.log(`  Success: ${execResult.success}`);
    });
}
```

## API Reference

### AIEngine Class

The central orchestration class for all AI operations.

#### Key Methods

- `Config(forceRefresh?, contextUser?, provider?)`: Load AI configuration metadata
- `SimpleLLMCompletion(userPrompt, contextUser, systemPrompt?, model?, apiKey?)`: Quick text completion
- `GetHighestPowerModel(vendorName, modelType, contextUser?)`: Get the most powerful model of a type
- `GetHighestPowerLLM(vendorName?, contextUser?)`: Get the most powerful LLM
- `PrepareLLMInstance(contextUser, model?, apiKey?)`: Prepare an LLM instance for use
- `PrepareChatMessages(userPrompt, systemPrompt?)`: Format chat messages properly

#### Key Properties

- `Models`: All registered AI models with extended capabilities
- `LanguageModels`: Just the LLM type models
- `Prompts`: All registered AI prompts with template support
- `PromptCategories`: Organized prompt categories with associated prompts
- `Agents`: Available AI agents with their capabilities
- `VectorDatabases`: Vector database configurations

### AIPromptRunner Class

Handles execution of AI prompts with advanced parallel processing.

#### Methods

- `RunPrompt(params: AIPromptParams)`: Execute a prompt with full feature support
- `ValidatePromptOutput(prompt, result, data?)`: Validate AI output against criteria

#### AIPromptParams Interface

```typescript
interface AIPromptParams {
    prompt: AIPromptEntity;           // The prompt to execute
    data?: any;                       // Template and context data
    modelId?: string;                 // Override model selection
    vendorId?: string;                // Override vendor selection
    configurationId?: string;         // Environment-specific config
    contextUser?: UserInfo;           // User context
    skipValidation?: boolean;         // Skip output validation
}
```

### Extended Entity Classes

#### AIAgentEntityExtended

Extended AI Agent entity with relationship management:

```typescript
class AIAgentEntityExtended extends AIAgentEntity {
    get Actions(): AIAgentActionEntity[];  // Agent's available actions
    get Models(): AIAgentModelEntity[];    // Associated models (deprecated)
    get Notes(): AIAgentNoteEntity[];      // Agent's learning notes
}
```

#### AIPromptCategoryEntityExtended

Extended prompt category with prompt collection:

```typescript
class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
    get Prompts(): AIPromptEntity[];       // Prompts in this category
}
```

## Parallel Execution System

The engine includes a sophisticated parallel execution system with the following components:

### ExecutionPlanner

Plans and organizes execution tasks based on prompt configuration:

- Analyzes parallelization modes and model configurations
- Creates execution groups for coordinated processing
- Determines optimal task distribution and priority

### ParallelExecutionCoordinator  

Orchestrates parallel execution across multiple models:

- Manages concurrency limits and resource utilization
- Handles error recovery and retry logic
- Aggregates results and applies selection strategies
- Provides comprehensive execution metrics

### Supported Parallelization Modes

- **None**: Traditional single execution
- **StaticCount**: Fixed number of parallel executions
- **ConfigParam**: Dynamic parallel count from configuration
- **ModelSpecific**: Individual model configurations with execution groups

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities  
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: AI abstractions and interfaces
- `@memberjunction/templates`: Template rendering system
- `rxjs`: Reactive programming support

## Migration Guide

### From AI Actions to AI Prompts

If you're migrating from the deprecated AI Actions system:

```typescript
// Old AI Actions approach (deprecated)
const actionParams: AIActionParams = {
    actionId: 'action-id',
    modelId: 'model-id',
    systemPrompt: "System message",
    userPrompt: "User message"
};
const result = await AIEngine.Instance.ExecuteAIAction(actionParams);

// New AI Prompts approach (recommended)
const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Your Prompt Name');
const promptParams: AIPromptParams = {
    prompt: prompt,
    data: { /* your template data */ },
    contextUser: currentUser
};
const runner = new AIPromptRunner();
const result = await runner.RunPrompt(promptParams);
```

### From Entity AI Actions to AI Agents

```typescript
// Old Entity AI Actions approach (deprecated)
const entityParams: EntityAIActionParams = {
    actionId: 'action-id',
    modelId: 'model-id', 
    entityAIActionId: 'entity-action-id',
    entityRecord: entity
};
const result = await AIEngine.Instance.ExecuteEntityAIAction(entityParams);

// New AI Agents approach (recommended)
const agent = AIEngine.Instance.Agents.find(a => a.Name === 'Your Agent Name');
const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Entity Analysis');
const promptParams: AIPromptParams = {
    prompt: prompt,
    data: { entity: entity.GetAll() },
    contextUser: currentUser
};
const runner = new AIPromptRunner();
const result = await runner.RunPrompt(promptParams);
```

## License

ISC

---

## Deprecated Features

The following features are deprecated and will be removed in a future version. Please migrate to the new AI Agents and AI Prompts system.

### AI Actions (Deprecated)

**⚠️ DEPRECATED**: AI Actions are deprecated in favor of the new AI Prompts system which provides better template support, parallel execution, and caching capabilities.

AI Actions represented different AI operations like:

- `chat`: General conversational AI
- `summarize`: Text summarization  
- `classify`: Text classification

```typescript
// Deprecated - use AI Prompts instead
import { AIActionParams } from '@memberjunction/aiengine';

const params: AIActionParams = {
    actionId: 'summarize-action-id',
    modelId: 'gpt4-model-id',
    systemPrompt: "You are a helpful assistant that creates concise summaries.",
    userPrompt: "Summarize the following document: " + documentText
};

const result = await AIEngine.Instance.ExecuteAIAction(params);
console.log("Summary:", result.data?.choices[0]?.message?.content);
```

### Entity AI Actions (Deprecated)

**⚠️ DEPRECATED**: Entity AI Actions are deprecated in favor of AI Agents which provide better context management, learning capabilities, and entity integration.

Entity AI Actions connected AI actions to specific entity types, defining:

- Input preparation from entity records
- Output handling (save to fields or create related records)  
- Default prompts and models to use

```typescript
// Deprecated - use AI Agents instead
import { EntityAIActionParams } from '@memberjunction/aiengine';
import { Metadata } from '@memberjunction/core';

// Load an entity record
const md = new Metadata();
const customer = await md.GetEntityObject('Customers');
await customer.Load(customerId);

// Execute an AI action
const params: EntityAIActionParams = {
    actionId: 'action-id-here',
    modelId: 'model-id-here', 
    entityAIActionId: 'entity-action-id-here',
    entityRecord: customer
};

const result = await AIEngine.Instance.ExecuteEntityAIAction(params);

if (result && result.success) {
    console.log("AI processing completed successfully");
    // The entity record has been updated if configured that way
} else {
    console.error("Error:", result.errorMessage);
}
```

### Dynamic Prompt Generation (Legacy)

**⚠️ DEPRECATED**: The old markup-based prompt generation is deprecated in favor of the template system integration.

```typescript
// Deprecated markup approach
const entityAction = {
    UserMessage: "Please summarize the customer profile for {Name} who works at {Company}."
};

// When executed on a record with Name="John Doe" and Company="Acme Inc"
// The prompt becomes: "Please summarize the customer profile for John Doe who works at Acme Inc."
```

### Result Caching (Legacy Methods)

**⚠️ DEPRECATED**: Manual cache management methods are deprecated in favor of automatic caching through the prompt system.

```typescript
// Deprecated manual caching
const cached = await AIEngine.Instance.CheckResultCache(fullPromptText);
if (cached) {
    console.log("Using cached result:", cached.ResultText);
    return cached.ResultText;
}

const result = await AIEngine.Instance.ExecuteAIAction(params);
await AIEngine.Instance.CacheResult(model, prompt, fullPromptText, result.data.choices[0].message.content);
```