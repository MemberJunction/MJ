# Quickstart: MCP Server OAuth Authentication

This guide explains how to enable OAuth authentication for the MemberJunction MCP Server.

## Prerequisites

1. **MemberJunction MCP Server** configured and running
2. **OAuth provider** configured for MJExplorer (Auth0, Azure AD, Okta, Cognito, or Google)
3. **User records** in MemberJunction for users who will authenticate

## Configuration

OAuth settings are added to the `mcpServerSettings` section of your `mj.config.cjs` file.

### Step 1: Verify Auth Providers

Ensure your `authProviders` section is configured. This is typically already set up for MJExplorer:

```javascript
// mj.config.cjs
module.exports = {
  authProviders: [
    {
      name: 'azure-ad',
      type: 'msal',
      clientId: 'your-client-id',
      tenantId: 'your-tenant-id',
      issuer: 'https://login.microsoftonline.com/your-tenant-id/v2.0',
      audience: 'api://your-app-id',
      jwksUri: 'https://login.microsoftonline.com/your-tenant-id/discovery/v2.0/keys'
    }
  ],
  // ... rest of config
};
```

### Step 2: Add MCP Server Auth Settings

Add the `auth` section to `mcpServerSettings`:

```javascript
// mj.config.cjs
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    auth: {
      mode: 'both',  // or 'oauth', 'apiKey', 'none'
      resourceIdentifier: 'https://mcp.yourcompany.com',
      // Proxy JWT signing (required for OAuth mode)
      jwtSigningSecret: process.env.MCP_JWT_SECRET,  // 32+ bytes, base64 encoded
      jwtExpiresIn: '1h',  // optional, default '1h'
    },
    // ... tool configurations
  },
  authProviders: [/* ... */]
};
```

### Step 2b: Generate JWT Signing Secret

Generate a secure signing secret for proxy-issued JWTs:

```bash
# Generate a 32-byte random secret, base64 encoded
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add to your environment:
```bash
export MCP_JWT_SECRET="your-generated-secret-here"
```

### Step 3: Configure Your OAuth Provider

Register the MCP Server as an authorized resource/API in your identity provider:

#### Azure AD (MSAL)

1. Go to Azure Portal > Azure Active Directory > App registrations
2. Select your MJExplorer app (or create a new one)
3. Under "Expose an API", add the MCP Server URL as an Application ID URI
4. Under "API permissions", ensure required scopes are configured

#### Auth0

1. Go to Auth0 Dashboard > APIs
2. Create a new API or use the existing MJExplorer API
3. Set the Identifier to match your `resourceIdentifier`
4. Configure scopes: `openid`, `profile`, `email`

#### Okta

1. Go to Okta Admin Console > Security > API
2. Add a new Authorization Server or use default
3. Add the MCP Server as a trusted resource

#### Cognito

1. Go to AWS Console > Cognito > User Pools
2. Select your user pool
3. Under "App integration", configure an app client
4. Set callback URL to include `{mcp-server}/oauth/callback`

#### Google

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create or select OAuth 2.0 Client ID
3. Add authorized redirect URI: `{mcp-server}/oauth/callback`

## Multi-Provider Configuration

The OAuth proxy supports all 5 MJServer auth providers. Each provider uses OIDC Discovery to automatically find authorization and token endpoints.

### Example: Multiple Providers

```javascript
// mj.config.cjs
module.exports = {
  authProviders: [
    {
      name: 'corporate',
      type: 'msal',
      clientId: 'azure-client-id',
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: 'your-tenant-id',
      issuer: 'https://login.microsoftonline.com/your-tenant-id/v2.0',
      audience: 'api://mcp-server',
      jwksUri: 'https://login.microsoftonline.com/your-tenant-id/discovery/v2.0/keys'
    },
    {
      name: 'external',
      type: 'auth0',
      clientId: 'auth0-client-id',
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      domain: 'your-tenant.auth0.com',
      issuer: 'https://your-tenant.auth0.com/',
      audience: 'https://mcp.yourcompany.com',
      jwksUri: 'https://your-tenant.auth0.com/.well-known/jwks.json'
    }
  ],
  mcpServerSettings: {
    auth: {
      mode: 'oauth',
      resourceIdentifier: 'https://mcp.yourcompany.com',
      jwtSigningSecret: process.env.MCP_JWT_SECRET
    }
  }
};
```

When multiple providers are configured, the proxy will:
1. List all providers on the login page
2. Let users select their identity provider
3. Redirect to the selected provider for authentication

## Scope-Based Authorization

Scopes control what operations authenticated users can perform. Scopes are defined in the `__mj.APIScope` database table and apply to both OAuth tokens and API keys.

### Default Scopes

| Scope | Category | Description |
|-------|----------|-------------|
| `entity:read` | Entities | Read entity records |
| `entity:write` | Entities | Create and update records |
| `action:execute` | Actions | Execute MJ actions |
| `agent:execute` | Agents | Run AI agents |
| `query:run` | Queries | Execute saved queries |
| `view:run` | Views | Run views |

### Consent Flow

When OAuth is enabled with scopes:

1. User authenticates with upstream provider
2. Proxy displays consent screen listing available scopes
3. User selects which scopes to grant
4. Proxy issues JWT containing only granted scopes
5. Tools evaluate scopes from JWT to allow/deny operations

### Configuring API Key Scopes

API keys also support scope-based authorization via the `__mj.APIKeyScope` junction table:

1. Create API key in MemberJunction admin
2. Edit the key to assign scopes
3. Only assigned scopes will be available when using that API key

## Authentication Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `apiKey` | API key only (default) | Backward compatibility |
| `oauth` | OAuth Bearer token only | Full OAuth deployment |
| `both` | Accept either | Migration period |
| `none` | No authentication | Local development |

## Testing

### Test with API Key (mode: 'apiKey' or 'both')

```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Test OAuth Discovery

