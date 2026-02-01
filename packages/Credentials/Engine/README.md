# @memberjunction/credentials

Secure credential management engine for MemberJunction. Provides centralized storage, retrieval, and audit logging of credentials with automatic field-level encryption.

## Features

- **Centralized Credential Storage** - Store all credentials in one place with consistent access patterns
- **Field-Level Encryption** - Credentials are automatically encrypted at rest using MJ's encryption engine
- **Audit Logging** - Every credential access is logged for compliance and security monitoring
- **Type-Safe Values** - Pre-defined interfaces for common credential types (API keys, OAuth, AWS, Azure, etc.)
- **Cached Lookups** - Credential metadata is cached for fast resolution
- **Per-Request Overrides** - Support for test/development credential injection
- **Validation Support** - Optional endpoint-based credential validation
- **API Key Management** - Fast hash-based lookup for API key authentication

## Installation

```bash
npm install @memberjunction/credentials
```

## Quick Start

### 1. Initialize the Engine

```typescript
import { CredentialEngine } from '@memberjunction/credentials';

// Initialize at application startup
await CredentialEngine.Instance.Config(false, contextUser);
```

### 2. Retrieve a Credential

```typescript
import { CredentialEngine, APIKeyCredentialValues } from '@memberjunction/credentials';

// Get a credential with typed values
const cred = await CredentialEngine.Instance.getCredential<APIKeyCredentialValues>(
    'OpenAI',
    {
        contextUser,
        subsystem: 'AIService'
    }
);

// Use the decrypted values
openai.setApiKey(cred.values.apiKey);
```

### 3. Store a New Credential

```typescript
const credential = await CredentialEngine.Instance.storeCredential(
    'API Key',                    // Credential type name
    'OpenAI Production',          // Credential name
    { apiKey: 'sk-...' },        // Values (will be encrypted)
    {
        isDefault: true,
        description: 'Production OpenAI API key'
    },
    contextUser
);
```

## Credential Types

MemberJunction includes pre-configured credential types with JSON schemas:

| Type | Fields | Use Case |
|------|--------|----------|
| API Key | `apiKey` | OpenAI, Anthropic, SendGrid, etc. |
| API Key with Endpoint | `apiKey`, `endpoint` | Azure OpenAI, custom APIs |
| OAuth2 Client Credentials | `clientId`, `clientSecret`, `tokenUrl`, `scope` | OAuth integrations |
| Basic Auth | `username`, `password` | Legacy systems |
| Azure Service Principal | `tenantId`, `clientId`, `clientSecret` | Microsoft Graph, Azure services |
| AWS IAM | `accessKeyId`, `secretAccessKey`, `region` | S3, SES, Lambda, etc. |
| Database Connection | `host`, `port`, `database`, `username`, `password` | External databases |
| Twilio | `accountSid`, `authToken` | SMS/Voice services |

### Type-Safe Value Interfaces

Use the provided interfaces for compile-time type safety:

```typescript
import {
    CredentialEngine,
    APIKeyCredentialValues,
    AWSIAMCredentialValues,
    AzureServicePrincipalCredentialValues
} from '@memberjunction/credentials';

// OpenAI/Anthropic/etc.
const ai = await CredentialEngine.Instance.getCredential<APIKeyCredentialValues>(
    'OpenAI',
    { contextUser }
);
console.log(ai.values.apiKey); // Typed as string

// AWS Services
const aws = await CredentialEngine.Instance.getCredential<AWSIAMCredentialValues>(
    'AWS Production',
    { contextUser }
);
console.log(aws.values.accessKeyId, aws.values.secretAccessKey, aws.values.region);

// Azure Services
const azure = await CredentialEngine.Instance.getCredential<AzureServicePrincipalCredentialValues>(
    'Microsoft Graph',
    { contextUser }
);
console.log(azure.values.tenantId, azure.values.clientId);
```

## Resolution Priority

When you call `getCredential()`, credentials are resolved in this order:

1. **Direct Values** - If `directValues` is provided in options, use those (useful for testing)
2. **By ID** - If `credentialId` is provided, look up that specific credential
3. **By Name** - Look up by the credential name passed to `getCredential()`

