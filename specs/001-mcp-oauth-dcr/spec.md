# Feature Specification: MCP OAuth with Dynamic Client Registration

**Feature Branch**: `001-mcp-oauth-dcr`
**Created**: 2026-01-29
**Status**: Implemented (Core Flow)
**Input**: User description: "MCP OAuth with Dynamic Client Registration - Transparent OAuth authentication for MCP connections"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time OAuth Connection (Priority: P1)

A user wants to connect to an OAuth-protected MCP server for the first time. They should be able to complete this connection with a single browser-based consent flow, without manually obtaining or configuring any tokens, client IDs, or secrets.

**Why this priority**: This is the core value proposition of the feature. Without this working, no OAuth-protected MCP servers can be connected seamlessly.

**Independent Test**: Can be fully tested by configuring an MCP server with OAuth requirements and attempting to connect. Delivers the ability to access OAuth-protected MCP tools without manual credential management.

**Acceptance Scenarios**:

1. **Given** an MCP server is configured with OAuth2 authentication and the user has never connected to it, **When** the user clicks "Connect", **Then** the system discovers the authorization server capabilities, registers a client (if DCR is supported), and redirects the user to a browser-based consent page.

2. **Given** the user is on the authorization server consent page, **When** the user approves the authorization request, **Then** the system receives the authorization code, exchanges it for tokens using PKCE, stores the tokens securely, and completes the connection automatically.

3. **Given** the authorization server does not support Dynamic Client Registration, **When** the user attempts to connect, **Then** the system prompts the user to provide pre-configured client credentials (client ID and optionally client secret) and proceeds with the standard OAuth flow.

---

### User Story 2 - Automatic Token Refresh (Priority: P1)

A user has an existing OAuth connection with tokens that are about to expire. The system should automatically refresh the tokens without any user interaction, maintaining seamless access to the MCP server.

**Why this priority**: Equally critical as first connection - without automatic refresh, users would face constant re-authorization requests, defeating the purpose of transparent OAuth.

**Independent Test**: Can be tested by establishing a connection, waiting for token expiry (or simulating it), and verifying the connection continues to work without user intervention.

**Acceptance Scenarios**:

1. **Given** an active MCP connection with tokens that will expire within a configurable threshold (default: 5 minutes), **When** the system checks token validity before a tool call, **Then** the system automatically uses the refresh token to obtain new access tokens without user interaction.

2. **Given** an active MCP connection with expired access token but valid refresh token, **When** a tool call is attempted, **Then** the system refreshes the tokens, stores the new tokens, and completes the tool call seamlessly.

3. **Given** token refresh is successful, **When** new tokens are received, **Then** the system updates the stored credentials with new access token, refresh token (if provided), and expiration time.

---

### User Story 3 - Re-Authorization on Refresh Failure (Priority: P2)

When token refresh fails (expired refresh token, revoked access, etc.), the user should be clearly informed and prompted to re-authorize, rather than seeing cryptic error messages.

**Why this priority**: Important for user experience but less frequent than the core flows. System should degrade gracefully when refresh fails.

**Independent Test**: Can be tested by revoking refresh token permissions on the auth server side and attempting to use the connection.

**Acceptance Scenarios**:

1. **Given** an MCP connection where the refresh token has expired or been revoked, **When** the system attempts to refresh tokens, **Then** the system marks the connection as requiring re-authorization and presents a clear message to the user.

2. **Given** a connection is marked as requiring re-authorization, **When** the user initiates re-authorization, **Then** the system starts a new authorization flow (preserving existing client registration if possible).

3. **Given** the user completes re-authorization, **When** new tokens are obtained, **Then** the connection is restored to active status and all previous tools remain accessible.

---

### User Story 4 - Administrator OAuth Server Configuration (Priority: P2)

An administrator configures an MCP server that requires OAuth authentication. They should be able to specify OAuth settings without distributing shared credentials, allowing each user/connection to get isolated credentials via DCR.

**Why this priority**: Enables the administrative setup required for end-user scenarios. Without this, OAuth-protected servers cannot be configured.

**Independent Test**: Can be tested by an administrator configuring OAuth settings for an MCP server and verifying the configuration is stored correctly.

**Acceptance Scenarios**:

