-- =====================================================================================
-- Pluggable Authentication Providers
-- =====================================================================================
-- Introduces the AuthenticationProvider table, the metadata catalog of authentication
-- providers (Auth0, Okta, MSAL, Cognito, Google, WorkOS, or any third-party driver).
--
-- This makes auth providers METADATA-DRIVEN like the rest of MemberJunction: a row names
-- a DriverClass that is resolved at runtime via
--   MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass, config)
-- exactly as File Storage Providers (ServerDriverKey) and AI Remote Browser Providers
-- (DriverClass) already work. No more hard-wired provider lists: a third party plugs in
-- by shipping a @RegisterClass(BaseAuthProvider,'x') subclass and adding a row here.
--
-- The mj.config.cjs `authProviders[]` array remains a back-compat fallback when this
-- table is empty, so no existing deployment has to change anything to keep booting.
--
-- ---------------------------------------------------------------------------------
-- WHY TWO CONFIGURATION JSON COLUMNS
-- ---------------------------------------------------------------------------------
-- The browser is PRE-AUTH when it needs to know which providers exist, so the server
-- publishes a public catalog (GET /auth/providers) with no bearer token. That endpoint
-- must never become a way to read secrets that an administrator pasted into a config
-- blob, so the split is enforced by the SCHEMA rather than by reviewer vigilance:
--
--   AdditionalConfiguration -- SERVER-SIDE ONLY. Never published. Driver-specific extras
--                              consumed by the server provider during token validation.
--   ClientConfiguration     -- PUBLISHED VERBATIM to the pre-auth catalog. Anything the
--                              browser SDK needs (redirectUri, apiHostname, ...). Treat
--                              every value here as world-readable.
--
-- A single merged blob would mean the publish path had to guess which keys were safe.
-- With two columns the public projection is a fixed allow-list of columns and the
-- question "could this leak?" is answered by which column the value sits in.
--
-- ---------------------------------------------------------------------------------
-- SECRETS
-- ---------------------------------------------------------------------------------
-- Most providers validate via PUBLIC JWKS and need NO secret (CredentialID null, which
-- is the case for every provider MJ ships today -- Auth0, Okta, MSAL, Cognito, Google,
-- WorkOS). Providers that DO need server-side secret material (confidential-client
-- OAuth, management APIs, SCIM) reference the existing Credential table via
-- CredentialID and are decrypted at runtime by CredentialEngine -- mirroring the File
-- Storage credential model. Secrets are never stored on this table.
--
-- CodeGen handoff: after this migration runs, `mj codegen` generates
--   - MJAuthenticationProviderEntity (entity name "MJ: Authentication Providers")
--   - the base view + spCreate/spUpdate/spDelete + permissions
-- which AuthProviderEngine / the catalog endpoint / the login picker build against.
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[AuthenticationProvider] (
    [ID]                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AuthenticationProvider_ID] DEFAULT (newsequentialid()),

    -- Identity / discovery
    [Name]                    NVARCHAR(100)    NOT NULL,
    [Description]             NVARCHAR(MAX)    NULL,
    [DriverClass]             NVARCHAR(255)    NOT NULL,

    -- OIDC / JWT connection fields (non-secret; used by BaseAuthProvider for validation)
    [Issuer]                  NVARCHAR(500)    NULL,
    [Audience]                NVARCHAR(500)    NULL,
    [JWKSUri]                 NVARCHAR(500)    NULL,
    [ClientID]                NVARCHAR(255)    NULL,
    [Domain]                  NVARCHAR(255)    NULL,
    [Scopes]                  NVARCHAR(500)    NULL,

    -- Driver-specific configuration, split by trust boundary (see header)
    [AdditionalConfiguration] NVARCHAR(MAX)    NULL,
    [ClientConfiguration]     NVARCHAR(MAX)    NULL,

    -- Optional secret material for providers that make server-initiated calls
    [CredentialID]            UNIQUEIDENTIFIER NULL,

    -- Lifecycle / selection
    [Status]                  NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AuthenticationProvider_Status] DEFAULT (N'Active'),
    [IsDefault]               BIT              NOT NULL CONSTRAINT [DF_AuthenticationProvider_IsDefault] DEFAULT (0),

    -- Browser login-picker presentation (picker renders only when 2+ Active, ClientVisible rows exist)
    [ClientVisible]           BIT              NOT NULL CONSTRAINT [DF_AuthenticationProvider_ClientVisible] DEFAULT (1),
    [DisplayName]             NVARCHAR(100)    NULL,
    [Icon]                    NVARCHAR(100)    NULL,
    [Sequence]                INT              NOT NULL CONSTRAINT [DF_AuthenticationProvider_Sequence] DEFAULT (0),

    CONSTRAINT [PK_AuthenticationProvider] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AuthenticationProvider_Name] UNIQUE ([Name]),
    CONSTRAINT [FK_AuthenticationProvider_Credential] FOREIGN KEY ([CredentialID])
        REFERENCES [${flyway:defaultSchema}].[Credential]([ID]),
    CONSTRAINT [CK_AuthenticationProvider_Status] CHECK ([Status] IN (N'Active', N'Inactive'))
);
GO


