# @memberjunction/communication-twilio

A Twilio provider implementation for the MemberJunction Communication framework, enabling SMS, WhatsApp, and Facebook Messenger messaging capabilities.

## Overview

This package provides a Twilio-based implementation of the MemberJunction Communication Provider interface. It supports sending and receiving messages through multiple channels:

- **SMS** - Traditional text messaging
- **WhatsApp** - WhatsApp Business messaging
- **Facebook Messenger** - Facebook page messaging

The provider automatically detects the appropriate channel based on the recipient format and handles all necessary formatting and API interactions with Twilio's services.

## Installation

```bash
npm install @memberjunction/communication-twilio
```

## Configuration

The provider requires environment variables to be set for Twilio credentials. Create a `.env` file in your project root:

```env
# Required - Twilio Account Credentials
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Optional - For WhatsApp messaging
TWILIO_WHATSAPP_NUMBER=+1234567890

# Optional - For Facebook Messenger
TWILIO_FACEBOOK_PAGE_ID=your_page_id
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio phone number for SMS |
| `TWILIO_WHATSAPP_NUMBER` | No | Your Twilio WhatsApp-enabled number |
| `TWILIO_FACEBOOK_PAGE_ID` | No | Your Facebook Page ID for Messenger |

## Usage

### Basic Setup

```typescript
import { TwilioProvider } from '@memberjunction/communication-twilio';

// The provider will be automatically registered with the MemberJunction framework
// via the @RegisterClass decorator when imported
const provider = new TwilioProvider();
```

### Sending Messages

#### SMS Message
```typescript
import { ProcessedMessage } from '@memberjunction/communication-types';

const message: ProcessedMessage = {
  To: '+1234567890',
  ProcessedBody: 'Hello from MemberJunction!',
  // Other required fields...
};

const result = await provider.SendSingleMessage(message);
if (result.Success) {
  console.log('SMS sent successfully');
} else {
  console.error('Failed to send SMS:', result.Error);
}
```

#### WhatsApp Message
```typescript
const whatsappMessage: ProcessedMessage = {
  To: 'whatsapp:+1234567890', // Prefix with 'whatsapp:'
  ProcessedBody: 'Hello from WhatsApp!',
  // Other required fields...
};

const result = await provider.SendSingleMessage(whatsappMessage);
```

#### Facebook Messenger Message
```typescript
const messengerMessage: ProcessedMessage = {
  To: 'messenger:user_psid', // Prefix with 'messenger:' and use Page-Scoped ID
  ProcessedBody: 'Hello from Messenger!',
  // Other required fields...
};

const result = await provider.SendSingleMessage(messengerMessage);
```

#### Sending Media (MMS/WhatsApp Media)
```typescript
const mediaMessage: ProcessedMessage = {
  To: '+1234567890',
  ProcessedBody: 'Check out this image!',
  ContextData: {
    mediaUrls: ['https://example.com/image.jpg']
  },
  // Other required fields...
};

const result = await provider.SendSingleMessage(mediaMessage);
```

### Retrieving Messages

```typescript
import { GetMessagesParams } from '@memberjunction/communication-types';

const params: GetMessagesParams = {
  NumMessages: 50,
  ContextData: {
    // Optional filters
    from: '+1234567890',
    to: '+0987654321',
    dateSent: new Date('2024-01-01')
  }
};

const result = await provider.GetMessages(params);
if (result.Success) {
  console.log(`Retrieved ${result.Messages.length} messages`);
  result.Messages.forEach(msg => {
    console.log(`From: ${msg.From}, Body: ${msg.Body}`);
  });
}
```

### Replying to Messages

```typescript
import { ReplyToMessageParams } from '@memberjunction/communication-types';

const replyParams: ReplyToMessageParams = {
  MessageID: 'original_message_sid', // The Twilio Message SID
  Message: {
    ProcessedBody: 'Thanks for your message!',
    // Other message fields...
  }
};

