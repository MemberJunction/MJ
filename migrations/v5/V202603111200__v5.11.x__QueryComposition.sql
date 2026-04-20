/*************************************************************
 * Sub-Phase A: Composable Query Engine — Schema Changes
 *
 * 1. Add Reusable BIT column to Query table
 * 2. Create QueryDependency table
 *
 * CodeGen handles: views, stored procedures, entity metadata,
 * EntityField records, and all other metadata registration.
 *************************************************************/

-- ============================================================
-- 1. Add Reusable column to Query table
-- ============================================================
ALTER TABLE ${flyway:defaultSchema}.Query
    ADD Reusable BIT NOT NULL CONSTRAINT DF_Query_Reusable DEFAULT 0;
GO

-- ============================================================
-- 2. Create QueryDependency table
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.QueryDependency (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    QueryID           UNIQUEIDENTIFIER NOT NULL,
    DependsOnQueryID  UNIQUEIDENTIFIER NOT NULL,
    ReferencePath     NVARCHAR(500)    NOT NULL,
    Alias             NVARCHAR(100)    NULL,
    ParameterMapping  NVARCHAR(MAX)    NULL,
    DetectionMethod   NVARCHAR(20)     NOT NULL CONSTRAINT DF_QueryDependency_DetectionMethod DEFAULT 'Auto',
    CONSTRAINT PK_QueryDependency PRIMARY KEY (ID),
    CONSTRAINT FK_QueryDependency_Query FOREIGN KEY (QueryID)
        REFERENCES ${flyway:defaultSchema}.Query(ID),
    CONSTRAINT FK_QueryDependency_DependsOn FOREIGN KEY (DependsOnQueryID)
        REFERENCES ${flyway:defaultSchema}.Query(ID),
    CONSTRAINT UQ_QueryDependency UNIQUE (QueryID, DependsOnQueryID, ReferencePath),
    CONSTRAINT CK_QueryDependency_DetectionMethod
        CHECK (DetectionMethod IN ('Auto', 'Manual'))
);
GO

-- ============================================================
-- Extended Properties
-- ============================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this query can be referenced by other queries using composition syntax. Only queries that are both Reusable and Approved can be composed into other queries.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Query',
    @level2type = N'COLUMN', @level2name = 'Reusable';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks which queries reference other queries via composition syntax. Auto-populated by the query save pipeline.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the query that contains the composition reference.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'QueryID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the referenced (depended-upon) query.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'DependsOnQueryID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full composition reference path as written in the SQL.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'ReferencePath';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'SQL alias used for the composed CTE in the referencing query.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'Alias';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object mapping parameter names to values or pass-through parameter names.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'ParameterMapping';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the dependency was detected: Auto (parsed from SQL) or Manual (user-specified).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'QueryDependency',
    @level2type = N'COLUMN', @level2name = 'DetectionMethod';
GO































































































