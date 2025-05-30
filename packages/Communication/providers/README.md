# MemberJunction Communication Providers

This directory contains implementations of communication providers that integrate with various messaging services. Each provider implements the `BaseCommunicationProvider` interface to enable sending messages through different channels.

## Available Providers

### Email Providers

- **[@memberjunction/communication-sendgrid](./sendgrid)** - SendGrid Email Service
  - High-volume transactional email
  - Marketing campaign support
  - Advanced analytics and tracking
  - Template management
  - Scheduled sending

- **[@memberjunction/communication-ms-graph](./MSGraph)** - Microsoft Graph (Office 365)
  - Enterprise email integration
  - Azure AD authentication
  - Calendar integration
  - Full Exchange features
  - Email threading

- **[@memberjunction/communication-gmail](./gmail)** - Gmail Integration
  - Personal and workspace accounts
  - OAuth2 authentication
  - Label management
  - Thread support
  - Search capabilities

### Multi-Channel Providers

- **[@memberjunction/communication-twilio](./twilio)** - Twilio Messaging
  - SMS/MMS messaging
  - WhatsApp Business API
  - Facebook Messenger
  - Voice capabilities (future)
  - Global reach

## Provider Capabilities

| Provider | Email | SMS | WhatsApp | Messenger | Attachments | Threading | Scheduling |
|----------|-------|-----|----------|-----------|-------------|-----------|------------|
| SendGrid | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| MS Graph | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Gmail | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Twilio | ❌ | ✅ | ✅ | ✅ | ✅* | ❌ | ❌ |

*Limited to media URLs for SMS/MMS

## Choosing a Provider

### SendGrid
Best for:
- High-volume transactional email
- Marketing campaigns
- Detailed analytics needs
- Template management
- Reliable delivery

### Microsoft Graph
Best for:
- Enterprise environments
- Office 365 integration
- Internal communications
- Calendar invites
- Corporate compliance

### Gmail
Best for:
- Small to medium volume
- Personal communications
- Google Workspace integration
- Thread-based conversations

### Twilio
Best for:
- SMS communications
- Global SMS reach
- WhatsApp Business
- Multi-channel messaging
- Real-time notifications

## Configuration

Each provider requires specific configuration:

### SendGrid
```typescript
{
  apiKey: process.env.SENDGRID_API_KEY,
  defaultFrom: 'noreply@company.com',
  sandboxMode: false
}
```

### Microsoft Graph
```typescript
{
  tenantId: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  defaultFrom: 'noreply@company.com'
}
```

### Gmail
```typescript
{
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  defaultFrom: 'user@gmail.com'
}
```

### Twilio
```typescript
{
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  defaultFromSMS: '+1234567890',
  defaultFromWhatsApp: 'whatsapp:+1234567890'
}
```

## Common Features

All providers support:
- Message sending
- Delivery status tracking
- Error handling
- Logging integration
- Template support (via MemberJunction)

## Provider-Specific Features

### SendGrid
- Dynamic templates
- A/B testing
- Click/open tracking
- Unsubscribe management
- IP warming

### Microsoft Graph
- Calendar events
- Meeting invites
- Rich formatting
- Importance flags
- Read receipts

### Gmail
- Labels
- Filters
- Vacation responders
- Signatures
- Aliases

### Twilio
- Phone number management
- Short codes
- Messaging services
- Delivery receipts
- Media support

## Implementation Guide

To implement a new provider:

1. **Create Provider Class**
```typescript
import { BaseCommunicationProvider, Message, ProcessedMessage } from '@memberjunction/communication-types';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseCommunicationProvider, 'MyProvider')
export class MyProvider extends BaseCommunicationProvider {
    constructor() {
        super();
        this.setupProvider();
    }

    async SendSingleMessage(message: Message): Promise<ProcessedMessage> {
        // Implement message sending
    }

    async GetMessages(options: any): Promise<any> {
        // Implement message retrieval
    }

    async ReplyToMessage(message: Message, replyTo: ProcessedMessage): Promise<ProcessedMessage> {
        // Implement reply functionality
    }

    async ForwardMessage(message: Message, originalMessage: ProcessedMessage): Promise<ProcessedMessage> {
        // Implement forward functionality
    }
}
```

2. **Add Configuration**
```typescript
export interface MyProviderConfig {
    apiKey: string;
    apiSecret?: string;
    defaultFrom: string;
}
```

3. **Handle Authentication**
```typescript
private async authenticate(): Promise<void> {
    // Provider-specific auth
}
```

4. **Map Message Types**
```typescript
private mapMessageType(mjType: string): string {
    // Map MJ types to provider types
}
```

5. **Create Tests**
```typescript
describe('MyProvider', () => {
    it('should send messages', async () => {
        // Test implementation
    });
});
```

## Error Handling

Providers should handle common errors:
- Authentication failures
- Rate limiting
- Invalid recipients
- Network issues
- Provider outages

## Best Practices

1. **Rate Limiting** - Respect provider limits
2. **Retry Logic** - Implement exponential backoff
3. **Logging** - Log all operations
4. **Validation** - Validate inputs before sending
5. **Error Messages** - Provide clear error information

## Testing

Each provider should include:
- Unit tests for core functionality
- Integration tests with test accounts
- Mock tests for CI/CD
- Error scenario testing
- Performance benchmarks

## Contributing

When adding a provider:
1. Follow the established pattern
2. Document all features
3. Include configuration examples
4. Add comprehensive tests
5. Update this README

## License

All provider packages follow the same licensing as the MemberJunction project.