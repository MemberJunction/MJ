-- =============================================================================
-- v5.22.x: Artifact Binary Storage
-- =============================================================================
-- Extends ArtifactVersion to reference binary files stored in MJStorage,
-- enabling agents to produce PDF, Excel, and Word documents as artifacts.
--
-- Changes:
--   ArtifactVersion  - adds FileID (FK → File), ContentMode, MimeType,
--                      FileName, ContentSizeBytes
--   ArtifactType     - adds ContentCategory ('Text' | 'File')
--
-- New ArtifactType seed records: PDF, Excel Spreadsheet, Word Document
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ArtifactVersion — add binary storage columns
-- -----------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ArtifactVersion
    ADD FileID           UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ArtifactVersion_File FOREIGN KEY
                REFERENCES ${flyway:defaultSchema}.[File](ID),
        ContentMode      NVARCHAR(10)     NOT NULL
            CONSTRAINT DF_ArtifactVersion_ContentMode DEFAULT 'Text'
            CONSTRAINT CK_ArtifactVersion_ContentMode CHECK (ContentMode IN ('Text', 'File')),
        MimeType         NVARCHAR(200)    NULL,
        FileName         NVARCHAR(500)    NULL,
        ContentSizeBytes BIGINT           NULL;


-- -----------------------------------------------------------------------------
-- 2. ArtifactType — add ContentCategory to distinguish text vs file types
-- -----------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ArtifactType
    ADD ContentCategory NVARCHAR(10) NOT NULL
            CONSTRAINT DF_ArtifactType_ContentCategory DEFAULT 'Text'
            CONSTRAINT CK_ArtifactType_ContentCategory CHECK (ContentCategory IN ('Text', 'File'));


GO

-- -----------------------------------------------------------------------------
-- 3. ArtifactType seed data (PDF, Excel, Word) moved to metadata JSON:
--    /metadata/artifact-types/.artifact-types.json
--    Push via: npx mj sync push --dir=metadata --include="artifact-types"
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Column descriptions
-- -----------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the MJ: Files entity. When ContentMode is ''File'', this references the binary file stored in MJStorage. NULL when ContentMode is ''Text''.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'FileID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Determines how artifact content is stored. ''Text'' (default) means the Content column holds the data. ''File'' means FileID references a binary file in MJStorage and Content is unused.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'ContentMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MIME type of the stored file (e.g. application/pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'MimeType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Original filename of the stored file (e.g. report.pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'FileName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Size of the stored file in bytes. Denormalized for display without loading the file. Only populated when ContentMode is ''File''.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = 'ContentSizeBytes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Classifies whether this artifact type stores text content (''Text'', the default for all existing types) or a binary file in MJStorage (''File''). Used by AgentRunner and viewer components to route file-based artifacts correctly.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ArtifactType',
    @level2type = N'COLUMN', @level2name = 'ContentCategory';



-- Codegen
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2492de21-a1e2-497b-9b47-96cc61a08164' OR (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'ContentCategory')) BEGIN
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
            '2492de21-a1e2-497b-9b47-96cc61a08164',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100026,
            'ContentCategory',
            'Content Category',
            'Classifies whether this artifact type stores text content (''Text'', the default for all existing types) or a binary file in MJStorage (''File''). Used by AgentRunner and viewer components to route file-based artifacts correctly.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Text',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb6cf4f1-a470-46ee-95dd-2c899f8fc51b' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'FileID')) BEGIN
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
            'fb6cf4f1-a470-46ee-95dd-2c899f8fc51b',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100032,
            'FileID',
            'File ID',
            'Foreign key to the MJ: Files entity. When ContentMode is ''File'', this references the binary file stored in MJStorage. NULL when ContentMode is ''Text''.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1811bc2e-c1ea-4f7f-9aad-892a909e2109' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'ContentMode')) BEGIN
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
            '1811bc2e-c1ea-4f7f-9aad-892a909e2109',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100033,
            'ContentMode',
            'Content Mode',
            'Determines how artifact content is stored. ''Text'' (default) means the Content column holds the data. ''File'' means FileID references a binary file in MJStorage and Content is unused.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Text',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b50b55af-0282-4103-a9ac-8301fabb49c7' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'MimeType')) BEGIN
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
            'b50b55af-0282-4103-a9ac-8301fabb49c7',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100034,
            'MimeType',
            'Mime Type',
            'MIME type of the stored file (e.g. application/pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2eff50c2-4c28-4c80-a058-af6fd51fad47' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'FileName')) BEGIN
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
            '2eff50c2-4c28-4c80-a058-af6fd51fad47',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100035,
            'FileName',
            'File Name',
            'Original filename of the stored file (e.g. report.pdf). Denormalized from the File entity for display without joins. Only populated when ContentMode is ''File''.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8647eee6-0d7f-4f86-ad4d-458a53e11eb9' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'ContentSizeBytes')) BEGIN
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
            '8647eee6-0d7f-4f86-ad4d-458a53e11eb9',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100036,
            'ContentSizeBytes',
            'Content Size Bytes',
            'Size of the stored file in bytes. Denormalized for display without loading the file. Only populated when ContentMode is ''File''.',
            'bigint',
            8,
            19,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert entity field value with ID b33269a0-9fd5-450d-83c6-e79a4f62c954 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b33269a0-9fd5-450d-83c6-e79a4f62c954', '1811BC2E-C1EA-4F7F-9AAD-892A909E2109', 1, 'File', 'File', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 2a421fd2-b940-4b9f-bb7f-61f6d773627c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2a421fd2-b940-4b9f-bb7f-61f6d773627c', '1811BC2E-C1EA-4F7F-9AAD-892A909E2109', 2, 'Text', 'Text', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 1811BC2E-C1EA-4F7F-9AAD-892A909E2109 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1811BC2E-C1EA-4F7F-9AAD-892A909E2109'

