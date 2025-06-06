# @memberjunction/communication-sendgrid

SendGrid email provider implementation for the MemberJunction Communication Framework. This package enables sending emails through SendGrid's API within the MJ ecosystem.

## Overview

The `@memberjunction/communication-sendgrid` package provides a SendGrid-based implementation of the `BaseCommunicationProvider` interface. It supports sending emails with various features including:

- Plain text and HTML email sending
- CC and BCC recipients
- Scheduled sending
- Custom sender names
- Automatic retry and error handling

**Note:** This provider currently only supports sending messages. Message retrieval, forwarding, and replying functionalities are not implemented.

## Installation

```bash
npm install @memberjunction/communication-sendgrid
```

## Configuration

The SendGrid provider requires an API key to authenticate with SendGrid's services. Set the following environment variable:

```bash
COMMUNICATION_VENDOR_API_KEY__SENDGRID=your_sendgrid_api_key_here
```

You can obtain an API key from your [SendGrid account dashboard](https://app.sendgrid.com/settings/api_keys).

## Usage

### Basic Setup

```typescript
import { SendGridProvider } from '@memberjunction/communication-sendgrid';
import { RegisterClass } from '@memberjunction/global';

// The provider is automatically registered via the @RegisterClass decorator
// You can access it through the MJ class factory system
```

### Sending an Email

```typescript
import { ProcessedMessage, MessageResult } from '@memberjunction/communication-types';
import { ClassFactory } from '@memberjunction/global';
import { BaseCommunicationProvider } from '@memberjunction/communication-types';

// Get an instance of the SendGrid provider
const provider = ClassFactory.CreateInstance<BaseCommunicationProvider>(
    BaseCommunicationProvider, 
    'SendGrid'
);

// Create a message
const message: ProcessedMessage = {
    From: 'sender@example.com',
    FromName: 'Sender Name',
    To: ['recipient@example.com'],
    CCRecipients: ['cc@example.com'],
    BCCRecipients: ['bcc@example.com'],
    ProcessedSubject: 'Test Email',
    ProcessedBody: 'This is a plain text email',
    ProcessedHTMLBody: '<p>This is an <strong>HTML</strong> email</p>',
    SendAt: new Date('2024-12-25 10:00:00') // Optional: Schedule for future sending
};

// Send the message
const result: MessageResult = await provider.SendSingleMessage(message);

if (result.Success) {
    console.log('Email sent successfully');
} else {
    console.error('Failed to send email:', result.Error);
}
```

### Integration with MJ Communication Engine

The SendGrid provider integrates seamlessly with the MJ Communication Engine:

```typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';

// The engine will automatically use registered providers
const engine = new CommunicationEngine();

// Send messages through the engine which will route to SendGrid
// based on your communication provider configuration
```

## API Reference

### SendGridProvider

The main class that implements the SendGrid email functionality.

#### Methods

##### `SendSingleMessage(message: ProcessedMessage): Promise<MessageResult>`

Sends a single email message through SendGrid.

**Parameters:**
- `message`: ProcessedMessage object containing:
  - `From`: Sender email address (required)
  - `FromName`: Sender display name (optional)
  - `To`: Array of recipient email addresses (required)
  - `CCRecipients`: Array of CC recipients (optional)
  - `BCCRecipients`: Array of BCC recipients (optional)
  - `ProcessedSubject`: Email subject (required)
  - `ProcessedBody`: Plain text email body (optional)
  - `ProcessedHTMLBody`: HTML email body (optional)
  - `SendAt`: Date object for scheduled sending (optional)

**Returns:**
- `MessageResult` object with:
  - `Success`: Boolean indicating success/failure
  - `Error`: Error message if failed
  - `Message`: The original message object

##### `GetMessages(params: GetMessagesParams): Promise<GetMessagesResult>`

Not implemented. Throws an error indicating SendGrid doesn't support message retrieval.

##### `ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>`

Not implemented. Throws an error indicating SendGrid doesn't support message forwarding.

##### `ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult>`

Not implemented. Throws an error indicating SendGrid doesn't support message replying.

### LoadProvider Function

```typescript
export function LoadProvider(): void
```

Utility function to ensure the provider class is included in the bundle and not removed by tree shaking.

## Dependencies

- `@memberjunction/global`: Core MJ utilities and class registration
- `@memberjunction/core`: Core MJ functionality including logging
- `@memberjunction/core-entities`: Core entity definitions
- `@memberjunction/communication-types`: Communication framework type definitions
- `@sendgrid/mail`: Official SendGrid Node.js SDK

## Error Handling

The provider includes comprehensive error handling:

- Network errors are caught and returned with descriptive messages
- SendGrid API errors include response body details
- All errors are logged using the MJ logging system
- Failed sends return a `MessageResult` with `Success: false` and error details

## Limitations

1. **Send-only**: This provider only supports sending emails. It cannot retrieve, forward, or reply to messages.
2. **No attachment support**: Current implementation doesn't include file attachments.
3. **No template support**: SendGrid templates are not currently supported.
4. **Basic tracking**: Subscription tracking is disabled by default.

## Development

### Building

```bash
npm run build
```

### Project Structure

```
src/
   index.ts           # Public API exports
   SendGridProvider.ts # Main provider implementation
   config.ts          # Configuration and environment setup
```

### Testing

Currently, no automated tests are configured. To add tests:

1. Update the `test` script in package.json
2. Add test files following MJ testing conventions
3. Mock SendGrid API calls for unit tests

## Integration Notes

- The provider automatically registers itself with the MJ class factory system using the `@RegisterClass` decorator
- It's designed to work within the MJ Communication Framework ecosystem
- The provider name "SendGrid" must match your Communication Provider configuration in the MJ database

## License

ISC - See LICENSE file in the repository root for details.

## Support

For issues related to:
- This package: Create an issue in the MemberJunction repository
- SendGrid API: Refer to [SendGrid documentation](https://docs.sendgrid.com/)
- MJ Communication Framework: Consult the MJ documentation

## Contributing

Contributions are welcome! Please follow the MJ contribution guidelines and ensure all changes maintain backward compatibility.