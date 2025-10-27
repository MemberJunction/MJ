# @memberjunction/communication-engine

The MemberJunction Communication Engine provides a robust framework for sending messages through various communication providers (email, SMS, etc.) with template support and comprehensive logging.

## Overview

This package serves as the core engine for the MemberJunction communication system, providing:

- **Provider-agnostic message sending**: Support for multiple communication providers through a plugin architecture
- **Template integration**: Seamless integration with the MemberJunction template system for dynamic message content
- **Message processing**: Automatic template rendering with context data
- **Communication runs**: Batch message sending with transaction-like run management
- **Comprehensive logging**: Built-in logging of all communication attempts

## Installation

```bash
npm install @memberjunction/communication-engine
```

## Core Components

### CommunicationEngine

The main class that orchestrates all communication operations. It follows a singleton pattern and manages providers, message sending, and logging.

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';

// Get the singleton instance
const engine = CommunicationEngine.Instance;

// Configuration must be called before use
await engine.Config();
```

### ProcessedMessageServer

Server-side message processor that handles template rendering for message bodies, HTML bodies, and subjects.

## Usage Examples

### Sending a Single Message

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';

// Create a message
const message = new Message();
message.Subject = 'Welcome to MemberJunction';
message.Body = 'Thank you for joining!';
message.To = 'user@example.com';
message.From = 'noreply@memberjunction.com';

// Send using a specific provider
const result = await CommunicationEngine.Instance.SendSingleMessage(
    'SendGrid',          // Provider name
    'Email',             // Provider message type
    message
);

if (result.Success) {
    console.log('Message sent successfully');
} else {
    console.error('Failed to send:', result.Error);
}
```

### Sending Messages with Templates

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { Metadata } from '@memberjunction/global';

// Get template from metadata
const md = new Metadata();
const template = await md.GetEntityObject('Templates');
await template.LoadByName('Welcome Email');

// Create message with template
const message = new Message();
message.BodyTemplate = template;
message.To = 'user@example.com';
message.From = 'noreply@memberjunction.com';
message.ContextData = {
    firstName: 'John',
    accountType: 'Premium',
    activationDate: new Date()
};

// Send the message - templates will be automatically processed
const result = await CommunicationEngine.Instance.SendSingleMessage(
    'SendGrid',
    'Email',
    message
);
```

### Batch Message Sending

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message, MessageRecipient } from '@memberjunction/communication-types';

// Create base message
const baseMessage = new Message();
baseMessage.Subject = 'Monthly Newsletter';
baseMessage.BodyTemplate = newsletterTemplate;
baseMessage.From = 'newsletter@memberjunction.com';

// Create recipient list with individual context data
const recipients: MessageRecipient[] = [
    {
        To: 'user1@example.com',
        ContextData: { name: 'Alice', memberSince: '2023' }
    },
    {
        To: 'user2@example.com',
        ContextData: { name: 'Bob', memberSince: '2022' }
    }
];

// Send to all recipients
const results = await CommunicationEngine.Instance.SendMessages(
    'SendGrid',
    'Email',
    baseMessage,
    recipients
);

// Check results
results.forEach((result, index) => {
    if (result.Success) {
        console.log(`Sent to ${recipients[index].To}`);
    } else {
        console.error(`Failed for ${recipients[index].To}: ${result.Error}`);
    }
});
```

### Preview Mode

You can preview processed messages without actually sending them:

```typescript
const result = await CommunicationEngine.Instance.SendSingleMessage(
    'SendGrid',
    'Email',
    message,
    undefined,  // No communication run
    true        // Preview only
);

if (result.Success) {
    const processedMessage = result.Message;
    console.log('Subject:', processedMessage.ProcessedSubject);
    console.log('Body:', processedMessage.ProcessedBody);
    console.log('HTML Body:', processedMessage.ProcessedHTMLBody);
}
```

### Creating Draft Messages

Create draft messages that can be edited and sent later (only supported by providers with mailbox access):

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';

// Get the engine instance
const engine = CommunicationEngine.Instance;
await engine.Config();

// Create a message
const message = new Message();
message.To = 'recipient@example.com';
message.From = 'sender@example.com';
message.Subject = 'Draft Message';
message.Body = 'This is a draft message that can be edited later';

// Create draft using Gmail (or 'Microsoft Graph')
const result = await engine.CreateDraft(
    message,
    'Gmail',
    contextUser
);

