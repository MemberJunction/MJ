# @memberjunction/communication-types

MemberJunction Communication Framework Library Generic Types - Base types and interfaces for building communication providers and engines in the MemberJunction ecosystem.

## Overview

This package provides the foundational types, base classes, and interfaces for implementing communication functionality within MemberJunction applications. It includes base classes for communication engines and providers, message handling, and integration with the MemberJunction metadata system.

## Installation

```bash
npm install @memberjunction/communication-types
```

## Key Components

### CommunicationEngineBase

The core engine class that manages communication metadata and orchestrates communication operations across different providers.

```typescript
import { CommunicationEngineBase } from '@memberjunction/communication-types';

// Get the singleton instance
const engine = CommunicationEngineBase.Instance;

// Configure the engine (required before use)
await engine.Config(false, userInfo);

// Access communication metadata
const providers = engine.Providers;
const messageTypes = engine.BaseMessageTypes;
```

### BaseCommunicationProvider

Abstract base class for implementing communication providers (email, SMS, social media, etc.).

```typescript
import { BaseCommunicationProvider, ProcessedMessage, MessageResult } from '@memberjunction/communication-types';

export class MyEmailProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        // Implement provider-specific sending logic
    }

    public async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
        // Implement message retrieval
    }

    public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
        // Implement message forwarding
    }

    public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
        // Implement message replies
    }
}
```

### Message Classes

#### Message
Base class for message data:

```typescript
import { Message } from '@memberjunction/communication-types';

const message = new Message();
message.From = "sender@example.com";
message.To = "recipient@example.com";
message.Subject = "Hello";
message.Body = "Message content";
message.HTMLBody = "<p>HTML content</p>";

// Using templates
message.BodyTemplate = templateEntity;
message.SubjectTemplate = subjectTemplateEntity;
message.ContextData = { name: "John", company: "Acme Corp" };
```

#### ProcessedMessage
Abstract class for messages that have been processed (templates rendered, etc.):

```typescript
export class MyProcessedMessage extends ProcessedMessage {
    public async Process(forceTemplateRefresh?: boolean, contextUser?: UserInfo): Promise<{Success: boolean, Message?: string}> {
        // Implement template processing logic
        this.ProcessedBody = // processed body
        this.ProcessedHTMLBody = // processed HTML
        this.ProcessedSubject = // processed subject
        return { Success: true };
    }
}
```

#### MessageRecipient
Information about a message recipient:

```typescript
import { MessageRecipient } from '@memberjunction/communication-types';

const recipient = new MessageRecipient();
recipient.To = "user@example.com";
recipient.FullName = "John Doe";
recipient.ContextData = { customField: "value" };
```

## Types and Interfaces

### GetMessagesParams
Parameters for retrieving messages:

```typescript
type GetMessagesParams<T = Record<string, any>> = {
    NumMessages: number;
    UnreadOnly?: boolean;
    ContextData?: T;
};
```

### GetMessagesResult
Result structure for retrieved messages:

```typescript
type GetMessagesResult<T = Record<string, any>> = {
    Success: boolean;
    ErrorMessage?: string;
    SourceData?: T[];
    Messages: GetMessageMessage[];
};
```

### ForwardMessageParams
Parameters for forwarding messages:

```typescript
type ForwardMessageParams = {
    MessageID: string;
    Message?: string;
    ToRecipients: string[];
    CCRecipients?: string[];
    BCCRecipients?: string[];
};
```

### ReplyToMessageParams
Parameters for replying to messages:

```typescript
type ReplyToMessageParams<T = Record<string, any>> = {
    MessageID: string;
    Message: ProcessedMessage;
    ContextData?: T;
};
```

## Usage Examples

### Setting up the Communication Engine

```typescript
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import { UserInfo } from '@memberjunction/core';

async function initializeCommunications(user: UserInfo) {
    const engine = CommunicationEngineBase.Instance;
    
    // Configure the engine
    await engine.Config(false, user);
    
    // Access available providers
    const providers = engine.Providers;
    console.log(`Available providers: ${providers.map(p => p.Name).join(', ')}`);
    
    // Get message types for a specific provider
    const emailProvider = providers.find(p => p.Name === 'Email');
    const messageTypes = emailProvider?.MessageTypes;
}
```

### Creating a Custom Communication Provider

```typescript
import { 
    BaseCommunicationProvider, 
    ProcessedMessage, 
    MessageResult,
    GetMessagesParams,
    GetMessagesResult 
} from '@memberjunction/communication-types';

export class CustomSMSProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        try {
            // Implement SMS sending logic
            const result = await this.sendSMS(message.To, message.ProcessedBody);
            
            return {
                Message: message,
                Success: true,
                Error: null
            };
        } catch (error) {
            return {
                Message: message,
                Success: false,
                Error: error.message
            };
        }
    }

    public async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
        // Implement SMS retrieval logic
        const messages = await this.fetchSMSMessages(params.NumMessages);
        
        return {
            Success: true,
            Messages: messages.map(m => ({
                From: m.sender,
                To: m.recipient,
                Body: m.text,
                ExternalSystemRecordID: m.id
            }))
        };
    }

    public async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
        // SMS forwarding implementation
        return { Success: true };
    }

    public async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
        // SMS reply implementation
        return { Success: true };
    }

    private async sendSMS(to: string, message: string): Promise<any> {
        // Provider-specific implementation
    }

    private async fetchSMSMessages(count: number): Promise<any[]> {
        // Provider-specific implementation
    }
}
```

## Integration with MemberJunction

This package integrates seamlessly with other MemberJunction packages:

- **@memberjunction/core**: Provides base entity functionality and metadata system integration
- **@memberjunction/core-entities**: Contains the entity definitions for communication-related data
- **@memberjunction/templates-base-types**: Enables template-based message content
- **@memberjunction/global**: Provides utility functions and global registry

### Working with Communication Logs

The engine provides methods for tracking communication activities:

```typescript
// Start a communication run
const run = await engine.StartRun();

// Log individual messages
const log = await engine.StartLog(processedMessage, run);

// Complete the run
await engine.EndRun(run);
```

## Dependencies

- `@memberjunction/global`: ^2.43.0
- `@memberjunction/core`: ^2.43.0
- `@memberjunction/templates-base-types`: ^2.43.0
- `@memberjunction/core-entities`: ^2.43.0
- `rxjs`: ^7.8.1

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm start
```

## Extended Entity Support

The package includes an extended Communication Provider entity that automatically links message types:

```typescript
import { CommunicationProviderEntityExtended } from '@memberjunction/communication-types';

// The extended entity automatically includes related message types
const provider = await md.GetEntityObject<CommunicationProviderEntityExtended>('Communication Providers');
const messageTypes = provider.MessageTypes; // Automatically populated
```

## License

ISC