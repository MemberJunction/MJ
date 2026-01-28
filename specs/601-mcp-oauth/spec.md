# Feature Specification: MCP Server OAuth Authentication with OAuth Proxy

**Feature Branch**: `601-mcp-oauth`
**Created**: 2026-01-27
**Updated**: 2026-01-27
**Status**: Draft
**Input**: User description: "Add support for OAuth to packages/AI/MCPServer. OAuth should use the same config values used by the front end (MJExplorer) and should be toggleable in the config file. The idea is that an installation could choose to enable OAuth instead of (or in addition to) API key auth, then when they use the MCP server with a client, it will open a browser prompting them to log in (same as if they were to visit their MJExplorer). Once authenticated, the MCP client can call tools normally (until the auth expires)."

**Extended**: 2026-01-27 - Added OAuth Proxy Authorization Server to enable dynamic client registration (RFC 7591) for MCP clients like Claude Code that cannot manually register with upstream identity providers.

## Clarifications

### Session 2026-01-27

- Q: Which OAuth providers should be supported? → A: All providers from packages/MJServer/src/auth/providers: Auth0, MSAL (Microsoft Entra ID), Okta, Cognito, and Google.
- Q: Should auth provider logic be duplicated or reused? → A: Reuse MJServer's auth providers directly via @memberjunction/server package dependency.

### Session 2026-01-27 (OAuth Proxy Extension)

- Q: Why is an OAuth proxy needed? → A: Azure AD (and some other providers) don't support RFC 7591 Dynamic Client Registration. MCP clients like Claude Code require dynamic registration to authenticate without manual app registration in each identity provider.

### Session 2026-01-28

- Q: How should the OAuth proxy's upstream client be configured? → A: Reuse MJExplorer's existing OAuth client credentials. The proxy and MJExplorer are the same "application" from the IdP's perspective.
- Q: How should OAuth identity map to MemberJunction users? → A: Match by email claim to User.Email, consistent with MJExplorer's authentication approach.
- Q: How should the proxy discover upstream OAuth endpoints? → A: Use standard OIDC Discovery (/.well-known/openid-configuration) - all supported providers expose this endpoint.
- Q: What token format should the proxy issue to MCP clients? → A: Issue proxy-signed JWTs with consistent format across all providers, containing user email and MJ context. This abstracts upstream provider token differences.
- Q: How should the JWT signing key be managed? → A: Configure secret in mj.config.cjs for persistence across restarts and intentional key rotation.
- Q: Where should OAuth scopes be defined? → A: Stored in MJ database as an entity, manageable via MJ admin UI. Enables dynamic scope management and future role-to-scope mapping.
- Q: What granularity should scopes have? → A: Entity/action-level (e.g., "action:execute", "entity:read"). Scopes are system-wide (apply to both OAuth and API keys), not MCP-specific. Tools receive full JWT to evaluate scopes themselves.
- Q: How should users select scopes during auth? → A: Consent screen where user selects from their available scopes. Provides transparency, security (least privilege), and flexibility.
- Q: How are scopes associated with users? → A: All active scopes are available to all authenticated users. Simplifies administration; tools enforce actual data-level permissions based on MJ user context.
- Q: How are scopes assigned to API keys? → A: Scopes are assigned when creating/editing an API key (stored with the key). Tools evaluate API key scopes the same way as OAuth token scopes.
- Q: Why not just use the upstream provider directly? → A: Testing revealed Azure AD v2.0 doesn't support RFC 8707 resource parameter (uses scope instead), and doesn't support dynamic client registration. This means MCP clients cannot initiate OAuth flows without manual Azure AD app configuration.
- Q: Should the proxy support a web UI? → A: Yes, the MCP Server should serve a simple login web UI to provide a good user experience during the browser-based authentication flow.
- Q: Should the MCP server have hardcoded knowledge of auth provider types? → A: No. MCP server should remain loosely coupled from provider-specific knowledge. Provider type is stored as a string (from config), not a hardcoded enum. All provider-specific logic (discovery URL patterns, claim mappings, etc.) belongs in `@memberjunction/server` auth package, not MCP server code.

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

### User Story 5 - MCP Client Dynamic Registration (Priority: P1)

An MCP client (such as Claude Code or Claude Desktop) wants to connect to a MemberJunction MCP Server. The client does not have pre-registered credentials with the organization's identity provider (Azure AD, Auth0, etc.). The MCP Server acts as an OAuth Proxy Authorization Server that supports RFC 7591 Dynamic Client Registration.

When the MCP client discovers the MCP Server's OAuth metadata, it dynamically registers itself with the MCP Server's OAuth proxy. The proxy issues temporary client credentials. The client then initiates an authorization flow through the proxy, which redirects to the upstream identity provider (Azure AD) for user authentication. After the user logs in via a browser, the proxy receives the authorization code, exchanges it for tokens from the upstream provider, and issues its own authorization code to the MCP client. The client exchanges this code for tokens and can make authenticated tool calls.

**Why this priority**: This is essential for MCP client compatibility. Without dynamic registration support, users cannot use MCP clients like Claude Code with Azure AD or other providers that don't implement RFC 7591. This removes a major barrier to adoption.

**Independent Test**: Can be tested by running `claude mcp add` with the MCP Server URL and completing the OAuth flow through the browser. Delivers immediate value for Claude Code users.

**Acceptance Scenarios**:

1. **Given** an MCP client that supports OAuth 2.1 and dynamic client registration, **When** the client fetches `/.well-known/oauth-authorization-server`, **Then** the server returns metadata including a `registration_endpoint` URL.

2. **Given** an MCP client that needs to register, **When** the client POSTs a registration request to `/oauth/register` with redirect URIs, **Then** the server returns a client_id, client_secret, and registration metadata per RFC 7591.

3. **Given** a dynamically registered MCP client, **When** the client initiates authorization at `/oauth/authorize` with PKCE, **Then** the server redirects to the upstream identity provider's login page.

4. **Given** a user who has logged in at the upstream provider, **When** the provider redirects back to `/oauth/callback`, **Then** the MCP Server exchanges the upstream code for tokens, generates its own authorization code, and redirects to the MCP client's redirect URI.

5. **Given** an MCP client with an authorization code, **When** the client exchanges the code at `/oauth/token`, **Then** the server validates PKCE, returns access and refresh tokens, and the client can make authenticated MCP tool calls.

---

### User Story 6 - OAuth Proxy Web Login UI (Priority: P2)

When a user is redirected to the MCP Server's OAuth proxy for authentication, they see a branded login page that explains they're being asked to authenticate. The page shows the organization's identity provider options (if multiple) and provides a clear user experience rather than raw redirects.

**Why this priority**: While functional OAuth can work with raw redirects, a proper web UI improves user confidence and reduces confusion during the authentication flow. It also allows displaying error messages and handling edge cases gracefully.

**Independent Test**: Can be tested by navigating to the `/oauth/authorize` endpoint in a browser and verifying the login page renders correctly before redirecting to the identity provider.

**Acceptance Scenarios**:

1. **Given** a user arriving at `/oauth/authorize` via browser redirect, **When** the page loads, **Then** a simple, branded login page is displayed explaining the authentication request.

2. **Given** the login page, **When** the user clicks to proceed, **Then** they are redirected to the configured upstream identity provider.

3. **Given** an authentication error (invalid client, expired state, etc.), **When** the error occurs, **Then** the page displays a user-friendly error message with guidance.

4. **Given** a successful callback from the upstream provider, **When** processing completes, **Then** the user is redirected to the MCP client's redirect URI with appropriate parameters.

---

### User Story 7 - Scope-Based Access Control (Priority: P2)

A developer authenticates via OAuth and is presented with a consent screen showing available scopes (e.g., "action:execute", "entity:read", "entity:write"). The developer selects only the scopes needed for their current task. When calling MCP tools, each tool receives the JWT with granted scopes and can allow/deny operations or selectively limit data access based on those scopes.

**Why this priority**: Scope-based authorization provides fine-grained access control, enabling the principle of least privilege. Tools can limit their behavior based on granted scopes, improving security.

**Independent Test**: Can be tested by authenticating with limited scopes, then verifying tools behave appropriately (e.g., a tool requiring "entity:write" scope fails gracefully when only "entity:read" was granted).

**Acceptance Scenarios**:

1. **Given** a user authenticating via OAuth, **When** the consent screen appears, **Then** all active scopes are displayed with descriptions, and the user can select which to grant.

2. **Given** a user who granted only "entity:read" scope, **When** they call a tool that requires "entity:write", **Then** the tool either denies the operation or limits its behavior to read-only.

3. **Given** an API key with assigned scopes, **When** a request is made with that key, **Then** tools receive the scopes and evaluate them the same way as OAuth token scopes.

4. **Given** a tool that can operate with different scope levels, **When** called with limited scopes, **Then** the tool adapts its behavior (e.g., filtering data, disabling write operations) based on granted scopes.

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

- What happens when a dynamically registered client attempts to use an unauthorized redirect URI?
  - The OAuth proxy rejects the authorization request with an `invalid_request` error per RFC 6749.

- What happens when the upstream identity provider rejects the user's credentials?
  - The error is passed through to the user via the login UI, with guidance to check their credentials or contact their administrator.

- What happens when the authorization state expires before the user completes login?
  - The proxy returns an error page explaining the session expired and prompts the user to restart the authentication flow.

- What happens when the upstream provider issues tokens but the MCP Server cannot map the user to MemberJunction?
  - The proxy returns an error to the client with `access_denied` and the user sees a message explaining they need a MemberJunction account.

- What happens when multiple dynamically registered clients have the same redirect URI?
  - This is allowed per RFC 7591. Each client gets unique client_id/secret, and authorization state is tracked per-client.

- What happens when a user grants no scopes on the consent screen?
  - The authentication completes but the JWT contains an empty scopes array. Tools may deny operations or provide minimal functionality.

- What happens when a tool requires a scope the token doesn't have?
  - The tool decides how to handle this: it may return a 403 Forbidden, return limited data, or disable certain functionality. Tools are responsible for scope enforcement.

- What happens when an API key has no scopes assigned?
  - The API key works for authentication but tools may deny operations. Administrators should assign appropriate scopes when creating keys.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement OAuth 2.1 authorization as a resource server, following the MCP Authorization specification for HTTP-based transports.

- **FR-002**: System MUST support Protected Resource Metadata discovery (RFC 9728), returning authorization server location via the `.well-known/oauth-protected-resource` endpoint or `WWW-Authenticate` header.

- **FR-003**: System MUST accept Bearer tokens in the Authorization header for authenticated requests, validating tokens against the configured OAuth provider.

- **FR-004**: System MUST validate that access tokens were issued for the MCP Server as the intended audience (resource indicator validation per RFC 8707).

- **FR-005**: System MUST map OAuth token email claim to MemberJunction User.Email to establish the user context for tool execution (consistent with MJExplorer authentication).

- **FR-006**: System MUST support configuration of OAuth provider settings (client ID, authority/issuer, tenant ID) via the existing mj.config.cjs configuration file.

- **FR-007**: System MUST provide a configuration flag to enable/disable OAuth authentication independently of API key authentication.

- **FR-008**: System MUST maintain backward compatibility with existing API key authentication when OAuth is enabled.

- **FR-009**: System MUST return appropriate HTTP status codes for authorization errors (401 for missing/invalid tokens, 403 for insufficient permissions).

- **FR-010**: System MUST support all OAuth providers available in packages/MJServer/src/auth/providers: Auth0, MSAL (Microsoft Entra ID), Okta, Cognito, and Google.

- **FR-013**: System MUST reuse the existing auth provider implementations from the @memberjunction/server package (BaseAuthProvider, AuthProviderFactory, and provider classes) rather than duplicating token validation logic.

- **FR-011**: System MUST log authentication events (successful logins, failed attempts, token validation errors) for security auditing.

- **FR-012**: System MUST reject tokens that are expired, have invalid signatures, or were not issued by the configured provider.

### OAuth Proxy Authorization Server Requirements

- **FR-014**: System MUST implement OAuth 2.0 Authorization Server Metadata (RFC 8414) at `/.well-known/oauth-authorization-server`, advertising authorization, token, and registration endpoints.

- **FR-015**: System MUST implement Dynamic Client Registration (RFC 7591) at `/oauth/register`, allowing MCP clients to register and receive client credentials without manual configuration.

- **FR-016**: System MUST implement the authorization endpoint at `/oauth/authorize` that proxies authorization requests to the configured upstream identity provider.

- **FR-017**: System MUST implement a callback endpoint at `/oauth/callback` to receive authorization codes from the upstream provider and complete the proxy flow.

- **FR-018**: System MUST implement the token endpoint at `/oauth/token` that issues tokens to MCP clients after validating authorization codes and PKCE verifiers.

- **FR-019**: System MUST support PKCE (RFC 7636) with S256 code challenge method as required by OAuth 2.1 and MCP specification.

- **FR-020**: System MUST maintain authorization state mapping between MCP client requests and upstream provider flows, with appropriate TTL and cleanup.

- **FR-021**: System MUST store dynamically registered clients in memory with configurable TTL (clients re-register on expiration).

- **FR-022**: System MUST serve a simple web login UI at the authorization endpoint to provide a user-friendly authentication experience.

- **FR-023**: System MUST issue proxy-signed JWTs to MCP clients with a consistent format (containing user email, MJ user ID, expiration) regardless of upstream provider. The proxy validates upstream tokens internally but does not expose them to clients.

- **FR-024**: System MUST update Protected Resource Metadata to point to the OAuth proxy authorization server when OAuth proxy mode is enabled.

- **FR-025**: System MUST use a configured JWT signing secret from mj.config.cjs for proxy-issued tokens, ensuring tokens remain valid across server restarts.

### Scope-Based Authorization Requirements

- **FR-026**: System MUST store API Scopes in the MJ database as an entity, with fields for scope name, description, and active status.

- **FR-027**: System MUST include granted scopes in proxy-issued JWTs, allowing tools to inspect and evaluate scopes at runtime.

- **FR-028**: System MUST apply scope-based authorization to both OAuth tokens and API keys (scopes are system-wide, not OAuth-specific).

- **FR-029**: Tools MUST receive the full JWT to evaluate scopes and determine allowed behavior, including selectively limiting data access based on granted scopes.

- **FR-030**: System MUST display a consent screen during OAuth authorization where users select which scopes to grant from their available scopes (principle of least privilege).

- **FR-031**: System MUST make all active scopes available to all authenticated users on the consent screen. Tools enforce actual data-level permissions based on MJ user context.

- **FR-032**: System MUST support assigning scopes to API keys when creating or editing them. API key scopes are stored with the key and evaluated by tools the same way as OAuth token scopes.

- **FR-033**: System MUST remain loosely coupled from auth provider implementations. Provider-specific knowledge (discovery URL construction, claim extraction, token validation) MUST be delegated to `@memberjunction/server` auth package. MCP server stores provider type as a string identifier (from config), not a hardcoded enum.

### Key Entities

- **User**: The MemberJunction user associated with the OAuth subject claim. The system maps OAuth identity to an existing User record to establish permissions and context.

- **OAuth Configuration**: Settings stored in mj.config.cjs that define the OAuth provider type, client ID, authority URL, tenant ID, JWT signing secret, and whether OAuth is enabled.

- **MCP Session**: Represents an authenticated connection between an MCP client and the server. Contains either API key context or OAuth token claims, along with the resolved MemberJunction user.

- **Registered Client**: A dynamically registered OAuth client (e.g., Claude Code instance). Contains client_id, hashed client_secret, allowed redirect URIs, grant types, and registration timestamp. Stored in-memory with TTL.

- **Authorization State**: Temporary state tracking an in-progress authorization flow. Maps the MCP client's state/PKCE to the upstream provider flow. Contains redirect URI, code challenge, scopes, and expiration.

- **Authorization Code**: A short-lived code issued to MCP clients after successful upstream authentication. Maps to the upstream tokens and PKCE verifier for exchange at the token endpoint.

- **API Scope** (`__mj.APIScope`): A permission scope stored in the MJ database. Contains scope name (e.g., "action:execute", "entity:read"), description, and active status. Applies to both OAuth tokens and API keys. Managed via MJ admin UI. Tools receive the full JWT and evaluate scopes to determine allowed behavior.

- **API Key Scope** (`__mj.APIKeyScope`): Junction table linking API keys to their assigned scopes. When an API key is used, its associated scopes are included in the request context for tool evaluation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full OAuth authentication flow (browser login to successful tool call) in under 60 seconds.

- **SC-002**: 99% of valid OAuth tokens are successfully validated on first attempt (no false rejections due to validation bugs).

- **SC-003**: Token validation adds less than 100ms overhead to request processing compared to API key authentication.

- **SC-004**: Administrators can configure OAuth by adding fewer than 10 configuration properties to their existing config file.

- **SC-005**: Users with valid MJExplorer accounts can authenticate to the MCP Server without creating any new credentials or API keys.

- **SC-006**: The system correctly rejects 100% of expired, tampered, or wrong-audience tokens.

- **SC-007**: Existing API key authentication continues to work unchanged when OAuth is enabled alongside it.

### OAuth Proxy Success Criteria

- **SC-008**: MCP clients can dynamically register with the OAuth proxy in under 5 seconds.

- **SC-009**: Users can complete the full OAuth proxy flow (client registration → browser login → token acquisition) in under 90 seconds.

- **SC-010**: The OAuth proxy correctly handles 100% of PKCE validation scenarios (valid S256 challenges are accepted, invalid/missing verifiers are rejected).

- **SC-011**: Claude Code can successfully connect to the MCP Server using the OAuth proxy without any manual Azure AD app registration.

- **SC-012**: The login web UI displays correctly on desktop and mobile browsers.

- **SC-013**: Authorization state and registered clients are cleaned up after their TTL expires (no memory leaks over time).

## Assumptions

- MCP clients (Claude Desktop, etc.) support the OAuth 2.1 authorization flow as specified in the MCP Authorization specification.
- Organizations have already configured an OAuth provider (Auth0, MSAL, Okta, Cognito, or Google) for MJServer and have the configuration values available.
- MemberJunction user records already exist for users who will authenticate via OAuth (the system does not auto-provision users).
- The MCP Server runs over HTTPS in production environments (required for secure OAuth flows).
- Token validation will use the provider's JWKS (JSON Web Key Set) endpoint for signature verification via the existing MJServer auth provider infrastructure.

### OAuth Proxy Assumptions

- The OAuth proxy reuses MJExplorer's existing OAuth client credentials (client_id, client_secret, authority/domain) when communicating with the upstream identity provider. No separate app registration is required for the MCP Server.
- The OAuth proxy discovers upstream provider endpoints via standard OIDC Discovery (/.well-known/openid-configuration), which all supported providers expose.
- MCP clients support PKCE (S256) as required by OAuth 2.1 - this is standard for modern OAuth clients.
- In-memory storage for registered clients and authorization state is acceptable for MVP (server restart clears state; clients re-register).
- The OAuth proxy does not need to persist or audit dynamically registered clients beyond logging.
- A single upstream identity provider per MCP Server deployment is sufficient (no need to support multiple upstream providers simultaneously in the proxy flow).

## Out of Scope

- Automatic user provisioning from OAuth claims (users must exist in MemberJunction).
- New OAuth providers beyond those already implemented in MJServer (Auth0, MSAL, Okta, Cognito, Google).
- OAuth scopes tied to upstream identity provider scopes (proxy issues its own scopes stored in MJ database).
- Client credentials grant flow (machine-to-machine auth) - use API keys for this use case.
- Persistent storage of dynamically registered clients (in-memory with TTL is sufficient for MVP).
- Token introspection endpoint (RFC 7662) - not required by MCP specification.
- Token revocation endpoint (RFC 7009) - tokens expire naturally.
- Device authorization grant (RFC 8628) - standard authorization code flow is sufficient.
