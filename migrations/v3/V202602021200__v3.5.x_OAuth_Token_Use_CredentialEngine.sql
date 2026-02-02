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

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Space-delimited OAuth scopes to request (e.g., "read write admin").',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthScopes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cache TTL for authorization server metadata in minutes. Default 1440 (24 hours).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthMetadataCacheTTLMinutes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pre-configured OAuth client ID (when DCR is not supported).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthClientID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pre-configured OAuth client secret (encrypted at rest, when DCR is not supported).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MCPServer',
    @level2type = N'COLUMN', @level2name = N'OAuthClientSecretEncrypted';

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

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Authorization server issuer identifier URL.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'IssuerURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the authorization endpoint.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'AuthorizationEndpoint';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the token endpoint.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'TokenEndpoint';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL of the dynamic client registration endpoint (RFC 7591).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthServerMetadataCache',
    @level2type = N'COLUMN', @level2name = N'RegistrationEndpoint';

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

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The MCP Server Connection this registration belongs to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'MCPServerConnectionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth client ID assigned by the authorization server.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'ClientID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth client secret (encrypted at rest) for confidential clients.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'ClientSecretEncrypted';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registration status: Active, Expired, or Revoked.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthClientRegistration',
    @level2type = N'COLUMN', @level2name = N'Status';

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
    FrontendReturnURL NVARCHAR(1000) NULL,
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

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to redirect the user to after OAuth completion. If set, the OAuth callback will redirect here instead of showing a static HTML page.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'FrontendReturnURL';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cryptographic state parameter for CSRF protection.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'StateParameter';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'PKCE code verifier for token exchange (stored securely, never sent to auth server).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'CodeVerifier';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'PKCE code challenge sent to authorization server.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthAuthorizationState',
    @level2type = N'COLUMN', @level2name = N'CodeChallenge';

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

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Credential table where the OAuth tokens (access and refresh) are stored securely via CredentialEngine.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'CredentialID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the access token expires.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the token has been refreshed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'OAuthToken',
    @level2type = N'COLUMN', @level2name = N'RefreshCount';
GO

-- SQL Logging Session
-- Session ID: 2055ad55-5752-4795-9a28-8188312365ef
-- Started: 2026-02-02T17:57:14.511Z
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction SQLServerDataProvider

-- Save MJ: Credential Types (core SP call only)
DECLARE @ID_bd0943d1 UNIQUEIDENTIFIER,
@Name_bd0943d1 NVARCHAR(100),
@Description_bd0943d1 NVARCHAR(MAX),
@Category_bd0943d1 NVARCHAR(50),
@FieldSchema_bd0943d1 NVARCHAR(MAX),
@IconClass_bd0943d1 NVARCHAR(100),
@ValidationEndpoint_bd0943d1 NVARCHAR(500)
SET
  @ID_bd0943d1 = '27C1B4B7-8846-4C26-BD71-6DAB629A9AC4'
SET
  @Name_bd0943d1 = N'Box.com OAuth'
SET
  @Description_bd0943d1 = N'Box.com OAuth2 credentials for file storage integration. Supports OAuth2 refresh token flow (recommended), client credentials grant for enterprise/service accounts, and direct access tokens. Box issues new refresh tokens on each token refresh.'
SET
  @Category_bd0943d1 = N'Storage'
SET
  @FieldSchema_bd0943d1 = N'{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"clientId":{"type":"string","title":"Client ID","description":"Box application client ID from the Box Developer Console","isSecret":false,"order":0},"clientSecret":{"type":"string","title":"Client Secret","description":"Box application client secret from the Box Developer Console","isSecret":true,"order":1},"tokenUrl":{"type":"string","title":"Token URL","description":"OAuth2 token endpoint URL for Box.com","const":"https://api.box.com/oauth2/token","isSecret":false,"order":2},"refreshToken":{"type":"string","title":"Refresh Token","description":"OAuth2 refresh token for long-term access (recommended). Box issues new refresh tokens on each token refresh.","isSecret":true,"order":3},"accessToken":{"type":"string","title":"Access Token","description":"OAuth2 access token for temporary direct access (short-lived, not recommended for production)","isSecret":true,"order":4},"enterpriseId":{"type":"string","title":"Enterprise ID","description":"Box enterprise ID for client credentials grant authentication (required for service account access)","isSecret":false,"order":5},"boxSubjectType":{"type":"string","title":"Subject Type","description":"Type of subject to authenticate as (enterprise or user). Used with client credentials grant.","enum":["enterprise","user"],"isSecret":false,"order":6},"boxSubjectId":{"type":"string","title":"Subject ID","description":"Enterprise ID or User ID to authenticate as. Used with client credentials grant for ''act as'' functionality.","isSecret":false,"order":7},"rootFolderId":{"type":"string","title":"Root Folder ID","description":"Optional Box folder ID to restrict access to a specific folder. Defaults to ''0'' (root).","isSecret":false,"order":8,"default":"0"}},"required":["clientId","clientSecret","tokenUrl"]}'
SET
  @IconClass_bd0943d1 = N'fa-solid fa-box'
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_bd0943d1,
  @Name = @Name_bd0943d1,
  @Description = @Description_bd0943d1,
  @Category = @Category_bd0943d1,
  @FieldSchema = @FieldSchema_bd0943d1,
  @IconClass = @IconClass_bd0943d1,
  @ValidationEndpoint = @ValidationEndpoint_bd0943d1;

-- Save MJ: Credential Types (core SP call only)
DECLARE @ID_ac4bd8c3 UNIQUEIDENTIFIER,
@Name_ac4bd8c3 NVARCHAR(100),
@Description_ac4bd8c3 NVARCHAR(MAX),
@Category_ac4bd8c3 NVARCHAR(50),
@FieldSchema_ac4bd8c3 NVARCHAR(MAX),
@IconClass_ac4bd8c3 NVARCHAR(100),
@ValidationEndpoint_ac4bd8c3 NVARCHAR(500)
SET
  @ID_ac4bd8c3 = '257F4DDB-385E-47A4-A1A4-316BAAE044D4'
SET
  @Name_ac4bd8c3 = N'MCP OAuth Token'
SET
  @Description_ac4bd8c3 = N'OAuth2 tokens for MCP server connections. Stores access and refresh tokens issued during the OAuth authorization flow. Tokens are managed automatically by the MCP OAuth system.'
SET
  @Category_ac4bd8c3 = N'Authentication'
SET
  @FieldSchema_ac4bd8c3 = N'{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","title":"MCP OAuth Token","description":"OAuth2 tokens for MCP server connections","properties":{"accessToken":{"type":"string","description":"OAuth2 access token for authenticating MCP API requests","minLength":1},"refreshToken":{"type":"string","description":"OAuth2 refresh token for obtaining new access tokens when the current one expires"}},"required":["accessToken"],"additionalProperties":false}'
SET
  @IconClass_ac4bd8c3 = N'fa-solid fa-plug'
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_ac4bd8c3,
  @Name = @Name_ac4bd8c3,
  @Description = @Description_ac4bd8c3,
  @Category = @Category_ac4bd8c3,
  @FieldSchema = @FieldSchema_ac4bd8c3,
  @IconClass = @IconClass_ac4bd8c3,
  @ValidationEndpoint = @ValidationEndpoint_ac4bd8c3;

-- Save Applications (core SP call only)
DECLARE @Name_4295b44e NVARCHAR(100),
@Description_4295b44e NVARCHAR(MAX),
@Icon_4295b44e NVARCHAR(500),
@DefaultForNewUser_4295b44e BIT,
@SchemaAutoAddNewEntities_4295b44e NVARCHAR(MAX),
@Color_4295b44e NVARCHAR(20),
@DefaultNavItems_4295b44e NVARCHAR(MAX),
@ClassName_4295b44e NVARCHAR(255),
@DefaultSequence_4295b44e INT,
@Status_4295b44e NVARCHAR(20),
@NavigationStyle_4295b44e NVARCHAR(20),
@TopNavLocation_4295b44e NVARCHAR(30),
@HideNavBarIconWhenActive_4295b44e BIT,
@Path_4295b44e NVARCHAR(100),
@AutoUpdatePath_4295b44e BIT,
@ID_4295b44e UNIQUEIDENTIFIER
SET
  @Name_4295b44e = N'Actions'
SET
  @Description_4295b44e = N'Manage and monitor all system actions and workflows'
SET
  @Icon_4295b44e = N'fa-solid fa-bolt'
SET
  @DefaultForNewUser_4295b44e = 1
SET
  @Color_4295b44e = N'#ff9800'
SET
  @DefaultNavItems_4295b44e = N'[
  {
    "Label": "Overview",
    "Icon": "fa-solid fa-bolt",
    "ResourceType": "Custom",
    "DriverClass": "ActionsOverviewResource",
    "isDefault": true
  },
  {
    "Label": "Explorer",
    "Icon": "fa-solid fa-folder-tree",
    "ResourceType": "Custom",
    "DriverClass": "ActionExplorerResource",
    "isDefault": false
  },
  {
    "Label": "Monitor",
    "Icon": "fa-solid fa-chart-line",
    "ResourceType": "Custom",
    "DriverClass": "ActionsMonitorResource",
    "isDefault": false
  }
]'
SET
  @DefaultSequence_4295b44e = 1000
