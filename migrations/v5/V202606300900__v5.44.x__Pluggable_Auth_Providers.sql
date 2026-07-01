-- =====================================================================================
-- Pluggable Authentication Providers
-- =====================================================================================
-- Introduces __mj.AuthenticationProvider, the metadata catalog of authentication
-- providers (Auth0, Okta, MSAL, Cognito, Google, WorkOS, or any third-party driver).
--
-- This makes auth providers METADATA-DRIVEN like the rest of MemberJunction: a row names
-- a DriverClass that is resolved at runtime via
--   MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass, ...)
-- exactly as File Storage Providers (ServerDriverKey) and AI Remote Browser Providers
-- (DriverClass) already work. No more hard-wired provider lists; third parties plug in by
-- shipping a @RegisterClass(BaseAuthProvider,'x') subclass and adding a row here.
--
-- CodeGen handoff: after this migration runs, `mj codegen` generates
--   - MJAuthenticationProviderEntity (entity name "MJ: Authentication Providers")
--   - the base view + spCreate/spUpdate/spDelete + permissions
-- which the AuthProviderEngine / resolver / Explorer login picker then build against.
--
-- Secrets: most providers validate via PUBLIC JWKS and need NO secret (CredentialID null).
-- Providers that DO need a server-side secret (confidential OAuth, management APIs, SCIM)
-- reference the existing __mj.Credential entity via CredentialID (decrypted at runtime by
-- CredentialEngine) — mirroring the File Storage credential model.
-- =====================================================================================

CREATE TABLE ${flyway:defaultSchema}.AuthenticationProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),

    -- Identity / discovery
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(255) NOT NULL,
    Type NVARCHAR(50) NULL,

    -- OIDC / JWT connection fields (non-secret; used by BaseAuthProvider for validation)
    Issuer NVARCHAR(500) NULL,
    Audience NVARCHAR(500) NULL,
    JWKSUri NVARCHAR(500) NULL,
    ClientID NVARCHAR(255) NULL,
    Domain NVARCHAR(255) NULL,
    Scopes NVARCHAR(500) NULL,

    -- Driver-specific extras as JSON (e.g. WorkOS apiHostname, Cognito region/userPoolId, redirectUri)
    AdditionalConfiguration NVARCHAR(MAX) NULL,

    -- Optional secret material for providers that need server-initiated calls
    CredentialID UNIQUEIDENTIFIER NULL,

    -- Lifecycle / selection
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    IsDefault BIT NOT NULL DEFAULT 0,

    -- Browser login picker presentation (only shown pre-auth when 2+ ClientVisible providers are Active)
    ClientVisible BIT NOT NULL DEFAULT 1,
    DisplayName NVARCHAR(100) NULL,
    Icon NVARCHAR(100) NULL,
    Sequence INT NOT NULL DEFAULT 0,

    CONSTRAINT PK_AuthenticationProvider PRIMARY KEY (ID),
    CONSTRAINT UQ_AuthenticationProvider_Name UNIQUE (Name),
    CONSTRAINT FK_AuthenticationProvider_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_AuthenticationProvider_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

-- ------------------------------------------------------------------------------------
-- Column descriptions (consumed by CodeGen; PK ID + FK CredentialID handled by CodeGen)
-- ------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Metadata catalog of authentication providers. Each row defines one provider (Auth0, Okta, MSAL, Cognito, Google, WorkOS, or any third-party driver) whose implementation is resolved at runtime from DriverClass via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). Replaces the hard-wired mj.config.cjs authProviders array (which remains a back-compat fallback when this table is empty).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique, human-readable name for this provider instance (e.g. "WorkOS Production", "Corporate Azure AD").',
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
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass). MUST match the @RegisterClass key on the concrete server provider (e.g. "workos", "auth0", "okta", "msal", "cognito", "google").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional informational protocol label, e.g. "oidc". Does not affect resolution (DriverClass does).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Type';

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
    @value = N'Public OAuth client ID. Safe to expose to the browser; also surfaced to the pre-auth login picker.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'ClientID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider domain where applicable (e.g. Auth0/Okta tenant domain). Optional.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Domain';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OAuth scopes to request, space- or comma-delimited (e.g. "openid profile email").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Scopes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver-specific configuration as a JSON object for fields not modeled as columns (e.g. WorkOS apiHostname, Cognito region/userPoolId, redirectUri). Merged into the provider config at instantiation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'AdditionalConfiguration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active providers are registered at startup and offered for login.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider is treated as the default selection (e.g. pre-highlighted in the picker, or used when only one is active).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider appears in the browser pre-auth login picker. The picker is only rendered when 2+ Active, ClientVisible providers exist; with one, login proceeds directly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'ClientVisible';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Label shown on the login picker button (e.g. "Sign in with Microsoft"). Falls back to Name when null.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Icon for the login picker button — a Font Awesome class (e.g. "fa-brands fa-microsoft") or a known brand-logo key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Icon';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering of this provider within the login picker (ascending).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AuthenticationProvider',
    @level2type = N'COLUMN', @level2name = N'Sequence';
