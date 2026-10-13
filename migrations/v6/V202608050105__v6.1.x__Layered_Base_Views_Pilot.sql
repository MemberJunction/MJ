-- =============================================================================
-- Layered base views — first two adopters in MJ core.
-- =============================================================================
--
-- These two entities previously had FULLY CUSTOM base views: `BaseViewGenerated = 0`
-- with no inner view, so CodeGen stopped generating for them entirely and the
-- application inherited the whole thing. They now name an inner view
-- (`GeneratedBaseViewName`, set declaratively in `metadata/entities/.layered-base-views.json`),
-- CodeGen generates underneath, and these thin wrappers are all that remain custom.
--
-- WHY THIS MIGRATION IS SEPARATE from the one that added the column. The outer views
-- below SELECT from the inner views, and the inner views are created by the CodeGen
-- section of the PREVIOUS migration. That section is replaced wholesale on every
-- regeneration, so hand-written SQL cannot live inside or after it without being
-- destroyed the next time CodeGen runs. Ordering by timestamp is what guarantees the
-- inner views exist before these run.
--
-- WHAT EACH CUSTOM LAYER STILL EARNS. Everything that is merely mechanical —
-- `SELECT <table>.*`, related-entity display joins, geo columns, recursive root-ID
-- columns — now regenerates in the inner view. What is left is the part CodeGen
-- genuinely cannot produce.
--
-- Both wrappers expose a SUPERSET of what they exposed before; no column disappears.
-- `MJ: User View Run Details` additionally GAINS `UserViewRun`, a related-entity display
-- field its hand-written view never had, because nobody went back to add the join after
-- the foreign key was introduced. That is the exact silent staleness layering exists to
-- eliminate, and it is fixed here without anyone editing SQL to fix it.
--
-- 18 more core entities still carry fully custom base views and should follow over time.
-- `MJ: Entities` is deliberately excluded: `vwEntities` is what the metadata layer itself
-- reads, so layering the view CodeGen consults in order to decide whether to layer is a
-- chicken-and-egg best left alone.
-- =============================================================================

-- MJ: Version Installations — the simplest possible layering. No foreign keys at all, so
-- the inner view is a plain SELECT of the base table and the custom layer is one computed
-- column. Was 12 columns, still 12.
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionInstallations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionInstallations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionInstallations]
AS
SELECT
    g.*,
    CONVERT(nvarchar(100), g.MajorVersion) + '.' +
    CONVERT(nvarchar(100), g.MinorVersion) + '.' +
    CONVERT(nvarchar(100), g.PatchVersion, 100) AS CompleteVersion
FROM
    [${flyway:defaultSchema}].[vwVersionInstallationsGenerated] g;
GO

-- MJ: User View Run Details — the representative case. `UserViewID` and `EntityID` are
-- TWO-HOP ancestor keys reached through UserViewRun, not direct foreign-key display
-- fields, so CodeGen cannot generate them and the custom layer keeps its own joins.
-- Was 7 columns, now 8: the inner view supplies the `UserViewRun` display field that the
-- hand-written view never had.
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewRunDetails]
AS
SELECT
    g.*,
    uv.ID AS UserViewID,
    uv.EntityID
