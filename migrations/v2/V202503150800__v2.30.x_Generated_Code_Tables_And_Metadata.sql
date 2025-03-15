-- Create the GenerateCodeCategory Table (for categorization)
CREATE TABLE ${flyway:defaultSchema}.GenerateCodeCategory (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL UNIQUE,
    Description NVARCHAR(MAX) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_GenerateCodeCategory_Parent FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.GenerateCodeCategory(ID)
);
GO

-- Add extended properties for GenerateCodeCategory table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Categorization for generated code, including optional parent-child relationships.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GenerateCodeCategory';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Parent category ID, allowing for hierarchical categorization.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GenerateCodeCategory',
    @level2type = N'Column', @level2name = 'ParentID';
GO

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
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    Language NVARCHAR(50) NOT NULL DEFAULT 'TypeScript',

    -- Foreign Key Constraints
    CONSTRAINT FK_GeneratedCode_Category FOREIGN KEY (CategoryID) REFERENCES ${flyway:defaultSchema}.GenerateCodeCategory(ID),
    CONSTRAINT FK_GeneratedCode_GeneratedByModel FOREIGN KEY (GeneratedByModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),

    -- Check constraint for Status
    CONSTRAINT CHK_GeneratedCode_Status CHECK (Status IN ('Pending', 'Approved', 'Rejected')),

    -- Check constraint for Language
    CONSTRAINT CHK_GeneratedCode_Language CHECK (Language IN ('TypeScript', 'SQL', 'HTML', 'CSS', 'JavaScript', 'Python', 'Other'))
);
GO


-- Add extended properties for GeneratedCode table
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Stores LLM-generated code snippets, tracking their source, category, and validation status.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode';
GO

-- Document non-key columns in GeneratedCode
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'When the code was generated.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedAt';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Reference to the category of generated code.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'CategoryID';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'AI model responsible for generating this code.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'GeneratedByModelID';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Descriptive name of the generated code.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Name';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Optional description of the generated code.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Description';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'The actual generated code.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Code';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Source material used to generate the code, e.g., a SQL CHECK constraint.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Source';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Status of the generated code, e.g., Pending, Approved, or Rejected.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Status';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Programming language of the generated code (TypeScript, SQL, HTML, CSS, JavaScript, Python, or Other).', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'Language';
GO




--------------- GENERATED METADATA FOR THE ABOVE -------------------


/* SQL generated to create new entity Generate Code Categories */

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
         'c53ba932-394a-4a09-bc14-97f2e577913c',
         'Generate Code Categories',
         NULL,
         NULL,
         'GenerateCodeCategory',
         'vwGenerateCodeCategories',
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
   

/* SQL generated to add new permission for entity Generate Code Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c53ba932-394a-4a09-bc14-97f2e577913c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Generate Code Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c53ba932-394a-4a09-bc14-97f2e577913c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Generate Code Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c53ba932-394a-4a09-bc14-97f2e577913c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'd4da723a-17a4-4742-92df-044bb9cbd6a7',
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
                                                   ('d4da723a-17a4-4742-92df-044bb9cbd6a7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Generated Codes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d4da723a-17a4-4742-92df-044bb9cbd6a7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Generated Codes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d4da723a-17a4-4742-92df-044bb9cbd6a7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.GeneratedCode */
