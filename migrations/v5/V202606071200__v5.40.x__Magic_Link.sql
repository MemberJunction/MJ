-- ============================================================================
-- Migration: Magic Link (consolidated)
-- Consolidates the magic-link feature DDL + seed into one migration:
--   1) MagicLinkInvite base table        (was V202605311600)
--   2) MagicLinkRedemption audit table   (was V202606050949)
--   3) RLS filters for identity reads    (was V202606051040)
--   4) Invite child tables (apps/roles/domains/paths) (was V202606051243)
--   5) Anonymous principal + resource/embed/tier columns (was V202606051319)
-- The CodeGen output (entities, views, sprocs, permissions) is appended below
-- the CODE GEN RUN banner after a fresh `mj codegen` against a clean DB.
-- Metadata-file seeds (audit-log-types, entity-permission ReadRLSFilterID) are
-- applied separately via `mj sync push` (MJ convention for lookup/reference data).
-- ============================================================================


-- Migration: Create MagicLinkInvite table
-- Description: Backing store for shareable, single-use, app-scoped magic-link
--   invites that let EXTERNAL users into MJ without a password and without
--   access to the whole Explorer. Each invite is bound to one Application and
--   one (restricted) Role; redeeming it provisions/links a user with exactly
--   that scope and mints a short-lived MJ-issued JWT.
--
-- Security model (see plans/auth0-magic-link.md):
--   * The raw token is NEVER stored — only its SHA-256 hash (TokenHash),
--     mirroring the @memberjunction/api-keys pattern. The raw token lives only
--     in the emailed URL.
--   * Single-use is enforced atomically at redemption: a compare-and-swap UPDATE
--     (UseCount/ConsumedAt/Status, guarded by UseCount < MaxUses + Active + not
--     expired) runs BEFORE the JWT is minted, so concurrent redemptions of a
--     single-use link race on the row and exactly one wins (fail-closed). An
--     already-consumed, expired, or revoked invite is rejected.
--   * The RoleID is the real authorization boundary (entity-level permissions),
--     not the nav filtering.
--
-- NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared
--   here — CodeGen generates those. The UNIQUE constraint on TokenHash IS
--   declared here because it is not a foreign key.

