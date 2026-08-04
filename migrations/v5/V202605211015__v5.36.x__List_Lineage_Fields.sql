-- Phase 1 — Lists ↔ Views Bridge.
--
-- Adds lineage columns to ${flyway:defaultSchema}.List so a List can remember
-- the User View (or filter snapshot) it was materialized from, support
-- additive vs sync refresh modes, and record who refreshed it last.
--
-- Single consolidated ALTER TABLE per CLAUDE.md (one statement, multiple ADDs).
-- No __mj timestamp columns (CodeGen handles those on every table). No FK
-- indexes here (CodeGen emits IDX_AUTO_MJ_FKEY_* automatically).

-- Columns + their defaults + the discriminator CHECK constraint inlined.
-- Inlining the CHECK is required because SQL Server validates constraints
-- referencing newly added columns against existing rows in the same batch,
-- and the column isn't yet visible to a separate ADD CONSTRAINT statement
-- in the same migration file.
ALTER TABLE ${flyway:defaultSchema}.List ADD
    SourceViewID UNIQUEIDENTIFIER NULL,
    SourceFilterSnapshot NVARCHAR(MAX) NULL,
    LastRefreshedAt DATETIMEOFFSET NULL,
    LastRefreshedByUserID UNIQUEIDENTIFIER NULL,
    RefreshMode NVARCHAR(20) NOT NULL
        CONSTRAINT DF_List_RefreshMode DEFAULT ('Additive')
        CONSTRAINT CK_List_RefreshMode CHECK (RefreshMode IN ('Additive', 'Sync')),
    UseSnapshot BIT NOT NULL
        CONSTRAINT DF_List_UseSnapshot DEFAULT (0);
GO

-- Foreign keys (separate batch so the FK can see the column).
ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_SourceView
        FOREIGN KEY (SourceViewID)
        REFERENCES ${flyway:defaultSchema}.UserView(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_LastRefreshedBy
        FOREIGN KEY (LastRefreshedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID);
GO

-- Column descriptions. CodeGen reads these into EntityField metadata on next run.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations.RefreshFromSource.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceViewID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceFilterSnapshot';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'LastRefreshedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'LastRefreshedByUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'RefreshMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'UseSnapshot';































































































































































































































-- CODEGEN RUN 
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9918d443-54bc-475f-9a96-3f89981bf8a1' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceViewID')) BEGIN
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
            '9918d443-54bc-475f-9a96-3f89981bf8a1',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100031,
            'SourceViewID',
            'Source View ID',
            'Optional ID of the User View this list was materialized from. NULL for hand-built lists. When set, the list can be refreshed against this view via ListOperations.RefreshFromSource.',
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
            'E4238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea6287aa-3aeb-4d8f-b280-014ec15f1f07' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceFilterSnapshot')) BEGIN
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
            'ea6287aa-3aeb-4d8f-b280-014ec15f1f07',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100032,
            'SourceFilterSnapshot',
            'Source Filter Snapshot',
            'JSON snapshot of the source filter at materialization time. When UseSnapshot=1, refreshes re-apply this snapshot rather than re-reading the live source view. Null when no snapshot was captured.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ceee59e0-6039-409e-a54b-0d6d59ac84f2' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedAt')) BEGIN
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
            'ceee59e0-6039-409e-a54b-0d6d59ac84f2',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100033,
            'LastRefreshedAt',
            'Last Refreshed At',
            'Timestamp (UTC) of the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbe90a96-fd40-40d7-8ff0-69661b9a6872' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedByUserID')) BEGIN
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
            'bbe90a96-fd40-40d7-8ff0-69661b9a6872',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100034,
            'LastRefreshedByUserID',
            'Last Refreshed By User ID',
            'User who triggered the most recent successful RefreshFromSource. Null when the list has never been refreshed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08bd4751-c950-46a2-b010-d3771d0c3525' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RefreshMode')) BEGIN
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
            '08bd4751-c950-46a2-b010-d3771d0c3525',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100035,
            'RefreshMode',
            'Refresh Mode',
            'Default refresh mode for this list. Additive only adds new members; Sync reconciles in both directions (may remove members no longer in the source — requires explicit drop-confirmation).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Additive',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1028ff74-1d87-4736-b9e0-ff8d23d866b8' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UseSnapshot')) BEGIN
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
            '1028ff74-1d87-4736-b9e0-ff8d23d866b8',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100036,
            'UseSnapshot',
            'Use Snapshot',
            'When 1, RefreshFromSource uses SourceFilterSnapshot as the source. When 0 (default), it re-reads the live SourceView.',
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