-- CODE GEN RUN 
/* SQL generated to create new entity MJ: Query Dependencies */

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
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a',
         'MJ: Query Dependencies',
         'Query Dependencies',
         'Tracks which queries reference other queries via composition syntax. Auto-populated by the query save pipeline.',
         NULL,
         'QueryDependency',
         'vwQueryDependencies',
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
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Query Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Query Dependencies for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Query Dependencies for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Query Dependencies for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cd4935c5-0c93-46bd-8bd2-0e9368b0bb5a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.QueryDependency */
ALTER TABLE [${flyway:defaultSchema}].[QueryDependency] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.QueryDependency */
ALTER TABLE [${flyway:defaultSchema}].[QueryDependency] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bed169e9-d673-4aaa-8a63-ff8ca0cde8cb' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'ID')) BEGIN
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
            'bed169e9-d673-4aaa-8a63-ff8ca0cde8cb',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100001,
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
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09de6c3f-0506-4ccb-9f64-c43ae3f426c0' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'QueryID')) BEGIN
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
            '09de6c3f-0506-4ccb-9f64-c43ae3f426c0',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100002,
            'QueryID',
            'Query ID',
            'Foreign key to the query that contains the composition reference.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd6fed8f-1e8c-4658-9d13-b361430c7303' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'DependsOnQueryID')) BEGIN
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
            'dd6fed8f-1e8c-4658-9d13-b361430c7303',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100003,
            'DependsOnQueryID',
            'Depends On Query ID',
            'Foreign key to the referenced (depended-upon) query.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb10b534-3af4-4d7b-a5f5-42a9f1ec7e43' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'ReferencePath')) BEGIN
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
            'cb10b534-3af4-4d7b-a5f5-42a9f1ec7e43',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100004,
            'ReferencePath',
            'Reference Path',
            'The full composition reference path as written in the SQL.',
            'nvarchar',
            1000,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7baf397e-775f-4b18-bac1-81fef4a1e30b' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'Alias')) BEGIN
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
            '7baf397e-775f-4b18-bac1-81fef4a1e30b',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100005,
            'Alias',
            'Alias',
            'SQL alias used for the composed CTE in the referencing query.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b64128c-c0ce-4d98-a13c-69fe233b1abe' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'ParameterMapping')) BEGIN
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
            '1b64128c-c0ce-4d98-a13c-69fe233b1abe',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100006,
            'ParameterMapping',
            'Parameter Mapping',
            'JSON object mapping parameter names to values or pass-through parameter names.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a517c8b7-e1b5-4042-acda-b94d0d215e93' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'DetectionMethod')) BEGIN
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
            'a517c8b7-e1b5-4042-acda-b94d0d215e93',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100007,
            'DetectionMethod',
            'Detection Method',
            'How the dependency was detected: Auto (parsed from SQL) or Manual (user-specified).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Auto',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2bbd0b19-ae1e-4dd6-b5f0-25996bf4e015' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2bbd0b19-ae1e-4dd6-b5f0-25996bf4e015',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100008,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd169b61-1e4d-480f-8f9f-d23778a8bbfd' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'bd169b61-1e4d-480f-8f9f-d23778a8bbfd',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100009,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b65b3b9-7ebc-4bdf-b094-691b2cd96fbc' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Reusable')) BEGIN
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
            '1b65b3b9-7ebc-4bdf-b094-691b2cd96fbc',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            100050,
            'Reusable',
            'Reusable',
            'When true, this query can be referenced by other queries using composition syntax. Only queries that are both Reusable and Approved can be composed into other queries.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* SQL text to insert entity field value with ID e3455b95-1c78-4995-b4e8-e4fd225191d6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e3455b95-1c78-4995-b4e8-e4fd225191d6', 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93', 1, 'Auto', 'Auto', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e7fea35b-20d4-4062-a01d-dbc0fa8c9310 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7fea35b-20d4-4062-a01d-dbc0fa8c9310', 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93', 2, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID A517C8B7-E1B5-4042-ACDA-B94D0D215E93 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A517C8B7-E1B5-4042-ACDA-B94D0D215E93'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='5978FE3A-1BE9-4CFB-83B6-E9B34CBB587E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='EA37F71B-6463-4D68-996C-BD69CC10EC21'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='7DDC2EF5-7E08-490C-8409-F576A303E3DE'