CREATE TABLE ${flyway:defaultSchema}.MagicLinkInvite (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    TokenHash NVARCHAR(128) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL,
    ConsumedAt DATETIMEOFFSET NULL,
    MaxUses INT NOT NULL DEFAULT 1,
    UseCount INT NOT NULL DEFAULT 0,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_MagicLinkInvite PRIMARY KEY (ID),
    CONSTRAINT UQ_MagicLinkInvite_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_MagicLinkInvite_Application FOREIGN KEY (ApplicationID)
        REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_MagicLinkInvite_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT FK_MagicLinkInvite_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_MagicLinkInvite_Status
        CHECK (Status IN ('Active', 'Consumed', 'Revoked', 'Expired')),
    CONSTRAINT CK_MagicLinkInvite_UseCount
        CHECK (UseCount >= 0 AND UseCount <= MaxUses)
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'SHA-256 hash (hex) of the raw magic-link token. The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'TokenHash';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'Email';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ApplicationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'RoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ExpiresAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ConsumedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'MaxUses';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'UseCount';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'CreatedByUserID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'Status';



















































GO

-- Migration: Create MagicLinkRedemption table + correct TokenHash description
-- Description: Per-redemption audit trail for magic-link invites (Phase 1 of the
--   magic-link expansion/hardening plan, item #8). Today MagicLinkInvite keeps
--   only UseCount + last ConsumedAt — no per-use history, no IP/User-Agent, and
--   no record of FAILED attempts. This table records one row per redemption
--   ATTEMPT (success or failure), which:
--     * gives Skip-style resource sharing a clean redemption history, and
--     * surfaces token scanning / brute-force (a burst of `not_found` rows from
--       one IP is the signal), which is why failures are logged too.
--
-- Design notes:
--   * InviteID is NULLABLE on purpose: a `not_found` attempt (random/guessed
--     token that matches no invite) has no invite to reference, yet is exactly
--     the attempt we most want logged. Successful + invite-bound failures carry
--     the FK.
--   * ProvisionedUserID is NULLABLE: only a successful redemption provisions a
--     user; failures (and future anonymous redemptions) leave it null.
--   * Outcome is `success` plus the RedeemErrorCode union from
--     auth/magicLink/types.ts — kept in sync via the CHECK constraint below.
--   * Retention + IP anonymization are deployment policy (config
--     magicLink.audit.retentionDays / audit.ipStorage), enforced in app code +
--     a scheduled purge — NOT in the schema. The column simply holds whatever
--     the app chose to store.
--
-- NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared
--   here — CodeGen generates those.

CREATE TABLE ${flyway:defaultSchema}.MagicLinkRedemption (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InviteID UNIQUEIDENTIFIER NULL,
    AttemptedAt DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME(),
    Outcome NVARCHAR(30) NOT NULL,
    IPAddress NVARCHAR(64) NULL,
    UserAgent NVARCHAR(512) NULL,
    Origin NVARCHAR(512) NULL,
    ProvisionedUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_MagicLinkRedemption PRIMARY KEY (ID),
    CONSTRAINT FK_MagicLinkRedemption_Invite FOREIGN KEY (InviteID)
        REFERENCES ${flyway:defaultSchema}.MagicLinkInvite(ID),
    CONSTRAINT FK_MagicLinkRedemption_ProvisionedUser FOREIGN KEY (ProvisionedUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_MagicLinkRedemption_Outcome
        CHECK (Outcome IN ('success', 'not_found', 'expired', 'consumed', 'revoked', 'invalid', 'provisioning_failed', 'server_error'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'One row per magic-link redemption ATTEMPT (success or failure). Provides per-use redemption history and forensic visibility into token scanning/brute-force. Distinct from MagicLinkInvite, which keeps only an aggregate UseCount + last ConsumedAt.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to MagicLinkInvite. NULLABLE: a redemption attempt against a token that matches no invite (not_found — the signature of scanning/brute-force) has no invite to reference but is still logged.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'InviteID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp of the redemption attempt (UTC). Defaults to the time of insert.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'AttemptedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Outcome of the attempt: ''success'', or one of the redemption error codes (not_found, expired, consumed, revoked, invalid, provisioning_failed, server_error). Mirrors the RedeemErrorCode union in the server code.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'Outcome';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Client IP address the redemption came from, as captured by the request middleware. May be stored full, truncated, hashed, or omitted per the deployment''s magicLink.audit.ipStorage policy. NULL when unavailable or policy is ''none''.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'IPAddress';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'User-Agent header of the redeeming client. NULL when unavailable.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'UserAgent';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Origin header of the redemption request. Retained for embed/domain forensics (which host framed or initiated the redemption). NULL for direct (non-embedded) redemptions.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'Origin';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the User provisioned/linked by a SUCCESSFUL redemption. NULL on failed attempts and on (future) anonymous redemptions that resolve to a shared principal rather than a per-email user.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkRedemption',
    @level2type=N'COLUMN', @level2name=N'ProvisionedUserID';


-- Correct the MagicLinkInvite.TokenHash description: the hash is now stored
-- base64url-encoded (43 chars), not hex (64). Drop the stale extended property
-- before re-adding so CodeGen re-syncs EntityField.Description on the next run.
IF EXISTS (SELECT 1 FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.MagicLinkInvite')
           AND minor_id = (SELECT column_id FROM sys.columns
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.MagicLinkInvite')
                          AND name = 'TokenHash')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty @name=N'MS_Description',
        @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
        @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
        @level2type=N'COLUMN', @level2name=N'TokenHash';
END;

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'SHA-256 hash of the raw magic-link token, base64url-encoded (43 chars). The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'TokenHash';

GO

-- Migration: Seed Row-Level Security filters for the magic-link boot baseline
-- Description: The Magic Link Baseline (deny-all external) role is granted entity-wide
--   READ on three identity/scope-resolution entities (User Roles, User Applications,
--   Application Roles) so a magic-link guest can boot. Without row filtering those
--   reads expose every row in those tables. These two RLS filters scope the reads to
--   the current user's own rows; the entity-permission links (ReadRLSFilterID) are
--   set via metadata (metadata/entity-permissions). Internal users stay unaffected:
--   they hold roles whose permission on these entities carries no RLS filter, so
--   UserExemptFromRowLevelSecurity returns true for them.
--
-- Why SQL seed (not metadata sync): RowLevelSecurityFilter create is denied to all
--   non-Owner roles, and MetadataSync runs as the System user (not Owner type), so it
--   cannot create these rows. They are reference data, seeded here with fixed UUIDs.
--   The {{UserID}} token is substituted at query time by MarkupFilterText.
--
-- NOTE: ${flyway:defaultSchema} resolves to the deployment schema at migrate time, so
--   the stored FilterText references the correct schema for the Application Roles
--   subquery. No __mj timestamp columns are inserted (CodeGen/DB manage them).

-- Magic Link: Own Rows by UserID — for entities keyed by UserID (User Roles, User Applications)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'B3717817-E88C-4C79-87D8-0C2D4B869873')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'B3717817-E88C-4C79-87D8-0C2D4B869873',
        'Magic Link: Own Rows by UserID',
        'UserID = ''{{UserID}}''',
        'Restricts an entity (keyed by UserID) to the current user''s own rows. Attached to the Magic Link Baseline role''s read permission on User Roles and User Applications so a magic-link guest resolves only its own identity/app scope, never the whole table.'
    );
END;

-- Magic Link: Own Application Roles — Application Roles has no UserID, so scope via the user's roles
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'C04BCFB7-B880-44A6-9D6E-1633A4D03469')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'C04BCFB7-B880-44A6-9D6E-1633A4D03469',
        'Magic Link: Own Application Roles',
        'RoleID IN (SELECT RoleID FROM ${flyway:defaultSchema}.vwUserRoles WHERE UserID = ''{{UserID}}'')',
        'Restricts Application Roles to rows for roles the current user actually holds (Application Roles has no UserID column, so it scopes via the user''s roles). Attached to the Magic Link Baseline role''s read permission on Application Roles so a magic-link guest can confirm its role can reach its app without reading every application''s role grants.'
    );
END;

GO

-- Migration: Magic-link invite child tables (multi-application / multi-role)
-- Description: Phase 2 of the magic-link expansion plan — schema widening only.
--   Today a MagicLinkInvite carries a single ApplicationID + RoleID. The Skip-style
--   resource-sharing direction needs an invite to be able to grant more than one
--   app/role eventually. Introducing the child tables NOW (while the feature is
--   unpublished, so the Publish-No-Break policy doesn't bite) avoids a breaking
--   migration later when multi-scope enforcement is designed.
--
--   This migration is ADDITIVE and low-risk:
--     * The single ApplicationID / RoleID columns on MagicLinkInvite are RETAINED.
--       Create/redeem stay one-of-each for now (per the plan — multi-scope
--       *enforcement* semantics are deferred until the union model is settled).
--     * CreateInvite will additionally write one row into each child table so the
--       data is present for when reads switch to the child tables. The columns
--       remain the source of truth for redemption until that switch.
--
-- NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared —
--   CodeGen generates those. The UNIQUE constraints are declared here (not FKs).

CREATE TABLE ${flyway:defaultSchema}.MagicLinkInviteApplication (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InviteID UNIQUEIDENTIFIER NOT NULL,
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_MagicLinkInviteApplication PRIMARY KEY (ID),
    CONSTRAINT FK_MagicLinkInviteApplication_Invite FOREIGN KEY (InviteID)
        REFERENCES ${flyway:defaultSchema}.MagicLinkInvite(ID),
    CONSTRAINT FK_MagicLinkInviteApplication_Application FOREIGN KEY (ApplicationID)
        REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT UQ_MagicLinkInviteApplication UNIQUE (InviteID, ApplicationID)
);

CREATE TABLE ${flyway:defaultSchema}.MagicLinkInviteRole (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InviteID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_MagicLinkInviteRole PRIMARY KEY (ID),
    CONSTRAINT FK_MagicLinkInviteRole_Invite FOREIGN KEY (InviteID)
        REFERENCES ${flyway:defaultSchema}.MagicLinkInvite(ID),
    CONSTRAINT FK_MagicLinkInviteRole_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT UQ_MagicLinkInviteRole UNIQUE (InviteID, RoleID)
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Join row granting a magic-link invite access to one Application. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.ApplicationID) while multi-scope enforcement is being designed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteApplication';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the MagicLinkInvite this application grant belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteApplication',
    @level2type=N'COLUMN', @level2name=N'InviteID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the Application this invite grants access to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteApplication',
    @level2type=N'COLUMN', @level2name=N'ApplicationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Join row granting a magic-link invite a Role. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.RoleID) while multi-scope enforcement is being designed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteRole';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the MagicLinkInvite this role grant belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteRole',
    @level2type=N'COLUMN', @level2name=N'InviteID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the Role this invite grants to the redeeming user.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteRole',
    @level2type=N'COLUMN', @level2name=N'RoleID';

GO

-- Migration: Magic-link expansion schema — anonymous identity, resource scope,
--            embed domains, and invite kind (Phases 4–7, schema only)
-- Description: Consolidates the schema for the remaining magic-link expansion phases
--   into one migration (one CodeGen cycle). The per-phase BEHAVIOR ships in code on
--   top of these columns/tables; this migration is additive and safe to apply ahead
--   of that code (all new columns are nullable or defaulted).
--
--   Phase 4 (anonymous identity): MagicLinkInvite.IdentityMode + Email nullable; seed
--     a shared Anonymous principal (attribution anchor only — never a permission
--     holder; no UserRole rows are ever attached to it).
--   Phase 5 (resource scoping): MagicLinkInvite.ResourceTypeID/ResourceID — the single
--     FE resource a link shares; dependent data is admitted at runtime via FK-reachable
--     resource-pinned RLS (see plans/magic-link-oq1-route-resource-rbac-design.md).
--   Phase 6 (embed): MagicLinkInviteAllowedDomain — host allow-list for CSP frame-ancestors.
--   Phase 7 (tier): MagicLinkInvite.Kind — gates which scope columns/claims are valid and
--     which issuance capability check applies.
--
--   GO batch separators are required: statements that reference the newly-added columns
--   (the cross-field CHECK, extended properties) must run in a later batch than the ADD.
--
-- NOTE: No __mj timestamp columns / FK indexes (CodeGen adds them). The Anonymous user
--   is SQL-seeded with a fixed UUID (security-sensitive system row; same pattern as the
--   baseline System user and the Phase-1 RLS filters).

------------------------------------------------------------------------------------
-- Phase 4 + 5 + 7 — new columns on MagicLinkInvite (single consolidated ALTER)
------------------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.MagicLinkInvite ADD
    IdentityMode NVARCHAR(20) NOT NULL CONSTRAINT DF_MagicLinkInvite_IdentityMode DEFAULT 'email',
    Kind NVARCHAR(30) NOT NULL CONSTRAINT DF_MagicLinkInvite_Kind DEFAULT 'app-session',
    ResourceTypeID UNIQUEIDENTIFIER NULL,
    ResourceID NVARCHAR(450) NULL,
    CONSTRAINT FK_MagicLinkInvite_ResourceType FOREIGN KEY (ResourceTypeID)
        REFERENCES ${flyway:defaultSchema}.ResourceType(ID),
    CONSTRAINT CK_MagicLinkInvite_IdentityMode CHECK (IdentityMode IN ('email', 'anonymous')),
    CONSTRAINT CK_MagicLinkInvite_Kind CHECK (Kind IN ('app-session', 'resource-share', 'anonymous-embed'));
GO

-- Phase 4 — Email becomes optional (anonymous invites carry no recipient identity).
ALTER TABLE ${flyway:defaultSchema}.MagicLinkInvite ALTER COLUMN Email NVARCHAR(255) NULL;
GO

-- email-mode invites must still carry an Email; anonymous invites may omit it.
ALTER TABLE ${flyway:defaultSchema}.MagicLinkInvite ADD CONSTRAINT CK_MagicLinkInvite_Email_IdentityMode
    CHECK (IdentityMode <> 'email' OR Email IS NOT NULL);
GO

------------------------------------------------------------------------------------
-- Phase 6 — per-link authorized embedding domains (CSP frame-ancestors allow-list)
------------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InviteID UNIQUEIDENTIFIER NOT NULL,
    Domain NVARCHAR(255) NOT NULL,
    CONSTRAINT PK_MagicLinkInviteAllowedDomain PRIMARY KEY (ID),
    CONSTRAINT FK_MagicLinkInviteAllowedDomain_Invite FOREIGN KEY (InviteID)
        REFERENCES ${flyway:defaultSchema}.MagicLinkInvite(ID),
    CONSTRAINT UQ_MagicLinkInviteAllowedDomain UNIQUE (InviteID, Domain)
);
GO

------------------------------------------------------------------------------------
-- Phase 5 — per-link allowed FE paths (Explorer UX confinement; NOT the security boundary)
------------------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.MagicLinkInviteAllowedPath (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InviteID UNIQUEIDENTIFIER NOT NULL,
    Path NVARCHAR(1000) NOT NULL,
    CONSTRAINT PK_MagicLinkInviteAllowedPath PRIMARY KEY (ID),
    CONSTRAINT FK_MagicLinkInviteAllowedPath_Invite FOREIGN KEY (InviteID)
        REFERENCES ${flyway:defaultSchema}.MagicLinkInvite(ID),
    CONSTRAINT UQ_MagicLinkInviteAllowedPath UNIQUE (InviteID, Path)
);
GO

------------------------------------------------------------------------------------
-- Phase 4 — seed the shared Anonymous principal (attribution anchor; no roles ever)
------------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.[User] WHERE ID = '273910DF-28F1-45C1-A8F8-6E9AD8E5F008')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.[User] (ID, Name, FirstName, LastName, Email, Type, IsActive)
    VALUES (
        '273910DF-28F1-45C1-A8F8-6E9AD8E5F008',
        'Anonymous', 'Anonymous', NULL,
        'anonymous@magic-link.local',
        'User', 1
    );
END;
GO

------------------------------------------------------------------------------------
-- Extended properties (run after the columns/tables are committed)
------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Identity resolution mode. ''email'' (default, legacy): redemption provisions/links a per-email user and enforcement rides that user''s DB roles. ''anonymous'': all redemptions resolve to the shared Anonymous principal (an attribution anchor, not a permission holder); scope is carried per-session in the minted JWT claims, never as roles on that user.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite', @level2type=N'COLUMN', @level2name=N'IdentityMode';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Invite kind, gating which scope columns/claims are valid and which issuance capability check applies. ''app-session'' (default): the legacy app+role session. ''resource-share'': scoped to a single resource (ResourceTypeID/ResourceID). ''anonymous-embed'': framed in an external site (requires allowed domains + tier capability).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite', @level2type=N'COLUMN', @level2name=N'Kind';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For resource-share/embed kinds: the ResourceType of the single resource this link shares. The link''s reach to dependent data is admitted at runtime via FK-reachable resource-pinned row-level security, not an enumerated list. NULL for app-session invites.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite', @level2type=N'COLUMN', @level2name=N'ResourceTypeID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For resource-share/embed kinds: the primary-key value of the specific shared resource (stringified to support any resource''s key type). NULL for app-session invites.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite', @level2type=N'COLUMN', @level2name=N'ResourceID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'An external host (origin) where this invite may be embedded in an IFRAME. Enforced server-side via Content-Security-Policy frame-ancestors plus Origin/Referer checks on embed responses. Multiple rows = multiple allowed hosts.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedDomain';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the MagicLinkInvite this allowed-domain belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedDomain', @level2type=N'COLUMN', @level2name=N'InviteID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'An allowed host/origin (e.g. https://partner.example.com) where the link may be framed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedDomain', @level2type=N'COLUMN', @level2name=N'Domain';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'An Explorer FE path (after the base URL) this link is confined to in the UI. This is UX confinement only — the real authorization boundary is server-side entity/resource permissions. Multiple rows = multiple allowed paths.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedPath';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to the MagicLinkInvite this allowed-path belongs to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedPath', @level2type=N'COLUMN', @level2name=N'InviteID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'An allowed FE path (after the Explorer base URL) the session may navigate to. UX confinement only.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInviteAllowedPath', @level2type=N'COLUMN', @level2name=N'Path';
GO

GO



















































































/* SQL generated to create new entity MJ: Magic Link Invites */

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
         'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
         'MJ: Magic Link Invites',
         'Magic Link Invites',
         'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.',
         NULL,
         'MagicLinkInvite',
         'vwMagicLinkInvites',
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

/* SQL generated to add new entity MJ: Magic Link Invites to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e41a5dee-c259-4b6e-a3c5-bb022bd5f10a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e41a5dee-c259-4b6e-a3c5-bb022bd5f10a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e41a5dee-c259-4b6e-a3c5-bb022bd5f10a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Magic Link Redemptions */

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
         '9d479bce-5c29-4957-90e6-f350d87b38cf',
         'MJ: Magic Link Redemptions',
         'Magic Link Redemptions',
         'One row per magic-link redemption ATTEMPT (success or failure). Provides per-use redemption history and forensic visibility into token scanning/brute-force. Distinct from MagicLinkInvite, which keeps only an aggregate UseCount + last ConsumedAt.',
         NULL,
         'MagicLinkRedemption',
         'vwMagicLinkRedemptions',
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

/* SQL generated to add new entity MJ: Magic Link Redemptions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9d479bce-5c29-4957-90e6-f350d87b38cf', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9d479bce-5c29-4957-90e6-f350d87b38cf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9d479bce-5c29-4957-90e6-f350d87b38cf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9d479bce-5c29-4957-90e6-f350d87b38cf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Magic Link Invite Applications */

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
         'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
         'MJ: Magic Link Invite Applications',
         'Magic Link Invite Applications',
         'Join row granting a magic-link invite access to one Application. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.ApplicationID) while multi-scope enforcement is being designed.',
         NULL,
         'MagicLinkInviteApplication',
         'vwMagicLinkInviteApplications',
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

/* SQL generated to add new entity MJ: Magic Link Invite Applications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c6988fa5-1ee9-40ee-9ba6-3096cb832208', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6988fa5-1ee9-40ee-9ba6-3096cb832208', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6988fa5-1ee9-40ee-9ba6-3096cb832208', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6988fa5-1ee9-40ee-9ba6-3096cb832208', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Magic Link Invite Roles */

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
         'e9d66e45-4771-4d80-97d4-42007b9951fb',
         'MJ: Magic Link Invite Roles',
         'Magic Link Invite Roles',
         'Join row granting a magic-link invite a Role. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.RoleID) while multi-scope enforcement is being designed.',
         NULL,
         'MagicLinkInviteRole',
         'vwMagicLinkInviteRoles',
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

/* SQL generated to add new entity MJ: Magic Link Invite Roles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e9d66e45-4771-4d80-97d4-42007b9951fb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e9d66e45-4771-4d80-97d4-42007b9951fb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e9d66e45-4771-4d80-97d4-42007b9951fb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e9d66e45-4771-4d80-97d4-42007b9951fb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Magic Link Invite Allowed Domains */

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
         'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
         'MJ: Magic Link Invite Allowed Domains',
         'Magic Link Invite Allowed Domains',
         'An external host (origin) where this invite may be embedded in an IFRAME. Enforced server-side via Content-Security-Policy frame-ancestors plus Origin/Referer checks on embed responses. Multiple rows = multiple allowed hosts.',
         NULL,
         'MagicLinkInviteAllowedDomain',
         'vwMagicLinkInviteAllowedDomains',
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

/* SQL generated to add new entity MJ: Magic Link Invite Allowed Domains to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c66b6327-ecf6-47f8-a11b-b4d5e154ae51', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c66b6327-ecf6-47f8-a11b-b4d5e154ae51', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c66b6327-ecf6-47f8-a11b-b4d5e154ae51', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c66b6327-ecf6-47f8-a11b-b4d5e154ae51', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Magic Link Invite Allowed Paths */

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
         'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
         'MJ: Magic Link Invite Allowed Paths',
         'Magic Link Invite Allowed Paths',
         'An Explorer FE path (after the base URL) this link is confined to in the UI. This is UX confinement only — the real authorization boundary is server-side entity/resource permissions. Multiple rows = multiple allowed paths.',
         NULL,
         'MagicLinkInviteAllowedPath',
         'vwMagicLinkInviteAllowedPaths',
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

/* SQL generated to add new entity MJ: Magic Link Invite Allowed Paths to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b6f89bf5-3d26-4d0b-b466-add280f8e5f5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b6f89bf5-3d26-4d0b-b466-add280f8e5f5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b6f89bf5-3d26-4d0b-b466-add280f8e5f5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b6f89bf5-3d26-4d0b-b466-add280f8e5f5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteApplication] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ADD CONSTRAINT [DF___mj_MagicLinkInviteApplication___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteApplication] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteApplication] ADD CONSTRAINT [DF___mj_MagicLinkInviteApplication___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteRole] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ADD CONSTRAINT [DF___mj_MagicLinkInviteRole___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteRole] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteRole */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteRole] ADD CONSTRAINT [DF___mj_MagicLinkInviteRole___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ADD CONSTRAINT [DF___mj_MagicLinkInviteAllowedPath___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ADD CONSTRAINT [DF___mj_MagicLinkInviteAllowedPath___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ADD CONSTRAINT [DF___mj_MagicLinkInviteAllowedDomain___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
UPDATE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ADD CONSTRAINT [DF___mj_MagicLinkInviteAllowedDomain___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD CONSTRAINT [DF___mj_MagicLinkInvite___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD CONSTRAINT [DF___mj_MagicLinkInvite___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
UPDATE [${flyway:defaultSchema}].[MagicLinkRedemption] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ADD CONSTRAINT [DF___mj_MagicLinkRedemption___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
UPDATE [${flyway:defaultSchema}].[MagicLinkRedemption] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkRedemption */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkRedemption] ADD CONSTRAINT [DF___mj_MagicLinkRedemption___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0afd76c5-3824-4b1c-852c-96241586b6d8' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = 'ID')) BEGIN
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
            '0afd76c5-3824-4b1c-852c-96241586b6d8',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b5ffe3a-bd40-4155-bf10-805e4fe3a7f1' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = 'InviteID')) BEGIN
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
            '6b5ffe3a-bd40-4155-bf10-805e4fe3a7f1',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
            100002,
            'InviteID',
            'Invite ID',
            'Foreign key to the MagicLinkInvite this application grant belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cf79958-d217-4a90-9567-45261f92b131' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = 'ApplicationID')) BEGIN
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
            '6cf79958-d217-4a90-9567-45261f92b131',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
            100003,
            'ApplicationID',
            'Application ID',
            'Foreign key to the Application this invite grants access to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4b8d9d5-10bd-4932-a830-cc459caf2b69' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a4b8d9d5-10bd-4932-a830-cc459caf2b69',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb0d2b07-c126-4df1-a40c-4ca2b77c7bc7' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fb0d2b07-c126-4df1-a40c-4ca2b77c7bc7',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b4a9d9f-c828-43a3-a8d8-a6d0f79dedb7' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = 'ID')) BEGIN
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
            '7b4a9d9f-c828-43a3-a8d8-a6d0f79dedb7',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50ea952b-fbb2-4698-867b-896d78c5ee35' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = 'InviteID')) BEGIN
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
            '50ea952b-fbb2-4698-867b-896d78c5ee35',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
            100002,
            'InviteID',
            'Invite ID',
            'Foreign key to the MagicLinkInvite this role grant belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d8979c9-f6e4-4562-a6b2-c334b6a21202' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = 'RoleID')) BEGIN
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
            '8d8979c9-f6e4-4562-a6b2-c334b6a21202',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
            100003,
            'RoleID',
            'Role ID',
            'Foreign key to the Role this invite grants to the redeeming user.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '960647d4-9555-4c90-a144-6f9d0998aa3b' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = '__mj_CreatedAt')) BEGIN
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
            '960647d4-9555-4c90-a144-6f9d0998aa3b',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c33697a-6de9-4d5d-b815-779ba884e53f' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0c33697a-6de9-4d5d-b815-779ba884e53f',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '550dffe3-aa89-4cfc-b980-ff9967609fd2' OR (EntityID = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND Name = 'ID')) BEGIN
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
            '550dffe3-aa89-4cfc-b980-ff9967609fd2',
            'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', -- Entity: MJ: Magic Link Invite Allowed Paths
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f770c3b1-ceda-4a5e-b290-29f151ae26b0' OR (EntityID = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND Name = 'InviteID')) BEGIN
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
            'f770c3b1-ceda-4a5e-b290-29f151ae26b0',
            'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', -- Entity: MJ: Magic Link Invite Allowed Paths
            100002,
            'InviteID',
            'Invite ID',
            'Foreign key to the MagicLinkInvite this allowed-path belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e45de26f-c002-4fbf-b024-60bcd5855f2e' OR (EntityID = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND Name = 'Path')) BEGIN
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
            'e45de26f-c002-4fbf-b024-60bcd5855f2e',
            'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', -- Entity: MJ: Magic Link Invite Allowed Paths
            100003,
            'Path',
            'Path',
            'An allowed FE path (after the Explorer base URL) the session may navigate to. UX confinement only.',
            'nvarchar',
            2000,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c4abc4a-988a-4328-9a8f-93947e13d00c' OR (EntityID = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND Name = '__mj_CreatedAt')) BEGIN
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
            '9c4abc4a-988a-4328-9a8f-93947e13d00c',
            'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', -- Entity: MJ: Magic Link Invite Allowed Paths
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8dcab9f-cdd5-485c-b59d-84bc5fdb4bb5' OR (EntityID = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a8dcab9f-cdd5-485c-b59d-84bc5fdb4bb5',
            'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', -- Entity: MJ: Magic Link Invite Allowed Paths
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39801ec5-bc02-4a8b-9e48-6cb5c109b682' OR (EntityID = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND Name = 'ID')) BEGIN
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
            '39801ec5-bc02-4a8b-9e48-6cb5c109b682',
            'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', -- Entity: MJ: Magic Link Invite Allowed Domains
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9a08b47-b366-4dd7-a36a-f291891d5df0' OR (EntityID = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND Name = 'InviteID')) BEGIN
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
            'b9a08b47-b366-4dd7-a36a-f291891d5df0',
            'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', -- Entity: MJ: Magic Link Invite Allowed Domains
            100002,
            'InviteID',
            'Invite ID',
            'Foreign key to the MagicLinkInvite this allowed-domain belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '522121ce-4c2e-4651-851e-7b3d31ac1903' OR (EntityID = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND Name = 'Domain')) BEGIN
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
            '522121ce-4c2e-4651-851e-7b3d31ac1903',
            'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', -- Entity: MJ: Magic Link Invite Allowed Domains
            100003,
            'Domain',
            'Domain',
            'An allowed host/origin (e.g. https://partner.example.com) where the link may be framed.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e71f6de-e312-445c-8df1-746f0623d705' OR (EntityID = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1e71f6de-e312-445c-8df1-746f0623d705',
            'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', -- Entity: MJ: Magic Link Invite Allowed Domains
            100004,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '176c92c7-b352-41c3-95c8-a80d7db9326f' OR (EntityID = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '176c92c7-b352-41c3-95c8-a80d7db9326f',
            'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', -- Entity: MJ: Magic Link Invite Allowed Domains
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8619b36a-5c85-4b02-b137-f9db2ec0d0d8' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ID')) BEGIN
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
            '8619b36a-5c85-4b02-b137-f9db2ec0d0d8',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4115768e-9fe8-4688-8344-0621f877607d' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'TokenHash')) BEGIN
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
            '4115768e-9fe8-4688-8344-0621f877607d',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100002,
            'TokenHash',
            'Token Hash',
            'SHA-256 hash of the raw magic-link token, base64url-encoded (43 chars). The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.',
            'nvarchar',
            256,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b50c0712-ec31-4b08-a913-1a2d3dbe4df4' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'Email')) BEGIN
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
            'b50c0712-ec31-4b08-a913-1a2d3dbe4df4',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100003,
            'Email',
            'Email',
            'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7d9b6f1-1824-48a4-8f1d-7b7bd6eb68cc' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ApplicationID')) BEGIN
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
            'f7d9b6f1-1824-48a4-8f1d-7b7bd6eb68cc',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100004,
            'ApplicationID',
            'Application ID',
            'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27a980db-4f8f-4eb2-a377-1af794780ecf' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'RoleID')) BEGIN
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
            '27a980db-4f8f-4eb2-a377-1af794780ecf',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100005,
            'RoleID',
            'Role ID',
            'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06825f42-339b-46c4-afb5-49294a61f17e' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ExpiresAt')) BEGIN
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
            '06825f42-339b-46c4-afb5-49294a61f17e',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100006,
            'ExpiresAt',
            'Expires At',
            'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '566de4a8-1881-40f6-9ae4-c5a5be7317df' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ConsumedAt')) BEGIN
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
            '566de4a8-1881-40f6-9ae4-c5a5be7317df',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100007,
            'ConsumedAt',
            'Consumed At',
            'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6ac61b6-cdfa-493a-919f-a1d3c79ac1ed' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'MaxUses')) BEGIN
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
            'a6ac61b6-cdfa-493a-919f-a1d3c79ac1ed',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100008,
            'MaxUses',
            'Max Uses',
            'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6109f476-1b89-415d-9dc7-9d6c5f9c733f' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'UseCount')) BEGIN
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
            '6109f476-1b89-415d-9dc7-9d6c5f9c733f',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100009,
            'UseCount',
            'Use Count',
            'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c4ab92d-3732-4980-a2fe-6a5ba7a861ca' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'CreatedByUserID')) BEGIN
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
            '1c4ab92d-3732-4980-a2fe-6a5ba7a861ca',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100010,
            'CreatedByUserID',
            'Created By User ID',
            'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2fe5998-a12d-468d-820b-cc7bf4dea159' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'Status')) BEGIN
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
            'b2fe5998-a12d-468d-820b-cc7bf4dea159',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100011,
            'Status',
            'Status',
            'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8e356be-5210-4a6d-8e8d-020693165d43' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'IdentityMode')) BEGIN
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
            'f8e356be-5210-4a6d-8e8d-020693165d43',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100012,
            'IdentityMode',
            'Identity Mode',
            'Identity resolution mode. ''email'' (default, legacy): redemption provisions/links a per-email user and enforcement rides that user''s DB roles. ''anonymous'': all redemptions resolve to the shared Anonymous principal (an attribution anchor, not a permission holder); scope is carried per-session in the minted JWT claims, never as roles on that user.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'email',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57a2728e-bbd8-49e6-b01d-a9868c5364b8' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'Kind')) BEGIN
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
            '57a2728e-bbd8-49e6-b01d-a9868c5364b8',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100013,
            'Kind',
            'Kind',
            'Invite kind, gating which scope columns/claims are valid and which issuance capability check applies. ''app-session'' (default): the legacy app+role session. ''resource-share'': scoped to a single resource (ResourceTypeID/ResourceID). ''anonymous-embed'': framed in an external site (requires allowed domains + tier capability).',
            'nvarchar',
            60,
            0,
            0,
            0,
            'app-session',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '939d852b-22dc-4f28-b136-73abbe16eb93' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ResourceTypeID')) BEGIN
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
            '939d852b-22dc-4f28-b136-73abbe16eb93',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100014,
            'ResourceTypeID',
            'Resource Type ID',
            'For resource-share/embed kinds: the ResourceType of the single resource this link shares. The link''s reach to dependent data is admitted at runtime via FK-reachable resource-pinned row-level security, not an enumerated list. NULL for app-session invites.',
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
            '0B248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd70c0c3d-1871-4607-99c3-d81dbbc0bab1' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ResourceID')) BEGIN
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
            'd70c0c3d-1871-4607-99c3-d81dbbc0bab1',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100015,
            'ResourceID',
            'Resource ID',
            'For resource-share/embed kinds: the primary-key value of the specific shared resource (stringified to support any resource''s key type). NULL for app-session invites.',
            'nvarchar',
            900,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '355fc03e-1d6b-403b-96bf-33e917baf4ea' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '355fc03e-1d6b-403b-96bf-33e917baf4ea',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78016f6d-14f3-4945-a5a0-360411363be0' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '78016f6d-14f3-4945-a5a0-360411363be0',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c140977b-1aa5-46bd-9436-22b914bc7e39' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'ID')) BEGIN
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
            'c140977b-1aa5-46bd-9436-22b914bc7e39',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b5c9c3f-bdb4-4172-a41e-2e85bb4b2db1' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'InviteID')) BEGIN
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
            '9b5c9c3f-bdb4-4172-a41e-2e85bb4b2db1',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100002,
            'InviteID',
            'Invite ID',
            'Foreign key to MagicLinkInvite. NULLABLE: a redemption attempt against a token that matches no invite (not_found — the signature of scanning/brute-force) has no invite to reference but is still logged.',
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
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b06faa0-b332-4688-95f2-d14f15957ec3' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'AttemptedAt')) BEGIN
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
            '0b06faa0-b332-4688-95f2-d14f15957ec3',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100003,
            'AttemptedAt',
            'Attempted At',
            'Timestamp of the redemption attempt (UTC). Defaults to the time of insert.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysutcdatetime()',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36af1d71-a217-43b6-893e-856843cddf61' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'Outcome')) BEGIN
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
            '36af1d71-a217-43b6-893e-856843cddf61',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100004,
            'Outcome',
            'Outcome',
            'Outcome of the attempt: ''success'', or one of the redemption error codes (not_found, expired, consumed, revoked, invalid, provisioning_failed, server_error). Mirrors the RedeemErrorCode union in the server code.',
            'nvarchar',
            60,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbb8dff6-be76-4a61-9da6-0e91a11821f2' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'IPAddress')) BEGIN
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
            'bbb8dff6-be76-4a61-9da6-0e91a11821f2',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100005,
            'IPAddress',
            'IP Address',
            'Client IP address the redemption came from, as captured by the request middleware. May be stored full, truncated, hashed, or omitted per the deployment''s magicLink.audit.ipStorage policy. NULL when unavailable or policy is ''none''.',
            'nvarchar',
            128,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fde34e1a-2669-4b96-a931-fcee073aedc3' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'UserAgent')) BEGIN
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
            'fde34e1a-2669-4b96-a931-fcee073aedc3',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100006,
            'UserAgent',
            'User Agent',
            'User-Agent header of the redeeming client. NULL when unavailable.',
            'nvarchar',
            1024,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af907e5a-9737-4325-8722-7e6898026766' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'Origin')) BEGIN
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
            'af907e5a-9737-4325-8722-7e6898026766',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100007,
            'Origin',
            'Origin',
            'Origin header of the redemption request. Retained for embed/domain forensics (which host framed or initiated the redemption). NULL for direct (non-embedded) redemptions.',
            'nvarchar',
            1024,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03b4104e-29f2-49ac-8740-cc54138c0d7c' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'ProvisionedUserID')) BEGIN
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
            '03b4104e-29f2-49ac-8740-cc54138c0d7c',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100008,
            'ProvisionedUserID',
            'Provisioned User ID',
            'Foreign key to the User provisioned/linked by a SUCCESSFUL redemption. NULL on failed attempts and on (future) anonymous redemptions that resolve to a shared principal rather than a per-email user.',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efd24508-885a-4966-a0ca-dc58bfb71b42' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = '__mj_CreatedAt')) BEGIN
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
            'efd24508-885a-4966-a0ca-dc58bfb71b42',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06edc68f-20f0-4fe0-959b-b135724fab01' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '06edc68f-20f0-4fe0-959b-b135724fab01',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100010,
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

