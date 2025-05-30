# @memberjunction/communication-ms-graph

Microsoft Graph Provider for the MemberJunction Communication Framework. This package provides email communication capabilities through Microsoft Graph API, allowing you to send, receive, reply to, and forward emails using Azure Active Directory service accounts.

## Overview

The `@memberjunction/communication-ms-graph` package implements the `BaseCommunicationProvider` interface from the MemberJunction communication framework, specifically for Microsoft Graph email operations. It uses OAuth 2.0 client credentials flow for authentication and supports full email functionality including HTML/text content, attachments, and thread management.

## Features

- **Send Emails**: Send single or bulk emails with HTML/text content
- **Receive Emails**: Fetch emails with filtering, pagination, and read status management
- **Reply to Emails**: Reply to existing email threads
- **Forward Emails**: Forward emails to multiple recipients
- **HTML to Text Conversion**: Automatic conversion of HTML email content to plain text
- **Thread Management**: Track email conversations using thread IDs
- **Service Account Support**: Uses Azure AD service accounts for authentication

## Installation

```bash
npm install @memberjunction/communication-ms-graph
```

## Configuration

This provider requires the following environment variables to be set:

```env
# Azure AD Application Registration
AZURE_CLIENT_ID=your-client-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_SECRET=your-client-secret

# Azure Endpoints
AZURE_AAD_ENDPOINT=https://login.microsoftonline.com
AZURE_GRAPH_ENDPOINT=https://graph.microsoft.com

# Service Account
AZURE_ACCOUNT_EMAIL=serviceaccount@yourdomain.com
AZURE_ACCOUNT_ID=optional-account-id
```

### Azure AD Setup

1. Register an application in Azure Active Directory
2. Grant the following Microsoft Graph API permissions:
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `User.Read.All`
3. Create a client secret for the application
4. Grant admin consent for the permissions

## Usage

### Basic Setup

```typescript
import { MSGraphProvider } from '@memberjunction/communication-ms-graph';
import { ProcessedMessage } from '@memberjunction/communication-types';

// The provider is automatically registered with the MemberJunction framework
// using the @RegisterClass decorator with name 'Microsoft Graph'
const provider = new MSGraphProvider();
```

### Sending an Email

```typescript
const message: ProcessedMessage = {
    To: 'recipient@example.com',
    Subject: 'Test Email',
    ProcessedBody: 'This is a plain text email',
    ProcessedHTMLBody: '<h1>This is an HTML email</h1>',
    CCRecipients: ['cc@example.com'],
    BCCRecipients: ['bcc@example.com']
};

const result = await provider.SendSingleMessage(message);

if (result.Success) {
    console.log('Email sent successfully');
} else {
    console.error('Failed to send email:', result.Error);
}
```

### Receiving Emails

```typescript
import { GetMessagesParams } from '@memberjunction/communication-types';
import { GetMessagesContextDataParams } from '@memberjunction/communication-ms-graph';

const params: GetMessagesParams<GetMessagesContextDataParams> = {
    NumMessages: 10,
    UnreadOnly: true,
    ContextData: {
        Email: 'optional-service-account@domain.com', // Optional, defaults to AZURE_ACCOUNT_EMAIL
        ReturnAsPlainText: true, // Converts HTML to plain text
        MarkAsRead: true, // Marks messages as read after fetching
        Filter: "(importance eq 'high')", // Optional OData filter
        Top: 20 // Optional, overrides NumMessages
    }
};

const result = await provider.GetMessages(params);

if (result.Success) {
    result.Messages.forEach(message => {
        console.log(`From: ${message.From}`);
        console.log(`Subject: ${message.Subject}`);
        console.log(`Body: ${message.Body}`);
        console.log(`Thread ID: ${message.ThreadID}`);
    });
}
```

### Replying to an Email

```typescript
import { ReplyToMessageParams } from '@memberjunction/communication-types';

const replyParams: ReplyToMessageParams = {
    MessageID: 'original-message-id',
    Message: {
        To: 'recipient@example.com',
        ProcessedBody: 'This is my reply',
        CCRecipients: ['cc@example.com'],
        BCCRecipients: ['bcc@example.com']
    }
};

const result = await provider.ReplyToMessage(replyParams);

if (result.Success) {
    console.log('Reply sent successfully');
}
```

### Forwarding an Email

```typescript
import { ForwardMessageParams } from '@memberjunction/communication-types';

const forwardParams: ForwardMessageParams = {
    MessageID: 'original-message-id',
    Message: 'Please see the forwarded message below',
    ToRecipients: ['forward-to@example.com'],
    CCRecipients: ['cc@example.com'],
    BCCRecipients: ['bcc@example.com']
};

const result = await provider.ForwardMessage(forwardParams);

if (result.Success) {
    console.log('Message forwarded successfully');
}
```

## API Reference

### MSGraphProvider

The main class that implements email communication through Microsoft Graph.

#### Methods

##### `SendSingleMessage(message: ProcessedMessage): Promise<MessageResult>`
Sends a single email message.

##### `GetMessages(params: GetMessagesParams<GetMessagesContextDataParams>): Promise<GetMessagesResult<Message>>`
Retrieves emails from the service account's mailbox with optional filtering.

##### `ReplyToMessage(params: ReplyToMessageParams): Promise<ReplyToMessageResult>`
Replies to an existing email thread.

##### `ForwardMessage(params: ForwardMessageParams): Promise<ForwardMessageResult>`
Forwards an email to specified recipients.

### Types

#### `GetMessagesContextDataParams`
Context data specific to MS Graph operations:

```typescript
type GetMessagesContextDataParams = {
    Email?: string;           // Service account email (optional)
    ReturnAsPlainText?: boolean; // Convert HTML to plain text
    MarkAsRead?: boolean;     // Mark messages as read after fetching
    Filter?: string;          // OData filter for message query
    Top?: number;            // Number of messages to return
}
```

## Dependencies

### Core Dependencies
- `@memberjunction/communication-types`: Base types and interfaces
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity management
- `@memberjunction/global`: Global utilities and decorators

### Microsoft Graph Dependencies
- `@microsoft/microsoft-graph-client`: Microsoft Graph API client
- `@microsoft/microsoft-graph-types`: TypeScript types for Graph API
- `@azure/identity`: Azure authentication library
- `@azure/msal-node`: Microsoft Authentication Library

### Utility Dependencies
- `html-to-text`: HTML to plain text conversion
- `axios`: HTTP client
- `dotenv`: Environment variable management
- `env-var`: Environment variable validation

## Integration with MemberJunction

This provider integrates seamlessly with the MemberJunction communication framework:

1. **Automatic Registration**: The provider is automatically registered using the `@RegisterClass` decorator
2. **Entity Support**: Works with MemberJunction entities for message persistence
3. **AI Integration**: Compatible with AI-powered message processing through `@memberjunction/ai` packages
4. **Template Support**: Can be used with the MemberJunction template engine for dynamic content

## Build and Development

```bash
# Build the package
npm run build

# Development mode with watch
npm start

# Run tests (not yet implemented)
npm test
```

## Error Handling

The provider includes comprehensive error handling:
- All methods return result objects with `Success` boolean and error details
- Errors are logged using MemberJunction's logging system
- Network and authentication errors are gracefully handled

## Security Considerations

- Uses OAuth 2.0 client credentials flow
- Requires admin-consented permissions
- Service account credentials should be stored securely
- Supports principle of least privilege through scoped permissions

## License

ISC License - see LICENSE file for details.

## Author

MemberJunction.com