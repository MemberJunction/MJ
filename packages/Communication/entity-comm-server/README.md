# @memberjunction/entity-communications-server

A server-side implementation of the MemberJunction Entity Communications Engine that connects the MJ entities framework to the communication framework, enabling bulk communications to entity records.

## Overview

This package provides a server-side engine for sending communications (emails, SMS, etc.) to records retrieved from entity views. It extends the base entity communications functionality with server-specific capabilities, including:

- Bulk message sending to entity record sets
- Template parameter resolution with related entity data
- Multi-provider support (email, SMS, etc.)
- Context data population for personalized messages
- Scheduled message sending (when supported by provider)

## Installation

```bash
npm install @memberjunction/entity-communications-server
```

## Dependencies

This package depends on the following MemberJunction packages:

- `@memberjunction/global` - Core global utilities
- `@memberjunction/core` - Core MJ functionality including metadata, entities, and views
- `@memberjunction/core-entities` - Core entity definitions
- `@memberjunction/communication-engine` - Base communication engine
- `@memberjunction/entity-communications-base` - Base entity communications types and interfaces

## Usage

### Basic Example

```typescript
import { EntityCommunicationsEngine } from '@memberjunction/entity-communications-server';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';
import { UserInfo } from '@memberjunction/core';

// Get the singleton instance
const engine = EntityCommunicationsEngine.Instance;

// Configure the engine with user context
const currentUser = new UserInfo(); // Your current user
await engine.Config(false, currentUser);

// Set up communication parameters
const params: EntityCommunicationParams = {
    EntityID: 'entity-uuid-here',
    RunViewParams: {
        EntityName: 'Contacts',
        ViewName: 'Active Contacts',
        ExtraFilter: 'Status = "Active"'
    },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        Subject: 'Welcome to our service',
        Body: 'Hello {{FirstName}}, welcome!',
        // Optional: Use templates for dynamic content
        SubjectTemplate: subjectTemplateEntity,
        BodyTemplate: bodyTemplateEntity,
        HTMLBodyTemplate: htmlBodyTemplateEntity
    },
    PreviewOnly: false // Set to true to preview without sending
};

// Execute the communication
const result = await engine.RunEntityCommunication(params);

if (result.Success) {
    console.log(`Successfully sent ${result.Results.length} messages`);
} else {
    console.error(`Failed: ${result.ErrorMessage}`);
}
```

### Using Templates with Related Data

```typescript
// Example with templates that include related entity data
const params: EntityCommunicationParams = {
    EntityID: 'customer-entity-id',
    RunViewParams: {
        EntityName: 'Customers',
        ViewName: 'Premium Customers'
    },
    ProviderName: 'Twilio',
    ProviderMessageTypeName: 'SMS',
    Message: {
        // Templates can reference both record fields and related entity data
        BodyTemplate: templateWithOrdersParam, // Template with "Orders" parameter
        // The engine will automatically fetch related orders for each customer
    }
};

const result = await engine.RunEntityCommunication(params);
```

### Checking Entity Communication Support

```typescript
// Check if an entity supports communication
const entityID = 'entity-uuid';
if (engine.EntitySupportsCommunication(entityID)) {
    // Get available message types for the entity
    const messageTypes = engine.GetEntityCommunicationMessageTypes(entityID);
    
    messageTypes.forEach(mt => {
        console.log(`Message Type: ${mt.BaseMessageType}`);
        // Each message type has associated fields that can be used for recipient addresses
        mt.CommunicationFields.forEach(field => {
            console.log(`  Field: ${field.FieldName} (Priority: ${field.Priority})`);
        });
    });
}
```

## API Reference

### EntityCommunicationsEngine

The main engine class that handles entity-based communications.

#### Methods

##### `RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult>`

Executes a communication request against a view of entity records.

**Parameters:**
- `params`: Configuration object containing:
  - `EntityID`: The UUID of the entity to communicate with
  - `RunViewParams`: Parameters for the view query to retrieve records
  - `ProviderName`: Name of the communication provider (e.g., "SendGrid", "Twilio")
  - `ProviderMessageTypeName`: Type of message for the provider (e.g., "Email", "SMS")
  - `Message`: The message content and optional templates
  - `PreviewOnly`: (Optional) If true, preview without sending
  - `IncludeProcessedMessages`: (Optional) Include processed message content in results

**Returns:** `EntityCommunicationResult` with success status and sent messages

##### `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>`

Configures the engine with user context and loads metadata.

##### `EntitySupportsCommunication(entityID: string): boolean`

Checks if an entity has communication capabilities configured.

##### `GetEntityCommunicationMessageTypes(entityID: string): EntityCommunicationMessageTypeExtended[]`

Retrieves available message types for an entity.

### Types

#### EntityCommunicationParams

```typescript
class EntityCommunicationParams {
    EntityID: string;
    RunViewParams: RunViewParams;
    ProviderName: string;
    ProviderMessageTypeName: string;
    Message: Message;
    PreviewOnly?: boolean;
    IncludeProcessedMessages?: boolean;
}
```

#### EntityCommunicationResult

```typescript
class EntityCommunicationResult {
    Success: boolean;
    ErrorMessage?: string;
    Results?: EntityCommunicationResultItem[];
}
```

#### EntityCommunicationResultItem

```typescript
class EntityCommunicationResultItem {
    RecipientData: any;
    Message: ProcessedMessage;
}
```

## Configuration

### Entity Communication Setup

For an entity to support communications:

1. Configure `Entity Communication Message Types` in the MJ metadata
2. Set up `Entity Communication Fields` to define recipient address fields
3. Configure field priorities for automatic recipient resolution

### Template Parameters

Templates support multiple parameter types:

- **Record**: The current entity record being processed
- **Entity**: Related entity data fetched based on relationships
- **Array/Scalar/Object**: Direct programmatic use (not supported in messaging)

When using related entity parameters, the engine automatically:
1. Identifies unique relationships needed
2. Fetches all related data in batch queries
3. Filters related data per recipient record
4. Populates template context with filtered data

### Provider Requirements

Communication providers must:
- Be registered in the CommunicationEngine
- Support sending (`SupportsSending = true`)
- Support scheduled sending if `SendAt` is specified
- Have matching message types configured

## Error Handling

The engine validates:
- Entity existence and communication support
- Provider availability and capabilities
- Message type compatibility
- Template parameter alignment (no conflicting parameter definitions)
- Field availability for recipient addresses

All errors are returned in the `EntityCommunicationResult.ErrorMessage` field.

## Performance Considerations

- The engine fetches all entity fields to ensure template access
- Related entity data is batch-loaded for all recipients
- Large recipient sets should be paginated using view parameters
- Use `PreviewOnly` mode for testing before bulk sends

## Integration with MemberJunction

This package integrates with:
- **Metadata System**: For entity and field definitions
- **View Engine**: For querying recipient records
- **Template Engine**: For message personalization
- **Communication Engine**: For actual message delivery
- **Security**: Respects user context and permissions

## Building

```bash
npm run build
```

The package is built using TypeScript and outputs to the `dist` directory.

## License

ISC

## Support

For issues and questions, please refer to the main MemberJunction documentation at [MemberJunction.com](https://www.memberjunction.com)