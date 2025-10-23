# MemberJunction Communication Framework

This directory contains the packages that make up the MemberJunction Communication Framework, providing a flexible, provider-agnostic system for sending and managing communications across multiple channels including email, SMS, and social media.

## Overview

The Communication Framework enables applications to send templated messages through various communication providers while maintaining a consistent API. It supports bulk messaging, template management, communication tracking, and integration with the MemberJunction entity system.

## Package Structure

### Core Framework

- **[@memberjunction/communication-types](./base-types)** - Base types and interfaces
  - Core interfaces and types
  - Base provider abstract class
  - Message and recipient types
  - Template integration types

- **[@memberjunction/communication-engine](./engine)** - Main communication engine
  - Provider management
  - Template rendering
  - Message sending orchestration
  - Batch processing
  - Communication logging

### Entity Integration

- **[@memberjunction/entity-communications-base](./entity-comm-base)** - Entity communication foundation
  - Base classes for entity-based communications
  - Entity message type configuration
  - Bulk communication interfaces

- **[@memberjunction/entity-communications-client](./entity-comm-client)** - Client-side entity communications
  - GraphQL client for entity communications
  - Browser-compatible implementation
  - Template preview functionality

- **[@memberjunction/entity-communications-server](./entity-comm-server)** - Server-side entity communications
  - Server implementation for bulk messaging
  - View-based recipient selection
  - Template context population
  - Provider integration

### Communication Providers

Located in the [providers](./providers) subdirectory:

- **[@memberjunction/communication-sendgrid](./providers/sendgrid)** - SendGrid email provider
  - Email sending via SendGrid API
  - HTML and plain text support
  - Scheduled sending
  - Tracking integration

- **[@memberjunction/communication-twilio](./providers/twilio)** - Twilio SMS/messaging provider
  - SMS messaging
  - WhatsApp support
  - Facebook Messenger integration
  - Media attachments

- **[@memberjunction/communication-ms-graph](./providers/MSGraph)** - Microsoft Graph provider
  - Office 365 email integration
  - Azure AD authentication
  - Email threading support
  - Rich email features

- **[@memberjunction/communication-gmail](./providers/gmail)** - Gmail provider
  - Gmail API integration
  - OAuth2 authentication
  - Thread management
  - Label support

### Provider Capabilities

| Feature | SendGrid | Gmail | MS Graph | Twilio |
|---------|----------|-------|----------|--------|
| Send Single | ✅ | ✅ | ✅ | ✅ |
| Get Messages | ❌ | ✅ | ✅ | ✅ |
| Forward | ❌ | ✅ | ✅ | ✅ |
| Reply | ❌ | ✅ | ✅ | ✅ |
| **Create Draft** | **❌** | **✅** | **✅** | **❌** |
| Scheduled Send | ✅ | ❌ | ❌ | ❌ |
| HTML/Text | ✅ | ✅ | ✅ | Limited |
| Threading | ❌ | ✅ | ✅ | ❌ |
| CC/BCC | ✅ | ✅ | ✅ | ❌ |

## Architecture

### Communication Flow

```
Application Request → Communication Engine → Provider Selection
         ↓                    ↓                      ↓
    Template Data      Template Rendering     Provider API Call
         ↓                    ↓                      ↓
    Recipients        Formatted Messages        Delivery
         ↓                    ↓                      ↓
    Logging          Communication Run         Status Updates
```

### Key Components

1. **Communication Engine** - Orchestrates the communication process
2. **Providers** - Handle actual message delivery
3. **Templates** - Define message structure and content
4. **Communication Runs** - Track bulk message operations
5. **Communication Logs** - Record individual message status

## Key Features

### Multi-Channel Support
- **Email** - Rich HTML emails with attachments
- **SMS** - Text messaging with media
- **Social Media** - WhatsApp, Facebook Messenger
- **Push Notifications** - Mobile app notifications (planned)

### Draft Support
- **Create Drafts** - Save messages as drafts before sending
- **Provider Support** - Gmail and MS Graph support drafts
- **Template Rendering** - Drafts use the same template engine
- **No Logging** - Drafts are not tracked in Communication Logs

### Template System
- Dynamic content rendering
- Multiple template types (Body, Subject, HTML)
- Context data support
- Preview capabilities
- Version control

### Provider Flexibility
- Hot-swappable providers
- Provider-specific features
- Fallback support
- Load balancing

### Entity Integration
- Send to entity record sets
- Use MemberJunction views for recipients
- Dynamic context from related entities
- Permission-based access

### Tracking & Analytics
- Delivery status tracking
- Open/click tracking (provider dependent)
- Bounce handling
- Communication history

## Getting Started

### Basic Usage

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';

// Get engine instance
const engine = CommunicationEngine.Instance;

// Send a simple message
await engine.SendSingleMessage({
    ProviderName: 'SendGrid',
    MessageType: 'Email',
    To: 'user@example.com',
    From: 'noreply@company.com',
    Subject: 'Welcome!',
    Body: 'Welcome to our platform!'
});
```

### Template-Based Messaging

```typescript
// Send using templates
await engine.SendSingleMessage({
    ProviderName: 'SendGrid',
    MessageType: 'Email',
    ProviderMessageTypeName: 'Email',
    To: 'user@example.com',
    TemplateID: 'welcome-template-id',
    ContextData: {
        firstName: 'John',
        accountType: 'Premium'
    }
});
```

### Bulk Entity Communications

```typescript
import { EntityCommunicationsEngine } from '@memberjunction/entity-communications-server';

