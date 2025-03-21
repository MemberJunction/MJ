-- Create the GenerateCodeCategory Table (for categorization)
CREATE TABLE ${flyway:defaultSchema}.GeneratedCodeCategory (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL UNIQUE,
    Description NVARCHAR(MAX) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_GenerateCodeCategory_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.GeneratedCodeCategory(ID)
);

-- CREATE Category for Validators
INSERT INTO ${flyway:defaultSchema}.GeneratedCodeCategory (ID, Name,Description)
VALUES ('EE2D433E-F36B-1410-8D9D-00021F8B792E', 'CodeGen: Validators','Generated Validation Code')


-- Add extended properties for GenerateCodeCategory table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Categorization for generated code, including optional parent-child relationships.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCodeCategory';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Parent category ID, allowing for hierarchical categorization.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCodeCategory',
    @level2type = N'Column', @level2name = 'ParentID';

-- Create the GeneratedCode Table
CREATE TABLE ${flyway:defaultSchema}.GeneratedCode (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    GeneratedAt DATETIMEOFFSET(7) NOT NULL DEFAULT GETUTCDATE(),
    CategoryID UNIQUEIDENTIFIER NOT NULL,
    GeneratedByModelID UNIQUEIDENTIFIER NOT NULL, -- FKey to AIModel
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Code NVARCHAR(MAX) NOT NULL,
    Source NVARCHAR(MAX) NOT NULL,
    LinkedEntityID UNIQUEIDENTIFIER NULL,
    LinkedRecordPrimaryKey NVARCHAR(MAX) NULL,

    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    Language NVARCHAR(50) NOT NULL DEFAULT 'TypeScript',

    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    -- Foreign Key Constraints
    CONSTRAINT FK_GeneratedCode_Category FOREIGN KEY (CategoryID) REFERENCES ${flyway:defaultSchema}.GeneratedCodeCategory(ID),
    CONSTRAINT FK_GeneratedCode_GeneratedByModel FOREIGN KEY (GeneratedByModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),

    -- Check constraint for Status
    CONSTRAINT CHK_GeneratedCode_Status CHECK (Status IN ('Pending', 'Approved', 'Rejected')),

    -- Check constraint for Language
    CONSTRAINT CHK_GeneratedCode_Language CHECK (Language IN ('TypeScript', 'SQL', 'HTML', 'CSS', 'JavaScript', 'Python', 'Other')),

    CONSTRAINT FK_GeneratedCode_LinkedEntity FOREIGN KEY (LinkedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID)
);
GO

-- MIGRATE Legacy MJ code from EntityField into new table
INSERT INTO ${flyway:defaultSchema}.GeneratedCode (
ID, GeneratedAt, CategoryID, GeneratedByModelID,
Name, Description, Code, Source,
LinkedEntityID,
LinkedRecordPrimaryKey,
Status, Language, __mj_CreatedAt, __mj_UpdatedAt
)
(
SELECT ID, __mj_UpdatedAt, 'EE2D433E-F36B-1410-8D9D-00021F8B792E','E6A5CCEC-6A37-EF11-86D4-000D3A4E707E',
GeneratedValidationFunctionName, GeneratedValidationFunctionDescription, GeneratedValidationFunctionCode,GeneratedValidationFunctionCheckConstraint ,
'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- entity fields
ID, -- entity field ID is the linkedprimarykey
'Approved','TypeScript',__mj_UpdatedAt, __mj_UpdatedAt
FROM ${flyway:defaultSchema}.EntityField WHERE GeneratedValidationFunctionCode IS NOT NULL
)
-- now wipe out the legacy columns in the entity field table
UPDATE
    ${flyway:defaultSchema}.EntityField
SET
	GeneratedValidationFunctionName = NULL,
	GeneratedValidationFunctionDescription = NULL,
	GeneratedValidationFunctionCode = NULL,
	GeneratedValidationFunctionCheckConstraint =NULL
WHERE
    GeneratedValidationFunctionCode IS NOT NULL

-- Add extended properties for GeneratedCode table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Stores LLM-generated code snippets, tracking their source, category, and validation status.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode';

