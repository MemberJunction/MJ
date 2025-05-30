# @memberjunction/communication-gmail

Gmail/Google Suite provider implementation for the MemberJunction Communication framework. This package enables sending and receiving emails through Gmail's API using OAuth2 authentication.

## Overview

The Gmail Communication Provider integrates Gmail's API with MemberJunction's communication infrastructure, providing:

- Email sending capabilities with full HTML and plain text support
- Email retrieval with flexible query options
- Reply-to-message functionality maintaining thread context
- Message forwarding capabilities
- OAuth2-based authentication using refresh tokens
- Automatic token refresh for uninterrupted service

## Installation

```bash
npm install @memberjunction/communication-gmail
```

## Configuration

The Gmail provider requires OAuth2 credentials and a refresh token. Set the following environment variables:

```env
# Required: OAuth2 Client Credentials
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=your_redirect_uri_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here

# Optional: Default sender email
GMAIL_SERVICE_ACCOUNT_EMAIL=noreply@yourdomain.com
```

### Obtaining OAuth2 Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API for your project
4. Create OAuth2 credentials (OAuth 2.0 Client ID)
5. Set up the OAuth consent screen
6. Use the OAuth2 flow to obtain a refresh token with the required scopes

### Required OAuth2 Scopes

The provider requires the following Gmail API scopes:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.compose`

## Usage

### Basic Setup

```typescript
import { GmailProvider } from '@memberjunction/communication-gmail';

// The provider is automatically registered with MemberJunction's class factory
// using the @RegisterClass decorator
```

### Sending Emails

```typescript
import { ProcessedMessage, MessageResult } from '@memberjunction/communication-types';
import { GmailProvider } from '@memberjunction/communication-gmail';

const provider = new GmailProvider();

const message: ProcessedMessage = {
  To: 'recipient@example.com',
  From: 'sender@example.com', // Optional, uses authenticated account if not specified
  FromName: 'Sender Name',
  ProcessedSubject: 'Test Email',
  ProcessedBody: 'This is a plain text email body',
  ProcessedHTMLBody: '<html><body><h1>This is an HTML email</h1></body></html>',
  CCRecipients: ['cc@example.com'],
  BCCRecipients: ['bcc@example.com']
};

const result: MessageResult = await provider.SendSingleMessage(message);

if (result.Success) {
  console.log('Email sent successfully');
} else {
  console.error('Failed to send email:', result.Error);
}
```

### Retrieving Messages

```typescript
import { GetMessagesParams, GetMessagesResult } from '@memberjunction/communication-types';

const params: GetMessagesParams = {
  NumMessages: 10,
  UnreadOnly: true,
  ContextData: {
    query: 'from:important@example.com', // Gmail search query
    MarkAsRead: true // Mark retrieved messages as read
  }
};

const result: GetMessagesResult = await provider.GetMessages(params);

if (result.Success) {
  result.Messages.forEach(message => {
    console.log(`From: ${message.From}`);
    console.log(`Subject: ${message.Subject}`);
    console.log(`Body: ${message.Body}`);
  });
} else {
  console.error('Failed to get messages:', result.ErrorMessage);
}
```

### Replying to Messages

```typescript
import { ReplyToMessageParams, ProcessedMessage } from '@memberjunction/communication-types';

const replyMessage: ProcessedMessage = {
  To: 'original-sender@example.com',
  ProcessedSubject: 'Re: Original Subject',
  ProcessedBody: 'This is my reply'
};

const params: ReplyToMessageParams = {
  MessageID: 'original-message-id', // Gmail message ID
  Message: replyMessage
};

const result = await provider.ReplyToMessage(params);

if (result.Success) {
  console.log('Reply sent successfully');
}
```

### Forwarding Messages

```typescript
import { ForwardMessageParams } from '@memberjunction/communication-types';

const params: ForwardMessageParams = {
  MessageID: 'message-to-forward-id',
  ToRecipients: ['forward-to@example.com'],
  CCRecipients: ['cc@example.com'],
  BCCRecipients: ['bcc@example.com'],
  Message: 'FYI - forwarding this message' // Optional forward comment
};

const result = await provider.ForwardMessage(params);

if (result.Success) {
  console.log('Message forwarded successfully');
}
```

## API Reference

### GmailProvider Class

The main provider class that extends `BaseCommunicationProvider` from `@memberjunction/communication-types`.

#### Methods

##### `SendSingleMessage(message: ProcessedMessage): Promise<MessageResult>`
Sends a single email message through Gmail.

##### `GetMessages(params: GetMessagesParams): Promise<GetMessagesResult>`
Retrieves messages from Gmail based on the provided parameters.

##### `ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult>`
Replies to an existing Gmail message, maintaining the thread context.

##### `ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>`
Forwards an existing Gmail message to new recipients.

### Configuration Module

#### Environment Variables
- `GMAIL_CLIENT_ID` (required): OAuth2 client ID
- `GMAIL_CLIENT_SECRET` (required): OAuth2 client secret
- `GMAIL_REDIRECT_URI` (required): OAuth2 redirect URI
- `GMAIL_REFRESH_TOKEN` (required): OAuth2 refresh token
- `GMAIL_SERVICE_ACCOUNT_EMAIL` (optional): Default sender email address

### Authentication Module

The `auth.ts` module exports:
- `GmailClient`: Pre-configured Gmail API client
- `getAuthenticatedUser()`: Helper function to verify authentication

## Integration with MemberJunction

This provider integrates seamlessly with MemberJunction's communication framework:

1. **Automatic Registration**: The provider is automatically registered using the `@RegisterClass` decorator
2. **Type Safety**: Full TypeScript support with types from `@memberjunction/communication-types`
3. **Logging**: Integrated with MemberJunction's logging system via `@memberjunction/core`
4. **Global Registry**: Utilizes `@memberjunction/global` for class registration

## Dependencies

- `@memberjunction/communication-types`: Communication framework interfaces and types
- `@memberjunction/core`: Core MemberJunction utilities and logging
- `@memberjunction/global`: Global class registry system
- `googleapis`: Google APIs Node.js client library
- `dotenv`: Environment variable management
- `env-var`: Environment variable validation

## Error Handling

The provider includes comprehensive error handling:
- OAuth2 authentication failures
- API rate limiting
- Network errors
- Invalid message formats
- Missing required fields

All errors are logged using MemberJunction's logging system and returned with descriptive error messages.

## Security Considerations

1. **Refresh Token Security**: Store refresh tokens securely and never commit them to version control
2. **Scope Limitations**: Request only the minimum required OAuth2 scopes
3. **Environment Variables**: Use secure methods to manage environment variables in production
4. **API Credentials**: Regularly rotate client secrets and monitor API usage

## Development

### Building

```bash
npm run build
```

### Cleaning

```bash
npm run clean
```

## License

This package is part of the MemberJunction ecosystem. See the root repository for license information.