/* SQL text to insert entity field value with ID 109c6efe-fb22-4122-ad18-076f0b7d3f2f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('109c6efe-fb22-4122-ad18-076f0b7d3f2f', 'B2FE5998-A12D-468D-820B-CC7BF4DEA159', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b7943b0f-e100-479b-9977-da7a11a4575d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b7943b0f-e100-479b-9977-da7a11a4575d', 'B2FE5998-A12D-468D-820B-CC7BF4DEA159', 2, 'Consumed', 'Consumed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8548dd3f-8ffc-48d0-b720-0f52af6e1aae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8548dd3f-8ffc-48d0-b720-0f52af6e1aae', 'B2FE5998-A12D-468D-820B-CC7BF4DEA159', 3, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b74f3e70-544d-4299-933f-10e37b7c8049 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b74f3e70-544d-4299-933f-10e37b7c8049', 'B2FE5998-A12D-468D-820B-CC7BF4DEA159', 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B2FE5998-A12D-468D-820B-CC7BF4DEA159 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B2FE5998-A12D-468D-820B-CC7BF4DEA159';

/* SQL text to insert entity field value with ID 251bc5ee-ef84-4b83-9dcf-75f35d339963 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('251bc5ee-ef84-4b83-9dcf-75f35d339963', 'F8E356BE-5210-4A6D-8E8D-020693165D43', 1, 'anonymous', 'anonymous', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8085b703-75c0-49be-ba67-ab720609af3d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8085b703-75c0-49be-ba67-ab720609af3d', 'F8E356BE-5210-4A6D-8E8D-020693165D43', 2, 'email', 'email', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F8E356BE-5210-4A6D-8E8D-020693165D43 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F8E356BE-5210-4A6D-8E8D-020693165D43';

/* SQL text to insert entity field value with ID 4d50c78e-7f6c-4e70-a5d0-c288786b8a49 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4d50c78e-7f6c-4e70-a5d0-c288786b8a49', '57A2728E-BBD8-49E6-B01D-A9868C5364B8', 1, 'anonymous-embed', 'anonymous-embed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c9a0ab9a-b47a-4a9f-987e-f553cd76f421 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c9a0ab9a-b47a-4a9f-987e-f553cd76f421', '57A2728E-BBD8-49E6-B01D-A9868C5364B8', 2, 'app-session', 'app-session', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 85b0bec9-51bb-413e-8b73-b7b8df904698 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('85b0bec9-51bb-413e-8b73-b7b8df904698', '57A2728E-BBD8-49E6-B01D-A9868C5364B8', 3, 'resource-share', 'resource-share', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 57A2728E-BBD8-49E6-B01D-A9868C5364B8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='57A2728E-BBD8-49E6-B01D-A9868C5364B8';

/* SQL text to insert entity field value with ID 2e58d8dc-fb3a-4b55-9ce3-6060a3dd5600 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e58d8dc-fb3a-4b55-9ce3-6060a3dd5600', '36AF1D71-A217-43B6-893E-856843CDDF61', 1, 'consumed', 'consumed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b180059f-b42b-4702-9473-e32d26be0063 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b180059f-b42b-4702-9473-e32d26be0063', '36AF1D71-A217-43B6-893E-856843CDDF61', 2, 'expired', 'expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7a0770b-98c1-488b-ab6c-2b541c041a3f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7a0770b-98c1-488b-ab6c-2b541c041a3f', '36AF1D71-A217-43B6-893E-856843CDDF61', 3, 'invalid', 'invalid', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID afd85873-b2fe-4911-94a9-2793f9c8aebc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('afd85873-b2fe-4911-94a9-2793f9c8aebc', '36AF1D71-A217-43B6-893E-856843CDDF61', 4, 'not_found', 'not_found', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ef52fd5d-7ab2-4354-a6be-20718d669c4e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef52fd5d-7ab2-4354-a6be-20718d669c4e', '36AF1D71-A217-43B6-893E-856843CDDF61', 5, 'provisioning_failed', 'provisioning_failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 07068b01-3c42-4aaa-a996-c9fd692e3c5b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07068b01-3c42-4aaa-a996-c9fd692e3c5b', '36AF1D71-A217-43B6-893E-856843CDDF61', 6, 'revoked', 'revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e47cf98c-597b-403c-a416-9cb6ca527576 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e47cf98c-597b-403c-a416-9cb6ca527576', '36AF1D71-A217-43B6-893E-856843CDDF61', 7, 'server_error', 'server_error', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c3fbf5d2-c460-49bb-b00e-cc749c04fe35 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c3fbf5d2-c460-49bb-b00e-cc749c04fe35', '36AF1D71-A217-43B6-893E-856843CDDF61', 8, 'success', 'success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 36AF1D71-A217-43B6-893E-856843CDDF61 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='36AF1D71-A217-43B6-893E-856843CDDF61';


/* Create Entity Relationship: MJ: Roles -> MJ: Magic Link Invite Roles (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f4143130-6b3e-4f34-ad72-460b0bc8c987'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f4143130-6b3e-4f34-ad72-460b0bc8c987', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'E9D66E45-4771-4D80-97D4-42007B9951FB', 'RoleID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Roles -> MJ: Magic Link Invites (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '99334399-e092-4dfc-a120-e92325490833'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('99334399-e092-4dfc-a120-e92325490833', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'RoleID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Magic Link Redemptions (One To Many via ProvisionedUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '68795748-5b0f-452e-b321-11ef3e9a458f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('68795748-5b0f-452e-b321-11ef3e9a458f', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9D479BCE-5C29-4957-90E6-F350D87B38CF', 'ProvisionedUserID', 'One To Many', 1, 1, 99, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Magic Link Invites (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '849d0edb-dd0a-4e77-85cb-40902f373cdc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('849d0edb-dd0a-4e77-85cb-40902f373cdc', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'CreatedByUserID', 'One To Many', 1, 1, 100, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Applications -> MJ: Magic Link Invite Applications (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '22d081f3-0060-4ce3-a6a7-7ec52ade0384'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('22d081f3-0060-4ce3-a6a7-7ec52ade0384', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208', 'ApplicationID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Applications -> MJ: Magic Link Invites (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a3935405-71b0-4560-9515-87375578e885'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a3935405-71b0-4560-9515-87375578e885', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ApplicationID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Resource Types -> MJ: Magic Link Invites (One To Many via ResourceTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8c0772ef-7a0d-4ad8-a16d-778c65c3b0c0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8c0772ef-7a0d-4ad8-a16d-778c65c3b0c0', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ResourceTypeID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Magic Link Invite Allowed Domains (One To Many via InviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7c1d53e1-e613-4e8e-9407-2e3e4bfdb129'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7c1d53e1-e613-4e8e-9407-2e3e4bfdb129', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', 'InviteID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Magic Link Invite Allowed Paths (One To Many via InviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '70c284b7-99f5-4af5-a3df-6ff05d4be300'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('70c284b7-99f5-4af5-a3df-6ff05d4be300', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', 'InviteID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Magic Link Invite Applications (One To Many via InviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '06f7c234-44a5-444b-845a-038e6cc825ed'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('06f7c234-44a5-444b-845a-038e6cc825ed', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208', 'InviteID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Magic Link Invite Roles (One To Many via InviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1a36d488-dc4e-4a5a-b77e-600b45cfcaba'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1a36d488-dc4e-4a5a-b77e-600b45cfcaba', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'E9D66E45-4771-4D80-97D4-42007B9951FB', 'InviteID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Magic Link Redemptions (One To Many via InviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e712d497-38c1-47ed-af0a-5e55a475fded'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e712d497-38c1-47ed-af0a-5e55a475fded', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '9D479BCE-5C29-4957-90E6-F350D87B38CF', 'InviteID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for MagicLinkInviteAllowedDomain */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InviteID in table MagicLinkInviteAllowedDomain
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteAllowedDomain_InviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteAllowedDomain_InviteID ON [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] ([InviteID]);