-- Document non-key columns in GeneratedCode
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'When the code was generated.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Reference to the category of generated code.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'CategoryID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'AI model responsible for generating this code.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedByModelID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Descriptive name of the generated code.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Optional description of the generated code.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'The actual generated code.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Source material used to generate the code, e.g., a SQL CHECK constraint.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Source';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Status of the generated code, e.g., Pending, Approved, or Rejected.',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = 'Programming language of the generated code (TypeScript, SQL, HTML, CSS, JavaScript, Python, or Other).',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Language';






/**** --------------- GENERATED METADATA FOR THE ABOVE -------------------  ****/
/* SQL generated to create new entity Generated Code Categories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '49770e19-d6d0-485d-a03f-01c39fdfb6d1',
         'Generated Code Categories',
         NULL,
         NULL,
         'GeneratedCodeCategory',
         'vwGeneratedCodeCategories',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new permission for entity Generated Code Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('49770e19-d6d0-485d-a03f-01c39fdfb6d1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Generated Code Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('49770e19-d6d0-485d-a03f-01c39fdfb6d1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Generated Code Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('49770e19-d6d0-485d-a03f-01c39fdfb6d1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Generated Codes */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '99288306-17a6-433d-bd9c-c4ee40df175a',
         'Generated Codes',
         NULL,
         NULL,
         'GeneratedCode',
         'vwGeneratedCodes',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )


/* SQL generated to add new permission for entity Generated Codes for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('99288306-17a6-433d-bd9c-c4ee40df175a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Generated Codes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('99288306-17a6-433d-bd9c-c4ee40df175a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Generated Codes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('99288306-17a6-433d-bd9c-c4ee40df175a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)


/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '4491936c-4698-4395-9c8f-8320ea143af3'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4491936c-4698-4395-9c8f-8320ea143af3',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            1,
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
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'e906784a-401a-4b56-8654-ba495cb30277'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e906784a-401a-4b56-8654-ba495cb30277',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            2,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '139430cd-cff8-4f91-a1ea-783eda9c31af'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '139430cd-cff8-4f91-a1ea-783eda9c31af',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            3,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '538dfea0-694f-4319-9bfa-88d10059040f'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'ParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '538dfea0-694f-4319-9bfa-88d10059040f',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            4,
            'ParentID',
            'Parent ID',
            'Parent category ID, allowing for hierarchical categorization.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '24395cd6-d0df-4cd0-9947-63a091a7c650'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24395cd6-d0df-4cd0-9947-63a091a7c650',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            5,
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
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'fdcb1595-8e49-43db-9207-a692568e7753'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fdcb1595-8e49-43db-9207-a692568e7753',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            6,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '4468b874-9e5d-435c-9ec5-c913530577b6'  OR
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'Parent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4468b874-9e5d-435c-9ec5-c913530577b6',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: Generated Code Categories
            7,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '16f223f3-d2b5-4282-87ff-5f446c721646'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '16f223f3-d2b5-4282-87ff-5f446c721646',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            1,
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
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'ee29997d-6cae-4a6d-93f4-ac294d7a4db6'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'GeneratedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee29997d-6cae-4a6d-93f4-ac294d7a4db6',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            2,
            'GeneratedAt',
            'Generated At',
            'When the code was generated.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5d265465-7ebe-45a5-ab7a-20c558c0b7fa'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'CategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d265465-7ebe-45a5-ab7a-20c558c0b7fa',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            3,
            'CategoryID',
            'Category ID',
            'Reference to the category of generated code.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'ad60f2da-dcce-42a1-b567-3535633601f2'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'GeneratedByModelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ad60f2da-dcce-42a1-b567-3535633601f2',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            4,
            'GeneratedByModelID',
            'Generated By Model ID',
            'AI model responsible for generating this code.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '45efa9bc-f491-4f92-95ed-b14a3c3e8fa3'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45efa9bc-f491-4f92-95ed-b14a3c3e8fa3',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            5,
            'Name',
            'Name',
            'Descriptive name of the generated code.',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '6b8cc666-2e5b-49af-8965-05545b04a97b'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6b8cc666-2e5b-49af-8965-05545b04a97b',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            6,
            'Description',
            'Description',
            'Optional description of the generated code.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '12f2351d-170f-4a3a-bfbf-ec2d9c23ae37'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Code')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12f2351d-170f-4a3a-bfbf-ec2d9c23ae37',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            7,
            'Code',
            'Code',
            'The actual generated code.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '84991ef6-687a-47f8-ab3d-bb0ecc06ed92'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Source')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84991ef6-687a-47f8-ab3d-bb0ecc06ed92',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            8,
            'Source',
            'Source',
            'Source material used to generate the code, e.g., a SQL CHECK constraint.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '5d11079f-ff29-415c-851d-dd251c62699b'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'LinkedEntityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d11079f-ff29-415c-851d-dd251c62699b',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            9,
            'LinkedEntityID',
            'Linked Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '3db72635-45e9-4c01-88fc-d097898f9f57'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'LinkedRecordPrimaryKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3db72635-45e9-4c01-88fc-d097898f9f57',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            10,
            'LinkedRecordPrimaryKey',
            'Linked Record Primary Key',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'f67ff28d-aef0-4e69-9c3e-e532ca963320'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f67ff28d-aef0-4e69-9c3e-e532ca963320',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            11,
            'Status',
            'Status',
            'Status of the generated code, e.g., Pending, Approved, or Rejected.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '995d0ace-2d0f-4a6a-8479-5a9a31e51506'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Language')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '995d0ace-2d0f-4a6a-8479-5a9a31e51506',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            12,
            'Language',
            'Language',
            'Programming language of the generated code (TypeScript, SQL, HTML, CSS, JavaScript, Python, or Other).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'TypeScript',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '2dbd9d8a-b699-4682-b9b1-927f1e9d55d3'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2dbd9d8a-b699-4682-b9b1-927f1e9d55d3',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            13,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'd8e7a17f-2ce3-4592-9774-b431fea5444c'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd8e7a17f-2ce3-4592-9774-b431fea5444c',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            14,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '9028641e-d035-4b51-9c8e-1d1af4bbca0e'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9028641e-d035-4b51-9c8e-1d1af4bbca0e',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            15,
            'Category',
            'Category',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '29c409c4-6886-49ce-8882-f20057bf7c6d'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'GeneratedByModel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29c409c4-6886-49ce-8882-f20057bf7c6d',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            16,
            'GeneratedByModel',
            'Generated By Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '580e1053-df96-46a1-a832-1c32b5520560'  OR
               (EntityID = '99288306-17A6-433D-BD9C-C4EE40DF175A' AND Name = 'LinkedEntity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '580e1053-df96-46a1-a832-1c32b5520560',
            '99288306-17A6-433D-BD9C-C4EE40DF175A', -- Entity: Generated Codes
            17,
            'LinkedEntity',
            'Linked Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F67FF28D-AEF0-4E69-9C3E-E532CA963320', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F67FF28D-AEF0-4E69-9C3E-E532CA963320', 2, 'Approved', 'Approved')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F67FF28D-AEF0-4E69-9C3E-E532CA963320', 3, 'Rejected', 'Rejected')

/* SQL text to update ValueListType for entity field ID F67FF28D-AEF0-4E69-9C3E-E532CA963320 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F67FF28D-AEF0-4E69-9C3E-E532CA963320'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 1, 'TypeScript', 'TypeScript')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 2, 'SQL', 'SQL')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 3, 'HTML', 'HTML')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 4, 'CSS', 'CSS')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 5, 'JavaScript', 'JavaScript')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 6, 'Python', 'Python')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('995D0ACE-2D0F-4A6A-8479-5A9A31E51506', 7, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 995D0ACE-2D0F-4A6A-8479-5A9A31E51506 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='995D0ACE-2D0F-4A6A-8479-5A9A31E51506'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fc98b3d7-2279-4b9e-9e3b-23ed1ff6123d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fc98b3d7-2279-4b9e-9e3b-23ed1ff6123d', '49770E19-D6D0-485D-A03F-01C39FDFB6D1', '49770E19-D6D0-485D-A03F-01C39FDFB6D1', 'ParentID', 'One To Many', 1, 1, 'Generated Code Categories', 1);
   END

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8abd6fa2-2b2f-4e84-abf1-6fe3bbb2e3cb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8abd6fa2-2b2f-4e84-abf1-6fe3bbb2e3cb', '49770E19-D6D0-485D-A03F-01C39FDFB6D1', '99288306-17A6-433D-BD9C-C4EE40DF175A', 'CategoryID', 'One To Many', 1, 1, 'Generated Codes', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'baf6bb8f-b641-40c8-af19-37f5eb0581ca'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('baf6bb8f-b641-40c8-af19-37f5eb0581ca', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '99288306-17A6-433D-BD9C-C4EE40DF175A', 'LinkedEntityID', 'One To Many', 1, 1, 'Generated Codes', 2);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4dd95574-4146-46ed-a8ab-32cf5496e9da'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4dd95574-4146-46ed-a8ab-32cf5496e9da', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '99288306-17A6-433D-BD9C-C4EE40DF175A', 'GeneratedByModelID', 'One To Many', 1, 1, 'Generated Codes', 3);
   END


/* Index for Foreign Keys for GeneratedCodeCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table GeneratedCodeCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCodeCategory_ParentID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCodeCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCodeCategory_ParentID ON [${flyway:defaultSchema}].[GeneratedCodeCategory] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 538DFEA0-694F-4319-9BFA-88D10059040F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='538DFEA0-694F-4319-9BFA-88D10059040F',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generated Code Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeneratedCodeCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
AS
SELECT
    g.*,
    GeneratedCodeCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS GeneratedCodeCategory_ParentID
  ON
    [g].[ParentID] = GeneratedCodeCategory_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: Permissions for vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spCreateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier = '00000000-0000-0000-0000-000000000000'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GeneratedCodeCategory]
        (
            [Name],
            [Description],
            [ParentID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            CASE @ParentID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @ParentID END
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spUpdateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeneratedCodeCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGeneratedCodeCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeneratedCodeCategory
ON [${flyway:defaultSchema}].[GeneratedCodeCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Code Categories
-- Item: spDeleteGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]


/* spDelete Permissions for Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]



/* Index for Foreign Keys for GeneratedCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_CategoryID ON [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID]);

-- Index for foreign key GeneratedByModelID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_GeneratedByModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_GeneratedByModelID ON [${flyway:defaultSchema}].[GeneratedCode] ([GeneratedByModelID]);

-- Index for foreign key LinkedEntityID in table GeneratedCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GeneratedCode_LinkedEntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GeneratedCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GeneratedCode_LinkedEntityID ON [${flyway:defaultSchema}].[GeneratedCode] ([LinkedEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 5D265465-7EBE-45A5-AB7A-20C558C0B7FA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5D265465-7EBE-45A5-AB7A-20C558C0B7FA',
         @RelatedEntityNameFieldMap='Category'

/* SQL text to update entity field related entity name field map for entity field ID AD60F2DA-DCCE-42A1-B567-3535633601F2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AD60F2DA-DCCE-42A1-B567-3535633601F2',
         @RelatedEntityNameFieldMap='GeneratedByModel'

/* SQL text to update entity field related entity name field map for entity field ID 5D11079F-FF29-415C-851D-DD251C62699B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5D11079F-FF29-415C-851D-DD251C62699B',
         @RelatedEntityNameFieldMap='LinkedEntity'

/* Base View SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: vwGeneratedCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generated Codes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeneratedCode
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGeneratedCodes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeneratedCodes]
AS
SELECT
    g.*,
    GeneratedCodeCategory_CategoryID.[Name] AS [Category],
    AIModel_GeneratedByModelID.[Name] AS [GeneratedByModel],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity]
FROM
    [${flyway:defaultSchema}].[GeneratedCode] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS GeneratedCodeCategory_CategoryID
  ON
    [g].[CategoryID] = GeneratedCodeCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_GeneratedByModelID
  ON
    [g].[GeneratedByModelID] = AIModel_GeneratedByModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [g].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: Permissions for vwGeneratedCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spCreateGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCode]
    @GeneratedAt datetimeoffset,
    @CategoryID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @GeneratedByModelID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
    @LinkedEntityID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @LinkedRecordPrimaryKey nvarchar(MAX),
    @Status nvarchar(20),
    @Language nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GeneratedCode]
        (
            [GeneratedAt],
            [CategoryID],
            [GeneratedByModelID],
            [Name],
            [Description],
            [Code],
            [Source],
            [LinkedEntityID],
            [LinkedRecordPrimaryKey],
            [Status],
            [Language]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @GeneratedAt,
            CASE @CategoryID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @CategoryID END,
            CASE @GeneratedByModelID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @GeneratedByModelID END,
            @Name,
            @Description,
            @Code,
            @Source,
            CASE @LinkedEntityID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @LinkedEntityID END,
            @LinkedRecordPrimaryKey,
            @Status,
            @Language
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeneratedCodes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCode] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCode] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spUpdateGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCode]
    @ID uniqueidentifier,
    @GeneratedAt datetimeoffset,
    @CategoryID uniqueidentifier,
    @GeneratedByModelID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordPrimaryKey nvarchar(MAX),
    @Status nvarchar(20),
    @Language nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCode]
    SET
        [GeneratedAt] = @GeneratedAt,
        [CategoryID] = @CategoryID,
        [GeneratedByModelID] = @GeneratedByModelID,
        [Name] = @Name,
        [Description] = @Description,
        [Code] = @Code,
        [Source] = @Source,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordPrimaryKey] = @LinkedRecordPrimaryKey,
        [Status] = @Status,
        [Language] = @Language
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeneratedCodes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCode] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeneratedCode table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGeneratedCode
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeneratedCode
ON [${flyway:defaultSchema}].[GeneratedCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCode]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeneratedCode] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCode] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generated Codes
-- Item: spDeleteGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCode
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGeneratedCode]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCode]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeneratedCode]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCode] TO [cdp_Integration]


/* spDelete Permissions for Generated Codes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCode] TO [cdp_Integration]



/***** new view for check constraints ****/

