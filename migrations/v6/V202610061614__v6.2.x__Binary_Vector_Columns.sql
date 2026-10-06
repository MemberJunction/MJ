-- =============================================================================
-- Binary companions for every persisted embedding vector
-- =============================================================================
-- Embeddings are stored as JSON text today (e.g. EntityRecordDocument.VectorJSON), which every
-- index load must parse number by number — about 4.4 s for 20,000 × 1,536 vectors — and which
-- takes 3–5× the space of the raw values. Each embedding column gets a VARBINARY(MAX) companion
-- holding the same vector as little-endian IEEE-754 float32 bytes (4 bytes per dimension, no
-- header; the dimension count is DATALENGTH / 4).
--
-- The JSON columns are kept: existing rows keep working, readers fall back to them when the
-- binary column is NULL (so no backfill is needed — the next embedding of each record fills it),
-- and dropping them would break the publish-no-break policy.
--
-- Writers set both columns. Readers prefer the binary column. In a BaseEntity, and over GraphQL,
-- a binary value is a base64 string; the database providers convert at the database boundary.
--
-- The views select the base tables with `*`, so they are refreshed after the ALTERs; the
-- repeatable R__RefreshMetadata script then recompiles views and renumbers EntityField sequences.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityRecordDocument] ADD
    [VectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of VectorJSON. Written alongside VectorJSON by vector sync; readers prefer it and fall back to VectorJSON when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityRecordDocument',
    @level2type = N'COLUMN', @level2name = N'VectorBinary';
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentNote] ADD
    [EmbeddingVectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The note embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVectorBinary';
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentExample] ADD
    [EmbeddingVectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The example embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentExample',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVectorBinary';
GO

ALTER TABLE [${flyway:defaultSchema}].[Query] ADD
    [EmbeddingVectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The query embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVectorBinary';
GO

ALTER TABLE [${flyway:defaultSchema}].[Tag] ADD
    [EmbeddingVectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The tag embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVectorBinary';
GO

ALTER TABLE [${flyway:defaultSchema}].[Component] ADD
    [FunctionalRequirementsVectorBinary] VARBINARY(MAX) NULL,
    [TechnicalDesignVectorBinary] VARBINARY(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The functional-requirements embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of FunctionalRequirementsVector. Written alongside FunctionalRequirementsVector; readers prefer it and fall back to FunctionalRequirementsVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'FunctionalRequirementsVectorBinary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The technical-design embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of TechnicalDesignVector. Written alongside TechnicalDesignVector; readers prefer it and fall back to TechnicalDesignVector when it is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'TechnicalDesignVectorBinary';
GO

-- Pick up the new columns in the views that select the base tables with `*`.
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntityRecordDocuments]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwAIAgentNotes]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwAIAgentExamples]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwQueries]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwTags]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwComponents]';
GO






















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
-- Everything below this banner is CodeGen output: the EntityField rows for the new columns,
-- and the regenerated spCreate/spUpdate procedures (with their permissions and the
-- __mj_UpdatedAt trigger) for the six entities, plus MJ: AI Result Cache, whose existing
-- varbinary parameter CodeGen now declares as varbinary(MAX) instead of varbinary (which T-SQL
-- reads as varbinary(1) and truncates every value to one byte).
--
-- It was produced by CodeGen's SQL Server generator (SQLServerCodeGenProvider) from the entity
-- metadata of a database built from this migration chain. To refresh it, run
-- `mj codegen --skipfiles` against a clean database and replace this whole section.
-- =============================================================================

