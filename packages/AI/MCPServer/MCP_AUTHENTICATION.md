# MCP Server Authentication Guide

## Overview

The MemberJunction MCP Server now supports secure API key-based authentication. This authentication system ensures that only authorized users can access MCP tools and provides fine-grained permission control through scope-based authorization.

## Key Features

- **SHA-256 Hashed Keys**: API keys are never stored in plaintext - only SHA-256 hashes
- **Scope-Based Permissions**: Control access with granular scopes (entities:read, agents:execute, etc.)
- **Usage Logging**: All API key usage is automatically logged to the database
- **Expiration Support**: Keys can have optional expiration dates
- **Key Revocation**: Instantly revoke compromised keys
- **CLI Management**: Easy-to-use command-line tool for key management

## Database Schema

The authentication system uses 4 new tables:

### APIScope
Defines reusable permission categories for API keys.

**Default Scopes:**
- `entities:read` - Read access to entity data via Get and RunView operations
- `entities:write` - Write access to entity data via Create, Update, and Delete operations
- `agents:discover` - Permission to list and discover available AI agents
- `agents:execute` - Permission to execute AI agents and view run status
- `admin:*` - Full administrative access to all MCP server operations

### APIKey
Stores API key metadata and SHA-256 hashes.

**Fields:**
- `Hash` (NVARCHAR(64)) - SHA-256 hash of the API key
- `UserID` (UNIQUEIDENTIFIER) - The user this key belongs to
- `Status` (NVARCHAR(20)) - Active or Revoked
- `ExpiresAt` (DATETIMEOFFSET) - Optional expiration date
- `LastUsedAt` (DATETIMEOFFSET) - Last time key was used
- `CreatedByUserID` (UNIQUEIDENTIFIER) - Who created this key

### APIKeyScope
Associates API keys with permission scopes (many-to-many).

### APIKeyUsageLog
Immutable audit log of all API key usage with timestamps, operations, response times, and errors.

## Configuration

Add the following to your `mj.config.cjs`:

```javascript
module.exports = {
  // ... other config
  mcpServerSettings: {
    enableMCPServer: true,
    requireAuthentication: true,  // Enable API key authentication (default: true)
    allowAnonymousForStdio: false, // Allow unauthenticated stdio transport (default: false)
    port: 3100,
    transport: 'sse',
    // ... tool configurations
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireAuthentication` | boolean | `true` | Enable API key authentication |
| `allowAnonymousForStdio` | boolean | `false` | Allow unauthenticated access for stdio transport |

**Security Note**: When `requireAuthentication` is `false`, the server falls back to the first available user and grants full `admin:*` permissions. This should only be used in development environments.

## API Key Format

API keys follow this format:

```
mj_sk_[64 hexadecimal characters]
```

Example:
```
mj_sk_a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
```

- **Prefix**: `mj_sk_` identifies MemberJunction secret keys
- **Length**: 32 bytes (256 bits) of cryptographic randomness
- **Encoding**: Hexadecimal (64 characters)

## CLI Tool Usage

The `mj-api-keys` command-line tool provides easy API key management.

### Generate a New API Key

```bash
# Basic usage
mj-api-keys generate --user user@example.com --scopes "entities:read,agents:execute"

# With friendly name
mj-api-keys generate \
  --user user@example.com \
  --scopes "entities:read,entities:write" \
  --name "Development Key"

# With expiration (90 days)
mj-api-keys generate \
  --user user@example.com \
  --scopes "admin:*" \
  --name "Admin Key" \
  --expires 90
```

**Options:**
- `-u, --user` (required) - User email address
- `-s, --scopes` (required) - Comma-separated list of scopes
- `-n, --name` (optional) - Friendly name for the key
- `-e, --expires` (optional) - Expiration in days (0 = never expires, default: 0)

**Output Example:**
```
🎉 API Key Generated Successfully!

======================================================================
⚠️  IMPORTANT: Save this key now - it will never be shown again!
======================================================================

API Key:  mj_sk_a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
Key ID:   123e4567-e89b-12d3-a456-426614174000

======================================================================

Usage:
  Add to Authorization header:
    Authorization: Bearer mj_sk_a1b2c3d4e5f67890abcdef1234567890...
```