ALTER TABLE [${flyway:defaultSchema}].[GeneratedCode] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.GeneratedCode */
ALTER TABLE [${flyway:defaultSchema}].[GeneratedCode] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.GenerateCodeCategory */
ALTER TABLE [${flyway:defaultSchema}].[GenerateCodeCategory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.GenerateCodeCategory */
ALTER TABLE [${flyway:defaultSchema}].[GenerateCodeCategory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c46cb227-e37d-4c2c-a3fc-1f66ebc94260'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'ID')
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
            'c46cb227-e37d-4c2c-a3fc-1f66ebc94260',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = '268dfa49-8686-4e67-9556-c4b38798ae17'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'GeneratedAt')
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
            '268dfa49-8686-4e67-9556-c4b38798ae17',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = '53482aa8-cc39-43cd-a592-58a736e26444'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'CategoryID')
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
            '53482aa8-cc39-43cd-a592-58a736e26444',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
            'C53BA932-394A-4A09-BC14-97F2E577913C',
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
         WHERE ID = '4a74fd3e-83da-4c1b-8b48-2f87db6d2910'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'GeneratedByModelID')
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
            '4a74fd3e-83da-4c1b-8b48-2f87db6d2910',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = 'e8af4f83-5b45-418d-a8b2-bb181a7a39a9'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Name')
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
            'e8af4f83-5b45-418d-a8b2-bb181a7a39a9',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = '3681deeb-53ef-400c-a8c7-fe4c415829d3'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Description')
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
            '3681deeb-53ef-400c-a8c7-fe4c415829d3',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = '068ebb81-eed2-4a4c-a2ef-8cf5ae0df1bd'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Code')
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
            '068ebb81-eed2-4a4c-a2ef-8cf5ae0df1bd',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = 'bf9fd546-65a7-43e7-8589-a0cd5e0ce7b3'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Source')
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
            'bf9fd546-65a7-43e7-8589-a0cd5e0ce7b3',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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
         WHERE ID = 'e20e3c1a-2a94-41e2-a2b8-252bfe76e917'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Status')
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
            'e20e3c1a-2a94-41e2-a2b8-252bfe76e917',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            9,
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
         WHERE ID = '35d6097e-cf21-41a4-ac8b-df5ffc7ffc54'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Language')
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
            '35d6097e-cf21-41a4-ac8b-df5ffc7ffc54',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            10,
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
         WHERE ID = '34b257d2-8fc8-492b-931f-9b74023e88ed'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = '${flyway:defaultSchema}_CreatedAt')
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
            '34b257d2-8fc8-492b-931f-9b74023e88ed',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            11,
            '${flyway:defaultSchema}_CreatedAt',
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
         WHERE ID = 'e59cb769-1a24-4475-a02d-89d97a71cf85'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = '${flyway:defaultSchema}_UpdatedAt')
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
            'e59cb769-1a24-4475-a02d-89d97a71cf85',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            12,
            '${flyway:defaultSchema}_UpdatedAt',
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
         WHERE ID = '4fa409df-b315-4527-bf45-a3d25de604b3'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = 'ID')
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
            '4fa409df-b315-4527-bf45-a3d25de604b3',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
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
         WHERE ID = '3636c843-d36c-4abb-90ee-4c9e8cafea71'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = 'Name')
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
            '3636c843-d36c-4abb-90ee-4c9e8cafea71',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
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
         WHERE ID = 'ece24317-3924-4857-8206-938768a1a50a'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = 'Description')
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
            'ece24317-3924-4857-8206-938768a1a50a',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
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
         WHERE ID = 'aae24d3e-bd8b-4e55-8b0a-58b790f574b7'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = 'ParentID')
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
            'aae24d3e-bd8b-4e55-8b0a-58b790f574b7',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
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
            'C53BA932-394A-4A09-BC14-97F2E577913C',
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
         WHERE ID = '276304e2-76c9-4419-bd7c-94d334218407'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = '${flyway:defaultSchema}_CreatedAt')
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
            '276304e2-76c9-4419-bd7c-94d334218407',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
            5,
            '${flyway:defaultSchema}_CreatedAt',
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
         WHERE ID = '3bbf3b0f-63e5-4176-8f89-05fbf4e47635'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = '${flyway:defaultSchema}_UpdatedAt')
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
            '3bbf3b0f-63e5-4176-8f89-05fbf4e47635',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
            6,
            '${flyway:defaultSchema}_UpdatedAt',
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

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('E20E3C1A-2A94-41E2-A2B8-252BFE76E917', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('E20E3C1A-2A94-41E2-A2B8-252BFE76E917', 2, 'Approved', 'Approved')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('E20E3C1A-2A94-41E2-A2B8-252BFE76E917', 3, 'Rejected', 'Rejected')

/* SQL text to update ValueListType for entity field ID E20E3C1A-2A94-41E2-A2B8-252BFE76E917 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='E20E3C1A-2A94-41E2-A2B8-252BFE76E917'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 1, 'TypeScript', 'TypeScript')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 2, 'SQL', 'SQL')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 3, 'HTML', 'HTML')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 4, 'CSS', 'CSS')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 5, 'JavaScript', 'JavaScript')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 6, 'Python', 'Python')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54', 7, 'Other', 'Other')

/* SQL text to update ValueListType for entity field ID 35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='35D6097E-CF21-41A4-AC8B-DF5FFC7FFC54'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '70411ce0-67a1-4fff-a14b-b1a30e102cdf'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('70411ce0-67a1-4fff-a14b-b1a30e102cdf', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', 'GeneratedByModelID', 'One To Many', 1, 1, 'Generated Codes', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '28970da4-96d5-4445-b987-86bef0246e66'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('28970da4-96d5-4445-b987-86bef0246e66', 'C53BA932-394A-4A09-BC14-97F2E577913C', 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', 'CategoryID', 'One To Many', 1, 1, 'Generated Codes', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b025b430-23ab-41c2-b62c-8daaab01a42d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b025b430-23ab-41c2-b62c-8daaab01a42d', 'C53BA932-394A-4A09-BC14-97F2E577913C', 'C53BA932-394A-4A09-BC14-97F2E577913C', 'ParentID', 'One To Many', 1, 1, 'Generate Code Categories', 1);
   END
                              

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

/* SQL text to update entity field related entity name field map for entity field ID 53482AA8-CC39-43CD-A592-58A736E26444 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='53482AA8-CC39-43CD-A592-58A736E26444',
         @RelatedEntityNameFieldMap='Category'

/* SQL text to update entity field related entity name field map for entity field ID 4A74FD3E-83DA-4C1B-8B48-2F87DB6D2910 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4A74FD3E-83DA-4C1B-8B48-2F87DB6D2910',
         @RelatedEntityNameFieldMap='GeneratedByModel'

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
    GenerateCodeCategory_CategoryID.[Name] AS [Category],
    AIModel_GeneratedByModelID.[Name] AS [GeneratedByModel]
FROM
    [${flyway:defaultSchema}].[GeneratedCode] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS GenerateCodeCategory_CategoryID
  ON
    [g].[CategoryID] = GenerateCodeCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_GeneratedByModelID
  ON
    [g].[GeneratedByModelID] = AIModel_GeneratedByModelID.[ID]
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
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the GeneratedCode table
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
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
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



/* Index for Foreign Keys for GenerateCodeCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table GenerateCodeCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GenerateCodeCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GenerateCodeCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GenerateCodeCategory_ParentID ON [${flyway:defaultSchema}].[GenerateCodeCategory] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID AAE24D3E-BD8B-4E55-8B0A-58B790F574B7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AAE24D3E-BD8B-4E55-8B0A-58B790F574B7',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: vwGenerateCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generate Code Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GenerateCodeCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGenerateCodeCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGenerateCodeCategories]
AS
SELECT
    g.*,
    GenerateCodeCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS GenerateCodeCategory_ParentID
  ON
    [g].[ParentID] = GenerateCodeCategory_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGenerateCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: Permissions for vwGenerateCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGenerateCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spCreateGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGenerateCodeCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier = '00000000-0000-0000-0000-000000000000'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GenerateCodeCategory]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwGenerateCodeCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spUpdateGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GenerateCodeCategory]
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
                                        [${flyway:defaultSchema}].[vwGenerateCodeCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the GenerateCodeCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGenerateCodeCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGenerateCodeCategory
ON [${flyway:defaultSchema}].[GenerateCodeCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GenerateCodeCategory]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GenerateCodeCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spDeleteGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GenerateCodeCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f2353aa-d1c6-4401-8b6f-0b3e9bc27070'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'Category')
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
            '6f2353aa-d1c6-4401-8b6f-0b3e9bc27070',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            13,
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
         WHERE ID = '1cacedb7-5eb2-40b2-81d3-5b31e3c4d987'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'GeneratedByModel')
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
            '1cacedb7-5eb2-40b2-81d3-5b31e3c4d987',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            14,
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
         WHERE ID = 'c605f5f4-744d-4d71-981e-b49443488a17'  OR 
               (EntityID = 'C53BA932-394A-4A09-BC14-97F2E577913C' AND Name = 'Parent')
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
            'c605f5f4-744d-4d71-981e-b49443488a17',
            'C53BA932-394A-4A09-BC14-97F2E577913C', -- Entity: Generate Code Categories
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
    GenerateCodeCategory_CategoryID.[Name] AS [Category],
    AIModel_GeneratedByModelID.[Name] AS [GeneratedByModel]
FROM
    [${flyway:defaultSchema}].[GeneratedCode] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS GenerateCodeCategory_CategoryID
  ON
    [g].[CategoryID] = GenerateCodeCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_GeneratedByModelID
  ON
    [g].[GeneratedByModelID] = AIModel_GeneratedByModelID.[ID]
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
    @CategoryID uniqueidentifier,
    @GeneratedByModelID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
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
            [Status],
            [Language]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @GeneratedAt,
            @CategoryID,
            @GeneratedByModelID,
            @Name,
            @Description,
            @Code,
            @Source,
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
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the GeneratedCode table
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
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
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



/* Index for Foreign Keys for GenerateCodeCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table GenerateCodeCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GenerateCodeCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GenerateCodeCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GenerateCodeCategory_ParentID ON [${flyway:defaultSchema}].[GenerateCodeCategory] ([ParentID]);

/* Base View SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: vwGenerateCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Generate Code Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GenerateCodeCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwGenerateCodeCategories]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGenerateCodeCategories]
AS
SELECT
    g.*,
    GenerateCodeCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS GenerateCodeCategory_ParentID
  ON
    [g].[ParentID] = GenerateCodeCategory_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGenerateCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: Permissions for vwGenerateCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGenerateCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spCreateGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGenerateCodeCategory]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[GenerateCodeCategory]
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
            @ParentID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGenerateCodeCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spUpdateGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GenerateCodeCategory]
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
                                        [${flyway:defaultSchema}].[vwGenerateCodeCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the GenerateCodeCategory table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateGenerateCodeCategory
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGenerateCodeCategory
ON [${flyway:defaultSchema}].[GenerateCodeCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GenerateCodeCategory]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GenerateCodeCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGenerateCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Generate Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Generate Code Categories
-- Item: spDeleteGenerateCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GenerateCodeCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GenerateCodeCategory]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Generate Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGenerateCodeCategory] TO [cdp_Integration]


/************* ALTER TABLE FOR GeneratedCode - missed two fields ************/

-- Add new columns to the GeneratedCode table
ALTER TABLE ${flyway:defaultSchema}.GeneratedCode
ADD 
    LinkedEntityID UNIQUEIDENTIFIER NULL,
    LinkedRecordPrimaryKey NVARCHAR(MAX) NULL;
GO

-- Add foreign key constraint for LinkedEntityID
ALTER TABLE ${flyway:defaultSchema}.GeneratedCode
ADD CONSTRAINT FK_GeneratedCode_LinkedEntity FOREIGN KEY (LinkedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID);
GO

-- Add extended property for LinkedEntityID
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Optional reference to an entity. Used for linking generated code to a specific entity/record.', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'LinkedEntityID';
GO

-- Add extended property for LinkedRecordPrimaryKey
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = 'Optional scalar or JSON representation of the primary key of the linked entity record. Can store UUID, INT, or composite keys. If non-scalar stored in MJ JSON format for Composite Keys', 
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}', 
    @level1type = N'Table',  @level1name = 'GeneratedCode',
    @level2type = N'Column', @level2name = 'LinkedRecordPrimaryKey';