SET
  @Status_4295b44e = N'Active'
SET
  @NavigationStyle_4295b44e = N'App Switcher'
SET
  @HideNavBarIconWhenActive_4295b44e = 0
SET
  @Path_4295b44e = N'actions'
SET
  @AutoUpdatePath_4295b44e = 1
SET
  @ID_4295b44e = '02D5423E-F36B-1410-8DAC-00021F8B792E'
EXEC [${flyway:defaultSchema}].spUpdateApplication @Name = @Name_4295b44e,
  @Description = @Description_4295b44e,
  @Icon = @Icon_4295b44e,
  @DefaultForNewUser = @DefaultForNewUser_4295b44e,
  @SchemaAutoAddNewEntities = @SchemaAutoAddNewEntities_4295b44e,
  @Color = @Color_4295b44e,
  @DefaultNavItems = @DefaultNavItems_4295b44e,
  @ClassName = @ClassName_4295b44e,
  @DefaultSequence = @DefaultSequence_4295b44e,
  @Status = @Status_4295b44e,
  @NavigationStyle = @NavigationStyle_4295b44e,
  @TopNavLocation = @TopNavLocation_4295b44e,
  @HideNavBarIconWhenActive = @HideNavBarIconWhenActive_4295b44e,
  @Path = @Path_4295b44e,
  @AutoUpdatePath = @AutoUpdatePath_4295b44e,
  @ID = @ID_4295b44e;

-- Save Applications (core SP call only)
DECLARE @Name_9a8e88e2 NVARCHAR(100),
@Description_9a8e88e2 NVARCHAR(MAX),
@Icon_9a8e88e2 NVARCHAR(500),
@DefaultForNewUser_9a8e88e2 BIT,
@SchemaAutoAddNewEntities_9a8e88e2 NVARCHAR(MAX),
@Color_9a8e88e2 NVARCHAR(20),
@DefaultNavItems_9a8e88e2 NVARCHAR(MAX),
@ClassName_9a8e88e2 NVARCHAR(255),
@DefaultSequence_9a8e88e2 INT,
@Status_9a8e88e2 NVARCHAR(20),
@NavigationStyle_9a8e88e2 NVARCHAR(20),
@TopNavLocation_9a8e88e2 NVARCHAR(30),
@HideNavBarIconWhenActive_9a8e88e2 BIT,
@Path_9a8e88e2 NVARCHAR(100),
@AutoUpdatePath_9a8e88e2 BIT,
@ID_9a8e88e2 UNIQUEIDENTIFIER
SET
  @Name_9a8e88e2 = N'AI'
SET
  @Description_9a8e88e2 = N'AI Administration'
SET
  @Icon_9a8e88e2 = N'fa-solid fa-robot'
SET
  @DefaultForNewUser_9a8e88e2 = 0
SET
  @Color_9a8e88e2 = N'#d32f2f'
SET
  @DefaultNavItems_9a8e88e2 = N'[
  {
    "Label": "Monitor",
    "Icon": "fa-solid fa-chart-line",
    "ResourceType": "Custom",
    "DriverClass": "AIMonitorResource",
    "isDefault": true
  },
  {
    "Label": "Prompts",
    "Icon": "fa-solid fa-comment-dots",
    "ResourceType": "Custom",
    "DriverClass": "AIPromptsResource",
    "isDefault": false
  },
  {
    "Label": "Agents",
    "Icon": "fa-solid fa-robot",
    "ResourceType": "Custom",
    "DriverClass": "AIAgentsResource",
    "isDefault": false
  },
  {
    "Label": "Models",
    "Icon": "fa-solid fa-microchip",
    "ResourceType": "Custom",
    "DriverClass": "AIModelsResource",
    "isDefault": false
  },
  {
    "Label": "Configuration",
    "Icon": "fa-solid fa-cogs",
    "ResourceType": "Custom",
    "DriverClass": "AIConfigResource",
    "isDefault": false
  },
  {
    "Label": "MCP",
    "Icon": "fa-solid fa-plug-circle-bolt",
    "ResourceType": "Custom",
    "DriverClass": "MCPResource",
    "isDefault": false
  }
]'
SET
  @DefaultSequence_9a8e88e2 = 1001
SET
  @Status_9a8e88e2 = N'Active'
SET
  @NavigationStyle_9a8e88e2 = N'App Switcher'
SET
  @HideNavBarIconWhenActive_9a8e88e2 = 0
SET
  @Path_9a8e88e2 = N'ai'
SET
  @AutoUpdatePath_9a8e88e2 = 1
SET
  @ID_9a8e88e2 = '7ACD423E-F36B-1410-8DAC-00021F8B792E'
EXEC [${flyway:defaultSchema}].spUpdateApplication @Name = @Name_9a8e88e2,
  @Description = @Description_9a8e88e2,
  @Icon = @Icon_9a8e88e2,
  @DefaultForNewUser = @DefaultForNewUser_9a8e88e2,
  @SchemaAutoAddNewEntities = @SchemaAutoAddNewEntities_9a8e88e2,
  @Color = @Color_9a8e88e2,
  @DefaultNavItems = @DefaultNavItems_9a8e88e2,
  @ClassName = @ClassName_9a8e88e2,
  @DefaultSequence = @DefaultSequence_9a8e88e2,
  @Status = @Status_9a8e88e2,
  @NavigationStyle = @NavigationStyle_9a8e88e2,
  @TopNavLocation = @TopNavLocation_9a8e88e2,
  @HideNavBarIconWhenActive = @HideNavBarIconWhenActive_9a8e88e2,
  @Path = @Path_9a8e88e2,
  @AutoUpdatePath = @AutoUpdatePath_9a8e88e2,
  @ID = @ID_9a8e88e2;


-- End of SQL Logging Session
-- Session ID: 2055ad55-5752-4795-9a28-8188312365ef
-- Completed: 2026-02-02T17:57:25.423Z
-- Duration: 10912ms
-- Total Statements: 4

/* SQL generated to create new entity MJ: O Auth Client Registrations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '704792e8-d4fc-4a52-8120-7d0df1127ff8',
         'MJ: O Auth Client Registrations',
         'O Auth Client Registrations',
         NULL,
         NULL,
         'OAuthClientRegistration',
         'vwOAuthClientRegistrations',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new entity MJ: O Auth Client Registrations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '704792e8-d4fc-4a52-8120-7d0df1127ff8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: O Auth Client Registrations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('704792e8-d4fc-4a52-8120-7d0df1127ff8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: O Auth Client Registrations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('704792e8-d4fc-4a52-8120-7d0df1127ff8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: O Auth Client Registrations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('704792e8-d4fc-4a52-8120-7d0df1127ff8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: O Auth Authorization States */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'ef86f759-b7f0-4d5d-a594-8bc395129acf',
         'MJ: O Auth Authorization States',
         'O Auth Authorization States',
         NULL,
         NULL,
         'OAuthAuthorizationState',
         'vwOAuthAuthorizationStates',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new entity MJ: O Auth Authorization States to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ef86f759-b7f0-4d5d-a594-8bc395129acf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: O Auth Authorization States for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ef86f759-b7f0-4d5d-a594-8bc395129acf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: O Auth Authorization States for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ef86f759-b7f0-4d5d-a594-8bc395129acf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: O Auth Authorization States for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ef86f759-b7f0-4d5d-a594-8bc395129acf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: O Auth Tokens */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'e6ff1529-89b9-452b-9703-ff26f9e8aa18',
         'MJ: O Auth Tokens',
         'O Auth Tokens',
         NULL,
         NULL,
         'OAuthToken',
         'vwOAuthTokens',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new entity MJ: O Auth Tokens to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e6ff1529-89b9-452b-9703-ff26f9e8aa18', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: O Auth Tokens for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6ff1529-89b9-452b-9703-ff26f9e8aa18', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: O Auth Tokens for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6ff1529-89b9-452b-9703-ff26f9e8aa18', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: O Auth Tokens for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6ff1529-89b9-452b-9703-ff26f9e8aa18', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: O Auth Auth Server Metadata Caches */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'ea592498-ec43-4853-878d-4b44d19581e5',
         'MJ: O Auth Auth Server Metadata Caches',
         'O Auth Auth Server Metadata Caches',
         NULL,
         NULL,
         'OAuthAuthServerMetadataCache',
         'vwOAuthAuthServerMetadataCaches',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new entity MJ: O Auth Auth Server Metadata Caches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ea592498-ec43-4853-878d-4b44d19581e5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: O Auth Auth Server Metadata Caches for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ea592498-ec43-4853-878d-4b44d19581e5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: O Auth Auth Server Metadata Caches for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ea592498-ec43-4853-878d-4b44d19581e5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: O Auth Auth Server Metadata Caches for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ea592498-ec43-4853-878d-4b44d19581e5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OAuthAuthServerMetadataCache */
