------------------------------------------------------------------
-- MCP OAuth Entities Migration
-- Adds OAuth 2.1 support with Dynamic Client Registration (DCR)
-- for MCP Server authentication
--
-- NOTE: This migration only contains DDL. Entity metadata (names,
-- icons, settings) are managed via mj-sync in /metadata/entities/
------------------------------------------------------------------

------------------------------------------------------------------
-- PART 1: Add OAuth fields to MCP Server table
------------------------------------------------------------------

-- Add OAuth configuration fields to MCPServer
ALTER TABLE [${flyway:defaultSchema}].[MCPServer] ADD
    OAuthIssuerURL NVARCHAR(1000) NULL,
    OAuthScopes NVARCHAR(500) NULL,
    OAuthMetadataCacheTTLMinutes INT NULL DEFAULT 1440,
    OAuthClientID NVARCHAR(255) NULL,
    OAuthClientSecretEncrypted NVARCHAR(MAX) NULL,
    OAuthRequirePKCE BIT NOT NULL DEFAULT 1;
GO

-- Add descriptions for new fields
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Authorization server issuer URL for OAuth 2.1 authentication (e.g., https://auth.example.com).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthIssuerURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Space-delimited OAuth scopes to request (e.g., "read write admin").',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthScopes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cache TTL for authorization server metadata in minutes. Default 1440 (24 hours).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthMetadataCacheTTLMinutes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pre-configured OAuth client ID (when DCR is not supported).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthClientID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pre-configured OAuth client secret (encrypted at rest, when DCR is not supported).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthClientSecretEncrypted';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to require PKCE for OAuth flows. Always true for OAuth 2.1 compliance.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthRequirePKCE';
GO

------------------------------------------------------------------
-- PART 2: Create OAuth Auth Server Metadata Cache table
------------------------------------------------------------------

CREATE TABLE [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    IssuerURL NVARCHAR(1000) NOT NULL,
    AuthorizationEndpoint NVARCHAR(1000) NOT NULL,
    TokenEndpoint NVARCHAR(1000) NOT NULL,
    RegistrationEndpoint NVARCHAR(1000) NULL,
    RevocationEndpoint NVARCHAR(1000) NULL,
    JwksURI NVARCHAR(1000) NULL,
    ScopesSupported NVARCHAR(MAX) NULL,
    ResponseTypesSupported NVARCHAR(MAX) NOT NULL,
    GrantTypesSupported NVARCHAR(MAX) NULL,
    TokenEndpointAuthMethods NVARCHAR(MAX) NULL,
    CodeChallengeMethodsSupported NVARCHAR(MAX) NULL,
    MetadataJSON NVARCHAR(MAX) NOT NULL,
    CachedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIMEOFFSET NOT NULL,
    CONSTRAINT PK_OAuthAuthServerMetadataCache PRIMARY KEY (ID),
    CONSTRAINT UQ_OAuthAuthServerMetadataCache_IssuerURL UNIQUE (IssuerURL)
);
GO

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Caches OAuth 2.0 Authorization Server Metadata (RFC 8414) to reduce discovery requests.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache';
GO

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Authorization server issuer identifier URL.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'IssuerURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the authorization endpoint.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'AuthorizationEndpoint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the token endpoint.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'TokenEndpoint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the dynamic client registration endpoint (RFC 7591).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'RegistrationEndpoint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full authorization server metadata JSON for debugging and extensibility.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'MetadataJSON';
GO

------------------------------------------------------------------
-- PART 3: Create OAuth Client Registrations table
------------------------------------------------------------------

CREATE TABLE [${flyway:defaultSchema}].[OAuthClientRegistration] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MCPServerConnectionID UNIQUEIDENTIFIER NOT NULL,
    MCPServerID UNIQUEIDENTIFIER NOT NULL,
    IssuerURL NVARCHAR(1000) NOT NULL,
    ClientID NVARCHAR(500) NOT NULL,
    ClientSecretEncrypted NVARCHAR(MAX) NULL,
    ClientIDIssuedAt DATETIMEOFFSET NULL,
    ClientSecretExpiresAt DATETIMEOFFSET NULL,
    RegistrationAccessToken NVARCHAR(MAX) NULL,
    RegistrationClientURI NVARCHAR(1000) NULL,
    RedirectURIs NVARCHAR(MAX) NOT NULL,
    GrantTypes NVARCHAR(MAX) NOT NULL,
    ResponseTypes NVARCHAR(MAX) NOT NULL,
    Scope NVARCHAR(500) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    RegistrationResponse NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_OAuthClientRegistration PRIMARY KEY (ID),
    CONSTRAINT FK_OAuthClientRegistration_Connection FOREIGN KEY (MCPServerConnectionID)
        REFERENCES [${flyway:defaultSchema}].[MCPServerConnection](ID),
    CONSTRAINT FK_OAuthClientRegistration_Server FOREIGN KEY (MCPServerID)
        REFERENCES [${flyway:defaultSchema}].[MCPServer](ID),
    CONSTRAINT CK_OAuthClientRegistration_Status
        CHECK (Status IN ('Active', 'Expired', 'Revoked'))
);
GO

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores OAuth Dynamic Client Registration (DCR) results per RFC 7591.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration';
GO

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The MCP Server Connection this registration belongs to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'MCPServerConnectionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth client ID assigned by the authorization server.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'ClientID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth client secret (encrypted at rest) for confidential clients.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'ClientSecretEncrypted';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registration status: Active, Expired, or Revoked.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full DCR response JSON for debugging and extensibility.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'RegistrationResponse';
GO