1. **Given** an administrator is configuring a new MCP server, **When** they select OAuth2 as the authentication type, **Then** they can specify the authorization server URL (or metadata endpoint URL) and required scopes.

2. **Given** the authorization server supports metadata discovery (RFC 8414), **When** the administrator provides only the issuer URL, **Then** the system automatically discovers authorization endpoint, token endpoint, registration endpoint, and supported grant types.

3. **Given** the authorization server does not support DCR, **When** configuring the MCP server, **Then** the administrator can optionally provide a shared client ID and client secret to be used for all connections (with appropriate security warnings).

---

### User Story 5 - Credential Revocation and Audit (Priority: P3)

Administrators can revoke OAuth access for specific users at the MJ level and view an audit trail of authorization events, without needing to access the external authorization server.

**Why this priority**: Important for security and compliance but not critical for core functionality. Enhances administrative control.

**Independent Test**: Can be tested by revoking a user's OAuth credentials in MJ and verifying they can no longer use the connection.

**Acceptance Scenarios**:

1. **Given** a user has an active OAuth connection, **When** an administrator revokes the user's OAuth credentials in MJ, **Then** the stored tokens are deleted, and the user must re-authorize on next connection attempt.

2. **Given** OAuth operations occur (authorization, refresh, revocation), **When** these events happen, **Then** they are logged in the MJ audit system with user, timestamp, connection, and operation type.

3. **Given** an administrator wants to see OAuth activity, **When** they view the connection audit log, **Then** they can see all authorization events including successful authorizations, failed attempts, token refreshes, and revocations.

---

### Edge Cases

- **Authorization server temporarily unavailable during token refresh**: System retries with exponential backoff (3 attempts over 30 seconds) before marking connection as requiring re-authorization.

- **Different token formats from authorization servers**: System handles both JWT and opaque tokens, storing them as-is and using metadata (expires_in) for lifecycle management.

- **User closes browser during consent flow**: The authorization attempt times out after 5 minutes, and the user can retry the connection.

- **Concurrent refresh attempts for same connection**: Only one refresh is in-flight at a time per connection; concurrent attempts wait for the active refresh to complete.

- **DCR client deleted on auth server after initial success**: System detects the error, clears the stored client registration, and attempts DCR again on next authorization.

- **Authorization server returns error during code exchange**: System displays the error description from the auth server (if provided) or a generic message, and allows retry.

## Requirements *(mandatory)*

### Functional Requirements

#### Discovery & Registration

- **FR-001**: System MUST support OAuth 2.0 Authorization Server Metadata discovery per RFC 8414, using the `/.well-known/oauth-authorization-server` endpoint.

- **FR-002**: System MUST support Dynamic Client Registration per RFC 7591 when the authorization server advertises a registration endpoint in its metadata.

- **FR-003**: System MUST fall back to manual client configuration when DCR is not supported by the authorization server.

- **FR-004**: System MUST cache authorization server metadata with a configurable TTL (default: 24 hours) to reduce discovery requests.

#### Authorization Flow

- **FR-005**: System MUST implement OAuth 2.1 Authorization Code flow with PKCE (Proof Key for Code Exchange) using S256 challenge method.

- **FR-006**: System MUST generate cryptographically secure state and code_verifier parameters for each authorization request.

- **FR-007**: System MUST validate the state parameter on authorization callback to prevent CSRF attacks.

- **FR-008**: System MUST support configurable OAuth scopes per MCP server configuration.

- **FR-009**: System MUST handle the authorization callback by exchanging the authorization code for tokens.

#### Token Management

- **FR-010**: System MUST store access tokens, refresh tokens, and expiration metadata in a dedicated OAuth Token entity with field-level encryption via CredentialEngine.

- **FR-011**: System MUST automatically refresh tokens when the access token is within a configurable threshold of expiration (default: 5 minutes before expiry).

- **FR-012**: System MUST handle token refresh failures by marking the connection status appropriately and notifying the user.

- **FR-013**: System MUST support token revocation at the MJ level by deleting stored credentials.

- **FR-014**: System MUST prevent concurrent token refresh operations for the same connection (only one refresh in-flight at a time).

#### Client Registration Management

- **FR-015**: System MUST store DCR client credentials (client_id, client_secret if issued) per MCP connection, not shared across users.