/* SQL text to insert entity field value with ID 860ab572-5364-4592-af69-2b2023be5045 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('860ab572-5364-4592-af69-2b2023be5045', '08BD4751-C950-46A2-B010-D3771D0C3525', 1, 'Additive', 'Additive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID df91df32-5318-40ec-aa37-745818185534 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('df91df32-5318-40ec-aa37-745818185534', '08BD4751-C950-46A2-B010-D3771D0C3525', 2, 'Sync', 'Sync', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 08BD4751-C950-46A2-B010-D3771D0C3525 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='08BD4751-C950-46A2-B010-D3771D0C3525';


/* Create Entity Relationship: MJ: Users -> MJ: Lists (One To Many via LastRefreshedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ba9804ad-21a0-4e0e-8372-42f6737713d4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ba9804ad-21a0-4e0e-8372-42f6737713d4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'LastRefreshedByUserID', 'One To Many', 1, 1, 97, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Views -> MJ: Lists (One To Many via SourceViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '645fceb3-840b-4fd6-b9e5-179484d51c6b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('645fceb3-840b-4fd6-b9e5-179484d51c6b', 'E4238F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceViewID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Base View SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: vwArtifactUses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Uses
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactUse
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactUses]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactUses];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactUses]
AS
SELECT
    a.*,
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ArtifactUse] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [a].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactUses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: Permissions for vwArtifactUses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactUses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spCreateArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactUse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactUse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactUse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactUse]
    @ID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier,
    @UserID uniqueidentifier,
    @UsageType nvarchar(20),
    @UsageContext_Clear bit = 0,
    @UsageContext nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactUse]
            (
                [ID],
                [ArtifactVersionID],
                [UserID],
                [UsageType],
                [UsageContext]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactVersionID,
                @UserID,
                @UsageType,
                CASE WHEN @UsageContext_Clear = 1 THEN NULL ELSE ISNULL(@UsageContext, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactUse]
            (
                [ArtifactVersionID],
                [UserID],
                [UsageType],
                [UsageContext]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactVersionID,
                @UserID,
                @UsageType,
                CASE WHEN @UsageContext_Clear = 1 THEN NULL ELSE ISNULL(@UsageContext, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactUses] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactUse] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Artifact Uses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactUse] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spUpdateArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactUse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactUse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactUse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactUse]
    @ID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @UsageType nvarchar(20) = NULL,
    @UsageContext_Clear bit = 0,
    @UsageContext nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactUse]
    SET
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [UsageType] = ISNULL(@UsageType, [UsageType]),
        [UsageContext] = CASE WHEN @UsageContext_Clear = 1 THEN NULL ELSE ISNULL(@UsageContext, [UsageContext]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactUses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactUses]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactUse] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactUse table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactUse]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactUse];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactUse
ON [${flyway:defaultSchema}].[ArtifactUse]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactUse]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactUse] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Artifact Uses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactUse] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spDeleteArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactUse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactUse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactUse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactUse]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactUse]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactUse] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Artifact Uses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactUse] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Version Attributes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactVersionAttribute
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactVersionAttributes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactVersionAttributes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactVersionAttributes]
AS
SELECT
    a.*,
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[ArtifactVersionAttribute] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [a].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersionAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: Permissions for vwArtifactVersionAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersionAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spCreateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactVersionAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute]
    @ID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier,
    @Name nvarchar(255),
    @Type nvarchar(500),
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @StandardProperty_Clear bit = 0,
    @StandardProperty nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersionAttribute]
            (
                [ID],
                [ArtifactVersionID],
                [Name],
                [Type],
                [Value],
                [StandardProperty]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactVersionID,
                @Name,
                @Type,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @StandardProperty_Clear = 1 THEN NULL ELSE ISNULL(@StandardProperty, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersionAttribute]
            (
                [ArtifactVersionID],
                [Name],
                [Type],
                [Value],
                [StandardProperty]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactVersionID,
                @Name,
                @Type,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @StandardProperty_Clear = 1 THEN NULL ELSE ISNULL(@StandardProperty, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactVersionAttributes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersionAttribute] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spUpdateArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute]
    @ID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Type nvarchar(500) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @StandardProperty_Clear bit = 0,
    @StandardProperty nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    SET
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID]),
        [Name] = ISNULL(@Name, [Name]),
        [Type] = ISNULL(@Type, [Type]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [StandardProperty] = CASE WHEN @StandardProperty_Clear = 1 THEN NULL ELSE ISNULL(@StandardProperty, [StandardProperty]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactVersionAttributes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactVersionAttributes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactVersionAttribute table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactVersionAttribute]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactVersionAttribute];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactVersionAttribute
ON [${flyway:defaultSchema}].[ArtifactVersionAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactVersionAttribute] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersionAttribute] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spDeleteArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactVersionAttribute]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Artifact Version Attributes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersionAttribute] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collection Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CollectionArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCollectionArtifacts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCollectionArtifacts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollectionArtifacts]
AS
SELECT
    c.*,
    MJCollection_CollectionID.[Name] AS [Collection],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[CollectionArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Collection] AS MJCollection_CollectionID
  ON
    [c].[CollectionID] = MJCollection_CollectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: Permissions for vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spCreateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCollectionArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCollectionArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollectionArtifact]
    @ID uniqueidentifier = NULL,
    @CollectionID uniqueidentifier,
    @Sequence int = NULL,
    @ArtifactVersionID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CollectionArtifact]
            (
                [ID],
                [CollectionID],
                [Sequence],
                [ArtifactVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CollectionID,
                ISNULL(@Sequence, 0),
                @ArtifactVersionID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CollectionArtifact]
            (
                [CollectionID],
                [Sequence],
                [ArtifactVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CollectionID,
                ISNULL(@Sequence, 0),
                @ArtifactVersionID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollectionArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spUpdateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCollectionArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCollectionArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollectionArtifact]
    @ID uniqueidentifier,
    @CollectionID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @ArtifactVersionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionArtifact]
    SET
        [CollectionID] = ISNULL(@CollectionID, [CollectionID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollectionArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollectionArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CollectionArtifact table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCollectionArtifact]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCollectionArtifact];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollectionArtifact
ON [${flyway:defaultSchema}].[CollectionArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CollectionArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spDeleteCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCollectionArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCollectionArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollectionArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CollectionArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetailAttachments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments]
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJAIModality_ModalityID.[Name] AS [Modality],
    MJFile_FileID.[Name] AS [File],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[ConversationDetailAttachment] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [c].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS MJAIModality_ModalityID
  ON
    [c].[ModalityID] = MJAIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [c].[FileID] = MJFile_FileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Permissions for vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment]
    @ID uniqueidentifier = NULL,
    @ConversationDetailID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName_Clear bit = 0,
    @FileName nvarchar(4000) = NULL,
    @FileSizeBytes int,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds int = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @DisplayOrder int = NULL,
    @ThumbnailBase64_Clear bit = 0,
    @ThumbnailBase64 nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ID],
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64],
                [Description],
                [ArtifactVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                @FileSizeBytes,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64],
                [Description],
                [ArtifactVersionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                @FileSizeBytes,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]
    @ID uniqueidentifier,
    @ConversationDetailID uniqueidentifier = NULL,
    @ModalityID uniqueidentifier = NULL,
    @MimeType nvarchar(100) = NULL,
    @FileName_Clear bit = 0,
    @FileName nvarchar(4000) = NULL,
    @FileSizeBytes int = NULL,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds int = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @DisplayOrder int = NULL,
    @ThumbnailBase64_Clear bit = 0,
    @ThumbnailBase64 nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        [ConversationDetailID] = ISNULL(@ConversationDetailID, [ConversationDetailID]),
        [ModalityID] = ISNULL(@ModalityID, [ModalityID]),
        [MimeType] = ISNULL(@MimeType, [MimeType]),
        [FileName] = CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, [FileName]) END,
        [FileSizeBytes] = ISNULL(@FileSizeBytes, [FileSizeBytes]),
        [Width] = CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, [Width]) END,
        [Height] = CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, [Height]) END,
        [DurationSeconds] = CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, [DurationSeconds]) END,
        [InlineData] = CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, [InlineData]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ThumbnailBase64] = CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, [ThumbnailBase64]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ArtifactVersionID] = CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, [ArtifactVersionID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetailAttachments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailAttachment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetailAttachment
ON [${flyway:defaultSchema}].[ConversationDetailAttachment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: vwConversationDetailArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetailArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetailArtifacts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetailArtifacts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetailArtifacts]
AS
SELECT
    c.*,
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[ConversationDetailArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [c].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: Permissions for vwConversationDetailArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spCreateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetailArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailArtifact]
    @ID uniqueidentifier = NULL,
    @ConversationDetailID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @Direction nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailArtifact]
            (
                [ID],
                [ConversationDetailID],
                [ArtifactVersionID],
                [Direction]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationDetailID,
                @ArtifactVersionID,
                ISNULL(@Direction, 'Output')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailArtifact]
            (
                [ConversationDetailID],
                [ArtifactVersionID],
                [Direction]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationDetailID,
                @ArtifactVersionID,
                ISNULL(@Direction, 'Output')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetailArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Detail Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spUpdateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetailArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailArtifact]
    @ID uniqueidentifier,
    @ConversationDetailID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier = NULL,
    @Direction nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailArtifact]
    SET
        [ConversationDetailID] = ISNULL(@ConversationDetailID, [ConversationDetailID]),
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID]),
        [Direction] = ISNULL(@Direction, [Direction])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetailArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetailArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailArtifact table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetailArtifact]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetailArtifact];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetailArtifact
ON [${flyway:defaultSchema}].[ConversationDetailArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetailArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Detail Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spDeleteConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetailArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetailArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Detail Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for List */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_EntityID ON [${flyway:defaultSchema}].[List] ([EntityID]);

