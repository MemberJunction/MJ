# Feature Specification: MCP Server OAuth Authentication

**Feature Branch**: `601-mcp-oauth`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Add support for OAuth to packages/AI/MCPServer. OAuth should use the same config values used by the front end (MJExplorer) and should be toggleable in the config file. The idea is that an installation could choose to enable OAuth instead of (or in addition to) API key auth, then when they use the MCP server with a client, it will open a browser prompting them to log in (same as if they were to visit their MJExplorer). Once authenticated, the MCP client can call tools normally (until the auth expires)."

## Clarifications

### Session 2026-01-27

- Q: Which OAuth providers should be supported? → A: All providers from packages/MJServer/src/auth/providers: Auth0, MSAL (Microsoft Entra ID), Okta, Cognito, and Google.
- Q: Should auth provider logic be duplicated or reused? → A: Reuse MJServer's auth providers directly via @memberjunction/server package dependency.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Authenticates via Browser Login (Priority: P1)

A developer using an MCP client (such as Claude Desktop or another AI assistant) wants to connect to their organization's MemberJunction MCP Server. Instead of managing API keys, they prefer to authenticate using their existing organizational login credentials (the same ones they use for MJExplorer).

When the developer's MCP client connects to the server, the MCP Server responds with an authentication challenge. The MCP client opens a browser window where the developer logs in using their standard identity provider (Microsoft Entra ID, Auth0, Okta, Cognito, or Google - same providers supported by MJServer). After successful authentication, the MCP client receives tokens and can make tool calls on behalf of the authenticated user.

**Why this priority**: This is the core value proposition - allowing users to authenticate to the MCP Server using the same identity provider as MJExplorer, eliminating the need for separate API key management for interactive use cases.

**Independent Test**: Can be fully tested by configuring OAuth settings, connecting an MCP client, completing the browser-based login flow, and successfully calling an MCP tool. Delivers immediate value for interactive MCP usage.

**Acceptance Scenarios**:

1. **Given** a developer with valid MJExplorer credentials and an MCP client configured to connect to the MCP Server, **When** the MCP client attempts to connect without a token, **Then** the server returns an HTTP 401 response with a WWW-Authenticate header containing the OAuth metadata URL.

2. **Given** an MCP client that received a 401 challenge, **When** the client fetches the protected resource metadata and initiates the OAuth flow, **Then** a browser window opens displaying the organization's login page (same as MJExplorer).

3. **Given** a user who has completed browser-based authentication, **When** the OAuth flow completes with valid tokens, **Then** the MCP client can make subsequent requests with the access token and receive successful responses.

4. **Given** an authenticated MCP session with a valid token, **When** the user calls any authorized MCP tool, **Then** the tool executes using the authenticated user's permissions and context.

---

### User Story 2 - Administrator Configures OAuth Provider (Priority: P2)

A system administrator wants to enable OAuth authentication on their MCP Server. They already have OAuth configured for MJExplorer and want to reuse those same configuration values. The administrator edits the configuration file to enable OAuth and specify which provider to use.

**Why this priority**: Configuration is essential for deployments but follows the core authentication flow. Administrators need a clear, documented way to enable OAuth using existing credentials.

**Independent Test**: Can be tested by adding OAuth configuration to mj.config.cjs and verifying the server starts with OAuth enabled. Delivers value by enabling the OAuth feature for an installation.

**Acceptance Scenarios**:

1. **Given** an MCP Server with OAuth disabled (default), **When** an MCP client connects, **Then** only API key authentication is available.

2. **Given** a mj.config.cjs file with OAuth enabled and valid provider settings, **When** the MCP Server starts, **Then** the server accepts OAuth tokens in addition to API keys.

3. **Given** incomplete or invalid OAuth configuration, **When** the MCP Server starts, **Then** the server logs a clear error message indicating which configuration values are missing or invalid and falls back to API key-only authentication.

4. **Given** OAuth configured for the same provider as MJExplorer, **When** a user logs in via MCP OAuth, **Then** they authenticate against the same identity provider and see the same login experience.

---

### User Story 3 - Session Management and Token Refresh (Priority: P2)

A developer is working with an MCP client for an extended period. Their access token expires during the session. The MCP client handles token refresh transparently, or gracefully prompts for re-authentication when the refresh token expires.

**Why this priority**: Robust session management is necessary for a production-ready OAuth implementation and affects user experience during extended work sessions.

**Independent Test**: Can be tested by obtaining tokens, waiting for expiration, and verifying either transparent refresh or clear re-authentication prompt. Delivers value by ensuring uninterrupted work sessions.

**Acceptance Scenarios**:

1. **Given** an MCP session with an expired access token but valid refresh token, **When** the client makes a request, **Then** the MCP client can obtain a new access token using the refresh token.

2. **Given** an MCP session where both access and refresh tokens have expired, **When** the client makes a request, **Then** the server returns a 401 response and the client initiates a new authentication flow.

3. **Given** an MCP session with a valid token, **When** the user completes a tool call, **Then** the response includes information about token validity (via standard HTTP headers or MCP metadata).

---

### User Story 4 - Dual Authentication Support (Priority: P3)

An organization wants to support both OAuth (for interactive developer use) and API keys (for automated services and CI/CD pipelines). The administrator configures both authentication methods, and the server accepts either.

**Why this priority**: Many organizations need both interactive (OAuth) and programmatic (API key) access patterns. Supporting both provides flexibility without forcing a migration.