/* Base View SQL for MJ: Magic Link Invite Allowed Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: vwMagicLinkInviteAllowedDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Allowed Domains
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInviteAllowedDomain
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invite Allowed Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: Permissions for vwMagicLinkInviteAllowedDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invite Allowed Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spCreateMagicLinkInviteAllowedDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedDomain]
    @ID uniqueidentifier = NULL,
    @InviteID uniqueidentifier,
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
            (
                [ID],
                [InviteID],
                [Domain]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InviteID,
                @Domain
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
            (
                [InviteID],
                [Domain]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InviteID,
                @Domain
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invite Allowed Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invite Allowed Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spUpdateMagicLinkInviteAllowedDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedDomain]
    @ID uniqueidentifier,
    @InviteID uniqueidentifier = NULL,
    @Domain nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
    SET
        [InviteID] = ISNULL(@InviteID, [InviteID]),
        [Domain] = ISNULL(@Domain, [Domain])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedDomains]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteAllowedDomain table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInviteAllowedDomain]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInviteAllowedDomain];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInviteAllowedDomain
ON [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invite Allowed Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invite Allowed Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spDeleteMagicLinkInviteAllowedDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedDomain]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedDomain]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invite Allowed Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedDomain] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MagicLinkInviteAllowedPath */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InviteID in table MagicLinkInviteAllowedPath
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteAllowedPath_InviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteAllowedPath_InviteID ON [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] ([InviteID]);