GO

DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
GO
CREATE VIEW ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
AS
SELECT
    e.ID as EntityID,
    e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
	  gc.ID as GeneratedCodeID,
	  gc.Name as GeneratedValidationFunctionName,
	  gc.Description as GeneratedValidationFunctionDescription,
    gc.Code as GeneratedValidationFunctionCode,
    gc.Source as GeneratedValidationFunctionCheckConstraint,
    sch.name AS SchemaName,
    obj.name AS TableName,
    col.name AS ColumnName,
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM
    sys.check_constraints cc
INNER JOIN
    sys.objects obj ON cc.parent_object_id = obj.object_id
INNER JOIN
    sys.schemas sch ON obj.schema_id = sch.schema_id
INNER JOIN
	${flyway:defaultSchema}.Entity e
	ON
	e.SchemaName = sch.Name AND
	e.BaseTable = obj.name
LEFT OUTER JOIN -- left join since can have table level constraints
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
LEFT OUTER JOIN -- left join since can have table level constraints
  ${flyway:defaultSchema}.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
LEFT OUTER JOIN
  ${flyway:defaultSchema}.vwGeneratedCodes gc
  ON -- EITHER JOIN ON EntityField or Entity depending on which type of constraint we have here
  (   (ef.ID IS NOT NULL AND gc.LinkedEntity='Entity Fields' AND gc.LinkedRecordPrimaryKey=ef.ID)
        OR
      (ef.ID IS NULL and gc.LinkedEntity='Entities' AND gc.LinkedRecordPrimaryKey=e.ID)
  ) AND -- MUST MATCH Source=definition
  cc.definition = gc.Source