-- -------------------------------------------------------------------------------------
-- Descriptions (consumed by CodeGen; PK ID + FK CredentialID are described by CodeGen)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Metadata catalog of authentication providers. Each row defines one provider (Auth0, Okta, MSAL, Cognito, Google, WorkOS, or any third-party driver) whose implementation is resolved at runtime from DriverClass via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). Supersedes the hard-wired mj.config.cjs authProviders array, which remains a back-compat fallback when this table is empty.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique, human-readable name for this provider instance (e.g. "WorkOS Production", "Corporate Azure AD"). Also the key used to register the provider with AuthProviderFactory.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional administrator notes describing this provider configuration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). MUST match the @RegisterClass key on the concrete server provider (e.g. "workos", "auth0", "okta", "msal", "cognito", "google"). The browser resolves its matching MJAuthBase subclass from the same key, so a driver ships as a server/browser pair under one name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Expected JWT issuer (the "iss" claim). Used to route an incoming token to this provider and to validate the token. E.g. https://api.workos.com/user_management/<clientId>.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Issuer';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Expected JWT audience (the "aud" claim) enforced during validation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Audience';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JWKS endpoint URL used to fetch the signing keys that verify token signatures. E.g. https://api.workos.com/sso/jwks/<clientId>.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'JWKSUri';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public OAuth client ID. Safe to expose to the browser and published in the pre-auth provider catalog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'ClientID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider domain where applicable (e.g. Auth0/Okta tenant domain). Optional; published in the pre-auth provider catalog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Domain';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth scopes to request, space-delimited (e.g. "openid profile email"). Published in the pre-auth provider catalog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Scopes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'SERVER-SIDE ONLY driver configuration as a JSON object, for fields not modeled as columns. NEVER published to the pre-auth catalog. Merged into the provider config when the server driver is instantiated. Put anything the browser must not read here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'AdditionalConfiguration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Browser driver configuration as a JSON object (e.g. WorkOS apiHostname, Cognito region/userPoolId, redirectUri). PUBLISHED VERBATIM in the unauthenticated pre-auth provider catalog, so every value here must be considered world-readable. Server-only settings belong in AdditionalConfiguration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'ClientConfiguration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active providers are registered at startup and offered for login.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider is the default selection -- pre-highlighted in the login picker, and used directly when it is the only Active, client-visible provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider appears in the browser pre-auth login picker and is included in the public catalog endpoint. Set false for providers that only validate machine-to-machine tokens and should never be offered as an interactive login.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'ClientVisible';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Label shown on the login picker button (e.g. "Microsoft", rendered as "Continue with Microsoft"). Falls back to Name when null.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Icon for the login picker button -- a Font Awesome class (e.g. "fa-brands fa-microsoft") or a known brand-logo key the picker maps to a brand chip.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Icon';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering of this provider within the login picker (ascending).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Sequence';




















































