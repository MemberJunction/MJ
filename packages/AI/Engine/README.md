# @memberjunction/aiengine

The MemberJunction AI Engine package manages and executes AI-powered actions across entities in the MemberJunction ecosystem. It provides a comprehensive framework for defining, configuring, and running AI actions with various models, handling metadata, caching, prompt generation, and integration with entity records.

## Features

- **AI Action Framework**: Coordinate AI actions across entity records
- **Model Management**: Maintain a registry of AI models and their capabilities
- **Dynamic Prompt Generation**: Build prompts with entity data substitution
- **Entity Integration**: Pre and post-processing hooks for entity AI operations
- **Results Caching**: Cache AI operation results for faster responses
- **Multi-Model Support**: Switch between different AI providers
- **Agent Infrastructure**: Support for AI agents with specialized capabilities

## Installation

```bash
npm install @memberjunction/aiengine
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- At least one AI model provider (e.g., `@memberjunction/ai-openai`)

## Core Concepts

### AI Models

AI Models represent specific model implementations from various providers (OpenAI, Anthropic, etc.). Each model has:

- A driver class that implements the actual AI functionality
- Configuration details (API name, vendor, model type)
- Power ranking and other attributes

### AI Actions

Actions represent different AI operations like:

- `chat`: General conversational AI
- `summarize`: Text summarization
- `classify`: Text classification

### Entity AI Actions

Entity AI Actions connect AI actions to specific entity types, defining:

- Input preparation from entity records 
- Output handling (save to fields or create related records)
- Default prompts and models to use

## Usage

### Initialization

Load the AI Engine and its metadata:

```typescript
import { AIEngine } from '@memberjunction/aiengine';

// Initialize the engine
await AIEngine.Instance.Config(false, currentUser);
```

### Simple LLM Completions

For quick AI tasks with minimal setup:

```typescript
// Get a simple completion with the highest power LLM
const response = await AIEngine.Instance.SimpleLLMCompletion(
  "What can you tell me about TypeScript?",
  currentUser,
  "You are a helpful assistant that specializes in programming languages."
);

console.log("AI Response:", response);
```

### Entity AI Actions

Execute AI actions on entity records:

```typescript
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

### Dynamic Prompt Generation

Use entity values in prompts:

```typescript
// The markup will replace {FieldName} with actual values
const entityAction = {
  UserMessage: "Please summarize the customer profile for {Name} who works at {Company}."
};

// When executed on a record with Name="John Doe" and Company="Acme Inc"
// The prompt becomes: "Please summarize the customer profile for John Doe who works at Acme Inc."
```

### Manual AI Actions

Execute AI actions directly:

```typescript
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

### Result Caching

Check for cached results before running expensive operations:

```typescript
// Check if we have a cached result
const cached = await AIEngine.Instance.CheckResultCache(fullPromptText);

if (cached) {
  console.log("Using cached result:", cached.ResultText);
  return cached.ResultText;
}

// Otherwise execute the action and cache the result
const result = await AIEngine.Instance.ExecuteAIAction(params);

// Cache the result for future use
await AIEngine.Instance.CacheResult(
  model, 
  prompt, 
  fullPromptText, 
  result.data.choices[0].message.content
);
```

## API Reference

### AIEngine Class

The central class that manages all AI operations.

#### Methods

- `Config(forceRefresh?, contextUser?, provider?)`: Load AI configuration metadata
- `ExecuteEntityAIAction(params: EntityAIActionParams)`: Execute an AI action on an entity
- `ExecuteAIAction(params: AIActionParams)`: Execute a generic AI action
- `SimpleLLMCompletion(userPrompt, contextUser, systemPrompt?, model?, apiKey?)`: Quick text completion
- `GetHighestPowerModel(vendorName, modelType, contextUser?)`: Get the most powerful model of a type
- `GetHighestPowerLLM(vendorName?, contextUser?)`: Get the most powerful LLM
- `CheckResultCache(prompt)`: Check if a result is cached
- `CacheResult(model, prompt, promptText, resultText)`: Cache an AI result

#### Properties

- `Models`: All registered AI models
- `LanguageModels`: Just the LLM type models
- `Actions`: All registered AI actions
- `EntityAIActions`: All entity-specific AI actions
- `Prompts`: All registered prompts
- `PromptCategories`: Organized prompt categories
- `Agents`: Available AI agents
- `VectorDatabases`: Vector database configurations

## Entity Integration

Entity classes can implement special methods to interact with the AI engine:

```typescript
// In your entity class
async BeforeEntityAIAction(params: any): Promise<boolean> {
  // Pre-process before AI action
  // Return false to abort the action
  return true;
}

async AfterEntityAIAction(params: any): Promise<boolean> {
  // Post-process after AI action
  // Access the result via params.result
  return true;
}
```

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: AI abstractions and interfaces

## License

ISC