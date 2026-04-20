# @memberjunction/entity-communications-server

Server-side implementation of the MemberJunction Entity Communications Engine. Connects the entity/view system to the communication framework, enabling bulk messaging to records retrieved from entity views with full template rendering, related-entity data resolution, and multi-provider support.

## Architecture

```mermaid
graph TD
    subgraph server["@memberjunction/entity-comm-server"]
        ECE["EntityCommunicationsEngine\n(Singleton)"]
    end

    subgraph base["@memberjunction/entity-communications-base"]
        ECB["EntityCommunicationsEngineBase"]
        PARAMS["EntityCommunicationParams"]
    end

    subgraph comm["@memberjunction/communication-engine"]
        CE["CommunicationEngine"]
    end

    subgraph core["@memberjunction/core"]
        RV["RunView"]
        MD["Metadata"]
    end

    subgraph providers["Registered Providers"]
        SG["SendGrid"]
        GM["Gmail"]
        TW["Twilio"]
        MSP["MS Graph"]
    end

    ECB --> ECE
    ECE -->|queries records| RV
    ECE -->|sends messages| CE
    CE --> SG
    CE --> GM
    CE --> TW
    CE --> MSP

    style server fill:#2d8659,stroke:#1a5c3a,color:#fff
    style base fill:#2d6a9f,stroke:#1a4971,color:#fff
    style comm fill:#7c5295,stroke:#563a6b,color:#fff
    style core fill:#b8762f,stroke:#8a5722,color:#fff
    style providers fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Installation

```bash
npm install @memberjunction/entity-communications-server
```

## Usage

### Basic Example

```typescript
import { EntityCommunicationsEngine } from '@memberjunction/entity-communications-server';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';

const engine = EntityCommunicationsEngine.Instance;
await engine.Config(false, contextUser);

const params: EntityCommunicationParams = {
    EntityID: 'entity-uuid',
    RunViewParams: {
        EntityName: 'Contacts',
        ExtraFilter: 'Status = "Active"'
    },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        Subject: 'Welcome',
        Body: 'Hello {{FirstName}}!',
        HTMLBodyTemplate: htmlTemplate
    },
    PreviewOnly: false
};

const result = await engine.RunEntityCommunication(params);
if (result.Success) {
    console.log(`Sent ${result.Results.length} messages`);
}
```

### Template Parameters with Related Entity Data

When templates reference related entities, the engine automatically fetches the related data in batch and populates each recipient's context:

```typescript
const params: EntityCommunicationParams = {
    EntityID: 'customer-entity-id',
    RunViewParams: { EntityName: 'Customers', ViewName: 'Premium Customers' },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        BodyTemplate: templateWithRelatedEntities
    }
};
// Engine auto-fetches related orders for each customer
const result = await engine.RunEntityCommunication(params);
```

### Checking Entity Communication Support

```typescript
if (engine.EntitySupportsCommunication(entityID)) {
    const messageTypes = engine.GetEntityCommunicationMessageTypes(entityID);
    messageTypes.forEach(mt => {
        console.log(`Type: ${mt.BaseMessageType}`);
        mt.CommunicationFields.forEach(field => {
            console.log(`  Field: ${field.FieldName} (Priority: ${field.Priority})`);
        });
    });
}
```

## Processing Pipeline

```mermaid
sequenceDiagram
    participant App as Application
    participant ECE as EntityCommunicationsEngine
    participant RV as RunView
    participant CE as CommunicationEngine
    participant P as Provider

    App->>ECE: RunEntityCommunication(params)
    ECE->>ECE: Validate entity, provider, message type
    ECE->>RV: RunView(params.RunViewParams)
    RV-->>ECE: Entity records[]
    ECE->>ECE: Load related entity data (batch)
    loop For each record
        ECE->>ECE: Build message with record context
        ECE->>CE: SendSingleMessage(provider, type, message)
        CE->>P: SendSingleMessage(processedMessage)
        P-->>CE: MessageResult
        CE-->>ECE: MessageResult
    end
    ECE-->>App: EntityCommunicationResult
```

## Key Features

- **Bulk Message Sending**: Send to all records from an entity view in a single call
- **Template Parameter Resolution**: Automatically fetches related entity data for template parameters
- **Multi-Provider Support**: Works with any registered communication provider (email, SMS, etc.)
- **Preview Mode**: Test communications without sending (`PreviewOnly: true`)
- **Context Data Population**: Per-recipient template context from entity record fields
- **Scheduled Sending**: Supports provider-level `SendAt` scheduling
- **Communication Logging**: All sends are tracked through `CommunicationRun` and `CommunicationLog` entities

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

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/entity-communications-base` | Shared types and base engine class |
| `@memberjunction/communication-engine` | CommunicationEngine for message delivery |
| `@memberjunction/core` | RunView, Metadata, UserInfo, EntityInfo |
| `@memberjunction/core-entities` | Entity type definitions |
| `@memberjunction/global` | Class registration |

## Development

```bash
npm run build    # Compile TypeScript
npm start        # Watch mode
```