------------------------------------------------------------------
-- PART 4: Create OAuth Authorization States table
------------------------------------------------------------------

CREATE TABLE [${flyway:defaultSchema}].[OAuthAuthorizationState] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MCPServerConnectionID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    StateParameter NVARCHAR(128) NOT NULL,
    CodeVerifier NVARCHAR(128) NOT NULL,
    CodeChallenge NVARCHAR(128) NOT NULL,
    RedirectURI NVARCHAR(1000) NOT NULL,
    RequestedScopes NVARCHAR(500) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    AuthorizationURL NVARCHAR(MAX) NOT NULL,
    ErrorCode NVARCHAR(100) NULL,
    ErrorDescription NVARCHAR(MAX) NULL,
    InitiatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIMEOFFSET NOT NULL,
    CompletedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_OAuthAuthorizationState PRIMARY KEY (ID),
    CONSTRAINT FK_OAuthAuthorizationState_Connection FOREIGN KEY (MCPServerConnectionID)
        REFERENCES [${flyway:defaultSchema}].[MCPServerConnection](ID),
    CONSTRAINT FK_OAuthAuthorizationState_User FOREIGN KEY (UserID)
        REFERENCES [${flyway:defaultSchema}].[User](ID),
    CONSTRAINT UQ_OAuthAuthorizationState_StateParameter UNIQUE (StateParameter),
    CONSTRAINT CK_OAuthAuthorizationState_Status
        CHECK (Status IN ('Pending', 'Completed', 'Failed', 'Expired'))
);
GO

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks in-progress OAuth authorization flows with PKCE data for security.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState';
GO

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cryptographic state parameter for CSRF protection.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'StateParameter';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'PKCE code verifier for token exchange (stored securely, never sent to auth server).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'CodeVerifier';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'PKCE code challenge sent to authorization server.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'CodeChallenge';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flow status: Pending, Completed, Failed, or Expired.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

------------------------------------------------------------------
-- PART 5: Create OAuth Tokens table
-- Tokens are stored via CredentialEngine for consistent encryption
-- and audit logging.
------------------------------------------------------------------

CREATE TABLE [${flyway:defaultSchema}].[OAuthToken] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MCPServerConnectionID UNIQUEIDENTIFIER NOT NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    TokenType NVARCHAR(50) NOT NULL DEFAULT 'Bearer',
    ExpiresAt DATETIMEOFFSET NOT NULL,
    Scope NVARCHAR(500) NULL,
    IssuerURL NVARCHAR(1000) NOT NULL,
    LastRefreshAt DATETIMEOFFSET NULL,
    RefreshCount INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_OAuthToken PRIMARY KEY (ID),
    CONSTRAINT FK_OAuthToken_Connection FOREIGN KEY (MCPServerConnectionID)
        REFERENCES [${flyway:defaultSchema}].[MCPServerConnection](ID),
    CONSTRAINT FK_OAuthToken_Credential FOREIGN KEY (CredentialID)
        REFERENCES [${flyway:defaultSchema}].[Credential](ID),
    CONSTRAINT UQ_OAuthToken_Connection UNIQUE (MCPServerConnectionID)
);
GO

-- Add table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores OAuth token metadata for MCP server connections. Actual tokens are stored via CredentialEngine for consistent encryption and audit logging.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken';
GO

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Credential table where the OAuth tokens (access and refresh) are stored securely via CredentialEngine.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the access token expires.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the token has been refreshed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'RefreshCount';
GO