```typescript
// Priority 1: Direct values (bypasses database)
const cred = await engine.getCredential('OpenAI', {
    directValues: { apiKey: 'test-key' },
    contextUser
});

// Priority 2: Specific credential by ID
const cred = await engine.getCredential('OpenAI', {
    credentialId: 'specific-credential-uuid',
    contextUser
});

// Priority 3: By name (most common)
const cred = await engine.getCredential('OpenAI', { contextUser });
```

## API Key Lookup

The CredentialEngine caches API keys for fast hash-based lookup, used by authentication systems:

```typescript
// Look up API key by hash (O(1) from cache)
const apiKey = CredentialEngine.Instance.getAPIKeyByHash(keyHash);

if (apiKey && apiKey.Status === 'Active') {
    // Key is valid
    console.log('User ID:', apiKey.UserID);
}
```

This is used internally by `EncryptionEngine.ValidateAPIKey()` for fast API authentication.

## Audit Logging

Every credential access is automatically logged to the `Audit Logs` entity:

```typescript
const cred = await engine.getCredential('OpenAI', {
    contextUser,
    subsystem: 'AIService'  // Logged for tracking
});
```

Audit log entry includes:
- User who accessed the credential
- Operation type (Decrypt, Create, Update, Validate)
- Subsystem that requested access
- Success/failure status
- Duration in milliseconds

## JSON Schema Validation