const result = await provider.ReplyToMessage(replyParams);
if (result.Success) {
  console.log('Reply sent successfully');
}
```

### Forwarding Messages

```typescript
import { ForwardMessageParams } from '@memberjunction/communication-types';

const forwardParams: ForwardMessageParams = {
  MessageID: 'message_to_forward_sid',
  ToRecipients: ['+1234567890', 'whatsapp:+0987654321'],
  Message: 'FYI - forwarding this message' // Optional comment
};

const result = await provider.ForwardMessage(forwardParams);
if (result.Success) {
  console.log('Message forwarded successfully');
}
```

## Channel Detection

The provider automatically detects the communication channel based on the recipient format:

- **SMS**: Standard phone number format (e.g., `+1234567890`)
- **WhatsApp**: Prefixed with `whatsapp:` (e.g., `whatsapp:+1234567890`)
- **Facebook Messenger**: Prefixed with `messenger:` (e.g., `messenger:user_psid`)

## API Reference

### TwilioProvider

The main provider class that implements the `BaseCommunicationProvider` interface.

#### Methods

##### `SendSingleMessage(message: ProcessedMessage): Promise<MessageResult>`
Sends a single message through the appropriate Twilio channel.

**Parameters:**
- `message`: The processed message to send
  - `To`: Recipient (phone number or channel-prefixed ID)
  - `From`: (Optional) Sender ID, defaults to configured numbers
  - `ProcessedBody`: The message content
  - `ContextData.mediaUrls`: (Optional) Array of media URLs for MMS/WhatsApp media

**Returns:** `MessageResult` with success status and any error information

##### `GetMessages(params: GetMessagesParams): Promise<GetMessagesResult>`
Retrieves messages from Twilio based on filter criteria.

**Parameters:**
- `params`: Message retrieval parameters
  - `NumMessages`: Maximum number of messages to retrieve
  - `ContextData`: Optional filters (from, to, dateSent)

**Returns:** `GetMessagesResult` with retrieved messages and status

##### `ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult>`
Sends a reply to a specific message.

**Parameters:**
- `params`: Reply parameters
  - `MessageID`: The Twilio SID of the message to reply to
  - `Message`: The reply message content

**Returns:** `ReplyToMessageResult` with success status

##### `ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>`
Forwards a message to one or more recipients.

**Parameters:**
- `params`: Forward parameters
  - `MessageID`: The Twilio SID of the message to forward
  - `ToRecipients`: Array of recipient addresses
  - `Message`: (Optional) Additional comment to include

**Returns:** `ForwardMessageResult` with success status

## Dependencies

This package depends on:
- `@memberjunction/communication-types` - Communication provider interfaces
- `@memberjunction/core` - Core MemberJunction utilities
- `@memberjunction/global` - Global registration utilities
- `twilio` - Official Twilio SDK
- `dotenv` - Environment variable management
- `env-var` - Environment variable validation

## Integration with MemberJunction

This provider is automatically registered with the MemberJunction framework using the `@RegisterClass` decorator. Once imported, it becomes available for use through the MemberJunction communication system.

The provider name registered is: **"Twilio"**

## Build and Development

### Building the Package
```bash
npm run build
```

### Cleaning Build Artifacts
```bash
npm run clean
```

### TypeScript Configuration
The package uses TypeScript and compiles to ES2020 with CommonJS modules. Type definitions are included in the distribution.

## Notes

- The provider uses plain text for message bodies as HTML is not supported by SMS/messaging channels
- Message threading is simulated using Message SIDs as Twilio doesn't have a native thread concept
- Media attachments are supported through the `mediaUrls` context data property
- All messages are sent asynchronously using the Twilio REST API

## Error Handling

The provider includes comprehensive error handling with detailed logging through the MemberJunction logging system. All errors are caught and returned in the result objects with descriptive error messages.

## License

This package is part of the MemberJunction framework. See the main repository for license information.