/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT WAS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL          ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   It contains the Entity / EntityField metadata inserts, the generated base view, the  ==
   ==   spCreate / spUpdate / spDelete procedures, permission grants, and extended-property   ==
   ==   descriptions for the AuthenticationProvider table.                                   ==
   ==                                                                                        ==
   ==   If the hand-written DDL above changes, DO NOT patch this section: re-run              ==
   ==   `mj codegen` and replace this entire block with the new output.                       ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* SQL generated to create new entity MJ: Authentication Providers */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '2d558eba-9b96-40d9-9d8c-34df1a9e78f5',
         'MJ: Authentication Providers',
         'Authentication Providers',
         'Metadata catalog of authentication providers. Each row defines one provider (Auth0, Okta, MSAL, Cognito, Google, WorkOS, or any third-party driver) whose implementation is resolved at runtime from DriverClass via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). Supersedes the hard-wired mj.config.cjs authProviders array, which remains a back-compat fallback when this table is empty.',
         NULL,
         'AuthenticationProvider',
         'vwAuthenticationProviders',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Authentication Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2d558eba-9b96-40d9-9d8c-34df1a9e78f5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Authentication Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2d558eba-9b96-40d9-9d8c-34df1a9e78f5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Authentication Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2d558eba-9b96-40d9-9d8c-34df1a9e78f5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Authentication Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2d558eba-9b96-40d9-9d8c-34df1a9e78f5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