### List Available Scopes

```bash
mj-api-keys list-scopes
```

**Output:**
```
Available API Key Scopes:

Admin:
  • admin:*                  Full administrative access to all MCP server operations.

Agents:
  • agents:discover          Permission to list and discover available AI agents.
  • agents:execute           Permission to execute AI agents and view run status.

Entities:
  • entities:read            Read access to entity data via Get and RunView operations.
  • entities:write           Write access to entity data via Create, Update, and Delete operations.
```

### List API Keys for a User

```bash
mj-api-keys list --user user@example.com
```

**Output:**
```
API keys for: user@example.com (John Doe)

Found 2 API key(s):

✅ Development Key
   ID:        123e4567-e89b-12d3-a456-426614174000
   Status:    Active
   Created:   2026-01-15T10:30:00.000Z
   Expires:   Never
   Last Used: 2026-01-15T14:22:15.000Z

❌ Old Key
   ID:        987f6543-e21a-43c1-b789-123456789abc
   Status:    Revoked
   Created:   2025-12-01T08:15:00.000Z
   Expires:   Never
   Last Used: 2025-12-20T16:45:30.000Z
```

### Revoke an API Key

```bash
mj-api-keys revoke --key-id 123e4567-e89b-12d3-a456-426614174000
```

**Output:**
```
Revoking API key: 123e4567-e89b-12d3-a456-426614174000...

✅ API key revoked successfully
```

## Using API Keys

### HTTP SSE Transport

Add the API key to the `Authorization` header:

```bash
curl http://localhost:3100/mcp \
  -H "Authorization: Bearer mj_sk_a1b2c3d4e5f6..."
```

### Stdio Transport

For stdio transport (Claude Desktop integration):
- If `allowAnonymousForStdio: true`, authentication is not required
- If `requireAuthentication: true` and `allowAnonymousForStdio: false`, you must provide authentication through the client configuration

## Security Best Practices