FROM
    [${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated] g
INNER JOIN
    [${flyway:defaultSchema}].[UserViewRun] uvr
  ON
    g.UserViewRunID = uvr.ID
INNER JOIN
    [${flyway:defaultSchema}].[UserView] uv
  ON
    uvr.UserViewID = uv.ID;
GO























































-- ============================================================================================
-- ============================================================================================
-- ==                                                                                        ==
-- ==                    E V E R Y T H I N G   B E L O W   T H I S   L I N E                 ==
-- ==                  W A S   G E N E R A T E D   B Y   M E M B E R J U N C T I O N         ==
-- ==                              C O D E G E N   —   D O   N O T   E D I T                 ==
-- ==                                                                                        ==
-- ============================================================================================
-- ============================================================================================
--
-- Produced by `mj codegen` after the wrappers above were created. It registers `UserViewRun` —
-- the related-entity display field the hand-written view never had — as a virtual EntityField,
-- and regenerates the CRUD routines for MJ: User View Run Details to carry it.
--
-- Note what it does NOT contain: any DDL for the application-owned outer views. CodeGen
-- regenerated only `vwUserViewRunDetailsGenerated`. That is the whole point of the arrangement
-- and the thing most worth not breaking. Every GRANT aimed at the outer view is wrapped in an
-- existence check, so this section is safe to run before the wrapper exists.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen against a clean
-- database and replace this entire generated section.
-- ============================================================================================

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50829bed-3f2d-44b6-846b-4109335463b1' OR (EntityID = 'F1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserViewRun')) BEGIN
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
            '50829bed-3f2d-44b6-846b-4109335463b1',
            'F1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: User View Run Details
            100014,
            'UserViewRun',
            'User View Run',
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

/* Index for Foreign Keys for UserViewRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserViewRunID in table UserViewRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserViewRunDetail_UserViewRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserViewRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserViewRunDetail_UserViewRunID ON [${flyway:defaultSchema}].[UserViewRunDetail] ([UserViewRunID]);

/* Base View SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: vwUserViewRunDetailsGenerated
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User View Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated]
AS
SELECT
    u.*,
    MJUserViewRun_UserViewRunID.[UserView] AS [UserViewRun]
FROM
    [${flyway:defaultSchema}].[UserViewRunDetail] AS u
INNER JOIN
    [${flyway:defaultSchema}].[vwUserViewRuns] AS MJUserViewRun_UserViewRunID
  ON
    [u].[UserViewRunID] = MJUserViewRun_UserViewRunID.[ID]
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetails]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRunDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]';
END;

/* Base View Permissions SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: Permissions for vwUserViewRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetails]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRunDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]';
END;

/* spCreate SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: spCreateUserViewRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserViewRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewRunDetail]
    @ID uniqueidentifier = NULL,
    @UserViewRunID uniqueidentifier,
    @RecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserViewRunDetail]
            (
                [ID],
                [UserViewRunID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserViewRunID,
                @RecordID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserViewRunDetail]
            (
                [UserViewRunID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserViewRunID,
                @RecordID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User View Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: spUpdateUserViewRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserViewRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewRunDetail]
    @ID uniqueidentifier,
    @UserViewRunID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRunDetail]
    SET
        [UserViewRunID] = ISNULL(@UserViewRunID, [UserViewRunID]),
        [RecordID] = ISNULL(@RecordID, [RecordID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViewRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserViewRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserViewRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewRunDetail
ON [${flyway:defaultSchema}].[UserViewRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: User View Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: spDeleteUserViewRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserViewRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: User View Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewRunDetail] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '50829BED-3F2D-44B6-846B-4109335463B1'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: User View Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.UserViewRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User View Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.UserViewRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User View Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '50829BED-3F2D-44B6-846B-4109335463B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.UserViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B84D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B74D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User View Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F05817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwUserViewRunDetailsGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetails]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwUserViewRunDetails'';';
END;


-- --------------------------------------------------------------------------------------------
-- Unrelated to layering: a validator for MJ: Entity Actions' new ScopeEntityID/ScopeRecordID
-- CHECK, which arrived on `next`. Its own CodeGen run did not emit this — validator functions are
-- LLM-authored and not produced deterministically — so a clean regeneration surfaces it here.
-- Carried rather than dropped, because without it a fresh install would have the generated
-- TypeScript method with no matching GeneratedCode row, and the next CodeGen run would stop being
-- a no-op.
-- --------------------------------------------------------------------------------------------

/* Generated Validation Functions for MJ: Entity Actions */
-- CHECK constraint for MJ: Entity Actions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ScopeEntityID] IS NULL AND [ScopeRecordID] IS NULL OR [ScopeEntityID] IS NOT NULL AND [ScopeRecordID] IS NOT NULL)', 'public ValidateScopeEntityAndRecordCoexistence(result: ValidationResult) {
    if ((this.ScopeEntityID == null && this.ScopeRecordID != null) || (this.ScopeEntityID != null && this.ScopeRecordID == null)) {
        result.Errors.push(new ValidationErrorInfo(
            "ScopeEntityID",
            "Scope Entity and Scope Record must either both be specified or both be empty.",
            this.ScopeEntityID,
            ValidationErrorType.Failure
        ));
    }
}', 'Both Scope Entity and Scope Record must be provided together, or both must be left blank. You cannot specify one without the other.', 'ValidateScopeEntityAndRecordCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '34248F34-2837-EF11-86D4-6045BDEE16E6');