UPDATE [${flyway:defaultSchema}].[AuthenticationProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ADD CONSTRAINT [DF___mj_AuthenticationProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
UPDATE [${flyway:defaultSchema}].[AuthenticationProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AuthenticationProvider */
ALTER TABLE [${flyway:defaultSchema}].[AuthenticationProvider] ADD CONSTRAINT [DF___mj_AuthenticationProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 21 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '664b78c1-8e3c-4a2b-8c5a-203c5fad87a0' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '664b78c1-8e3c-4a2b-8c5a-203c5fad87a0',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
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
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb95e788-8bf3-4475-8016-9a83895fa3dd' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eb95e788-8bf3-4475-8016-9a83895fa3dd',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100002,
            'Name',
            'Name',
            'Unique, human-readable name for this provider instance (e.g. "WorkOS Production", "Corporate Azure AD"). Also the key used to register the provider with AuthProviderFactory.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'feddd1e7-31cb-4f7f-befa-81576f26aecb' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'feddd1e7-31cb-4f7f-befa-81576f26aecb',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100003,
            'Description',
            'Description',
            'Optional administrator notes describing this provider configuration.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be79376a-a572-454c-94d9-c7bd75f81baa' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be79376a-a572-454c-94d9-c7bd75f81baa',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100004,
            'DriverClass',
            'Driver Class',
            'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). MUST match the @RegisterClass key on the concrete server provider (e.g. "workos", "auth0", "okta", "msal", "cognito", "google"). The browser resolves its matching MJAuthBase subclass from the same key, so a driver ships as a server/browser pair under one name.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63ee3d6f-3205-4835-8832-27c9c54f793b' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Issuer')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63ee3d6f-3205-4835-8832-27c9c54f793b',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100005,
            'Issuer',
            'Issuer',
            'Expected JWT issuer (the "iss" claim). Used to route an incoming token to this provider and to validate the token. E.g. https://api.workos.com/user_management/<clientId>.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72b9af2e-6a26-4957-b3cb-bcf901ac1745' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Audience')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '72b9af2e-6a26-4957-b3cb-bcf901ac1745',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100006,
            'Audience',
            'Audience',
            'Expected JWT audience (the "aud" claim) enforced during validation.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42112dcb-726f-46d5-8782-579107d99df2' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'JWKSUri')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42112dcb-726f-46d5-8782-579107d99df2',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100007,
            'JWKSUri',
            'JWKS Uri',
            'JWKS endpoint URL used to fetch the signing keys that verify token signatures. E.g. https://api.workos.com/sso/jwks/<clientId>.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a9d9403-ef0c-4a65-b8f1-bd56a9666b75' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'ClientID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a9d9403-ef0c-4a65-b8f1-bd56a9666b75',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100008,
            'ClientID',
            'Client ID',
            'Public OAuth client ID. Safe to expose to the browser and published in the pre-auth provider catalog.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af784ea6-204e-4252-b701-b818a33a2e8b' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Domain')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af784ea6-204e-4252-b701-b818a33a2e8b',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100009,
            'Domain',
            'Domain',
            'Provider domain where applicable (e.g. Auth0/Okta tenant domain). Optional; published in the pre-auth provider catalog.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d4f405c-3e59-47ad-b38b-56898610b92e' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Scopes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d4f405c-3e59-47ad-b38b-56898610b92e',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100010,
            'Scopes',
            'Scopes',
            'OAuth scopes to request, space-delimited (e.g. "openid profile email"). Published in the pre-auth provider catalog.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74db73c0-6f9f-4b25-8d9c-6e9377269bb6' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'AdditionalConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74db73c0-6f9f-4b25-8d9c-6e9377269bb6',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100011,
            'AdditionalConfiguration',
            'Additional Configuration',
            'SERVER-SIDE ONLY driver configuration as a JSON object, for fields not modeled as columns. NEVER published to the pre-auth catalog. Merged into the provider config when the server driver is instantiated. Put anything the browser must not read here.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fabe2750-cc9c-4852-a64f-57a570abde4d' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'ClientConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fabe2750-cc9c-4852-a64f-57a570abde4d',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100012,
            'ClientConfiguration',
            'Client Configuration',
            'Browser driver configuration as a JSON object (e.g. WorkOS apiHostname, Cognito region/userPoolId, redirectUri). PUBLISHED VERBATIM in the unauthenticated pre-auth provider catalog, so every value here must be considered world-readable. Server-only settings belong in AdditionalConfiguration.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4a4e028-61b9-4299-abdd-7c75a63e8624' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'CredentialID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd4a4e028-61b9-4299-abdd-7c75a63e8624',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100013,
            'CredentialID',
            'Credential ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6038a72b-5280-433b-861a-f4b988c24614' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6038a72b-5280-433b-861a-f4b988c24614',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100014,
            'Status',
            'Status',
            'Lifecycle status. Only Active providers are registered at startup and offered for login.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c15cd0e1-ddd6-4fe8-a0b0-2bfc45511984' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'IsDefault')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c15cd0e1-ddd6-4fe8-a0b0-2bfc45511984',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100015,
            'IsDefault',
            'Is Default',
            'When true, this provider is the default selection -- pre-highlighted in the login picker, and used directly when it is the only Active, client-visible provider.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8fd0f71-58c1-4042-a953-17ecd119bec1' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'ClientVisible')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a8fd0f71-58c1-4042-a953-17ecd119bec1',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100016,
            'ClientVisible',
            'Client Visible',
            'When true, this provider appears in the browser pre-auth login picker and is included in the public catalog endpoint. Set false for providers that only validate machine-to-machine tokens and should never be offered as an interactive login.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a51ac9a8-5a7c-4939-88a7-4a6aeace18e7' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a51ac9a8-5a7c-4939-88a7-4a6aeace18e7',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100017,
            'DisplayName',
            'Display Name',
            'Label shown on the login picker button (e.g. "Microsoft", rendered as "Continue with Microsoft"). Falls back to Name when null.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '883d29f9-ca86-4ac2-b6cf-40ed821d12cb' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Icon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '883d29f9-ca86-4ac2-b6cf-40ed821d12cb',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100018,
            'Icon',
            'Icon',
            'Icon for the login picker button -- a Font Awesome class (e.g. "fa-brands fa-microsoft") or a known brand-logo key the picker maps to a brand chip.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b862b45-4e9c-4d3d-a1ef-47d7cabf0742' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b862b45-4e9c-4d3d-a1ef-47d7cabf0742',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100019,
            'Sequence',
            'Sequence',
            'Ordering of this provider within the login picker (ascending).',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7afe307f-a648-4fcd-b2d5-ccbff08de2e3' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7afe307f-a648-4fcd-b2d5-ccbff08de2e3',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100020,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd877c7b-8e8b-4aab-9613-0f28af057036' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fd877c7b-8e8b-4aab-9613-0f28af057036',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100021,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 40d4b717-4637-4859-925c-e9acb0e408d7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('40d4b717-4637-4859-925c-e9acb0e408d7', '6038A72B-5280-433B-861A-F4B988C24614', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eef91476-100d-4070-bac4-ee6918f4e722 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eef91476-100d-4070-bac4-ee6918f4e722', '6038A72B-5280-433B-861A-F4B988C24614', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6038A72B-5280-433B-861A-F4B988C24614 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6038A72B-5280-433B-861A-F4B988C24614';


/* Create Entity Relationship: MJ: Credentials -> MJ: Authentication Providers (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1c548b70-d490-4a1b-bf87-64cc18985b9c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1c548b70-d490-4a1b-bf87-64cc18985b9c', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', 'CredentialID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AuthenticationProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table AuthenticationProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AuthenticationProvider_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AuthenticationProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AuthenticationProvider_CredentialID ON [${flyway:defaultSchema}].[AuthenticationProvider] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID D4A4E028-61B9-4299-ABDD-7C75A63E8624 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D4A4E028-61B9-4299-ABDD-7C75A63E8624', @RelatedEntityNameFieldMap='Credential';

/* Base View SQL for MJ: Authentication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: vwAuthenticationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Authentication Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuthenticationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAuthenticationProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAuthenticationProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuthenticationProviders]
AS
SELECT
    a.*,
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[AuthenticationProvider] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [a].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthenticationProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Authentication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: Permissions for vwAuthenticationProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthenticationProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Authentication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: spCreateAuthenticationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuthenticationProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuthenticationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuthenticationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuthenticationProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @Issuer_Clear bit = 0,
    @Issuer nvarchar(500) = NULL,
    @Audience_Clear bit = 0,
    @Audience nvarchar(500) = NULL,
    @JWKSUri_Clear bit = 0,
    @JWKSUri nvarchar(500) = NULL,
    @ClientID_Clear bit = 0,
    @ClientID nvarchar(255) = NULL,
    @Domain_Clear bit = 0,
    @Domain nvarchar(255) = NULL,
    @Scopes_Clear bit = 0,
    @Scopes nvarchar(500) = NULL,
    @AdditionalConfiguration_Clear bit = 0,
    @AdditionalConfiguration nvarchar(MAX) = NULL,
    @ClientConfiguration_Clear bit = 0,
    @ClientConfiguration nvarchar(MAX) = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @IsDefault bit = NULL,
    @ClientVisible bit = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(100) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AuthenticationProvider]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Issuer],
                [Audience],
                [JWKSUri],
                [ClientID],
                [Domain],
                [Scopes],
                [AdditionalConfiguration],
                [ClientConfiguration],
                [CredentialID],
                [Status],
                [IsDefault],
                [ClientVisible],
                [DisplayName],
                [Icon],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Issuer_Clear = 1 THEN NULL ELSE ISNULL(@Issuer, NULL) END,
                CASE WHEN @Audience_Clear = 1 THEN NULL ELSE ISNULL(@Audience, NULL) END,
                CASE WHEN @JWKSUri_Clear = 1 THEN NULL ELSE ISNULL(@JWKSUri, NULL) END,
                CASE WHEN @ClientID_Clear = 1 THEN NULL ELSE ISNULL(@ClientID, NULL) END,
                CASE WHEN @Domain_Clear = 1 THEN NULL ELSE ISNULL(@Domain, NULL) END,
                CASE WHEN @Scopes_Clear = 1 THEN NULL ELSE ISNULL(@Scopes, NULL) END,
                CASE WHEN @AdditionalConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalConfiguration, NULL) END,
                CASE WHEN @ClientConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@ClientConfiguration, NULL) END,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsDefault, 0),
                ISNULL(@ClientVisible, 1),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AuthenticationProvider]
            (
                [Name],
                [Description],
                [DriverClass],
                [Issuer],
                [Audience],
                [JWKSUri],
                [ClientID],
                [Domain],
                [Scopes],
                [AdditionalConfiguration],
                [ClientConfiguration],
                [CredentialID],
                [Status],
                [IsDefault],
                [ClientVisible],
                [DisplayName],
                [Icon],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Issuer_Clear = 1 THEN NULL ELSE ISNULL(@Issuer, NULL) END,
                CASE WHEN @Audience_Clear = 1 THEN NULL ELSE ISNULL(@Audience, NULL) END,
                CASE WHEN @JWKSUri_Clear = 1 THEN NULL ELSE ISNULL(@JWKSUri, NULL) END,
                CASE WHEN @ClientID_Clear = 1 THEN NULL ELSE ISNULL(@ClientID, NULL) END,
                CASE WHEN @Domain_Clear = 1 THEN NULL ELSE ISNULL(@Domain, NULL) END,
                CASE WHEN @Scopes_Clear = 1 THEN NULL ELSE ISNULL(@Scopes, NULL) END,
                CASE WHEN @AdditionalConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalConfiguration, NULL) END,
                CASE WHEN @ClientConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@ClientConfiguration, NULL) END,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsDefault, 0),
                ISNULL(@ClientVisible, 1),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuthenticationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthenticationProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Authentication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthenticationProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Authentication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: spUpdateAuthenticationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuthenticationProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAuthenticationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAuthenticationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuthenticationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @Issuer_Clear bit = 0,
    @Issuer nvarchar(500) = NULL,
    @Audience_Clear bit = 0,
    @Audience nvarchar(500) = NULL,
    @JWKSUri_Clear bit = 0,
    @JWKSUri nvarchar(500) = NULL,
    @ClientID_Clear bit = 0,
    @ClientID nvarchar(255) = NULL,
    @Domain_Clear bit = 0,
    @Domain nvarchar(255) = NULL,
    @Scopes_Clear bit = 0,
    @Scopes nvarchar(500) = NULL,
    @AdditionalConfiguration_Clear bit = 0,
    @AdditionalConfiguration nvarchar(MAX) = NULL,
    @ClientConfiguration_Clear bit = 0,
    @ClientConfiguration nvarchar(MAX) = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @IsDefault bit = NULL,
    @ClientVisible bit = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(100) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuthenticationProvider]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Issuer] = CASE WHEN @Issuer_Clear = 1 THEN NULL ELSE ISNULL(@Issuer, [Issuer]) END,
        [Audience] = CASE WHEN @Audience_Clear = 1 THEN NULL ELSE ISNULL(@Audience, [Audience]) END,
        [JWKSUri] = CASE WHEN @JWKSUri_Clear = 1 THEN NULL ELSE ISNULL(@JWKSUri, [JWKSUri]) END,
        [ClientID] = CASE WHEN @ClientID_Clear = 1 THEN NULL ELSE ISNULL(@ClientID, [ClientID]) END,
        [Domain] = CASE WHEN @Domain_Clear = 1 THEN NULL ELSE ISNULL(@Domain, [Domain]) END,
        [Scopes] = CASE WHEN @Scopes_Clear = 1 THEN NULL ELSE ISNULL(@Scopes, [Scopes]) END,
        [AdditionalConfiguration] = CASE WHEN @AdditionalConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalConfiguration, [AdditionalConfiguration]) END,
        [ClientConfiguration] = CASE WHEN @ClientConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@ClientConfiguration, [ClientConfiguration]) END,
        [CredentialID] = CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, [CredentialID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [ClientVisible] = ISNULL(@ClientVisible, [ClientVisible]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAuthenticationProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAuthenticationProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuthenticationProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuthenticationProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAuthenticationProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAuthenticationProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuthenticationProvider
ON [${flyway:defaultSchema}].[AuthenticationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuthenticationProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AuthenticationProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Authentication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuthenticationProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Authentication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authentication Providers
-- Item: spDeleteAuthenticationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuthenticationProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAuthenticationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAuthenticationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAuthenticationProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AuthenticationProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAuthenticationProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Authentication Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAuthenticationProvider] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88405f56-5cdf-4524-8f4f-61374c43912b' OR (EntityID = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5' AND Name = 'Credential')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88405f56-5cdf-4524-8f4f-61374c43912b',
            '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', -- Entity: MJ: Authentication Providers
            100043,
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6038A72B-5280-433B-861A-F4B988C24614'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C15CD0E1-DDD6-4FE8-A0B0-2BFC45511984'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A8FD0F71-58C1-4042-A953-17ECD119BEC1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A51AC9A8-5A7C-4939-88A7-4A6AEACE18E7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BE79376A-A572-454C-94D9-C7BD75F81BAA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A51AC9A8-5A7C-4939-88A7-4A6AEACE18E7'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'EB95E788-8BF3-4475-8016-9A83895FA3DD'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A51AC9A8-5A7C-4939-88A7-4A6AEACE18E7'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'BE79376A-A572-454C-94D9-C7BD75F81BAA'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Authentication Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '664B78C1-8E3C-4A2B-8C5A-203C5FAD87A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB95E788-8BF3-4475-8016-9A83895FA3DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A51AC9A8-5A7C-4939-88A7-4A6AEACE18E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEDDD1E7-31CB-4F7F-BEFA-81576F26AECB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '883D29F9-CA86-4AC2-B6CF-40ED821D12CB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE79376A-A572-454C-94D9-C7BD75F81BAA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Issuer 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '63EE3D6F-3205-4835-8832-27C9C54F793B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Audience 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72B9AF2E-6A26-4957-B3CB-BCF901AC1745' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.JWKSUri 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'JWKS URI',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '42112DCB-726F-46D5-8782-579107D99DF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.ClientID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A9D9403-EF0C-4A65-B8F1-BD56A9666B75' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Domain 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF784EA6-204E-4252-B701-B818A33A2E8B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Scopes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D4F405C-3E59-47AD-B38B-56898610B92E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.AdditionalConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '74DB73C0-6F9F-4B25-8D9C-6E9377269BB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.ClientConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FABE2750-CC9C-4852-A64F-57A570ABDE4D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4A4E028-61B9-4299-ABDD-7C75A63E8624' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Credential 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '88405F56-5CDF-4524-8F4F-61374C43912B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6038A72B-5280-433B-861A-F4B988C24614' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C15CD0E1-DDD6-4FE8-A0B0-2BFC45511984' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.ClientVisible 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8FD0F71-58C1-4042-A953-17ECD119BEC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B862B45-4E9C-4D3D-A1EF-47D7CABF0742' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AFE307F-A648-4FCD-B2D5-CCBFF08DE2E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Authentication Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD877C7B-8E8B-4AAB-9613-0F28AF057036' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('78e58c2d-ffff-4972-8f74-a0cb36f57751', '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Basic provider identification and display settings for the login interface."},"Authentication Settings":{"icon":"fa fa-lock","description":"OAuth and JWT configuration parameters required for token validation."},"Technical Configuration":{"icon":"fa fa-code","description":"Advanced driver class and JSON-based configuration for server and client runtime behavior."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7c611e82-13a2-45dd-8451-18d033662c89', '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Authentication Settings":"fa fa-lock","Technical Configuration":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5';