/* Index for Foreign Keys for MagicLinkInviteApplication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InviteID in table MagicLinkInviteApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteApplication_InviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteApplication_InviteID ON [${flyway:defaultSchema}].[MagicLinkInviteApplication] ([InviteID]);

-- Index for foreign key ApplicationID in table MagicLinkInviteApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteApplication_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteApplication_ApplicationID ON [${flyway:defaultSchema}].[MagicLinkInviteApplication] ([ApplicationID]);

/* SQL text to update entity field related entity name field map for entity field ID 6CF79958-D217-4A90-9567-45261F92B131 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6CF79958-D217-4A90-9567-45261F92B131', @RelatedEntityNameFieldMap='Application';

/* Index for Foreign Keys for MagicLinkInviteRole */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InviteID in table MagicLinkInviteRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteRole_InviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteRole_InviteID ON [${flyway:defaultSchema}].[MagicLinkInviteRole] ([InviteID]);

-- Index for foreign key RoleID in table MagicLinkInviteRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInviteRole_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInviteRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInviteRole_RoleID ON [${flyway:defaultSchema}].[MagicLinkInviteRole] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 8D8979C9-F6E4-4562-A6B2-C334B6A21202 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8D8979C9-F6E4-4562-A6B2-C334B6A21202', @RelatedEntityNameFieldMap='Role';