- **FR-016**: System MUST handle client registration expiration by re-registering when needed.

- **FR-017**: System MUST include appropriate client metadata in DCR requests: client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method.

#### Integration

- **FR-018**: System MUST integrate with the existing MCPClientManager to intercept authentication requirements before connection attempts.

- **FR-019**: System MUST integrate with existing CredentialEngine for secure token storage, using field-level encryption.

- **FR-020**: System MUST log all OAuth operations to the existing audit log system, including: authorization initiated, authorization completed, token refresh, token refresh failed, credentials revoked.

#### User Experience

- **FR-021**: System MUST present clear, non-technical error messages when OAuth operations fail.

- **FR-022**: System MUST provide a mechanism to trigger re-authorization when needed (e.g., "Reconnect" button that starts a new auth flow).

- **FR-023**: System MUST indicate connection status (Connected, Requires Authorization, Authorization Failed) clearly in the UI.

### Key Entities

The following MJ entities are created to support OAuth (table names in parentheses):

- **OAuth Client Registration** (`OAuthClientRegistration`): Represents a DCR-obtained client registration for a specific MCP connection. Contains client_id, client_secret (optional, encrypted), registration metadata, and creation timestamp. Linked to a specific MCP Server Connection.

- **OAuth Token** (`OAuthToken`): Represents the current token state for an OAuth connection. Contains access_token (encrypted), refresh_token (encrypted, optional), token_type, expires_at, and scope. One token record per connection.

- **OAuth Authorization State** (`OAuthAuthorizationState`): Temporary state during an in-progress authorization flow. Contains state parameter, code_verifier (for PKCE), redirect_uri, timestamp, and expiration. Used to validate callbacks and complete token exchange.

- **OAuth Auth Server Metadata Cache** (`OAuthAuthServerMetadataCache`): Cached metadata from RFC 8414 discovery. Contains issuer, authorization_endpoint, token_endpoint, registration_endpoint, supported scopes, grant types, and cache expiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect to a new OAuth-protected MCP server by completing a single browser-based consent flow (no manual token/credential copying required).

- **SC-002**: Established connections remain functional for at least 30 days without requiring user re-authorization (assuming valid refresh tokens).

- **SC-003**: Token refresh operations complete within 5 seconds under normal network conditions.

- **SC-004**: 99% of token refresh operations succeed without user intervention (failures only due to revocation or server issues).

- **SC-005**: The feature works with common authorization servers (Auth0, Okta, Azure AD, Cognito) without server-specific code - only RFC-compliant implementations required.

- **SC-006**: Users see a clear, actionable message (not technical error) within 3 seconds when re-authorization is required.

- **SC-007**: Administrators can revoke a user's OAuth access and have it take effect within 60 seconds.

- **SC-008**: All OAuth operations (authorization, refresh, revocation) are logged in the audit system with complete context.

## Assumptions

- Authorization servers comply with RFC 8414 (metadata discovery) and RFC 7591 (DCR) when they advertise support for these features.
- PKCE with S256 challenge method is supported by all target authorization servers (this is mandatory in OAuth 2.1).
- The MemberJunction deployment has a stable, accessible callback URL for OAuth redirects (existing web server infrastructure).
- Network latency to authorization servers is typically under 2 seconds for metadata and token operations.
- The existing CredentialEngine encryption is sufficient for OAuth token security requirements.
- Users have a web browser available to complete the consent flow (no headless/device flow in initial scope).

## Out of Scope

- **Client Credentials flow**: Machine-to-machine authentication without user consent is not included in this implementation.
- **Device Authorization flow**: CLI-only environments using device codes and polling are not included.
- **Custom/proprietary OAuth extensions**: Only RFC-compliant OAuth 2.0/2.1 features are supported.
- **Acting as an OAuth authorization server**: MemberJunction is the OAuth client, not an auth server.
- **Token introspection**: Validating tokens against the auth server's introspection endpoint is not included.
- **Mutual TLS (mTLS)**: Client certificate authentication for token endpoints is not included.

## Dependencies

- Existing CredentialEngine for secure token storage
- Existing MCPClientManager for MCP connection lifecycle
- Existing MCP Server and MCP Server Connection entities for configuration storage
- Existing audit logging infrastructure
- Web server with accessible callback URL endpoint