if (result.Success) {
    console.log(`Draft created with ID: ${result.DraftID}`);
    // Draft can now be edited or sent through the provider's native interface
} else {
    console.error(`Failed to create draft: ${result.ErrorMessage}`);
}
```

**Providers Supporting Drafts**:
- **Gmail**: Drafts created in Gmail drafts folder
- **Microsoft Graph**: Drafts created in Outlook/Exchange drafts folder

**Providers NOT Supporting Drafts**:
- **SendGrid**: Service-based email, no mailbox
- **Twilio**: SMS/messaging service, no draft concept

### Working with Providers

```typescript
// Get a specific provider instance
const provider = CommunicationEngine.Instance.GetProvider('SendGrid');

// List all available providers
const providers = CommunicationEngine.Instance.Providers;
providers.forEach(p => {
    console.log(`Provider: ${p.Name}`);
    p.MessageTypes.forEach(mt => {
        console.log(`  - ${mt.Name}`);
    });
});
```

## API Reference

### CommunicationEngine

#### Properties

- `Instance: CommunicationEngine` - Static singleton instance
- `Providers: CommunicationProviderEntity[]` - List of configured providers
- `Loaded: boolean` - Whether metadata has been loaded

#### Methods

##### `Config(contextUser?: UserInfo): Promise<void>`
Initializes the engine with metadata. Must be called before using other methods.

##### `GetProvider(providerName: string): BaseCommunicationProvider`
Returns an instance of the specified communication provider.

##### `SendSingleMessage(providerName: string, providerMessageTypeName: string, message: Message, run?: CommunicationRunEntity, previewOnly?: boolean): Promise<MessageResult>`
Sends a single message using the specified provider.

Parameters:
- `providerName`: Name of the provider (e.g., 'SendGrid', 'Twilio')
- `providerMessageTypeName`: Type of message for the provider (e.g., 'Email', 'SMS')
- `message`: The message to send
- `run`: Optional communication run for grouping messages
- `previewOnly`: If true, processes templates but doesn't send

##### `SendMessages(providerName: string, providerMessageTypeName: string, message: Message, recipients: MessageRecipient[], previewOnly?: boolean): Promise<MessageResult[]>`
Sends messages to multiple recipients in a single run.

##### `CreateDraft(message: Message, providerName: string, contextUser?: UserInfo): Promise<CreateDraftResult>`
Creates a draft message using the specified provider.

Parameters:
- `message`: The message to save as a draft
- `providerName`: Name of the provider (must support drafts, e.g., 'Gmail', 'Microsoft Graph')
- `contextUser`: Optional user context for server-side operations

Returns a `CreateDraftResult` with:
- `Success`: Whether the draft was created successfully
- `DraftID`: The provider-specific draft identifier (if successful)
- `ErrorMessage`: Error details (if failed)

**Note**: Only providers with mailbox access support drafts (Gmail, MS Graph). Service-based providers (SendGrid, Twilio) will return an error.

### ProcessedMessageServer

#### Methods

##### `Process(forceTemplateRefresh?: boolean, contextUser?: UserInfo): Promise<{Success: boolean, Message?: string}>`
Processes all templates in the message and populates the processed fields.

## Template Processing

The engine automatically processes templates in the following order:

1. **Body Template**: 
   - Renders 'Text' content type for `ProcessedBody`
   - Renders 'HTML' content type for `ProcessedHTMLBody` (if no separate HTML template)

2. **HTML Body Template**: 
   - Renders 'HTML' content type for `ProcessedHTMLBody`

3. **Subject Template**: 
   - Renders 'HTML' content type for `ProcessedSubject`

Context data passed in the message is available to all templates during rendering.

## Error Handling

The engine provides detailed error messages for common scenarios:

- Provider not found
- Provider message type not found
- Template rendering failures
- Communication run failures
- Missing required template content types

Always wrap communication calls in try-catch blocks:

```typescript
try {
    const result = await CommunicationEngine.Instance.SendSingleMessage(...);
    if (!result.Success) {
        // Handle send failure
        console.error(result.Error);
    }
} catch (error) {
    // Handle engine errors
    console.error('Engine error:', error.message);
}
```

## Dependencies

- `@memberjunction/global`: Core MemberJunction utilities
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/templates`: Template engine integration
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/communication-types`: Type definitions
- `rxjs`: Reactive Extensions for JavaScript

## Integration with Other MJ Packages

This package integrates seamlessly with:

- **@memberjunction/templates**: For dynamic content generation
- **@memberjunction/core-entities**: For communication logging entities
- **Provider packages**: Such as `@memberjunction/communication-sendgrid`, `@memberjunction/communication-twilio`

## Provider Implementation

To implement a custom provider, extend `BaseCommunicationProvider` from `@memberjunction/communication-types` and register it with the MemberJunction class factory using the `@RegisterClass` decorator.

## License

ISC