/* Index for Foreign Keys for MagicLinkInvite */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_ApplicationID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([ApplicationID]);

-- Index for foreign key RoleID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_RoleID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([RoleID]);

-- Index for foreign key CreatedByUserID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_CreatedByUserID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([CreatedByUserID]);

-- Index for foreign key ResourceTypeID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_ResourceTypeID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([ResourceTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID F7D9B6F1-1824-48A4-8F1D-7B7BD6EB68CC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F7D9B6F1-1824-48A4-8F1D-7B7BD6EB68CC', @RelatedEntityNameFieldMap='Application';

/* Index for Foreign Keys for MagicLinkRedemption */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InviteID in table MagicLinkRedemption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkRedemption_InviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkRedemption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkRedemption_InviteID ON [${flyway:defaultSchema}].[MagicLinkRedemption] ([InviteID]);

-- Index for foreign key ProvisionedUserID in table MagicLinkRedemption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkRedemption_ProvisionedUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkRedemption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkRedemption_ProvisionedUserID ON [${flyway:defaultSchema}].[MagicLinkRedemption] ([ProvisionedUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 03B4104E-29F2-49AC-8740-CC54138C0D7C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='03B4104E-29F2-49AC-8740-CC54138C0D7C', @RelatedEntityNameFieldMap='ProvisionedUser';

/* Base View SQL for MJ: Magic Link Invite Allowed Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: vwMagicLinkInviteAllowedPaths
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Allowed Paths
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInviteAllowedPath
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invite Allowed Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: Permissions for vwMagicLinkInviteAllowedPaths
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invite Allowed Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spCreateMagicLinkInviteAllowedPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedPath]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedPath];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedPath]
    @ID uniqueidentifier = NULL,
    @InviteID uniqueidentifier,
    @Path nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
            (
                [ID],
                [InviteID],
                [Path]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InviteID,
                @Path
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
            (
                [InviteID],
                [Path]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InviteID,
                @Path
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invite Allowed Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invite Allowed Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spUpdateMagicLinkInviteAllowedPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedPath]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedPath];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedPath]
    @ID uniqueidentifier,
    @InviteID uniqueidentifier = NULL,
    @Path nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
    SET
        [InviteID] = ISNULL(@InviteID, [InviteID]),
        [Path] = ISNULL(@Path, [Path])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInviteAllowedPaths]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteAllowedPath table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInviteAllowedPath]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInviteAllowedPath];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInviteAllowedPath
ON [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invite Allowed Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invite Allowed Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spDeleteMagicLinkInviteAllowedPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedPath]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedPath];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedPath]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInviteAllowedPath]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invite Allowed Paths */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteAllowedPath] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Magic Link Invite Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: vwMagicLinkInviteApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInviteApplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInviteApplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteApplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteApplications]
AS
SELECT
    m.*,
    MJApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[MagicLinkInviteApplication] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [m].[ApplicationID] = MJApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invite Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: Permissions for vwMagicLinkInviteApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invite Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: spCreateMagicLinkInviteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInviteApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInviteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteApplication]
    @ID uniqueidentifier = NULL,
    @InviteID uniqueidentifier,
    @ApplicationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteApplication]
            (
                [ID],
                [InviteID],
                [ApplicationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InviteID,
                @ApplicationID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteApplication]
            (
                [InviteID],
                [ApplicationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InviteID,
                @ApplicationID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invite Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invite Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: spUpdateMagicLinkInviteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInviteApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInviteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteApplication]
    @ID uniqueidentifier,
    @InviteID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteApplication]
    SET
        [InviteID] = ISNULL(@InviteID, [InviteID]),
        [ApplicationID] = ISNULL(@ApplicationID, [ApplicationID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInviteApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteApplication table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInviteApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInviteApplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInviteApplication
ON [${flyway:defaultSchema}].[MagicLinkInviteApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteApplication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInviteApplication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invite Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invite Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Applications
-- Item: spDeleteMagicLinkInviteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInviteApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInviteApplication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invite Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Magic Link Invite Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: vwMagicLinkInviteRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Roles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInviteRole
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInviteRoles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteRoles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInviteRoles]
AS
SELECT
    m.*,
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[MagicLinkInviteRole] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [m].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invite Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: Permissions for vwMagicLinkInviteRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInviteRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invite Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: spCreateMagicLinkInviteRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInviteRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInviteRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInviteRole]
    @ID uniqueidentifier = NULL,
    @InviteID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteRole]
            (
                [ID],
                [InviteID],
                [RoleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InviteID,
                @RoleID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInviteRole]
            (
                [InviteID],
                [RoleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InviteID,
                @RoleID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteRoles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invite Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invite Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: spUpdateMagicLinkInviteRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInviteRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInviteRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInviteRole]
    @ID uniqueidentifier,
    @InviteID uniqueidentifier = NULL,
    @RoleID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteRole]
    SET
        [InviteID] = ISNULL(@InviteID, [InviteID]),
        [RoleID] = ISNULL(@RoleID, [RoleID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInviteRoles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInviteRoles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteRole table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInviteRole]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInviteRole];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInviteRole
ON [${flyway:defaultSchema}].[MagicLinkInviteRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInviteRole]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInviteRole] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invite Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invite Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invite Roles
-- Item: spDeleteMagicLinkInviteRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInviteRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInviteRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInviteRole]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInviteRole]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invite Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInviteRole] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: vwMagicLinkRedemptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Redemptions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkRedemption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkRedemptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkRedemptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkRedemptions]
AS
SELECT
    m.*,
    MJUser_ProvisionedUserID.[Name] AS [ProvisionedUser]
