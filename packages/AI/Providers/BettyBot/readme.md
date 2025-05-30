# @memberjunction/ai-betty-bot

A MemberJunction wrapper for Betty Bot, enabling seamless integration with the MemberJunction AI framework for specialized Q&A and knowledge base interactions.

## Overview

This package provides a TypeScript implementation of the BaseLLM interface for Betty Bot, allowing developers to leverage Betty Bot's AI assistant capabilities within the MemberJunction ecosystem. Betty Bot specializes in providing intelligent responses with reference materials, making it ideal for knowledge base queries and documentation assistance.

## Features

- **Betty Bot Integration**: Connects to Betty Bot's AI assistant capabilities through a clean API
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class for consistent AI provider usage
- **JWT Authentication**: Automatic handling of authentication token management with intelligent caching and refresh
- **Reference Support**: Provides access to referenced resources returned by Betty Bot for enhanced context
- **Robust Error Handling**: Comprehensive error handling with detailed reporting and graceful fallbacks
- **Chat Completion**: Full support for chat-based interactions with Betty Bot
- **Type Safety**: Full TypeScript support with exported types for all request/response structures
- **Non-Streaming Architecture**: Optimized for complete responses (streaming not supported)

## Installation

```bash
npm install @memberjunction/ai-betty-bot
```

## Requirements

- Node.js 16.0.0 or higher
- TypeScript 5.4.5 or higher
- A valid Betty Bot API key
- MemberJunction Core libraries (`@memberjunction/ai` and `@memberjunction/global`)

## Configuration

### Environment Variables

Configure your Betty Bot connection using environment variables. Create a `.env` file in your project root:

```bash
# Betty Bot API Base URL (optional - defaults to production URL)
BETTY_BOT_BASE_URL=https://betty-api.tasio.co/
```

The `BETTY_BOT_BASE_URL` defaults to `https://betty-api.tasio.co/` if not specified.

## Usage

### Basic Setup

```typescript
import { BettyBotLLM } from '@memberjunction/ai-betty-bot';

// Initialize with your Betty Bot API key
const bettyBot = new BettyBotLLM('your-betty-bot-api-key');
```

### Chat Completion

Betty Bot processes chat interactions by extracting the user message from the conversation and returning a comprehensive response:

```typescript
import { ChatParams, ChatMessageRole } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  messages: [
    { 
      role: ChatMessageRole.user, 
      content: 'How do I create a new entity in MemberJunction?' 
    }
  ]
};

// Get a response
try {
  const response = await bettyBot.ChatCompletion(chatParams);
  
  if (response.success) {
    // Main response
    console.log('Betty Bot says:', response.data.choices[0].message.content);
    
    // If there are references (additional resources)
    if (response.data.choices.length > 1) {
      console.log('References:', response.data.choices[1].message.content);
    }
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Handling References

Betty Bot can provide references to additional resources. These are automatically formatted and included as a second choice in the response:

```typescript
const response = await bettyBot.ChatCompletion(chatParams);

