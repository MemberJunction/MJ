-- =====================================================================================
-- Diagnostic Sender Registrations (MJ 6.2)
--
-- Introduces one core table:
--   DiagnosticSenderRegistration: an installation that is allowed to send diagnostic
--   bundles to this collector, with its enrollment state, signing public key,
--   one-time registration code hash, and daily bundle quota.
--
-- The CodeGen section at the bottom also carries the entity relationships, base views
-- and procedures that CodeGen regenerates for the three Diagnostic* tables created by
-- V202611020900__v6.2.x__Diagnostic_Bundles.sql.
--
-- Conventions (migrations/CLAUDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. DiagnosticSenderRegistration
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] (
    [ID]                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_ID] DEFAULT (newsequentialid()),
    [InstallID]                 NVARCHAR(100)    NOT NULL,
    [Name]                      NVARCHAR(255)    NOT NULL,
    [Status]                    NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_Status] DEFAULT (N'Pending'),
    [KeyAlgorithm]              NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_KeyAlgorithm] DEFAULT (N'Ed25519'),
    [KeyID]                     NVARCHAR(100)    NULL,
    [PublicKeyBase64]           NVARCHAR(255)    NULL,
    [RegistrationCodeHash]      NVARCHAR(128)    NULL,
    [RegistrationCodeExpiresAt] DATETIMEOFFSET   NULL,
    [EnrolledAt]                DATETIMEOFFSET   NULL,
    [RevokedAt]                 DATETIMEOFFSET   NULL,
    [LastSeenAt]                DATETIMEOFFSET   NULL,
    [MaxBundlesPerDay]          INT              NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_MaxBundlesPerDay] DEFAULT (20),
    [Comments]                  NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_DiagnosticSenderRegistration] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DiagnosticSenderRegistration_InstallID] UNIQUE ([InstallID]),
    CONSTRAINT [CK_DiagnosticSenderRegistration_Status] CHECK ([Status] IN (N'Pending', N'Active', N'Revoked')),
    CONSTRAINT [CK_DiagnosticSenderRegistration_KeyAlgorithm] CHECK ([KeyAlgorithm] IN (N'Ed25519'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique identifier of the sender registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Installation ID of the sending MemberJunction instance. Unique per registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'InstallID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name of the customer or installation that sends the bundles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Signature algorithm of the sender public key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'KeyAlgorithm';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'KeyID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'PublicKeyBase64';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 hex digest of the one-time registration code. The plain code is never stored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RegistrationCodeHash';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time after which the one-time registration code can no longer be used to enroll.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RegistrationCodeExpiresAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time the sender enrolled its public key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'EnrolledAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time the registration was revoked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RevokedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time of the last authenticated request from the sender.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'LastSeenAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Maximum number of bundles the collector accepts from this sender per day.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'MaxBundlesPerDay';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Free-form administrator notes about the registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Comments';

GO




























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
--
-- Part 1: CodeGen output for the three tables created by
--   V202611020900__v6.2.x__Diagnostic_Bundles.sql (DiagnosticSession,
--   DiagnosticSessionChunk, DiagnosticBundle): EntityRelationship inserts and the
--   regenerated base views, spCreate / spUpdate / spDelete procedures, update
--   triggers and permission grants.
-- Part 2: CodeGen output for DiagnosticSenderRegistration: Entity / EntityField /
--   EntityFieldValue / EntityPermission / ApplicationEntity inserts, the
--   __mj_CreatedAt / __mj_UpdatedAt columns, the base view, spCreate / spUpdate /
--   spDelete procedures, permission grants, and field and entity settings.
--
-- If the hand-written DDL above changes, re-run CodeGen and replace this section.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1: Diagnostic Sessions, Diagnostic Session Chunks, Diagnostic Bundles
-- -----------------------------------------------------------------------------

/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Session Chunks (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0c4b523f-3783-4e03-a779-b1873cdfa9b9' OR ([EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-102000000001' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c4b523f-3783-4e03-a779-b1873cdfa9b9', '8F71C490-5B21-4E3A-9C14-101000000001', '8F71C490-5B21-4E3A-9C14-102000000001', 'DiagnosticSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Bundles (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a8024a66-7187-4938-a3a4-777b420e9769' OR ([EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-103000000001' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a8024a66-7187-4938-a3a4-777b420e9769', '8F71C490-5B21-4E3A-9C14-101000000001', '8F71C490-5B21-4E3A-9C14-103000000001', 'DiagnosticSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Sessions (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1a3d4e34-e2cf-4004-8fb8-bd172754aa27' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-101000000001' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1a3d4e34-e2cf-4004-8fb8-bd172754aa27', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-101000000001', 'CompanyID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Bundles (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3a362200-a153-4568-b227-1501e377c7b6' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-103000000001' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3a362200-a153-4568-b227-1501e377c7b6', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-103000000001', 'CompanyID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Sessions (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '42a18a0c-0ddb-4071-b4df-99d0e9b02ced' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-101000000001' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('42a18a0c-0ddb-4071-b4df-99d0e9b02ced', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-101000000001', 'CreatedByUserID', 'One To Many', 1, 1, 126, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd6753e2a-82fa-48df-ac1d-f1f44da55f7b' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-103000000001' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d6753e2a-82fa-48df-ac1d-f1f44da55f7b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-103000000001', 'CreatedByUserID', 'One To Many', 1, 1, 127, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '01493c96-520c-4ee0-b1a1-79758f4cedc3' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-103000000001' AND [RelatedEntityJoinField] = 'ApprovedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('01493c96-520c-4ee0-b1a1-79758f4cedc3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-103000000001', 'ApprovedByUserID', 'One To Many', 1, 1, 128, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: Diagnostic Bundles (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '04a235db-59f3-48c8-b57c-95977d04f1de' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8F71C490-5B21-4E3A-9C14-103000000001' AND [RelatedEntityJoinField] = 'FileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('04a235db-59f3-48c8-b57c-95977d04f1de', '29248F34-2837-EF11-86D4-6045BDEE16E6', '8F71C490-5B21-4E3A-9C14-103000000001', 'FileID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;

/* spCreate SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: spCreateDiagnosticSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON_Clear bit = 0,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON_Clear bit = 0,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset,
    @StoppedAt_Clear bit = 0,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSession]
            (
                [ID],
                [Name],
                [Reason],
                [Status],
                [ScopeType],
                [ScopeJSON],
                [Level],
                [CategoriesJSON],
                [ScrubLiterals],
                [StartedAt],
                [EndsAt],
                [StoppedAt],
                [MaxBytes],
                [CreatedByUserID],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@ScopeType, 'Users'),
                CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, NULL) END,
                ISNULL(@Level, 'Standard'),
                CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, NULL) END,
                ISNULL(@ScrubLiterals, 0),
                ISNULL(@StartedAt, getutcdate()),
                @EndsAt,
                CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, NULL) END,
                ISNULL(@MaxBytes, 52428800),
                @CreatedByUserID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSession]
            (
                [Name],
                [Reason],
                [Status],
                [ScopeType],
                [ScopeJSON],
                [Level],
                [CategoriesJSON],
                [ScrubLiterals],
                [StartedAt],
                [EndsAt],
                [StoppedAt],
                [MaxBytes],
                [CreatedByUserID],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@ScopeType, 'Users'),
                CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, NULL) END,
                ISNULL(@Level, 'Standard'),
                CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, NULL) END,
                ISNULL(@ScrubLiterals, 0),
                ISNULL(@StartedAt, getutcdate()),
                @EndsAt,
                CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, NULL) END,
                ISNULL(@MaxBytes, 52428800),
                @CreatedByUserID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Sessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: spUpdateDiagnosticSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON_Clear bit = 0,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON_Clear bit = 0,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset = NULL,
    @StoppedAt_Clear bit = 0,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSession]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ScopeType] = ISNULL(@ScopeType, [ScopeType]),
        [ScopeJSON] = CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, [ScopeJSON]) END,
        [Level] = ISNULL(@Level, [Level]),
        [CategoriesJSON] = CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, [CategoriesJSON]) END,
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndsAt] = ISNULL(@EndsAt, [EndsAt]),
        [StoppedAt] = CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, [StoppedAt]) END,
        [MaxBytes] = ISNULL(@MaxBytes, [MaxBytes]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSession
ON [${flyway:defaultSchema}].[DiagnosticSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Sessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: vwDiagnosticBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Bundles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticBundle
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticBundles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles]
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession],
    MJFile_FileID.[Name] AS [File],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser],
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[DiagnosticBundle] AS d
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [d].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [d].[FileID] = MJFile_FileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [d].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [d].[CompanyID] = MJCompany_CompanyID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: Permissions for vwDiagnosticBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spCreateDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID_Clear bit = 0,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart_Clear bit = 0,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd_Clear bit = 0,
    @WindowEnd datetimeoffset = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256_Clear bit = 0,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON_Clear bit = 0,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON_Clear bit = 0,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON_Clear bit = 0,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @Destination_Clear bit = 0,
    @Destination nvarchar(30) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID_Clear bit = 0,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion_Clear bit = 0,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo_Clear bit = 0,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticBundle]
            (
                [ID],
                [Name],
                [Description],
                [Direction],
                [DiagnosticSessionID],
                [Status],
                [ScrubLiterals],
                [WindowStart],
                [WindowEnd],
                [FileID],
                [Data],
                [SizeBytes],
                [SHA256],
                [ManifestJSON],
                [ScrubReportJSON],
                [FindingsJSON],
                [FailureReason],
                [CreatedByUserID],
                [ApprovedByUserID],
                [ApprovedAt],
                [Destination],
                [SentAt],
                [ExternalReferenceID],
                [SenderInstallID],
                [SenderMJVersion],
                [ContactInfo],
                [ExpiresAt],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Direction, 'Local'),
                CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, NULL) END,
                ISNULL(@Status, 'Building'),
                ISNULL(@ScrubLiterals, 0),
                CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, NULL) END,
                CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                ISNULL(@SizeBytes, 0),
                CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, NULL) END,
                CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, NULL) END,
                CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, NULL) END,
                CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, NULL) END,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, NULL) END,
                CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, NULL) END,
                CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticBundle]
            (
                [Name],
                [Description],
                [Direction],
                [DiagnosticSessionID],
                [Status],
                [ScrubLiterals],
                [WindowStart],
                [WindowEnd],
                [FileID],
                [Data],
                [SizeBytes],
                [SHA256],
                [ManifestJSON],
                [ScrubReportJSON],
                [FindingsJSON],
                [FailureReason],
                [CreatedByUserID],
                [ApprovedByUserID],
                [ApprovedAt],
                [Destination],
                [SentAt],
                [ExternalReferenceID],
                [SenderInstallID],
                [SenderMJVersion],
                [ContactInfo],
                [ExpiresAt],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Direction, 'Local'),
                CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, NULL) END,
                ISNULL(@Status, 'Building'),
                ISNULL(@ScrubLiterals, 0),
                CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, NULL) END,
                CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                ISNULL(@SizeBytes, 0),
                CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, NULL) END,
                CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, NULL) END,
                CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, NULL) END,
                CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, NULL) END,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, NULL) END,
                CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, NULL) END,
                CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Bundles */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spUpdateDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID_Clear bit = 0,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart_Clear bit = 0,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd_Clear bit = 0,
    @WindowEnd datetimeoffset = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256_Clear bit = 0,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON_Clear bit = 0,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON_Clear bit = 0,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON_Clear bit = 0,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @Destination_Clear bit = 0,
    @Destination nvarchar(30) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID_Clear bit = 0,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion_Clear bit = 0,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo_Clear bit = 0,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticBundle]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Direction] = ISNULL(@Direction, [Direction]),
        [DiagnosticSessionID] = CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, [DiagnosticSessionID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [WindowStart] = CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, [WindowStart]) END,
        [WindowEnd] = CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, [WindowEnd]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [SizeBytes] = ISNULL(@SizeBytes, [SizeBytes]),
        [SHA256] = CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, [SHA256]) END,
        [ManifestJSON] = CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, [ManifestJSON]) END,
        [ScrubReportJSON] = CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, [ScrubReportJSON]) END,
        [FindingsJSON] = CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, [FindingsJSON]) END,
        [FailureReason] = CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, [FailureReason]) END,
        [CreatedByUserID] = CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, [CreatedByUserID]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [Destination] = CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, [Destination]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [ExternalReferenceID] = CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, [ExternalReferenceID]) END,
        [SenderInstallID] = CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, [SenderInstallID]) END,
        [SenderMJVersion] = CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, [SenderMJVersion]) END,
        [ContactInfo] = CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, [ContactInfo]) END,
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticBundles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticBundle table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticBundle]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticBundle];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticBundle
ON [${flyway:defaultSchema}].[DiagnosticBundle]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticBundle]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticBundle] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Bundles */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spDeleteDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticBundle]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Bundles */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: vwDiagnosticSessionChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Session Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticSessionChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSessionChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks]
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession]
FROM
    [${flyway:defaultSchema}].[DiagnosticSessionChunk] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [d].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: Permissions for vwDiagnosticSessionChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spCreateDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]
    @ID uniqueidentifier = NULL,
    @DiagnosticSessionID uniqueidentifier,
    @Source nvarchar(20),
    @HostInstanceLabel nvarchar(255),
    @Sequence int,
    @ContentKind nvarchar(30),
    @Data varbinary(MAX),
    @EntryCount int = NULL,
    @FirstEntryAt_Clear bit = 0,
    @FirstEntryAt datetimeoffset = NULL,
    @LastEntryAt_Clear bit = 0,
    @LastEntryAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSessionChunk]
            (
                [ID],
                [DiagnosticSessionID],
                [Source],
                [HostInstanceLabel],
                [Sequence],
                [ContentKind],
                [Data],
                [EntryCount],
                [FirstEntryAt],
                [LastEntryAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DiagnosticSessionID,
                @Source,
                @HostInstanceLabel,
                @Sequence,
                @ContentKind,
                @Data,
                ISNULL(@EntryCount, 0),
                CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, NULL) END,
                CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSessionChunk]
            (
                [DiagnosticSessionID],
                [Source],
                [HostInstanceLabel],
                [Sequence],
                [ContentKind],
                [Data],
                [EntryCount],
                [FirstEntryAt],
                [LastEntryAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DiagnosticSessionID,
                @Source,
                @HostInstanceLabel,
                @Sequence,
                @ContentKind,
                @Data,
                ISNULL(@EntryCount, 0),
                CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, NULL) END,
                CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Session Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spUpdateDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk]
    @ID uniqueidentifier,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Source nvarchar(20) = NULL,
    @HostInstanceLabel nvarchar(255) = NULL,
    @Sequence int = NULL,
    @ContentKind nvarchar(30) = NULL,
    @Data varbinary(MAX) = NULL,
    @EntryCount int = NULL,
    @FirstEntryAt_Clear bit = 0,
    @FirstEntryAt datetimeoffset = NULL,
    @LastEntryAt_Clear bit = 0,
    @LastEntryAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    SET
        [DiagnosticSessionID] = ISNULL(@DiagnosticSessionID, [DiagnosticSessionID]),
        [Source] = ISNULL(@Source, [Source]),
        [HostInstanceLabel] = ISNULL(@HostInstanceLabel, [HostInstanceLabel]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ContentKind] = ISNULL(@ContentKind, [ContentKind]),
        [Data] = ISNULL(@Data, [Data]),
        [EntryCount] = ISNULL(@EntryCount, [EntryCount]),
        [FirstEntryAt] = CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, [FirstEntryAt]) END,
        [LastEntryAt] = CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, [LastEntryAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSessionChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSessionChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSessionChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSessionChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSessionChunk
ON [${flyway:defaultSchema}].[DiagnosticSessionChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSessionChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Session Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spDeleteDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Session Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];



-- -----------------------------------------------------------------------------
-- Part 2: Diagnostic Sender Registrations
-- -----------------------------------------------------------------------------
/* SQL generated to create new entity MJ: Diagnostic Sender Registrations */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'f4d96070-6ecb-46aa-8c44-a20271589fbc',
         'MJ: Diagnostic Sender Registrations',
         'Diagnostic Sender Registrations',
         'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.',
         NULL,
         'DiagnosticSenderRegistration',
         'vwDiagnosticSenderRegistrations',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Diagnostic Sender Registrations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f4d96070-6ecb-46aa-8c44-a20271589fbc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d96070-6ecb-46aa-8c44-a20271589fbc' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
UPDATE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD CONSTRAINT [DF___mj_DiagnosticSenderRegistration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
UPDATE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD CONSTRAINT [DF___mj_DiagnosticSenderRegistration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91556ff4-3f7d-4def-af75-681b5c8b85f8' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'ID')) BEGIN
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
            '91556ff4-3f7d-4def-af75-681b5c8b85f8',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'ID',
            'ID',
            'Unique identifier of the sender registration.',
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66d55789-4482-42a0-aa99-9d66bd2a4e1f' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'InstallID')) BEGIN
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
            '66d55789-4482-42a0-aa99-9d66bd2a4e1f',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'InstallID',
            'Install ID',
            'Installation ID of the sending MemberJunction instance. Unique per registration.',
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
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '652d64d3-f33d-4dd3-b118-773c9c82b641' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'Name')) BEGIN
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
            '652d64d3-f33d-4dd3-b118-773c9c82b641',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'Name',
            'Name',
            'Display name of the customer or installation that sends the bundles.',
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1636fc8e-f86f-4da1-90ba-9680035f5137' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'Status')) BEGIN
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
            '1636fc8e-f86f-4da1-90ba-9680035f5137',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'Status',
            'Status',
            'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14e51904-266b-4968-93f2-40674d8e1c04' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'KeyAlgorithm')) BEGIN
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
            '14e51904-266b-4968-93f2-40674d8e1c04',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'KeyAlgorithm',
            'Key Algorithm',
            'Signature algorithm of the sender public key.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Ed25519',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e42120f-3d9a-4551-a604-49951f094498' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'KeyID')) BEGIN
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
            '3e42120f-3d9a-4551-a604-49951f094498',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'KeyID',
            'Key ID',
            'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd414c533-7580-452b-9119-384dfac15053' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'PublicKeyBase64')) BEGIN
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
            'd414c533-7580-452b-9119-384dfac15053',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'PublicKeyBase64',
            'Public Key Base 64',
            'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03bcc926-cc1d-4bf2-b562-74eb54361f02' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'RegistrationCodeHash')) BEGIN
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
            '03bcc926-cc1d-4bf2-b562-74eb54361f02',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'RegistrationCodeHash',
            'Registration Code Hash',
            'SHA-256 hex digest of the one-time registration code. The plain code is never stored.',
            'nvarchar',
            256,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4000e6f5-5026-49a6-8975-6faae1c01b3b' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'RegistrationCodeExpiresAt')) BEGIN
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
            '4000e6f5-5026-49a6-8975-6faae1c01b3b',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'RegistrationCodeExpiresAt',
            'Registration Code Expires At',
            'Time after which the one-time registration code can no longer be used to enroll.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8874af69-4ddb-4826-ae0f-c68792ee6cb7' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'EnrolledAt')) BEGIN
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
            '8874af69-4ddb-4826-ae0f-c68792ee6cb7',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'EnrolledAt',
            'Enrolled At',
            'Time the sender enrolled its public key.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '952e3488-1abe-47ad-a03f-30af045bcd4e' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'RevokedAt')) BEGIN
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
            '952e3488-1abe-47ad-a03f-30af045bcd4e',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'RevokedAt',
            'Revoked At',
            'Time the registration was revoked.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d85b66e-6efe-4e45-98c1-1ce4299f0008' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'LastSeenAt')) BEGIN
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
            '4d85b66e-6efe-4e45-98c1-1ce4299f0008',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'LastSeenAt',
            'Last Seen At',
            'Time of the last authenticated request from the sender.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bd0b92f-8ecc-4a1b-9cd0-d963050f2230' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'MaxBundlesPerDay')) BEGIN
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
            '3bd0b92f-8ecc-4a1b-9cd0-d963050f2230',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'MaxBundlesPerDay',
            'Max Bundles Per Day',
            'Maximum number of bundles the collector accepts from this sender per day.',
            'int',
            4,
            10,
            0,
            0,
            '(20)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5612c9b8-1eda-4019-878c-a21c485c10ce' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = 'Comments')) BEGIN
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
            '5612c9b8-1eda-4019-878c-a21c485c10ce',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
            'Comments',
            'Comments',
            'Free-form administrator notes about the registration.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76f764c6-2e66-4a5a-b5ab-f6c3829678b0' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = '__mj_CreatedAt')) BEGIN
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
            '76f764c6-2e66-4a5a-b5ab-f6c3829678b0',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e53616b4-27ca-456b-ba39-268eed2d9984' OR (EntityID = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e53616b4-27ca-456b-ba39-268eed2d9984',
            'F4D96070-6ECB-46AA-8C44-A20271589FBC', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC'),
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

