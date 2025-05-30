# @memberjunction/entity-communications-client

A client library for interacting with the MemberJunction Entity Communications Engine. This package provides a GraphQL-based client implementation for executing communication requests against views of entity records.

## Overview

The Entity Communications Client enables you to send templated messages (email, SMS, etc.) to recipients based on entity data views. It supports various communication providers and message types while leveraging MemberJunction's templating system for dynamic content generation.

## Installation

```bash
npm install @memberjunction/entity-communications-client
```

## Dependencies

This package depends on:
- `@memberjunction/global` - Core MemberJunction utilities
- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/entity-communications-base` - Base classes for entity communications
- `@memberjunction/graphql-dataprovider` - GraphQL data provider for API calls

## Usage

### Basic Example

```typescript
import { EntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';

// Initialize the client
const client = new EntityCommunicationsEngineClient();

// Configure the client (required before first use)
await client.Config();

// Set up communication parameters
const params: EntityCommunicationParams = {
  EntityID: '123',  // ID of the entity to communicate about
  RunViewParams: {
    ViewID: '456',  // ID of the view that defines recipients
    ExtraFilter: 'IsActive = 1',  // Additional filtering
    OrderBy: 'LastName ASC',
    MaxRows: 100
  },
  ProviderName: 'SendGrid',  // Communication provider to use
  ProviderMessageTypeName: 'Email',  // Type of message
  Message: {
    From: 'noreply@example.com',
    To: '{{Email}}',  // Can use template variables
    Subject: 'Important Update',
    Body: 'Hello {{FirstName}}, we have an update for you.',
    ContextData: {
      // Additional data for template rendering
      CompanyName: 'Acme Corp',
      UpdateDate: new Date()
    }
  },
  PreviewOnly: false,  // Set to true to preview without sending
  IncludeProcessedMessages: true  // Include processed message content in results
};

// Execute the communication
const result = await client.RunEntityCommunication(params);

if (result.Success) {
  console.log(`Successfully sent ${result.Results.length} messages`);
  
  // Process results
  result.Results.forEach(item => {
    console.log(`Sent to: ${item.RecipientData.Email}`);
    console.log(`Message: ${item.Message.ProcessedBody}`);
  });
} else {
  console.error(`Communication failed: ${result.ErrorMessage}`);
}
```

### Using Templates

```typescript
import { TemplateEntityExtended } from '@memberjunction/templates-base-types';

// Load your template (example)
const template = await getTemplate('Welcome Email');  // Your template loading logic

const params: EntityCommunicationParams = {
  EntityID: '123',
  RunViewParams: {
    ViewID: '456',
    // View should return records with fields matching template variables
  },
  ProviderName: 'SendGrid',
  ProviderMessageTypeName: 'Email',
  Message: {
    From: 'welcome@example.com',
    To: '{{Email}}',
    SubjectTemplate: subjectTemplate,  // Template for subject line
    BodyTemplate: bodyTemplate,        // Template for plain text body
    HTMLBodyTemplate: htmlTemplate,    // Template for HTML body
    ContextData: {
      // Global context data available to all recipients
      Year: new Date().getFullYear()
    }
  }
};

const result = await client.RunEntityCommunication(params);
```

### Preview Mode

To test your communications without actually sending messages:

```typescript
const params: EntityCommunicationParams = {
  // ... other parameters ...
  PreviewOnly: true,  // Enable preview mode
  IncludeProcessedMessages: true  // Get the processed message content
};

const result = await client.RunEntityCommunication(params);

// Review what would be sent
result.Results.forEach(item => {
  console.log('Would send to:', item.RecipientData);
  console.log('Subject:', item.Message.ProcessedSubject);
  console.log('Body:', item.Message.ProcessedBody);
});
```

## API Reference

### EntityCommunicationsEngineClient

The main client class for entity communications.

#### Methods

##### `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>`

Configures the client by loading necessary metadata. Must be called before using other methods.

- `forceRefresh` - Force reload of metadata cache
- `contextUser` - User context for permissions
- `provider` - Custom metadata provider

##### `RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult>`

Executes a communication request against entity records.

- `params` - Communication parameters (see below)
- Returns: Promise resolving to communication results

### Types

#### EntityCommunicationParams

```typescript
interface EntityCommunicationParams {
  EntityID: string;                    // ID of the entity to communicate about
  RunViewParams: RunViewParams;        // View parameters to select recipients
  ProviderName: string;                // Name of communication provider
  ProviderMessageTypeName: string;     // Type of message for the provider
  Message: Message;                    // Message content and templates
  PreviewOnly?: boolean;               // If true, preview without sending
  IncludeProcessedMessages?: boolean;  // Include processed content in results
}
```

#### Message

```typescript
interface Message {
  MessageType?: CommunicationProviderMessageTypeEntity;
  From?: string;                       // Sender address
  To?: string;                         // Recipient address (can use templates)
  Body?: string;                       // Plain text body
  BodyTemplate?: TemplateEntityExtended;
  HTMLBody?: string;                   // HTML body
  HTMLBodyTemplate?: TemplateEntityExtended;
  Subject?: string;                    // Subject line
  SubjectTemplate?: TemplateEntityExtended;
  ContextData?: any;                   // Additional template context
}
```

#### EntityCommunicationResult

```typescript
interface EntityCommunicationResult {
  Success: boolean;                    // Whether communication succeeded
  ErrorMessage?: string;               // Error details if failed
  Results?: EntityCommunicationResultItem[];  // Individual message results
}

interface EntityCommunicationResultItem {
  RecipientData: any;                  // Data for this recipient
  Message: ProcessedMessage;           // The processed message
}
```

## Integration with MemberJunction

This client integrates seamlessly with other MemberJunction packages:

- **Templates**: Use `@memberjunction/templates-base-types` for dynamic content
- **Entities**: Works with any entity defined in your MemberJunction schema
- **Views**: Leverages MemberJunction views to select communication recipients
- **Providers**: Supports all registered communication providers (SendGrid, Twilio, MS Graph, etc.)

## Configuration

The client uses GraphQL to communicate with the MemberJunction API. Ensure your GraphQL endpoint is properly configured through the `GraphQLDataProvider`.

## Error Handling

The client provides detailed error information:

```typescript
const result = await client.RunEntityCommunication(params);

if (!result.Success) {
  console.error('Communication failed:', result.ErrorMessage);
  
  // Check individual message failures
  result.Results?.forEach(item => {
    if (!item.Message.Success) {
      console.error(`Failed for ${item.RecipientData.Email}:`, item.Message.Error);
    }
  });
}
```

## Best Practices

1. **Always call `Config()` before first use** - This loads necessary metadata
2. **Use preview mode for testing** - Set `PreviewOnly: true` to test without sending
3. **Handle errors gracefully** - Check both overall and individual message success
4. **Use templates for consistency** - Leverage MemberJunction's template system
5. **Filter recipients carefully** - Use view filters to target the right audience
6. **Include context data** - Provide all necessary data for template rendering

## License

ISC