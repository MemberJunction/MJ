-- Add EmbeddingModelID and VectorIndexID to ContentType and ContentSource tables.
-- ContentType provides the default embedding model and vector index for all sources of that type.
-- ContentSource can override these per-source. When NULL, falls back to ContentType defaults.

ALTER TABLE ${flyway:defaultSchema}.ContentType
    ADD EmbeddingModelID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentType_EmbeddingModel FOREIGN KEY REFERENCES ${flyway:defaultSchema}.AIModel(ID),
        VectorIndexID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentType_VectorIndex FOREIGN KEY REFERENCES ${flyway:defaultSchema}.VectorIndex(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD EmbeddingModelID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_EmbeddingModel FOREIGN KEY REFERENCES ${flyway:defaultSchema}.AIModel(ID),
        VectorIndexID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_VectorIndex FOREIGN KEY REFERENCES ${flyway:defaultSchema}.VectorIndex(ID);
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default AI embedding model for vectorizing content items of this type. Sources can override per-source. If NULL, uses the first available embedding model.', @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentType', @level2type=N'COLUMN', @level2name='EmbeddingModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default vector index for storing embeddings of this content type. Sources can override per-source. If NULL, uses the first available vector index.', @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentType', @level2type=N'COLUMN', @level2name='VectorIndexID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-source override for the AI embedding model. When NULL, falls back to the ContentType default.', @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentSource', @level2type=N'COLUMN', @level2name='EmbeddingModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-source override for the vector index. When NULL, falls back to the ContentType default.', @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentSource', @level2type=N'COLUMN', @level2name='VectorIndexID';



































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '045043fd-61a9-477f-82a7-72a7fc615a3c' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModelID')) BEGIN
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
            '045043fd-61a9-477f-82a7-72a7fc615a3c',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100020,
            'EmbeddingModelID',
            'Embedding Model ID',
            'Per-source override for the AI embedding model. When NULL, falls back to the ContentType default.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11091434-73bd-4006-8c65-8639ea9af1f3' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'VectorIndexID')) BEGIN
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
            '11091434-73bd-4006-8c65-8639ea9af1f3',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100021,
            'VectorIndexID',
            'Vector Index ID',
            'Per-source override for the vector index. When NULL, falls back to the ContentType default.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0706ebd4-7d99-4f16-99df-0e398e319aa3' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModelID')) BEGIN
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
            '0706ebd4-7d99-4f16-99df-0e398e319aa3',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100018,
            'EmbeddingModelID',
            'Embedding Model ID',
            'Default AI embedding model for vectorizing content items of this type. Sources can override per-source. If NULL, uses the first available embedding model.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93d4f3c4-3110-41cd-85fd-7a6a2c28b2a4' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'VectorIndexID')) BEGIN
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
            '93d4f3c4-3110-41cd-85fd-7a6a2c28b2a4',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100019,
            'VectorIndexID',
            'Vector Index ID',
            'Default vector index for storing embeddings of this content type. Sources can override per-source. If NULL, uses the first available vector index.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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