**Independent Test**: Can be tested by enabling both auth methods and verifying requests succeed with either a valid OAuth token or a valid API key. Delivers value by maintaining backward compatibility.

**Acceptance Scenarios**:

1. **Given** a server configured with both OAuth and API key authentication enabled, **When** a request includes a valid API key, **Then** the request is authenticated via the API key flow (existing behavior).

2. **Given** a server configured with both authentication methods, **When** a request includes a valid OAuth Bearer token (no API key), **Then** the request is authenticated via the OAuth flow.

3. **Given** a request with both an API key and OAuth token, **When** the server processes the request, **Then** the server uses a defined precedence (API key takes precedence for backward compatibility).

---

### Edge Cases

- What happens when a user's OAuth account exists but they have no corresponding MemberJunction user record?
  - The server returns a 403 Forbidden with a clear message indicating the user must be provisioned in MemberJunction.

- What happens when the OAuth provider is temporarily unavailable during token validation?
  - The server returns a 503 Service Unavailable with a Retry-After header and logs the connectivity issue.

- What happens when the configured OAuth provider differs from MJExplorer's provider?
  - This is a valid configuration (different MCP and web app providers). The server validates tokens against the configured provider only.

- What happens when OAuth configuration is enabled but incomplete?
  - The server logs a startup warning, disables OAuth, and continues with API key authentication only.

- What happens when an MCP client does not support OAuth (older client)?
  - If API key auth is also enabled, the client can use API keys. If OAuth-only, the connection fails with a clear error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement OAuth 2.1 authorization as a resource server, following the MCP Authorization specification for HTTP-based transports.

- **FR-002**: System MUST support Protected Resource Metadata discovery (RFC 9728), returning authorization server location via the `.well-known/oauth-protected-resource` endpoint or `WWW-Authenticate` header.

- **FR-003**: System MUST accept Bearer tokens in the Authorization header for authenticated requests, validating tokens against the configured OAuth provider.

- **FR-004**: System MUST validate that access tokens were issued for the MCP Server as the intended audience (resource indicator validation per RFC 8707).

- **FR-005**: System MUST map OAuth token claims (subject, email) to MemberJunction user records to establish the user context for tool execution.

- **FR-006**: System MUST support configuration of OAuth provider settings (client ID, authority/issuer, tenant ID) via the existing mj.config.cjs configuration file.

- **FR-007**: System MUST provide a configuration flag to enable/disable OAuth authentication independently of API key authentication.

- **FR-008**: System MUST maintain backward compatibility with existing API key authentication when OAuth is enabled.

- **FR-009**: System MUST return appropriate HTTP status codes for authorization errors (401 for missing/invalid tokens, 403 for insufficient permissions).

- **FR-010**: System MUST support all OAuth providers available in packages/MJServer/src/auth/providers: Auth0, MSAL (Microsoft Entra ID), Okta, Cognito, and Google.

- **FR-013**: System MUST reuse the existing auth provider implementations from the @memberjunction/server package (BaseAuthProvider, AuthProviderFactory, and provider classes) rather than duplicating token validation logic.

- **FR-011**: System MUST log authentication events (successful logins, failed attempts, token validation errors) for security auditing.

- **FR-012**: System MUST reject tokens that are expired, have invalid signatures, or were not issued by the configured provider.

### Key Entities

- **User**: The MemberJunction user associated with the OAuth subject claim. The system maps OAuth identity to an existing User record to establish permissions and context.

- **OAuth Configuration**: Settings stored in mj.config.cjs that define the OAuth provider type, client ID, authority URL, tenant ID, and whether OAuth is enabled.

- **MCP Session**: Represents an authenticated connection between an MCP client and the server. Contains either API key context or OAuth token claims, along with the resolved MemberJunction user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full OAuth authentication flow (browser login to successful tool call) in under 60 seconds.

- **SC-002**: 99% of valid OAuth tokens are successfully validated on first attempt (no false rejections due to validation bugs).

- **SC-003**: Token validation adds less than 100ms overhead to request processing compared to API key authentication.

- **SC-004**: Administrators can configure OAuth by adding fewer than 10 configuration properties to their existing config file.

- **SC-005**: Users with valid MJExplorer accounts can authenticate to the MCP Server without creating any new credentials or API keys.

- **SC-006**: The system correctly rejects 100% of expired, tampered, or wrong-audience tokens.

- **SC-007**: Existing API key authentication continues to work unchanged when OAuth is enabled alongside it.

## Assumptions

- MCP clients (Claude Desktop, etc.) support the OAuth 2.1 authorization flow as specified in the MCP Authorization specification.
- Organizations have already configured an OAuth provider (Auth0, MSAL, Okta, Cognito, or Google) for MJServer and have the configuration values available.
- MemberJunction user records already exist for users who will authenticate via OAuth (the system does not auto-provision users).
- The MCP Server runs over HTTPS in production environments (required for secure OAuth flows).
- Token validation will use the provider's JWKS (JSON Web Key Set) endpoint for signature verification via the existing MJServer auth provider infrastructure.

## Out of Scope

- Automatic user provisioning from OAuth claims (users must exist in MemberJunction).
- New OAuth providers beyond those already implemented in MJServer (Auth0, MSAL, Okta, Cognito, Google).
- OAuth scopes beyond basic user identification (fine-grained permission scopes are a future enhancement).
- Client credentials grant flow (machine-to-machine auth) - use API keys for this use case.
- The MCP Server acting as an OAuth authorization server (it acts only as a resource server).