FROM
    [${flyway:defaultSchema}].[MagicLinkRedemption] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ProvisionedUserID
  ON
    [m].[ProvisionedUserID] = MJUser_ProvisionedUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkRedemptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: Permissions for vwMagicLinkRedemptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkRedemptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: spCreateMagicLinkRedemption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkRedemption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkRedemption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkRedemption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkRedemption]
    @ID uniqueidentifier = NULL,
    @InviteID_Clear bit = 0,
    @InviteID uniqueidentifier = NULL,
    @AttemptedAt datetimeoffset = NULL,
    @Outcome nvarchar(30),
    @IPAddress_Clear bit = 0,
    @IPAddress nvarchar(64) = NULL,
    @UserAgent_Clear bit = 0,
    @UserAgent nvarchar(512) = NULL,
    @Origin_Clear bit = 0,
    @Origin nvarchar(512) = NULL,
    @ProvisionedUserID_Clear bit = 0,
    @ProvisionedUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkRedemption]
            (
                [ID],
                [InviteID],
                [AttemptedAt],
                [Outcome],
                [IPAddress],
                [UserAgent],
                [Origin],
                [ProvisionedUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @InviteID_Clear = 1 THEN NULL ELSE ISNULL(@InviteID, NULL) END,
                ISNULL(@AttemptedAt, 'sysutcdatetime()'),
                @Outcome,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @Origin_Clear = 1 THEN NULL ELSE ISNULL(@Origin, NULL) END,
                CASE WHEN @ProvisionedUserID_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkRedemption]
            (
                [InviteID],
                [AttemptedAt],
                [Outcome],
                [IPAddress],
                [UserAgent],
                [Origin],
                [ProvisionedUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @InviteID_Clear = 1 THEN NULL ELSE ISNULL(@InviteID, NULL) END,
                ISNULL(@AttemptedAt, 'sysutcdatetime()'),
                @Outcome,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @Origin_Clear = 1 THEN NULL ELSE ISNULL(@Origin, NULL) END,
                CASE WHEN @ProvisionedUserID_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkRedemptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Redemptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: spUpdateMagicLinkRedemption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkRedemption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkRedemption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkRedemption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkRedemption]
    @ID uniqueidentifier,
    @InviteID_Clear bit = 0,
    @InviteID uniqueidentifier = NULL,
    @AttemptedAt datetimeoffset = NULL,
    @Outcome nvarchar(30) = NULL,
    @IPAddress_Clear bit = 0,
    @IPAddress nvarchar(64) = NULL,
    @UserAgent_Clear bit = 0,
    @UserAgent nvarchar(512) = NULL,
    @Origin_Clear bit = 0,
    @Origin nvarchar(512) = NULL,
    @ProvisionedUserID_Clear bit = 0,
    @ProvisionedUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkRedemption]
    SET
        [InviteID] = CASE WHEN @InviteID_Clear = 1 THEN NULL ELSE ISNULL(@InviteID, [InviteID]) END,
        [AttemptedAt] = ISNULL(@AttemptedAt, [AttemptedAt]),
        [Outcome] = ISNULL(@Outcome, [Outcome]),
        [IPAddress] = CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, [IPAddress]) END,
        [UserAgent] = CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, [UserAgent]) END,
        [Origin] = CASE WHEN @Origin_Clear = 1 THEN NULL ELSE ISNULL(@Origin, [Origin]) END,
        [ProvisionedUserID] = CASE WHEN @ProvisionedUserID_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedUserID, [ProvisionedUserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkRedemptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkRedemptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkRedemption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkRedemption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkRedemption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkRedemption
ON [${flyway:defaultSchema}].[MagicLinkRedemption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkRedemption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkRedemption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Redemptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: spDeleteMagicLinkRedemption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkRedemption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkRedemption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkRedemption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkRedemption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkRedemption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Redemptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 27A980DB-4F8F-4EB2-A377-1AF794780ECF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='27A980DB-4F8F-4EB2-A377-1AF794780ECF', @RelatedEntityNameFieldMap='Role';

/* SQL text to update entity field related entity name field map for entity field ID 1C4AB92D-3732-4980-A2FE-6A5BA7A861CA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1C4AB92D-3732-4980-A2FE-6A5BA7A861CA', @RelatedEntityNameFieldMap='CreatedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 939D852B-22DC-4F28-B136-73ABBE16EB93 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='939D852B-22DC-4F28-B136-73ABBE16EB93', @RelatedEntityNameFieldMap='ResourceType';

/* Base View SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: vwMagicLinkInvites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invites
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInvite
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInvites]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInvites];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInvites]
AS
SELECT
    m.*,
    MJApplication_ApplicationID.[Name] AS [Application],
    MJRole_RoleID.[Name] AS [Role],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJResourceType_ResourceTypeID.[Name] AS [ResourceType]
FROM
    [${flyway:defaultSchema}].[MagicLinkInvite] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [m].[ApplicationID] = MJApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [m].[RoleID] = MJRole_RoleID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [m].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS MJResourceType_ResourceTypeID
  ON
    [m].[ResourceTypeID] = MJResourceType_ResourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInvites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: Permissions for vwMagicLinkInvites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInvites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spCreateMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInvite]
    @ID uniqueidentifier = NULL,
    @TokenHash nvarchar(128),
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @ApplicationID uniqueidentifier,
    @RoleID uniqueidentifier,
    @ExpiresAt datetimeoffset,
    @ConsumedAt_Clear bit = 0,
    @ConsumedAt datetimeoffset = NULL,
    @MaxUses int = NULL,
    @UseCount int = NULL,
    @CreatedByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @IdentityMode nvarchar(20) = NULL,
    @Kind nvarchar(30) = NULL,
    @ResourceTypeID_Clear bit = 0,
    @ResourceTypeID uniqueidentifier = NULL,
    @ResourceID_Clear bit = 0,
    @ResourceID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInvite]
            (
                [ID],
                [TokenHash],
                [Email],
                [ApplicationID],
                [RoleID],
                [ExpiresAt],
                [ConsumedAt],
                [MaxUses],
                [UseCount],
                [CreatedByUserID],
                [Status],
                [IdentityMode],
                [Kind],
                [ResourceTypeID],
                [ResourceID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TokenHash,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                @ApplicationID,
                @RoleID,
                @ExpiresAt,
                CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, NULL) END,
                ISNULL(@MaxUses, 1),
                ISNULL(@UseCount, 0),
                @CreatedByUserID,
                ISNULL(@Status, 'Active'),
                ISNULL(@IdentityMode, 'email'),
                ISNULL(@Kind, 'app-session'),
                CASE WHEN @ResourceTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceTypeID, NULL) END,
                CASE WHEN @ResourceID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInvite]
            (
                [TokenHash],
                [Email],
                [ApplicationID],
                [RoleID],
                [ExpiresAt],
                [ConsumedAt],
                [MaxUses],
                [UseCount],
                [CreatedByUserID],
                [Status],
                [IdentityMode],
                [Kind],
                [ResourceTypeID],
                [ResourceID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TokenHash,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                @ApplicationID,
                @RoleID,
                @ExpiresAt,
                CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, NULL) END,
                ISNULL(@MaxUses, 1),
                ISNULL(@UseCount, 0),
                @CreatedByUserID,
                ISNULL(@Status, 'Active'),
                ISNULL(@IdentityMode, 'email'),
                ISNULL(@Kind, 'app-session'),
                CASE WHEN @ResourceTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceTypeID, NULL) END,
                CASE WHEN @ResourceID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInvites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spUpdateMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInvite]
    @ID uniqueidentifier,
    @TokenHash nvarchar(128) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @ApplicationID uniqueidentifier = NULL,
    @RoleID uniqueidentifier = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @ConsumedAt_Clear bit = 0,
    @ConsumedAt datetimeoffset = NULL,
    @MaxUses int = NULL,
    @UseCount int = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @IdentityMode nvarchar(20) = NULL,
    @Kind nvarchar(30) = NULL,
    @ResourceTypeID_Clear bit = 0,
    @ResourceTypeID uniqueidentifier = NULL,
    @ResourceID_Clear bit = 0,
    @ResourceID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInvite]
    SET
        [TokenHash] = ISNULL(@TokenHash, [TokenHash]),
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [ApplicationID] = ISNULL(@ApplicationID, [ApplicationID]),
        [RoleID] = ISNULL(@RoleID, [RoleID]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [ConsumedAt] = CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, [ConsumedAt]) END,
        [MaxUses] = ISNULL(@MaxUses, [MaxUses]),
        [UseCount] = ISNULL(@UseCount, [UseCount]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [IdentityMode] = ISNULL(@IdentityMode, [IdentityMode]),
        [Kind] = ISNULL(@Kind, [Kind]),
        [ResourceTypeID] = CASE WHEN @ResourceTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceTypeID, [ResourceTypeID]) END,
        [ResourceID] = CASE WHEN @ResourceID_Clear = 1 THEN NULL ELSE ISNULL(@ResourceID, [ResourceID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInvites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInvites]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInvite table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInvite]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInvite];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInvite
ON [${flyway:defaultSchema}].[MagicLinkInvite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInvite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInvite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spDeleteMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInvite]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInvite]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity
    DECLARE @MJApplicationEntities_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationEntities_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationEntity]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationEntities_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationEntity] @ID = @MJApplicationEntities_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    
    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole
    DECLARE @MJApplicationRoles_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationRoles_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationRole]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationRoles_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationRole] @ID = @MJApplicationRoles_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    
    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting
    DECLARE @MJApplicationSettings_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationSettings_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationSetting]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationSettings_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationSetting] @ID = @MJApplicationSettings_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_ApplicationIDID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_UserID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_Name nvarchar(255)
    DECLARE @MJConversations_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_Type nvarchar(50)
    DECLARE @MJConversations_ApplicationID_IsArchived bit
    DECLARE @MJConversations_ApplicationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_Status nvarchar(20)
    DECLARE @MJConversations_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_IsPinned bit
    DECLARE @MJConversations_ApplicationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_AdditionalData nvarchar(MAX)
    DECLARE cascade_update_MJConversations_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJConversations_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_ApplicationIDID, @UserID = @MJConversations_ApplicationID_UserID, @ExternalID = @MJConversations_ApplicationID_ExternalID, @Name = @MJConversations_ApplicationID_Name, @Description = @MJConversations_ApplicationID_Description, @Type = @MJConversations_ApplicationID_Type, @IsArchived = @MJConversations_ApplicationID_IsArchived, @LinkedEntityID = @MJConversations_ApplicationID_LinkedEntityID, @LinkedRecordID = @MJConversations_ApplicationID_LinkedRecordID, @DataContextID = @MJConversations_ApplicationID_DataContextID, @Status = @MJConversations_ApplicationID_Status, @EnvironmentID = @MJConversations_ApplicationID_EnvironmentID, @ProjectID = @MJConversations_ApplicationID_ProjectID, @IsPinned = @MJConversations_ApplicationID_IsPinned, @TestRunID = @MJConversations_ApplicationID_TestRunID, @ApplicationScope = @MJConversations_ApplicationID_ApplicationScope, @ApplicationID_Clear = 1, @ApplicationID = @MJConversations_ApplicationID_ApplicationID, @DefaultAgentID = @MJConversations_ApplicationID_DefaultAgentID, @AdditionalData = @MJConversations_ApplicationID_AdditionalData

        FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData
    END

    CLOSE cascade_update_MJConversations_ApplicationID_cursor
    DEALLOCATE cascade_update_MJConversations_ApplicationID_cursor
    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference
    DECLARE @MJDashboardUserPreferences_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[DashboardUserPreference]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] @ID = @MJDashboardUserPreferences_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    
    -- Cascade update on Dashboard using cursor to call spUpdateDashboard
    DECLARE @MJDashboards_ApplicationIDID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_Name nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_UserID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_CategoryID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_UIConfigDetails nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Type nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_Thumbnail nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Scope nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_DriverClass nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Code nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJDashboards_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [UserID], [CategoryID], [UIConfigDetails], [Type], [Thumbnail], [Scope], [ApplicationID], [DriverClass], [Code], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Dashboard]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJDashboards_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDashboards_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDashboard] @ID = @MJDashboards_ApplicationIDID, @Name = @MJDashboards_ApplicationID_Name, @Description = @MJDashboards_ApplicationID_Description, @UserID = @MJDashboards_ApplicationID_UserID, @CategoryID = @MJDashboards_ApplicationID_CategoryID, @UIConfigDetails = @MJDashboards_ApplicationID_UIConfigDetails, @Type = @MJDashboards_ApplicationID_Type, @Thumbnail = @MJDashboards_ApplicationID_Thumbnail, @Scope = @MJDashboards_ApplicationID_Scope, @ApplicationID_Clear = 1, @ApplicationID = @MJDashboards_ApplicationID_ApplicationID, @DriverClass = @MJDashboards_ApplicationID_DriverClass, @Code = @MJDashboards_ApplicationID_Code, @EnvironmentID = @MJDashboards_ApplicationID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID
    END

    CLOSE cascade_update_MJDashboards_ApplicationID_cursor
    DEALLOCATE cascade_update_MJDashboards_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInviteApplication using cursor to call spDeleteMagicLinkInviteApplication
    DECLARE @MJMagicLinkInviteApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInviteApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] @ID = @MJMagicLinkInviteApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInvite using cursor to call spDeleteMagicLinkInvite
    DECLARE @MJMagicLinkInvites_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInvite]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] @ID = @MJMagicLinkInvites_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    
    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication
    DECLARE @MJUserApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJUserApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[UserApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJUserApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteUserApplication] @ID = @MJUserApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJUserApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJUserApplications_ApplicationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc12e5fd-ce16-4d53-ba41-d5df9955d9fb' OR (EntityID = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND Name = 'Application')) BEGIN
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
            'bc12e5fd-ce16-4d53-ba41-d5df9955d9fb',
            'C6988FA5-1EE9-40EE-9BA6-3096CB832208', -- Entity: MJ: Magic Link Invite Applications
            100011,
            'Application',
            'Application',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5deef50-47f8-4239-a277-5817029ad612' OR (EntityID = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND Name = 'Role')) BEGIN
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
            'e5deef50-47f8-4239-a277-5817029ad612',
            'E9D66E45-4771-4D80-97D4-42007B9951FB', -- Entity: MJ: Magic Link Invite Roles
            100011,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58b184c1-3163-4316-b170-c1d509e59f71' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'Application')) BEGIN
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
            '58b184c1-3163-4316-b170-c1d509e59f71',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100035,
            'Application',
            'Application',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac40b9e9-5ab1-4160-b01d-3fddef817d76' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'Role')) BEGIN
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
            'ac40b9e9-5ab1-4160-b01d-3fddef817d76',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100036,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b86226b7-fb05-498d-8e30-bf2bc75c1306' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'CreatedByUser')) BEGIN
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
            'b86226b7-fb05-498d-8e30-bf2bc75c1306',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100037,
            'CreatedByUser',
            'Created By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a113d6d1-8361-494f-814b-b7c99ad30e2e' OR (EntityID = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND Name = 'ResourceType')) BEGIN
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
            'a113d6d1-8361-494f-814b-b7c99ad30e2e',
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', -- Entity: MJ: Magic Link Invites
            100038,
            'ResourceType',
            'Resource Type',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '306261a4-cd80-4158-901b-7364d74e94a3' OR (EntityID = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND Name = 'ProvisionedUser')) BEGIN
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
            '306261a4-cd80-4158-901b-7364d74e94a3',
            '9D479BCE-5C29-4957-90E6-F350D87B38CF', -- Entity: MJ: Magic Link Redemptions
            100021,
            'ProvisionedUser',
            'Provisioned User',
            NULL,
            'nvarchar',
            200,
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