ALTER TABLE [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OAuthAuthServerMetadataCache */
ALTER TABLE [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OAuthClientRegistration */
ALTER TABLE [${flyway:defaultSchema}].[OAuthClientRegistration] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OAuthClientRegistration */
ALTER TABLE [${flyway:defaultSchema}].[OAuthClientRegistration] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OAuthAuthorizationState */
ALTER TABLE [${flyway:defaultSchema}].[OAuthAuthorizationState] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OAuthAuthorizationState */
ALTER TABLE [${flyway:defaultSchema}].[OAuthAuthorizationState] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OAuthToken */
ALTER TABLE [${flyway:defaultSchema}].[OAuthToken] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OAuthToken */
ALTER TABLE [${flyway:defaultSchema}].[OAuthToken] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a5d652bc-bdd5-4f44-8e82-517ca20c2c66'  OR
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5d652bc-bdd5-4f44-8e82-517ca20c2c66',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100035,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7c84b7e4-f784-450d-894d-3c62d2ab9e89'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c84b7e4-f784-450d-894d-3c62d2ab9e89',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '2d99eaa5-55fe-4db6-94f1-06b9084a1f3e'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'IssuerURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2d99eaa5-55fe-4db6-94f1-06b9084a1f3e',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100002,
            'IssuerURL',
            'Issuer URL',
            'Authorization server issuer identifier URL.',
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '6e0ebbb1-1fda-43ec-8ef8-5215bf061103'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'AuthorizationEndpoint')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e0ebbb1-1fda-43ec-8ef8-5215bf061103',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100003,
            'AuthorizationEndpoint',
            'Authorization Endpoint',
            'URL of the authorization endpoint.',
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '16f76f5d-58c6-488d-961e-ebe95a992290'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'TokenEndpoint')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '16f76f5d-58c6-488d-961e-ebe95a992290',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100004,
            'TokenEndpoint',
            'Token Endpoint',
            'URL of the token endpoint.',
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '1c291cac-6970-4c9b-b509-ffd7570bbded'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'RegistrationEndpoint')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1c291cac-6970-4c9b-b509-ffd7570bbded',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100005,
            'RegistrationEndpoint',
            'Registration Endpoint',
            'URL of the dynamic client registration endpoint (RFC 7591).',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5129fcc5-fef5-45ec-9102-20618d333cd6'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'RevocationEndpoint')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5129fcc5-fef5-45ec-9102-20618d333cd6',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100006,
            'RevocationEndpoint',
            'Revocation Endpoint',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e9c60260-2636-44ac-a973-b6aaf2114ed5'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'JwksURI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e9c60260-2636-44ac-a973-b6aaf2114ed5',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100007,
            'JwksURI',
            'Jwks URI',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5e7995a7-8fd9-4bec-b2eb-8f354a84c30b'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'ScopesSupported')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5e7995a7-8fd9-4bec-b2eb-8f354a84c30b',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100008,
            'ScopesSupported',
            'Scopes Supported',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b741febc-4ba0-4ccb-a139-a6fbbdeca779'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'ResponseTypesSupported')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b741febc-4ba0-4ccb-a139-a6fbbdeca779',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100009,
            'ResponseTypesSupported',
            'Response Types Supported',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a1fc3de6-0faf-4a7d-9b78-58f16e9002c1'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'GrantTypesSupported')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a1fc3de6-0faf-4a7d-9b78-58f16e9002c1',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100010,
            'GrantTypesSupported',
            'Grant Types Supported',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '522a3268-f0cf-4102-af91-c549034a65b7'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'TokenEndpointAuthMethods')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '522a3268-f0cf-4102-af91-c549034a65b7',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100011,
            'TokenEndpointAuthMethods',
            'Token Endpoint Auth Methods',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '073b7c06-08b2-48e4-98b3-c5f8e3d14a07'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'CodeChallengeMethodsSupported')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '073b7c06-08b2-48e4-98b3-c5f8e3d14a07',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100012,
            'CodeChallengeMethodsSupported',
            'Code Challenge Methods Supported',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'be9d0320-a971-4afe-b649-14a1d0628f50'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'MetadataJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be9d0320-a971-4afe-b649-14a1d0628f50',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100013,
            'MetadataJSON',
            'Metadata JSON',
            'Full authorization server metadata JSON for debugging and extensibility.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'efa51223-c0db-4db0-85b7-8833d773d20d'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'CachedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'efa51223-c0db-4db0-85b7-8833d773d20d',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100014,
            'CachedAt',
            'Cached At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'ac756ef6-b25b-4c99-b9cf-c4a6cbc08a82'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = 'ExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac756ef6-b25b-4c99-b9cf-c4a6cbc08a82',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100015,
            'ExpiresAt',
            'Expires At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '61731276-f225-46e1-942d-170a2030a4c1'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '61731276-f225-46e1-942d-170a2030a4c1',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100016,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b640e6d9-abbb-4fe1-ae79-bf3cf2abc797'  OR
               (EntityID = 'EA592498-EC43-4853-878D-4B44D19581E5' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b640e6d9-abbb-4fe1-ae79-bf3cf2abc797',
            'EA592498-EC43-4853-878D-4B44D19581E5', -- Entity: MJ: O Auth Auth Server Metadata Caches
            100017,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '6f32c190-7fe5-4869-bdd2-cd25491f3431'  OR
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftPrimaryKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f32c190-7fe5-4869-bdd2-cd25491f3431',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100123,
            'IsSoftPrimaryKey',
            'Is Soft Primary Key',
            'When 1, indicates IsPrimaryKey was set via metadata (not a database constraint). Protects IsPrimaryKey from being cleared by schema sync.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '27529e6e-4c4c-421e-92d0-ad38b1b06d7d'  OR
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftForeignKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27529e6e-4c4c-421e-92d0-ad38b1b06d7d',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100124,
            'IsSoftForeignKey',
            'Is Soft Foreign Key',
            'When 1, indicates RelatedEntityID/RelatedEntityFieldName were set via metadata (not a database constraint). Protects these fields from being cleared by schema sync.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '92c1ee8f-f124-4d73-aa53-fafcf739b33c'  OR
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedEntityJoinFields')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '92c1ee8f-f124-4d73-aa53-fafcf739b33c',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100125,
            'RelatedEntityJoinFields',
            'Related Entity Join Fields',
            'JSON configuration for additional fields to join from the related entity into this entity''s base view. Supports modes: extend (add to NameField), override (replace NameField), disable (no joins). Schema: { mode?: string, fields?: [{ field: string, alias?: string }] }',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '11701ecd-5b8a-482f-9207-922de9f8df07'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '11701ecd-5b8a-482f-9207-922de9f8df07',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7ee91989-02bf-4445-9437-3b35e9ec405f'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7ee91989-02bf-4445-9437-3b35e9ec405f',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            'The MCP Server Connection this registration belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '64fbf137-644a-43a2-a0a4-35818fa22eed'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'MCPServerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64fbf137-644a-43a2-a0a4-35818fa22eed',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100003,
            'MCPServerID',
            'MCP Server ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '92925b8f-2d50-4e29-abcb-b0ee088f4e78'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'IssuerURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '92925b8f-2d50-4e29-abcb-b0ee088f4e78',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100004,
            'IssuerURL',
            'Issuer URL',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '8f92576f-2566-4457-9e80-397b1a1fae75'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ClientID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8f92576f-2566-4457-9e80-397b1a1fae75',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100005,
            'ClientID',
            'Client ID',
            'OAuth client ID assigned by the authorization server.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '191c9333-6a90-4f9e-8a9c-9fb7e7859244'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ClientSecretEncrypted')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '191c9333-6a90-4f9e-8a9c-9fb7e7859244',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100006,
            'ClientSecretEncrypted',
            'Client Secret Encrypted',
            'OAuth client secret (encrypted at rest) for confidential clients.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '98997a74-6852-43ad-9417-4588b415bd6d'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ClientIDIssuedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '98997a74-6852-43ad-9417-4588b415bd6d',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100007,
            'ClientIDIssuedAt',
            'Client ID Issued At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '1fbf8ff6-3844-4d23-8af3-eb6e763e87bb'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ClientSecretExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1fbf8ff6-3844-4d23-8af3-eb6e763e87bb',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100008,
            'ClientSecretExpiresAt',
            'Client Secret Expires At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e903e43b-b68f-418a-bf9c-d9152d484ca8'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'RegistrationAccessToken')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e903e43b-b68f-418a-bf9c-d9152d484ca8',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100009,
            'RegistrationAccessToken',
            'Registration Access Token',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '14858a39-67a6-40a3-811e-7c574eef8e99'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'RegistrationClientURI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '14858a39-67a6-40a3-811e-7c574eef8e99',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100010,
            'RegistrationClientURI',
            'Registration Client URI',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'abf4ca3c-d0e4-4bbd-a837-b39ca5beeb8b'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'RedirectURIs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'abf4ca3c-d0e4-4bbd-a837-b39ca5beeb8b',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100011,
            'RedirectURIs',
            'Redirect UR Is',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '04db557f-8260-4d59-a8db-54016c3412b2'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'GrantTypes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '04db557f-8260-4d59-a8db-54016c3412b2',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100012,
            'GrantTypes',
            'Grant Types',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a87e131e-8932-45fb-8a80-ea0fe3a84715'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'ResponseTypes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a87e131e-8932-45fb-8a80-ea0fe3a84715',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100013,
            'ResponseTypes',
            'Response Types',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '33e61886-6e66-4d24-8ea5-fe278ecb9f3d'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'Scope')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '33e61886-6e66-4d24-8ea5-fe278ecb9f3d',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100014,
            'Scope',
            'Scope',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '9a6564d4-96bb-4c5d-9f21-a6eb3c893c8a'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9a6564d4-96bb-4c5d-9f21-a6eb3c893c8a',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100015,
            'Status',
            'Status',
            'Registration status: Active, Expired, or Revoked.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '4f193d16-6b07-4109-87ba-90900d05c784'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'RegistrationResponse')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4f193d16-6b07-4109-87ba-90900d05c784',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100016,
            'RegistrationResponse',
            'Registration Response',
            'Full DCR response JSON for debugging and extensibility.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e4a79b96-9464-46c0-8ac8-d0a28b1053c7'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4a79b96-9464-46c0-8ac8-d0a28b1053c7',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100017,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'f0135b4c-6701-4642-b792-eb8f88ce453a'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f0135b4c-6701-4642-b792-eb8f88ce453a',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100018,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '1690998a-3b16-45f8-999a-27a1629b5544'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1690998a-3b16-45f8-999a-27a1629b5544',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'f7e03fa9-e9fe-4d13-8039-7b10e9781f99'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f7e03fa9-e9fe-4d13-8039-7b10e9781f99',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'f2effa2e-1302-4ced-8ddd-efe4eb65f439'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f2effa2e-1302-4ced-8ddd-efe4eb65f439',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'ca539730-193f-4b7e-9196-97cce55a8fb8'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'StateParameter')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca539730-193f-4b7e-9196-97cce55a8fb8',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100004,
            'StateParameter',
            'State Parameter',
            'Cryptographic state parameter for CSRF protection.',
            'nvarchar',
            256,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '3f977d99-e05c-4d71-888a-4b2db2ed3987'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'CodeVerifier')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3f977d99-e05c-4d71-888a-4b2db2ed3987',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100005,
            'CodeVerifier',
            'Code Verifier',
            'PKCE code verifier for token exchange (stored securely, never sent to auth server).',
            'nvarchar',
            256,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '01a12972-9074-4e62-9fd1-3f6e5170b06f'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'CodeChallenge')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '01a12972-9074-4e62-9fd1-3f6e5170b06f',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100006,
            'CodeChallenge',
            'Code Challenge',
            'PKCE code challenge sent to authorization server.',
            'nvarchar',
            256,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'f891604e-ff2c-43b4-9128-c6aa0507f529'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'RedirectURI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f891604e-ff2c-43b4-9128-c6aa0507f529',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100007,
            'RedirectURI',
            'Redirect URI',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '372e7f18-05cc-47db-acdc-be10102eef14'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'RequestedScopes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '372e7f18-05cc-47db-acdc-be10102eef14',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100008,
            'RequestedScopes',
            'Requested Scopes',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '657a6551-3c71-41cc-a181-6695329932fb'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '657a6551-3c71-41cc-a181-6695329932fb',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100009,
            'Status',
            'Status',
            'Flow status: Pending, Completed, Failed, or Expired.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '3652aca2-11d2-4e02-bc26-d6732b4f833f'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'AuthorizationURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3652aca2-11d2-4e02-bc26-d6732b4f833f',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100010,
            'AuthorizationURL',
            'Authorization URL',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a77e315b-8596-4d27-914b-bcd40c4a6d91'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'ErrorCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a77e315b-8596-4d27-914b-bcd40c4a6d91',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100011,
            'ErrorCode',
            'Error Code',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '0598154f-9c71-4ac8-afe5-7b04550e15cf'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'ErrorDescription')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0598154f-9c71-4ac8-afe5-7b04550e15cf',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100012,
            'ErrorDescription',
            'Error Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7539b56b-da14-413d-a02a-996bb390721f'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'InitiatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7539b56b-da14-413d-a02a-996bb390721f',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100013,
            'InitiatedAt',
            'Initiated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b9324643-03de-4f4b-aebf-a7e82169fd26'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'ExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b9324643-03de-4f4b-aebf-a7e82169fd26',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100014,
            'ExpiresAt',
            'Expires At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '8d1e4b43-a929-423f-940c-3bc6eee37d5c'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'CompletedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d1e4b43-a929-423f-940c-3bc6eee37d5c',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100015,
            'CompletedAt',
            'Completed At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '15e95073-e9a8-4a9f-b991-3925df66d469'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'FrontendReturnURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '15e95073-e9a8-4a9f-b991-3925df66d469',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100016,
            'FrontendReturnURL',
            'Frontend Return URL',
            'URL to redirect the user to after OAuth completion. If set, the OAuth callback will redirect here instead of showing a static HTML page.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'bebcfded-c3c2-448f-b9b1-0c9e0e843dbe'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bebcfded-c3c2-448f-b9b1-0c9e0e843dbe',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100017,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7a3ceca5-e57f-4447-b3e5-8f45aa918a8e'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7a3ceca5-e57f-4447-b3e5-8f45aa918a8e',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100018,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7a0b3ab7-8971-49bb-931d-0b89164bc4e0'  OR
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7a0b3ab7-8971-49bb-931d-0b89164bc4e0',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100021,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7b4bdab0-26e8-43fe-a306-252516cc6570'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthIssuerURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b4bdab0-26e8-43fe-a306-252516cc6570',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100046,
            'OAuthIssuerURL',
            'O Auth Issuer URL',
            'Authorization server issuer URL for OAuth 2.1 authentication (e.g., https://auth.example.com).',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '7af5bd45-f899-4f3b-831a-665865504de7'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthScopes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7af5bd45-f899-4f3b-831a-665865504de7',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100047,
            'OAuthScopes',
            'O Auth Scopes',
            'Space-delimited OAuth scopes to request (e.g., "read write admin").',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'd0af2fd9-ee53-4fbe-9d9b-194ae59c78d2'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthMetadataCacheTTLMinutes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd0af2fd9-ee53-4fbe-9d9b-194ae59c78d2',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100048,
            'OAuthMetadataCacheTTLMinutes',
            'O Auth Metadata Cache TTL Minutes',
            'Cache TTL for authorization server metadata in minutes. Default 1440 (24 hours).',
            'int',
            4,
            10,
            0,
            1,
            '(1440)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '33dc553e-2fc3-4f3a-8e03-cc56830356bd'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthClientID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '33dc553e-2fc3-4f3a-8e03-cc56830356bd',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100049,
            'OAuthClientID',
            'O Auth Client ID',
            'Pre-configured OAuth client ID (when DCR is not supported).',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '0a0d9189-80c7-40e2-8349-7011357ecadc'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthClientSecretEncrypted')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0a0d9189-80c7-40e2-8349-7011357ecadc',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100050,
            'OAuthClientSecretEncrypted',
            'O Auth Client Secret Encrypted',
            'Pre-configured OAuth client secret (encrypted at rest, when DCR is not supported).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'a42f9072-17e9-4e70-be98-ebe521d50f7e'  OR
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'OAuthRequirePKCE')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a42f9072-17e9-4e70-be98-ebe521d50f7e',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100051,
            'OAuthRequirePKCE',
            'O Auth Require PKCE',
            'Whether to require PKCE for OAuth flows. Always true for OAuth 2.1 compliance.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e9bdc248-3d14-4ff1-8f4f-b022b5b516ea'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e9bdc248-3d14-4ff1-8f4f-b022b5b516ea',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'd5fe5352-7e58-48c7-af9c-dadc26590ccd'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd5fe5352-7e58-48c7-af9c-dadc26590ccd',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '4205f16c-4412-45f3-bc1e-4e0b9faa89b1'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'CredentialID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4205f16c-4412-45f3-bc1e-4e0b9faa89b1',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100003,
            'CredentialID',
            'Credential ID',
            'Foreign key to Credential table where the OAuth tokens (access and refresh) are stored securely via CredentialEngine.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '73e04f9b-9199-4029-8165-3bf016d21ca6'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'TokenType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '73e04f9b-9199-4029-8165-3bf016d21ca6',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100004,
            'TokenType',
            'Token Type',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Bearer',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '156a6181-8097-41d3-a61e-7959f3b76747'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'ExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '156a6181-8097-41d3-a61e-7959f3b76747',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100005,
            'ExpiresAt',
            'Expires At',
            'When the access token expires.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b344ad6f-aa93-44b5-9284-36eca037943f'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'Scope')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b344ad6f-aa93-44b5-9284-36eca037943f',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100006,
            'Scope',
            'Scope',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '096ca3b1-c022-46d0-828b-69aa01cce2af'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'IssuerURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '096ca3b1-c022-46d0-828b-69aa01cce2af',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100007,
            'IssuerURL',
            'Issuer URL',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '80d6bc02-1c19-4cab-8485-0784eeee5825'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'LastRefreshAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '80d6bc02-1c19-4cab-8485-0784eeee5825',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100008,
            'LastRefreshAt',
            'Last Refresh At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '1d43ebe0-f3c5-462f-94b7-ea7998570b77'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'RefreshCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d43ebe0-f3c5-462f-94b7-ea7998570b77',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100009,
            'RefreshCount',
            'Refresh Count',
            'Number of times the token has been refreshed.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '3dd434c6-09fa-415c-94fe-d4543a2de6a3'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3dd434c6-09fa-415c-94fe-d4543a2de6a3',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '911a0718-70ad-466b-bd77-343d36b885c4'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '911a0718-70ad-466b-bd77-343d36b885c4',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field value with ID f8f627c8-9e94-4b78-af55-70d1d220da02 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f8f627c8-9e94-4b78-af55-70d1d220da02', '9A6564D4-96BB-4C5D-9F21-A6EB3C893C8A', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 5bda5f11-70bc-4000-9044-1706dd520786 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5bda5f11-70bc-4000-9044-1706dd520786', '9A6564D4-96BB-4C5D-9F21-A6EB3C893C8A', 2, 'Expired', 'Expired')