/* SQL text to insert 7 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2624541-4a9a-461b-bcc4-ee5c1e870baf' OR (EntityID = '21248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'VectorBinary')) BEGIN
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
            'e2624541-4a9a-461b-bcc4-ee5c1e870baf',
            '21248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Record Documents
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '21248F34-2837-EF11-86D4-6045BDEE16E6'),
            'VectorBinary',
            'Vector Binary',
            'The embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of VectorJSON. Written alongside VectorJSON by vector sync; readers prefer it and fall back to VectorJSON when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0670bf39-1c81-4501-b517-50a5c3a79ec1' OR (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'EmbeddingVectorBinary')) BEGIN
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
            '0670bf39-1c81-4501-b517-50a5c3a79ec1',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: MJ: AI Agent Notes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A24EF5EC-D32C-4A53-85A9-364E322451E6'),
            'EmbeddingVectorBinary',
            'Embedding Vector Binary',
            'The note embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edc9e7eb-1a9e-4728-aba4-32d150d3f6ae' OR (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'EmbeddingVectorBinary')) BEGIN
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
            'edc9e7eb-1a9e-4728-aba4-32d150d3f6ae',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3A139346-CC48-479A-A53B-8892664F5DFD'),
            'EmbeddingVectorBinary',
            'Embedding Vector Binary',
            'The example embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b88ef2f6-711f-4081-9ebc-3562be686115' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddingVectorBinary')) BEGIN
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
            'b88ef2f6-711f-4081-9ebc-3562be686115',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6'),
            'EmbeddingVectorBinary',
            'Embedding Vector Binary',
            'The query embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09d952c6-9a1c-4752-a76f-54ebdd8c9839' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddingVectorBinary')) BEGIN
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
            '09d952c6-9a1c-4752-a76f-54ebdd8c9839',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0C248F34-2837-EF11-86D4-6045BDEE16E6'),
            'EmbeddingVectorBinary',
            'Embedding Vector Binary',
            'The tag embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of EmbeddingVector. Written alongside EmbeddingVector; readers prefer it and fall back to EmbeddingVector when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f87bb61-779c-4c38-ad2e-563d953d8b54' OR (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'FunctionalRequirementsVectorBinary')) BEGIN
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
            '9f87bb61-779c-4c38-ad2e-563d953d8b54',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0FB98A1D-C6AE-4427-B66C-7B31E669756F'),
            'FunctionalRequirementsVectorBinary',
            'Functional Requirements Vector Binary',
            'The functional-requirements embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of FunctionalRequirementsVector. Written alongside FunctionalRequirementsVector; readers prefer it and fall back to FunctionalRequirementsVector when it is NULL.',
            'varbinary',
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
      END


      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52c86f71-cccb-4ac9-a175-103d9adb2a2f' OR (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'TechnicalDesignVectorBinary')) BEGIN
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
            '52c86f71-cccb-4ac9-a175-103d9adb2a2f',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0FB98A1D-C6AE-4427-B66C-7B31E669756F'),
            'TechnicalDesignVectorBinary',
            'Technical Design Vector Binary',
            'The technical-design embedding as little-endian IEEE-754 float32 bytes (4 bytes per dimension): the compact form of TechnicalDesignVector. Written alongside TechnicalDesignVector; readers prefer it and fall back to TechnicalDesignVector when it is NULL.',
            'varbinary',
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
      END

/* spCreate SQL for MJ: Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Record Documents
-- Item: spCreateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRecordDocument]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EntityDocumentID uniqueidentifier,
    @DocumentText_Clear bit = 0,
    @DocumentText nvarchar(MAX) = NULL,
    @VectorIndexID uniqueidentifier,
    @VectorID_Clear bit = 0,
    @VectorID nvarchar(50) = NULL,
    @VectorJSON_Clear bit = 0,
    @VectorJSON nvarchar(MAX) = NULL,
    @EntityRecordUpdatedAt datetimeoffset,
    @VectorBinary_Clear bit = 0,
    @VectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [ID],
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt],
                [VectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                CASE WHEN @DocumentText_Clear = 1 THEN NULL ELSE ISNULL(@DocumentText, NULL) END,
                @VectorIndexID,
                CASE WHEN @VectorID_Clear = 1 THEN NULL ELSE ISNULL(@VectorID, NULL) END,
                CASE WHEN @VectorJSON_Clear = 1 THEN NULL ELSE ISNULL(@VectorJSON, NULL) END,
                @EntityRecordUpdatedAt,
                CASE WHEN @VectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@VectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRecordDocument]
            (
                [EntityID],
                [RecordID],
                [EntityDocumentID],
                [DocumentText],
                [VectorIndexID],
                [VectorID],
                [VectorJSON],
                [EntityRecordUpdatedAt],
                [VectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @EntityDocumentID,
                CASE WHEN @DocumentText_Clear = 1 THEN NULL ELSE ISNULL(@DocumentText, NULL) END,
                @VectorIndexID,
                CASE WHEN @VectorID_Clear = 1 THEN NULL ELSE ISNULL(@VectorID, NULL) END,
                CASE WHEN @VectorJSON_Clear = 1 THEN NULL ELSE ISNULL(@VectorJSON, NULL) END,
                @EntityRecordUpdatedAt,
                CASE WHEN @VectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@VectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
    

/* spUpdate SQL for MJ: Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Record Documents
-- Item: spUpdateEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRecordDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRecordDocument]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @EntityDocumentID uniqueidentifier = NULL,
    @DocumentText_Clear bit = 0,
    @DocumentText nvarchar(MAX) = NULL,
    @VectorIndexID uniqueidentifier = NULL,
    @VectorID_Clear bit = 0,
    @VectorID nvarchar(50) = NULL,
    @VectorJSON_Clear bit = 0,
    @VectorJSON nvarchar(MAX) = NULL,
    @EntityRecordUpdatedAt datetimeoffset = NULL,
    @VectorBinary_Clear bit = 0,
    @VectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [EntityDocumentID] = ISNULL(@EntityDocumentID, [EntityDocumentID]),
        [DocumentText] = CASE WHEN @DocumentText_Clear = 1 THEN NULL ELSE ISNULL(@DocumentText, [DocumentText]) END,
        [VectorIndexID] = ISNULL(@VectorIndexID, [VectorIndexID]),
        [VectorID] = CASE WHEN @VectorID_Clear = 1 THEN NULL ELSE ISNULL(@VectorID, [VectorID]) END,
        [VectorJSON] = CASE WHEN @VectorJSON_Clear = 1 THEN NULL ELSE ISNULL(@VectorJSON, [VectorJSON]) END,
        [EntityRecordUpdatedAt] = ISNULL(@EntityRecordUpdatedAt, [EntityRecordUpdatedAt]),
        [VectorBinary] = CASE WHEN @VectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@VectorBinary, [VectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRecordDocuments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRecordDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRecordDocument] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRecordDocument]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRecordDocument];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRecordDocument
ON [${flyway:defaultSchema}].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRecordDocument]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRecordDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @ID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL,
    @AuthorType nvarchar(20) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [ID],
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore],
                [AuthorType],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END,
                ISNULL(@AuthorType, 'MemoryManager'),
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore],
                [AuthorType],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END,
                ISNULL(@AuthorType, 'MemoryManager'),
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
    

/* spUpdate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL,
    @AuthorType nvarchar(20) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [AgentNoteTypeID] = CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, [AgentNoteTypeID]) END,
        [Note] = CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, [Note]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Type] = ISNULL(@Type, [Type]),
        [IsAutoGenerated] = ISNULL(@IsAutoGenerated, [IsAutoGenerated]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SourceConversationID] = CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, [SourceConversationID]) END,
        [SourceConversationDetailID] = CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, [SourceConversationDetailID]) END,
        [SourceAIAgentRunID] = CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, [SourceAIAgentRunID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [ConsolidatedIntoNoteID] = CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, [ConsolidatedIntoNoteID]) END,
        [ConsolidationCount] = ISNULL(@ConsolidationCount, [ConsolidationCount]),
        [DerivedFromNoteIDs] = CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, [DerivedFromNoteIDs]) END,
        [ProtectionTier] = ISNULL(@ProtectionTier, [ProtectionTier]),
        [ImportanceScore] = CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, [ImportanceScore]) END,
        [AuthorType] = ISNULL(@AuthorType, [AuthorType]),
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentNote]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentNote];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @ExampleInput nvarchar(MAX),
    @ExampleOutput nvarchar(MAX),
    @IsAutoGenerated bit = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @SuccessScore_Clear bit = 0,
    @SuccessScore decimal(5, 2) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [ID],
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentExample] TO [cdp_Developer], [cdp_Integration]
    

/* spUpdate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @ExampleInput nvarchar(MAX) = NULL,
    @ExampleOutput nvarchar(MAX) = NULL,
    @IsAutoGenerated bit = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @SuccessScore_Clear bit = 0,
    @SuccessScore decimal(5, 2) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [Type] = ISNULL(@Type, [Type]),
        [ExampleInput] = ISNULL(@ExampleInput, [ExampleInput]),
        [ExampleOutput] = ISNULL(@ExampleOutput, [ExampleOutput]),
        [IsAutoGenerated] = ISNULL(@IsAutoGenerated, [IsAutoGenerated]),
        [SourceConversationID] = CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, [SourceConversationID]) END,
        [SourceConversationDetailID] = CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, [SourceConversationDetailID]) END,
        [SourceAIAgentRunID] = CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, [SourceAIAgentRunID]) END,
        [SuccessScore] = CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, [SuccessScore]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentExamples]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentExample] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentExample]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentExample];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentExample
ON [${flyway:defaultSchema}].[AIAgentExample]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentExample] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [UserQuestion] = CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, [UserQuestion]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SQL] = CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, [SQL]) END,
        [TechnicalDescription] = CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, [TechnicalDescription]) END,
        [OriginalSQL] = CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, [OriginalSQL]) END,
        [Feedback] = CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, [Feedback]) END,
        [Status] = ISNULL(@Status, [Status]),
        [QualityRank] = CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, [QualityRank]) END,
        [ExecutionCostRank] = CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, [ExecutionCostRank]) END,
        [UsesTemplate] = CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, [UsesTemplate]) END,
        [AuditQueryRuns] = ISNULL(@AuditQueryRuns, [AuditQueryRuns]),
        [CacheEnabled] = ISNULL(@CacheEnabled, [CacheEnabled]),
        [CacheTTLMinutes] = CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, [CacheTTLMinutes]) END,
        [CacheMaxSize] = CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, [CacheMaxSize]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [CacheValidationSQL] = CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, [CacheValidationSQL]) END,
        [SQLDialectID] = ISNULL(@SQLDialectID, [SQLDialectID]),
        [Reusable] = ISNULL(@Reusable, [Reusable]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [IsMaterialized] = ISNULL(@IsMaterialized, [IsMaterialized]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spCreateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTag]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @MergedIntoTagID_Clear bit = 0,
    @MergedIntoTagID uniqueidentifier = NULL,
    @IsGlobal bit = NULL,
    @AllowAutoGrow bit = NULL,
    @IsFrozen bit = NULL,
    @MaxChildren_Clear bit = 0,
    @MaxChildren int = NULL,
    @MaxDescendantDepth_Clear bit = 0,
    @MaxDescendantDepth int = NULL,
    @MinWeight_Clear bit = 0,
    @MinWeight decimal(3, 2) = NULL,
    @RequiresReview bit = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [ID],
                [Name],
                [ParentID],
                [DisplayName],
                [Description],
                [Status],
                [MergedIntoTagID],
                [IsGlobal],
                [AllowAutoGrow],
                [IsFrozen],
                [MaxChildren],
                [MaxDescendantDepth],
                [MinWeight],
                [RequiresReview],
                [EmbeddingVector],
                [EmbeddingModelID],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @MergedIntoTagID_Clear = 1 THEN NULL ELSE ISNULL(@MergedIntoTagID, NULL) END,
                ISNULL(@IsGlobal, 1),
                ISNULL(@AllowAutoGrow, 1),
                ISNULL(@IsFrozen, 0),
                CASE WHEN @MaxChildren_Clear = 1 THEN NULL ELSE ISNULL(@MaxChildren, NULL) END,
                CASE WHEN @MaxDescendantDepth_Clear = 1 THEN NULL ELSE ISNULL(@MaxDescendantDepth, NULL) END,
                CASE WHEN @MinWeight_Clear = 1 THEN NULL ELSE ISNULL(@MinWeight, NULL) END,
                ISNULL(@RequiresReview, 0),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [Name],
                [ParentID],
                [DisplayName],
                [Description],
                [Status],
                [MergedIntoTagID],
                [IsGlobal],
                [AllowAutoGrow],
                [IsFrozen],
                [MaxChildren],
                [MaxDescendantDepth],
                [MinWeight],
                [RequiresReview],
                [EmbeddingVector],
                [EmbeddingModelID],
                [EmbeddingVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @DisplayName,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @MergedIntoTagID_Clear = 1 THEN NULL ELSE ISNULL(@MergedIntoTagID, NULL) END,
                ISNULL(@IsGlobal, 1),
                ISNULL(@AllowAutoGrow, 1),
                ISNULL(@IsFrozen, 0),
                CASE WHEN @MaxChildren_Clear = 1 THEN NULL ELSE ISNULL(@MaxChildren, NULL) END,
                CASE WHEN @MaxDescendantDepth_Clear = 1 THEN NULL ELSE ISNULL(@MaxDescendantDepth, NULL) END,
                CASE WHEN @MinWeight_Clear = 1 THEN NULL ELSE ISNULL(@MinWeight, NULL) END,
                ISNULL(@RequiresReview, 0),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTag] TO [cdp_UI]
    

/* spUpdate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spUpdateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTag]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @MergedIntoTagID_Clear bit = 0,
    @MergedIntoTagID uniqueidentifier = NULL,
    @IsGlobal bit = NULL,
    @AllowAutoGrow bit = NULL,
    @IsFrozen bit = NULL,
    @MaxChildren_Clear bit = 0,
    @MaxChildren int = NULL,
    @MaxDescendantDepth_Clear bit = 0,
    @MaxDescendantDepth int = NULL,
    @MinWeight_Clear bit = 0,
    @MinWeight decimal(3, 2) = NULL,
    @RequiresReview bit = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [DisplayName] = ISNULL(@DisplayName, [DisplayName]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Status] = ISNULL(@Status, [Status]),
        [MergedIntoTagID] = CASE WHEN @MergedIntoTagID_Clear = 1 THEN NULL ELSE ISNULL(@MergedIntoTagID, [MergedIntoTagID]) END,
        [IsGlobal] = ISNULL(@IsGlobal, [IsGlobal]),
        [AllowAutoGrow] = ISNULL(@AllowAutoGrow, [AllowAutoGrow]),
        [IsFrozen] = ISNULL(@IsFrozen, [IsFrozen]),
        [MaxChildren] = CASE WHEN @MaxChildren_Clear = 1 THEN NULL ELSE ISNULL(@MaxChildren, [MaxChildren]) END,
        [MaxDescendantDepth] = CASE WHEN @MaxDescendantDepth_Clear = 1 THEN NULL ELSE ISNULL(@MaxDescendantDepth, [MaxDescendantDepth]) END,
        [MinWeight] = CASE WHEN @MinWeight_Clear = 1 THEN NULL ELSE ISNULL(@MinWeight, [MinWeight]) END,
        [RequiresReview] = ISNULL(@RequiresReview, [RequiresReview]),
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTag] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tag table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTag]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTag];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTag
ON [${flyway:defaultSchema}].[Tag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Tag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spCreateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Component
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponent]
    @ID uniqueidentifier = NULL,
    @Namespace_Clear bit = 0,
    @Namespace nvarchar(MAX) = NULL,
    @Name nvarchar(500),
    @Version nvarchar(50),
    @VersionSequence int = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(1000) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(50) = NULL,
    @DeveloperName_Clear bit = 0,
    @DeveloperName nvarchar(255) = NULL,
    @DeveloperEmail_Clear bit = 0,
    @DeveloperEmail nvarchar(255) = NULL,
    @DeveloperOrganization_Clear bit = 0,
    @DeveloperOrganization nvarchar(255) = NULL,
    @SourceRegistryID_Clear bit = 0,
    @SourceRegistryID uniqueidentifier = NULL,
    @ReplicatedAt_Clear bit = 0,
    @ReplicatedAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @Specification nvarchar(MAX),
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @FunctionalRequirementsVector_Clear bit = 0,
    @FunctionalRequirementsVector nvarchar(MAX) = NULL,
    @TechnicalDesignVector_Clear bit = 0,
    @TechnicalDesignVector nvarchar(MAX) = NULL,
    @HasCustomProps bit = NULL,
    @HasCustomEvents bit = NULL,
    @RequiresData bit = NULL,
    @DependencyCount int = NULL,
    @TechnicalDesignVectorEmbeddingModelID_Clear bit = 0,
    @TechnicalDesignVectorEmbeddingModelID nvarchar(MAX) = NULL,
    @FunctionalRequirementsVectorEmbeddingModelID_Clear bit = 0,
    @FunctionalRequirementsVectorEmbeddingModelID nvarchar(MAX) = NULL,
    @HasRequiredCustomProps bit = NULL,
    @FunctionalRequirementsVectorBinary_Clear bit = 0,
    @FunctionalRequirementsVectorBinary varbinary(MAX) = NULL,
    @TechnicalDesignVectorBinary_Clear bit = 0,
    @TechnicalDesignVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [ID],
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt],
                [Specification],
                [FunctionalRequirements],
                [TechnicalDesign],
                [FunctionalRequirementsVector],
                [TechnicalDesignVector],
                [HasCustomProps],
                [HasCustomEvents],
                [RequiresData],
                [DependencyCount],
                [TechnicalDesignVectorEmbeddingModelID],
                [FunctionalRequirementsVectorEmbeddingModelID],
                [HasRequiredCustomProps],
                [FunctionalRequirementsVectorBinary],
                [TechnicalDesignVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Namespace_Clear = 1 THEN NULL ELSE ISNULL(@Namespace, NULL) END,
                @Name,
                @Version,
                ISNULL(@VersionSequence, 0),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, NULL) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @DeveloperName_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperName, NULL) END,
                CASE WHEN @DeveloperEmail_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperEmail, NULL) END,
                CASE WHEN @DeveloperOrganization_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperOrganization, NULL) END,
                CASE WHEN @SourceRegistryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRegistryID, NULL) END,
                CASE WHEN @ReplicatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplicatedAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                @Specification,
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                CASE WHEN @FunctionalRequirementsVector_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVector, NULL) END,
                CASE WHEN @TechnicalDesignVector_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVector, NULL) END,
                ISNULL(@HasCustomProps, 0),
                ISNULL(@HasCustomEvents, 0),
                ISNULL(@RequiresData, 0),
                ISNULL(@DependencyCount, 0),
                CASE WHEN @TechnicalDesignVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorEmbeddingModelID, NULL) END,
                CASE WHEN @FunctionalRequirementsVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorEmbeddingModelID, NULL) END,
                ISNULL(@HasRequiredCustomProps, 0),
                CASE WHEN @FunctionalRequirementsVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorBinary, NULL) END,
                CASE WHEN @TechnicalDesignVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorBinary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt],
                [Specification],
                [FunctionalRequirements],
                [TechnicalDesign],
                [FunctionalRequirementsVector],
                [TechnicalDesignVector],
                [HasCustomProps],
                [HasCustomEvents],
                [RequiresData],
                [DependencyCount],
                [TechnicalDesignVectorEmbeddingModelID],
                [FunctionalRequirementsVectorEmbeddingModelID],
                [HasRequiredCustomProps],
                [FunctionalRequirementsVectorBinary],
                [TechnicalDesignVectorBinary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Namespace_Clear = 1 THEN NULL ELSE ISNULL(@Namespace, NULL) END,
                @Name,
                @Version,
                ISNULL(@VersionSequence, 0),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, NULL) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @DeveloperName_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperName, NULL) END,
                CASE WHEN @DeveloperEmail_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperEmail, NULL) END,
                CASE WHEN @DeveloperOrganization_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperOrganization, NULL) END,
                CASE WHEN @SourceRegistryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRegistryID, NULL) END,
                CASE WHEN @ReplicatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplicatedAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                @Specification,
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                CASE WHEN @FunctionalRequirementsVector_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVector, NULL) END,
                CASE WHEN @TechnicalDesignVector_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVector, NULL) END,
                ISNULL(@HasCustomProps, 0),
                ISNULL(@HasCustomEvents, 0),
                ISNULL(@RequiresData, 0),
                ISNULL(@DependencyCount, 0),
                CASE WHEN @TechnicalDesignVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorEmbeddingModelID, NULL) END,
                CASE WHEN @FunctionalRequirementsVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorEmbeddingModelID, NULL) END,
                ISNULL(@HasRequiredCustomProps, 0),
                CASE WHEN @FunctionalRequirementsVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorBinary, NULL) END,
                CASE WHEN @TechnicalDesignVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorBinary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponent] TO [cdp_Developer], [cdp_Integration]
    

/* spUpdate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spUpdateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Component
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponent]
    @ID uniqueidentifier,
    @Namespace_Clear bit = 0,
    @Namespace nvarchar(MAX) = NULL,
    @Name nvarchar(500) = NULL,
    @Version nvarchar(50) = NULL,
    @VersionSequence int = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(1000) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(50) = NULL,
    @DeveloperName_Clear bit = 0,
    @DeveloperName nvarchar(255) = NULL,
    @DeveloperEmail_Clear bit = 0,
    @DeveloperEmail nvarchar(255) = NULL,
    @DeveloperOrganization_Clear bit = 0,
    @DeveloperOrganization nvarchar(255) = NULL,
    @SourceRegistryID_Clear bit = 0,
    @SourceRegistryID uniqueidentifier = NULL,
    @ReplicatedAt_Clear bit = 0,
    @ReplicatedAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @Specification nvarchar(MAX) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @FunctionalRequirementsVector_Clear bit = 0,
    @FunctionalRequirementsVector nvarchar(MAX) = NULL,
    @TechnicalDesignVector_Clear bit = 0,
    @TechnicalDesignVector nvarchar(MAX) = NULL,
    @HasCustomProps bit = NULL,
    @HasCustomEvents bit = NULL,
    @RequiresData bit = NULL,
    @DependencyCount int = NULL,
    @TechnicalDesignVectorEmbeddingModelID_Clear bit = 0,
    @TechnicalDesignVectorEmbeddingModelID nvarchar(MAX) = NULL,
    @FunctionalRequirementsVectorEmbeddingModelID_Clear bit = 0,
    @FunctionalRequirementsVectorEmbeddingModelID nvarchar(MAX) = NULL,
    @HasRequiredCustomProps bit = NULL,
    @FunctionalRequirementsVectorBinary_Clear bit = 0,
    @FunctionalRequirementsVectorBinary varbinary(MAX) = NULL,
    @TechnicalDesignVectorBinary_Clear bit = 0,
    @TechnicalDesignVectorBinary varbinary(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        [Namespace] = CASE WHEN @Namespace_Clear = 1 THEN NULL ELSE ISNULL(@Namespace, [Namespace]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Version] = ISNULL(@Version, [Version]),
        [VersionSequence] = ISNULL(@VersionSequence, [VersionSequence]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Type] = CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, [Type]) END,
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [DeveloperName] = CASE WHEN @DeveloperName_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperName, [DeveloperName]) END,
        [DeveloperEmail] = CASE WHEN @DeveloperEmail_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperEmail, [DeveloperEmail]) END,
        [DeveloperOrganization] = CASE WHEN @DeveloperOrganization_Clear = 1 THEN NULL ELSE ISNULL(@DeveloperOrganization, [DeveloperOrganization]) END,
        [SourceRegistryID] = CASE WHEN @SourceRegistryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRegistryID, [SourceRegistryID]) END,
        [ReplicatedAt] = CASE WHEN @ReplicatedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplicatedAt, [ReplicatedAt]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [Specification] = ISNULL(@Specification, [Specification]),
        [FunctionalRequirements] = CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, [FunctionalRequirements]) END,
        [TechnicalDesign] = CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, [TechnicalDesign]) END,
        [FunctionalRequirementsVector] = CASE WHEN @FunctionalRequirementsVector_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVector, [FunctionalRequirementsVector]) END,
        [TechnicalDesignVector] = CASE WHEN @TechnicalDesignVector_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVector, [TechnicalDesignVector]) END,
        [HasCustomProps] = ISNULL(@HasCustomProps, [HasCustomProps]),
        [HasCustomEvents] = ISNULL(@HasCustomEvents, [HasCustomEvents]),
        [RequiresData] = ISNULL(@RequiresData, [RequiresData]),
        [DependencyCount] = ISNULL(@DependencyCount, [DependencyCount]),
        [TechnicalDesignVectorEmbeddingModelID] = CASE WHEN @TechnicalDesignVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorEmbeddingModelID, [TechnicalDesignVectorEmbeddingModelID]) END,
        [FunctionalRequirementsVectorEmbeddingModelID] = CASE WHEN @FunctionalRequirementsVectorEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorEmbeddingModelID, [FunctionalRequirementsVectorEmbeddingModelID]) END,
        [HasRequiredCustomProps] = ISNULL(@HasRequiredCustomProps, [HasRequiredCustomProps]),
        [FunctionalRequirementsVectorBinary] = CASE WHEN @FunctionalRequirementsVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirementsVectorBinary, [FunctionalRequirementsVectorBinary]) END,
        [TechnicalDesignVectorBinary] = CASE WHEN @TechnicalDesignVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesignVectorBinary, [TechnicalDesignVectorBinary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Component table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateComponent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateComponent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponent
ON [${flyway:defaultSchema}].[Component]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Component] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spCreate SQL for MJ: AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Result Cache
-- Item: spCreateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIResultCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache]
    @ID uniqueidentifier = NULL,
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText_Clear bit = 0,
    @ResultText nvarchar(MAX) = NULL,
    @Status nvarchar(50),
    @ExpiredOn_Clear bit = 0,
    @ExpiredOn datetimeoffset = NULL,
    @VendorID_Clear bit = 0,
    @VendorID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @PromptEmbedding_Clear bit = 0,
    @PromptEmbedding varbinary(MAX) = NULL,
    @PromptRunID_Clear bit = 0,
    @PromptRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIResultCache]
            (
                [ID],
                [AIPromptID],
                [AIModelID],
                [RunAt],
                [PromptText],
                [ResultText],
                [Status],
                [ExpiredOn],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [PromptEmbedding],
                [PromptRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AIPromptID,
                @AIModelID,
                @RunAt,
                @PromptText,
                CASE WHEN @ResultText_Clear = 1 THEN NULL ELSE ISNULL(@ResultText, NULL) END,
                @Status,
                CASE WHEN @ExpiredOn_Clear = 1 THEN NULL ELSE ISNULL(@ExpiredOn, NULL) END,
                CASE WHEN @VendorID_Clear = 1 THEN NULL ELSE ISNULL(@VendorID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @PromptEmbedding_Clear = 1 THEN NULL ELSE ISNULL(@PromptEmbedding, NULL) END,
                CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIResultCache]
            (
                [AIPromptID],
                [AIModelID],
                [RunAt],
                [PromptText],
                [ResultText],
                [Status],
                [ExpiredOn],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [PromptEmbedding],
                [PromptRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AIPromptID,
                @AIModelID,
                @RunAt,
                @PromptText,
                CASE WHEN @ResultText_Clear = 1 THEN NULL ELSE ISNULL(@ResultText, NULL) END,
                @Status,
                CASE WHEN @ExpiredOn_Clear = 1 THEN NULL ELSE ISNULL(@ExpiredOn, NULL) END,
                CASE WHEN @VendorID_Clear = 1 THEN NULL ELSE ISNULL(@VendorID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @PromptEmbedding_Clear = 1 THEN NULL ELSE ISNULL(@PromptEmbedding, NULL) END,
                CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spUpdate SQL for MJ: AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Result Cache
-- Item: spUpdateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIResultCache]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache]
    @ID uniqueidentifier,
    @AIPromptID uniqueidentifier = NULL,
    @AIModelID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @PromptText nvarchar(MAX) = NULL,
    @ResultText_Clear bit = 0,
    @ResultText nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @ExpiredOn_Clear bit = 0,
    @ExpiredOn datetimeoffset = NULL,
    @VendorID_Clear bit = 0,
    @VendorID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @PromptEmbedding_Clear bit = 0,
    @PromptEmbedding varbinary(MAX) = NULL,
    @PromptRunID_Clear bit = 0,
    @PromptRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        [AIPromptID] = ISNULL(@AIPromptID, [AIPromptID]),
        [AIModelID] = ISNULL(@AIModelID, [AIModelID]),
        [RunAt] = ISNULL(@RunAt, [RunAt]),
        [PromptText] = ISNULL(@PromptText, [PromptText]),
        [ResultText] = CASE WHEN @ResultText_Clear = 1 THEN NULL ELSE ISNULL(@ResultText, [ResultText]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExpiredOn] = CASE WHEN @ExpiredOn_Clear = 1 THEN NULL ELSE ISNULL(@ExpiredOn, [ExpiredOn]) END,
        [VendorID] = CASE WHEN @VendorID_Clear = 1 THEN NULL ELSE ISNULL(@VendorID, [VendorID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [PromptEmbedding] = CASE WHEN @PromptEmbedding_Clear = 1 THEN NULL ELSE ISNULL(@PromptEmbedding, [PromptEmbedding]) END,
        [PromptRunID] = CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, [PromptRunID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIResultCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIResultCache table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIResultCache]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIResultCache];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIResultCache
ON [${flyway:defaultSchema}].[AIResultCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIResultCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        
