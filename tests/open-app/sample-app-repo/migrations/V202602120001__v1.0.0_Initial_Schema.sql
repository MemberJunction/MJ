-- ============================================================
-- MJ Sample App: Initial Schema (v1.0.0)
--
-- This migration demonstrates a complete Open App setup:
--   1. Schema metadata (SchemaInfo + EntityNamePrefix)
--   2. Table creation
--   3. Base view
--   4. Stored procedures (spCreate, spUpdate, spDelete)
--   5. Entity registration (__mj.Entity)
--   6. Field registration (__mj.EntityField)
-- ============================================================

-- ============================================================
-- 1. SCHEMA METADATA
--    Register the app schema with MJ and set the entity name prefix.
--    The prefix ensures entity names like "Sample App: Sample Records"
--    don't collide with MJ core or other apps.
-- ============================================================
INSERT INTO __mj.SchemaInfo (
    ID,
    SchemaName,
    EntityIDMin,
    EntityIDMax,
    EntityNamePrefix,
    Description
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000001',
    'sample_app',
    10000001,
    10099999,
    'Sample App',
    'MJ Sample Open App - demonstration schema'
)
GO

-- ============================================================
-- 2. CREATE TABLE
--    Note: No __mj_CreatedAt / __mj_UpdatedAt columns (CodeGen adds those).
--    Note: No FK indexes (CodeGen creates IDX_AUTO_MJ_FKEY_* automatically).
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.SampleRecord (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_SampleRecord PRIMARY KEY (ID),
    CONSTRAINT CK_SampleRecord_Status CHECK (Status IN ('Active', 'Inactive', 'Archived'))
)
GO

-- ============================================================
-- 3. BASE VIEW
--    Convention: vw{PluralTableName}
--    Simple table with no FKs, so just SELECT *.
-- ============================================================
CREATE VIEW ${flyway:defaultSchema}.vwSampleRecords
AS
SELECT
    s.*
FROM
    ${flyway:defaultSchema}.SampleRecord AS s
GO

-- ============================================================
-- 4. STORED PROCEDURES
-- ============================================================