-- Index for foreign key UserID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_UserID ON [${flyway:defaultSchema}].[List] ([UserID]);

-- Index for foreign key CategoryID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CategoryID ON [${flyway:defaultSchema}].[List] ([CategoryID]);

-- Index for foreign key CompanyIntegrationID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID ON [${flyway:defaultSchema}].[List] ([CompanyIntegrationID]);

-- Index for foreign key SourceViewID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_SourceViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_SourceViewID ON [${flyway:defaultSchema}].[List] ([SourceViewID]);

-- Index for foreign key LastRefreshedByUserID in table List
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID ON [${flyway:defaultSchema}].[List] ([LastRefreshedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 9918D443-54BC-475F-9A96-3F89981BF8A1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9918D443-54BC-475F-9A96-3F89981BF8A1', @RelatedEntityNameFieldMap='SourceView';

/* SQL text to update entity field related entity name field map for entity field ID BBE90A96-FD40-40D7-8FF0-69661B9A6872 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BBE90A96-FD40-40D7-8FF0-69661B9A6872', @RelatedEntityNameFieldMap='LastRefreshedByUser';

/* Base View SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Lists
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  List
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwLists]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwLists];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwLists]
AS
SELECT
    l.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_UserID.[Name] AS [User],
    MJListCategory_CategoryID.[Name] AS [Category],
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJUserView_SourceViewID.[Name] AS [SourceView],
    MJUser_LastRefreshedByUserID.[Name] AS [LastRefreshedByUser]
FROM
    [${flyway:defaultSchema}].[List] AS l
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [l].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [l].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS MJListCategory_CategoryID
  ON
    [l].[CategoryID] = MJListCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [l].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS MJUserView_SourceViewID
  ON
    [l].[SourceViewID] = MJUserView_SourceViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_LastRefreshedByUserID
  ON
    [l].[LastRefreshedByUserID] = MJUser_LastRefreshedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* Base View Permissions SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Permissions for vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spCreateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateList]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [ID],
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spUpdateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateList]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [ExternalSystemRecordID] = CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, [ExternalSystemRecordID]) END,
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END,
        [SourceViewID] = CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, [SourceViewID]) END,
        [SourceFilterSnapshot] = CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, [SourceFilterSnapshot]) END,
        [LastRefreshedAt] = CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, [LastRefreshedAt]) END,
        [LastRefreshedByUserID] = CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, [LastRefreshedByUserID]) END,
        [RefreshMode] = ISNULL(@RefreshMode, [RefreshMode]),
        [UseSnapshot] = ISNULL(@UseSnapshot, [UseSnapshot])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the List table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateList]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateList];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateList
ON [${flyway:defaultSchema}].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[List] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteList]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[List]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Lists */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d8e1713-738a-48b3-9e44-bd95d83f8c19' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceView')) BEGIN
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
            '3d8e1713-738a-48b3-9e44-bd95d83f8c19',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100041,
            'SourceView',
            'Source View',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78a54460-43bc-43f3-8ced-4aeb98d040b2' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastRefreshedByUser')) BEGIN
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
            '78a54460-43bc-43f3-8ced-4aeb98d040b2',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            100042,
            'LastRefreshedByUser',
            'Last Refreshed By User',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CEEE59E0-6039-409E-A54B-0D6D59AC84F2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '08BD4751-C950-46A2-B010-D3771D0C3525'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Lists.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C94217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A14D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Description',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A24D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.ExternalSystemRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CompanyIntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '154417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Category Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CB4656E-44E7-450B-9E8E-97737DEDC32D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.CompanyIntegration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE34E0B1-EA4C-4BF2-8A9A-64A96F1DE8DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9918D443-54BC-475F-9A96-3F89981BF8A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source View Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D8E1713-738A-48B3-9E44-BD95D83F8C19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.SourceFilterSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = NULL
WHERE 
   ID = 'EA6287AA-3AEB-4D8F-B280-014EC15F1F07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.UseSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1028FF74-1D87-4736-B9E0-FF8D23D866B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.RefreshMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08BD4751-C950-46A2-B010-D3771D0C3525' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CEEE59E0-6039-409E-A54B-0D6D59AC84F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBE90A96-FD40-40D7-8FF0-69661B9A6872' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.LastRefreshedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78A54460-43BC-43F3-8CED-4AEB98D040B2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '535817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Lists.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '545817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('148b7955-5af0-48a2-b9c3-3a34403eb389', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Refresh Settings":{"icon":"fa fa-sync-alt","description":"Configuration for automated list refreshing and source synchronization"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Refresh Settings":"fa fa-sync-alt"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

