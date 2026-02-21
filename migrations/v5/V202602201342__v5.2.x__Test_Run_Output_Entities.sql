/**************************************************************************************************
 * Migration: Test Run Output Entities
 *
 * Purpose: Create two new generic entities for storing structured, sequenced outputs from test runs.
 * Any test type can use these for output storage (screenshots, logs, data, video, audio, etc.).
 *
 * Entities created:
 *   1. MJ: Test Run Output Types - Lookup table for output categories
 *   2. MJ: Test Run Outputs - Individual output artifacts from test runs
 *
 * Version: 4.4.x
 **************************************************************************************************/

-- ============================================================================
-- 1. TestRunOutputType (MJ: Test Run Output Types)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutputType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutputType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_TestRunOutputType_Name] UNIQUE ([Name])
);
GO

-- Extended properties for TestRunOutputType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of what this output type represents and when it is used', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ============================================================================
-- 2. TestRunOutput (MJ: Test Run Outputs)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutput] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TestRunID] UNIQUEIDENTIFIER NOT NULL,
    [OutputTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [StepNumber] INT NULL,
    [Name] NVARCHAR(255) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MimeType] NVARCHAR(100) NULL,
    [InlineData] NVARCHAR(MAX) NULL,
    [FileSizeBytes] INT NULL,
    [Width] INT NULL,
    [Height] INT NULL,
    [DurationSeconds] DECIMAL(10, 3) NULL,
    [Metadata] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutput] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_TestRunOutput_TestRun] FOREIGN KEY ([TestRunID])
        REFERENCES ${flyway:defaultSchema}.[TestRun]([ID]),
    CONSTRAINT [FK_TestRunOutput_OutputType] FOREIGN KEY ([OutputTypeID])
        REFERENCES ${flyway:defaultSchema}.[TestRunOutputType]([ID])
);
GO

-- Extended properties for TestRunOutput
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the parent test run that produced this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'TestRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the output type category (Screenshot, Log, Video, etc.)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'OutputTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Chronological ordering for storyboarding outputs across steps', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which step produced this output, for step-based tests like Computer Use', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'StepNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable label for this output (e.g., Step 3 Screenshot)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Additional context about this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MIME type of the output data (e.g., image/png, text/plain, application/json, video/mp4)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'MimeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'InlineData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Size of the output data in bytes', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'FileSizeBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Width in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Width';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Height in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Height';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Duration in seconds for audio or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'DurationSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Metadata';
GO

-- ============================================================================
-- 3. Seed TestRunOutputType rows
-- ============================================================================
INSERT INTO ${flyway:defaultSchema}.[TestRunOutputType] ([ID], [Name], [Description])
VALUES
    ('A1B2C3D4-E5F6-7890-ABCD-100000000001', 'Screenshot', 'Image capture at a point in time'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000002', 'Log', 'Text log output'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000003', 'Data', 'Structured JSON data'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000004', 'HTML', 'HTML content'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000005', 'Video', 'Video recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000006', 'Audio', 'Audio recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000007', 'File', 'Generic file output');
GO




























































































/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25) = NULL,
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25),
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status,
        [DisplayName] = @DisplayName,
        [AllowMultipleSubtypes] = @AllowMultipleSubtypes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '564D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Generated Validation Functions for MJ: Open Apps */
-- CHECK constraint for MJ: Open Apps: Field: Name was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '(NOT [Name] like ''%[^a-z0-9-]%'')', 'public ValidateNameAllowedCharacters(result: ValidationResult) {
	if (this.Name != null) {
		// Regex matches strings containing only lowercase letters, numbers, and hyphens
		const allowedPattern = /^[a-z0-9-]*$/;
		if (!allowedPattern.test(this.Name)) {
			result.Errors.push(new ValidationErrorInfo(
				"Name",
				"The Name field can only contain lowercase letters, numbers, and hyphens.",
				this.Name,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The name must only contain lowercase letters, numbers, and hyphens to ensure it remains a valid system identifier.', 'ValidateNameAllowedCharacters', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46');
  
            

