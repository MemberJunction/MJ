# @memberjunction/aiengine

The MemberJunction AI Engine package provides a comprehensive framework for AI-powered operations within the MemberJunction ecosystem. It serves as the central orchestration layer for AI model management, agent coordination, and basic prompt execution capabilities.

## Features

- **🤖 AI Agents**: Intelligent agents with specialized capabilities and context management
- **🧠 Model Management**: Registry of AI models with automatic selection and load balancing
- **📊 Performance Monitoring**: Basic tracking and analytics for AI operations
- **🔗 Entity Integration**: Seamless integration with MemberJunction entity system
- **⚡ Simple Prompt Execution**: Basic prompt execution for quick AI tasks
- **🏗️ Agent Type System**: Defines agent types and their behavioral characteristics

> **📝 Advanced Prompt Management**: For sophisticated stored prompt management, template rendering, and parallel execution capabilities, see the [@memberjunction/ai-prompts](../Prompts/README.md) package.

### Type Organization Update (2025)

As part of improving code organization:
- **This package** now contains:
  - Extended entity classes for AI operations
  - Agent type definitions and factory interfaces
  - The new `agent-types.ts` file with agent type classes
- **Base AI types** are imported from `@memberjunction/ai` (Core)
- **Agent execution types** are imported from `@memberjunction/ai-agents`
- **Prompt types** are imported from `@memberjunction/ai-prompts`

## Installation

```bash
npm install @memberjunction/aiengine
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/ai](../Core/README.md) for base AI types
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

##### Initialization
- `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider)`: Load AI configuration metadata from the MemberJunction system

##### Simple LLM Operations
- `SimpleLLMCompletion(userPrompt: string, contextUser: UserInfo, systemPrompt?: string, model?: AIModelEntityExtended, apiKey?: string)`: Quick text completion for basic use cases
- `ParallelLLMCompletions(userPrompt: string, contextUser: UserInfo, systemPrompt?: string, iterations?: number, temperatureIncrement?: number, baseTemperature?: number, model?: AIModelEntityExtended, apiKey?: string, callbacks?: ParallelChatCompletionsCallbacks)`: Execute multiple parallel completions with different parameters

##### Model Management
- `GetHighestPowerModel(vendorName: string, modelType: string, contextUser?: UserInfo)`: Get the most powerful model of a specific type from a vendor
- `GetHighestPowerLLM(vendorName?: string, contextUser?: UserInfo)`: Get the most powerful LLM, optionally filtered by vendor
- `PrepareLLMInstance(contextUser: UserInfo, model?: AIModelEntityExtended, apiKey?: string)`: Prepare an LLM instance with proper configuration
- `PrepareChatMessages(userPrompt: string, systemPrompt?: string)`: Format chat messages in the standard format

##### Agent Management
- `GetAgentByName(agentName: string)`: Get a specific AI agent by name
- `AgenteNoteTypeIDByName(agentNoteTypeName: string)`: Get the ID of an agent note type by name

#### Key Properties

##### Models and Databases
- `Models`: All registered AI models with extended capabilities
- `LanguageModels`: Filtered list of LLM type models
- `VectorDatabases`: Available vector database configurations
- `ArtifactTypes`: Registered artifact types for AI outputs

##### AI Agents
- `Agents`: Available AI agents with their capabilities and configurations
- `AgentActions`: All available agent actions
- `AgentModels`: Model associations for agents (deprecated)
- `AgentNoteTypes`: Types of notes agents can create
- `AgentNotes`: All agent notes/learnings

##### Prompts (Reference Only)
- `Prompts`: All registered prompts (use @memberjunction/ai-prompts for execution)
- `PromptModels`: Model associations for prompts
- `PromptTypes`: Available prompt types
- `PromptCategories`: Prompt category hierarchy

##### Deprecated Properties
- `Actions`: Legacy AI actions (deprecated)
- `EntityAIActions`: Legacy entity AI actions (deprecated)
- `ModelActions`: Legacy model actions (deprecated)

> **Note**: `Prompts` and `PromptCategories` properties are now available in the [@memberjunction/ai-prompts](../Prompts/README.md) package.

### Advanced Prompt Execution

For sophisticated prompt management with templates, parallel execution, and stored prompts, see the [@memberjunction/ai-prompts](../Prompts/README.md) package which provides the `AIPromptRunner` class and related functionality.

### Extended Entity Classes

#### AIAgentEntityExtended

Extended AI Agent entity with relationship management:

```typescript
class AIAgentEntityExtended extends AIAgentEntity {
    get Actions(): AIAgentActionEntity[];  // Agent's available actions
    get Models(): AIAgentModelEntity[];    // Associated models (deprecated - use prompts)
    get Notes(): AIAgentNoteEntity[];      // Agent's learning notes
}
```

#### AIPromptCategoryEntityExtended

Extended prompt category with hierarchical prompt management:

```typescript
class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
    get Prompts(): AIPromptEntity[];  // Prompts in this category
}
```

#### AIModelEntityExtended

The AI Engine automatically extends AI Model entities with additional capabilities from the AI provider system. These extended models include all driver-specific functionality and API integration.

### Agent Type System

The Engine now includes specialized agent type classes in `agent-types.ts`:

```typescript
// Base agent type - foundation for all agent types
import { BaseAgentType } from '@memberjunction/aiengine';

// Specialized agent types
import { LoopAgentType } from '@memberjunction/aiengine';