/* Create Entity Relationship: MJ: Queries -> MJ: Query Dependencies (One To Many via DependsOnQueryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '85542755-2a36-4477-b4d1-9a758540e210'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('85542755-2a36-4477-b4d1-9a758540e210', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'DependsOnQueryID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Queries -> MJ: Query Dependencies (One To Many via QueryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4406a873-d594-4d55-8b9f-5275dbf3e07f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4406a873-d594-4d55-8b9f-5275dbf3e07f', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'QueryID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for QueryDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryDependency_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryDependency_QueryID ON [${flyway:defaultSchema}].[QueryDependency] ([QueryID]);

-- Index for foreign key DependsOnQueryID in table QueryDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryDependency_DependsOnQueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryDependency_DependsOnQueryID ON [${flyway:defaultSchema}].[QueryDependency] ([DependsOnQueryID]);

/* SQL text to update entity field related entity name field map for entity field ID 09DE6C3F-0506-4CCB-9F64-C43AE3F426C0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='09DE6C3F-0506-4CCB-9F64-C43AE3F426C0', @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID DD6FED8F-1E8C-4658-9D13-B361430C7303 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DD6FED8F-1E8C-4658-9D13-B361430C7303', @RelatedEntityNameFieldMap='DependsOnQuery'

/* Base View SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: vwQueryDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueryDependencies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueryDependencies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryDependencies]
AS
SELECT
    q.*,
    MJQuery_QueryID.[Name] AS [Query],
    MJQuery_DependsOnQueryID.[Name] AS [DependsOnQuery]
FROM
    [${flyway:defaultSchema}].[QueryDependency] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_QueryID
  ON
    [q].[QueryID] = MJQuery_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_DependsOnQueryID
  ON
    [q].[DependsOnQueryID] = MJQuery_DependsOnQueryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: Permissions for vwQueryDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spCreateQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueryDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueryDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryDependency]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @DependsOnQueryID uniqueidentifier,
    @ReferencePath nvarchar(500),
    @Alias nvarchar(100),
    @ParameterMapping nvarchar(MAX),
    @DetectionMethod nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryDependency]
            (
                [ID],
                [QueryID],
                [DependsOnQueryID],
                [ReferencePath],
                [Alias],
                [ParameterMapping],
                [DetectionMethod]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @DependsOnQueryID,
                @ReferencePath,
                @Alias,
                @ParameterMapping,
                ISNULL(@DetectionMethod, 'Auto')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryDependency]
            (
                [QueryID],
                [DependsOnQueryID],
                [ReferencePath],
                [Alias],
                [ParameterMapping],
                [DetectionMethod]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @DependsOnQueryID,
                @ReferencePath,
                @Alias,
                @ParameterMapping,
                ISNULL(@DetectionMethod, 'Auto')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Query Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spUpdateQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueryDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryDependency]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @DependsOnQueryID uniqueidentifier,
    @ReferencePath nvarchar(500),
    @Alias nvarchar(100),
    @ParameterMapping nvarchar(MAX),
    @DetectionMethod nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryDependency]
    SET
        [QueryID] = @QueryID,
        [DependsOnQueryID] = @DependsOnQueryID,
        [ReferencePath] = @ReferencePath,
        [Alias] = @Alias,
        [ParameterMapping] = @ParameterMapping,
        [DetectionMethod] = @DetectionMethod
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryDependency table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueryDependency]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueryDependency];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryDependency
ON [${flyway:defaultSchema}].[QueryDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Query Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spDeleteQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueryDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Query Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryDependency] TO [cdp_Integration]



/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

-- Index for foreign key SQLDialectID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_SQLDialectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_SQLDialectID ON [${flyway:defaultSchema}].[Query] ([SQLDialectID]);

/* Base View SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID.[Name] AS [Category],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS MJQueryCategory_CategoryID
  ON
    [q].[CategoryID] = MJQueryCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [q].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

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
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15) = NULL,
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX),
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL
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
                [Reusable]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL,
                CASE @SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0)
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
                [Reusable]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL,
                CASE @SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Queries */

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
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit,
    @CacheEnabled bit,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX),
    @SQLDialectID uniqueidentifier,
    @Reusable bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank,
        [UsesTemplate] = @UsesTemplate,
        [AuditQueryRuns] = @AuditQueryRuns,
        [CacheEnabled] = @CacheEnabled,
        [CacheTTLMinutes] = @CacheTTLMinutes,
        [CacheMaxSize] = @CacheMaxSize,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID,
        [CacheValidationSQL] = @CacheValidationSQL,
        [SQLDialectID] = @SQLDialectID,
        [Reusable] = @Reusable
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
        