if (response.success) {
  // The main response is always the first choice
  const mainResponse = response.data.choices[0].message.content;
  console.log('Answer:', mainResponse);

  // References are provided as a second choice when available
  if (response.data.choices.length > 1) {
    const references = response.data.choices[1].message.content;
    console.log('Additional resources:', references);
    // Output format: "Here are some additional resources that may help you:
    // [Title]: [Link]
    // [Title]: [Link]"
  }
}
```

## API Reference

### BettyBotLLM Class

A class that extends `BaseLLM` to provide Betty Bot-specific functionality. This class is automatically registered with the MemberJunction class factory using the `@RegisterClass` decorator.

#### Constructor

```typescript
constructor(apiKey: string)
```

**Parameters:**
- `apiKey` (string): Your Betty Bot API key for authentication

#### Properties

- `SupportsStreaming` (boolean): Returns `false` - Betty Bot does not support streaming responses

#### Methods

##### ChatCompletion

```typescript
async ChatCompletion(params: ChatParams): Promise<ChatResult>
```

Performs a chat completion request to Betty Bot. Only processes the first user message in the conversation.

**Parameters:**
- `params` (ChatParams): Chat parameters containing messages array

**Returns:**
- `ChatResult`: Response object containing the Betty Bot response and optional references

**Example:**
```typescript
const result = await bettyBot.ChatCompletion({
  messages: [
    { role: ChatMessageRole.user, content: 'Your question here' }
  ]
});
```

##### GetJWTToken

```typescript
async GetJWTToken(forceRefresh?: boolean): Promise<SettingsResponse | null>
```

Retrieves or refreshes the JWT authentication token. This method is called automatically by ChatCompletion.

**Parameters:**
- `forceRefresh` (boolean, optional): Force a token refresh even if cached token is valid

**Returns:**
- `SettingsResponse | null`: Settings response containing the JWT token, or null on error

##### SummarizeText (Not Implemented)

```typescript
async SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
```

**Status:** Not implemented - throws an error

##### ClassifyText (Not Implemented)

```typescript
async ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
```

**Status:** Not implemented - throws an error

### Type Definitions

#### BettyResponse

The response structure returned by Betty Bot API:

```typescript
type BettyResponse = {
  status: string;              // Response status (e.g., "SUCCESS")
  errorMessage: string;        // Error message if any
  conversationId: number;      // Unique conversation identifier
  response: string;            // Main response content
  references: BettyReference[]; // Array of reference materials
}
```

#### BettyReference

Reference material structure:

```typescript
type BettyReference = {
  link: string;   // URL to the reference
  title: string;  // Title of the reference
  type: string;   // Type of reference material
}
```

#### SettingsResponse

Authentication response structure:

```typescript
type SettingsResponse = {
  status: string;               // Response status
  errorMessage: string;         // Error message if any
  enabledFeatures: unknown[];   // Array of enabled features
  token: string;                // JWT authentication token
}
```

## Authentication Flow

The BettyBotLLM class handles authentication transparently:

1. **Initial Authentication**: When ChatCompletion is first called, it requests a JWT token using your API key
2. **Token Caching**: JWT tokens are cached internally with a 30-minute validity period
3. **Automatic Refresh**: Expired tokens are automatically refreshed on the next API call
4. **Bearer Token**: All API requests include the JWT as a Bearer token in the Authorization header

```typescript
// Authentication is handled automatically
const bettyBot = new BettyBotLLM('your-api-key');
// No need to manually authenticate - just start using it
const response = await bettyBot.ChatCompletion(params);
```

## Error Handling

The wrapper provides comprehensive error handling at multiple levels:

### API Errors

```typescript
try {
  const response = await bettyBot.ChatCompletion(params);
  if (!response.success) {
    // API returned an error
    console.error('API Error:', response.errorMessage);
    console.error('Status:', response.statusText);
  }
} catch (error) {
  // Network or other exceptions
  console.error('Exception occurred:', error);
}
```

### Common Error Scenarios

1. **Invalid API Key**: Returns error in JWT token request
2. **No User Message**: Returns error if no user role message is found
3. **Network Errors**: Caught and logged with Axios error details
4. **Token Expiration**: Automatically handled with refresh

## Limitations and Future Enhancements

### Current Limitations

- **No Streaming Support**: Betty Bot responses are returned as complete messages
- **Single User Message**: Only processes the first user message in the conversation
- **No Conversation Context**: Each request is independent without conversation history

### Not Yet Implemented

- **SummarizeText**: Text summarization functionality
- **ClassifyText**: Text classification functionality
- **Streaming Responses**: Real-time streaming of responses
- **Multi-turn Conversations**: Support for conversation context

## Integration with MemberJunction

### Using the Class Factory

The BettyBotLLM class is registered with MemberJunction's class factory system:

```typescript
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

// Option 1: Direct instantiation
import { BettyBotLLM } from '@memberjunction/ai-betty-bot';
const bettyBot = new BettyBotLLM('your-api-key');

// Option 2: Using MemberJunction class factory
const bettyBot = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM, 
  'BettyBotLLM',
  'your-betty-bot-api-key'
);
```

### Loading the Provider

To ensure the BettyBotLLM class is available for the class factory:

```typescript
import { LoadBettyBotLLM } from '@memberjunction/ai-betty-bot';

// Call this to prevent tree-shaking from removing the class
LoadBettyBotLLM();
```

## Dependencies

This package relies on the following dependencies:

### Production Dependencies
- **axios** (^1.7.7): HTTP client for API requests
- **axios-retry** (^4.3.0): Automatic retry mechanism for failed requests
- **env-var** (^7.5.0): Type-safe environment variable parsing
- **@memberjunction/ai** (2.43.0): Core AI framework interfaces and base classes
- **@memberjunction/global** (2.43.0): Global utilities and class factory system

### Development Dependencies
- **typescript** (^5.4.5): TypeScript compiler
- **ts-node-dev** (^2.0.0): TypeScript execution and development server

## Build and Development

### Building the Package

```bash
# From the package directory
npm run build

# From the repository root
turbo build --filter="@memberjunction/ai-betty-bot"
```

### Development Mode

```bash
# Run in watch mode with auto-reload
npm start
```

### Project Structure

```
packages/AI/Providers/BettyBot/
├── src/
│   ├── config.ts              # Environment configuration
│   ├── index.ts               # Main exports
│   ├── generic/
│   │   └── BettyBot.types.ts  # TypeScript type definitions
│   └── models/
│       └── BettyBotLLM.ts     # Main implementation
├── dist/                      # Compiled JavaScript output
├── package.json               # Package configuration
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## License

ISC - See LICENSE file for details