/* SQL text to insert entity field value with ID c0c8451e-69e8-4d9d-82ff-45a87904977b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c0c8451e-69e8-4d9d-82ff-45a87904977b', '9A6564D4-96BB-4C5D-9F21-A6EB3C893C8A', 3, 'Revoked', 'Revoked')

/* SQL text to update ValueListType for entity field ID 9A6564D4-96BB-4C5D-9F21-A6EB3C893C8A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9A6564D4-96BB-4C5D-9F21-A6EB3C893C8A'

/* SQL text to insert entity field value with ID 4a593592-9053-47e0-b4e6-482ffecdc6e9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4a593592-9053-47e0-b4e6-482ffecdc6e9', '657A6551-3C71-41CC-A181-6695329932FB', 1, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID 6866f84b-4cf8-4fd2-9bb3-6705c538877f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6866f84b-4cf8-4fd2-9bb3-6705c538877f', '657A6551-3C71-41CC-A181-6695329932FB', 2, 'Expired', 'Expired')

/* SQL text to insert entity field value with ID 2ffdf0a0-1c7d-491f-b0db-75f1091645bb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2ffdf0a0-1c7d-491f-b0db-75f1091645bb', '657A6551-3C71-41CC-A181-6695329932FB', 3, 'Failed', 'Failed')

/* SQL text to insert entity field value with ID 3b6e8486-2153-477c-8f3f-12e80371f4a8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3b6e8486-2153-477c-8f3f-12e80371f4a8', '657A6551-3C71-41CC-A181-6695329932FB', 4, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID 657A6551-3C71-41CC-A181-6695329932FB */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='657A6551-3C71-41CC-A181-6695329932FB'