```bash
curl http://localhost:3100/.well-known/oauth-protected-resource
```

Expected response:
```json
{
  "resource": "http://localhost:3100",
  "authorization_servers": ["https://login.microsoftonline.com/tenant/v2.0"],
  "scopes_supported": ["openid", "profile", "email"],
  "bearer_methods_supported": ["header"],
  "resource_name": "MemberJunction MCP Server"
}
```

### Test OAuth Authorization Server Metadata

```bash
curl http://localhost:3100/.well-known/oauth-authorization-server
```

Expected response:
```json
{
  "issuer": "urn:mj:mcp-server",
  "authorization_endpoint": "http://localhost:3100/oauth/authorize",
  "token_endpoint": "http://localhost:3100/oauth/token",
  "registration_endpoint": "http://localhost:3100/oauth/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"]
}
```

### Test Available Scopes

```bash
curl http://localhost:3100/oauth/scopes
```

Expected response:
```json
{
  "scopes": [
    {"id": "...", "name": "entity:read", "description": "Read entity records", "category": "Entities"},
    {"id": "...", "name": "entity:write", "description": "Create and update records", "category": "Entities"},
    {"id": "...", "name": "action:execute", "description": "Execute MJ actions", "category": "Actions"}
  ]
}
```

### Test with OAuth Token

First, obtain a token from your OAuth provider using the authorization code flow. Then:

```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Verify JWT Claims

Decode the proxy-issued JWT to verify scopes (using jwt.io or similar):

```json
{
  "iss": "urn:mj:mcp-server",
  "sub": "user@example.com",
  "aud": "http://localhost:3100",
  "email": "user@example.com",
  "mjUserId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "scopes": ["entity:read", "entity:write", "action:execute"],
  "upstreamProvider": "auth0",
  "upstreamSub": "auth0|123456"
}
```

### Test Unauthorized Response

```bash
curl -v http://localhost:3100/mcp
```

Expected response headers:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="http://localhost:3100/.well-known/oauth-protected-resource"
```

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "memberjunction": {
      "command": "npx",
      "args": ["@memberjunction/ai-mcp-server"],
      "env": {}
    }
  }
}
```

When OAuth is enabled, Claude Desktop will:
1. Attempt to connect
2. Receive 401 with WWW-Authenticate header
3. Discover authorization server from metadata endpoint
4. Open browser for user login
5. Complete OAuth flow and retry with access token

## Troubleshooting

### "No authentication providers configured"

Ensure `authProviders` is set in your `mj.config.cjs` and the provider type is valid.

### "User not found in MemberJunction"

The authenticated user's email must match an active User record in MemberJunction. Users are not auto-created (unless `userHandling.autoCreateNewUsers` is enabled).

### "Invalid audience"

The token's `aud` claim must include your `resourceIdentifier`. Verify:
1. Your OAuth provider is configured with the correct audience
2. Your `resourceIdentifier` matches exactly

### "Token expired"

Access tokens have limited lifetime. MCP clients should handle token refresh. If tokens expire quickly:
1. Check provider's token lifetime settings
2. Ensure client implements refresh token flow

### Server starts but OAuth doesn't work

Check server startup logs for:
```
MCP Server: Auth mode: both
MCP Server: OAuth enabled with providers: azure-ad
```

If you see:
```
MCP Server: OAuth config incomplete, falling back to API key only
```

Verify your `authProviders` configuration.

### "Missing JWT signing secret"

OAuth mode requires a signing secret for proxy-issued JWTs:
1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Set environment variable: `export MCP_JWT_SECRET="your-secret"`
3. Or add to config: `auth.jwtSigningSecret: process.env.MCP_JWT_SECRET`

### "OIDC Discovery failed"

The proxy uses OIDC Discovery to find provider endpoints. Verify:
1. Provider's `issuer` URL is correct
2. `{issuer}/.well-known/openid-configuration` is accessible
3. No firewall blocking outbound HTTPS requests

### "Scope not granted"

If tools reject requests with "insufficient scope":
1. Check JWT's `scopes` claim contains required scope
2. Verify user granted the scope during consent
3. For API keys, verify scope is assigned in `__mj.APIKeyScope`

### Consent screen not appearing

The consent screen appears after upstream authentication:
1. Verify upstream auth completed successfully
2. Check for errors in OAuth callback URL
3. Ensure `__mj.APIScope` table has active scopes

## Security Considerations

1. **Production**: Always use HTTPS for the MCP Server in production
2. **Resource Identifier**: Should be your public URL, not `localhost`
3. **User Provisioning**: Users must exist in MemberJunction before authenticating
4. **Mode: none**: Only use for local development, never in production

## Next Steps

- Review [spec.md](./spec.md) for complete requirements
- See [plan.md](./plan.md) for implementation details
- Check [data-model.md](./data-model.md) for configuration schema