### Key Storage
- **Never commit keys to version control**
- Store keys in environment variables or secure vaults
- Use `.env` files for local development (ensure they're in `.gitignore`)

### Key Rotation
- Rotate keys periodically (e.g., every 90 days)
- Use the `--expires` option when generating keys
- Revoke old keys immediately after rotation

### Scope Assignment
- Follow the **principle of least privilege**
- Only grant scopes that are actually needed
- Use specific scopes (`entities:read`) over wildcards (`admin:*`)
- Reserve `admin:*` for administrative users only

### Monitoring
- Regularly review the `APIKeyUsageLog` table
- Monitor for:
  - Failed authentication attempts
  - Unusual usage patterns
  - Keys that haven't been used in a long time
  - High error rates for specific keys

### Key Compromise
If a key is compromised:
1. Revoke it immediately: `mj-api-keys revoke --key-id <id>`
2. Generate a new key with fresh credentials
3. Review usage logs for suspicious activity
4. Update all clients with the new key

## Architecture

### Authentication Flow

1. **Client Request**: Client sends request with `Authorization` header
2. **Key Extraction**: `AuthMiddleware.ExtractAPIKey()` parses header
3. **Hash Computation**: SHA-256 hash computed from plaintext key
4. **Database Lookup**: Hash matched against `APIKey` table
5. **Validation**: Check status (Active), expiration date
6. **User Load**: Load full `UserInfo` from `Users` table
7. **Scope Load**: Load associated scopes from `APIKeyScope` join
8. **Context Creation**: `AuthContext` created with user and scopes
9. **Tool Execution**: Request proceeds with authenticated context
10. **Usage Logging**: Operation logged to `APIKeyUsageLog`

### Key Components

#### APIKeyService ([APIKeyService.ts](src/APIKeyService.ts))
Core service for key operations:
- `GenerateAPIKey()` - Create new keys with SHA-256 hashing
- `ValidateAPIKey()` - Validate and authenticate keys
- `RevokeAPIKey()` - Revoke compromised keys
- `LogAPIKeyUsage()` - Log all API operations
- `HasScope()` - Check scope permissions

#### AuthMiddleware ([AuthMiddleware.ts](src/AuthMiddleware.ts))
Request authentication middleware:
- `ExtractAPIKey()` - Parse Authorization header
- `Authenticate()` - Full authentication workflow
- `HasScope()` - Permission checking
- Error response generation

#### Server Integration ([Server.ts](src/Server.ts))
- Global authentication context management
- Per-tool usage logging wrapper
- Backward compatibility for stdio transport
- Configuration-based auth enable/disable

## Usage Logging

All API key operations are automatically logged to the `APIKeyUsageLog` table.

### Logged Information

- **APIKeyID** - Which key was used
- **Endpoint** - API endpoint called (if applicable)
- **OperationName** - MCP tool name
- **HTTPMethod** - HTTP method (if applicable)
- **StatusCode** - Response status (200, 401, 500, etc.)
- **ResponseTimeMS** - Response time in milliseconds
- **ClientIP** - Client IP address (if available)
- **UserAgent** - Client user agent (if available)
- **ErrorMessage** - Error details (if failed)
- **__mj_CreatedAt** - Timestamp

### Querying Usage Logs

```sql
-- Most frequently used operations
SELECT OperationName, COUNT(*) as CallCount
FROM [__mj].APIKeyUsageLog
GROUP BY OperationName
ORDER BY CallCount DESC;

-- Failed requests by key
SELECT k.Name, COUNT(*) as FailureCount
FROM [__mj].APIKeyUsageLog log
JOIN [__mj].APIKey k ON log.APIKeyID = k.ID
WHERE log.StatusCode >= 400
GROUP BY k.Name
ORDER BY FailureCount DESC;

-- Average response times by operation
SELECT OperationName, AVG(ResponseTimeMS) as AvgResponseTime
FROM [__mj].APIKeyUsageLog
WHERE StatusCode = 200
GROUP BY OperationName
ORDER BY AvgResponseTime DESC;
```

## Troubleshooting

### Common Errors

#### "Missing or invalid Authorization header"
- Ensure the `Authorization` header is included
- Format: `Authorization: Bearer mj_sk_...`
- Check for typos in the key

#### "Invalid or inactive API key"
- Key may have been revoked - check with `mj-api-keys list`
- Key hash might not match - ensure you're using the complete key
- Status must be "Active" in the database

#### "API key has expired"
- Generate a new key with `mj-api-keys generate`
- Use `--expires 0` for keys that never expire

#### "Insufficient permissions. Required scope: X"
- The key doesn't have the required scope
- Generate a new key with proper scopes
- Or add the scope to the existing key in the database

### Debug Mode

Enable verbose logging to troubleshoot authentication issues:

```bash
# Set environment variable
export MCP_DEBUG=1

# Start server
npm run start
```

## Migration Guide

### Existing Deployments

If you're upgrading from an unauthenticated version:

1. **Run Database Migration**
   ```bash
   # Apply migration SQL
   sqlcmd -S localhost -d MJ_Local -i MCP_Auth_Migration_Complete.sql
   ```

2. **Run CodeGen**
   ```bash
   # Generate entity classes
   npm run codegen
   ```

3. **Generate Admin Key**
   ```bash
   mj-api-keys generate \
     --user admin@example.com \
     --scopes "admin:*" \
     --name "Initial Admin Key"
   ```

4. **Update Configuration**
   ```javascript
   // mj.config.cjs
   mcpServerSettings: {
     requireAuthentication: true
   }
   ```

5. **Update Clients**
   - Add the API key to all client configurations
   - Test authentication with a simple call

6. **Disable Backward Compatibility**
   - Remove `allowAnonymousForStdio` once all clients are updated

## Future Enhancements

Potential future additions:
- OAuth 2.0 / OpenID Connect integration
- Rate limiting per key
- IP allowlisting per key
- Webhook notifications for suspicious activity
- GraphQL integration for key management UI
- API key templates for common use cases

## Support

For issues, questions, or feature requests:
- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.com

## License

ISC License - Copyright (c) MemberJunction.com
