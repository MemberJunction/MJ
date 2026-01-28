# @memberjunction/api-keys

Core API key management and scope-based authorization for MemberJunction. This package provides the foundation for API key validation, scope evaluation, and authorization across all MemberJunction server implementations (MJAPI, MCP Server, A2A Server).

## Overview

The API Keys package implements a comprehensive authorization system with:

- **API Key Validation**: Secure key format validation and hash-based lookup
- **Scope-Based Authorization**: Fine-grained permission control using hierarchical scopes
- **Two-Level Authorization**: Application ceiling + API key scope evaluation
- **Pattern Matching**: Wildcard support for flexible resource-level permissions
- **Usage Logging**: Automatic tracking of API key usage

## Installation

```bash
npm install @memberjunction/api-keys
```

## Core Concepts

### API Key Authentication

API keys use the format `mj_sk_[64 hex characters]` (e.g., `mj_sk_abc123...`). Keys are:
- Generated with cryptographic randomness
- Stored as SHA-256 hashes (never in plaintext)
- Associated with a MemberJunction user account
- Optionally time-limited with expiration dates

### Scope-Based Authorization

Scopes control what operations an API key can perform. The system uses a two-level evaluation:

1. **Application Ceiling**: Defines the maximum scopes an application allows
2. **API Key Scopes**: Defines what scopes are assigned to a specific key

Authorization succeeds only if BOTH levels permit the operation.

### Scope Hierarchy

Scopes follow a hierarchical naming convention:

```
category:action
```

Common scopes include:

| Scope | Description |
|-------|-------------|
| `full_access` | Bypass all scope checks ("god mode") |
| `entity:read` | Read entity records |
| `entity:create` | Create new records |
| `entity:update` | Update existing records |
| `entity:delete` | Delete records |
| `view:run` | Execute RunView queries |
| `agent:execute` | Execute AI agents |
| `agent:monitor` | Check agent run status |
| `agent:cancel` | Cancel running agents |
| `action:execute` | Execute MJ Actions |
| `prompt:execute` | Execute AI prompts |
| `query:run` | Execute SQL queries |
| `metadata:entities:read` | Read entity metadata |
| `metadata:agents:read` | Read agent metadata |
| `metadata:actions:read` | Read action metadata |
| `communication:send` | Send emails/messages |

## Usage

### APIKeyEngine

The main class for authorization operations.

```typescript
import { GetAPIKeyEngine } from '@memberjunction/api-keys';

// Get the singleton instance
const apiKeyEngine = GetAPIKeyEngine();

// Authorize an operation
const result = await apiKeyEngine.Authorize({
  apiKeyHash: 'sha256-hash-of-api-key',
  applicationName: 'MCP Server',
  scope: 'entity:read',
  resource: 'Users'
});

if (result.allowed) {
  // Operation is permitted
  console.log('Access granted');
} else {
  // Operation is denied
  console.log('Access denied:', result.error);
  console.log('Allowed scopes:', result.allowedScopes);
  console.log('Allowed resources:', result.allowedResources);
}
```

### Configuration

The engine behavior is configured via the `defaultBehaviorNoScopes` property:

```typescript
// Default: 'deny' - API keys with no scopes have no permissions
apiKeyEngine.defaultBehaviorNoScopes = 'deny';

// Alternative: 'allow' - API keys with no scopes have full access (NOT recommended)
apiKeyEngine.defaultBehaviorNoScopes = 'allow';
```

**Important**: The default is `deny`, meaning API keys without any assigned scopes will have no permissions.

### Creating API Keys

Use the `CreateAPIKey` method to generate new API keys:

```typescript
const result = await apiKeyEngine.CreateAPIKey({
  UserId: 'user-guid',
  Label: 'My Integration',
  Description: 'Used for CI/CD pipeline',
  ExpiresAt: new Date('2025-12-31') // Optional
}, contextUser);

if (result.Success) {
  // IMPORTANT: Save this key immediately - it cannot be recovered!
  console.log('Raw API Key:', result.RawKey);
  console.log('API Key ID:', result.APIKeyId);
}
```

### Revoking API Keys

```typescript
const success = await apiKeyEngine.RevokeAPIKey(apiKeyId, contextUser);
```

## Pattern Matching

The `PatternMatcher` class supports wildcard patterns for resource-level permissions:

| Pattern | Description | Example Matches |
|---------|-------------|-----------------|
| `*` | Match all | Everything |
| `Users` | Exact match | Only "Users" |
| `User*` | Prefix match | "Users", "UserRoles", "UserPermissions" |
| `*Entity` | Suffix match | "UserEntity", "CompanyEntity" |
| `*User*` | Contains match | "UserAdmin", "AdminUser", "Users" |
| `A,B,C` | Multiple values | "A", "B", or "C" |

```typescript
import { PatternMatcher } from '@memberjunction/api-keys';

PatternMatcher.matches('Users', '*');           // true
PatternMatcher.matches('Users', 'Users');       // true
PatternMatcher.matches('Users', 'User*');       // true
PatternMatcher.matches('Users', 'Admin*');      // false
PatternMatcher.matches('Users', 'Users,Roles'); // true
```

## Architecture

### Components

1. **APIKeyEngine**: Main authorization engine
2. **ScopeEvaluator**: Evaluates scope permissions against patterns
3. **PatternMatcher**: Handles wildcard pattern matching
4. **UsageLogger**: Logs API key usage (optional)

### Authorization Flow

```
Request arrives with API key
        |
        v
Extract API key hash
        |
        v
Look up key scopes from database
        |
        v
Look up application ceiling scopes
        |
        v
Evaluate: scope ∩ ceiling → effective permissions
        |
        v
Check if requested scope+resource is in effective permissions
        |
        v
Return allowed=true or allowed=false with details
```

### Error Messages

Authorization failures include detailed information:

```typescript
{
  allowed: false,
  error: "API key is missing required scope 'entity:create' on resource 'Users'. Allowed scopes: entity:read. Allowed resources: *",
  allowedScopes: ['entity:read'],
  allowedResources: ['*']
}
```

## Database Schema

The package uses these MemberJunction entities:

- **API Keys** (`__mj.APIKey`): Stores API key hashes and metadata
- **MJ: API Scopes** (`__mj.APIScope`): Defines available scope permissions
- **MJ: API Key Scopes** (`__mj.APIKeyScope`): Links keys to scopes
- **MJ: API Applications** (`__mj.APIApplication`): Defines applications (MCP, A2A, etc.)
- **MJ: API Application Scopes** (`__mj.APIApplicationScope`): Defines application ceilings

## Testing

The package includes comprehensive unit tests:

```bash
npm test
```

Test files:
- `APIKeyEngine.spec.ts` - Authorization engine tests
- `ScopeEvaluator.spec.ts` - Scope evaluation tests
- `PatternMatcher.spec.ts` - Pattern matching tests

## Security Best Practices

1. **Default Deny**: API keys without scopes have no permissions
2. **Minimal Scopes**: Assign only the scopes needed for the use case
3. **Resource Restrictions**: Use specific resource patterns instead of `*` when possible
4. **Expiration**: Set expiration dates for temporary keys
5. **Monitoring**: Review usage logs for suspicious activity
6. **Rotation**: Regularly rotate keys, especially in production

## Integration

This package is used by:

- **@memberjunction/server** (MJAPI GraphQL server)
- **@memberjunction/ai-mcp-server** (MCP Server)
- **@memberjunction/a2aserver** (A2A Server)

Each server implements scope checks at their respective endpoint/tool/operation handlers.

## License

ISC