/* Create Entity Relationship: MJ: AI Models -> MJ: Content Types (One To Many via EmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '55eb97e2-6359-4f17-aabb-659bdb56596b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('55eb97e2-6359-4f17-aabb-659bdb56596b', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Models -> MJ: Content Sources (One To Many via EmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '51cd24aa-6737-4d06-810a-251c93953f9c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('51cd24aa-6737-4d06-810a-251c93953f9c', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Vector Indexes -> MJ: Content Types (One To Many via VectorIndexID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f7bfc7f4-5e0a-471a-af4f-64e5b9655919'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f7bfc7f4-5e0a-471a-af4f-64e5b9655919', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'VectorIndexID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Vector Indexes -> MJ: Content Sources (One To Many via VectorIndexID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fcabd159-2211-4477-ba69-3bbbda54cf40'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fcabd159-2211-4477-ba69-3bbbda54cf40', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'VectorIndexID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

-- Index for foreign key EmbeddingModelID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentSource] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID ON [${flyway:defaultSchema}].[ContentSource] ([VectorIndexID]);

/* SQL text to update entity field related entity name field map for entity field ID 045043FD-61A9-477F-82A7-72A7FC615A3C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='045043FD-61A9-477F-82A7-72A7FC615A3C', @RelatedEntityNameFieldMap='EmbeddingModel'

/* Index for Foreign Keys for ContentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_AIModelID ON [${flyway:defaultSchema}].[ContentType] ([AIModelID]);

-- Index for foreign key EmbeddingModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentType] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID ON [${flyway:defaultSchema}].[ContentType] ([VectorIndexID]);

/* SQL text to update entity field related entity name field map for entity field ID 0706EBD4-7D99-4F16-99DF-0E398E319AA3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0706EBD4-7D99-4F16-99DF-0E398E319AA3', @RelatedEntityNameFieldMap='EmbeddingModel'

/* SQL text to update entity field related entity name field map for entity field ID 93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4', @RelatedEntityNameFieldMap='VectorIndex'

/* SQL text to update entity field related entity name field map for entity field ID 11091434-73BD-4006-8C65-8639EA9AF1F3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='11091434-73BD-4006-8C65-8639EA9AF1F3', @RelatedEntityNameFieldMap='VectorIndex'

/* Base View SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [ID],
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = @Name,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [URL] = @URL,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]



/* Base View SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentTypes]
AS
SELECT
    c.*,
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[ContentType] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [c].[AIModelID] = MJAIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spCreateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [ID],
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spUpdateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [AIModelID] = @AIModelID,
        [MinTags] = @MinTags,
        [MaxTags] = @MaxTags,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentType
ON [${flyway:defaultSchema}].[ContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12de0fa4-7538-42be-9c11-7638b15b2d78' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModel')) BEGIN
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
            '12de0fa4-7538-42be-9c11-7638b15b2d78',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100027,
            'EmbeddingModel',
            'Embedding Model',
            NULL,
            'nvarchar',
            100,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ca2dc63-66ec-405b-9974-81fd5129b693' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'VectorIndex')) BEGIN
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
            '9ca2dc63-66ec-405b-9974-81fd5129b693',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100028,
            'VectorIndex',
            'Vector Index',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baab3cb5-accb-4594-bc69-8031edbf0aa7' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModel')) BEGIN
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
            'baab3cb5-accb-4594-bc69-8031edbf0aa7',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100023,
            'EmbeddingModel',
            'Embedding Model',
            NULL,
            'nvarchar',
            100,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c4fec28-2617-418e-b476-09722b4a0858' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'VectorIndex')) BEGIN
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
            '3c4fec28-2617-418e-b476-09722b4a0858',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100024,
            'VectorIndex',
            'Vector Index',
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
               WHERE ID = 'BFB7433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'BFB7433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FBB09B21-50A3-4CCE-A114-44B0C9835251'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3C4FEC28-2617-418E-B476-09722B4A0858'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4FB8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3C4FEC28-2617-418E-B476-09722B4A0858'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Classification',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Classification',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'BFB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Index',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e301296b-555a-45d5-825e-6dee281dd0de', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"AI & Indexing":{"icon":"fa fa-robot","description":"Configuration for AI embedding models and vector search indexing specific to this content source."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"AI & Indexing":"fa fa-robot","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Content Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MinTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tagging Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Tags',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MaxTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tagging Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Maximum Tags',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Model Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Model Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Model Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Model Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Index Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4FEC28-2617-418E-B476-09722B4A0858' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Model Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Index',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6DB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('39d88c22-f56a-4d0e-9358-4cf77816a116', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Content Type Details":{"icon":"fa fa-file-alt","description":"Basic identification and descriptive information for the content type"},"Tagging Rules":{"icon":"fa fa-tags","description":"Constraints and requirements for tag application on content of this type"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Content Type Details":"fa fa-file-alt","Tagging Rules":"fa fa-tags","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

