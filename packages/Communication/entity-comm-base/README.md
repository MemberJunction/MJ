# @memberjunction/entity-communications-base

Base types and abstractions for implementing entity-level communications in MemberJunction. This package provides the foundation for building communication engines that can send messages (email, SMS, etc.) to entity records.

## Overview

The Entity Communications Base package enables developers to:
- Define communication message types for specific entities
- Configure communication fields and templates per entity
- Execute bulk communications against entity record sets
- Support multiple communication providers (email, SMS, etc.)
- Preview messages before sending

## Installation

```bash
npm install @memberjunction/entity-communications-base
```

## Core Components

### EntityCommunicationsEngineBase

Abstract base class for implementing entity communication engines. Provides metadata loading, configuration, and validation capabilities.

```typescript
import { EntityCommunicationsEngineBase } from '@memberjunction/entity-communications-base';

class MyEntityCommunicationEngine extends EntityCommunicationsEngineBase {
    async RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult> {
        // Implementation for sending communications
    }
}
```

### EntityCommunicationMessageTypeExtended

Extended entity class that includes related communication fields.

```typescript
const messageTypes = engine.GetEntityCommunicationMessageTypes(entityID);
messageTypes.forEach(messageType => {
    console.log(`Message Type: ${messageType.Name}`);
    console.log(`Fields: ${messageType.CommunicationFields.map(f => f.Name).join(', ')}`);
});
```

### EntityCommunicationParams

Parameters for executing entity communications:

```typescript
const params: EntityCommunicationParams = {
    EntityID: 'entity-id-here',
    RunViewParams: {
        EntityName: 'Contacts',
        ExtraFilter: 'Status = "Active"'
    },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        Subject: 'Hello {{FirstName}}',
        Body: 'Welcome to our service!',
        HTMLBody: '<h1>Welcome {{FirstName}}!</h1>'
    },
    PreviewOnly: false,
    IncludeProcessedMessages: true
};
```

## Usage Examples

### Basic Implementation

```typescript
import { 
    EntityCommunicationsEngineBase, 
    EntityCommunicationParams, 
    EntityCommunicationResult 
} from '@memberjunction/entity-communications-base';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(EntityCommunicationsEngineBase)
export class CustomEntityCommunicationEngine extends EntityCommunicationsEngineBase {
    
    async RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult> {
        try {
            // Validate entity supports communication
            if (!this.EntitySupportsCommunication(params.EntityID)) {
                return {
                    Success: false,
                    ErrorMessage: 'Entity does not support communications'
                };
            }

            // Get message types for entity
            const messageTypes = this.GetEntityCommunicationMessageTypes(params.EntityID);
            
            // Process and send messages
            const results = await this.processMessages(params);
            
            return {
                Success: true,
                Results: results
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error.message
            };
        }
    }
    
    private async processMessages(params: EntityCommunicationParams) {
        // Implementation specific to your communication provider
    }
}
```

### Configuration and Initialization

```typescript
import { CustomEntityCommunicationEngine } from './custom-engine';
import { UserInfo } from '@memberjunction/core';

// Initialize the engine
const engine = CustomEntityCommunicationEngine.Instance;

// Configure with user context
const user = new UserInfo();
await engine.Config(false, user);

// Check if entity supports communication
const entityID = 'some-entity-id';
if (engine.EntitySupportsCommunication(entityID)) {
    // Get available message types
    const messageTypes = engine.GetEntityCommunicationMessageTypes(entityID);
    console.log(`Found ${messageTypes.length} message types`);
}
```

### Sending Communications

```typescript
// Send email to all active contacts
const result = await engine.RunEntityCommunication({
    EntityID: 'contact-entity-id',
    RunViewParams: {
        EntityName: 'Contacts',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'LastName, FirstName'
    },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        Subject: 'Monthly Newsletter',
        HTMLBody: '<html>...</html>',
        Body: 'Plain text version...'
    },
    PreviewOnly: false,
    IncludeProcessedMessages: true
});

if (result.Success) {
    console.log(`Sent ${result.Results.length} messages`);
    result.Results.forEach(item => {
        console.log(`Sent to: ${item.RecipientData.Email}`);
        console.log(`Message ID: ${item.Message.MessageID}`);
    });
} else {
    console.error(`Communication failed: ${result.ErrorMessage}`);
}
```

## API Reference

### EntityCommunicationsEngineBase

#### Properties

- `EntityCommunicationMessageTypes`: Array of extended message type entities
- `EntityCommunicationFields`: Array of communication field entities
- `Instance`: Static singleton instance of the engine

#### Methods

- `Config(forceRefresh?, contextUser?, provider?)`: Initialize engine configuration
- `GetEntityCommunicationMessageTypes(entityID)`: Get message types for an entity
- `EntitySupportsCommunication(entityID)`: Check if entity supports communications
- `RunEntityCommunication(params)`: Abstract method to implement communication execution

### EntityCommunicationParams

- `EntityID`: ID of the entity to communicate with
- `RunViewParams`: Parameters for fetching entity records
- `ProviderName`: Name of the communication provider
- `ProviderMessageTypeName`: Type of message (e.g., 'Email', 'SMS')
- `Message`: Message content object
- `PreviewOnly?`: If true, preview without sending
- `IncludeProcessedMessages?`: Include processed message data in results

### EntityCommunicationResult

- `Success`: Boolean indicating operation success
- `ErrorMessage?`: Error details if operation failed
- `Results?`: Array of `EntityCommunicationResultItem` objects

### EntityCommunicationResultItem

- `RecipientData`: Entity record data for recipient
- `Message`: Processed message with provider-specific details

## Dependencies

- `@memberjunction/global`: Global utilities and registration
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Core entity definitions
- `@memberjunction/communication-types`: Communication type definitions

## Integration with Other MJ Packages

This package integrates with:
- **@memberjunction/communication-types**: Provides base communication types and interfaces
- **@memberjunction/core**: Uses BaseEngine pattern and metadata providers
- **@memberjunction/templates**: Can be used with template engine for dynamic content
- **@memberjunction/server**: Server-side implementations typically extend this base

## Build Notes

- TypeScript compilation: `npm run build`
- Source files in `/src`, compiled to `/dist`
- Supports both CommonJS and ES modules
- Type definitions included

## License

ISC