-- spCreate: Insert a new record, return from view
CREATE PROCEDURE ${flyway:defaultSchema}.spCreateSampleRecord
    @Name NVARCHAR(200),
    @Description NVARCHAR(MAX),
    @Status NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
        ${flyway:defaultSchema}.SampleRecord (
            [Name],
            [Description],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES (
        @Name,
        @Description,
        @Status
    )

    -- Return the new record from the view
    SELECT * FROM ${flyway:defaultSchema}.vwSampleRecords
    WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO

-- spUpdate: Update an existing record, return from view
CREATE PROCEDURE ${flyway:defaultSchema}.spUpdateSampleRecord
    @ID UNIQUEIDENTIFIER,
    @Name NVARCHAR(200),
    @Description NVARCHAR(MAX),
    @Status NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE ${flyway:defaultSchema}.SampleRecord
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status
    WHERE [ID] = @ID

    -- Return the updated record from the view
    SELECT * FROM ${flyway:defaultSchema}.vwSampleRecords
    WHERE [ID] = @ID
END
GO

-- spDelete: Delete a record
CREATE PROCEDURE ${flyway:defaultSchema}.spDeleteSampleRecord
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM ${flyway:defaultSchema}.SampleRecord
    WHERE [ID] = @ID
END
GO

-- ============================================================
-- 5. ENTITY REGISTRATION
--    Register SampleRecord as an MJ entity so it's visible to
--    Metadata, RunView, entity objects, etc.
--    Uses __mj literally (NOT ${flyway:defaultSchema}).
-- ============================================================
INSERT INTO __mj.Entity (
    ID,
    Name,
    DisplayName,
    Description,
    BaseTable,
    BaseView,
    SchemaName,
    IncludeInAPI,
    AllowUserSearchAPI,
    TrackRecordChanges,
    AuditRecordAccess,
    AuditViewRuns,
    AllowAllRowsAPI,
    AllowCreateAPI,
    AllowUpdateAPI,
    AllowDeleteAPI,
    UserViewMaxRows,
    spCreate,
    spUpdate,
    spDelete
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000010',
    'Sample App: Sample Records',
    'Sample Records',
    'Sample records created by the MJ Sample Open App for testing purposes.',
    'SampleRecord',
    'vwSampleRecords',
    'sample_app',
    1,    -- IncludeInAPI
    1,    -- AllowUserSearchAPI
    1,    -- TrackRecordChanges
    0,    -- AuditRecordAccess
    0,    -- AuditViewRuns
    1,    -- AllowAllRowsAPI
    1,    -- AllowCreateAPI
    1,    -- AllowUpdateAPI
    1,    -- AllowDeleteAPI
    1000, -- UserViewMaxRows
    'spCreateSampleRecord',
    'spUpdateSampleRecord',
    'spDeleteSampleRecord'
)
GO

-- ============================================================
-- 6. ENTITY FIELD REGISTRATION
--    Register each column so MJ knows about the field types,
--    defaults, nullability, etc.
-- ============================================================

-- Field: ID (Primary Key)
INSERT INTO __mj.EntityField (
    ID, EntityID, Sequence, Name, DisplayName, Description,
    Type, Length, Precision, Scale,
    AllowsNull, DefaultValue, AutoIncrement,
    AllowUpdateAPI, IsVirtual,
    RelatedEntityID, RelatedEntityFieldName,
    IsNameField, IncludeInUserSearchAPI,
    IncludeRelatedEntityNameFieldInBaseView,
    DefaultInView, IsPrimaryKey, IsUnique,
    RelatedEntityDisplayType
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000011',
    'E0A00001-0001-0001-0001-E0A000000010',  -- EntityID = SampleRecord entity
    1,
    'ID',
    'ID',
    'Primary key',
    'uniqueidentifier',
    16, 0, 0,
    0,                      -- NOT NULL
    'newsequentialid()',     -- Default
    0,                      -- Not auto-increment
    0,                      -- Cannot update PK
    0,                      -- Not virtual
    NULL, NULL,             -- No FK
    0,                      -- Not the name field
    0,                      -- Not in user search
    0,                      -- No related name in view
    1,                      -- Show in default view
    1,                      -- IS primary key
    1,                      -- IS unique
    'Search'
)
GO

-- Field: Name
INSERT INTO __mj.EntityField (
    ID, EntityID, Sequence, Name, DisplayName, Description,
    Type, Length, Precision, Scale,
    AllowsNull, DefaultValue, AutoIncrement,
    AllowUpdateAPI, IsVirtual,
    RelatedEntityID, RelatedEntityFieldName,
    IsNameField, IncludeInUserSearchAPI,
    IncludeRelatedEntityNameFieldInBaseView,
    DefaultInView, IsPrimaryKey, IsUnique,
    RelatedEntityDisplayType
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000012',
    'E0A00001-0001-0001-0001-E0A000000010',
    2,
    'Name',
    'Name',
    'Display name for the sample record',
    'nvarchar',
    200, 0, 0,
    0,                      -- NOT NULL
    NULL,                   -- No default
    0,
    1,                      -- Can update
    0,
    NULL, NULL,
    1,                      -- IS the name field
    1,                      -- Include in user search
    0,
    1,                      -- Show in default view
    0,                      -- Not PK
    0,                      -- Not unique
    'Search'
)
GO

-- Field: Description
INSERT INTO __mj.EntityField (
    ID, EntityID, Sequence, Name, DisplayName, Description,
    Type, Length, Precision, Scale,
    AllowsNull, DefaultValue, AutoIncrement,
    AllowUpdateAPI, IsVirtual,
    RelatedEntityID, RelatedEntityFieldName,
    IsNameField, IncludeInUserSearchAPI,
    IncludeRelatedEntityNameFieldInBaseView,
    DefaultInView, IsPrimaryKey, IsUnique,
    RelatedEntityDisplayType
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000013',
    'E0A00001-0001-0001-0001-E0A000000010',
    3,
    'Description',
    'Description',
    'Optional description for the sample record',
    'nvarchar',
    -1, 0, 0,              -- -1 = MAX length
    1,                      -- Allows NULL
    NULL,
    0,
    1,                      -- Can update
    0,
    NULL, NULL,
    0,
    0,                      -- Not in user search (it's MAX length)
    0,
    0,                      -- Not shown by default (long text)
    0,
    0,
    'Search'
)
GO

-- Field: Status
INSERT INTO __mj.EntityField (
    ID, EntityID, Sequence, Name, DisplayName, Description,
    Type, Length, Precision, Scale,
    AllowsNull, DefaultValue, AutoIncrement,
    AllowUpdateAPI, IsVirtual,
    RelatedEntityID, RelatedEntityFieldName,
    IsNameField, IncludeInUserSearchAPI,
    IncludeRelatedEntityNameFieldInBaseView,
    DefaultInView, IsPrimaryKey, IsUnique,
    RelatedEntityDisplayType
) VALUES (
    'E0A00001-0001-0001-0001-E0A000000014',
    'E0A00001-0001-0001-0001-E0A000000010',
    4,
    'Status',
    'Status',
    'Record status: Active, Inactive, or Archived',
    'nvarchar',
    50, 0, 0,
    0,                      -- NOT NULL
    '''Active''',           -- Default value (escaped single quotes)
    0,
    1,                      -- Can update
    0,
    NULL, NULL,
    0,
    1,                      -- Include in user search
    0,
    1,                      -- Show in default view
    0,
    0,
    'Search'
)
GO