// Send to all customers in a view
await EntityCommunicationsEngine.Instance.RunEntityCommunication({
    entityCommunicationParams: {
        EntityID: 'customers-entity-id',
        ViewID: 'active-customers-view-id',
        TemplateID: 'newsletter-template-id',
        ProviderName: 'SendGrid'
    }
});
```

### Creating Draft Messages

Create a draft message that can be edited and sent later:

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';

// Get engine instance
const engine = CommunicationEngine.Instance;
await engine.Config(false, contextUser);

// Create a message
const message = new Message();
message.To = 'recipient@example.com';
message.From = 'sender@example.com';
message.Subject = 'Draft Message';
message.Body = 'This is a draft message';

// Create draft using Gmail
const result = await engine.CreateDraft(
    message,
    'Gmail',
    contextUser
);

if (result.Success) {
    console.log(`Draft created with ID: ${result.DraftID}`);
} else {
    console.error(`Failed to create draft: ${result.ErrorMessage}`);
}
```

**Supported Providers**:
- **Gmail**: Drafts are created in the user's Gmail drafts folder
- **MS Graph**: Drafts are created in the user's Outlook/Exchange drafts folder
- **SendGrid**: Not supported (service-based email, no mailbox)
- **Twilio**: Not supported (SMS/messaging service, no draft concept)

**Note**: Only providers with mailbox access support drafts. Service-based providers (SendGrid, Twilio) return an error when `CreateDraft()` is called.

## Provider Implementation

To add a new communication provider:

```typescript
import { BaseCommunicationProvider } from '@memberjunction/communication-types';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseCommunicationProvider, 'MyProvider')
export class MyProvider extends BaseCommunicationProvider {
    async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        // Implementation
    }

    async GetMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
        // Implementation
    }

    async ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult> {
        // Implementation
    }

    async ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult> {
        // Implementation
    }

    async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
        // Implementation - return error if not supported
        return {
            Success: false,
            ErrorMessage: 'MyProvider does not support creating drafts'
        };
    }
}
```

## Configuration

### Provider Setup

Configure providers in the MemberJunction database:
1. Add provider record to Communication Providers entity
2. Configure API credentials
3. Set provider message types
4. Configure default settings

### Template Configuration

Create templates in the Templates entity:
```typescript
{
    Name: 'Welcome Email',
    Type: 'Communication',
    Category: 'User Onboarding',
    Content: [
        { Type: 'Subject', Template: 'Welcome {{firstName}}!' },
        { Type: 'HTML', Template: '<h1>Welcome {{firstName}}</h1>...' },
        { Type: 'Text', Template: 'Welcome {{firstName}}...' }
    ]
}
```

## Best Practices

### Message Design
1. **Mobile First** - Design for mobile devices
2. **Accessibility** - Ensure accessible content
3. **Personalization** - Use context data effectively
4. **Testing** - Preview before sending
5. **Compliance** - Include unsubscribe options

### Performance
1. **Batch Processing** - Send in batches for large volumes
2. **Async Operations** - Use queues for bulk sends
3. **Rate Limiting** - Respect provider limits
4. **Error Handling** - Implement retry logic
5. **Monitoring** - Track delivery rates

### Security
1. **Authentication** - Secure provider credentials
2. **Data Privacy** - Handle PII appropriately
3. **Encryption** - Use TLS for API calls
4. **Access Control** - Permission-based sending
5. **Audit Trail** - Log all communications

## Integration Points

The Communication Framework integrates with:
- **Template Engine** - For message rendering
- **Entity System** - For recipient data
- **Queue System** - For async processing
- **File Storage** - For attachments
- **Analytics** - For tracking metrics

## Monitoring

Track communication health:
- Delivery rates by provider
- Template performance
- Error rates and types
- Provider availability
- Cost per message

## Troubleshooting

Common issues:
1. **Authentication Failures** - Check provider credentials
2. **Template Errors** - Validate template syntax
3. **Rate Limits** - Implement proper throttling
4. **Delivery Failures** - Check provider status
5. **Missing Context** - Ensure data availability

## Contributing

When contributing to the Communication Framework:
1. Follow the provider pattern
2. Include comprehensive tests
3. Document provider-specific features
4. Handle errors gracefully
5. Update relevant documentation

## Package Documentation

For detailed documentation on individual packages, see:

### Core Packages
- **[Communication Types](./base-types/README.md)** - Base types, interfaces, and provider abstract class
- **[Communication Engine](./engine/readme.md)** - Main orchestration engine and message processing

### Entity Communication Packages
- **[Entity Communications Base](./entity-comm-base/README.md)** - Base classes for entity-level communications
- **[Entity Communications Server](./entity-comm-server/README.md)** - Server-side entity communication implementation
- **[Entity Communications Client](./entity-comm-client/README.md)** - Client-side entity communication implementation

### Provider Packages
- **[Gmail Provider](./providers/gmail/README.md)** - Gmail/Google Suite integration with draft support
- **[Microsoft Graph Provider](./providers/MSGraph/README.md)** - Office 365/Exchange integration with draft support
- **[SendGrid Provider](./providers/sendgrid/README.md)** - SendGrid email service integration
- **[Twilio Provider](./providers/twilio/README.md)** - SMS, WhatsApp, and Messenger integration
- **[Provider Overview](./providers/README.md)** - General provider information

## License

All Communication Framework packages follow the same licensing as the MemberJunction project.