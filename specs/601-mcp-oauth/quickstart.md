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
      resourceIdentifier: 'https://mcp.yourcompany.com'
    },
    // ... tool configurations
  },
  authProviders: [/* ... */]
};
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

### Test with OAuth Token

First, obtain a token from your OAuth provider using the authorization code flow. Then:

```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
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

## Security Considerations

1. **Production**: Always use HTTPS for the MCP Server in production
2. **Resource Identifier**: Should be your public URL, not `localhost`
3. **User Provisioning**: Users must exist in MemberJunction before authenticating
4. **Mode: none**: Only use for local development, never in production

## Next Steps

- Review [spec.md](./spec.md) for complete requirements
- See [plan.md](./plan.md) for implementation details
- Check [data-model.md](./data-model.md) for configuration schema
