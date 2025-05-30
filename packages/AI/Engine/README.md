# @memberjunction/aiengine

The MemberJunction AI Engine package provides a comprehensive framework for AI-powered operations within the MemberJunction ecosystem. It serves as the central orchestration layer for AI model management, agent coordination, and basic prompt execution capabilities.

## Features

- **🤖 AI Agents**: Intelligent agents with specialized capabilities and context management
- **🧠 Model Management**: Registry of AI models with automatic selection and load balancing
- **📊 Performance Monitoring**: Basic tracking and analytics for AI operations
- **🔗 Entity Integration**: Seamless integration with MemberJunction entity system
- **⚡ Simple Prompt Execution**: Basic prompt execution for quick AI tasks

> **📝 Advanced Prompt Management**: For sophisticated stored prompt management, template rendering, and parallel execution capabilities, see the [@memberjunction/ai-prompts](../Prompts/README.md) package.

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

### Simple LLM Completions

For quick AI tasks without complex prompt management:

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

> **Note**: For advanced prompt management with templates, parallel execution, and stored prompts, use the [@memberjunction/ai-prompts](../Prompts/README.md) package.



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


### Performance Monitoring & Analytics

The engine provides basic tracking and analytics for AI operations. Advanced execution metrics, caching analytics, and parallel execution analytics are available in the [@memberjunction/ai-prompts](../Prompts/README.md) package.

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
- `Agents`: Available AI agents with their capabilities
- `VectorDatabases`: Vector database configurations

> **Note**: `Prompts` and `PromptCategories` properties are now available in the [@memberjunction/ai-prompts](../Prompts/README.md) package.

### Advanced Prompt Execution

For sophisticated prompt management with templates, parallel execution, and stored prompts, see the [@memberjunction/ai-prompts](../Prompts/README.md) package which provides the `AIPromptRunner` class and related functionality.

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


## Advanced Features

For sophisticated parallel execution, template rendering, and stored prompt management, see the [@memberjunction/ai-prompts](../Prompts/README.md) package.

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities  
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: AI abstractions and interfaces
- `rxjs`: Reactive programming support

## Related Packages

- `@memberjunction/ai-prompts`: Advanced prompt management with templates, parallel execution, and stored prompts

## Migration Guide

### From AI Actions to AI Prompts

If you're migrating from the deprecated AI Actions system, you can either:

1. **Use Simple LLM Completions** (basic use cases):
```typescript
// Old AI Actions approach (deprecated)
const actionParams: AIActionParams = {
    actionId: 'action-id',
    modelId: 'model-id',
    systemPrompt: "System message",
    userPrompt: "User message"
};
const result = await AIEngine.Instance.ExecuteAIAction(actionParams);

// New Simple LLM approach (basic cases)
const response = await AIEngine.Instance.SimpleLLMCompletion(
    "User message",
    currentUser,
    "System message"
);
```

2. **Use Advanced Prompts** (complex use cases): See the [@memberjunction/ai-prompts](../Prompts/README.md) package for sophisticated prompt management with templates and parallel execution.

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

// New approach: Use AI Agents with either simple completions or advanced prompts
const agent = AIEngine.Instance.Agents.find(a => a.Name === 'Your Agent Name');

// For simple cases - use SimpleLLMCompletion
const entityData = JSON.stringify(entity.GetAll());
const response = await AIEngine.Instance.SimpleLLMCompletion(
    `Analyze this ${entity.EntityType} entity: ${entityData}`,
    currentUser,
    `You are an expert ${agent.Purpose}`
);

// For complex cases - use @memberjunction/ai-prompts package
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