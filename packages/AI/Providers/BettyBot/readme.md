# @memberjunction/ai-betty-bot

A MemberJunction wrapper for Betty Bot, enabling seamless integration with the MemberJunction AI framework for specialized Q&A and knowledge base interactions.

## Features

- **Betty Bot Integration**: Connects to Betty Bot's AI assistant capabilities
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **JWT Authentication**: Automatic handling of authentication and token refreshing
- **Reference Support**: Provides access to referenced resources returned by Betty Bot
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Completion**: Support for chat-based interactions with Betty Bot

## Installation

```bash
npm install @memberjunction/ai-betty-bot
```

## Requirements

- Node.js 16+
- A Betty Bot API key
- MemberJunction Core libraries

## Configuration

Create a `.env` file with your Betty Bot settings:

```
BETTY_BOT_BASE_URL=https://betty-api.tasio.co/
```

## Usage

### Basic Setup

```typescript
import { BettyBotLLM } from '@memberjunction/ai-betty-bot';

// Initialize with your Betty Bot API key
const bettyBot = new BettyBotLLM('your-betty-bot-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  messages: [
    { role: 'user', content: 'How do I create a new entity in MemberJunction?' }
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

Betty Bot can provide references to additional resources:

```typescript
const response = await bettyBot.ChatCompletion(chatParams);

// The main response is always the first choice
const mainResponse = response.data.choices[0].message.content;

// References are provided as a second choice when available
if (response.data.choices.length > 1) {
  const references = response.data.choices[1].message.content;
  console.log('Additional resources:', references);
}
```

## API Reference

### BettyBotLLM Class

A class that extends BaseLLM to provide Betty Bot-specific functionality.

#### Constructor

```typescript
new BettyBotLLM(apiKey: string)
```

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet
- `GetJWTToken(forceRefresh?: boolean): Promise<SettingsResponse | null>` - Get or refresh authentication token

## Betty Bot Response Structure

Betty Bot provides responses with potential references:

```typescript
// Main response from Betty Bot
interface BettyResponse {
  status: string;
  errorMessage: string;
  conversationId: number;
  response: string;
  references: BettyReference[];
}

// References to supporting material
interface BettyReference {
  link: string;
  title: string;
  type: string;
}
```

## Authentication Flow

The wrapper handles authentication automatically:

1. When first initialized, it requests a JWT token using your API key
2. The JWT token is cached for up to 30 minutes
3. If a token expires, it automatically refreshes
4. All API calls include the JWT token for authentication

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await bettyBot.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Limitations

Currently, the wrapper implements:
- Chat completion functionality with reference support

Future implementations may include:
- `SummarizeText` functionality
- `ClassifyText` functionality
- Conversation history support

## Integration with MemberJunction

This package works seamlessly with the MemberJunction AI ecosystem:

```typescript
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

// Get the Betty Bot implementation through the class factory
const bettyBot = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM, 
  'BettyBotLLM',
  'your-betty-bot-api-key'
);
```

## Dependencies

- `axios`: HTTP client for API requests
- `axios-retry`: Retry mechanism for API calls
- `env-var`: Environment variable configuration
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC