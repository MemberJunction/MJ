# Data Model: MCP OAuth with Dynamic Client Registration

**Feature**: 001-mcp-oauth-dcr
**Date**: 2026-01-29

## Entity Overview

This feature requires modifications to existing entities and creation of new entities to support OAuth 2.1 authentication for MCP connections.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Entity Relationships                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐         ┌──────────────────────────────────────┐  │
│  │    MCP Servers      │────────►│   MJ: O Auth Auth Server Metadata     │  │
│  │  (existing, modify) │  1:0..1 │            Cache                     │  │
│  │                     │         │         (new entity)                 │  │
│  └─────────┬───────────┘         └──────────────────────────────────────┘  │
│            │                                                                │
│            │ 1:N                                                            │
│            ▼                                                                │
│  ┌─────────────────────┐         ┌──────────────────────────────────────┐  │
│  │ MCP Server          │────────►│   MJ: O Auth Client Registrations     │  │
│  │    Connections      │  1:0..1 │         (new entity)                 │  │
│  │ (existing, no mod)  │         └──────────────────────────────────────┘  │
│  └─────────┬───────────┘                                                   │
│            │                                                                │
│            │ 1:N                                                            │
│            ▼                                                                │
│  ┌─────────────────────┐                                                   │
│  │   MJ: O Auth         │                                                   │
│  │ Authorization States│                                                   │
│  │   (new entity)      │                                                   │
│  └─────────────────────┘                                                   │
│                                                                             │
│  ┌─────────────────────┐                                                   │
│  │   MJ: Credential    │  (existing - add new type for OAuth tokens)       │
│  │      Types          │                                                   │
│  └─────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modified Entities

### MCP Servers (existing)

Add OAuth-specific configuration fields to support both DCR and pre-configured client scenarios.

**New Fields**:

| Field Name                   | Type          | Required | Default | Description                                                      |
| ---------------------------- | ------------- | -------- | ------- | ---------------------------------------------------------------- |
| OAuthIssuerURL               | NVARCHAR(500) | No       | NULL    | Authorization server issuer URL for metadata discovery           |
| OAuthScopes                  | NVARCHAR(500) | No       | NULL    | Space-delimited OAuth scopes required for this server            |
| OAuthMetadataCacheTTLMinutes | INT           | No       | 1440    | TTL for auth server metadata cache (default 24 hours)            |
| OAuthClientID                | NVARCHAR(200) | No       | NULL    | Pre-registered client ID when DCR not available                  |
| OAuthClientSecretEncrypted   | NVARCHAR(MAX) | No       | NULL    | Pre-registered client secret (encrypted via MJ field encryption) |
| OAuthRequirePKCE             | BIT           | No       | 1       | Whether to require PKCE (always true for OAuth 2.1)              |

**Validation Rules**:
- If `DefaultAuthType = 'OAuth2'`, then `OAuthIssuerURL` is required
- `OAuthMetadataCacheTTLMinutes` must be >= 5 if provided

**Migration SQL** (partial):
```sql
ALTER TABLE ${flyway:defaultSchema}.[MCP Servers] ADD
    OAuthIssuerURL NVARCHAR(500) NULL,
    OAuthScopes NVARCHAR(500) NULL,
    OAuthMetadataCacheTTLMinutes INT NULL DEFAULT 1440,
    OAuthClientID NVARCHAR(200) NULL,
    OAuthClientSecretEncrypted NVARCHAR(MAX) NULL,
    OAuthRequirePKCE BIT NOT NULL DEFAULT 1;

-- Add constraint for OAuth configuration consistency
ALTER TABLE ${flyway:defaultSchema}.[MCP Servers]
ADD CONSTRAINT CK_MCPServers_OAuth_Config
CHECK (
    DefaultAuthType <> 'OAuth2'
    OR OAuthIssuerURL IS NOT NULL
);
```

---

## New Entities

### MJ: O Auth Auth Server Metadata Cache

Caches authorization server metadata from RFC 8414 discovery to reduce network requests.

**Entity Name**: `MJ: O Auth Auth Server Metadata Cache`
**Table Name**: `[MJ: O Auth Auth Server Metadata Cache]`

| Field Name                    | Type             | Required | Default           | Description                                        |
| ----------------------------- | ---------------- | -------- | ----------------- | -------------------------------------------------- |
| ID                            | UNIQUEIDENTIFIER | Yes      | NEWSEQUENTIALID() | Primary key                                        |
| IssuerURL                     | NVARCHAR(500)    | Yes      | -                 | Unique issuer URL (e.g., https://auth.example.com) |
| AuthorizationEndpoint         | NVARCHAR(500)    | Yes      | -                 | OAuth authorization endpoint URL                   |
| TokenEndpoint                 | NVARCHAR(500)    | Yes      | -                 | OAuth token endpoint URL                           |
| RegistrationEndpoint          | NVARCHAR(500)    | No       | NULL              | DCR endpoint URL (if supported)                    |
| RevocationEndpoint            | NVARCHAR(500)    | No       | NULL              | Token revocation endpoint                          |
| JwksURI                       | NVARCHAR(500)    | No       | NULL              | JSON Web Key Set URI                               |
| ScopesSupported               | NVARCHAR(MAX)    | No       | NULL              | JSON array of supported scopes                     |
| ResponseTypesSupported        | NVARCHAR(MAX)    | Yes      | -                 | JSON array of supported response types             |
| GrantTypesSupported           | NVARCHAR(MAX)    | No       | NULL              | JSON array of supported grant types                |
| TokenEndpointAuthMethods      | NVARCHAR(500)    | No       | NULL              | JSON array of supported auth methods               |
| CodeChallengeMethodsSupported | NVARCHAR(200)    | No       | NULL              | JSON array of PKCE methods supported               |
| MetadataJSON                  | NVARCHAR(MAX)    | Yes      | -                 | Full raw metadata JSON for future fields           |
| CachedAt                      | DATETIMEOFFSET   | Yes      | GETUTCDATE()      | When metadata was cached                           |
| ExpiresAt                     | DATETIMEOFFSET   | Yes      | -                 | When cache entry expires                           |

**Constraints**:
- `PK_OAuthAuthServerMetadataCache` on ID
- `UQ_OAuthAuthServerMetadataCache_Issuer` UNIQUE on IssuerURL

**Indexes** (CodeGen will add FK indexes):
- Unique index on IssuerURL for lookups

---

### MJ: O Auth Client Registrations

Stores dynamically registered OAuth client credentials per MCP connection.

**Entity Name**: `MJ: O Auth Client Registrations`
**Table Name**: `[MJ: O Auth Client Registrations]`

| Field Name              | Type             | Required | Default           | Description                                               |
| ----------------------- | ---------------- | -------- | ----------------- | --------------------------------------------------------- |
| ID                      | UNIQUEIDENTIFIER | Yes      | NEWSEQUENTIALID() | Primary key                                               |
| MCPServerConnectionID   | UNIQUEIDENTIFIER | Yes      | -                 | FK to MCP Server Connection                               |
| MCPServerID             | UNIQUEIDENTIFIER | Yes      | -                 | FK to MCP Server (denormalized for queries)               |
| IssuerURL               | NVARCHAR(500)    | Yes      | -                 | Authorization server that issued this registration        |
| ClientID                | NVARCHAR(200)    | Yes      | -                 | Registered client ID                                      |
| ClientSecretEncrypted   | NVARCHAR(MAX)    | No       | NULL              | Client secret (encrypted, may be null for public clients) |
| ClientIDIssuedAt        | DATETIMEOFFSET   | No       | NULL              | When client ID was issued                                 |
| ClientSecretExpiresAt   | DATETIMEOFFSET   | No       | NULL              | When client secret expires                                |
| RegistrationAccessToken | NVARCHAR(MAX)    | No       | NULL              | Token for managing registration (encrypted)               |
| RegistrationClientURI   | NVARCHAR(500)    | No       | NULL              | URI for managing this registration                        |
| RedirectURIs            | NVARCHAR(MAX)    | Yes      | -                 | JSON array of registered redirect URIs                    |
| GrantTypes              | NVARCHAR(200)    | Yes      | -                 | JSON array of granted grant types                         |
| ResponseTypes           | NVARCHAR(200)    | Yes      | -                 | JSON array of granted response types                      |
| Scope                   | NVARCHAR(500)    | No       | NULL              | Granted scope (may differ from requested)                 |
| Status                  | NVARCHAR(20)     | Yes      | 'Active'          | Active, Expired, Revoked                                  |
| RegistrationResponse    | NVARCHAR(MAX)    | Yes      | -                 | Full raw registration response JSON                       |

**Constraints**:
- `PK_OAuthClientRegistrations` on ID
- `FK_OAuthClientRegistrations_Connection` to `[MCP Server Connections]`(ID)
- `FK_OAuthClientRegistrations_Server` to `[MCP Servers]`(ID)
- `UQ_OAuthClientRegistrations_Connection` UNIQUE on MCPServerConnectionID (one registration per connection)

**Status Values**:
- `Active` - Registration is valid and usable
- `Expired` - Client secret has expired, needs re-registration
- `Revoked` - Registration was revoked by admin or auth server

---

### MJ: O Auth Authorization States

Tracks in-progress OAuth authorization flows for callback validation and timeout handling.

**Entity Name**: `MJ: O Auth Authorization States`
**Table Name**: `[MJ: O Auth Authorization States]`

| Field Name            | Type             | Required | Default           | Description                               |
| --------------------- | ---------------- | -------- | ----------------- | ----------------------------------------- |
| ID                    | UNIQUEIDENTIFIER | Yes      | NEWSEQUENTIALID() | Primary key                               |
| MCPServerConnectionID | UNIQUEIDENTIFIER | Yes      | -                 | FK to MCP Server Connection               |
| UserID                | UNIQUEIDENTIFIER | Yes      | -                 | FK to User initiating authorization       |
| StateParameter        | NVARCHAR(100)    | Yes      | -                 | Cryptographic state for CSRF protection   |
| CodeVerifier          | NVARCHAR(200)    | Yes      | -                 | PKCE code_verifier (encrypted)            |
| CodeChallenge         | NVARCHAR(100)    | Yes      | -                 | PKCE code_challenge (can be stored plain) |
| RedirectURI           | NVARCHAR(500)    | Yes      | -                 | Redirect URI used for this flow           |
| RequestedScopes       | NVARCHAR(500)    | No       | NULL              | Scopes requested in authorization         |
| Status                | NVARCHAR(20)     | Yes      | 'Pending'         | Pending, Completed, Failed, Expired       |
| AuthorizationURL      | NVARCHAR(MAX)    | Yes      | -                 | Full authorization URL for user redirect  |
| ErrorCode             | NVARCHAR(100)    | No       | NULL              | Error code if failed                      |
| ErrorDescription      | NVARCHAR(500)    | No       | NULL              | Error description if failed               |
| InitiatedAt           | DATETIMEOFFSET   | Yes      | GETUTCDATE()      | When flow was initiated                   |
| ExpiresAt             | DATETIMEOFFSET   | Yes      | -                 | When flow times out (default: +5 minutes) |
| CompletedAt           | DATETIMEOFFSET   | No       | NULL              | When flow completed (success or failure)  |

**Constraints**:
- `PK_OAuthAuthorizationStates` on ID
- `FK_OAuthAuthorizationStates_Connection` to `[MCP Server Connections]`(ID)
- `FK_OAuthAuthorizationStates_User` to `[User]`(ID)
- `UQ_OAuthAuthorizationStates_State` UNIQUE on StateParameter

**Status Values**:
- `Pending` - Authorization initiated, waiting for user consent
- `Completed` - Tokens received, flow successful
- `Failed` - Error occurred during flow
- `Expired` - Flow timed out (5 minute default)

**Cleanup**: Expired and completed records older than 24 hours can be purged.

---

## New Credential Type

### OAuth2 Authorization Code

A new credential type for storing OAuth tokens obtained via authorization code flow.

**Credential Type Record**:
```sql
INSERT INTO ${flyway:defaultSchema}.[Credential Types] (
    ID, Name, Description, FieldSchema
) VALUES (
    'A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D',  -- Fixed UUID
    'OAuth2 Authorization Code',
    'OAuth 2.0 tokens obtained via Authorization Code flow with PKCE',
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "required": ["access_token", "token_type", "expires_at", "authorization_server_issuer"],
        "properties": {
            "access_token": {
                "type": "string",
                "description": "OAuth access token"
            },
            "token_type": {
                "type": "string",
                "description": "Token type (usually Bearer)",
                "default": "Bearer"
            },
            "expires_at": {
                "type": "integer",
                "description": "Unix timestamp when access token expires"
            },
            "refresh_token": {
                "type": "string",
                "description": "OAuth refresh token (optional)"
            },
            "scope": {
                "type": "string",
                "description": "Granted scopes (space-delimited)"
            },
            "authorization_server_issuer": {
                "type": "string",
                "description": "Issuer URL of the authorization server"
            },
            "last_refresh_at": {
                "type": "integer",
                "description": "Unix timestamp of last token refresh"
            },
            "refresh_count": {
                "type": "integer",
                "description": "Number of times token has been refreshed",
                "default": 0
            }
        }
    }'
);
```

**TypeScript Interface**:
```typescript
interface OAuth2AuthCodeCredentialValues {
    access_token: string;
    token_type: string;
    expires_at: number;
    refresh_token?: string;
    scope?: string;
    authorization_server_issuer: string;
    last_refresh_at?: number;
    refresh_count?: number;
}
```

---

## State Transitions

### OAuth Authorization State Machine

```
                          ┌─────────────┐
                          │   (start)   │
                          └──────┬──────┘
                                 │
                                 ▼
                          ┌─────────────┐
              ┌──────────►│   Pending   │◄─────────┐
              │           └──────┬──────┘          │
              │                  │                 │
              │    User consent  │    5 min timeout│
              │                  │                 │
              │           ┌──────┴──────┐          │
              │           │             │          │
              │           ▼             ▼          │
              │    ┌─────────────┐ ┌─────────────┐ │
              │    │  Completed  │ │   Expired   │ │
              │    └─────────────┘ └─────────────┘ │
              │                                    │
              │    ┌─────────────┐                 │
              └────│   Failed    │─────────────────┘
                   └─────────────┘
                   (can retry from Failed)
```

### MCP Connection OAuth Status

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MCP Connection Status Flow                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  DefaultAuthType != OAuth2           DefaultAuthType == OAuth2          │
│  ─────────────────────────           ────────────────────────           │
│       │                                    │                            │
│       │                                    ▼                            │
│       │                          ┌─────────────────┐                    │
│       │                          │ Check for valid │                    │
│       │                          │     tokens      │                    │
│       │                          └────────┬────────┘                    │
│       │                                   │                             │
│       │              ┌────────────────────┼────────────────────┐        │
│       │              │                    │                    │        │
│       │              ▼                    ▼                    ▼        │
│       │       No tokens         Expired access      Valid tokens        │
│       │       ──────────        token, valid        ────────────        │
│       │              │          refresh token             │             │
│       │              │          ──────────────            │             │
│       │              │                 │                  │             │
│       │              ▼                 ▼                  │             │
│       │       ┌─────────────┐  ┌─────────────┐           │             │
│       │       │   Initiate  │  │   Refresh   │           │             │
│       │       │    Auth     │  │   Tokens    │           │             │
│       │       │    Flow     │  │             │           │             │
│       │       └──────┬──────┘  └──────┬──────┘           │             │
│       │              │                │                  │             │
│       │              │    ┌───────────┘                  │             │
│       │              │    │                              │             │
│       │              ▼    ▼                              ▼             │
│       │         ┌─────────────┐                  ┌─────────────┐       │
│       └────────►│  Connected  │◄─────────────────│  Connected  │       │
│                 │ (standard)  │                  │  (OAuth)    │       │
│                 └─────────────┘                  └─────────────┘       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Audit Events

All OAuth operations should be logged to the existing audit system:

| Event Type                      | Description                  | Logged Data                                                |
| ------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `OAuthAuthorizationInitiated`   | User started OAuth flow      | ConnectionID, UserID, Scopes, Timestamp                    |
| `OAuthAuthorizationCompleted`   | User completed consent       | ConnectionID, UserID, GrantedScopes, Timestamp             |
| `OAuthAuthorizationFailed`      | OAuth flow failed            | ConnectionID, UserID, ErrorCode, Timestamp                 |
| `OAuthTokenRefreshed`           | Token successfully refreshed | ConnectionID, UserID, Timestamp                            |
| `OAuthTokenRefreshFailed`       | Token refresh failed         | ConnectionID, UserID, ErrorCode, Timestamp                 |
| `OAuthCredentialsRevoked`       | Admin revoked OAuth access   | ConnectionID, UserID, RevokedByUserID, Timestamp           |
| `OAuthClientRegistered`         | DCR succeeded                | ConnectionID, MCPServerID, IssuerURL, Timestamp            |
| `OAuthClientRegistrationFailed` | DCR failed                   | ConnectionID, MCPServerID, IssuerURL, ErrorCode, Timestamp |

---

## Migration File Structure

**File**: `migrations/v2/V202601291200__v2.x_mcp_oauth_entities.sql`

```sql
-- =============================================
-- MCP OAuth with Dynamic Client Registration
-- Feature: 001-mcp-oauth-dcr
-- Date: 2026-01-29
-- =============================================

-- 1. Add OAuth fields to MCP Servers
ALTER TABLE ${flyway:defaultSchema}.[MCP Servers] ADD
    OAuthIssuerURL NVARCHAR(500) NULL,
    OAuthScopes NVARCHAR(500) NULL,
    OAuthMetadataCacheTTLMinutes INT NULL,
    OAuthClientID NVARCHAR(200) NULL,
    OAuthClientSecretEncrypted NVARCHAR(MAX) NULL,
    OAuthRequirePKCE BIT NOT NULL CONSTRAINT DF_MCPServers_OAuthRequirePKCE DEFAULT 1;
GO

-- 2. Create OAuth Auth Server Metadata Cache table
CREATE TABLE ${flyway:defaultSchema}.[MJ: O Auth Auth Server Metadata Cache] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    IssuerURL NVARCHAR(500) NOT NULL,
    AuthorizationEndpoint NVARCHAR(500) NOT NULL,
    TokenEndpoint NVARCHAR(500) NOT NULL,
    RegistrationEndpoint NVARCHAR(500) NULL,
    RevocationEndpoint NVARCHAR(500) NULL,
    JwksURI NVARCHAR(500) NULL,
    ScopesSupported NVARCHAR(MAX) NULL,
    ResponseTypesSupported NVARCHAR(MAX) NOT NULL,
    GrantTypesSupported NVARCHAR(MAX) NULL,
    TokenEndpointAuthMethods NVARCHAR(500) NULL,
    CodeChallengeMethodsSupported NVARCHAR(200) NULL,
    MetadataJSON NVARCHAR(MAX) NOT NULL,
    CachedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIMEOFFSET NOT NULL,
    CONSTRAINT PK_OAuthAuthServerMetadataCache PRIMARY KEY (ID),
    CONSTRAINT UQ_OAuthAuthServerMetadataCache_Issuer UNIQUE (IssuerURL)
);
GO

-- 3. Create OAuth Client Registrations table
CREATE TABLE ${flyway:defaultSchema}.[MJ: O Auth Client Registrations] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MCPServerConnectionID UNIQUEIDENTIFIER NOT NULL,
    MCPServerID UNIQUEIDENTIFIER NOT NULL,
    IssuerURL NVARCHAR(500) NOT NULL,
    ClientID NVARCHAR(200) NOT NULL,
    ClientSecretEncrypted NVARCHAR(MAX) NULL,
    ClientIDIssuedAt DATETIMEOFFSET NULL,
    ClientSecretExpiresAt DATETIMEOFFSET NULL,
    RegistrationAccessToken NVARCHAR(MAX) NULL,
    RegistrationClientURI NVARCHAR(500) NULL,
    RedirectURIs NVARCHAR(MAX) NOT NULL,
    GrantTypes NVARCHAR(200) NOT NULL,
    ResponseTypes NVARCHAR(200) NOT NULL,
    Scope NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    RegistrationResponse NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_OAuthClientRegistrations PRIMARY KEY (ID),
    CONSTRAINT FK_OAuthClientRegistrations_Connection
        FOREIGN KEY (MCPServerConnectionID) REFERENCES ${flyway:defaultSchema}.[MCP Server Connections](ID),
    CONSTRAINT FK_OAuthClientRegistrations_Server
        FOREIGN KEY (MCPServerID) REFERENCES ${flyway:defaultSchema}.[MCP Servers](ID),
    CONSTRAINT UQ_OAuthClientRegistrations_Connection UNIQUE (MCPServerConnectionID),
    CONSTRAINT CK_OAuthClientRegistrations_Status
        CHECK (Status IN ('Active', 'Expired', 'Revoked'))
);
GO

-- 4. Create OAuth Authorization States table
CREATE TABLE ${flyway:defaultSchema}.[MJ: O Auth Authorization States] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MCPServerConnectionID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    StateParameter NVARCHAR(100) NOT NULL,
    CodeVerifier NVARCHAR(200) NOT NULL,
    CodeChallenge NVARCHAR(100) NOT NULL,
    RedirectURI NVARCHAR(500) NOT NULL,
    RequestedScopes NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    AuthorizationURL NVARCHAR(MAX) NOT NULL,
    ErrorCode NVARCHAR(100) NULL,
    ErrorDescription NVARCHAR(500) NULL,
    InitiatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIMEOFFSET NOT NULL,
    CompletedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_OAuthAuthorizationStates PRIMARY KEY (ID),
    CONSTRAINT FK_OAuthAuthorizationStates_Connection
        FOREIGN KEY (MCPServerConnectionID) REFERENCES ${flyway:defaultSchema}.[MCP Server Connections](ID),
    CONSTRAINT FK_OAuthAuthorizationStates_User
        FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_OAuthAuthorizationStates_State UNIQUE (StateParameter),
    CONSTRAINT CK_OAuthAuthorizationStates_Status
        CHECK (Status IN ('Pending', 'Completed', 'Failed', 'Expired'))
);
GO

-- 5. Insert OAuth2 Authorization Code credential type
INSERT INTO ${flyway:defaultSchema}.[Credential Types] (
    ID, Name, Description, FieldSchema
) VALUES (
    'A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D',
    'OAuth2 Authorization Code',
    'OAuth 2.0 tokens obtained via Authorization Code flow with PKCE',
    '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","required":["access_token","token_type","expires_at","authorization_server_issuer"],"properties":{"access_token":{"type":"string","description":"OAuth access token"},"token_type":{"type":"string","description":"Token type (usually Bearer)","default":"Bearer"},"expires_at":{"type":"integer","description":"Unix timestamp when access token expires"},"refresh_token":{"type":"string","description":"OAuth refresh token (optional)"},"scope":{"type":"string","description":"Granted scopes (space-delimited)"},"authorization_server_issuer":{"type":"string","description":"Issuer URL of the authorization server"},"last_refresh_at":{"type":"integer","description":"Unix timestamp of last token refresh"},"refresh_count":{"type":"integer","description":"Number of times token has been refreshed","default":0}}}'
);
GO

-- Note: __mj_CreatedAt, __mj_UpdatedAt columns and FK indexes will be added by CodeGen
```
