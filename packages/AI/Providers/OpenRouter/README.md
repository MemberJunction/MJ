# OpenRouter Provider for MemberJunction

This package provides integration with OpenRouter's API for accessing multiple AI models through a unified interface within the MemberJunction framework.

## Overview

The OpenRouter provider implements MemberJunction's AI framework interfaces, allowing seamless access to 100+ AI models from various providers (OpenAI, Anthropic, Google, Meta, etc.) through OpenRouter's unified API.

## Installation

```bash
npm install @memberjunction/ai-openrouter
```

## Configuration

Configure the OpenRouter provider in your MemberJunction setup:

```typescript
import { OpenRouterLLM } from '@memberjunction/ai-openrouter';

// The provider will automatically use the API key from AIModelAPIConnection
// configuration in the database
```

## Features

- **Multi-Model Support**: Access models from OpenAI, Anthropic, Google, Meta, Mistral, and more
- **Automatic Routing**: OpenRouter automatically routes requests to the best available provider
- **Response Format Support**: JSON mode support for compatible models
- **Streaming**: Full streaming support for real-time responses
- **Tool/Function Calling**: Support for models with function calling capabilities
- **Comprehensive Error Handling**: Detailed error messages and retry logic

## Usage

### Basic Text Generation

```typescript
import { OpenRouterLLM } from '@memberjunction/ai-openrouter';
import { GetAIAPIKey } from '@memberjunction/ai';

const llm = new OpenRouterLLM();
const apiKey = await GetAIAPIKey('OpenRouter');

const result = await llm.InvokeModel({
  apiKey,
  modelName: 'anthropic/claude-3.5-sonnet',
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' }
  ]
});

console.log(result.data.OutputText);
```

### Streaming Responses

```typescript
const result = await llm.InvokeModel({
  apiKey,
  modelName: 'openai/gpt-4-turbo',
  messages: [
    { role: 'user', content: 'Write a story about a robot' }
  ],
  streaming: true,
  streamCallback: (token) => {
    process.stdout.write(token);
  }
});
```

### JSON Response Format

```typescript
const result = await llm.InvokeModel({
  apiKey,
  modelName: 'anthropic/claude-3.5-sonnet',
  messages: [
    { role: 'user', content: 'List 3 programming languages as JSON' }
  ],
  responseFormat: 'json_object'
});

const languages = JSON.parse(result.data.OutputText);
```

### Using Tools/Functions

```typescript
const tools = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    }
  }
}];

const result = await llm.InvokeModel({
  apiKey,
  modelName: 'openai/gpt-4-turbo',
  messages: [
    { role: 'user', content: 'What\'s the weather in New York?' }
  ],
  tools,
  toolChoice: 'auto'
});
```

## Supported Models

OpenRouter provides access to models from:

- **OpenAI**: GPT-4, GPT-3.5, o1-preview, o1-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google**: Gemini Pro, Gemini Flash
- **Meta**: Llama 3.1 (8B, 70B, 405B)
- **Mistral**: Mistral Large, Mixtral
- **xAI**: Grok
- **And many more...**

See [OpenRouter's model list](https://openrouter.ai/models) for complete details.

## Model Parameters

The following parameters can be configured:

- `temperature`: Controls randomness (0.0 to 2.0)
- `maxTokens`: Maximum tokens to generate
- `topP`: Nucleus sampling parameter
- `topK`: Top-k sampling parameter
- `frequencyPenalty`: Penalize frequent tokens
- `presencePenalty`: Penalize tokens based on presence
- `stopSequences`: Sequences that stop generation
- `seed`: For deterministic outputs (when supported)

## Error Handling

The provider includes comprehensive error handling:

```typescript
try {
  const result = await llm.InvokeModel({...});
  if (!result.success) {
    console.error('Model invocation failed:', result.errorMessage);
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

## API Key Management

API keys are managed through MemberJunction's AIModelAPIConnection system. Configure your OpenRouter API key in the database:

1. Add an AIModelAPIConnection record for OpenRouter
2. Set the APIKey field to your OpenRouter API key
3. The provider will automatically retrieve and use this key

## Rate Limiting

OpenRouter handles rate limiting across all providers. The package includes automatic retry logic for rate limit errors.

## Contributing

This package is part of the MemberJunction open-source project. Contributions are welcome!

## License

MIT - See the MemberJunction repository for details.