/* SQL text to insert entity field value with ID 6b60bee1-22c4-4d1a-a500-5bc886989969 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b60bee1-22c4-4d1a-a500-5bc886989969', '2492DE21-A1E2-497B-9B47-96CC61A08164', 1, 'File', 'File', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 1f30864d-94c5-4e04-b0b4-b7d35af70c79 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1f30864d-94c5-4e04-b0b4-b7d35af70c79', '2492DE21-A1E2-497B-9B47-96CC61A08164', 2, 'Text', 'Text', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 2492DE21-A1E2-497B-9B47-96CC61A08164 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2492DE21-A1E2-497B-9B47-96CC61A08164'


/* Create Entity Relationship: MJ: Files -> MJ: Artifact Versions (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '16657ed1-91ca-48b4-a532-1164d6cf8c39'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('16657ed1-91ca-48b4-a532-1164d6cf8c39', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'FileID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ArtifactType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table ArtifactType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactType_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactType_ParentID ON [${flyway:defaultSchema}].[ArtifactType] ([ParentID]);

/* Index for Foreign Keys for ArtifactVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_ArtifactID ON [${flyway:defaultSchema}].[ArtifactVersion] ([ArtifactID]);

-- Index for foreign key UserID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_UserID ON [${flyway:defaultSchema}].[ArtifactVersion] ([UserID]);

-- Index for foreign key FileID in table ArtifactVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactVersion_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactVersion_FileID ON [${flyway:defaultSchema}].[ArtifactVersion] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID FB6CF4F1-A470-46EE-95DD-2C899F8FC51B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FB6CF4F1-A470-46EE-95DD-2C899F8FC51B', @RelatedEntityNameFieldMap='File'

/* Root ID Function SQL for MJ: Artifact Types.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: fnArtifactTypeParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ArtifactType].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ArtifactType]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ArtifactType] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*,
    MJArtifactType_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_ParentID
  ON
    [a].[ParentID] = MJArtifactType_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit = NULL,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255),
    @ContentCategory nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
                [Description],
                [ContentType],
                [IsEnabled],
                [ParentID],
                [ExtractRules],
                [DriverClass],
                [Icon],
                [ContentCategory],
                [ID]
        )
    VALUES
        (
            @Name,
                @Description,
                @ContentType,
                ISNULL(@IsEnabled, 1),
                @ParentID,
                @ExtractRules,
                @DriverClass,
                @Icon,
                ISNULL(@ContentCategory, 'Text'),
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255),
    @ContentCategory nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled,
        [ParentID] = @ParentID,
        [ExtractRules] = @ExtractRules,
        [DriverClass] = @DriverClass,
        [Icon] = @Icon,
        [ContentCategory] = @ContentCategory
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* Base View SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactVersions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactVersions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactVersions]
AS
SELECT
    a.*,
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJUser_UserID.[Name] AS [User],
    MJFile_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[ArtifactVersion] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS MJArtifact_ArtifactID
  ON
    [a].[ArtifactID] = MJArtifact_ArtifactID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [a].[FileID] = MJFile_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: Permissions for vwArtifactVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spCreateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactVersion]
    @ID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier,
    @ContentHash nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @FileID uniqueidentifier,
    @ContentMode nvarchar(10) = NULL,
    @MimeType nvarchar(200),
    @FileName nvarchar(500),
    @ContentSizeBytes bigint
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ID],
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID],
                [ContentHash],
                [Name],
                [Description],
                [FileID],
                [ContentMode],
                [MimeType],
                [FileName],
                [ContentSizeBytes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID,
                @ContentHash,
                @Name,
                @Description,
                @FileID,
                ISNULL(@ContentMode, 'Text'),
                @MimeType,
                @FileName,
                @ContentSizeBytes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactVersion]
            (
                [ArtifactID],
                [VersionNumber],
                [Content],
                [Configuration],
                [Comments],
                [UserID],
                [ContentHash],
                [Name],
                [Description],
                [FileID],
                [ContentMode],
                [MimeType],
                [FileName],
                [ContentSizeBytes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                @VersionNumber,
                @Content,
                @Configuration,
                @Comments,
                @UserID,
                @ContentHash,
                @Name,
                @Description,
                @FileID,
                ISNULL(@ContentMode, 'Text'),
                @MimeType,
                @FileName,
                @ContentSizeBytes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spUpdateArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactVersion]
    @ID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @VersionNumber int,
    @Content nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Comments nvarchar(MAX),
    @UserID uniqueidentifier,
    @ContentHash nvarchar(500),
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @FileID uniqueidentifier,
    @ContentMode nvarchar(10),
    @MimeType nvarchar(200),
    @FileName nvarchar(500),
    @ContentSizeBytes bigint
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        [ArtifactID] = @ArtifactID,
        [VersionNumber] = @VersionNumber,
        [Content] = @Content,
        [Configuration] = @Configuration,
        [Comments] = @Comments,
        [UserID] = @UserID,
        [ContentHash] = @ContentHash,
        [Name] = @Name,
        [Description] = @Description,
        [FileID] = @FileID,
        [ContentMode] = @ContentMode,
        [MimeType] = @MimeType,
        [FileName] = @FileName,
        [ContentSizeBytes] = @ContentSizeBytes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactVersion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactVersion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactVersion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactVersion
ON [${flyway:defaultSchema}].[ArtifactVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactVersion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spDeleteArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactVersion] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4e062fc-5555-4b7c-82a6-87a6e46747cd' OR (EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'File')) BEGIN
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
            'd4e062fc-5555-4b7c-82a6-87a6e46747cd',
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', -- Entity: MJ: Artifact Versions
            100039,
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2492DE21-A1E2-497B-9B47-96CC61A08164'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '874E9B47-A201-4C78-896A-D41A607B1840'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B7B428EF-DE10-4882-8517-28636332C6DB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2492DE21-A1E2-497B-9B47-96CC61A08164'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '96E57B30-5EFD-4612-A28E-16AB359864EA'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E1A69905-07E6-4852-AA41-9D4E610B0AAE'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '315DF2ED-FC5C-4337-B346-FC91AFE461CC'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Artifact Versions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B6BFB96-D6C3-4254-B9F5-28B306AD48DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.ArtifactID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E986C32B-9789-46B1-88ED-A1684050E6AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.VersionNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C2B8B64-F592-4BFD-8ED4-E0488C042A5D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8DA4933-F812-48B2-A445-E49413076B6B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '96E57B30-5EFD-4612-A28E-16AB359864EA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Content 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5D391B2-7945-448E-980A-93C5A2549A65' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A3BDF038-3DA1-4088-A57F-9656C95CFAA8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A2524C0A-5778-4D42-B468-8E6026ECC3BB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.ContentHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02F91602-349C-4F60-B9C4-356BBC029C59' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84FA642F-F570-4B31-978B-32E786CA429A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.Artifact 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1A69905-07E6-4852-AA41-9D4E610B0AAE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '315DF2ED-FC5C-4337-B346-FC91AFE461CC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C004E0E-12A3-47EB-9E7A-6A306E1868D4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F378B93-C2A0-47A2-AF7A-7E77C5461E6F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'File',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB6CF4F1-A470-46EE-95DD-2C899F8FC51B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.ContentMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1811BC2E-C1EA-4F7F-9AAD-892A909E2109' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.MimeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'MIME Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B50B55AF-0282-4103-A9AC-8301FABB49C7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.FileName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2EFF50C2-4C28-4C80-A058-AF6FD51FAD47' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.ContentSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8647EEE6-0D7F-4F86-AD4D-458A53E11EB9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Versions.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4E062FC-5555-4B7C-82A6-87A6E46747CD' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0bb76306-31b2-46a8-83e6-f30654f4dfe8', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'FieldCategoryInfo', '{"File Storage":{"icon":"fa fa-file","description":"Details about the stored file version when content is kept as a binary attachment"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"File Storage":"fa fa-file"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Artifact Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3C8A690-7E75-499E-B603-3F900AB94704' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '874E9B47-A201-4C78-896A-D41A607B1840' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7B428EF-DE10-4882-8517-28636332C6DB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.IsEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0B16E34-7C24-4811-84E6-75CCA5C499FB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FEDE9AF-F0FE-438C-A369-93AC24A882C1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '011BB58C-1187-4107-A82E-D8C676A2A983' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.ContentCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Type Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2492DE21-A1E2-497B-9B47-96CC61A08164' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8CC25C6-C9DE-4726-9BA5-81E0C4749281' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AE8938F-5656-4CC8-89BC-1CCAAC9DF213' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02B6383F-BAE6-465C-BBB4-652E6F75A74C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.ExtractRules 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CACE3BF-BDF2-4443-9D2C-E28E4FE4E489' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63D25BCF-550E-4013-AB1F-03657369B0E9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Artifact Types.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C369578-B099-4E25-98B5-8218CE90A432' AND AutoUpdateCategory = 1
