# Quickstart: MCP OAuth with Dynamic Client Registration

This guide helps developers implement and use OAuth 2.1 authentication for MCP server connections in MemberJunction.

## Overview

MCP OAuth enables transparent OAuth 2.1 authentication for MCP (Model Context Protocol) server connections. When connecting to an OAuth-protected MCP server, the system automatically:

1. Discovers the authorization server capabilities (RFC 8414)
2. Registers a client dynamically if DCR is supported (RFC 7591)
3. Initiates the authorization code flow with PKCE
4. Stores tokens securely via CredentialEngine
5. Refreshes tokens automatically before expiration

## Prerequisites

- MemberJunction 2.x or later
- MJAPI accessible via public URL (for OAuth callbacks)
- Node.js 18+

## Configuration

### 1. Set the Public URL

MJAPI needs a publicly accessible URL for OAuth callbacks. Set this via environment variable:

```bash
# Using ngrok for local development
ngrok http 4000
# Output: https://abc123.ngrok.io

export MJAPI_PUBLIC_URL=https://abc123.ngrok.io
```

Or in `mj.config.cjs`:
```javascript
module.exports = {
  publicUrl: 'https://your-public-url.com',
};
```

### 2. Configure an MCP Server with OAuth

When creating or editing an MCP Server, set the OAuth configuration:

```typescript
import { Metadata } from '@memberjunction/core';
import { MCPServerEntity } from '@memberjunction/core-entities';

const md = new Metadata();
const server = await md.GetEntityObject<MCPServerEntity>('MCP Servers', contextUser);

server.Name = 'My OAuth MCP Server';
server.ServerURL = 'https://mcp.example.com';
server.TransportType = 'StreamableHTTP';
server.DefaultAuthType = 'OAuth2';  // Enable OAuth

// OAuth Configuration
server.OAuthIssuerURL = 'https://auth.example.com';  // Authorization server
server.OAuthScopes = 'read write';                   // Required scopes
server.OAuthMetadataCacheTTLMinutes = 1440;         // Cache metadata for 24 hours

// Optional: Pre-configured client (if DCR not supported)
// server.OAuthClientID = 'your-client-id';
// server.OAuthClientSecretEncrypted = 'your-client-secret';

await server.Save();
```

## Usage

### Connecting to an OAuth-Protected Server

The connection flow automatically handles OAuth:

```typescript
import { MCPClientManager } from '@memberjunction/ai-mcp-client';

const manager = MCPClientManager.Instance;
await manager.initialize(contextUser);

try {
  // This will automatically:
  // 1. Check for existing valid tokens
  // 2. Refresh if needed
  // 3. Return authorization URL if user consent required
  const connection = await manager.connect(connectionId, { contextUser });

  // Connection succeeded with valid tokens
  console.log('Connected to:', connection.serverConfig.Name);

} catch (error) {
  if (error.code === 'OAUTH_AUTHORIZATION_REQUIRED') {
    // User needs to authorize - open the URL in browser
    console.log('Please authorize:', error.authorizationUrl);
    console.log('State:', error.stateParameter);

    // Poll for completion or use subscription
    // ...
  }
}
```

### Handling Authorization in UI (Angular)

```typescript
import { MCPClientManager } from '@memberjunction/ai-mcp-client';

@Component({...})
export class MCPConnectionComponent {
  async ConnectWithOAuth(connectionId: string): Promise<void> {
    const manager = MCPClientManager.Instance;

    try {
      const connection = await manager.connect(connectionId, {
        contextUser: this.contextUser
      });
      this.OnConnectionSuccess(connection);

    } catch (error) {
      if (error.code === 'OAUTH_AUTHORIZATION_REQUIRED') {
        // Open authorization URL in new window
        const authWindow = window.open(error.authorizationUrl, '_blank');

        // Poll for completion
        await this.PollForAuthorizationCompletion(error.stateParameter);

        // Retry connection
        const connection = await manager.connect(connectionId, {
          contextUser: this.contextUser
        });
        this.OnConnectionSuccess(connection);
      } else {
        this.OnConnectionError(error);
      }
    }
  }

  private async PollForAuthorizationCompletion(stateParameter: string): Promise<void> {
    const maxAttempts = 60;  // 5 minutes at 5-second intervals

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.graphqlService.query('getMCPOAuthStatus', {
        input: { stateParameter }
      });

      if (status.status === 'COMPLETED') {
        return;
      } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
        throw new Error(status.authErrorDescription || 'Authorization failed');
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Authorization timed out');
  }
}
```