GO

/**** NEW Generated Code *****/



-- CHECK constraint for Communication Providers @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([SupportsScheduledSending]<=[SupportsSending])', 'public ValidateSupportsScheduledSendingComparedToSupportsSending(result: ValidationResult) {
	if (this.SupportsScheduledSending && !this.SupportsSending) {
		result.Errors.push(new ValidationErrorInfo("SupportsScheduledSending", "A user who cannot send messages cannot schedule sending of messages.", this.SupportsScheduledSending, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the ability to schedule sending messages cannot exceed the overall ability to send messages. In simpler terms, if a user can send messages, they can also send them on a schedule, but if they cannot send messages, they shouldn''t be able to send them on a schedule either.', 'ValidateSupportsScheduledSendingComparedToSupportsSending', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '43248F34-2837-EF11-86D4-6045BDEE16E6');



-- CHECK constraint for Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([AllowRecordMerge]=(0) OR [AllowRecordMerge]=(1) AND [AllowDeleteAPI]=(1) AND [DeleteType]=''Soft'')', 'public ValidateAllowRecordMergeConstraints(result: ValidationResult) {
	if (this.AllowRecordMerge && !(this.AllowDeleteAPI && this.DeleteType === ''Soft'')) {
		result.Errors.push(new ValidationErrorInfo(''AllowRecordMerge'', ''Record merging is only allowed when record deletion is enabled and the deletion type is set to Soft.'', this.AllowRecordMerge, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if record merging is allowed, it can only be permitted if record deletion is enabled and the deletion type is set to ''Soft''.', 'ValidateAllowRecordMergeConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6');



-- CHECK constraint for Entity Documents @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([PotentialMatchThreshold]<=[AbsoluteMatchThreshold] AND [PotentialMatchThreshold]>=(0) AND [PotentialMatchThreshold]<=(1) AND [AbsoluteMatchThreshold]>=(0) AND [AbsoluteMatchThreshold]<=(1))', 'public ValidatePotentialMatchThresholdAgainstAbsoluteMatchThreshold(result: ValidationResult) {
	if (this.PotentialMatchThreshold > this.AbsoluteMatchThreshold) {
		result.Errors.push(new ValidationErrorInfo("PotentialMatchThreshold", "The potential match threshold cannot be greater than the absolute match threshold.", this.PotentialMatchThreshold, ValidationErrorType.Failure));
	}
	if (this.PotentialMatchThreshold < 0 || this.PotentialMatchThreshold > 1) {
		result.Errors.push(new ValidationErrorInfo("PotentialMatchThreshold", "The potential match threshold must be between 0 and 1 inclusive.", this.PotentialMatchThreshold, ValidationErrorType.Failure));
	}
	if (this.AbsoluteMatchThreshold < 0 || this.AbsoluteMatchThreshold > 1) {
		result.Errors.push(new ValidationErrorInfo("AbsoluteMatchThreshold", "The absolute match threshold must be between 0 and 1 inclusive.", this.AbsoluteMatchThreshold, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the potential match threshold is not greater than the absolute match threshold, and both thresholds must be between 0 and 1 inclusive.', 'ValidatePotentialMatchThresholdAgainstAbsoluteMatchThreshold', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '22248F34-2837-EF11-86D4-6045BDEE16E6');



-- CHECK constraint for Resource Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([Type]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Type]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL)', 'public ValidateUserTypeConstraints(result: ValidationResult) {
	if (this.Type === ''Role'' && this.RoleID === null && this.UserID !== null) {
		result.Errors.push(new ValidationErrorInfo("RoleID", "When the type is ''Role'', a RoleID must be provided and UserID must be null.", this.RoleID, ValidationErrorType.Failure));
	} else if (this.Type === ''User'' && this.UserID === null && this.RoleID !== null) {
		result.Errors.push(new ValidationErrorInfo("UserID", "When the type is ''User'', a UserID must be provided and RoleID must be null.", this.UserID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that when the type is set to ''Role'', a role ID must be provided and the user ID must not be provided. Conversely, if the type is set to ''User'', a user ID must be provided and the role ID must not be provided.', 'ValidateUserTypeConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '201852E1-4587-EF11-8473-6045BDF077EE');



-- CHECK constraint for Schema Info @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([EntityIDMax]>[EntityIDMin])', 'public ValidateEntityIDMaxGreaterThanEntityIDMin(result: ValidationResult) {
	if (this.EntityIDMax <= this.EntityIDMin) {
		result.Errors.push(new ValidationErrorInfo("EntityIDMax", "The maximum entity ID must be greater than the minimum entity ID.", this.EntityIDMax, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the maximum entity ID must be greater than the minimum entity ID, which helps to maintain valid and logical ranges for entity IDs.', 'ValidateEntityIDMaxGreaterThanEntityIDMin', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '15248F34-2837-EF11-86D4-6045BDEE16E6');

            -- CHECK constraint for Schema Info @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', GETUTCDATE(), 'TypeScript','Approved', '([EntityIDMin]>(0) AND [EntityIDMax]>(0))', 'public ValidateEntityIDMinAndEntityIDMaxGreaterThanZero(result: ValidationResult) {
	if (this.EntityIDMin <= 0) {
		result.Errors.push(new ValidationErrorInfo("EntityIDMin", "The minimum entity ID must be greater than zero.", this.EntityIDMin, ValidationErrorType.Failure));
	}
	if (this.EntityIDMax <= 0) {
		result.Errors.push(new ValidationErrorInfo("EntityIDMax", "The maximum entity ID must be greater than zero.", this.EntityIDMax, ValidationErrorType.Failure));
	}
}', 'This rule ensures that both the minimum and maximum entity IDs must be greater than zero.', 'ValidateEntityIDMinAndEntityIDMaxGreaterThanZero', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '15248F34-2837-EF11-86D4-6045BDEE16E6');