/* SQL text to insert entity field value with ID 843c0e35-0750-4ef3-8f4e-76e970c1e0ba */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('843c0e35-0750-4ef3-8f4e-76e970c1e0ba', '1636FC8E-F86F-4DA1-90BA-9680035F5137', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 71ba3f85-1acf-4ef0-b858-36fb047ce710 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71ba3f85-1acf-4ef0-b858-36fb047ce710', '1636FC8E-F86F-4DA1-90BA-9680035F5137', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f1ee2e14-2ecb-4a60-8785-477de7203afc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1ee2e14-2ecb-4a60-8785-477de7203afc', '1636FC8E-F86F-4DA1-90BA-9680035F5137', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1636FC8E-F86F-4DA1-90BA-9680035F5137 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1636FC8E-F86F-4DA1-90BA-9680035F5137';

/* SQL text to insert entity field value with ID 05059b28-46ae-42c9-b3fa-60a850a760f3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('05059b28-46ae-42c9-b3fa-60a850a760f3', '14E51904-266B-4968-93F2-40674D8E1C04', 1, 'Ed25519', 'Ed25519', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 14E51904-266B-4968-93F2-40674D8E1C04 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='14E51904-266B-4968-93F2-40674D8E1C04';

/* Index for Foreign Keys for DiagnosticSenderRegistration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: vwDiagnosticSenderRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Sender Registrations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticSenderRegistration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]
AS
SELECT
    d.*
FROM
    [${flyway:defaultSchema}].[DiagnosticSenderRegistration] AS d
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: Permissions for vwDiagnosticSenderRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spCreateDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration]
    @ID uniqueidentifier = NULL,
    @InstallID nvarchar(100),
    @Name nvarchar(255),
    @Status nvarchar(20) = NULL,
    @KeyAlgorithm nvarchar(20) = NULL,
    @KeyID_Clear bit = 0,
    @KeyID nvarchar(100) = NULL,
    @PublicKeyBase64_Clear bit = 0,
    @PublicKeyBase64 nvarchar(255) = NULL,
    @RegistrationCodeHash_Clear bit = 0,
    @RegistrationCodeHash nvarchar(128) = NULL,
    @RegistrationCodeExpiresAt_Clear bit = 0,
    @RegistrationCodeExpiresAt datetimeoffset = NULL,
    @EnrolledAt_Clear bit = 0,
    @EnrolledAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @MaxBundlesPerDay int = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
            (
                [ID],
                [InstallID],
                [Name],
                [Status],
                [KeyAlgorithm],
                [KeyID],
                [PublicKeyBase64],
                [RegistrationCodeHash],
                [RegistrationCodeExpiresAt],
                [EnrolledAt],
                [RevokedAt],
                [LastSeenAt],
                [MaxBundlesPerDay],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InstallID,
                @Name,
                ISNULL(@Status, 'Pending'),
                ISNULL(@KeyAlgorithm, 'Ed25519'),
                CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, NULL) END,
                CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, NULL) END,
                CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, NULL) END,
                CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, NULL) END,
                CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                ISNULL(@MaxBundlesPerDay, 20),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
            (
                [InstallID],
                [Name],
                [Status],
                [KeyAlgorithm],
                [KeyID],
                [PublicKeyBase64],
                [RegistrationCodeHash],
                [RegistrationCodeExpiresAt],
                [EnrolledAt],
                [RevokedAt],
                [LastSeenAt],
                [MaxBundlesPerDay],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InstallID,
                @Name,
                ISNULL(@Status, 'Pending'),
                ISNULL(@KeyAlgorithm, 'Ed25519'),
                CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, NULL) END,
                CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, NULL) END,
                CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, NULL) END,
                CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, NULL) END,
                CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                ISNULL(@MaxBundlesPerDay, 20),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spUpdateDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration]
    @ID uniqueidentifier,
    @InstallID nvarchar(100) = NULL,
    @Name nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @KeyAlgorithm nvarchar(20) = NULL,
    @KeyID_Clear bit = 0,
    @KeyID nvarchar(100) = NULL,
    @PublicKeyBase64_Clear bit = 0,
    @PublicKeyBase64 nvarchar(255) = NULL,
    @RegistrationCodeHash_Clear bit = 0,
    @RegistrationCodeHash nvarchar(128) = NULL,
    @RegistrationCodeExpiresAt_Clear bit = 0,
    @RegistrationCodeExpiresAt datetimeoffset = NULL,
    @EnrolledAt_Clear bit = 0,
    @EnrolledAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @MaxBundlesPerDay int = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    SET
        [InstallID] = ISNULL(@InstallID, [InstallID]),
        [Name] = ISNULL(@Name, [Name]),
        [Status] = ISNULL(@Status, [Status]),
        [KeyAlgorithm] = ISNULL(@KeyAlgorithm, [KeyAlgorithm]),
        [KeyID] = CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, [KeyID]) END,
        [PublicKeyBase64] = CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, [PublicKeyBase64]) END,
        [RegistrationCodeHash] = CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, [RegistrationCodeHash]) END,
        [RegistrationCodeExpiresAt] = CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, [RegistrationCodeExpiresAt]) END,
        [EnrolledAt] = CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, [EnrolledAt]) END,
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [LastSeenAt] = CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, [LastSeenAt]) END,
        [MaxBundlesPerDay] = ISNULL(@MaxBundlesPerDay, [MaxBundlesPerDay]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSenderRegistration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSenderRegistration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSenderRegistration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSenderRegistration
ON [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spDeleteDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4D85B66E-6EFE-4E45-98C1-1CE4299F0008'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3BD0B92F-8ECC-4A1B-9CD0-D963050F2230'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '66D55789-4482-42A0-AA99-9D66BD2A4E1F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '652D64D3-F33D-4DD3-B118-773C9C82B641'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '66D55789-4482-42A0-AA99-9D66BD2A4E1F'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '91556FF4-3F7D-4DEF-AF75-681B5C8B85F8';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.InstallID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '66D55789-4482-42A0-AA99-9D66BD2A4E1F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '652D64D3-F33D-4DD3-B118-773C9C82B641';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1636FC8E-F86F-4DA1-90BA-9680035F5137';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyAlgorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Authentication',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '14E51904-266B-4968-93F2-40674D8E1C04';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Authentication',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3E42120F-3D9A-4551-A604-49951F094498';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.PublicKeyBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Authentication',
   GeneratedFormSection = 'Category',
   DisplayName = 'Public Key (Base64)'
WHERE 
   ID = 'D414C533-7580-452B-9119-384DFAC15053';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Authentication',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '03BCC926-CC1D-4BF2-B562-74EB54361F02';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4000E6F5-5026-49A6-8975-6FAAE1C01B3B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.EnrolledAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8874AF69-4DDB-4826-AE0F-C68792EE6CB7';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RevokedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '952E3488-1ABE-47AD-A03F-30AF045BCD4E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.LastSeenAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D85B66E-6EFE-4E45-98C1-1CE4299F0008';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.MaxBundlesPerDay 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3BD0B92F-8ECC-4A1B-9CD0-D963050F2230';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5612C9B8-1EDA-4019-878C-A21C485C10CE';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '76F764C6-2E66-4A5A-B5AB-F6C3829678B0';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E53616B4-27CA-456B-BA39-268EED2D9984';

/* Set entity icon to fa fa-server */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-server', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1c35ba6e-556e-5e93-b834-00af7b2391ab', 'F4D96070-6ECB-46AA-8C44-A20271589FBC', 'FieldCategoryInfo', '{
  "Activity and Limits": {
    "description": "Timestamps for enrollment, revocation, activity, and daily bundle limits",
    "icon": "fa fa-tachometer-alt"
  },
  "Registration Details": {
    "description": "Core identity, status, and administrative notes for the diagnostic sender",
    "icon": "fa fa-id-card"
  },
  "Security and Authentication": {
    "description": "Cryptographic keys, algorithms, and registration code verification data",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('89531d30-dfd8-5ea8-a390-bab1f60b27cf', 'F4D96070-6ECB-46AA-8C44-A20271589FBC', 'FieldCategoryIcons', '{
  "Activity and Limits": "fa fa-tachometer-alt",
  "Registration Details": "fa fa-id-card",
  "Security and Authentication": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F4D96070-6ECB-46AA-8C44-A20271589FBC';

