# @memberjunction/credentials

Secure credential management engine for MemberJunction. Provides centralized storage, retrieval, validation, and audit logging of credentials with automatic field-level encryption and JSON Schema validation.

## Overview

The `@memberjunction/credentials` package manages the full credential lifecycle: storing encrypted values, resolving credentials by name or ID, validating against JSON Schema constraints, and logging every access for audit compliance.

```mermaid
graph TD
    A["CredentialEngine<br/>(Singleton)"] --> B["Credential Types<br/>(Schema Definitions)"]
    A --> C["Credentials<br/>(Encrypted Values)"]
    A --> D["Credential Categories<br/>(Organization)"]
    A --> E["Audit Log<br/>(Access Tracking)"]
    A --> F["Ajv Validator<br/>(JSON Schema)"]

    G["Consumer Code"] --> A
    G -->|"getCredential()"| H["ResolvedCredential<T>"]
    G -->|"storeCredential()"| C
    G -->|"validateCredential()"| I["ValidationResult"]

    style A fill:#2d6a9f,stroke:#1a4971,color:#fff
    style B fill:#7c5295,stroke:#563a6b,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style D fill:#b8762f,stroke:#8a5722,color:#fff
    style E fill:#b8762f,stroke:#8a5722,color:#fff
    style F fill:#7c5295,stroke:#563a6b,color:#fff
    style H fill:#2d8659,stroke:#1a5c3a,color:#fff
    style I fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Installation

```bash
npm install @memberjunction/credentials
```

## Quick Start

```typescript
import { CredentialEngine, APIKeyCredentialValues } from '@memberjunction/credentials';

// Initialize at application startup
await CredentialEngine.Instance.Config(false, contextUser);

// Retrieve a credential with typed values
const cred = await CredentialEngine.Instance.getCredential<APIKeyCredentialValues>(
  'OpenAI',
  { contextUser, subsystem: 'AIService' }
);

// Use the decrypted values
console.log(cred.values.apiKey); // Strongly typed as string
```

## Credential Resolution

```mermaid
flowchart TD
    A["getCredential(name, options)"] --> B{directValues<br/>provided?}
    B -->|Yes| C["Return direct values<br/>source: request"]
    B -->|No| D{credentialId<br/>provided?}
    D -->|Yes| E["Lookup by ID"]
    D -->|No| F["Lookup by name"]
    E --> G["Parse & return values<br/>source: database"]
    F --> G
    G --> H["Log access to Audit Log"]
    H --> I["Update LastUsedAt"]

    style A fill:#2d6a9f,stroke:#1a4971,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style G fill:#2d8659,stroke:#1a5c3a,color:#fff
    style H fill:#b8762f,stroke:#8a5722,color:#fff
```

Resolution priority:
1. **Direct values** -- `directValues` in options (bypasses database, useful for testing)
2. **By ID** -- `credentialId` in options (specific credential lookup)
3. **By name** -- The `credentialName` parameter (most common usage)

## Pre-defined Credential Types

| Type | Interface | Fields |
|------|-----------|--------|
| API Key | `APIKeyCredentialValues` | `apiKey` |
| API Key with Endpoint | `APIKeyWithEndpointCredentialValues` | `apiKey`, `endpoint` |
| OAuth2 Client Credentials | `OAuth2ClientCredentialValues` | `clientId`, `clientSecret`, `tokenUrl`, `scope` |
| Basic Auth | `BasicAuthCredentialValues` | `username`, `password` |
| Azure Service Principal | `AzureServicePrincipalCredentialValues` | `tenantId`, `clientId`, `clientSecret` |
| AWS IAM | `AWSIAMCredentialValues` | `accessKeyId`, `secretAccessKey`, `region` |
| Database Connection | `DatabaseConnectionCredentialValues` | `host`, `port`, `database`, `username`, `password` |
| Twilio | `TwilioCredentialValues` | `accountSid`, `authToken` |

## Storing Credentials

```typescript
const credential = await CredentialEngine.Instance.storeCredential(
  'API Key',                    // Credential type name
  'OpenAI Production',          // Credential name
  { apiKey: 'sk-...' },         // Values (encrypted on save)
  {
    isDefault: true,
    description: 'Production OpenAI API key',
    expiresAt: new Date('2025-12-31')
  },
  contextUser
);
```

## JSON Schema Validation

The engine validates credential values against the `FieldSchema` defined on each Credential Type using Ajv. Supported constraints include `required`, `const`, `enum`, `format`, `pattern`, `minLength`/`maxLength`, and `minimum`/`maximum`.

Default and const values are auto-populated before validation, and validation errors produce clear, human-readable messages.

## Audit Logging

Every credential operation (Decrypt, Create, Update, Validate) is logged to the Audit Logs entity with:
- User who performed the operation
- Subsystem that requested access
- Success or failure status
- Duration in milliseconds

## Security

- **Encryption at rest** -- The `Values` field uses MJ field-level encryption
- **Audit trail** -- All access logged including failed attempts
- **Access control** -- Entity-level permissions enforced via `contextUser`
- **Expiration support** -- `ExpiresAt` field enforces credential rotation

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | Base engine, metadata, entity system |
| `@memberjunction/global` | Global state management |
| `@memberjunction/core-entities` | Credential entity types |
| `ajv` | JSON Schema validation |
| `ajv-formats` | Format validators (uri, email, date) |

## License

ISC