The CredentialEngine uses [Ajv JSON Schema validator](https://ajv.js.org/) to validate credential values against the `FieldSchema` defined in each Credential Type. This ensures data integrity and security by enforcing constraints at save time.

### Supported Constraints

All JSON Schema Draft 7 validation keywords are supported:

| Constraint | Description | Example Use Case |
|-----------|-------------|------------------|
| `required` | Mandatory fields | API keys must include `apiKey` field |
| `const` | Fixed immutable values | OAuth token URLs that must never change |
| `enum` | Limited set of allowed values | Region selection, account types |
| `format` | Value format validation | `uri`, `email`, `date`, `uuid` |
| `pattern` | Regex pattern matching | API key format validation |
| `minLength`/`maxLength` | String length bounds | Password length requirements |
| `minimum`/`maximum` | Numeric range validation | Port numbers, timeout values |
| `default` | Auto-populated values | Default regions, endpoints |

### Schema Validation Flow

1. **Create/Update**: When `storeCredential()` or `updateCredential()` is called
2. **Apply Defaults**: Fields with `default` or `const` values are auto-populated
3. **Validate**: The complete credential values are validated against the schema
4. **Throw on Error**: If validation fails, a clear error message is thrown listing all violations

```typescript
// This credential type schema
{
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "pattern": "^sk-[a-zA-Z0-9]{32}$",
      "description": "OpenAI API key"
    },
    "endpoint": {
      "type": "string",
      "format": "uri",
      "default": "https://api.openai.com/v1"
    }
  },
  "required": ["apiKey"]
}

// Will reject this (invalid pattern)
await engine.storeCredential('OpenAI', 'Production', {
    apiKey: 'invalid-format'  // ❌ Fails pattern validation
}, {}, contextUser);
// Error: Field "apiKey" does not match required pattern

// Will reject this (invalid URI format)
await engine.storeCredential('OpenAI', 'Production', {
    apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456',
    endpoint: 'not-a-url'  // ❌ Fails format validation
}, {}, contextUser);
// Error: Field "endpoint" must be a valid uri

// Will accept and auto-populate default
await engine.storeCredential('OpenAI', 'Production', {
    apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456'
    // endpoint auto-populated with default: https://api.openai.com/v1
}, {}, contextUser);
// ✅ Success
```

### Error Messages

Validation errors are formatted for clarity:

- **Required**: `Missing required field: apiKey`
- **Const**: `Field "tokenUrl" must be "https://api.box.com/oauth2/token"`
- **Enum**: `Field "region" must be one of: us-east-1, us-west-2, eu-west-1`
- **Format**: `Field "endpoint" must be a valid uri`
- **Pattern**: `Field "apiKey" does not match required pattern`
- **Length**: `Field "password" must be at least 8 characters`
- **Range**: `Field "port" must be at least 1024`

### Const Fields for Security

Use `const` in schemas to enforce fixed values that must never change:

```json
{
  "tokenUrl": {
    "type": "string",
    "const": "https://api.box.com/oauth2/token",
    "description": "Box.com OAuth token endpoint"
  }
}
```

This prevents:
- Users from accidentally changing critical endpoints
- Malicious redirection of credentials to external servers
- Configuration drift across environments

Const values are:
- **Auto-populated** when creating credentials (users don't need to enter them)
- **Immutable** - validation rejects any attempt to change them
- **Visible** in UI as read-only fields

### Format Validation

The `format` keyword validates common data types:

- **uri** / **url** - Valid HTTP/HTTPS URLs
- **email** - Valid email addresses
- **date** - ISO 8601 dates
- **date-time** - ISO 8601 timestamps
- **uuid** - RFC 4122 UUIDs
- **ipv4** / **ipv6** - IP addresses
- **hostname** - Valid DNS hostnames

### Default Values

Use `default` to pre-populate fields with sensible values:

```json
{
  "region": {
    "type": "string",
    "default": "us-east-1",
    "enum": ["us-east-1", "us-west-2", "eu-west-1"]
  }
}
```

Users can override defaults, but they provide good starting points and reduce configuration errors.

## Credential Validation

Validate credentials against provider endpoints:

```typescript
const result = await engine.validateCredential(credentialId, contextUser);

if (!result.isValid) {
    console.error('Credential validation failed:', result.errors);
}

// Result structure
interface CredentialValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    validatedAt: Date;
}
```

## Updating Credentials

Update credential values (automatically re-encrypted):

```typescript
await engine.updateCredential(
    credentialId,
    { apiKey: 'new-sk-...' },  // New values
    contextUser
);
```

## Cached Data Access

Access cached credential metadata without database calls:

```typescript
// All credentials
const credentials = engine.Credentials;

// All credential types
const types = engine.CredentialTypes;

// All credential categories
const categories = engine.CredentialCategories;

// Lookup helpers
const type = engine.getCredentialTypeByName('API Key');
const defaultCred = engine.getDefaultCredentialForType('API Key');
const credById = engine.getCredentialById('uuid-here');
const credByName = engine.getCredentialByName('API Key', 'OpenAI');
```

## Database Schema

### MJ: Credential Types

Defines the shape of credential values:

| Column | Description |
|--------|-------------|
| `Name` | Type name (e.g., 'API Key') |
| `Description` | Human-readable description |
| `FieldSchema` | JSON Schema for validation |
| `ValidationEndpoint` | Optional URL for validation |

### MJ: Credentials

Stores credential instances:

| Column | Description |
|--------|-------------|
| `Name` | Credential name (e.g., 'OpenAI Production') |
| `CredentialTypeID` | Foreign key to type |
| `Values` | Encrypted JSON blob |
| `IsDefault` | Default for this type |
| `IsActive` | Active status |
| `ExpiresAt` | Optional expiration |
| `LastUsedAt` | Updated on each access |
| `LastValidatedAt` | Updated on validation |

### MJ: Credential Categories

Optional organization:

| Column | Description |
|--------|-------------|
| `Name` | Category name |
| `Description` | Description |
| `ParentCategoryID` | For hierarchy |

## Security Considerations

1. **Encryption at Rest**
   - The `Values` field uses MJ field-level encryption
   - Only decrypted when explicitly accessed via `getCredential()`

2. **Audit Trail**
   - Every access is logged with user, timestamp, and subsystem
   - Failed access attempts are also logged

3. **Access Control**
   - Credentials inherit MJ's entity-level permissions
   - Use `contextUser` to enforce authorization

4. **Expiration**
   - Set `ExpiresAt` on credentials to enforce rotation
   - Check `expiresAt` in the resolved credential for warnings

5. **Per-Request Override**
   - Use `directValues` for testing without database access
   - Values are marked with `source: 'request'` for audit clarity

## Integration with EncryptionEngine

The Credentials package works alongside the Encryption package:

- **CredentialEngine** - Manages credential storage and retrieval
- **EncryptionEngine** - Handles API key generation, validation, and field encryption

API key authentication flow:
1. `EncryptionEngine.ValidateAPIKey()` hashes the incoming key
2. `CredentialEngine.getAPIKeyByHash()` looks up the cached key entity
3. Validation checks status, expiration, and user account
4. User context is returned for authorized operations

## License

ISC