/* SQL text to delete entity field value ID 84EC433E-F36B-1410-885B-00D02208DC50 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='84EC433E-F36B-1410-885B-00D02208DC50'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b0ee42fc-08ee-4698-b2fd-7c29439a9120'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b0ee42fc-08ee-4698-b2fd-7c29439a9120', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'EF86F759-B7F0-4D5D-A594-8BC395129ACF', 'UserID', 'One To Many', 1, 1, 'MJ: O Auth Authorization States', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '903807b1-dffc-4e8e-8cac-b72f17c6b522'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('903807b1-dffc-4e8e-8cac-b72f17c6b522', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'E6FF1529-89B9-452B-9703-FF26F9E8AA18', 'CredentialID', 'One To Many', 1, 1, 'MJ: O Auth Tokens', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '29a203f4-2d8f-442b-8907-67aa9ba8dd50'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('29a203f4-2d8f-442b-8907-67aa9ba8dd50', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', '704792E8-D4FC-4A52-8120-7D0DF1127FF8', 'MCPServerID', 'One To Many', 1, 1, 'MJ: O Auth Client Registrations', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '03d1d811-bdde-4f3b-97f4-47e85b264180'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('03d1d811-bdde-4f3b-97f4-47e85b264180', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'E6FF1529-89B9-452B-9703-FF26F9E8AA18', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: O Auth Tokens', 2);
   END

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd2dcd2c3-87d6-4ed5-ac63-1761d718b618'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d2dcd2c3-87d6-4ed5-ac63-1761d718b618', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', '704792E8-D4FC-4A52-8120-7D0DF1127FF8', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: O Auth Client Registrations', 2);
   END

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '93cb8292-a4ab-4290-9b7c-07391a9bf432'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('93cb8292-a4ab-4290-9b7c-07391a9bf432', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'EF86F759-B7F0-4D5D-A594-8BC395129ACF', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: O Auth Authorization States', 2);
   END


/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]


/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit,
    @IsSoftPrimaryKey bit,
    @IsSoftForeignKey bit,
    @RelatedEntityJoinFields nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue,
        [IsSoftPrimaryKey] = @IsSoftPrimaryKey,
        [IsSoftForeignKey] = @IsSoftForeignKey,
        [RelatedEntityJoinFields] = @RelatedEntityJoinFields
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]


/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID ON [${flyway:defaultSchema}].[APIKeyScope] ([APIKeyID]);

-- Index for foreign key ScopeID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID ON [${flyway:defaultSchema}].[APIKeyScope] ([ScopeID]);

/* Base View SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIScope_ScopeID.[Name] AS [Scope]
FROM
    [${flyway:defaultSchema}].[APIKeyScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ScopeID
  ON
    [a].[ScopeID] = APIScope_ScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [ID],
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20),
    @IsDeny bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        [APIKeyID] = @APIKeyID,
        [ScopeID] = @ScopeID,
        [ResourcePattern] = @ResourcePattern,
        [PatternType] = @PatternType,
        [IsDeny] = @IsDeny,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyScopes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyScope
ON [${flyway:defaultSchema}].[APIKeyScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]


/* spDelete Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]



/* Index for Foreign Keys for APIKeyUsageLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([APIKeyID]);

-- Index for foreign key ApplicationID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([ApplicationID]);

/* Base View SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Usage Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyUsageLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyUsageLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[APIKeyUsageLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Permissions for vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [ID],
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20),
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        [APIKeyID] = @APIKeyID,
        [Endpoint] = @Endpoint,
        [Operation] = @Operation,
        [Method] = @Method,
        [StatusCode] = @StatusCode,
        [ResponseTimeMs] = @ResponseTimeMs,
        [IPAddress] = @IPAddress,
        [UserAgent] = @UserAgent,
        [ApplicationID] = @ApplicationID,
        [RequestedResource] = @RequestedResource,
        [ScopesEvaluated] = @ScopesEvaluated,
        [AuthorizationResult] = @AuthorizationResult,
        [DeniedReason] = @DeniedReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyUsageLog
ON [${flyway:defaultSchema}].[APIKeyUsageLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]


/* spDelete Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]



/* Index for Foreign Keys for MCPServer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table MCPServer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServer_CredentialTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServer_CredentialTypeID ON [${flyway:defaultSchema}].[MCPServer] ([CredentialTypeID]);

/* Base View SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: vwMCPServers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Servers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServers]
AS
SELECT
    m.*,
    CredentialType_CredentialTypeID.[Name] AS [CredentialType]
FROM
    [${flyway:defaultSchema}].[MCPServer] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS CredentialType_CredentialTypeID
  ON
    [m].[CredentialTypeID] = CredentialType_CredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: Permissions for vwMCPServers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spCreateMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServer]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ServerURL nvarchar(1000),
    @Command nvarchar(500),
    @CommandArgs nvarchar(MAX),
    @TransportType nvarchar(50),
    @DefaultAuthType nvarchar(50),
    @CredentialTypeID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @LastSyncAt datetimeoffset,
    @RateLimitPerMinute int,
    @RateLimitPerHour int,
    @ConnectionTimeoutMs int,
    @RequestTimeoutMs int,
    @DocumentationURL nvarchar(1000),
    @IconClass nvarchar(100),
    @OAuthIssuerURL nvarchar(1000),
    @OAuthScopes nvarchar(500),
    @OAuthMetadataCacheTTLMinutes int,
    @OAuthClientID nvarchar(255),
    @OAuthClientSecretEncrypted nvarchar(MAX),
    @OAuthRequirePKCE bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServer]
            (
                [ID],
                [Name],
                [Description],
                [ServerURL],
                [Command],
                [CommandArgs],
                [TransportType],
                [DefaultAuthType],
                [CredentialTypeID],
                [Status],
                [LastSyncAt],
                [RateLimitPerMinute],
                [RateLimitPerHour],
                [ConnectionTimeoutMs],
                [RequestTimeoutMs],
                [DocumentationURL],
                [IconClass],
                [OAuthIssuerURL],
                [OAuthScopes],
                [OAuthMetadataCacheTTLMinutes],
                [OAuthClientID],
                [OAuthClientSecretEncrypted],
                [OAuthRequirePKCE]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ServerURL,
                @Command,
                @CommandArgs,
                @TransportType,
                @DefaultAuthType,
                @CredentialTypeID,
                ISNULL(@Status, 'Active'),
                @LastSyncAt,
                @RateLimitPerMinute,
                @RateLimitPerHour,
                @ConnectionTimeoutMs,
                @RequestTimeoutMs,
                @DocumentationURL,
                @IconClass,
                @OAuthIssuerURL,
                @OAuthScopes,
                @OAuthMetadataCacheTTLMinutes,
                @OAuthClientID,
                @OAuthClientSecretEncrypted,
                ISNULL(@OAuthRequirePKCE, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServer]
            (
                [Name],
                [Description],
                [ServerURL],
                [Command],
                [CommandArgs],
                [TransportType],
                [DefaultAuthType],
                [CredentialTypeID],
                [Status],
                [LastSyncAt],
                [RateLimitPerMinute],
                [RateLimitPerHour],
                [ConnectionTimeoutMs],
                [RequestTimeoutMs],
                [DocumentationURL],
                [IconClass],
                [OAuthIssuerURL],
                [OAuthScopes],
                [OAuthMetadataCacheTTLMinutes],
                [OAuthClientID],
                [OAuthClientSecretEncrypted],
                [OAuthRequirePKCE]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ServerURL,
                @Command,
                @CommandArgs,
                @TransportType,
                @DefaultAuthType,
                @CredentialTypeID,
                ISNULL(@Status, 'Active'),
                @LastSyncAt,
                @RateLimitPerMinute,
                @RateLimitPerHour,
                @ConnectionTimeoutMs,
                @RequestTimeoutMs,
                @DocumentationURL,
                @IconClass,
                @OAuthIssuerURL,
                @OAuthScopes,
                @OAuthMetadataCacheTTLMinutes,
                @OAuthClientID,
                @OAuthClientSecretEncrypted,
                ISNULL(@OAuthRequirePKCE, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServer] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServer] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spUpdateMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServer]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ServerURL nvarchar(1000),
    @Command nvarchar(500),
    @CommandArgs nvarchar(MAX),
    @TransportType nvarchar(50),
    @DefaultAuthType nvarchar(50),
    @CredentialTypeID uniqueidentifier,
    @Status nvarchar(50),
    @LastSyncAt datetimeoffset,
    @RateLimitPerMinute int,
    @RateLimitPerHour int,
    @ConnectionTimeoutMs int,
    @RequestTimeoutMs int,
    @DocumentationURL nvarchar(1000),
    @IconClass nvarchar(100),
    @OAuthIssuerURL nvarchar(1000),
    @OAuthScopes nvarchar(500),
    @OAuthMetadataCacheTTLMinutes int,
    @OAuthClientID nvarchar(255),
    @OAuthClientSecretEncrypted nvarchar(MAX),
    @OAuthRequirePKCE bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServer]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ServerURL] = @ServerURL,
        [Command] = @Command,
        [CommandArgs] = @CommandArgs,
        [TransportType] = @TransportType,
        [DefaultAuthType] = @DefaultAuthType,
        [CredentialTypeID] = @CredentialTypeID,
        [Status] = @Status,
        [LastSyncAt] = @LastSyncAt,
        [RateLimitPerMinute] = @RateLimitPerMinute,
        [RateLimitPerHour] = @RateLimitPerHour,
        [ConnectionTimeoutMs] = @ConnectionTimeoutMs,
        [RequestTimeoutMs] = @RequestTimeoutMs,
        [DocumentationURL] = @DocumentationURL,
        [IconClass] = @IconClass,
        [OAuthIssuerURL] = @OAuthIssuerURL,
        [OAuthScopes] = @OAuthScopes,
        [OAuthMetadataCacheTTLMinutes] = @OAuthMetadataCacheTTLMinutes,
        [OAuthClientID] = @OAuthClientID,
        [OAuthClientSecretEncrypted] = @OAuthClientSecretEncrypted,
        [OAuthRequirePKCE] = @OAuthRequirePKCE
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServers]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServer
ON [${flyway:defaultSchema}].[MCPServer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServer] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spDeleteMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServer] TO [cdp_Integration]


/* spDelete Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServer] TO [cdp_Integration]



/* Index for Foreign Keys for OAuthAuthServerMetadataCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for OAuthAuthorizationState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table OAuthAuthorizationState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthAuthorizationState_MCPServerConnectionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthAuthorizationState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthAuthorizationState_MCPServerConnectionID ON [${flyway:defaultSchema}].[OAuthAuthorizationState] ([MCPServerConnectionID]);

-- Index for foreign key UserID in table OAuthAuthorizationState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthAuthorizationState_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthAuthorizationState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthAuthorizationState_UserID ON [${flyway:defaultSchema}].[OAuthAuthorizationState] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F7E03FA9-E9FE-4D13-8039-7B10E9781F99 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F7E03FA9-E9FE-4D13-8039-7B10E9781F99',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* Index for Foreign Keys for OAuthClientRegistration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table OAuthClientRegistration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthClientRegistration_MCPServerConnectionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthClientRegistration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthClientRegistration_MCPServerConnectionID ON [${flyway:defaultSchema}].[OAuthClientRegistration] ([MCPServerConnectionID]);

-- Index for foreign key MCPServerID in table OAuthClientRegistration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthClientRegistration_MCPServerID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthClientRegistration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthClientRegistration_MCPServerID ON [${flyway:defaultSchema}].[OAuthClientRegistration] ([MCPServerID]);

/* SQL text to update entity field related entity name field map for entity field ID 7EE91989-02BF-4445-9437-3B35E9EC405F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7EE91989-02BF-4445-9437-3B35E9EC405F',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* Index for Foreign Keys for OAuthToken */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table OAuthToken
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthToken_MCPServerConnectionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthToken]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthToken_MCPServerConnectionID ON [${flyway:defaultSchema}].[OAuthToken] ([MCPServerConnectionID]);