// Agent types define behavioral characteristics:
// - System prompts for consistent behavior
// - Decision-making patterns
// - Execution flow control
```


## Advanced Features

### Parallel Execution

The AI Engine supports parallel execution of LLM calls with varying parameters:

```typescript
// Execute 5 parallel completions with increasing temperature
const results = await AIEngine.Instance.ParallelLLMCompletions(
    "Generate creative product names for a smart water bottle",
    currentUser,
    "You are a creative product naming expert",
    5,        // iterations
    0.15,     // temperature increment
    0.5,      // base temperature
    null,     // use best available model
    null,     // use default API key
    {
        onProgress: (completed, total) => {
            console.log(`Progress: ${completed}/${total}`);
        },
        onComplete: (results) => {
            console.log(`All ${results.length} completions finished`);
        }
    }
);

// Results array contains all completion responses
results.forEach((result, index) => {
    if (result.success) {
        console.log(`Result ${index + 1}:`, result.data.choices[0].message.content);
    }
});
```

### Model Selection Strategies

The AI Engine provides intelligent model selection:

```typescript
// Get the best model regardless of vendor
const bestModel = await AIEngine.Instance.GetHighestPowerModel(null, 'LLM', currentUser);

// Get the best OpenAI model specifically
const bestOpenAI = await AIEngine.Instance.GetHighestPowerLLM('OpenAI', currentUser);

// Get the best vision model
const bestVision = await AIEngine.Instance.GetHighestPowerModel(null, 'Vision', currentUser);

// Get the best audio model
const bestAudio = await AIEngine.Instance.GetHighestPowerModel(null, 'Audio', currentUser);
```

### Working with AI Agents

AI Agents provide specialized capabilities:

```typescript
// Find a specific agent
const codeAgent = AIEngine.Instance.GetAgentByName('Code Assistant Agent');

// Access agent properties
console.log('Agent Purpose:', codeAgent.Purpose);
console.log('Available Actions:', codeAgent.Actions.length);
console.log('Learning Notes:', codeAgent.Notes.length);

// Use agent context in prompts
const response = await AIEngine.Instance.SimpleLLMCompletion(
    "Review this TypeScript code for best practices",
    currentUser,
    `You are ${codeAgent.Name}. ${codeAgent.Purpose}`
);
```

For sophisticated parallel execution, template rendering, and stored prompt management, see the [@memberjunction/ai-prompts](../Prompts/README.md) package.

## Import Examples

```typescript
// Import main AI Engine class
import { AIEngine } from '@memberjunction/aiengine';

// Import extended entity types
import { 
  AIAgentEntityExtended,
  AIPromptCategoryEntityExtended,
  AIModelEntityExtended 
} from '@memberjunction/aiengine';

// Import agent type classes
import { BaseAgentType, LoopAgentType } from '@memberjunction/aiengine';

// Import base AI types from Core
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';

// When working with agents, import execution types
import { AgentExecutionParams, AgentExecutionResult } from '@memberjunction/ai-agents';
```

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities  
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: Base AI types and interfaces (imported for core types)
- `@memberjunction/templates`: Template engine integration
- `@memberjunction/templates-base-types`: Template base type definitions
- `rxjs`: Reactive programming support
- `dotenv`: Environment variable management

## Related Packages

- `@memberjunction/ai-prompts`: Advanced prompt management with templates, parallel execution, and stored prompts
- `@memberjunction/ai-agents`: AI Agent implementations and specialized behaviors
- `@memberjunction/ai`: Core AI abstractions and interfaces
- AI Provider Packages:
  - `@memberjunction/ai-openai`: OpenAI model provider
  - `@memberjunction/ai-anthropic`: Anthropic (Claude) model provider
  - `@memberjunction/ai-groq`: Groq model provider
  - `@memberjunction/ai-mistral`: Mistral AI model provider
  - `@memberjunction/ai-azure`: Azure AI model provider
  - `@memberjunction/ai-bedrock`: AWS Bedrock model provider
  - `@memberjunction/ai-vertex`: Google Vertex AI model provider
  - `@memberjunction/ai-cerebras`: Cerebras model provider
  - `@memberjunction/ai-bettybot`: BettyBot model provider

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

## Build and Development

### Building the Package
```bash
# From the package directory
npm run build

# Watch mode for development
npm run watch
```

### Running Tests
```bash
npm test
```

## Configuration

The AI Engine uses environment variables for API keys:

```bash
# .env file
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GROQ_API_KEY=your-groq-key
MISTRAL_API_KEY=your-mistral-key
# ... other provider API keys
```

Alternatively, API keys can be passed directly to methods or configured in the MemberJunction metadata system.

## Error Handling

The AI Engine provides comprehensive error handling:

```typescript
try {
    const response = await AIEngine.Instance.SimpleLLMCompletion(
        userPrompt,
        currentUser,
        systemPrompt
    );
    console.log('Success:', response);
} catch (error) {
    if (error.message.includes('AI Metadata not loaded')) {
        // Metadata needs to be loaded first
        await AIEngine.Instance.Config(false, currentUser);
    } else if (error.message.includes('User prompt not provided')) {
        // Handle missing prompt
    } else {
        // Handle other errors
        console.error('AI Engine Error:', error);
    }
}
```

## Performance Considerations

1. **Metadata Loading**: Call `Config()` once at application startup to load all AI metadata
2. **Model Selection**: Use `GetHighestPowerModel()` methods to automatically select optimal models
3. **Parallel Execution**: Use `ParallelLLMCompletions()` for improved reliability and result quality
4. **Caching**: For advanced caching capabilities, use the @memberjunction/ai-prompts package

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