### GraphQL Operations

#### Initiate OAuth Flow
```graphql
mutation InitiateOAuth($input: InitiateMCPOAuthInput!) {
  initiateMCPOAuth(input: $input) {
    success
    errorMessage
    authorizationUrl
    stateParameter
    expiresAt
    usedDynamicRegistration
  }
}
```

#### Check OAuth Status
```graphql
query GetOAuthStatus($input: GetMCPOAuthStatusInput!) {
  getMCPOAuthStatus(input: $input) {
    success
    status
    connectionId
    completedAt
    authErrorCode
    authErrorDescription
    isRetryable
  }
}
```

#### Get Connection OAuth Status
```graphql
query GetConnectionOAuthStatus($connectionId: ID!) {
  getMCPOAuthConnectionStatus(connectionId: $connectionId) {
    connectionId
    isOAuthEnabled
    hasValidTokens
    isAccessTokenExpired
    tokenExpiresAt
    hasRefreshToken
    requiresReauthorization
    reauthorizationReason
    grantedScopes
  }
}
```

#### Revoke OAuth Credentials
```graphql
mutation RevokeOAuth($input: RevokeMCPOAuthInput!) {
  revokeMCPOAuth(input: $input) {
    success
    errorMessage
    connectionId
  }
}
```

### REST Endpoints

The OAuth callback endpoint is automatically registered at `/api/v1/oauth/callback`. You typically don't interact with this directly - it's called by the authorization server.

For status checking, you can also use REST:
```bash
# Check authorization status
curl -H "Authorization: Bearer $TOKEN" \
  "https://your-mj-api.com/api/v1/oauth/status/your-state-parameter"
```

## Events

MCPClientManager emits OAuth-related events:

```typescript
const manager = MCPClientManager.Instance;

manager.addEventListener('authorizationRequired', (event) => {
  console.log('User needs to authorize:', event.data.authorizationUrl);
});

manager.addEventListener('authorizationCompleted', (event) => {
  console.log('Authorization completed for:', event.connectionId);
});

manager.addEventListener('tokenRefreshed', (event) => {
  console.log('Tokens refreshed for:', event.connectionId);
});

manager.addEventListener('tokenRefreshFailed', (event) => {
  console.log('Token refresh failed:', event.data.error);
  if (event.data.requiresReauthorization) {
    // Prompt user to re-authorize
  }
});
```

## Troubleshooting

### "Authorization server metadata not found"

The authorization server doesn't support RFC 8414 discovery. Check:
1. The `OAuthIssuerURL` is correct
2. Try appending `/.well-known/oauth-authorization-server` manually
3. Check if the server uses OIDC discovery at `/.well-known/openid-configuration`

### "Dynamic client registration failed"

The authorization server doesn't support DCR. You need to:
1. Register a client manually with the authorization server
2. Set `OAuthClientID` and `OAuthClientSecretEncrypted` on the MCP Server

### "Callback URL not accessible"

Ensure:
1. `MJAPI_PUBLIC_URL` is set correctly
2. The callback URL is accessible from the internet
3. For local development, use ngrok or similar tunneling

### "Token refresh failed"

This can happen when:
1. Refresh token expired (user needs to re-authorize)
2. Access was revoked on the authorization server
3. Network issues (retry may succeed)

Check the error code:
- `invalid_grant`: Re-authorization required
- `server_error`: Retry later
- Network timeout: Check connectivity

## Security Considerations

1. **Token Storage**: OAuth tokens are stored encrypted via CredentialEngine
2. **PKCE**: All flows use PKCE with S256 challenge method
3. **State Validation**: State parameter prevents CSRF attacks
4. **Callback Security**: Only the MJAPI callback URL is registered with auth servers
5. **Audit Logging**: All OAuth operations are logged

## Next Steps

- See [data-model.md](./data-model.md) for entity details
- See [research.md](./research.md) for RFC compliance details
- See [contracts/](./contracts/) for full API specifications