-- Index for foreign key CredentialID in table OAuthToken
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OAuthToken_CredentialID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OAuthToken]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OAuthToken_CredentialID ON [${flyway:defaultSchema}].[OAuthToken] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID D5FE5352-7E58-48C7-AF9C-DADC26590CCD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D5FE5352-7E58-48C7-AF9C-DADC26590CCD',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* Base View SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: vwOAuthAuthServerMetadataCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: O Auth Auth Server Metadata Caches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OAuthAuthServerMetadataCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches]
AS
SELECT
    o.*
FROM
    [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache] AS o
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: Permissions for vwOAuthAuthServerMetadataCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: spCreateOAuthAuthServerMetadataCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OAuthAuthServerMetadataCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOAuthAuthServerMetadataCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthAuthServerMetadataCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthAuthServerMetadataCache]
    @ID uniqueidentifier = NULL,
    @IssuerURL nvarchar(1000),
    @AuthorizationEndpoint nvarchar(1000),
    @TokenEndpoint nvarchar(1000),
    @RegistrationEndpoint nvarchar(1000),
    @RevocationEndpoint nvarchar(1000),
    @JwksURI nvarchar(1000),
    @ScopesSupported nvarchar(MAX),
    @ResponseTypesSupported nvarchar(MAX),
    @GrantTypesSupported nvarchar(MAX),
    @TokenEndpointAuthMethods nvarchar(MAX),
    @CodeChallengeMethodsSupported nvarchar(MAX),
    @MetadataJSON nvarchar(MAX),
    @CachedAt datetimeoffset = NULL,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
            (
                [ID],
                [IssuerURL],
                [AuthorizationEndpoint],
                [TokenEndpoint],
                [RegistrationEndpoint],
                [RevocationEndpoint],
                [JwksURI],
                [ScopesSupported],
                [ResponseTypesSupported],
                [GrantTypesSupported],
                [TokenEndpointAuthMethods],
                [CodeChallengeMethodsSupported],
                [MetadataJSON],
                [CachedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IssuerURL,
                @AuthorizationEndpoint,
                @TokenEndpoint,
                @RegistrationEndpoint,
                @RevocationEndpoint,
                @JwksURI,
                @ScopesSupported,
                @ResponseTypesSupported,
                @GrantTypesSupported,
                @TokenEndpointAuthMethods,
                @CodeChallengeMethodsSupported,
                @MetadataJSON,
                ISNULL(@CachedAt, getutcdate()),
                @ExpiresAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
            (
                [IssuerURL],
                [AuthorizationEndpoint],
                [TokenEndpoint],
                [RegistrationEndpoint],
                [RevocationEndpoint],
                [JwksURI],
                [ScopesSupported],
                [ResponseTypesSupported],
                [GrantTypesSupported],
                [TokenEndpointAuthMethods],
                [CodeChallengeMethodsSupported],
                [MetadataJSON],
                [CachedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IssuerURL,
                @AuthorizationEndpoint,
                @TokenEndpoint,
                @RegistrationEndpoint,
                @RevocationEndpoint,
                @JwksURI,
                @ScopesSupported,
                @ResponseTypesSupported,
                @GrantTypesSupported,
                @TokenEndpointAuthMethods,
                @CodeChallengeMethodsSupported,
                @MetadataJSON,
                ISNULL(@CachedAt, getutcdate()),
                @ExpiresAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthAuthServerMetadataCache] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: O Auth Auth Server Metadata Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthAuthServerMetadataCache] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: spUpdateOAuthAuthServerMetadataCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OAuthAuthServerMetadataCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOAuthAuthServerMetadataCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthAuthServerMetadataCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthAuthServerMetadataCache]
    @ID uniqueidentifier,
    @IssuerURL nvarchar(1000),
    @AuthorizationEndpoint nvarchar(1000),
    @TokenEndpoint nvarchar(1000),
    @RegistrationEndpoint nvarchar(1000),
    @RevocationEndpoint nvarchar(1000),
    @JwksURI nvarchar(1000),
    @ScopesSupported nvarchar(MAX),
    @ResponseTypesSupported nvarchar(MAX),
    @GrantTypesSupported nvarchar(MAX),
    @TokenEndpointAuthMethods nvarchar(MAX),
    @CodeChallengeMethodsSupported nvarchar(MAX),
    @MetadataJSON nvarchar(MAX),
    @CachedAt datetimeoffset,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
    SET
        [IssuerURL] = @IssuerURL,
        [AuthorizationEndpoint] = @AuthorizationEndpoint,
        [TokenEndpoint] = @TokenEndpoint,
        [RegistrationEndpoint] = @RegistrationEndpoint,
        [RevocationEndpoint] = @RevocationEndpoint,
        [JwksURI] = @JwksURI,
        [ScopesSupported] = @ScopesSupported,
        [ResponseTypesSupported] = @ResponseTypesSupported,
        [GrantTypesSupported] = @GrantTypesSupported,
        [TokenEndpointAuthMethods] = @TokenEndpointAuthMethods,
        [CodeChallengeMethodsSupported] = @CodeChallengeMethodsSupported,
        [MetadataJSON] = @MetadataJSON,
        [CachedAt] = @CachedAt,
        [ExpiresAt] = @ExpiresAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOAuthAuthServerMetadataCaches]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthAuthServerMetadataCache] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OAuthAuthServerMetadataCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOAuthAuthServerMetadataCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOAuthAuthServerMetadataCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOAuthAuthServerMetadataCache
ON [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: O Auth Auth Server Metadata Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthAuthServerMetadataCache] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: spDeleteOAuthAuthServerMetadataCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthAuthServerMetadataCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOAuthAuthServerMetadataCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthAuthServerMetadataCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthAuthServerMetadataCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OAuthAuthServerMetadataCache]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthAuthServerMetadataCache] TO [cdp_Integration]


/* spDelete Permissions for MJ: O Auth Auth Server Metadata Caches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthAuthServerMetadataCache] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID F2EFFA2E-1302-4CED-8DDD-EFE4EB65F439 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F2EFFA2E-1302-4CED-8DDD-EFE4EB65F439',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 64FBF137-644A-43A2-A0A4-35818FA22EED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='64FBF137-644A-43A2-A0A4-35818FA22EED',
         @RelatedEntityNameFieldMap='MCPServer'

/* Base View SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: vwOAuthAuthorizationStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: O Auth Authorization States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OAuthAuthorizationState
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOAuthAuthorizationStates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOAuthAuthorizationStates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOAuthAuthorizationStates]
AS
SELECT
    o.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[OAuthAuthorizationState] AS o
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [o].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [o].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthAuthorizationStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: Permissions for vwOAuthAuthorizationStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthAuthorizationStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: spCreateOAuthAuthorizationState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OAuthAuthorizationState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOAuthAuthorizationState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthAuthorizationState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthAuthorizationState]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @StateParameter nvarchar(128),
    @CodeVerifier nvarchar(128),
    @CodeChallenge nvarchar(128),
    @RedirectURI nvarchar(1000),
    @RequestedScopes nvarchar(500),
    @Status nvarchar(50) = NULL,
    @AuthorizationURL nvarchar(MAX),
    @ErrorCode nvarchar(100),
    @ErrorDescription nvarchar(MAX),
    @InitiatedAt datetimeoffset = NULL,
    @ExpiresAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @FrontendReturnURL nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OAuthAuthorizationState]
            (
                [ID],
                [MCPServerConnectionID],
                [UserID],
                [StateParameter],
                [CodeVerifier],
                [CodeChallenge],
                [RedirectURI],
                [RequestedScopes],
                [Status],
                [AuthorizationURL],
                [ErrorCode],
                [ErrorDescription],
                [InitiatedAt],
                [ExpiresAt],
                [CompletedAt],
                [FrontendReturnURL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @UserID,
                @StateParameter,
                @CodeVerifier,
                @CodeChallenge,
                @RedirectURI,
                @RequestedScopes,
                ISNULL(@Status, 'Pending'),
                @AuthorizationURL,
                @ErrorCode,
                @ErrorDescription,
                ISNULL(@InitiatedAt, getutcdate()),
                @ExpiresAt,
                @CompletedAt,
                @FrontendReturnURL
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OAuthAuthorizationState]
            (
                [MCPServerConnectionID],
                [UserID],
                [StateParameter],
                [CodeVerifier],
                [CodeChallenge],
                [RedirectURI],
                [RequestedScopes],
                [Status],
                [AuthorizationURL],
                [ErrorCode],
                [ErrorDescription],
                [InitiatedAt],
                [ExpiresAt],
                [CompletedAt],
                [FrontendReturnURL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @UserID,
                @StateParameter,
                @CodeVerifier,
                @CodeChallenge,
                @RedirectURI,
                @RequestedScopes,
                ISNULL(@Status, 'Pending'),
                @AuthorizationURL,
                @ErrorCode,
                @ErrorDescription,
                ISNULL(@InitiatedAt, getutcdate()),
                @ExpiresAt,
                @CompletedAt,
                @FrontendReturnURL
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOAuthAuthorizationStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthAuthorizationState] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: O Auth Authorization States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthAuthorizationState] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: spUpdateOAuthAuthorizationState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OAuthAuthorizationState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOAuthAuthorizationState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthAuthorizationState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthAuthorizationState]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @StateParameter nvarchar(128),
    @CodeVerifier nvarchar(128),
    @CodeChallenge nvarchar(128),
    @RedirectURI nvarchar(1000),
    @RequestedScopes nvarchar(500),
    @Status nvarchar(50),
    @AuthorizationURL nvarchar(MAX),
    @ErrorCode nvarchar(100),
    @ErrorDescription nvarchar(MAX),
    @InitiatedAt datetimeoffset,
    @ExpiresAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @FrontendReturnURL nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthAuthorizationState]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [UserID] = @UserID,
        [StateParameter] = @StateParameter,
        [CodeVerifier] = @CodeVerifier,
        [CodeChallenge] = @CodeChallenge,
        [RedirectURI] = @RedirectURI,
        [RequestedScopes] = @RequestedScopes,
        [Status] = @Status,
        [AuthorizationURL] = @AuthorizationURL,
        [ErrorCode] = @ErrorCode,
        [ErrorDescription] = @ErrorDescription,
        [InitiatedAt] = @InitiatedAt,
        [ExpiresAt] = @ExpiresAt,
        [CompletedAt] = @CompletedAt,
        [FrontendReturnURL] = @FrontendReturnURL
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOAuthAuthorizationStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOAuthAuthorizationStates]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthAuthorizationState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OAuthAuthorizationState table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOAuthAuthorizationState]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOAuthAuthorizationState];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOAuthAuthorizationState
ON [${flyway:defaultSchema}].[OAuthAuthorizationState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthAuthorizationState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OAuthAuthorizationState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: O Auth Authorization States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthAuthorizationState] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: spDeleteOAuthAuthorizationState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthAuthorizationState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOAuthAuthorizationState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthAuthorizationState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthAuthorizationState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OAuthAuthorizationState]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthAuthorizationState] TO [cdp_Integration]


/* spDelete Permissions for MJ: O Auth Authorization States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthAuthorizationState] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 4205F16C-4412-45F3-BC1E-4E0B9FAA89B1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4205F16C-4412-45F3-BC1E-4E0B9FAA89B1',
         @RelatedEntityNameFieldMap='Credential'

/* Base View SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: vwOAuthClientRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: O Auth Client Registrations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OAuthClientRegistration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOAuthClientRegistrations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOAuthClientRegistrations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOAuthClientRegistrations]
AS
SELECT
    o.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection],
    MCPServer_MCPServerID.[Name] AS [MCPServer]
FROM
    [${flyway:defaultSchema}].[OAuthClientRegistration] AS o
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [o].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MCPServer] AS MCPServer_MCPServerID
  ON
    [o].[MCPServerID] = MCPServer_MCPServerID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthClientRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: Permissions for vwOAuthClientRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthClientRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: spCreateOAuthClientRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OAuthClientRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOAuthClientRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthClientRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthClientRegistration]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerID uniqueidentifier,
    @IssuerURL nvarchar(1000),
    @ClientID nvarchar(500),
    @ClientSecretEncrypted nvarchar(MAX),
    @ClientIDIssuedAt datetimeoffset,
    @ClientSecretExpiresAt datetimeoffset,
    @RegistrationAccessToken nvarchar(MAX),
    @RegistrationClientURI nvarchar(1000),
    @RedirectURIs nvarchar(MAX),
    @GrantTypes nvarchar(MAX),
    @ResponseTypes nvarchar(MAX),
    @Scope nvarchar(500),
    @Status nvarchar(50) = NULL,
    @RegistrationResponse nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OAuthClientRegistration]
            (
                [ID],
                [MCPServerConnectionID],
                [MCPServerID],
                [IssuerURL],
                [ClientID],
                [ClientSecretEncrypted],
                [ClientIDIssuedAt],
                [ClientSecretExpiresAt],
                [RegistrationAccessToken],
                [RegistrationClientURI],
                [RedirectURIs],
                [GrantTypes],
                [ResponseTypes],
                [Scope],
                [Status],
                [RegistrationResponse]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @MCPServerID,
                @IssuerURL,
                @ClientID,
                @ClientSecretEncrypted,
                @ClientIDIssuedAt,
                @ClientSecretExpiresAt,
                @RegistrationAccessToken,
                @RegistrationClientURI,
                @RedirectURIs,
                @GrantTypes,
                @ResponseTypes,
                @Scope,
                ISNULL(@Status, 'Active'),
                @RegistrationResponse
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OAuthClientRegistration]
            (
                [MCPServerConnectionID],
                [MCPServerID],
                [IssuerURL],
                [ClientID],
                [ClientSecretEncrypted],
                [ClientIDIssuedAt],
                [ClientSecretExpiresAt],
                [RegistrationAccessToken],
                [RegistrationClientURI],
                [RedirectURIs],
                [GrantTypes],
                [ResponseTypes],
                [Scope],
                [Status],
                [RegistrationResponse]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @MCPServerID,
                @IssuerURL,
                @ClientID,
                @ClientSecretEncrypted,
                @ClientIDIssuedAt,
                @ClientSecretExpiresAt,
                @RegistrationAccessToken,
                @RegistrationClientURI,
                @RedirectURIs,
                @GrantTypes,
                @ResponseTypes,
                @Scope,
                ISNULL(@Status, 'Active'),
                @RegistrationResponse
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOAuthClientRegistrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthClientRegistration] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: O Auth Client Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthClientRegistration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: spUpdateOAuthClientRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OAuthClientRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOAuthClientRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthClientRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthClientRegistration]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerID uniqueidentifier,
    @IssuerURL nvarchar(1000),
    @ClientID nvarchar(500),
    @ClientSecretEncrypted nvarchar(MAX),
    @ClientIDIssuedAt datetimeoffset,
    @ClientSecretExpiresAt datetimeoffset,
    @RegistrationAccessToken nvarchar(MAX),
    @RegistrationClientURI nvarchar(1000),
    @RedirectURIs nvarchar(MAX),
    @GrantTypes nvarchar(MAX),
    @ResponseTypes nvarchar(MAX),
    @Scope nvarchar(500),
    @Status nvarchar(50),
    @RegistrationResponse nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthClientRegistration]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [MCPServerID] = @MCPServerID,
        [IssuerURL] = @IssuerURL,
        [ClientID] = @ClientID,
        [ClientSecretEncrypted] = @ClientSecretEncrypted,
        [ClientIDIssuedAt] = @ClientIDIssuedAt,
        [ClientSecretExpiresAt] = @ClientSecretExpiresAt,
        [RegistrationAccessToken] = @RegistrationAccessToken,
        [RegistrationClientURI] = @RegistrationClientURI,
        [RedirectURIs] = @RedirectURIs,
        [GrantTypes] = @GrantTypes,
        [ResponseTypes] = @ResponseTypes,
        [Scope] = @Scope,
        [Status] = @Status,
        [RegistrationResponse] = @RegistrationResponse
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOAuthClientRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOAuthClientRegistrations]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthClientRegistration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OAuthClientRegistration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOAuthClientRegistration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOAuthClientRegistration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOAuthClientRegistration
ON [${flyway:defaultSchema}].[OAuthClientRegistration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthClientRegistration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OAuthClientRegistration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: O Auth Client Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthClientRegistration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: spDeleteOAuthClientRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthClientRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOAuthClientRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthClientRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthClientRegistration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OAuthClientRegistration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthClientRegistration] TO [cdp_Integration]


/* spDelete Permissions for MJ: O Auth Client Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthClientRegistration] TO [cdp_Integration]



/* Base View SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: vwOAuthTokens
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: O Auth Tokens
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OAuthToken
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOAuthTokens]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOAuthTokens];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOAuthTokens]
AS
SELECT
    o.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection],
    Credential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[OAuthToken] AS o
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [o].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [o].[CredentialID] = Credential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthTokens] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: Permissions for vwOAuthTokens
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOAuthTokens] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: spCreateOAuthToken
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OAuthToken
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOAuthToken]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthToken];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOAuthToken]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @TokenType nvarchar(50) = NULL,
    @ExpiresAt datetimeoffset,
    @Scope nvarchar(500),
    @IssuerURL nvarchar(1000),
    @LastRefreshAt datetimeoffset,
    @RefreshCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OAuthToken]
            (
                [ID],
                [MCPServerConnectionID],
                [CredentialID],
                [TokenType],
                [ExpiresAt],
                [Scope],
                [IssuerURL],
                [LastRefreshAt],
                [RefreshCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @CredentialID,
                ISNULL(@TokenType, 'Bearer'),
                @ExpiresAt,
                @Scope,
                @IssuerURL,
                @LastRefreshAt,
                ISNULL(@RefreshCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OAuthToken]
            (
                [MCPServerConnectionID],
                [CredentialID],
                [TokenType],
                [ExpiresAt],
                [Scope],
                [IssuerURL],
                [LastRefreshAt],
                [RefreshCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @CredentialID,
                ISNULL(@TokenType, 'Bearer'),
                @ExpiresAt,
                @Scope,
                @IssuerURL,
                @LastRefreshAt,
                ISNULL(@RefreshCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOAuthTokens] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthToken] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for MJ: O Auth Tokens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOAuthToken] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: spUpdateOAuthToken
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OAuthToken
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOAuthToken]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthToken];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOAuthToken]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @TokenType nvarchar(50),
    @ExpiresAt datetimeoffset,
    @Scope nvarchar(500),
    @IssuerURL nvarchar(1000),
    @LastRefreshAt datetimeoffset,
    @RefreshCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthToken]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [CredentialID] = @CredentialID,
        [TokenType] = @TokenType,
        [ExpiresAt] = @ExpiresAt,
        [Scope] = @Scope,
        [IssuerURL] = @IssuerURL,
        [LastRefreshAt] = @LastRefreshAt,
        [RefreshCount] = @RefreshCount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOAuthTokens] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOAuthTokens]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthToken] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OAuthToken table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOAuthToken]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOAuthToken];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOAuthToken
ON [${flyway:defaultSchema}].[OAuthToken]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OAuthToken]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OAuthToken] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for MJ: O Auth Tokens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOAuthToken] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: spDeleteOAuthToken
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthToken
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOAuthToken]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthToken];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOAuthToken]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OAuthToken]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthToken] TO [cdp_Integration]


/* spDelete Permissions for MJ: O Auth Tokens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOAuthToken] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '592f5699-c5e9-44a5-b49a-f90af8247f3c'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '592f5699-c5e9-44a5-b49a-f90af8247f3c',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100037,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'cba43110-54bb-4b5c-aca6-c03f0aafa054'  OR
               (EntityID = '704792E8-D4FC-4A52-8120-7D0DF1127FF8' AND Name = 'MCPServer')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cba43110-54bb-4b5c-aca6-c03f0aafa054',
            '704792E8-D4FC-4A52-8120-7D0DF1127FF8', -- Entity: MJ: O Auth Client Registrations
            100038,
            'MCPServer',
            'MCP Server',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'c83dd6f7-1427-4e96-8172-183077710f55'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c83dd6f7-1427-4e96-8172-183077710f55',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100037,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5a5bff02-3872-47bf-a2da-1bb632afe0e3'  OR
               (EntityID = 'EF86F759-B7F0-4D5D-A594-8BC395129ACF' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a5bff02-3872-47bf-a2da-1bb632afe0e3',
            'EF86F759-B7F0-4D5D-A594-8BC395129ACF', -- Entity: MJ: O Auth Authorization States
            100038,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'b6f88c27-da89-4423-9340-61b6a39e409a'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6f88c27-da89-4423-9340-61b6a39e409a',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100023,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'c4dfa1d2-7a43-4a6a-91e0-641052844a0e'  OR
               (EntityID = 'E6FF1529-89B9-452B-9703-FF26F9E8AA18' AND Name = 'Credential')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c4dfa1d2-7a43-4a6a-91e0-641052844a0e',
            'E6FF1529-89B9-452B-9703-FF26F9E8AA18', -- Entity: MJ: O Auth Tokens
            100024,
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

