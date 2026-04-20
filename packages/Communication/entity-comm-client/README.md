# @memberjunction/entity-communications-client

Client-side (Angular / browser) implementation of the MemberJunction Entity Communications Engine. This package sends entity communication requests to the server via GraphQL, enabling bulk messaging to records retrieved from entity views.

## Architecture

```mermaid
graph TD
    subgraph client["@memberjunction/entity-comm-client"]
        ECC["EntityCommunicationsEngineClient"]
    end

    subgraph base["@memberjunction/entity-communications-base"]
        ECB["EntityCommunicationsEngineBase"]
        PARAMS["EntityCommunicationParams"]
        RESULT["EntityCommunicationResult"]
    end

    subgraph graphql["@memberjunction/graphql-dataprovider"]
        GQL["GraphQLDataProvider"]
    end

    subgraph api["MJAPI Server"]
        RESOLVER["GraphQL Resolver"]
        SERVER["EntityCommunicationsEngine\n(Server)"]
    end

    ECB --> ECC
    ECC -->|mutation| GQL
    GQL -->|HTTP| RESOLVER
    RESOLVER --> SERVER

    style client fill:#b8762f,stroke:#8a5722,color:#fff
    style base fill:#2d6a9f,stroke:#1a4971,color:#fff
    style graphql fill:#7c5295,stroke:#563a6b,color:#fff
    style api fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Installation

```bash
npm install @memberjunction/entity-communications-client
```

## Usage

### Basic Example

```typescript
import { EntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';

const client = new EntityCommunicationsEngineClient();
await client.Config();

const params: EntityCommunicationParams = {
    EntityID: '123',
    RunViewParams: {
        ViewID: '456',
        ExtraFilter: 'IsActive = 1',
        MaxRows: 100
    },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        From: 'noreply@example.com',
        To: '{{Email}}',
        Subject: 'Important Update',
        Body: 'Hello {{FirstName}}, we have an update for you.',
        ContextData: {
            CompanyName: 'Acme Corp'
        }
    },
    PreviewOnly: false,
    IncludeProcessedMessages: true
};

const result = await client.RunEntityCommunication(params);

if (result.Success) {
    console.log(`Sent ${result.Results.length} messages`);
} else {
    console.error(`Failed: ${result.ErrorMessage}`);
}
```

### Preview Mode

Test communications without actually sending messages:

```typescript
const params: EntityCommunicationParams = {
    // ...same parameters...
    PreviewOnly: true,
    IncludeProcessedMessages: true
};

const result = await client.RunEntityCommunication(params);
result.Results.forEach(item => {
    console.log('Would send to:', item.RecipientData);
    console.log('Subject:', item.Message.ProcessedSubject);
    console.log('Body:', item.Message.ProcessedBody);
});
```

### Using Templates

```typescript
const params: EntityCommunicationParams = {
    EntityID: '123',
    RunViewParams: { ViewID: '456' },
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'Email',
    Message: {
        From: 'welcome@example.com',
        To: '{{Email}}',
        SubjectTemplate: subjectTemplate,
        BodyTemplate: bodyTemplate,
        HTMLBodyTemplate: htmlTemplate,
        ContextData: { Year: new Date().getFullYear() }
    }
};
```

## How It Works

The client serializes `EntityCommunicationParams` and sends them to the MJAPI server via a GraphQL mutation. The server-side `EntityCommunicationsEngine` handles the actual view execution, template rendering, and message delivery through communication providers.

```mermaid
sequenceDiagram
    participant UI as Angular UI
    participant Client as EntityCommClient
    participant GQL as GraphQL Provider
    participant API as MJAPI
    participant Server as EntityCommEngine

    UI->>Client: RunEntityCommunication(params)
    Client->>Client: Serialize params
    Client->>GQL: GraphQL mutation
    GQL->>API: HTTP POST
    API->>Server: RunEntityCommunication(params)
    Server->>Server: Execute view, render templates, send
    Server-->>API: EntityCommunicationResult
    API-->>GQL: Response
    GQL-->>Client: Deserialized result
    Client-->>UI: EntityCommunicationResult
```

## API Reference

| Method | Description |
|--------|-------------|
| `Config(forceRefresh?, contextUser?, provider?)` | Load metadata (required before first use) |
| `RunEntityCommunication(params)` | Execute entity communication via GraphQL |

## Error Handling

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

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/entity-communications-base` | Shared types and base engine |
| `@memberjunction/graphql-dataprovider` | GraphQL client for API communication |
| `@memberjunction/core` | Core framework utilities |
| `@memberjunction/core-entities` | Entity type definitions |
| `@memberjunction/global` | Class registration |

## Development

```bash
npm run build    # Compile TypeScript
npm start        # Watch mode
```