GO

/****** METADATA FOR THE 2 ADDITIONAL FIELDS ********/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eabdd095-25b3-47da-b625-230f2190500a'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'LinkedEntityID')
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
            'eabdd095-25b3-47da-b625-230f2190500a',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            13,
            'LinkedEntityID',
            'Linked Entity ID',
            'Optional reference to an entity. Used for linking generated code to a specific entity/record.',
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
         WHERE ID = '617d40cc-8f0d-41ec-9c66-d29277c00996'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'LinkedRecordPrimaryKey')
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
            '617d40cc-8f0d-41ec-9c66-d29277c00996',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
            14,
            'LinkedRecordPrimaryKey',
            'Linked Record Primary Key',
            'Optional scalar or JSON representation of the primary key of the linked entity record. Can store UUID, INT, or composite keys. If non-scalar stored in MJ JSON format for Composite Keys',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'de394880-9c6b-4af1-a6cd-e591845229cb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('de394880-9c6b-4af1-a6cd-e591845229cb', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', 'LinkedEntityID', 'One To Many', 1, 1, 'Generated Codes', 1);
   END
                              

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

/* SQL text to update entity field related entity name field map for entity field ID EABDD095-25B3-47DA-B625-230F2190500A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EABDD095-25B3-47DA-B625-230F2190500A',
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
    GenerateCodeCategory_CategoryID.[Name] AS [Category],
    AIModel_GeneratedByModelID.[Name] AS [GeneratedByModel],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity]
FROM
    [${flyway:defaultSchema}].[GeneratedCode] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GenerateCodeCategory] AS GenerateCodeCategory_CategoryID
  ON
    [g].[CategoryID] = GenerateCodeCategory_CategoryID.[ID]
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
    @CategoryID uniqueidentifier,
    @GeneratedByModelID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Code nvarchar(MAX),
    @Source nvarchar(MAX),
    @Status nvarchar(20),
    @Language nvarchar(50),
    @LinkedEntityID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @LinkedRecordPrimaryKey nvarchar(MAX)
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
            [Status],
            [Language],
            [LinkedEntityID],
            [LinkedRecordPrimaryKey]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @GeneratedAt,
            @CategoryID,
            @GeneratedByModelID,
            @Name,
            @Description,
            @Code,
            @Source,
            @Status,
            @Language,
            CASE @LinkedEntityID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @LinkedEntityID END,
            @LinkedRecordPrimaryKey
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
    @Status nvarchar(20),
    @Language nvarchar(50),
    @LinkedEntityID uniqueidentifier,
    @LinkedRecordPrimaryKey nvarchar(MAX)
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
        [Status] = @Status,
        [Language] = @Language,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordPrimaryKey] = @LinkedRecordPrimaryKey
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
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the GeneratedCode table
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
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
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



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '57e4dc8d-da04-4af0-9ab3-fbb9c1888e89'  OR 
               (EntityID = 'D4DA723A-17A4-4742-92DF-044BB9CBD6A7' AND Name = 'LinkedEntity')
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
            '57e4dc8d-da04-4af0-9ab3-fbb9c1888e89',
            'D4DA723A-17A4-4742-92DF-044BB9CBD6A7', -- Entity: Generated Codes
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