/* spUpdate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @MJDataContextItems_QueryIDID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_DataContextID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_Type nvarchar(50)
    DECLARE @MJDataContextItems_QueryID_ViewID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_QueryID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_EntityID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_RecordID nvarchar(450)
    DECLARE @MJDataContextItems_QueryID_SQL nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_DataJSON nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_LastRefreshedAt datetimeoffset
    DECLARE @MJDataContextItems_QueryID_Description nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_CodeName nvarchar(255)
    DECLARE cascade_update_MJDataContextItems_QueryID_cursor CURSOR FOR
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID

    OPEN cascade_update_MJDataContextItems_QueryID_cursor
    FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDataContextItems_QueryID_QueryID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_DependsOnQueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [DependsOnQueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_DependsOnQueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @MJQueryEntities_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryEntities_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryEntities_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @MJQueryEntities_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryEntities_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryEntities_QueryID_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @MJQueryFields_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryFields_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryFields_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @MJQueryFields_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryFields_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryFields_QueryID_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJQueryParameters_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryParameters_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryParameters_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJQueryParameters_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryParameters_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryParameters_QueryID_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @MJQueryPermissions_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryPermissions_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryPermissions_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @MJQueryPermissions_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryPermissions_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryPermissions_QueryID_cursor
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL
    DECLARE @MJQuerySQLs_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQuerySQLs_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QuerySQL]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQuerySQLs_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQuerySQL] @ID = @MJQuerySQLs_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    END
    
    CLOSE cascade_delete_MJQuerySQLs_QueryID_cursor
    DEALLOCATE cascade_delete_MJQuerySQLs_QueryID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dcf286d-4abc-4b88-aece-5f0665506446' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'Query')) BEGIN
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
            '4dcf286d-4abc-4b88-aece-5f0665506446',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100019,
            'Query',
            'Query',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46ead876-24f9-40f7-befb-06576fd68625' OR (EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A' AND Name = 'DependsOnQuery')) BEGIN
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
            '46ead876-24f9-40f7-befb-06576fd68625',
            'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
            100020,
            'DependsOnQuery',
            'Depends On Query',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
               WHERE ID = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4DCF286D-4ABC-4B88-AECE-5F0665506446'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '46EAD876-24F9-40F7-BEFB-06576FD68625'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4DCF286D-4ABC-4B88-AECE-5F0665506446'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '46EAD876-24F9-40F7-BEFB-06576FD68625'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Query Dependencies.QueryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09DE6C3F-0506-4CCB-9F64-C43AE3F426C0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.Query 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Query Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4DCF286D-4ABC-4B88-AECE-5F0665506446' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.DependsOnQueryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Depends On Query',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD6FED8F-1E8C-4658-9D13-B361430C7303' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.DependsOnQuery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Query Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46EAD876-24F9-40F7-BEFB-06576FD68625' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.ReferencePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Composition Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB10B534-3AF4-4D7B-A5F5-42A9F1EC7E43' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.Alias 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Composition Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BAF397E-775F-4B18-BAC1-81FEF4A1E30B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.ParameterMapping 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Composition Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1B64128C-C0CE-4D98-A13C-69FE233B1ABE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.DetectionMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Composition Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A517C8B7-E1B5-4042-ACDA-B94D0D215E93' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BED169E9-D673-4AAA-8A63-FF8CA0CDE8CB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2BBD0B19-AE1E-4DD6-B5F0-25996BF4E015' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query Dependencies.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD169B61-1E4D-480F-8F9F-D23778A8BBFD' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-project-diagram', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('264145eb-c726-431e-a254-2e56cc3029f2', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'FieldCategoryInfo', '{"Dependency Relationships":{"icon":"fa fa-link","description":"Links between the referencing query and the query it depends upon"},"Composition Details":{"icon":"fa fa-info-circle","description":"Technical details regarding the SQL alias, pathing, and parameter mapping"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system-managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('536b34ae-1c24-478a-9621-2f9f929c0e49', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'FieldCategoryIcons', '{"Dependency Relationships":"fa fa-link","Composition Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A'
      

/* Set categories for 27 fields */

-- UPDATE Entity Field Category Info MJ: Queries.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '874317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '274D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '774E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.UserQuestion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '894317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '8B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.TechnicalDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.OriginalSQL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '8C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.UsesTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQLDialectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '250EDAD5-57FF-4CEB-A2A3-3C932C120FA9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQLDialect 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F42F7B6-12EC-4F34-8A1C-981879499727' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Reusable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Reusable',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B65B3B9-7EBC-4BDF-B094-691B2CD96FBC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Feedback 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '724E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '734E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.QualityRank 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '744E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.ExecutionCostRank 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.AuditQueryRuns 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CA275F3-757F-4D4D-8EE3-2443393CD676' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F075DB33-92E3-45D9-86BB-08711205829D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheTTLMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0420AC10-6902-484B-B976-1C51573EDF4C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheMaxSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89288495-3472-436F-860D-AEE7F746CFF9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheValidationSQL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '2DF7C600-B13B-4E58-9DCD-173C82F13770' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingVector 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'CDBF7167-76D6-41DE-A50D-01CBFFEDC1E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00136468-3433-4B6C-BCEF-649E76497AFC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B241317-2875-4E3C-B80E-952C7270A308' AND AutoUpdateCategory = 1

